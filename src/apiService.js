// apiService.js

const API_URL = "http://localhost:3000/api";

export async function checkForNewCoil() {
  if (!navigator.onLine) {
    console.warn("Offline: Cannot check for new coils. - apiService.js:7");
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/checkForNewCoil`);
    if (!response.ok) {
      console.error(
        `API Error: ${response.status} ${response.statusText}`
      );
      return false;
    }
    const data = await response.json();
    return data.newCoil;
  } catch (error) {
    console.error("Failed to connect to API: - apiService.js:22", error);
    return false;
  }
}