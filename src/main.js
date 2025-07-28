import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import gsap from 'gsap';

const API_URL = 'http://localhost:3000/api';
const POLL_INTERVAL_MS = 5000;

// --- Coil Placement Constants ---
// Dimensions of a single "block" of coils
const COILS_PER_BLOCK_ROW = 2;        // Coils along the X-axis within a block
const COILS_PER_BLOCK_COLUMN = 5;     // Coils along the Z-axis within a block
const COILS_PER_BLOCK_HEIGHT = 3;     // Coils stacked vertically within a block

// Arrangement of blocks in the XZ plane
const BLOCKS_PER_ROW_XZ = 4;          // How many blocks to place side-by-side horizontally

// Spacing
const COIL_SPACING_X = 0.8;           // Spacing between coils within a block (along X)
const COIL_SPACING_Z = 0.8;           // Spacing between coils within a block (along Z)
const COIL_HEIGHT_INCREMENT = 0.5;    // Vertical space each coil occupies

const BLOCK_SPACING_X = 2.5;          // Spacing between the 3 blocks placed horizontally
const BLOCK_SPACING_Z = 1.0;          // Spacing between rows of blocks in the Z direction

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

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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
    console.log("All models loaded successfully! - main.js:71");

    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }

    document.getElementById('addAssetButton').disabled = false;
    document.getElementById('searchButton').disabled = false;

    startPollingForNewCoils();
    initializeCrane(); // Crane initialization happens here
    setupCraneGUI();
};

loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
    console.log(`Loading file: ${url}\nLoaded ${itemsLoaded} of ${itemsTotal} files. - main.js:87`);
};

loadingManager.onError = (url) => {
    console.error(`There was an error loading: ${url} - main.js:91`);
};

loader.load('/warehouse3.glb', (gltf) => {
    scene.add(gltf.scene);
    console.log("Warehouse model loaded. - main.js:96");
    gltf.scene.traverse(function (child) {
        if (child.isMesh) {
            child.receiveShadow = true;
        }
    });
});

loader.load('/steelcoil.glb', (gltf) => {
    coilModelTemplate = gltf.scene;
    coilModelTemplate.scale.set(0.4, 0.4, 0.4);
    console.log("Coil model template loaded. - main.js:107");
});

// --- UPDATED COIL PLACEMENT LOGIC ---
function addCoilWithCrane() {
    if (!coilModelTemplate) {
        alert("Coil model template is not loaded yet. Please wait.");
        return;
    }

    // --- Calculate the position based on the new block-based layout ---
    const currentTotalCoils = totalCoilCount;

    // 1. Determine which block this coil belongs to
    const coilsPerFullBlock = COILS_PER_BLOCK_ROW * COILS_PER_BLOCK_COLUMN * COILS_PER_BLOCK_HEIGHT;
    const blockIndexTotal = Math.floor(currentTotalCoils / coilsPerFullBlock);

    // 2. Determine the position within the current block (row, column, layer)
    // First, find the index of the coil relative to the start of its block.
    const coilIndexWithinBlockStart = currentTotalCoils % coilsPerFullBlock;

    // Now, break this down into XZ plane and Y layer within the block.
    const coilsPerXZPlaneInBlock = COILS_PER_BLOCK_ROW * COILS_PER_BLOCK_COLUMN;
    const coilLayerInBlock = Math.floor(coilIndexWithinBlockStart / coilsPerXZPlaneInBlock); // Layer within the block (0 to COILS_PER_BLOCK_HEIGHT - 1)

    const coilIndexInXZPlane = coilIndexWithinBlockStart % coilsPerXZPlaneInBlock;
    const coilColInBlock = coilIndexInXZPlane % COILS_PER_BLOCK_ROW;          // 0 or 1 for X position within block
    const coilRowInBlock = Math.floor(coilIndexInXZPlane / COILS_PER_BLOCK_ROW); // 0 or 1 for Z position within block

    // 3. Determine which block to place it in, based on BLOCKS_PER_ROW_XZ
    const blockRowXZ = Math.floor(blockIndexTotal / BLOCKS_PER_ROW_XZ);     // Which "row" of blocks we are in (along Z)
    const blockColXZ = blockIndexTotal % BLOCKS_PER_ROW_XZ;               // Which "column" of blocks we are in (along X)

    // 4. Calculate the final X, Y, Z positions
    // X position: START_X -> (Spacing for blocks in X) -> (Spacing for coils within block in X)
    const xPosition = START_X +
                      (blockColXZ * (COILS_PER_BLOCK_ROW * COIL_SPACING_X + BLOCK_SPACING_X)) + // Spacing for blocks in X
                      (coilColInBlock * COIL_SPACING_X);                                      // Spacing for coils within block

    // Z position: START_Z -> (Spacing for blocks in Z) -> (Spacing for coils within block in Z)
    const zPosition = START_Z +
                      (blockRowXZ * (COILS_PER_BLOCK_COLUMN * COIL_SPACING_Z + BLOCK_SPACING_Z)) + // Spacing for blocks in Z
                      (coilRowInBlock * COIL_SPACING_Z);                                          // Spacing for coils within block

    // Y position: Stacked within the block's height
    const yPosition = FLOOR_Y + (coilLayerInBlock * COIL_HEIGHT_INCREMENT);

    // --- Clone coil model and set properties ---
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

    // --- Call the existing crane animation with the new target positions ---
    // The animateCraneDrop function will handle positioning the crane components
    // to place the coil at `xPosition`, `yPosition`, `zPosition`.
    animateCraneDrop(newCoil, xPosition, zPosition, yPosition);

    totalCoilCount++; // Increment the total count after adding

    console.log(`Coil #${newCoil.userData.id} going to (${xPosition.toFixed(2)}, ${yPosition.toFixed(2)}, ${zPosition.toFixed(2)}). - main.js:177`);
}

// --- Rest of your existing functions (checkForNewCoil, showCoilRequestPrompt, pollAndHandle, startPollingForNewCoils, stopPollingForNewCoils, stopBlinking, startBlinking, moveCameraTo, findAndHighlightCoil) ---
// These functions should work as they are. They operate on the `allCoils` array and user interactions.
// They do NOT need to be changed for the new coil placement logic.

async function checkForNewCoil() {
    if (!isPollingActive) return false;

    try {
        const response = await fetch(`${API_URL}/checkForNewCoil`);
        if (!response.ok) {
            console.error(`API Error: ${response.status} ${response.statusText} - main.js:190`);
            return false;
        }
        const data = await response.json();
        return data.newCoil;
    } catch (error) {
        console.error('Failed to connect to API: - main.js:196', error);
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
        console.error("Could not find DOM elements for coil dialog. - main.js:211");
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
        console.log("User accepted new coil request. - main.js:226");
        addCoilWithCrane();
        cleanUp();
    };

    const onReject = () => {
        console.log("User rejected new coil request. - main.js:232");
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
        console.log("Polling is already active. - main.js:251");
        return;
    }
    isPollingActive = true;
    console.log(`Starting to poll for new coils every ${POLL_INTERVAL_MS / 1000} seconds. - main.js:255`);

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
    console.log("Polling for new coils has been stopped. - main.js:269");
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
    const cameraTargetPosition = targetPosition.clone().add(new THREE.Vector3(0, 3, 5));

    if (camera.position.distanceTo(cameraTargetPosition) < 0.5 && controls.target.distanceTo(controlsTarget) < 0.1) {
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
        }
    });
}

function findAndHighlightCoil() {
    stopBlinking();

    const searchInput = document.getElementById('searchInput');
    const idToFind = parseInt(searchInput.value);

    if (isNaN(idToFind)) {
        alert("Please enter a valid Coil ID (a number).");
        return;
    }

    const foundCoil = allCoils.find(coil => coil.userData.id === idToFind);

    if (foundCoil) {
        startBlinking(foundCoil);
        moveCameraTo(foundCoil);
    } else {
        alert(`Coil with ID ${idToFind} not found.`);
    }
}

document.getElementById('addAssetButton')?.addEventListener('click', () => {
    addCoilWithCrane();
});

document.getElementById('searchButton')?.addEventListener('click', () => {
    findAndHighlightCoil();
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// --- CRANE CODE (PRESERVED FROM YOUR ORIGINAL) ---
let hookCarrier, hook, wire;
const craneGroup = new THREE.Group(); // This group will hold the crane parts and will be rotated.
scene.add(craneGroup);

function initializeCrane() {
    if (!coilModelTemplate) {
        console.error("Crane cannot be initialized: Coil model not loaded yet. - main.js:388");
        return;
    }

    // Boom of the crane
    const boom = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.1, 0.1), // Length, Width, Height of the boom
        new THREE.MeshStandardMaterial({ color: 0x0099ff })
    );
    // Position the boom's pivot point. This is where the boom will rotate from.
    // We'll set it slightly behind the desired center of rotation for the crane.
    boom.position.set(0, CRANE_HEIGHT + 6, 0); // X, Y, Z position of the boom's pivot point
    boom.castShadow = true;
    craneGroup.add(boom); // Add boom to the crane group

    // Hook carrier - the part that moves along the boom
    hookCarrier = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.1, 0.1), // Size of the hook carrier
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    // Initial position of the hook carrier at the end of the boom.
    // This is relative to the boom's pivot point.
    // The boom extends from its pivot, so the carrier is at the end of this extension.
    hookCarrier.position.set(5, CRANE_HEIGHT + 6, 0); // X, Y, Z position relative to the crane group's origin
    hookCarrier.castShadow = true;
    craneGroup.add(hookCarrier); // Add hook carrier to the crane group

    // The hook itself
    hook = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1), // Size of the hook
        new THREE.MeshStandardMaterial({ color: 0x000000 })
    );
    // Initial position of the hook, hanging below the hook carrier.
    const ropeHeight = 1.5; // Reduced height of the rope/wire for the hook
    hook.position.set(hookCarrier.position.x, hookCarrier.position.y - ropeHeight, hookCarrier.position.z); // Set hook position relative to hook carrier
    hook.castShadow = true;
    craneGroup.add(hook); // Add hook to the crane group

    // Wire connecting the hook carrier to the hook
    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x000000 }); // Color of the wire
    const wireGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(hookCarrier.position.x, hookCarrier.position.y, hookCarrier.position.z), // Start point of the wire (at hook carrier)
        new THREE.Vector3(hook.position.x, hook.position.y, hook.position.z), // End point of the wire (at hook)
    ]);
    wire = new THREE.Line(wireGeometry, wireMaterial);
    craneGroup.add(wire); // Wire is added to craneGroup so it moves with crane components

    console.log("Crane initialized. - main.js:435");
}

function updateWire() {
    if (hookCarrier && hook && wire) {
        // Positions are relative to craneGroup's origin, so they are already correct for the wire geometry
        const points = [
            new THREE.Vector3(hookCarrier.position.x, hookCarrier.position.y, hookCarrier.position.z),
            new THREE.Vector3(hook.position.x, hook.position.y, hook.position.z),
        ];
        wire.geometry.setFromPoints(points);
    }
}

function animateCraneDrop(coil, targetX, targetZ, targetY) {
    if (!hookCarrier || !hook) {
        console.error("Crane parts not initialized for drop animation. - main.js:451");
        return;
    }

    const pullingMachineHeight = CRANE_HEIGHT + 10; // Represents the upper limit of the crane's vertical movement.
    const ropeHeight = 1.5; // Reduced height of the rope/wire for the hook.

    // Initial positioning of crane components before the drop animation.
    // Move hook carrier to the target horizontal position, and a high vertical position.
    hookCarrier.position.set(targetX, pullingMachineHeight, targetZ);

    // Position hook below the carrier, considering the reduced rope height.
    hook.position.set(hookCarrier.position.x, hookCarrier.position.y - ropeHeight, hookCarrier.position.z);

    // Place the coil just below the hook, maintaining a small gap.
    coil.position.set(hook.position.x, hook.position.y - 0.3, hook.position.z);

    updateWire(); // Update the wire to reflect these initial positions.

    const dropY = FLOOR_Y + 0.0; // The final resting Y position for the coil on the floor.

    // Animation 1: Move the hook carrier horizontally to the target X and Z coordinates.
    // This implicitly moves the boom as the carrier travels along it.
    gsap.to(hookCarrier.position, {
        x: targetX, // Target X
        z: targetZ, // Target Z
        duration: 2, // Duration of the horizontal movement
        ease: 'power1.inOut', // Easing function for smooth motion
        onUpdate: () => {
            updateWire(); // Keep the wire updated as the carrier moves.
            // Synchronize the hook's horizontal position with the carrier.
            hook.position.x = hookCarrier.position.x;
            hook.position.z = hookCarrier.position.z;
            // Synchronize the coil's horizontal position with the hook.
            // This ensures the coil moves with the hook during the drop.
            coil.position.x = hook.position.x;
            coil.position.z = hook.position.z;
        }
    });

    // Animation 2: Lower the hook (and the attached coil) to the target drop height.
    gsap.to(hook.position, {
        y: targetY + 0.3, // drop coil to correct height
        duration: 2, // Duration of the lowering.
        delay: 2, // Start this animation after the horizontal movement completes.
        ease: 'power1.inOut', // Easing function.
        onUpdate: () => {
            updateWire(); // Keep the wire updated.
            // Move the coil along with the hook.
            coil.position.set(hook.position.x, hook.position.y - 0.3, hook.position.z);
        }
    });

    // Animation 3: After dropping, lift the hook carrier to clear the coil.
    gsap.delayedCall(4.2, () => { // Trigger after the lowering animation has finished (2s + 2s + small buffer).
        updateWire(); // Final update of the wire at the lowered position.
        // Lift the hook carrier vertically.
        gsap.to(hookCarrier.position, {
            y: hookCarrier.position.y + 3, // Lift by 3 units.
            duration: 1, // Duration of the lift.
            ease: 'power1.inOut', // Easing function.
            onUpdate: () => {
                // Make the hook follow the carrier as it lifts.
                hook.position.y = hookCarrier.position.y;
                updateWire(); // Keep wire updated.
            },
            onComplete: () => {
                console.log(`Coil ${coil.userData.id} dropped at (${targetX.toFixed(2)}, ${FLOOR_Y}, ${targetZ.toFixed(2)}). - main.js:518`);
                // The coil is now at its final resting place.
            }
        });
    });
}

let craneGUIFolder;

function setupCraneGUI() {
    if (typeof GUI === 'undefined') {
        console.warn("dat.GUI not found. Crane GUI controls will not be available. - main.js:529");
        return;
    }

    const guiContainer = document.getElementById('gui-container');
    if (!guiContainer) {
        console.error("GUI container not found. Please add a div with id='guicontainer' to your extension's HTML. - main.js:535");
        return;
    }

    const gui = new GUI({ autoPlace: false });
    guiContainer.appendChild(gui.domElement);

    craneGUIFolder = gui.addFolder('Crane Controls');

    const craneControls = {
        pickedCoilIndex: 0, // Index of the coil to be picked up from the `allCoils` array
        boomRotationZ: 0, // Controls the Z rotation of the boom (for moving in XZ plane)
        pickupCoil: function() { // Function triggered by the GUI button
            if (allCoils.length === 0) {
                alert("No coils available to pick up.");
                return;
            }
            // Ensure the selected index is valid
            const maxIndex = Math.max(0, allCoils.length - 1);
            this.pickedCoilIndex = Math.min(this.pickedCoilIndex, maxIndex);

            // Get the coil to be picked
            const coilToPick = allCoils[this.pickedCoilIndex];
            // Store its current position to know where to animate the drop back to
            const pickupPositionX = coilToPick.position.x;
            const pickupPositionZ = coilToPick.position.z;
            const pickupPositionY = coilToPick.position.y; // Important for the drop animation

            // Remove the coil from the list as it's now being "handled" by the crane
            const pickedIndex = this.pickedCoilIndex;
            allCoils.splice(pickedIndex, 1);

            // Move the camera to focus on the coil being picked
            moveCameraTo(coilToPick);
            // Start the animation sequence to pick up and then drop the coil
            animateCraneDrop(coilToPick, pickupPositionX, pickupPositionZ, pickupPositionY);
        },
        rotateBoom: function() {
            // The crane group will be rotated around the Y axis.
            // This rotation affects the orientation of the boom and the hook carrier.
            // We need to update the hook carrier's position relative to the rotated boom.
            craneGroup.rotation.y = this.boomRotationZ; // Apply rotation to the crane group

            // Recalculate hook carrier position based on the boom's length and the group's rotation.
            // The boom's pivot is at the crane group's origin (0, CRANE_HEIGHT + 6, 0).
            // The boom itself extends outwards. The hook carrier is at the end of this extension.
            const boomPivotOffset = new THREE.Vector3(0, CRANE_HEIGHT + 6, 0); // Pivot relative to craneGroup origin
            const distanceAlongBoom = 5; // The 'length' of the boom where the carrier is located from its pivot.

            const angleInRadians = craneGroup.rotation.y; // Get the current rotation of the crane group.

            // Calculate the hook carrier's new X and Z position based on the angle.
            // The boom extends along its local X-axis. When the group rotates around Y, this X-axis sweeps in the XZ plane.
            // The carrier's position is relative to the craneGroup origin.
            const newCarrierX = boomPivotOffset.x + Math.cos(angleInRadians) * distanceAlongBoom;
            const newCarrierZ = boomPivotOffset.z + Math.sin(angleInRadians) * distanceAlongBoom;

            // Update the hook carrier's position. Its Y position remains the same for now (unless telescoping is added).
            hookCarrier.position.set(newCarrierX, hookCarrier.position.y, newCarrierZ);

            // Update the hook and wire to follow the new hookCarrier position.
            hook.position.x = hookCarrier.position.x;
            hook.position.z = hookCarrier.position.z;
            updateWire();
        }
    };

    // GUI control for selecting which coil to pick
    craneGUIFolder.add(craneControls, 'pickedCoilIndex', 0, 100).name('Coil Index').step(1).onChange((value) => {
        const maxIndex = Math.max(0, allCoils.length - 1);
        craneControls.pickedCoilIndex = Math.min(Math.max(0, value), maxIndex);
    });
    // Slider to control the boom's rotation around the Y axis (for moving in XZ plane)
    // We'll control the rotation of the craneGroup itself, which affects the boom's orientation.
    craneGUIFolder.add(craneControls, 'boomRotationZ', -Math.PI / 2, Math.PI / 2).name('Boom Rotation (XZ)').step(0.01).onChange(craneControls.rotateBoom);
    // Button to trigger the pickup and drop action
    craneGUIFolder.add(craneControls, 'pickupCoil').name('Pick & Drop Coil');
    craneGUIFolder.open(); // Expand the folder by default

    console.log("Crane GUI setup complete. - main.js:614");
}

document.getElementById('addAssetButton').disabled = true; // Disable button until models are loaded
document.getElementById('searchButton').disabled = true; // Disable button until models are loaded

animate(); // Start the main animation loop