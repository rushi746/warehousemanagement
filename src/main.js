import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import gsap from "gsap";

import {
  setupUIEventListeners,
  updateLoadingScreen,
  enableActionButtons,
  showCoilRequestPrompt,
  startBlinking,
  stopBlinking,
  alertUser,
} from "./ui.js";
import { checkForNewCoil } from "./apiService.js";

const COILS_PER_BLOCK_ROW = 19;
const COILS_PER_BLOCK_COLUMN = 35;
const COILS_PER_BLOCK_HEIGHT = 3;

const BLOCKS_PER_ROW_XZ = 4;

const COIL_SPACING_X = 0.8;
const COIL_SPACING_Z = 0.8;
const COIL_HEIGHT_INCREMENT = 0.5;

const BLOCK_SPACING_X = 2.5;
const BLOCK_SPACING_Z = 1.0;

const START_X = -7.2;
const START_Z = -13.0;
const FLOOR_Y = 0.0;
const CRANE_HEIGHT = -2;

let coilModelTemplate = null;
let totalCoilCount = 0;
let allCoils = [];
let pollTimer = null;
let isPollingActive = false;

let currentlyBlinkingCoil = null;

// Improved scene setup with better lighting
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333); // Lighter background
scene.fog = new THREE.FogExp2(0x333333, 0.002); // Subtle fog for depth

// Enhanced camera setup
const camera = new THREE.PerspectiveCamera(
  60, // Wider field of view
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 12, 20); // Higher initial position

const renderer = new THREE.WebGLRenderer({ 
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding; // Better color handling
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// Enhanced lighting setup
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;
scene.add(directionalLight);

// Additional fill light
const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
fillLight.position.set(-5, 10, -10);
scene.add(fillLight);

// Back light
const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
backLight.position.set(0, 5, -15);
scene.add(backLight);

function createWarehouseGrid() {
  const lineMaterial = new THREE.LineBasicMaterial({ 
    color: 0xaaaaaa, // Softer grid color
    transparent: true,
    opacity: 0.6
  });

  const gridGroup = new THREE.Group();

  // Grid dimensions (based on your coil placement)
  const totalWidth = (COILS_PER_BLOCK_ROW * COIL_SPACING_X + BLOCK_SPACING_X) * BLOCKS_PER_ROW_XZ;
  const totalDepth = (COILS_PER_BLOCK_COLUMN * COIL_SPACING_Z + BLOCK_SPACING_Z) * BLOCKS_PER_ROW_XZ;

  const startX = START_X - 0.4;
  const startZ = START_Z - 0.4;

  // Draw vertical lines (columns)
  for (let i = 0; i <= COILS_PER_BLOCK_ROW * BLOCKS_PER_ROW_XZ; i++) {
    const points = [];
    points.push(new THREE.Vector3(startX + i * COIL_SPACING_X, FLOOR_Y + 0.001, startZ));
    points.push(new THREE.Vector3(startX + i * COIL_SPACING_X, FLOOR_Y + 0.001, startZ + totalDepth));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, lineMaterial);
    gridGroup.add(line);
  }

  // Draw horizontal lines (rows)
  for (let j = 0; j <= COILS_PER_BLOCK_COLUMN * BLOCKS_PER_ROW_XZ; j++) {
    const points = [];
    points.push(new THREE.Vector3(startX, FLOOR_Y + 0.001, startZ + j * COIL_SPACING_Z));
    points.push(new THREE.Vector3(startX + totalWidth, FLOOR_Y + 0.001, startZ + j * COIL_SPACING_Z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, lineMaterial);
    gridGroup.add(line);
  }

  scene.add(gridGroup);
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 5;
controls.maxDistance = 50;
controls.maxPolarAngle = Math.PI * 0.9;
controls.update();

const loadingManager = new THREE.LoadingManager();
const loader = new GLTFLoader(loadingManager);

let hookCarrier, hook, wire;
const craneGroup = new THREE.Group();
scene.add(craneGroup);

loadingManager.onLoad = () => {
  console.log("🎯 All assets loaded successfully! - main.js:152");
  updateLoadingScreen(false);
  enableActionButtons();
  initializeCrane();
  setupUIEventListeners(addCoilWithCrane, findAndHighlightCoil, placeCoilAt);
  startPollingForNewCoils();
};


loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  console.log(`Loading file: ${url}\nLoaded ${itemsLoaded} of ${itemsTotal} files. - main.js:162`);
};

loadingManager.onError = (url) => {
  console.error(`There was an error loading: ${url} - main.js:166`);
  alertUser(`Error loading ${url}. Please check the console.`);
};

// Improved GLB loading with material enhancements
loader.load("/warehouse4.glb", (gltf) => {
  gltf.scene.traverse(function (child) {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      
      // Enhance materials for better appearance
      if (child.material) {
        child.material = child.material.clone();
        child.material.roughness = 0.7;
        child.material.metalness = 0.1;
        
        // Make colors more vibrant
        if (child.material.color) {
          child.material.color.convertSRGBToLinear();
        }
        
        // Handle emissive materials
        if (child.material.emissive) {
          child.material.emissiveIntensity = 0.5;
        }
      }
    }
  });
  
  scene.add(gltf.scene);
  console.log("Warehouse model loaded with enhanced materials. - main.js:197");
  createSingleBlockSlots();
});

loader.load("/steelcoil.glb", (gltf) => {
  coilModelTemplate = gltf.scene;
  coilModelTemplate.scale.set(0.4, 0.4, 0.4);
  
  // Enhance coil materials
  coilModelTemplate.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone();
      child.material.roughness = 0.5;
      child.material.metalness = 0.8; // More metallic for steel coils
      child.material.envMapIntensity = 0.5;
      
      if (child.material.color) {
        child.material.color.convertSRGBToLinear();
      }
      
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  
  console.log("Coil model template loaded with enhanced materials. - main.js:222");
});

function placeCoilAt(row, column, layer, coilId = null) {
  if (!coilModelTemplate) {
    alertUser("Coil model template is not loaded yet. Please wait.");
    return;
  }

  const rowIndex = row - 1;
  const columnIndex = column - 1;
  const layerIndex = layer - 1;

  const blockRowXZ = Math.floor(rowIndex / COILS_PER_BLOCK_COLUMN);
  const blockColXZ = Math.floor(columnIndex / COILS_PER_BLOCK_ROW);

  const xPosition = START_X +
      blockColXZ * (COILS_PER_BLOCK_ROW * COIL_SPACING_X + BLOCK_SPACING_X) +
      (columnIndex % COILS_PER_BLOCK_ROW) * COIL_SPACING_X;

  const zPosition = START_Z +
      blockRowXZ * (COILS_PER_BLOCK_COLUMN * COIL_SPACING_Z + BLOCK_SPACING_Z) +
      (rowIndex % COILS_PER_BLOCK_COLUMN) * COIL_SPACING_Z;

  const yPosition = FLOOR_Y + layerIndex * COIL_HEIGHT_INCREMENT;

  const newCoil = coilModelTemplate.clone(true);
  newCoil.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone();
      child.material.roughness = 0.5;
      child.material.metalness = 0.8;
      
      if (child.material.emissive === undefined && child.material.color) {
        child.material.emissive = new THREE.Color(0x000000);
      }
      
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // 👉 Assign coil ID from backend or auto-generate if not provided
  newCoil.userData.id = coilId ?? (totalCoilCount + 1);

  allCoils.push(newCoil);
  scene.add(newCoil);

  animateCraneDrop(newCoil, xPosition, zPosition, yPosition);

  totalCoilCount++;

  console.log(
    `✅ Coil #${newCoil.userData.id} placed at Row: ${row}, Column: ${column}, Layer: ${layer}`
  );
}


function addCoilWithCrane() {
  if (!coilModelTemplate) {
    alertUser("Coil model template is not loaded yet. Please wait.");
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
    blockColXZ * (COILS_PER_BLOCK_ROW * COIL_SPACING_X + BLOCK_SPACING_X) +
    coilColInBlock * COIL_SPACING_X;

  const zPosition =
    START_Z +
    blockRowXZ * (COILS_PER_BLOCK_COLUMN * COIL_SPACING_Z + BLOCK_SPACING_Z) +
    coilRowInBlock * COIL_SPACING_Z;

  const yPosition = FLOOR_Y + coilLayerInBlock * COIL_HEIGHT_INCREMENT;

  const newCoil = coilModelTemplate.clone(true);
  newCoil.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone();
      child.material.roughness = 0.5;
      child.material.metalness = 0.8;
      
      if (child.material.emissive === undefined && child.material.color) {
        child.material.emissive = new THREE.Color(0x000000);
      }
      
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  newCoil.userData.id = totalCoilCount + 1;
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
const coilIdLabel = document.getElementById("coilIdLabel");

function updateCoilLabelPosition(coil) {
  if (!coil) {
    coilIdLabel.style.display = "none";
    return;
  }

  const position = new THREE.Vector3();
  coil.getWorldPosition(position);

  const projected = position.clone().project(camera);

  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;

  coilIdLabel.style.left = `${x}px`;
  coilIdLabel.style.top = `${y}px`;
  coilIdLabel.innerText = `ID: ${coil.userData.id}`;
  coilIdLabel.style.display = "block";
}

async function pollAndHandle() {
  if (!isPollingActive) return;

  const coilData = await checkForNewCoil();

  if (coilData) {
    showCoilRequestPrompt(
      () => placeCoilAt(coilData.row, coilData.column, coilData.layer, coilData.id),
      () => console.log("❌ Coil placement rejected. - main.js:378")
    );
  }
}



function startPollingForNewCoils() {
  if (isPollingActive) {
    console.log("Polling is already active. - main.js:387");
    return;
  }
  isPollingActive = true;
  const pollIntervalSeconds = 5;
  console.log(
    `Starting to poll for new coils every ${pollIntervalSeconds} seconds.`
  );

  pollAndHandle();
  pollTimer = setInterval(pollAndHandle, 5000);
}

function stopPollingForNewCoils() {
  if (!isPollingActive) return;
  isPollingActive = false;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  console.log("Polling for new coils has been stopped. - main.js:407");
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
  currentlyBlinkingCoil = null;
  coilIdLabel.style.display = "none";

  const searchInput = document.getElementById("searchInput");
  if (!searchInput) {
    alertUser("Search input field not found.");
    return;
  }

  const idToFind = parseInt(searchInput.value);

  if (isNaN(idToFind)) {
    alertUser("Please enter a valid Coil ID (a number).");
    return;
  }

  const foundCoil = allCoils.find((coil) => coil.userData.id === idToFind);

  if (foundCoil) {
    currentlyBlinkingCoil = foundCoil;
    startBlinking(foundCoil);
    moveCameraTo(foundCoil);
    updateCoilLabelPosition(foundCoil);
  } else {
    alertUser(`Coil with ID ${idToFind} not found.`);
  }
}


function initializeCrane() {
  if (!coilModelTemplate) {
    console.error("Crane cannot be initialized: Coil model not loaded yet. - main.js:481");
    return;
  }

  // Improved crane materials
  const boomMaterial = new THREE.MeshStandardMaterial({
    color: 0x0099ff,
    roughness: 0.3,
    metalness: 0.7
  });
  
  const boom = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.1, 0.1),
    boomMaterial
  );
  boom.position.set(0, CRANE_HEIGHT + 6, 0);
  boom.castShadow = true;
  boom.receiveShadow = true;
  craneGroup.add(boom);

  const carrierMaterial = new THREE.MeshStandardMaterial({
    color: 0xff3300,
    roughness: 0.4,
    metalness: 0.6
  });
  
  hookCarrier = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.4, 0.2),
    carrierMaterial
  );
  hookCarrier.position.set(5, CRANE_HEIGHT + 6, 0);
  hookCarrier.castShadow = true;
  hookCarrier.receiveShadow = true;
  craneGroup.add(hookCarrier);

  const hookMaterial = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.1,
    metalness: 0.9
  });
  
  hook = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    hookMaterial
  );
  const ropeHeight = 0.2;
  hook.position.set(
    hookCarrier.position.x,
    hookCarrier.position.y - ropeHeight,
    hookCarrier.position.z
  );
  hook.castShadow = true;
  hook.receiveShadow = true;
  craneGroup.add(hook);

  const wireMaterial = new THREE.LineBasicMaterial({ 
    color: 0xdddddd,
    linewidth: 2
  });
  const wireGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(hookCarrier.position.x, hookCarrier.position.y, hookCarrier.position.z),
    new THREE.Vector3(hook.position.x, hook.position.y, hook.position.z),
  ]);
  wire = new THREE.Line(wireGeometry, wireMaterial);
  craneGroup.add(wire);

  console.log("Crane initialized with enhanced materials. - main.js:547");
}

function updateWire() {
  if (hookCarrier && hook && wire) {
    const points = [
      new THREE.Vector3(hookCarrier.position.x, hookCarrier.position.y, hookCarrier.position.z),
      new THREE.Vector3(hook.position.x, hook.position.y, hook.position.z),
    ];
    wire.geometry.setFromPoints(points);
  }
}

function animateCraneDrop(coil, targetX, targetZ, targetY) {
  if (!hookCarrier || !hook) {
    console.error("Crane parts not initialized for drop animation. - main.js:562");
    return;
  }

  hookCarrier.position.set(targetX, CRANE_HEIGHT + 6, targetZ);
  hook.position.set(targetX, CRANE_HEIGHT + 6, targetZ);
  updateWire();

  coil.position.set(targetX, CRANE_HEIGHT + 6, targetZ);

  gsap.to(coil.position, {
  y: targetY,
  duration: 4,       
  ease: "power1.inOut", 
  onStart: () => {
    currentlyBlinkingCoil = coil; // Track this coil temporarily
  },
  onUpdate: () => {
    hook.position.y = coil.position.y + 0.3; 
    updateWire();
    updateCoilLabelPosition(coil); // Show label during movement
  },
  onComplete: () => {
    console.log(`✅ Coil ${coil.userData.id} gently lowered. - main.js:585`);
    
    // ❌ Hide label and stop tracking
    if (currentlyBlinkingCoil === coil) {
      coilIdLabel.style.display = "none";
      currentlyBlinkingCoil = null;
    }
  }
});


  gsap.to(hook.position, {
    y: CRANE_HEIGHT + 6,
    duration: 2,
    delay: 4,
    ease: "power1.inOut",
    onUpdate: updateWire,
  });
}

function createSingleBlockSlots() {
  const slotGroup = new THREE.Group();

  const slotWidth = COIL_SPACING_X;
  const slotDepth = COIL_SPACING_Z;

  const slotMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.05,  // very light fill
    transparent: true,
    side: THREE.DoubleSide
  });

  for (let row = 0; row < COILS_PER_BLOCK_COLUMN; row++) {
    for (let col = 0; col < COILS_PER_BLOCK_ROW; col++) {

      // ✅ Calculate position for each slot
      const xPos = START_X + col * COIL_SPACING_X;
      const zPos = START_Z + row * COIL_SPACING_Z;

      // ✅ Create flat plane for slot
      const slot = new THREE.Mesh(
        new THREE.PlaneGeometry(slotWidth, slotDepth),
        slotMaterial
      );
      slot.rotation.x = -Math.PI / 2;   // make it flat
      slot.position.set(xPos, FLOOR_Y + 0.001, zPos);
      slotGroup.add(slot);

      // ✅ Add white border using EdgesGeometry
      const edges = new THREE.EdgesGeometry(slot.geometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
      const border = new THREE.LineSegments(edges, lineMaterial);
      slot.add(border);
    }
  }

  scene.add(slotGroup);
}


function animate() {
  requestAnimationFrame(animate);

  // Optional dynamic light movement
  const time = Date.now() * 0.0005;
  directionalLight.position.x = Math.sin(time * 0.7) * 5 + 5;
  directionalLight.position.z = Math.cos(time * 0.3) * 5 + 10;

  controls.update();
  renderer.render(scene, camera);

  // ✅ Keep label following blinking coil
  if (currentlyBlinkingCoil) {
    updateCoilLabelPosition(currentlyBlinkingCoil);
  }
}

function setupCraneGUI() {
  if (typeof GUI === "undefined") {
    console.warn("dat.GUI not found. Crane GUI controls will not be available. - main.js:665");
    return;
  }

  const guiContainer = document.getElementById("gui-container");
  if (!guiContainer) {
    console.error("GUI container not found. Please add a div with id='guicontainer' to your HTML. - main.js:671");
    return;
  }

  const gui = new GUI({ autoPlace: false });
  guiContainer.appendChild(gui.domElement);

  const craneGUIFolder = gui.addFolder("Crane Controls");

  const craneControls = {
    pickedCoilIndex: 0,
    boomRotationZ: 0,
    pickupCoil: function () {
      if (allCoils.length === 0) {
        alertUser("No coils available to pick up.");
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

  console.log("Crane GUI setup complete. - main.js:751");
}

// Handle window resize
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);

document.getElementById("addAssetButton").disabled = true;
document.getElementById("searchButton").disabled = true;

updateLoadingScreen(true);

animate();

setupCraneGUI();