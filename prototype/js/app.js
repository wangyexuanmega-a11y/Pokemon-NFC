import * as THREE from 'three';

const state = {
  awakened: false,
  petting: false,
  blinkTimer: 0,
  nextBlink: 3000 + Math.random() * 3000,
  lookTarget: new THREE.Vector3(0, 0.3, 0),
  petCount: 0,
};

const container = document.getElementById('scene-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.Fog(0x0a0a1a, 8, 18);

const camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 30);
camera.position.set(0, 1.2, 5.5);
camera.lookAt(0, 0.2, 0);

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
  color: 0x12122a,
  roughness: 0.9,
  metalness: 0.1,
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide,
});
const ground = new THREE.Mesh(groundGeom, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.2;
ground.receiveShadow = true;
scene.add(ground);

const ringMat = new THREE.MeshBasicMaterial({
  color: 0x00d4ff,
  transparent: true,
  opacity: 0.12,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.7, 64), ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = -1.15;
scene.add(ring);
const ringMat2 = new THREE.MeshBasicMaterial({
  color: 0x00d4ff,
  transparent: true,
  opacity: 0.06,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.1, 64), ringMat2);
ring2.rotation.x = -Math.PI / 2;
ring2.position.y = -1.14;
scene.add(ring2);

const particleCount = 60;
const particleGeom = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const sizes = new Float32Array(particleCount);
for (let i = 0; i < particleCount; i++) {
  const theta = Math.random() * Math.PI * 2;
  const r = 1.5 + Math.random() * 4;
  positions[i*3] = Math.cos(theta) * r;
  positions[i*3+1] = -0.8 + Math.random() * 3;
  positions[i*3+2] = Math.sin(theta) * r;
  sizes[i] = 0.02 + Math.random() * 0.06;
}
particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
const particleMat = new THREE.PointsMaterial({
  color: 0x4488ff,
  size: 0.03,
  transparent: true,
  opacity: 0.4,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});
const particles = new THREE.Points(particleGeom, particleMat);
scene.add(particles);

const creature = new THREE.Group();
const bodyMat = new THREE.MeshStandardMaterial({
  color: 0xf5e6ca, roughness: 0.35, metalness: 0.05,
});
const bodyMatDark = new THREE.MeshStandardMaterial({
  color: 0xe8d5b0, roughness: 0.35, metalness: 0.05,
});
const eyeWhiteMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.1, metalness: 0.0,
});
const pupilMat = new THREE.MeshStandardMaterial({
  color: 0x2c1810, roughness: 0.3, metalness: 0.2,
});
const cheekMat = new THREE.MeshStandardMaterial({
  color: 0xff9eaa, roughness: 0.4, metalness: 0.0,
});
const innerEarMat = new THREE.MeshStandardMaterial({
  color: 0xffb5c2, roughness: 0.4, metalness: 0.0,
});
const highlightMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.0, metalness: 0.0,
});

const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 24), bodyMat);
body.scale.set(1, 0.9, 0.85);
body.position.y = 0.2;
body.castShadow = true;
creature.add(body);
const belly = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), bodyMatDark);
belly.scale.set(1, 0.8, 0.4);
belly.position.set(0, -0.05, 0.7);
creature.add(belly);

const heartMat = new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.3 });
const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), heartMat);
h1.position.set(-0.07, 0.02, 0.98);
creature.add(h1);
const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), heartMat);
h2.position.set(0.07, 0.02, 0.98);
creature.add(h2);
const h3 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.1, 3), heartMat);
h3.position.set(0, -0.04, 0.98);
h3.rotation.x = Math.PI;
creature.add(h3);

const tuftMat = new THREE.MeshStandardMaterial({ color: 0xe8d5b0, roughness: 0.4 });
for (let i = 0; i < 3; i++) {
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), tuftMat);
  t.position.set(-0.08 + i * 0.08, 0.98, 0);
  t.rotation.z = (i - 1) * 0.25;
  creature.add(t);
}

function createEar(x) {
  const ear = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), bodyMat);
  outer.scale.set(1, 1, 0.7);
  ear.add(outer);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), innerEarMat);
  inner.scale.set(1, 1, 0.6);
  inner.position.set(0, 0.02, 0.14);
  ear.add(inner);
  ear.position.set(x * 0.48, 0.78, 0);
  ear.rotation.z = -x * 0.3;
  ear.rotation.x = -0.15;
  return ear;
}
const leftEar = createEar(-1);
const rightEar = createEar(1);
creature.add(leftEar);
creature.add(rightEar);

const leftEye = new THREE.Group();
const eyeWhiteL = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 20), eyeWhiteMat);
eyeWhiteL.scale.set(1, 1.1, 0.6);
leftEye.add(eyeWhiteL);
const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), pupilMat);
pupilL.scale.set(0.8, 0.9, 0.5);
pupilL.position.set(0, 0, 0.16);
leftEye.add(pupilL);
const hlL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), highlightMat);
hlL.position.set(0.05, 0.05, 0.24);
leftEye.add(hlL);
leftEye.position.set(-0.3, 0.38, 0.78);
creature.add(leftEye);

const rightEye = new THREE.Group();
const eyeWhiteR = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 20), eyeWhiteMat);
eyeWhiteR.scale.set(1, 1.1, 0.6);
rightEye.add(eyeWhiteR);
const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), pupilMat);
pupilR.scale.set(0.8, 0.9, 0.5);
pupilR.position.set(0, 0, 0.16);
rightEye.add(pupilR);
const hlR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), highlightMat);
hlR.position.set(0.05, 0.05, 0.24);
rightEye.add(hlR);
rightEye.position.set(0.3, 0.38, 0.78);
creature.add(rightEye);

const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), cheekMat);
cheekL.scale.set(1.2, 0.9, 0.5);
cheekL.position.set(-0.45, 0.2, 0.78);
creature.add(cheekL);
const cheekR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), cheekMat);
cheekR.scale.set(1.2, 0.9, 0.5);
cheekR.position.set(0.45, 0.2, 0.78);
creature.add(cheekR);

const mouthMat = new THREE.MeshStandardMaterial({ color: 0x8b6f5e, roughness: 0.5 });
const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.025, 8, 12, Math.PI), mouthMat);
mouth.position.set(0, 0.12, 0.88);
mouth.rotation.x = -0.2;
creature.add(mouth);
const smileMat = new THREE.MeshStandardMaterial({ color: 0x8b6f5e, roughness: 0.5 });
const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 12, Math.PI), smileMat);
smile.position.set(0, 0.06, 0.92);
smile.rotation.x = -0.4;
creature.add(smile);

function createArm(x, z) {
  const arm = new THREE.Group();
  const armSeg = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), bodyMat);
  armSeg.scale.set(0.8, 1.2, 0.8);
  arm.add(armSeg);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), bodyMatDark);
  hand.position.set(0, -0.15, 0);
  arm.add(hand);
  arm.position.set(x * 0.85, 0.15, z * 0.3);
  arm.rotation.x = 0.3;
  arm.rotation.z = x * 0.4;
  return arm;
}
const leftArm = createArm(-1, -1);
const rightArm = createArm(1, -1);
creature.add(leftArm);
creature.add(rightArm);

function createFoot(x) {
  const foot = new THREE.Group();
  const footMain = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), bodyMatDark);
  footMain.scale.set(1.3, 0.6, 1);
  foot.add(footMain);
  foot.position.set(x * 0.35, -0.65, 0.35);
  foot.rotation.x = 0.15;
  return foot;
}
const leftFoot = createFoot(-1);
const rightFoot = createFoot(1);
creature.add(leftFoot);
creature.add(rightFoot);

const tailMat = new THREE.MeshStandardMaterial({ color: 0xe8d5b0, roughness: 0.4 });
const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), tailMat);
tail.position.set(0, -0.2, -0.85);
tail.rotation.x = 0.6;
creature.add(tail);
const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), tailMat);
tailTip.position.set(0, -0.35, -1.02);
creature.add(tailTip);

creature.scale.set(0.001, 0.001, 0.001);
scene.add(creature);

const bounceMat = new THREE.MeshStandardMaterial({
  color: 0x00d4ff,
  roughness: 0.2,
  metalness: 0.3,
  transparent: true,
  opacity: 0.15,
  emissive: 0x00d4ff,
  emissiveIntensity: 0.05,
});
const bouncePad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.06, 32), bounceMat);
bouncePad.position.y = -1.2;
bouncePad.receiveShadow = true;
scene.add(bouncePad);

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

document.addEventListener('click', (e) => {
  if (!state.awakened) handleTap();
});
document.addEventListener('touchstart', (e) => {
  if (!state.awakened) handleTap();
}, { passive: true });

petBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  petCreature();
});

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
    leftEar.rotation.z = -0.3 + Math.sin(t * Math.PI * 6) * 0.1;
    rightEar.rotation.z = 0.3 - Math.sin(t * Math.PI * 6) * 0.1;
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      creature.position.y = 0;
      creature.rotation.z = 0;
      leftEar.rotation.z = -0.3;
      rightEar.rotation.z = 0.3;
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
  function step(now) {
    const t = (now - start) / 1000;
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
}
window.addEventListener('resize', onResize);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const time = clock.getElapsedTime();
  if (state.awakened && !state.petting) {
    const breath = Math.sin(time * 1.5) * 0.015;
    creature.position.y = breath;
    creature.rotation.z = Math.sin(time * 0.8) * 0.01;
    creature.rotation.x = Math.sin(time * 0.6 + 1) * 0.008;
    const targetX = mouse.x * 0.08;
    creature.rotation.y += (targetX - creature.rotation.y) * 0.02;
    const lookX = mouse.x * 0.1;
    const lookY = mouse.y * 0.06;
    leftEye.children[1].position.x = 0 + lookX * 0.15;
    leftEye.children[1].position.y = 0 + lookY * 0.15;
    rightEye.children[1].position.x = 0 + lookX * 0.15;
    rightEye.children[1].position.y = 0 + lookY * 0.15;
    state.blinkTimer += dt * 1000;
    if (state.blinkTimer >= state.nextBlink) {
      doBlink();
      state.blinkTimer = 0;
      state.nextBlink = 3000 + Math.random() * 4000;
    }
    tail.rotation.x = 0.6 + Math.sin(time * 3) * 0.15;
    tailTip.position.x = Math.sin(time * 3) * 0.02;
    leftArm.rotation.x = 0.3 + Math.sin(time * 1.2) * 0.04;
    rightArm.rotation.x = 0.3 - Math.sin(time * 1.2) * 0.04;
    if (Math.sin(time * 2.7) > 0.95) {
      leftEar.rotation.z = -0.3 - 0.08;
      rightEar.rotation.z = 0.3 + 0.08;
    } else {
      leftEar.rotation.z = -0.3 + Math.sin(time * 1.1) * 0.03;
      rightEar.rotation.z = 0.3 - Math.sin(time * 1.1) * 0.03;
    }
  }
  const pos = particles.geometry.attributes.position.array;
  for (let i = 0; i < particleCount; i++) {
    pos[i*3+1] += Math.sin(time + i) * 0.0003;
    pos[i*3] += Math.sin(time * 0.5 + i * 0.7) * 0.00015;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  ring.material.opacity = 0.08 + Math.sin(time * 0.8) * 0.04;
  camera.position.y = (container.clientWidth < 480 ? 1.5 : 1.2) + Math.sin(time * 0.3) * 0.04;
  renderer.render(scene, camera);
}

function doBlink() {
  [leftEye, rightEye].forEach(eye => { eye.scale.y = 0.1; });
  setTimeout(() => {
    [leftEye, rightEye].forEach(eye => { eye.scale.y = 1; });
  }, 100);
}

setTimeout(() => {
  document.getElementById('loading-screen').classList.add('hidden');
}, 800);

animate();

const isMobile = window.innerWidth < 768 || 'ontouchstart' in window;
if (isMobile) {
  setTimeout(() => { if (!state.awakened) handleTap(); }, 2000);
}
