import datetime as dt
import json
import os
import re
import smtplib
from email.message import EmailMessage
from functools import wraps
from threading import Lock
from urllib import request as url_request

import jwt
from bson import ObjectId
from flask import Flask, jsonify, request, send_from_directory
from flask_bcrypt import Bcrypt
from flask_compress import Compress
from flask_login import LoginManager, UserMixin, current_user, login_required, login_user, logout_user
from flask_sock import Sock
from flask_wtf.csrf import generate_csrf, validate_csrf
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import DuplicateKeyError
from werkzeug.security import check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ALLOWED_ROLES = {"restaurant", "volunteer", "admin"}
ALLOWED_FOOD_TYPES = {"meal", "snack", "dessert", "produce"}
STATUS_FLOW = ["available", "accepted", "picked-up", "delivered"]
USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]{3,32}$")

app = Flask(__name__, static_folder=BASE_DIR, static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("APP_SECRET_KEY", "change-this-secret-in-production")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("COOKIE_SECURE", "1") == "1"
app.config["REMEMBER_COOKIE_HTTPONLY"] = True
app.config["REMEMBER_COOKIE_SECURE"] = app.config["SESSION_COOKIE_SECURE"]
app.config["JWT_EXPIRE_HOURS"] = int(os.environ.get("JWT_EXPIRE_HOURS", "8"))
app.config["WTF_CSRF_TIME_LIMIT"] = 7200

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017")
MONGODB_DB = os.environ.get("MONGODB_DB", "food_donation_platform")

Compress(app)
bcrypt = Bcrypt(app)
sock = Sock(app)
login_manager = LoginManager()
login_manager.init_app(app)

mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
db = mongo_client[MONGODB_DB]

cache_lock = Lock()
query_cache = {
    "donations": {"value": {}, "expires_at": dt.datetime.min},
    "analytics": {"value": None, "expires_at": dt.datetime.min},
}
ws_clients = set()
ws_lock = Lock()


class User(UserMixin):
    def __init__(self, user_id: str, username: str, role: str):
        self.id = user_id
        self.username = username
        self.role = role


def to_object_id(value: str):
    if not ObjectId.is_valid(value):
        return None
    return ObjectId(value)


def hash_password(password: str) -> str:
    return bcrypt.generate_password_hash(password).decode("utf-8")


def verify_password(stored_hash: str, password: str) -> bool:
    if stored_hash.startswith("pbkdf2:") or stored_hash.startswith("scrypt:"):
        return check_password_hash(stored_hash, password)
    return bcrypt.check_password_hash(stored_hash, password)


def normalize_user(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "username": doc["username"],
        "role": doc["role"],
        "email": doc.get("email"),
        "phone": doc.get("phone"),
    }


def normalize_donation(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "food": doc["food"],
        "food_type": doc["food_type"],
        "quantity": doc["quantity"],
        "location": doc["location"],
        "lat": doc["lat"],
        "lng": doc["lng"],
        "status": doc["status"],
        "posted_at": doc.get("posted_at"),
        "expires_at": doc.get("expires_at"),
        "donor": doc.get("donor", "Unknown"),
    }


def init_db() -> None:
    db.users.create_index([("username", ASCENDING)], unique=True)
    db.users.create_index([("role", ASCENDING)])

    db.donations.create_index([("status", ASCENDING)])
    db.donations.create_index([("food_type", ASCENDING)])
    db.donations.create_index([("quantity", ASCENDING)])
    db.donations.create_index([("lat", ASCENDING), ("lng", ASCENDING)])
    db.donations.create_index([("posted_at", DESCENDING)])
    db.donations.create_index([("donor_id", ASCENDING)])

    db.pickup_requests.create_index([("donation_id", ASCENDING)], unique=True)
    db.pickup_requests.create_index([("volunteer_id", ASCENDING), ("status", ASCENDING)])
    db.pickup_requests.create_index([("updated_at", DESCENDING)])

    db.donation_history.create_index([("donation_id", ASCENDING), ("created_at", DESCENDING)])

    if not db.users.find_one({"username": "admin"}):
        db.users.insert_one(
            {
                "username": "admin",
                "password_hash": hash_password("admin123"),
                "role": "admin",
                "email": None,
                "phone": None,
                "created_at": dt.datetime.utcnow().isoformat(),
            }
        )


def clear_cache() -> None:
    with cache_lock:
        query_cache["donations"] = {"value": {}, "expires_at": dt.datetime.min}
        query_cache["analytics"] = {"value": None, "expires_at": dt.datetime.min}


def create_jwt(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": dt.datetime.utcnow() + dt.timedelta(hours=app.config["JWT_EXPIRE_HOURS"]),
    }
    return jwt.encode(payload, app.config["SECRET_KEY"], algorithm="HS256")


def decode_jwt(token: str):
    return jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])


def validate_csrf_header() -> bool:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return True

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return True

    token = request.headers.get("X-CSRFToken") or request.headers.get("X-CSRF-Token")
    if not token:
        return False

    try:
        validate_csrf(token)
        return True
    except Exception:
        return False


def require_csrf(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not validate_csrf_header():
            return jsonify({"error": "Invalid CSRF token"}), 400
        return func(*args, **kwargs)

    return wrapper


def get_current_user_row():
    if current_user.is_authenticated:
        oid = to_object_id(current_user.id)
        if not oid:
            return None
        user = db.users.find_one({"_id": oid})
        return user

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.replace("Bearer ", "", 1)
    try:
        payload = decode_jwt(token)
    except jwt.PyJWTError:
        return None

    oid = to_object_id(payload["sub"])
    if not oid:
        return None

    return db.users.find_one({"_id": oid})


def auth_required(roles=None):
    allowed = set(roles or [])

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user = get_current_user_row()
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            if allowed and user["role"] not in allowed:
                return jsonify({"error": "Insufficient permissions"}), 403
            return func(user, *args, **kwargs)

        return wrapper

    return decorator


def broadcast_notification(event_type: str, payload: dict) -> None:
    message = json.dumps({"type": event_type, "payload": payload})
    stale_clients = []
    with ws_lock:
        for client in ws_clients:
            try:
                client.send(message)
            except Exception:
                stale_clients.append(client)
        for client in stale_clients:
            ws_clients.discard(client)


def send_email_notification(subject: str, body: str) -> None:
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    to_addr = os.environ.get("NOTIFY_EMAIL_TO")

    if not all([host, username, password, to_addr]):
        return

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = username
    msg["To"] = to_addr
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=10) as smtp:
        smtp.starttls()
        smtp.login(username, password)
        smtp.send_message(msg)


def send_sms_notification(message: str) -> None:
    webhook = os.environ.get("SMS_WEBHOOK_URL")
    if not webhook:
        return

    body = json.dumps({"message": message}).encode("utf-8")
    req = url_request.Request(webhook, data=body, headers={"Content-Type": "application/json"}, method="POST")
    url_request.urlopen(req, timeout=6)


def record_history(donation_id: ObjectId, actor_user_id: ObjectId, old_status: str, new_status: str, event_type: str, note: str = "") -> None:
    db.donation_history.insert_one(
        {
            "donation_id": donation_id,
            "actor_user_id": actor_user_id,
            "old_status": old_status,
            "new_status": new_status,
            "event_type": event_type,
            "note": note,
            "created_at": dt.datetime.utcnow().isoformat(),
        }
    )


def validate_donation_payload(payload: dict):
    required = ["food", "food_type", "quantity", "location", "lat", "lng"]
    missing = [name for name in required if name not in payload]
    if missing:
        return False, f"Missing fields: {', '.join(missing)}"

    food = str(payload.get("food", "")).strip()
    location = str(payload.get("location", "")).strip()
    food_type = str(payload.get("food_type", "")).strip().lower()

    if not (2 <= len(food) <= 80):
        return False, "Food name must be 2-80 characters"
    if not (2 <= len(location) <= 80):
        return False, "Location must be 2-80 characters"
    if food_type not in ALLOWED_FOOD_TYPES:
        return False, "Invalid food type"

    try:
        quantity = int(payload["quantity"])
        lat = float(payload["lat"])
        lng = float(payload["lng"])
    except (TypeError, ValueError):
        return False, "Invalid numeric values"

    if quantity <= 0:
        return False, "Quantity must be positive"
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return False, "Invalid coordinates"

    return True, ""


@login_manager.user_loader
def load_user(user_id):
    oid = to_object_id(user_id)
    if not oid:
        return None
    row = db.users.find_one({"_id": oid})
    if not row:
        return None
    return User(str(row["_id"]), row["username"], row["role"])


@app.after_request
def add_headers(resp):
    path = request.path.lower()

    if path.startswith("/api/") and request.method == "GET":
        resp.headers["Cache-Control"] = "public, max-age=30, stale-while-revalidate=60"
    elif path.endswith((".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".woff2")):
        if ".min." in path:
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            resp.headers["Cache-Control"] = "public, max-age=86400"

    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Permissions-Policy"] = "geolocation=(self), camera=(), microphone=()"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://maps.googleapis.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; "
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; "
        "img-src 'self' data: https://*.tile.openstreetmap.org https://maps.gstatic.com https://maps.googleapis.com; "
        "connect-src 'self' https://*.tile.openstreetmap.org https://maps.googleapis.com; "
        "frame-ancestors 'none'"
    )

    if request.is_secure:
        resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return resp


@app.get("/")
def home_page():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/health")
def health():
    return jsonify({"status": "ok", "time": dt.datetime.utcnow().isoformat() + "Z"})


@app.get("/api/security/csrf-token")
def csrf_token_api():
    return jsonify({"csrfToken": generate_csrf()})


@app.get("/api/map/config")
def map_config_api():
    return jsonify({"googleMapsApiKey": os.environ.get("GOOGLE_MAPS_API_KEY", "")})


@sock.route("/ws/notifications")
def ws_notifications(ws):
    with ws_lock:
        ws_clients.add(ws)

    try:
        while True:
            if ws.receive() is None:
                break
    except Exception:
        pass
    finally:
        with ws_lock:
            ws_clients.discard(ws)


@app.post("/api/realtime/notify")
@require_csrf
def realtime_notify():
    payload = request.get_json(silent=True) or {}
    event_type = (payload.get("type") or "generic").strip()
    event_payload = payload.get("payload") or {}

    broadcast_notification(event_type, event_payload)
    return jsonify({"message": "Broadcasted"})


@app.post("/api/auth/register")
@require_csrf
def register_user():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    role = (payload.get("role") or "volunteer").strip().lower()
    email = (payload.get("email") or "").strip() or None
    phone = (payload.get("phone") or "").strip() or None

    if not USERNAME_PATTERN.match(username):
        return jsonify({"error": "Username must be 3-32 chars (letters, numbers, underscore)"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400
    if role not in ALLOWED_ROLES:
        return jsonify({"error": "Invalid role"}), 400

    try:
        db.users.insert_one(
            {
                "username": username,
                "password_hash": hash_password(password),
                "role": role,
                "email": email,
                "phone": phone,
                "created_at": dt.datetime.utcnow().isoformat(),
            }
        )
    except DuplicateKeyError:
        return jsonify({"error": "Username already exists"}), 409

    return jsonify({"message": "User registered"}), 201


@app.post("/api/auth/login")
@require_csrf
def login_api():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    user = db.users.find_one({"username": username})
    if not user or not verify_password(user["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    login_user(User(str(user["_id"]), user["username"], user["role"]), remember=False)
    token = create_jwt(str(user["_id"]), user["role"])
    return jsonify(
        {
            "message": "Logged in",
            "token": token,
            "user": {"id": str(user["_id"]), "username": user["username"], "role": user["role"]},
        }
    )


@app.post("/api/auth/logout")
@login_required
@require_csrf
def logout_api():
    logout_user()
    return jsonify({"message": "Logged out"})


@app.get("/api/auth/me")
@auth_required()
def me_api(user):
    return jsonify(normalize_user(user))


@app.get("/api/donations")
def list_donations():
    q = (request.args.get("q") or "").strip().lower()
    status = (request.args.get("status") or "all").strip().lower()
    food_type = (request.args.get("food_type") or "all").strip().lower()

    try:
        min_quantity = int(request.args.get("min_quantity", "0") or 0)
    except ValueError:
        min_quantity = 0

    cache_key = f"{q}|{status}|{food_type}|{min_quantity}"
    now = dt.datetime.utcnow()

    with cache_lock:
        cache_entry = query_cache["donations"]
        if now < cache_entry["expires_at"] and cache_key in cache_entry["value"]:
            return jsonify({"items": cache_entry["value"][cache_key], "cached": True})

    filters = {"quantity": {"$gte": min_quantity}}
    if status != "all" and status in STATUS_FLOW:
        filters["status"] = status
    if food_type != "all" and food_type in ALLOWED_FOOD_TYPES:
        filters["food_type"] = food_type
    if q:
        filters["$or"] = [
            {"food": {"$regex": q, "$options": "i"}},
            {"location": {"$regex": q, "$options": "i"}},
        ]

    pipeline = [
        {"$match": filters},
        {
            "$lookup": {
                "from": "users",
                "localField": "donor_id",
                "foreignField": "_id",
                "as": "donor_user",
            }
        },
        {"$sort": {"posted_at": -1}},
        {"$limit": 300},
    ]

    items = []
    for row in db.donations.aggregate(pipeline):
        donor = "Unknown"
        donor_users = row.get("donor_user", [])
        if donor_users:
            donor = donor_users[0].get("username", "Unknown")
        row["donor"] = donor
        items.append(normalize_donation(row))

    with cache_lock:
        query_cache["donations"]["value"][cache_key] = items
        query_cache["donations"]["expires_at"] = now + dt.timedelta(seconds=25)

    return jsonify({"items": items, "cached": False})


@app.post("/api/donations")
@auth_required(roles={"restaurant", "admin"})
@require_csrf
def create_donation(user):
    payload = request.get_json(silent=True) or {}
    ok, message = validate_donation_payload(payload)
    if not ok:
        return jsonify({"error": message}), 400

    food = payload["food"].strip()
    food_type = payload["food_type"].strip().lower()
    quantity = int(payload["quantity"])
    location = payload["location"].strip()
    lat = float(payload["lat"])
    lng = float(payload["lng"])
    status = "available"
    expires_at = payload.get("expires_at")

    donation_doc = {
        "food": food,
        "food_type": food_type,
        "quantity": quantity,
        "location": location,
        "lat": lat,
        "lng": lng,
        "status": status,
        "donor_id": user["_id"],
        "posted_at": dt.datetime.utcnow().isoformat(),
        "expires_at": expires_at,
    }
    result = db.donations.insert_one(donation_doc)
    donation_id = result.inserted_id

    record_history(donation_id, user["_id"], None, status, "created", "Donation posted")
    clear_cache()

    text = f"New food donation available near you: {food} in {location}."
    try:
        send_email_notification("New food donation", text)
        send_sms_notification(text)
    except Exception:
        pass

    broadcast_notification(
        "donation_available",
        {"id": str(donation_id), "food": food, "location": location, "quantity": quantity},
    )
    return jsonify({"message": "Donation created", "id": str(donation_id)}), 201


@app.post("/api/donations/<donation_id>/status")
@auth_required(roles={"volunteer", "restaurant", "admin"})
@require_csrf
def update_donation_status(user, donation_id):
    oid = to_object_id(donation_id)
    if not oid:
        return jsonify({"error": "Invalid donation id"}), 400

    payload = request.get_json(silent=True) or {}
    target_status = (payload.get("status") or "").strip().lower()
    if target_status not in STATUS_FLOW:
        return jsonify({"error": "Invalid status"}), 400

    donation = db.donations.find_one({"_id": oid})
    if not donation:
        return jsonify({"error": "Donation not found"}), 404

    current_index = STATUS_FLOW.index(donation["status"])
    target_index = STATUS_FLOW.index(target_status)
    if target_index > current_index + 1:
        return jsonify({"error": "Status jump not allowed"}), 400

    db.donations.update_one({"_id": oid}, {"$set": {"status": target_status}})

    if target_status in {"accepted", "picked-up", "delivered"}:
        db.pickup_requests.update_one(
            {"donation_id": oid},
            {
                "$set": {
                    "volunteer_id": user["_id"],
                    "status": target_status,
                    "updated_at": dt.datetime.utcnow().isoformat(),
                }
            },
            upsert=True,
        )

    record_history(
        oid,
        user["_id"],
        donation["status"],
        target_status,
        "status_change",
        f"Status moved by {user['username']}",
    )

    clear_cache()
    broadcast_notification(
        "status_updated",
        {"donationId": donation_id, "status": target_status, "by": user["username"]},
    )
    return jsonify({"message": "Status updated", "status": target_status})


@app.get("/api/pickups")
@auth_required()
def list_pickups(user):
    pipeline = [
        {
            "$lookup": {
                "from": "users",
                "localField": "volunteer_id",
                "foreignField": "_id",
                "as": "volunteer_user",
            }
        },
        {"$sort": {"updated_at": -1}},
        {"$limit": 300},
    ]

    items = []
    for row in db.pickup_requests.aggregate(pipeline):
        volunteer = "Unknown"
        volunteer_users = row.get("volunteer_user", [])
        if volunteer_users:
            volunteer = volunteer_users[0].get("username", "Unknown")
        items.append(
            {
                "id": str(row["_id"]),
                "donation_id": str(row["donation_id"]),
                "status": row["status"],
                "updated_at": row.get("updated_at"),
                "volunteer": volunteer,
            }
        )

    return jsonify({"items": items})


@app.get("/api/history")
@auth_required(roles={"admin", "restaurant"})
def donation_history_api(user):
    pipeline = [
        {
            "$lookup": {
                "from": "users",
                "localField": "actor_user_id",
                "foreignField": "_id",
                "as": "actor_user",
            }
        },
        {"$sort": {"created_at": -1}},
        {"$limit": 300},
    ]

    items = []
    for row in db.donation_history.aggregate(pipeline):
        actor = "system"
        actors = row.get("actor_user", [])
        if actors:
            actor = actors[0].get("username", "system")

        items.append(
            {
                "id": str(row["_id"]),
                "donation_id": str(row["donation_id"]),
                "old_status": row.get("old_status"),
                "new_status": row.get("new_status"),
                "event_type": row.get("event_type"),
                "note": row.get("note"),
                "created_at": row.get("created_at"),
                "actor": actor,
            }
        )

    return jsonify({"items": items})


@app.get("/api/analytics")
@auth_required(roles={"admin"})
def analytics_api(user):
    now = dt.datetime.utcnow()
    with cache_lock:
        cache_entry = query_cache["analytics"]
        if now < cache_entry["expires_at"] and cache_entry["value"] is not None:
            return jsonify(cache_entry["value"])

    summary = list(
        db.donations.aggregate(
            [
                {
                    "$group": {
                        "_id": None,
                        "total_donations": {"$sum": 1},
                        "total_food": {"$sum": "$quantity"},
                        "delivered_count": {
                            "$sum": {
                                "$cond": [{"$eq": ["$status", "delivered"]}, 1, 0]
                            }
                        },
                        "delivered_food": {
                            "$sum": {
                                "$cond": [{"$eq": ["$status", "delivered"]}, "$quantity", 0]
                            }
                        },
                        "active_pickups": {
                            "$sum": {
                                "$cond": [
                                    {"$in": ["$status", ["accepted", "picked-up"]]},
                                    1,
                                    0,
                                ]
                            }
                        },
                    }
                }
            ]
        )
    )
    summary_row = summary[0] if summary else {}

    restaurant_pipeline = [
        {"$group": {"_id": "$donor_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
        {
            "$lookup": {
                "from": "users",
                "localField": "_id",
                "foreignField": "_id",
                "as": "user",
            }
        },
    ]
    top_restaurants = []
    for row in db.donations.aggregate(restaurant_pipeline):
        name = "Unknown"
        users = row.get("user", [])
        if users:
            name = users[0].get("username", "Unknown")
        top_restaurants.append({"name": name, "count": row["count"]})

    volunteer_pipeline = [
        {"$group": {"_id": "$volunteer_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
        {
            "$lookup": {
                "from": "users",
                "localField": "_id",
                "foreignField": "_id",
                "as": "user",
            }
        },
    ]
    top_volunteers = []
    for row in db.pickup_requests.aggregate(volunteer_pipeline):
        name = "Unknown"
        users = row.get("user", [])
        if users:
            name = users[0].get("username", "Unknown")
        top_volunteers.append({"name": name, "count": row["count"]})

    active_restaurants = db.users.count_documents({"role": "restaurant"})
    active_volunteers = db.users.count_documents({"role": "volunteer"})

    payload = {
        "totalFoodDonated": int(summary_row.get("total_food", 0)),
        "totalDonations": int(summary_row.get("total_donations", 0)),
        "totalPickups": int(summary_row.get("delivered_count", 0)),
        "activePickupFlow": int(summary_row.get("active_pickups", 0)),
        "peopleHelped": int(summary_row.get("delivered_food", 0) // 2),
        "activeRestaurants": int(active_restaurants),
        "activeVolunteers": int(active_volunteers),
        "mostActiveRestaurants": top_restaurants,
        "mostActiveVolunteers": top_volunteers,
    }

    with cache_lock:
        query_cache["analytics"] = {"value": payload, "expires_at": now + dt.timedelta(seconds=35)}

    return jsonify(payload)


@app.get("/api/predictions/demand")
@auth_required(roles={"admin", "restaurant", "volunteer"})
def demand_prediction_api(user):
    pipeline = [
        {
            "$group": {
                "_id": "$location",
                "active_count": {
                    "$sum": {
                        "$cond": [
                            {"$in": ["$status", ["available", "accepted", "picked-up"]]},
                            1,
                            0,
                        ]
                    }
                },
                "delivered_count": {
                    "$sum": {"$cond": [{"$eq": ["$status", "delivered"]}, 1, 0]}
                },
                "total_qty": {"$sum": "$quantity"},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    predictions = []
    for row in db.donations.aggregate(pipeline):
        score = int(row["active_count"] * 16 + max(0, 8 - row["delivered_count"] * 3) + row["total_qty"] / 10)
        recommendation = "Stable"
        if score >= 28:
            recommendation = "High priority"
        elif score >= 18:
            recommendation = "Increase donations"

        predictions.append(
            {
                "location": row["_id"],
                "demandScore": score,
                "recommendation": recommendation,
            }
        )

    predictions.sort(key=lambda item: item["demandScore"], reverse=True)
    return jsonify({"items": predictions})


@app.get("/<path:path>")
def static_proxy(path):
    return send_from_directory(BASE_DIR, path)


init_db()

if __name__ == "__main__":
    use_https = os.environ.get("ENABLE_HTTPS", "0") == "1"
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug, ssl_context="adhoc" if use_https else None)
