// main.js (Modified)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

let coilModelTemplate = null; 
let coilCounter = 0; 

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010); // Thoda aur dark background

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 5, 12); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2); // Thodi strong light
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const gridHelper = new THREE.GridHelper(20, 20); // Grid ko thoda bada kar diya
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(2);
scene.add(axesHelper);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

const loader = new GLTFLoader();

loader.load(
  '/warehouse2.glb',
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1, 1, 1);
    model.position.set(0, 0, 0);
    scene.add(model);
    console.log('Warehouse model loaded. - main.js:53');
  },
  undefined,
  (error) => {
    console.error('Error loading warehouse model: - main.js:57', error);
  }
);

loader.load(
    '/steelcoil.glb', // Make sure you have this file in your public folder
    (gltf) => {
        coilModelTemplate = gltf.scene;
        console.log('Steel coil model template loaded successfully! - main.js:65');
    },
    undefined,
    (error) => {
        console.error('Error loading coil model: - main.js:69', error);
    }
);
function addCoilToScene(apiData) {
    if (!coilModelTemplate) {
        alert("Coil model is not loaded yet. Please wait a moment and try again.");
        return;
    }

    const newCoil = coilModelTemplate.clone();

    const xPosition = -4 + (coilCounter * 2); 
    const yPosition = 0.5; 
    const zPosition = 2;

    newCoil.position.set(xPosition, yPosition, zPosition);

    newCoil.userData.id = apiData.id;
    
    scene.add(newCoil);
    console.log(`New coil with ID ${apiData.id} added at position (${xPosition}, ${yPosition}, ${zPosition}) - main.js:89`);

    coilCounter++;
}
document.getElementById('addAssetButton').addEventListener('click', () => {

    console.log("Simulating API call to create a new asset... - main.js:95");
    
    const fakeApiResponse = {
        success: true,
        data: {
            id: `COIL-${Date.now()}` 
        }
    };

    if (fakeApiResponse.success) {
        addCoilToScene(fakeApiResponse.data);
    }
});


// Responsive resizing
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Render loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();