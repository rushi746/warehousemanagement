// main.js
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

const COILS_PER_BLOCK_ROW = 15;
const COILS_PER_BLOCK_COLUMN = 20;
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

let hookCarrier, hook, wire;
const craneGroup = new THREE.Group();
scene.add(craneGroup);

loadingManager.onLoad = () => {
  console.log("All models loaded successfully! - main.js:80");
  updateLoadingScreen(false);
  enableActionButtons();

  initializeCrane();

  setupUIEventListeners(
    addCoilWithCrane,
    findAndHighlightCoil,
    placeCoilAt
  );

  startPollingForNewCoils();
};

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
  console.log(`Loading file: ${url}\nLoaded ${itemsLoaded} of ${itemsTotal} files. - main.js:96`);
};

loadingManager.onError = (url) => {
  console.error(`There was an error loading: ${url} - main.js:100`);
  alertUser(`Error loading ${url}. Please check the console.`);
};

loader.load("/warehouse3.glb", (gltf) => {
  scene.add(gltf.scene);
  console.log("Warehouse model loaded. - main.js:106");
  gltf.scene.traverse(function (child) {
    if (child.isMesh) {
      child.receiveShadow = true;
    }
  });
});

loader.load("/steelcoil.glb", (gltf) => {
  coilModelTemplate = gltf.scene;
  coilModelTemplate.scale.set(0.4, 0.4, 0.4);
  console.log("Coil model template loaded. - main.js:117");
});

function placeCoilAt(row, column, layer) {
  if (!coilModelTemplate) {
    alertUser("Coil model template is not loaded yet. Please wait.");
    return;
  }

  const blockRowXZ = Math.floor(row / COILS_PER_BLOCK_COLUMN);
  const blockColXZ = Math.floor(column / COILS_PER_BLOCK_ROW);

  const xPosition = START_X +
    blockColXZ * (COILS_PER_BLOCK_ROW * COIL_SPACING_X + BLOCK_SPACING_X) +
    (column % COILS_PER_BLOCK_ROW) * COIL_SPACING_X;

  const zPosition = START_Z +
    blockRowXZ * (COILS_PER_BLOCK_COLUMN * COIL_SPACING_Z + BLOCK_SPACING_Z) +
    (row % COILS_PER_BLOCK_COLUMN) * COIL_SPACING_Z;

  const yPosition = FLOOR_Y + layer * COIL_HEIGHT_INCREMENT;

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

  newCoil.userData.id = totalCoilCount + 1;
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
      if (child.material.emissive === undefined && child.material.color) {
        child.material.emissive = new THREE.Color(0x000000);
      }
      child.castShadow = true;
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

async function pollAndHandle() {
  if (!isPollingActive) return;

  const hasNewCoil = await checkForNewCoil();
  if (hasNewCoil) {
    showCoilRequestPrompt(
      addCoilWithCrane,
      () => console.log("User chose not to add coil on prompt. - main.js:234")
    );
  }
}

function startPollingForNewCoils() {
  if (isPollingActive) {
    console.log("Polling is already active. - main.js:241");
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
  console.log("Polling for new coils has been stopped. - main.js:261");
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
    startBlinking(foundCoil);
    moveCameraTo(foundCoil);
  } else {
    alertUser(`Coil with ID ${idToFind} not found.`);
  }
}

function initializeCrane() {
  if (!coilModelTemplate) {
    console.error("Crane cannot be initialized: Coil model not loaded yet. - main.js:330");
    return;
  }

  const boom = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.1, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x0099ff })
  );
  boom.position.set(0, CRANE_HEIGHT + 6, 0);
  boom.castShadow = true;
  craneGroup.add(boom);

  hookCarrier = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.4, 0.2),
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
  );
  hookCarrier.position.set(5, CRANE_HEIGHT + 6, 0);
  hookCarrier.castShadow = true;
  craneGroup.add(hookCarrier);

  hook = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x000000 })
  );
  const ropeHeight = 0.2;
  hook.position.set(
    hookCarrier.position.x,
    hookCarrier.position.y - ropeHeight,
    hookCarrier.position.z
  );
  hook.castShadow = true;
  craneGroup.add(hook);

  const wireMaterial = new THREE.LineBasicMaterial({ color: "#e7e7dcff" });
  const wireGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(hookCarrier.position.x, hookCarrier.position.y, hookCarrier.position.z),
    new THREE.Vector3(hook.position.x, hook.position.y, hook.position.z),
  ]);
  wire = new THREE.Line(wireGeometry, wireMaterial);
  craneGroup.add(wire);

  console.log("Crane initialized. - main.js:371");
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
    console.error("Crane parts not initialized for drop animation. - main.js:386");
    return;
  }

  // 🎯 1. Instantly position hook above target (no sideways movement)
  hookCarrier.position.set(targetX, CRANE_HEIGHT + 6, targetZ);
  hook.position.set(targetX, CRANE_HEIGHT + 6, targetZ);
  updateWire();

  // 🎯 2. Start the coil up high above the target
  coil.position.set(targetX, CRANE_HEIGHT + 6, targetZ);

  // 🎯 3. Slowly lower the coil (like a crane pulling it down)
  gsap.to(coil.position, {
    y: targetY,
    duration: 4,         // ⏳ longer duration = slow motion
    ease: "power1.inOut", // smooth start & stop, no bounce
    onUpdate: () => {
      hook.position.y = coil.position.y + 0.3; // keeps hook connected
      updateWire();
    },
    onComplete: () => {
      console.log(`✅ Coil ${coil.userData.id} gently lowered. - main.js:408`);
    }
  });

  // 🎯 4. Optional: hook moves back up after lowering
  gsap.to(hook.position, {
    y: CRANE_HEIGHT + 6,
    duration: 2,
    delay: 4,
    ease: "power1.inOut",
    onUpdate: updateWire,
  });
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function setupCraneGUI() {
  if (typeof GUI === "undefined") {
    console.warn("dat.GUI not found. Crane GUI controls will not be available. - main.js:430");
    return;
  }

  const guiContainer = document.getElementById("gui-container");
  if (!guiContainer) {
    console.error("GUI container not found. Please add a div with id='guicontainer' to your HTML. - main.js:436");
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

  console.log("Crane GUI setup complete. - main.js:516");
}

document.getElementById("addAssetButton").disabled = true;
document.getElementById("searchButton").disabled = true;

updateLoadingScreen(true);

animate();

setupCraneGUI();