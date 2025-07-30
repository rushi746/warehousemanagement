import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import gsap from "gsap";

const API_URL = "http://localhost:3000/api";
const POLL_INTERVAL_MS = 5000;

// --- Coil Placement Constants ---
const COILS_PER_BLOCK_ROW = 2; // Coils along the X-axis within a block
const COILS_PER_BLOCK_COLUMN = 5; // Coils along the Z-axis within a block
const COILS_PER_BLOCK_HEIGHT = 3; // Coils stacked vertically within a block

// Arrangement of blocks in the XZ plane
const BLOCKS_PER_ROW_XZ = 4; // How many blocks to place side-by-side horizontally

// Spacing
const COIL_SPACING_X = 0.8; // Spacing between coils within a block (along X)
const COIL_SPACING_Z = 0.8; // Spacing between coils within a block (along Z)
const COIL_HEIGHT_INCREMENT = 0.5; // Vertical space each coil occupies

const BLOCK_SPACING_X = 2.5; // Spacing between the 3 blocks placed horizontally
const BLOCK_SPACING_Z = 1.0; // Spacing between rows of blocks in the Z direction

const START_X = -7.2;
const START_Z = -13.0;
const FLOOR_Y = 0.01;
const CRANE_HEIGHT = -2; // Crane's base height, affects the overall vertical positioning of crane components.

let coilModelTemplate = null;
let totalCoilCount = 0; // Tracks the total number of coils added to the scene
let allCoils = [];
let blinkingInterval = null;
let currentlyBlinkingCoil = null;

let isPollingActive = false;
let isNotificationPending = false;
let pollTimer = null;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 8, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
scene.add(directionalLight);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const gridHelper = new THREE.GridHelper(20, 20);
scene.add(gridHelper);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.update();

const loadingManager = new THREE.LoadingManager();
const loader = new GLTFLoader(loadingManager);

loadingManager.onLoad = () => {
  console.log("All models loaded successfully! - main.js:75");

  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen) {
    loadingScreen.style.display = "none";
  }

  document.getElementById("addAssetButton").disabled = false;
  document.getElementById("searchButton").disabled = false;

  startPollingForNewCoils();
  initializeCrane();
  setupCraneGUI();
};

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  console.log(
    `Loading file: ${url}\nLoaded ${itemsLoaded} of ${itemsTotal} files.`
  );
};

loadingManager.onError = (url) => {
  console.error(`There was an error loading: ${url} - main.js:97`);
};

loader.load("/warehouse3.glb", (gltf) => {
  scene.add(gltf.scene);
  console.log("Warehouse model loaded. - main.js:102");
  gltf.scene.traverse(function (child) {
    if (child.isMesh) {
      child.receiveShadow = true;
    }
  });
});

loader.load("/steelcoil.glb", (gltf) => {
  coilModelTemplate = gltf.scene;
  coilModelTemplate.scale.set(0.4, 0.4, 0.4);
  console.log("Coil model template loaded. - main.js:113");
});

function addCoilWithCrane() {
  if (!coilModelTemplate) {
    alert("Coil model template is not loaded yet. Please wait.");
    return;
  }

  const currentTotalCoils = totalCoilCount;

  const coilsPerFullBlock =
    COILS_PER_BLOCK_ROW * COILS_PER_BLOCK_COLUMN * COILS_PER_BLOCK_HEIGHT;
  const blockIndexTotal = Math.floor(currentTotalCoils / coilsPerFullBlock);

  const coilIndexWithinBlockStart = currentTotalCoils % coilsPerFullBlock;

  const coilsPerXZPlaneInBlock = COILS_PER_BLOCK_ROW * COILS_PER_BLOCK_COLUMN;
  const coilLayerInBlock = Math.floor(
    coilIndexWithinBlockStart / coilsPerXZPlaneInBlock
  );

  const coilIndexInXZPlane = coilIndexWithinBlockStart % coilsPerXZPlaneInBlock;
  const coilColInBlock = coilIndexInXZPlane % COILS_PER_BLOCK_ROW;
  const coilRowInBlock = Math.floor(coilIndexInXZPlane / COILS_PER_BLOCK_ROW);

  const blockRowXZ = Math.floor(blockIndexTotal / BLOCKS_PER_ROW_XZ);
  const blockColXZ = blockIndexTotal % BLOCKS_PER_ROW_XZ;

  const xPosition =
    START_X +
    blockColXZ * (COILS_PER_BLOCK_ROW * COIL_SPACING_X + BLOCK_SPACING_X) + // Spacing for blocks in X
    coilColInBlock * COIL_SPACING_X; // Spacing for coils within block

  const zPosition =
    START_Z +
    blockRowXZ * (COILS_PER_BLOCK_COLUMN * COIL_SPACING_Z + BLOCK_SPACING_Z) + // Spacing for blocks in Z
    coilRowInBlock * COIL_SPACING_Z; // Spacing for coils within block

  const yPosition = FLOOR_Y + coilLayerInBlock * COIL_HEIGHT_INCREMENT;

  const newCoil = coilModelTemplate.clone(true);
  newCoil.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone();
      if (child.material.emissive === undefined && child.material.color) {
        child.material.emissive = new THREE.Color(0x000000);
      }
      child.castShadow = true;
    }
  });

  newCoil.userData.id = totalCoilCount + 1; // Use totalCoilCount for unique IDs
  allCoils.push(newCoil);
  scene.add(newCoil);

  animateCraneDrop(newCoil, xPosition, zPosition, yPosition);

  totalCoilCount++;

  console.log(
    `Coil #${newCoil.userData.id} going to (${xPosition.toFixed(
      2
    )}, ${yPosition.toFixed(2)}, ${zPosition.toFixed(2)}).`
  );
}

async function checkForNewCoil() {
  if (!isPollingActive) return false;

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
    console.error("Failed to connect to API: - main.js:194", error);
    return false;
  }
}

function showCoilRequestPrompt() {
  if (isNotificationPending) return;

  isNotificationPending = true;

  const dialog = document.getElementById("coilDialog");
  const acceptBtn = document.getElementById("acceptBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  if (!dialog || !acceptBtn || !rejectBtn) {
    console.error("Could not find DOM elements for coil dialog. - main.js:209");
    isNotificationPending = false;
    return;
  }

  dialog.style.display = "block";

  const cleanUp = () => {
    dialog.style.display = "none";
    acceptBtn.removeEventListener("click", onAccept);
    rejectBtn.removeEventListener("click", onReject);
    isNotificationPending = false;
  };

  const onAccept = () => {
    console.log("User accepted new coil request. - main.js:224");
    addCoilWithCrane();
    cleanUp();
  };

  const onReject = () => {
    console.log("User rejected new coil request. - main.js:230");
    cleanUp();
  };

  acceptBtn.addEventListener("click", onAccept);
  rejectBtn.addEventListener("click", onReject);
}

async function pollAndHandle() {
  if (!isPollingActive) return;

  const hasNewCoil = await checkForNewCoil();
  if (hasNewCoil) {
    showCoilRequestPrompt();
  }
}

function startPollingForNewCoils() {
  if (isPollingActive) {
    console.log("Polling is already active. - main.js:249");
    return;
  }
  isPollingActive = true;
  console.log(
    `Starting to poll for new coils every ${
      POLL_INTERVAL_MS / 1000
    } seconds.`
  );

  pollAndHandle();

  pollTimer = setInterval(pollAndHandle, POLL_INTERVAL_MS);
}

function stopPollingForNewCoils() {
  if (!isPollingActive) return;
  isPollingActive = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  console.log("Polling for new coils has been stopped. - main.js:271");
}

function stopBlinking() {
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

function startBlinking(coil) {
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

function moveCameraTo(targetObject) {
  if (!targetObject) return;

  const targetPosition = new THREE.Vector3();
  targetObject.getWorldPosition(targetPosition);

  const controlsTarget = targetPosition.clone();
  const cameraTargetPosition = targetPosition
    .clone()
    .add(new THREE.Vector3(0, 3, 5));

  if (
    camera.position.distanceTo(cameraTargetPosition) < 0.5 &&
    controls.target.distanceTo(controlsTarget) < 0.1
  ) {
    camera.position.copy(cameraTargetPosition);
    controls.target.copy(controlsTarget);
    controls.update();
    return;
  }

  gsap.to(camera.position, {
    x: cameraTargetPosition.x,
    y: cameraTargetPosition.y,
    z: cameraTargetPosition.z,
    duration: 1.0,
    ease: "power2.out",
    onUpdate: () => {
      controls.target.lerp(controlsTarget, 0.1);
      controls.update();
    },
    onComplete: () => {
      controls.target.copy(controlsTarget);
      controls.update();
    },
  });
}

function findAndHighlightCoil() {
  stopBlinking();

  const searchInput = document.getElementById("searchInput");
  const idToFind = parseInt(searchInput.value);

  if (isNaN(idToFind)) {
    alert("Please enter a valid Coil ID (a number).");
    return;
  }

  const foundCoil = allCoils.find((coil) => coil.userData.id === idToFind);

  if (foundCoil) {
    startBlinking(foundCoil);
    moveCameraTo(foundCoil);
  } else {
    alert(`Coil with ID ${idToFind} not found.`);
  }
}

document.getElementById("addAssetButton")?.addEventListener("click", () => {
  addCoilWithCrane();
});

document.getElementById("searchButton")?.addEventListener("click", () => {
  findAndHighlightCoil();
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

let hookCarrier, hook, wire;
const craneGroup = new THREE.Group();
scene.add(craneGroup);

function initializeCrane() {
  if (!coilModelTemplate) {
    console.error(
      "Crane cannot be initialized: Coil model not loaded yet."
    );
    return;
  }

  // Boom of the crane
  const boom = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.1, 0.1), // Length, Width, Height of the boom
    new THREE.MeshStandardMaterial({ color: 0x0099ff })
  );
  boom.position.set(0, CRANE_HEIGHT + 6, 0); // X, Y, Z position of the boom's pivot point
  boom.castShadow = true;
  craneGroup.add(boom);

  // Hook carrier - the part that moves along the boom
  hookCarrier = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.4, 0.2), // Size of the hook carrier
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
  );

  hookCarrier.position.set(5, CRANE_HEIGHT + 6, 0); // X, Y, Z position relative to the crane group's origin
  hookCarrier.castShadow = true;
  craneGroup.add(hookCarrier);

  // The hook itself
  hook = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4), // Size of the hook
    new THREE.MeshStandardMaterial({ color: 0x000000 })
  );
  const ropeHeight = 0.2; // Reduced height of the rope/wire for the hook
  hook.position.set(
    hookCarrier.position.x,
    hookCarrier.position.y - ropeHeight,
    hookCarrier.position.z
  ); // Set hook position relative to hook carrier
  hook.castShadow = true;
  craneGroup.add(hook);

  const wireMaterial = new THREE.LineBasicMaterial({ color: "#e7e7dcff" }); // Color of the wire
  const wireGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(
      hookCarrier.position.x,
      hookCarrier.position.y,
      hookCarrier.position.z
    ), // Start point of the wire (at hook carrier)
    new THREE.Vector3(hook.position.x, hook.position.y, hook.position.z), // End point of the wire (at hook)
  ]);
  wire = new THREE.Line(wireGeometry, wireMaterial);
  craneGroup.add(wire);

  console.log("Crane initialized. - main.js:445");
}

function updateWire() {
  if (hookCarrier && hook && wire) {
    const points = [
      new THREE.Vector3(
        hookCarrier.position.x,
        hookCarrier.position.y,
        hookCarrier.position.z
      ),
      new THREE.Vector3(hook.position.x, hook.position.y, hook.position.z),
    ];
    wire.geometry.setFromPoints(points);
  }
}

function animateCraneDrop(coil, targetX, targetZ, targetY) {
  if (!hookCarrier || !hook) {
    console.error(
      "Crane parts not initialized for drop animation."
    );
    return;
  }

  const pullingMachineHeight = CRANE_HEIGHT + 5.4;
  const ropeHeight = 0.2;

  hookCarrier.position.set(targetX, pullingMachineHeight, targetZ);

  hook.position.set(
    hookCarrier.position.x,
    hookCarrier.position.y - ropeHeight,
    hookCarrier.position.z
  );

  coil.position.set(hook.position.x, hook.position.y - 0.3, hook.position.z);

  updateWire();

  const dropY = FLOOR_Y + 0.0;

  gsap.to(hookCarrier.position, {
    x: targetX,
    z: targetZ,
    duration: 2,
    ease: "power1.inOut",
    onUpdate: () => {
      updateWire();
      hook.position.x = hookCarrier.position.x;
      hook.position.z = hookCarrier.position.z;
      coil.position.x = hook.position.x;
      coil.position.z = hook.position.z;
    },
  });

  gsap.to(hook.position, {
    y: targetY + 0.3,
    duration: 2,
    delay: 2,
    ease: "power1.inOut",
    onUpdate: () => {
      updateWire();

      coil.position.set(
        hook.position.x,
        hook.position.y - 0.3,
        hook.position.z
      );
    },
  });

  gsap.delayedCall(4.2, () => {
    updateWire();
    gsap.to(hookCarrier.position, {
      y: hookCarrier.position.y + 3,
      duration: 1,
      ease: "power1.inOut",
      onUpdate: () => {
        hook.position.y = hookCarrier.position.y;
        updateWire();
      },
      onComplete: () => {
        console.log(
          `Coil ${coil.userData.id} dropped at (${targetX.toFixed(
            2
          )}, ${FLOOR_Y}, ${targetZ.toFixed(2)}).`
        );
      },
    });
  });
}

let craneGUIFolder;

function setupCraneGUI() {
  if (typeof GUI === "undefined") {
    console.warn(
      "dat.GUI not found. Crane GUI controls will not be available."
    );
    return;
  }

  const guiContainer = document.getElementById("gui-container");
  if (!guiContainer) {
    console.error(
      "GUI container not found. Please add a div with id='guicontainer' to your extension's HTML."
    );
    return;
  }

  const gui = new GUI({ autoPlace: false });
  guiContainer.appendChild(gui.domElement);

  craneGUIFolder = gui.addFolder("Crane Controls");

  const craneControls = {
    pickedCoilIndex: 0,
    boomRotationZ: 0,
    pickupCoil: function () {
      if (allCoils.length === 0) {
        alert("No coils available to pick up.");
        return;
      }
      const maxIndex = Math.max(0, allCoils.length - 1);
      this.pickedCoilIndex = Math.min(this.pickedCoilIndex, maxIndex);

      const coilToPick = allCoils[this.pickedCoilIndex];
      const pickupPositionX = coilToPick.position.x;
      const pickupPositionZ = coilToPick.position.z;
      const pickupPositionY = coilToPick.position.y;

      const pickedIndex = this.pickedCoilIndex;
      allCoils.splice(pickedIndex, 1);

      moveCameraTo(coilToPick);
      animateCraneDrop(
        coilToPick,
        pickupPositionX,
        pickupPositionZ,
        pickupPositionY
      );
    },
    rotateBoom: function () {
      craneGroup.rotation.y = this.boomRotationZ;
      const boomPivotOffset = new THREE.Vector3(0, CRANE_HEIGHT + 6, 0);
      const distanceAlongBoom = 5;

      const angleInRadians = craneGroup.rotation.y;

      const newCarrierX =
        boomPivotOffset.x + Math.cos(angleInRadians) * distanceAlongBoom;
      const newCarrierZ =
        boomPivotOffset.z + Math.sin(angleInRadians) * distanceAlongBoom;

      hookCarrier.position.set(
        newCarrierX,
        hookCarrier.position.y,
        newCarrierZ
      );

      hook.position.x = hookCarrier.position.x;
      hook.position.z = hookCarrier.position.z;
      updateWire();
    },
  };

  craneGUIFolder
    .add(craneControls, "pickedCoilIndex", 0, 100)
    .name("Coil Index")
    .step(1)
    .onChange((value) => {
      const maxIndex = Math.max(0, allCoils.length - 1);
      craneControls.pickedCoilIndex = Math.min(Math.max(0, value), maxIndex);
    });
  craneGUIFolder
    .add(craneControls, "boomRotationZ", -Math.PI / 2, Math.PI / 2)
    .name("Boom Rotation (XZ)")
    .step(0.01)
    .onChange(craneControls.rotateBoom);
  craneGUIFolder.add(craneControls, "pickupCoil").name("Pick & Drop Coil");
  craneGUIFolder.open();

  console.log("Crane GUI setup complete. - main.js:628");
}

document.getElementById("addAssetButton").disabled = true;
document.getElementById("searchButton").disabled = true;

animate();
