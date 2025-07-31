
import gsap from "gsap";
import * as THREE from "three";

let isNotificationPending = false;
let currentlyBlinkingCoil = null;
let blinkingInterval = null;

export function setupUIEventListeners(
  openPlacementPopup,        
  findAndHighlightCoil,
  placeCoilAtCallback
) {
  const addAssetButton = document.getElementById("addAssetButton");
  if (addAssetButton) {
    addAssetButton.addEventListener("click", () => {
      // ✅ Instead of adding coil immediately, show the popup
      document.querySelector(".placement-controls").style.display = "flex";
    });
  } else {
    console.warn("addAssetButton not found. - ui.js:21");
  }

  const searchButton = document.getElementById("searchButton");
  if (searchButton) {
    searchButton.addEventListener("click", () => {
      findAndHighlightCoil();
    });
  } else {
    console.warn("searchButton not found. - ui.js:30");
  }

  const manualPlaceButton = document.getElementById("manualPlaceButton");
  if (manualPlaceButton) {
    manualPlaceButton.addEventListener("click", () => {
      const row = parseInt(document.getElementById("rowInput").value);
      const column = parseInt(document.getElementById("colInput").value);
      const layer = parseInt(document.getElementById("layerInput").value);

      if (isNaN(row) || isNaN(column) || isNaN(layer)) {
        alert("⚠️ Please enter valid numbers for row, column, and layer.");
        return;
      }

      // ✅ Place coil now
      placeCoilAtCallback(row, column, layer);

      // ✅ Hide popup after placing coil
      document.querySelector(".placement-controls").style.display = "none";
    });
  } else {
    console.warn("manualPlaceButton not found. - ui.js:52");
  }

  console.log("✅ UI event listeners set up (with popup flow). - ui.js:55");
}


export function updateLoadingScreen(visible) {
  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen) {
    loadingScreen.style.display = visible ? "flex" : "none";
  } else {
    console.warn("loadingscreen element not found. - ui.js:64");
  }
}

export function enableActionButtons() {
  document.getElementById("addAssetButton").disabled = false;
  document.getElementById("searchButton").disabled = false;
}

export function showCoilRequestPrompt(onAccept, onReject) {
  if (isNotificationPending) return;

  isNotificationPending = true;

  const dialog = document.getElementById("coilDialog");
  const acceptBtn = document.getElementById("acceptBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  if (!dialog || !acceptBtn || !rejectBtn) {
    console.error("Could not find DOM elements for coil dialog. - ui.js:83");
    isNotificationPending = false;
    return;
  }

  dialog.style.display = "block";

  const cleanUp = () => {
    dialog.style.display = "none";
    acceptBtn.removeEventListener("click", onAcceptHandler);
    rejectBtn.removeEventListener("click", onRejectHandler);
    isNotificationPending = false;
  };

  const onAcceptHandler = () => {
    console.log("User accepted new coil request. - ui.js:98");
    onAccept();
    cleanUp();
  };

  const onRejectHandler = () => {
    console.log("User rejected new coil request. - ui.js:104");
    onReject();
    cleanUp();
  };

  acceptBtn.addEventListener("click", onAcceptHandler);
  rejectBtn.addEventListener("click", onRejectHandler);
}

export function stopBlinking() {
  if (blinkingInterval) {
    clearInterval(blinkingInterval);
    blinkingInterval = null;
  }
  if (currentlyBlinkingCoil) {
    currentlyBlinkingCoil.traverse((child) => {
      if (child.isMesh && child.material) {
        if (child.material.emissive !== undefined) {
          child.material.emissive.set(0x000000);
        }
      }
    });
    currentlyBlinkingCoil = null;
  }
}

export function startBlinking(coil) {
  let isEmissive = false;
  currentlyBlinkingCoil = coil;

  coil.traverse((child) => {
    if (child.isMesh && child.material) {
      if (child.material.emissive !== undefined) {
        child.material.emissive.set(0xffff00);
      }
    }
  });

  blinkingInterval = setInterval(() => {
    isEmissive = !isEmissive;
    coil.traverse((child) => {
      if (child.isMesh && child.material) {
        if (child.material.emissive !== undefined) {
          child.material.emissive.set(isEmissive ? 0xffff00 : 0x000000);
        }
      }
    });
  }, 300);
}

export function alertUser(message) {
  alert(message);
}