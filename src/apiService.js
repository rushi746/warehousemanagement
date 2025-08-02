const API_URL = "http://localhost:3000/api";

export async function checkForNewCoil() {
  try {
    const response = await fetch(`${API_URL}/checkForNewCoil`);
    if (!response.ok) {
      console.error(`API Error: ${response.status} ${response.statusText} - apiService.js:7`);
      return null;
    }

    const data = await response.json();

    // ✅ if there is a new coil return full object
    if (data.newCoil) {
      return {
        row: data.row,
        column: data.column,
        layer: data.layer
      };
    }

    return null; // ✅ no new coil
  } catch (error) {
    console.error("❌ Failed to connect to API - apiService.js:24", error);
    return null;
  }
}
