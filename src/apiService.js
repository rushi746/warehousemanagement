const API_URL = "http://localhost:3000/api";

export async function checkForNewCoil() {
  try {
    const response = await fetch(`${API_URL}/checkForNewCoil`);
    if (!response.ok) {
      console.error(`API Error: ${response.status} ${response.statusText} - apiService.js:7`);
      return null;
    }

    const data = await response.json();

    // ✅ If a new coil is available, return its full details including the 4-digit ID
    if (data.newCoil) {
      return {
        id: data.id,           // 👈 Include the 4-digit coil ID
        row: data.row,
        column: data.column,
        layer: data.layer
      };
    }

    return null; // ❌ No new coil available
  } catch (error) {
    console.error("❌ Failed to connect to API - apiService.js:25", error);
    return null;
  }
}
