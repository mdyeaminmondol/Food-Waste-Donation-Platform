# Deployment Guide

## 1. Local Production Run (Gunicorn)

```powershell
pip install -r requirements.txt
$env:APP_SECRET_KEY="your-secret"
$env:MONGODB_URI="mongodb://127.0.0.1:27017"
$env:MONGODB_DB="food_donation_platform"
$env:FLASK_DEBUG="0"
gunicorn -c gunicorn.conf.py wsgi:application
```

## 2. Docker Deployment

```powershell
docker compose up --build
```

App will be available at `http://localhost:5000`.

## 3. Render Deployment

- Runtime: Python
- Build Command:
  - `pip install -r requirements.txt`
- Start Command:
  - `gunicorn -c gunicorn.conf.py wsgi:application`
- Environment Variables:
  - `APP_SECRET_KEY`
  - `COOKIE_SECURE=1`
  - `FLASK_DEBUG=0`
  - `MONGODB_URI` (use MongoDB Atlas URI)
  - `MONGODB_DB=food_donation_platform`

## 4. Railway Deployment

- Root contains `Procfile`, so Railway can detect start command.
- Set the same environment variables as above.
- Use managed MongoDB plugin or Atlas URI for `MONGODB_URI`.

## 5. Security Notes

- Always set a strong `APP_SECRET_KEY`.
- Keep `COOKIE_SECURE=1` in production.
- Prefer HTTPS at the platform/load balancer level.
- Rotate JWT secret and SMTP credentials periodically.

## 6. Health Check Endpoint

Use `/health` for uptime checks.
