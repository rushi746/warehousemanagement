// import * as THREE from 'three';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
// import { GUI } from 'three/examples/jsm/libs/dat.gui.module';
// import gsap from 'gsap';
// 
// // Scene Setup
// const scene = new THREE.Scene();
// scene.background = new THREE.Color(0xdce3f2);
// 
// // Camera
// const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
// camera.position.set(15, 15, 20);
// 
// // Renderer
// const renderer = new THREE.WebGLRenderer({ antialias: true });
// renderer.setSize(window.innerWidth, window.innerHeight);
// document.body.appendChild(renderer.domElement);
// 
// // Controls
// const controls = new OrbitControls(camera, renderer.domElement);
// controls.enableDamping = true;
// 
// // Lights
// const light = new THREE.DirectionalLight(0xffffff, 1);
// light.position.set(10, 20, 10);
// scene.add(light);
// scene.add(new THREE.AmbientLight(0x404040));
// 
// // Floor (Warehouse Ground)
// const floor = new THREE.Mesh(
//   new THREE.PlaneGeometry(50, 50),
//   new THREE.MeshStandardMaterial({ color: 0x888888 })
// );
// floor.rotation.x = -Math.PI / 2;
// scene.add(floor);
// 
// // Crane Base
// const base = new THREE.Mesh(
//   new THREE.BoxGeometry(4, 1, 4),
//   new THREE.MeshStandardMaterial({ color: 0x333333 })
// );
// base.position.y = 0.5;
// scene.add(base);
// 
// // Tower
// const towerHeight = 3;
// const tower = new THREE.Mesh(
//   new THREE.BoxGeometry(1, towerHeight, 1),
//   new THREE.MeshStandardMaterial({ color: 0xffaa00 })
// );
// tower.position.set(0, towerHeight / 2 + 0.5, 0);
// 
// 
// // Boom
// const boom = new THREE.Mesh(
//   new THREE.BoxGeometry(10, 0.5, 0.5),
//   new THREE.MeshStandardMaterial({ color: 0x0099ff })
// );
// boom.position.set(5, 10.5, 0);
// scene.add(boom);
// 
// // Hook Carrier
// const hookCarrier = new THREE.Mesh(
//   new THREE.BoxGeometry(0.5, 0.5, 0.5),
//   new THREE.MeshStandardMaterial({ color: 0xff0000 })
// );
// hookCarrier.position.set(5, 10, 0);
// scene.add(hookCarrier);
// 
// // Wire (line from boom to hook)
// const wireMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
// const wireGeometry = new THREE.BufferGeometry().setFromPoints([
//   new THREE.Vector3(hookCarrier.position.x, hookCarrier.position.y, 0),
//   new THREE.Vector3(hookCarrier.position.x, hookCarrier.position.y - 2, 0),
// ]);
// let wire = new THREE.Line(wireGeometry, wireMaterial);
// scene.add(wire);
// 
// // Hook
// const hook = new THREE.Mesh(
//   new THREE.BoxGeometry(0.3, 0.3, 0.3),
//   new THREE.MeshStandardMaterial({ color: 0x000000 })
// );
// hook.position.set(hookCarrier.position.x, hookCarrier.position.y - 2, 0);
// scene.add(hook);
// 
// // Box to Pick
// const box = new THREE.Mesh(
//   new THREE.BoxGeometry(1, 1, 1),
//   new THREE.MeshStandardMaterial({ color: 0x00ff00 })
// );
// box.position.set(10, 0.5, 0);
// scene.add(box);
// 
// // Animation using GSAP
// function animateCrane() {
//   // Move hook carrier to above the box
//   gsap.to(hookCarrier.position, {
//     x: box.position.x,
//     duration: 2,
//     onUpdate: updateWire
//   });
// 
//   // Drop hook down
//   gsap.to(hook.position, {
//     y: 0.8,
//     duration: 2,
//     delay: 2,
//     onUpdate: updateWire
//   });
// 
//   // Attach box and lift
//   gsap.to(hook.position, {
//     y: 8,
//     duration: 2,
//     delay: 4,
//     onUpdate: () => {
//       box.position.y = hook.position.y - 0.3;
//       updateWire();
//     }
//   });
// 
//   // Move hook + box back to crane base
//   gsap.to(hookCarrier.position, {
//     x: 0,
//     duration: 2,
//     delay: 6,
//     onUpdate: () => {
//       hook.position.x = hookCarrier.position.x;
//       box.position.x = hook.position.x;
//       updateWire();
//     }
//   });
// 
//   // Drop the box
//   gsap.to(hook.position, {
//     y: 0.8,
//     duration: 2,
//     delay: 8,
//     onUpdate: () => {
//       box.position.y = hook.position.y - 0.3;
//       updateWire();
//     }
//   });
// }
// 
// function updateWire() {
//   const points = [
//     new THREE.Vector3(hookCarrier.position.x, hookCarrier.position.y, 0),
//     new THREE.Vector3(hook.position.x, hook.position.y, 0),
//   ];
//   wire.geometry.setFromPoints(points);
// }
// 
// // Animate Loop
// function animate() {
//   requestAnimationFrame(animate);
//   controls.update();
//   renderer.render(scene, camera);
// }
// 
// animate();
// animateCrane();
// 
// // Responsive
// window.addEventListener('resize', () => {
//   camera.aspect = window.innerWidth / window.innerHeight;
//   camera.updateProjectionMatrix();
//   renderer.setSize(window.innerWidth, window.innerHeight);
// });
