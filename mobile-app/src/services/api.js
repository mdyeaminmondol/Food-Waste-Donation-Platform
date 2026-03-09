const API_BASE = "http://127.0.0.1:5000";

export async function fetchDonations() {
  const response = await fetch(`${API_BASE}/api/donations`);
  if (!response.ok) {
    throw new Error("Failed to fetch donations");
  }
  return response.json();
}

export async function updateDonationStatus(donationId, status) {
  const response = await fetch(`${API_BASE}/api/donations/${donationId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    throw new Error("Failed to update status");
  }

  return response.json();
}

export async function fetchDemandPredictions() {
  const response = await fetch(`${API_BASE}/api/predictions/demand`);
  if (!response.ok) {
    return { items: [] };
  }
  return response.json();
}
