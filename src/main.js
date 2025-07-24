// main.js (With Left-to-Right and 16-per-row logic)

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- Loading Manager ---
const loadingManager = new THREE.LoadingManager();
loadingManager.onLoad = () => {
    console.log("All models loaded successfully! - main.js:10");
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('addAssetButton').disabled = false;
};

// --- Global Variables ---
let coilModelTemplate = null; 
let coilCounter = 0;
let craneModel = null;
let craneHook = null;

// --- (NEW) PLACEMENT LOGIC CONSTANTS ---
// In values ko aap baad mein aasaani se badal sakte hain
const COILS_PER_ROW = 16;
const SPACING_X = 1.0;       // Coils ke beech left-right gap
const SPACING_Z = 1.0;       // Rows ke beech aage-peeche gap
const START_X = -8.0;        // X-axis par kahan se shuru karna hai (Left side)
const START_Z = 1.0;         // Z-axis par pehli row kahan hogi
const FLOOR_Y = 0.01;         // Zameen se height

// --- Scene, Camera, Renderer, etc. (No changes) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 8, 15); // Camera ko thoda upar aur peeche rakha hai taaki sab dikhe
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

// --- Loader with manager ---
const loader = new GLTFLoader(loadingManager);

// --- Load Models (No changes here) ---
loader.load('/warehouse2.glb', (gltf) => { scene.add(gltf.scene); });
loader.load('/steelcoil.glb', (gltf) => {
    coilModelTemplate = gltf.scene;
    coilModelTemplate.scale.set(0.4, 0.4, 0.4); 
});


// --- (UPDATED) SIMPLE ADD FUNCTION WITH NEW LOGIC ---
function simpleAddCoil() {
    if (!coilModelTemplate) {
        alert("Coil ka model template load nahi hua hai.");
        return;
    }

    // 1. Calculate current row and column
    const col = coilCounter % COILS_PER_ROW; // Column (0 se 15 tak)
    const row = Math.floor(coilCounter / COILS_PER_ROW); // Row (0, 1, 2...)

    // 2. Calculate final X and Z position based on row and column
    const xPosition = START_X + (col * SPACING_X);
    const zPosition = START_Z + (row * SPACING_Z);
    
    // 3. Create and place the coil
    const newCoil = coilModelTemplate.clone();
    newCoil.position.set(xPosition, FLOOR_Y, zPosition); 
    scene.add(newCoil);
    
    // 4. Increment the counter for the next coil
    coilCounter++;

    // Helper message in console to see what's happening
    console.log(`Added coil #${coilCounter}. Row: ${row}, Col: ${col}. Position: (${xPosition.toFixed(2)}, ${FLOOR_Y}, ${zPosition.toFixed(2)}) - main.js:83`);
}


// --- Button click listener (No changes) ---
document.getElementById('addAssetButton').addEventListener('click', () => {
    simpleAddCoil(); 
});

// --- Render loop (No changes) ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();