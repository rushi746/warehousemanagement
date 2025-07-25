// main.js (With more robust API Polling and Notification Handling)

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- Configuration ---
const API_URL = 'http://localhost:3000/api'; 
const POLL_INTERVAL_MS = 5000; // How often to check for new coils (5 seconds)

// --- Loading Manager ---
const loadingManager = new THREE.LoadingManager();
loadingManager.onLoad = () => {
    console.log("All models loaded successfully! - main.js:14");
    
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
    }
    
    document.getElementById('addAssetButton').disabled = false;
    document.getElementById('searchButton').disabled = false;
    
    // Start polling for new coils once everything is ready
    startPollingForNewCoils(); 
};

// --- Global Variables ---
let coilModelTemplate = null; 
let coilCounter = 0; 
let allCoils = []; // Array to store all created coil objects
let blinkingInterval = null; 
let currentlyBlinkingCoil = null; 

// --- NEW: API State Management ---
let isPollingActive = false;
let isNotificationPending = false; // Tracks if a notification is currently being processed (to prevent new ones)
let pollTimer = null; // To hold the setInterval ID for stopping it later

// --- PLACEMENT LOGIC CONSTANTS ---
const COILS_PER_ROW = 16;       
const SPACING_X = 1.0;          
const SPACING_Z = 1.0;          
const START_X = -8.0;           
const START_Z = -11.0;          
const FLOOR_Y = 0.01;           

// --- Scene, Camera, Renderer Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 8, 15); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2); 
directionalLight.position.set(5, 10, 7); 
scene.add(directionalLight);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); 
scene.add(ambientLight);

const gridHelper = new THREE.GridHelper(20, 20); 
scene.add(gridHelper);

const controls = new OrbitControls(camera, renderer.domElement);
controls.update(); 

// --- Loader Setup ---
const loader = new GLTFLoader(loadingManager);

// --- Load Models ---
loader.load('/warehouse3.glb', (gltf) => { 
    scene.add(gltf.scene); 
    console.log("Warehouse model loaded. - main.js:77");
});

loader.load('/steelcoil.glb', (gltf) => {
    coilModelTemplate = gltf.scene; 
    coilModelTemplate.scale.set(0.4, 0.4, 0.4); 
    console.log("Coil model template loaded. - main.js:83");
});

// --- Function to Add a Coil ---
function simpleAddCoil() {
    if (!coilModelTemplate) {
        alert("Coil model template is not loaded yet. Please wait.");
        return;
    }

    const col = coilCounter % COILS_PER_ROW;
    const row = Math.floor(coilCounter / COILS_PER_ROW);

    const xPosition = START_X + (col * SPACING_X);
    const zPosition = START_Z + (row * SPACING_Z);
    
    const newCoil = coilModelTemplate.clone(true); // Deep clone
    newCoil.traverse((child) => {
        if (child.isMesh && child.material) {
            child.material = child.material.clone(); // ✅ Unique material
            if (child.material.emissive === undefined && child.material.color) {
                child.material.emissive = new THREE.Color(0x000000); // Optional: initialize emissive
            }
        }
    });

    newCoil.position.set(xPosition, FLOOR_Y, zPosition);
    
    const coilId = coilCounter + 1;
    newCoil.userData.id = coilId;
    allCoils.push(newCoil);
    
    scene.add(newCoil);
    
    coilCounter++;
    console.log(`Added coil #${coilId}. Row: ${row}, Col: ${col}. Position: (${xPosition.toFixed(2)}, ${FLOOR_Y}, ${zPosition.toFixed(2)}) - main.js:118`);
}


// --- NEW: API Polling and Handling Functions ---

async function checkForNewCoil() {
    if (!isPollingActive) return false; // Don't poll if polling is deactivated

    try {
        const response = await fetch(`${API_URL}/checkForNewCoil`);
        if (!response.ok) {
            console.error(`API Error: ${response.status} ${response.statusText} - main.js:130`);
            return false; // Assume no new coil on error, and continue polling
        }
        const data = await response.json();
        return data.newCoil;
    } catch (error) {
        console.error('Failed to connect to API: - main.js:136', error);
        return false; // Assume no new coil if API is unreachable, and continue polling
    }
}

function showCoilRequestPrompt() {
    if (isNotificationPending) return; // If a notification is already being processed, do nothing

    isNotificationPending = true; // Mark that we are now processing a notification
    console.log("Showing coil request confirmation prompt. - main.js:145");

    const userConfirmed = confirm("A new coil request has been made. Do you want to add it?");

    if (userConfirmed) {
        console.log("User accepted new coil request. - main.js:150");
        simpleAddCoil(); // Add one coil as requested
    } else {
        console.log("User rejected new coil request. - main.js:153");
    }
    
    isNotificationPending = false; 
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
        console.log("Polling is already active. - main.js:170");
        return;
    }
    isPollingActive = true;
    console.log(`Starting to poll for new coils every ${POLL_INTERVAL_MS / 1000} seconds. - main.js:174`);
    
    // Make an immediate check when polling starts
    pollAndHandle(); 
    
    // Set up the interval
    pollTimer = setInterval(pollAndHandle, POLL_INTERVAL_MS);
}

function stopPollingForNewCoils() {
    if (!isPollingActive) return;
    isPollingActive = false;
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    console.log("Polling for new coils has been stopped. - main.js:190");
}


// Stops the blinking effect on any currently highlighted coil.
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

// Makes a specific coil blink by toggling its emissive color.
function startBlinking(coil) {
    let isEmissive = false; 
    currentlyBlinkingCoil = coil; 

    coil.traverse((child) => {
        if (child.isMesh && child.material) {
            if (child.material.emissive !== undefined) {
                child.material.emissive.set(0xffff00); // Set to yellow immediately
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

// Smoothly animates the camera to focus on a target object.
function moveCameraTo(targetObject) {
    const targetPosition = new THREE.Vector3();
    targetObject.getWorldPosition(targetPosition); 

    const controlsTarget = targetPosition.clone();
    const cameraTargetPosition = targetPosition.clone().add(new THREE.Vector3(0, 3, 5)); 

    if (camera.position.distanceTo(cameraTargetPosition) < 0.5) {
        camera.position.copy(cameraTargetPosition);
        controls.target.copy(controlsTarget);
        controls.update();
        return;
    }

    const animateCamera = () => {
        const distance = camera.position.distanceTo(cameraTargetPosition);
        if (distance > 0.1) {
            camera.position.lerp(cameraTargetPosition, 0.05);
            controls.target.lerp(controlsTarget, 0.05);      
            controls.update(); 
            requestAnimationFrame(animateCamera);
        } else {
            camera.position.copy(cameraTargetPosition);
            controls.target.copy(controlsTarget);
            controls.update();
        }
    };
    animateCamera(); 
}

// Handles the search input, finds the coil by ID, and triggers highlighting and camera movement.
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

// --- Event Listeners ---
document.getElementById('addAssetButton').addEventListener('click', () => {
    simpleAddCoil(); 
    // Optional: You might want to pause polling briefly after manual add if you suspect it might
    // confuse a real API notification. For now, we let it continue.
});

document.getElementById('searchButton').addEventListener('click', findAndHighlightCoil);

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate); 
    controls.update(); 
    renderer.render(scene, camera); 
}

// --- Initial setup ---
document.getElementById('addAssetButton').disabled = true;
document.getElementById('searchButton').disabled = true;

animate(); // Start the animation loop