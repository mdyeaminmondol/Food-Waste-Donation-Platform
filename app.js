const CURRENT_RESTAURANT = "Fresh Bowl Bistro";
const CURRENT_VOLUNTEER = "Aarav";
const STATUS_FLOW = ["available", "accepted", "picked-up", "delivered"];

const state = {
  donations: [
    {
      id: "D101",
      food: "Paneer Wraps",
      foodType: "meal",
      quantity: 18,
      location: "Dhaka",
      lat: 23.8103,
      lng: 90.4125,
      donor: "Urban Spoon",
      status: "available",
      postedAt: "2026-03-10T09:10:00",
      expiresAt: "2026-03-10T14:10:00"
    },
    {
      id: "D102",
      food: "Rice Bowl Combo",
      foodType: "meal",
      quantity: 26,
      location: "Chattogram",
      lat: 22.3569,
      lng: 91.7832,
      donor: "Fresh Bowl Bistro",
      status: "accepted",
      postedAt: "2026-03-10T08:30:00",
      expiresAt: "2026-03-10T13:30:00"
    },
    {
      id: "D103",
      food: "Fruit Salad Cups",
      foodType: "dessert",
      quantity: 12,
      location: "Khulna",
      lat: 22.8456,
      lng: 89.5403,
      donor: "Green Fork",
      status: "picked-up",
      postedAt: "2026-03-10T07:45:00",
      expiresAt: "2026-03-10T11:45:00"
    },
    {
      id: "D104",
      food: "Veg Pulao",
      foodType: "meal",
      quantity: 30,
      location: "Rajshahi",
      lat: 24.3745,
      lng: 88.6042,
      donor: "Spice Route",
      status: "available",
      postedAt: "2026-03-10T10:05:00",
      expiresAt: "2026-03-10T15:05:00"
    },
    {
      id: "D105",
      food: "Fresh Banana Crates",
      foodType: "produce",
      quantity: 22,
      location: "Dhaka",
      lat: 23.8103,
      lng: 90.4125,
      donor: "Harvest Hub",
      status: "delivered",
      postedAt: "2026-03-10T06:50:00",
      expiresAt: "2026-03-10T12:50:00"
    }
  ],
  pickupRequests: [
    { donationId: "D102", volunteer: "Nisha", status: "Accepted", time: "2026-03-10 10:20" },
    { donationId: "D103", volunteer: "Aarav", status: "Picked Up", time: "2026-03-10 11:05" }
  ],
  users: [
    { id: 1, name: "Urban Spoon", role: "Restaurant", active: true },
    { id: 2, name: "Fresh Bowl Bistro", role: "Restaurant", active: true },
    { id: 3, name: "Aarav", role: "Volunteer", active: true },
    { id: 4, name: "Nisha", role: "Volunteer", active: true },
    { id: 5, name: "Admin Team", role: "Admin", active: true }
  ],
  volunteerPoints: {
    Aarav: 120,
    Nisha: 95
  },
  notifications: []
};

const navButtons = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");
const donationList = document.getElementById("donationList");
const statusFilter = document.getElementById("statusFilter");
const searchFood = document.getElementById("searchFood");
const foodTypeFilter = document.getElementById("foodTypeFilter");
const distanceFilter = document.getElementById("distanceFilter");
const quantityFilter = document.getElementById("quantityFilter");
const homeStats = document.getElementById("homeStats");
const historyTable = document.getElementById("historyTable");
const postFoodForm = document.getElementById("postFoodForm");
const nearbyList = document.getElementById("nearbyList");
const volunteerLocation = document.getElementById("volunteerLocation");
const pickupTable = document.getElementById("pickupTable");
const usersTable = document.getElementById("usersTable");
const statusChart = document.getElementById("statusChart");
const reportPeopleHelped = document.getElementById("reportPeopleHelped");
const topRestaurants = document.getElementById("topRestaurants");
const topVolunteers = document.getElementById("topVolunteers");
const demandPredictionTable = document.getElementById("demandPredictionTable");
const notificationFeed = document.getElementById("notificationFeed");
const notificationCount = document.getElementById("notificationCount");
const volunteerLeaderboard = document.getElementById("volunteerLeaderboard");
const currentVolunteerName = document.getElementById("currentVolunteerName");
const currentVolunteerPoints = document.getElementById("currentVolunteerPoints");
const currentVolunteerBadges = document.getElementById("currentVolunteerBadges");
const trackToggleBtn = document.getElementById("trackToggleBtn");
const trackingStatus = document.getElementById("trackingStatus");
const pageLoader = document.getElementById("pageLoader");

let map;
let markerLayer;
let volunteerMarker;
let volunteerRadius;
let watchId = null;
let socket = null;
let csrfToken = "";

function debounce(fn, waitMs) {
  let timerId;
  return (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), waitMs);
  };
}

function formatDateTime(input) {
  return new Date(input).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function prettyStatus(status) {
  if (status === "picked-up") {
    return "Picked Up";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getVolunteerCoords() {
  if (volunteerMarker) {
    const p = volunteerMarker.getLatLng();
    return [p.lat, p.lng];
  }
  return volunteerLocation.value.split(",").map(Number);
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earth = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function initializeNavigation() {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.view).classList.add("active");
      if (btn.dataset.view === "home") {
        setTimeout(() => map?.invalidateSize(), 120);
      }
    });
  });
}

function getFilteredDonations(options = {}) {
  const { onlyAvailable = false, includeStatusFilter = true } = options;
  const [baseLat, baseLng] = getVolunteerCoords();

  const query = (searchFood.value || "").trim().toLowerCase();
  const foodType = foodTypeFilter.value || "all";
  const maxDistance = distanceFilter.value || "all";
  const minQty = Number(quantityFilter.value || 0);
  const status = statusFilter.value || "all";

  return state.donations
    .map((donation) => ({
      ...donation,
      distance: distanceKm(baseLat, baseLng, donation.lat, donation.lng)
    }))
    .filter((donation) => {
      if (onlyAvailable && donation.status !== "available") {
        return false;
      }
      if (includeStatusFilter && status !== "all" && donation.status !== status) {
        return false;
      }
      if (foodType !== "all" && donation.foodType !== foodType) {
        return false;
      }
      if (minQty > donation.quantity) {
        return false;
      }
      if (maxDistance !== "all" && donation.distance > Number(maxDistance)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const pool = `${donation.food} ${donation.location} ${donation.donor} ${donation.foodType}`.toLowerCase();
      return pool.includes(query);
    });
}

function renderHomeStats() {
  const total = state.donations.length;
  const available = state.donations.filter((d) => d.status === "available").length;
  const accepted = state.donations.filter((d) => d.status === "accepted").length;
  const delivered = state.donations.filter((d) => d.status === "delivered").length;

  homeStats.innerHTML = `
    <article class="stats-card"><span><i class="fa-solid fa-hand-holding-heart"></i> Total Donations</span><strong>${total}</strong></article>
    <article class="stats-card"><span><i class="fa-solid fa-box"></i> Available</span><strong>${available}</strong></article>
    <article class="stats-card"><span><i class="fa-solid fa-truck-fast"></i> Accepted</span><strong>${accepted}</strong></article>
    <article class="stats-card"><span><i class="fa-solid fa-circle-check"></i> Delivered</span><strong>${delivered}</strong></article>
  `;
}

function pushNotification(title, detail, type = "info") {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    detail,
    type,
    time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  };

  state.notifications.unshift(item);
  state.notifications = state.notifications.slice(0, 20);
  renderNotificationFeed();

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body: detail });
  }
}

function renderNotificationFeed() {
  notificationCount.textContent = String(state.notifications.length);

  if (state.notifications.length === 0) {
    notificationFeed.innerHTML = '<p class="empty-state">No live notifications yet.</p>';
    return;
  }

  notificationFeed.innerHTML = state.notifications
    .map(
      (n) => `
      <article class="notification-item">
        <div>
          <strong>${n.title}</strong>
          <span>${n.detail}</span>
        </div>
        <small>${n.time}</small>
      </article>
    `
    )
    .join("");
}

function maybeNearbyNotify(donation) {
  const [lat, lng] = getVolunteerCoords();
  const km = distanceKm(lat, lng, donation.lat, donation.lng);
  if (km <= 10) {
    pushNotification(
      "Nearby food available",
      `${donation.food} in ${donation.location} is ${km.toFixed(1)} km away`,
      "nearby"
    );
  }
}

function renderDonations() {
  const visible = getFilteredDonations({ includeStatusFilter: true }).sort((a, b) => a.distance - b.distance);

  if (visible.length === 0) {
    donationList.innerHTML = '<p class="empty-state">No donations match your search and filters.</p>';
    return;
  }

  donationList.innerHTML = visible
    .map(
      (donation) => `
      <article class="donation-card">
        <h4><i class="fa-solid fa-utensils"></i> ${donation.food}</h4>
        <div class="donation-meta">
          <span><i class="fa-solid fa-hashtag"></i> ${donation.id}</span>
          <span><i class="fa-solid fa-layer-group"></i> ${donation.foodType}</span>
          <span><i class="fa-solid fa-box-open"></i> ${donation.quantity} servings</span>
          <span><i class="fa-solid fa-location-dot"></i> ${donation.location}</span>
          <span><i class="fa-solid fa-route"></i> ${donation.distance.toFixed(2)} km</span>
          <span><i class="fa-solid fa-store"></i> ${donation.donor}</span>
          <span><i class="fa-regular fa-clock"></i> ${formatDateTime(donation.expiresAt)}</span>
          <span class="tag ${donation.status}">${prettyStatus(donation.status)}</span>
        </div>
        <div class="mt-2">
          ${
            donation.status === "available"
              ? `<button class="action-btn" data-pickup="${donation.id}"><i class="fa-solid fa-truck-fast"></i> One-Click Pickup</button>`
              : ""
          }
        </div>
      </article>
    `
    )
    .join("");

  attachPickupRequestHandlers();
}

function initializeMap() {
  map = L.map("map").setView([23.685, 90.3563], 7);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
  renderMapMarkers();
  setVolunteerFromDropdown();
}

function setVolunteerFromDropdown() {
  const [lat, lng] = volunteerLocation.value.split(",").map(Number);

  if (!volunteerMarker) {
    volunteerMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: "", html: '<div style="width:14px;height:14px;border-radius:50%;background:#0ea5e9;border:2px solid white;box-shadow:0 0 0 4px rgba(14,165,233,0.25);"></div>' })
    }).addTo(map);
    volunteerRadius = L.circle([lat, lng], { radius: 1200, color: "#0ea5e9", fillColor: "#7dd3fc", fillOpacity: 0.2 }).addTo(map);
  } else {
    volunteerMarker.setLatLng([lat, lng]);
    volunteerRadius.setLatLng([lat, lng]);
  }
}

function renderMapMarkers() {
  markerLayer.clearLayers();

  const mapped = getFilteredDonations({ includeStatusFilter: true });
  mapped.forEach((donation) => {
    const marker = L.marker([donation.lat, donation.lng]).addTo(markerLayer);
    marker.bindPopup(`
      <strong>${donation.food}</strong><br />
      ${donation.quantity} servings<br />
      ${donation.location}<br />
      Status: ${prettyStatus(donation.status)}
    `);
  });
}

function toggleLiveTracking() {
  if (!navigator.geolocation) {
    pushNotification("Live tracking unavailable", "Browser geolocation is not supported.");
    return;
  }

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    trackingStatus.textContent = "Tracking off";
    trackToggleBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Enable Live Tracking';
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      if (volunteerMarker && volunteerRadius) {
        volunteerMarker.setLatLng([lat, lng]);
        volunteerRadius.setLatLng([lat, lng]);
        map.panTo([lat, lng], { animate: true, duration: 0.8 });
      }
      trackingStatus.textContent = "Tracking on";
      trackToggleBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Tracking';
      refreshAll();
    },
    () => {
      trackingStatus.textContent = "Tracking blocked";
      pushNotification("Location permission needed", "Allow location access to use live tracking.");
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 }
  );
}

function renderRestaurantHistory() {
  const history = state.donations.filter((d) => d.donor === CURRENT_RESTAURANT);
  historyTable.innerHTML = history
    .map(
      (item) => `
      <tr>
        <td>${item.food}</td>
        <td>${item.quantity}</td>
        <td><span class="tag ${item.status}">${prettyStatus(item.status)}</span></td>
        <td>${formatDateTime(item.postedAt)}</td>
      </tr>
    `
    )
    .join("");
}

function createDonationId() {
  const maxId = state.donations.reduce((max, d) => Math.max(max, Number(d.id.slice(1))), 100);
  return `D${maxId + 1}`;
}

function classifyFoodType(foodName) {
  const text = foodName.toLowerCase();
  if (/(cake|sweet|dessert|custard|fruit|salad)/.test(text)) {
    return "dessert";
  }
  if (/(banana|vegetable|veg|produce|green)/.test(text)) {
    return "produce";
  }
  if (/(roll|snack|sandwich|puff|wrap)/.test(text)) {
    return "snack";
  }
  return "meal";
}

function addVolunteerPoints(name, points) {
  state.volunteerPoints[name] = (state.volunteerPoints[name] || 0) + points;
}

function getVolunteerBadges(points) {
  const badges = [];
  if (points >= 50) {
    badges.push("Rising Star");
  }
  if (points >= 120) {
    badges.push("Fast Rescuer");
  }
  if (points >= 220) {
    badges.push("Community Hero");
  }
  return badges.length ? badges : ["New Helper"];
}

function renderCommunityRewards() {
  const leaderboard = Object.entries(state.volunteerPoints)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  volunteerLeaderboard.innerHTML = leaderboard
    .map(
      ([name, points], index) =>
        `<div class="leader-item"><span>#${index + 1} ${name}</span><b>${points} pts</b></div>`
    )
    .join("");

  const myPoints = state.volunteerPoints[CURRENT_VOLUNTEER] || 0;
  currentVolunteerName.textContent = CURRENT_VOLUNTEER;
  currentVolunteerPoints.textContent = String(myPoints);
  currentVolunteerBadges.innerHTML = getVolunteerBadges(myPoints)
    .map((badge) => `<span class="badge-chip"><i class="fa-solid fa-medal"></i> ${badge}</span>`)
    .join("");
}

function broadcastRealtime(type, payload) {
  fetch("/api/realtime/notify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "X-CSRFToken": csrfToken } : {})
    },
    body: JSON.stringify({ type, payload })
  }).catch(() => {
    // Backend broadcast is optional for local-only mode.
  });
}

async function bootstrapSecurity() {
  try {
    const response = await fetch("/api/security/csrf-token", { credentials: "same-origin" });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    csrfToken = data.csrfToken || "";
  } catch {
    csrfToken = "";
  }
}

function setupPostFoodForm() {
  postFoodForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const now = new Date();
    const hours = Number(document.getElementById("foodExpiry").value);
    const expires = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const food = document.getElementById("foodName").value.trim();

    const newDonation = {
      id: createDonationId(),
      food,
      foodType: classifyFoodType(food),
      quantity: Number(document.getElementById("foodQty").value),
      location: document.getElementById("foodLocation").value.trim(),
      lat: Number(document.getElementById("foodLat").value),
      lng: Number(document.getElementById("foodLng").value),
      donor: CURRENT_RESTAURANT,
      status: "available",
      postedAt: now.toISOString(),
      expiresAt: expires.toISOString()
    };

    state.donations.unshift(newDonation);
    postFoodForm.reset();

    maybeNearbyNotify(newDonation);
    broadcastRealtime("donation_available", newDonation);
    pushNotification("New donation posted", `${newDonation.food} from ${newDonation.location}`);
    refreshAll();
  });
}

function renderNearbyDonations() {
  const nearby = getFilteredDonations({ onlyAvailable: true, includeStatusFilter: false })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);

  if (nearby.length === 0) {
    nearbyList.innerHTML = '<p class="empty-state">No nearby available donations for the selected filters.</p>';
    return;
  }

  nearbyList.innerHTML = nearby
    .map(
      (d) => `
      <article class="donation-card">
        <h4><i class="fa-solid fa-utensils"></i> ${d.food}</h4>
        <div class="donation-meta">
          <span><i class="fa-solid fa-layer-group"></i> ${d.foodType}</span>
          <span><i class="fa-solid fa-box-open"></i> ${d.quantity} servings</span>
          <span><i class="fa-solid fa-location-dot"></i> ${d.location}</span>
          <span><i class="fa-solid fa-route"></i> ${d.distance.toFixed(2)} km away</span>
          <span><i class="fa-solid fa-hashtag"></i> ${d.id}</span>
        </div>
        <div class="mt-2">
          <button class="action-btn" data-pickup="${d.id}"><i class="fa-solid fa-truck-fast"></i> One-Click Pickup</button>
        </div>
      </article>
    `
    )
    .join("");

  attachPickupRequestHandlers();
}

function attachPickupRequestHandlers() {
  document.querySelectorAll("[data-pickup]").forEach((btn) => {
    btn.addEventListener("click", () => submitPickupRequest(btn.dataset.pickup));
  });
}

function submitPickupRequest(donationId) {
  const donation = state.donations.find((d) => d.id === donationId);
  if (!donation || donation.status !== "available") {
    return;
  }

  donation.status = "accepted";
  const nowText = new Date().toLocaleString("en-IN", { hour12: false });

  const existing = state.pickupRequests.find((req) => req.donationId === donationId);
  if (existing) {
    existing.status = "Accepted";
    existing.volunteer = CURRENT_VOLUNTEER;
    existing.time = nowText;
  } else {
    state.pickupRequests.unshift({
      donationId,
      volunteer: CURRENT_VOLUNTEER,
      status: "Accepted",
      time: nowText
    });
  }

  addVolunteerPoints(CURRENT_VOLUNTEER, 10);
  pushNotification("Pickup accepted", `${CURRENT_VOLUNTEER} accepted ${donation.food}`);
  broadcastRealtime("status_updated", { donationId, status: "accepted" });
  refreshAll();
}

function getNextWorkflowStatus(currentStatus) {
  const index = STATUS_FLOW.indexOf(currentStatus);
  if (index === -1 || index >= STATUS_FLOW.length - 1) {
    return null;
  }
  return STATUS_FLOW[index + 1];
}

function advancePickupStatus(donationId) {
  const donation = state.donations.find((d) => d.id === donationId);
  const req = state.pickupRequests.find((item) => item.donationId === donationId);
  if (!donation || !req) {
    return;
  }

  const next = getNextWorkflowStatus(donation.status);
  if (!next) {
    return;
  }

  donation.status = next;
  req.status = prettyStatus(next);
  req.time = new Date().toLocaleString("en-IN", { hour12: false });

  if (next === "picked-up") {
    addVolunteerPoints(req.volunteer, 15);
  }
  if (next === "delivered") {
    addVolunteerPoints(req.volunteer, 20);
  }

  pushNotification("Status updated", `Donation ${donationId} marked ${prettyStatus(next)}`);
  broadcastRealtime("status_updated", { donationId, status: next });
  refreshAll();
}

function renderPickupTable() {
  pickupTable.innerHTML = state.pickupRequests
    .map((req) => {
      const donation = state.donations.find((d) => d.id === req.donationId);
      const currentStatus = donation?.status || "delivered";
      const next = getNextWorkflowStatus(currentStatus);

      return `
      <tr>
        <td>${req.donationId}</td>
        <td>${req.volunteer}</td>
        <td><span class="tag ${currentStatus}">${prettyStatus(currentStatus)}</span></td>
        <td>${req.time}</td>
        <td>
          ${
            next
              ? `<button class="action-btn secondary" data-advance="${req.donationId}">Mark ${prettyStatus(next)}</button>`
              : '<span class="done-text"><i class="fa-solid fa-circle-check"></i> Complete</span>'
          }
        </td>
      </tr>
    `;
    })
    .join("");

  document.querySelectorAll("[data-advance]").forEach((btn) => {
    btn.addEventListener("click", () => advancePickupStatus(btn.dataset.advance));
  });
}

function renderUsersTable() {
  usersTable.innerHTML = state.users
    .map(
      (user) => `
      <tr>
        <td>${user.name}</td>
        <td>${user.role}</td>
        <td>${user.active ? "Active" : "Suspended"}</td>
        <td>
          <button class="action-btn secondary" data-user="${user.id}">
            ${user.active ? "Suspend" : "Activate"}
          </button>
        </td>
      </tr>
    `
    )
    .join("");

  document.querySelectorAll("[data-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const user = state.users.find((u) => u.id === Number(btn.dataset.user));
      user.active = !user.active;
      renderUsersTable();
      renderReports();
    });
  });
}

function aggregateCounts(list, key) {
  const counter = {};
  list.forEach((item) => {
    counter[item[key]] = (counter[item[key]] || 0) + 1;
  });
  return Object.entries(counter).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function predictDemandByArea() {
  const byArea = {};

  state.donations.forEach((d) => {
    if (!byArea[d.location]) {
      byArea[d.location] = { active: 0, delivered: 0, quantity: 0 };
    }

    byArea[d.location].quantity += d.quantity;
    if (["available", "accepted", "picked-up"].includes(d.status)) {
      byArea[d.location].active += 1;
    }
    if (d.status === "delivered") {
      byArea[d.location].delivered += 1;
    }
  });

  return Object.entries(byArea)
    .map(([location, values]) => {
      const score = Math.round(values.active * 16 + Math.max(0, 8 - values.delivered * 3) + values.quantity / 10);
      let recommendation = "Stable";
      if (score >= 28) {
        recommendation = "High priority";
      } else if (score >= 18) {
        recommendation = "Increase donations";
      }

      return { location, score, recommendation };
    })
    .sort((a, b) => b.score - a.score);
}

function renderReports() {
  const totalDonations = state.donations.length;
  const successfulPickups = state.donations.filter((d) => d.status === "delivered").length;
  const activeVolunteers = state.users.filter((u) => u.role === "Volunteer" && u.active).length;
  const foodSaved = state.donations.reduce((sum, d) => sum + d.quantity, 0);
  const peopleHelped = Math.floor(foodSaved / 2);

  document.getElementById("reportDonations").textContent = totalDonations;
  document.getElementById("reportPickups").textContent = successfulPickups;
  document.getElementById("reportVolunteers").textContent = activeVolunteers;
  document.getElementById("reportFoodSaved").textContent = foodSaved;
  reportPeopleHelped.textContent = peopleHelped;

  const counts = {
    available: state.donations.filter((d) => d.status === "available").length,
    accepted: state.donations.filter((d) => d.status === "accepted").length,
    "picked-up": state.donations.filter((d) => d.status === "picked-up").length,
    delivered: successfulPickups
  };

  const max = Math.max(...Object.values(counts), 1);
  statusChart.innerHTML = Object.entries(counts)
    .map(
      ([key, value]) => `
      <div class="chart-row">
        <span>${prettyStatus(key)}</span>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(value / max) * 100}%"></div>
        </div>
        <strong>${value}</strong>
      </div>
    `
    )
    .join("");

  const topRestaurantData = aggregateCounts(state.donations, "donor");
  topRestaurants.innerHTML = topRestaurantData
    .map(([name, count]) => `<div class="leader-item"><span>${name}</span><b>${count} posts</b></div>`)
    .join("");

  const topVolunteerData = aggregateCounts(state.pickupRequests, "volunteer");
  topVolunteers.innerHTML = topVolunteerData
    .map(([name, count]) => `<div class="leader-item"><span>${name}</span><b>${count} pickups</b></div>`)
    .join("");

  const predicted = predictDemandByArea();
  demandPredictionTable.innerHTML = predicted
    .map(
      (item) => `
      <tr>
        <td>${item.location}</td>
        <td>${item.score}</td>
        <td>${item.recommendation}</td>
      </tr>
    `
    )
    .join("");
}

function renderRealtimeEvent(event) {
  if (!event || !event.type) {
    return;
  }

  if (event.type === "donation_available") {
    const d = event.payload || {};
    pushNotification("Live update: new donation", `${d.food || "Food"} in ${d.location || "an area"}`);
  }

  if (event.type === "status_updated") {
    const p = event.payload || {};
    pushNotification("Live status update", `Donation ${p.donationId || ""} is now ${prettyStatus(p.status || "updated")}`);
  }
}

function setupRealtimeChannel() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws/notifications`;

  try {
    socket = new WebSocket(url);
  } catch {
    return;
  }

  socket.onmessage = (message) => {
    try {
      renderRealtimeEvent(JSON.parse(message.data));
    } catch {
      // Ignore invalid socket payloads.
    }
  };

  socket.onclose = () => {
    setTimeout(setupRealtimeChannel, 2500);
  };
}

function refreshAll() {
  renderHomeStats();
  renderDonations();
  renderMapMarkers();
  renderRestaurantHistory();
  renderNearbyDonations();
  renderPickupTable();
  renderUsersTable();
  renderReports();
  renderCommunityRewards();
}

const debouncedRefresh = debounce(refreshAll, 180);

statusFilter.addEventListener("change", refreshAll);
volunteerLocation.addEventListener("change", () => {
  if (watchId === null) {
    setVolunteerFromDropdown();
  }
  refreshAll();
});
searchFood.addEventListener("input", debouncedRefresh);
foodTypeFilter.addEventListener("change", refreshAll);
distanceFilter.addEventListener("change", refreshAll);
quantityFilter.addEventListener("change", refreshAll);
trackToggleBtn.addEventListener("click", toggleLiveTracking);

initializeNavigation();
initializeMap();
setupPostFoodForm();
renderNotificationFeed();
setupRealtimeChannel();
refreshAll();

window.addEventListener("load", () => {
  bootstrapSecurity();

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {
      // Ignore permission errors.
    });
  }

  if (!pageLoader) {
    return;
  }

  setTimeout(() => {
    pageLoader.classList.add("hide");
  }, 450);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failures should not block UI.
    });
  }
});