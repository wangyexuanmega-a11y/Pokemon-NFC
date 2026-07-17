/* ─── Creature Config ───
 *   A: { type: 'sprout' }               ← Primitive Sprout (default)
 *   B: { type: 'gltf', url: '...' }     ← glTF/GLB model
 */
const CREATURE_CONFIG = { type: 'gltf', url: 'models/pikachu.glb' };
/* ────────────────────── */

import * as THREE from 'three';
import { buildSprout, loadGLTF, doBlink, wiggleEars, trackMouse, resetPetPose, petWiggle } from './creature.js';

const state = {
  awakened: false, petting: false,
  blinkTimer: 0, nextBlink: 3000 + Math.random() * 3000,
  petCount: 0,
};
let creature = null;
let animTargets = {};

const container = document.getElementById('scene-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.Fog(0x0a0a1a, 8, 18);

const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 30);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0x334466, 0.4);
scene.add(ambientLight);
const mainLight = new THREE.DirectionalLight(0xffeedd, 2.0);
mainLight.position.set(3, 6, 4);
mainLight.castShadow = true;
mainLight.shadow.mapSize.width = 1024;
mainLight.shadow.mapSize.height = 1024;
mainLight.shadow.camera.near = 0.5;
mainLight.shadow.camera.far = 15;
mainLight.shadow.camera.left = -4;
mainLight.shadow.camera.right = 4;
mainLight.shadow.camera.top = 4;
mainLight.shadow.camera.bottom = -4;
scene.add(mainLight);
const fillLight = new THREE.DirectionalLight(0x4488ff, 0.6);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0x00ccff, 0.5);
rimLight.position.set(0, -1, -5);
scene.add(rimLight);
const rimLight2 = new THREE.DirectionalLight(0xff66aa, 0.3);
rimLight2.position.set(-2, 3, -4);
scene.add(rimLight2);

const groundGeom = new THREE.CircleGeometry(4, 48);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x12122a, roughness: 0.9, metalness: 0.1,
  transparent: true, opacity: 0.6, side: THREE.DoubleSide,
});
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.2;
ground.receiveShadow = true;
scene.add(ground);
const ringMat = new THREE.MeshBasicMaterial({
  color: 0x00d4ff, transparent: true, opacity: 0.12,
  side: THREE.DoubleSide, depthWrite: false,
});
const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 64), ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = -1.15;
scene.add(ring);
const ringMat2 = new THREE.MeshBasicMaterial({
  color: 0x00d4ff, transparent: true, opacity: 0.06,
  side: THREE.DoubleSide, depthWrite: false,
});
const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.1, 64), ringMat2);
ring2.rotation.x = -Math.PI / 2;
ring2.position.y = -1.14;
scene.add(ring2);

const bounceMat = new THREE.MeshStandardMaterial({
  color: 0x00d4ff, roughness: 0.2, metalness: 0.3,
  transparent: true, opacity: 0.15,
  emissive: 0x00d4ff, emissiveIntensity: 0.05,
});
const bouncePad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.06, 32), bounceMat);
bouncePad.position.y = -1.2;
bouncePad.receiveShadow = true;
scene.add(bouncePad);

const particleCount = 60;
const particleGeom = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  const theta = Math.random() * Math.PI * 2;
  const r = 1.5 + Math.random() * 4;
  positions[i*3] = Math.cos(theta) * r;
  positions[i*3+1] = -0.8 + Math.random() * 3;
  positions[i*3+2] = Math.sin(theta) * r;
}
particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0x4488ff, size: 0.03, transparent: true, opacity: 0.4,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
});
const particles = new THREE.Points(particleGeom, particleMat);
scene.add(particles);

const mouse = new THREE.Vector2();
document.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    mouse.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
  }
}, { passive: true });

function onResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const isMobile = w < 480;
  camera.position.z = isMobile ? 6.5 : 5.5;
  camera.position.y = isMobile ? 1.5 : 1.2;
  camera.lookAt(0, 0.2, 0);
}
window.addEventListener('resize', onResize);

const tapPrompt = document.getElementById('tap-prompt');
const creatureInfo = document.getElementById('creature-info');
const nfcFlash = document.getElementById('nfc-flash');
const petBtn = document.getElementById('pet-btn');

function handleTap() {
  if (state.awakened) return;
  state.awakened = true;
  nfcFlash.classList.add('active');
  setTimeout(() => nfcFlash.classList.remove('active'), 400);
  tapPrompt.classList.add('hidden');
  revealCreature();
}

function revealCreature() {
  const duration = 1200;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI * 3.5) * (1 - t) * 0.15;
    const s = Math.max(ease, 0.001);
    creature.scale.set(s, s, s);
    creature.position.y = (1 - t) * 2;
    creature.rotation.y = t * Math.PI * 2;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      creature.scale.set(1, 1, 1);
      creature.position.y = 0;
      creature.rotation.y = 0;
      setTimeout(() => creatureInfo.classList.add('visible'), 400);
    }
  }
  step(performance.now());
}

document.addEventListener('click', (e) => { if (!state.awakened) handleTap(); });
document.addEventListener('touchstart', (e) => { if (!state.awakened) handleTap(); }, { passive: true });
petBtn.addEventListener('click', (e) => { e.stopPropagation(); petCreature(); });

function petCreature() {
  state.petting = true;
  state.petCount++;
  const jumpHeight = 0.2 + Math.min(state.petCount * 0.05, 0.3);
  const duration = 500;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    creature.position.y = Math.sin(t * Math.PI) * jumpHeight;
    creature.rotation.z = Math.sin(t * Math.PI * 2) * 0.05;
    petWiggle(animTargets, t);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      creature.position.y = 0;
      creature.rotation.z = 0;
      resetPetPose(animTargets);
      state.petting = false;
    }
  }
  step(performance.now());
  burstParticles();
}

function burstParticles() {
  const count = 20;
  const burstGeom = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = [];
  for (let i = 0; i < count; i++) {
    pos[i*3] = (Math.random() - 0.5) * 0.5;
    pos[i*3+1] = Math.random() * 0.5;
    pos[i*3+2] = (Math.random() - 0.5) * 0.5;
    vel.push({ x: (Math.random() - 0.5) * 0.04, y: Math.random() * 0.06 + 0.02, z: (Math.random() - 0.5) * 0.04 });
  }
  burstGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const burstMat = new THREE.PointsMaterial({
    color: 0xffd700, size: 0.05, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const burst = new THREE.Points(burstGeom, burstMat);
  burst.position.copy(creature.position);
  burst.position.y += 0.3;
  scene.add(burst);
  const start = performance.now();
  function step(now2) {
    const t = (now2 - start) / 1000;
    if (t > 1.5) { scene.remove(burst); burst.geometry.dispose(); burst.material.dispose(); return; }
    const p = burst.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      p[i*3] += vel[i].x; p[i*3+1] += vel[i].y; p[i*3+2] += vel[i].z;
      vel[i].y -= 0.001;
    }
    burst.geometry.attributes.position.needsUpdate = true;
    burst.material.opacity = 1 - t / 1.5;
    requestAnimationFrame(step);
  }
  step(performance.now());
}

function init() {
  creature = CREATURE_CONFIG.type === 'sprout' ? buildSprout() : null;
  if (CREATURE_CONFIG.type === 'gltf') {
    loadGLTF(CREATURE_CONFIG.url).then(m => {
      creature = m;
      animTargets = creature.userData.animTargets || {};
      creature.scale.set(0.001, 0.001, 0.001);
      scene.add(creature);
    }).catch(e => {
      console.warn('glTF load failed, using Sprout:', e);
      creature = buildSprout();
      animTargets = creature.userData.animTargets || {};
      creature.scale.set(0.001, 0.001, 0.001);
      scene.add(creature);
    });
  } else {
    creature = buildSprout();
    animTargets = creature.userData.animTargets || {};
    creature.scale.set(0.001, 0.001, 0.001);
    scene.add(creature);
  }

  onResize();

  setTimeout(() => {
    document.getElementById('loading-screen').classList.add('hidden');
  }, 800);
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  if (!creature) return;
  const dt = clock.getDelta();
  const time = clock.getElapsedTime();
  if (state.awakened && !state.petting) {
    const breath = Math.sin(time * 1.5) * 0.015;
    creature.position.y = breath;
    creature.rotation.z = Math.sin(time * 0.8) * 0.01;
    creature.rotation.x = Math.sin(time * 0.6 + 1) * 0.008;
    const targetX = mouse.x * 0.08;
    creature.rotation.y += (targetX - creature.rotation.y) * 0.02;
    trackMouse(animTargets, mouse.x, mouse.y);
    state.blinkTimer += dt * 1000;
    if (state.blinkTimer >= state.nextBlink) {
      doBlink(creature);
      state.blinkTimer = 0;
      state.nextBlink = 3000 + Math.random() * 4000;
    }
    if (creature.userData.type === 'sprout') {
      const t = animTargets;
      t.tail.rotation.x = 0.6 + Math.sin(time * 3) * 0.15;
      t.tailTip.position.x = Math.sin(time * 3) * 0.02;
      t.leftArm.rotation.x = 0.3 + Math.sin(time * 1.2) * 0.04;
      t.rightArm.rotation.x = 0.3 - Math.sin(time * 1.2) * 0.04;
      wiggleEars(animTargets, time);
    }
  }
  const pos = particles.geometry.attributes.position.array;
  for (let i = 0; i < particleCount; i++) {
    pos[i*3+1] += Math.sin(time + i) * 0.0003;
    pos[i*3] += Math.sin(time * 0.5 + i * 0.7) * 0.00015;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  ring.material.opacity = 0.08 + Math.sin(time * 0.8) * 0.04;
  renderer.render(scene, camera);
}

init();
animate();

const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
if (isMobile) {
  setTimeout(() => { if (!state.awakened) handleTap(); }, 2000);
}
