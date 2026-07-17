import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ─── Material Definitions ─── */
export const MATERIALS = {
  body: new THREE.MeshStandardMaterial({ color: 0xf5e6ca, roughness: 0.35, metalness: 0.05 }),
  bodyDark: new THREE.MeshStandardMaterial({ color: 0xe8d5b0, roughness: 0.35, metalness: 0.05 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }),
  pupil: new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.3, metalness: 0.2 }),
  cheek: new THREE.MeshStandardMaterial({ color: 0xff9eaa, roughness: 0.4 }),
  innerEar: new THREE.MeshStandardMaterial({ color: 0xffb5c2, roughness: 0.4 }),
  highlight: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0 }),
  mouth: new THREE.MeshStandardMaterial({ color: 0x8b6f5e, roughness: 0.5 }),
  heart: new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.3 }),
  tuft: new THREE.MeshStandardMaterial({ color: 0xe8d5b0, roughness: 0.4 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xe8d5b0, roughness: 0.4 }),
};

/* ─── Build primitive Sprout creature ─── */
export function buildSprout() {
  const creature = new THREE.Group();
  const M = MATERIALS;

  /* Body */
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 24), M.body);
  body.scale.set(1, 0.9, 0.85);
  body.position.y = 0.2;
  body.castShadow = true;
  creature.add(body);

  /* Belly spot */
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), M.bodyDark);
  belly.scale.set(1, 0.8, 0.4);
  belly.position.set(0, -0.05, 0.7);
  creature.add(belly);

  /* Heart on belly */
  const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), M.heart);
  h1.position.set(-0.07, 0.02, 0.98);
  creature.add(h1);
  const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), M.heart);
  h2.position.set(0.07, 0.02, 0.98);
  creature.add(h2);
  const h3 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.1, 3), M.heart);
  h3.position.set(0, -0.04, 0.98);
  h3.rotation.x = Math.PI;
  creature.add(h3);

  /* Head tuft */
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), M.tuft);
    t.position.set(-0.08 + i * 0.08, 0.98, 0);
    t.rotation.z = (i - 1) * 0.25;
    creature.add(t);
  }

  /* Ears */
  const leftEar = createEar(-1);
  const rightEar = createEar(1);
  creature.add(leftEar);
  creature.add(rightEar);

  /* Eyes */
  const leftEye = createEye(-0.3, 0.38, 0.78);
  const rightEye = createEye(0.3, 0.38, 0.78);
  creature.add(leftEye);
  creature.add(rightEye);

  /* Cheeks */
  const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), M.cheek);
  cheekL.scale.set(1.2, 0.9, 0.5);
  cheekL.position.set(-0.45, 0.2, 0.78);
  creature.add(cheekL);
  const cheekR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 14), M.cheek);
  cheekR.scale.set(1.2, 0.9, 0.5);
  cheekR.position.set(0.45, 0.2, 0.78);
  creature.add(cheekR);

  /* Mouth */
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.025, 8, 12, Math.PI), M.mouth);
  mouth.position.set(0, 0.12, 0.88);
  mouth.rotation.x = -0.2;
  creature.add(mouth);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 12, Math.PI), M.mouth);
  smile.position.set(0, 0.06, 0.92);
  smile.rotation.x = -0.4;
  creature.add(smile);

  /* Arms */
  const leftArm = createArm(-1, -1);
  const rightArm = createArm(1, -1);
  creature.add(leftArm);
  creature.add(rightArm);

  /* Feet */
  const leftFoot = createFoot(-1);
  const rightFoot = createFoot(1);
  creature.add(leftFoot);
  creature.add(rightFoot);

  /* Tail */
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), M.tail);
  tail.position.set(0, -0.2, -0.85);
  tail.rotation.x = 0.6;
  creature.add(tail);
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), M.tail);
  tailTip.position.set(0, -0.35, -1.02);
  creature.add(tailTip);

  /* Store animation targets */
  creature.userData.animTargets = {
    leftEye, rightEye,
    leftArm, rightArm,
    tail, tailTip,
    leftEar, rightEar,
    mouth, smile,
  };
  creature.userData.type = 'sprout';

  return creature;
}

/* ─── Helpers ─── */
function createEar(x) {
  const ear = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), MATERIALS.body);
  outer.scale.set(1, 1, 0.7);
  ear.add(outer);
  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), MATERIALS.innerEar);
  inner.scale.set(1, 1, 0.6);
  inner.position.set(0, 0.02, 0.14);
  ear.add(inner);
  ear.position.set(x * 0.48, 0.78, 0);
  ear.rotation.z = -x * 0.3;
  ear.rotation.x = -0.15;
  return ear;
}

function createEye(x, y, z) {
  const eye = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 20), MATERIALS.eyeWhite);
  white.scale.set(1, 1.1, 0.6);
  eye.add(white);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), MATERIALS.pupil);
  pupil.scale.set(0.8, 0.9, 0.5);
  pupil.position.set(0, 0, 0.16);
  eye.add(pupil);
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), MATERIALS.highlight);
  hl.position.set(0.05, 0.05, 0.24);
  eye.add(hl);
  eye.position.set(x, y, z);
  return eye;
}

function createArm(x, z) {
  const arm = new THREE.Group();
  const seg = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), MATERIALS.body);
  seg.scale.set(0.8, 1.2, 0.8);
  arm.add(seg);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), MATERIALS.bodyDark);
  hand.position.set(0, -0.15, 0);
  arm.add(hand);
  arm.position.set(x * 0.85, 0.15, z * 0.3);
  arm.rotation.x = 0.3;
  arm.rotation.z = x * 0.4;
  return arm;
}

function createFoot(x) {
  const foot = new THREE.Group();
  const main = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), MATERIALS.bodyDark);
  main.scale.set(1.3, 0.6, 1);
  foot.add(main);
  foot.position.set(x * 0.35, -0.65, 0.35);
  foot.rotation.x = 0.15;
  return foot;
}

/* ─── Load glTF/GLB model ─── */
export function loadGLTF(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
      const model = gltf.scene;
      // Hard-coded small scale - works for any model
      model.scale.set(0.003, 0.003, 0.003);
      // Center and sit on ground
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      model.position.y += -box.min.y;
      // Enable shadows
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      model.userData.type = 'gltf';
      model.userData.animTargets = {};
      resolve(model);
    }, undefined, (err) => reject(err));
  });
}

export function doBlink(creature) {
  const t = creature.userData.animTargets;
  if (!t || !t.leftEye || !t.rightEye) return;
  [t.leftEye, t.rightEye].forEach(eye => { eye.scale.y = 0.1; });
  setTimeout(() => {
    [t.leftEye, t.rightEye].forEach(eye => { eye.scale.y = 1; });
  }, 100);
}

/* ─── Ear wiggle helper (primitive only) ─── */
export function wiggleEars(targets, time) {
  if (!targets || !targets.leftEar) return;
  if (Math.sin(time * 2.7) > 0.95) {
    targets.leftEar.rotation.z = -0.3 - 0.08;
    targets.rightEar.rotation.z = 0.3 + 0.08;
  } else {
    targets.leftEar.rotation.z = -0.3 + Math.sin(time * 1.1) * 0.03;
    targets.rightEar.rotation.z = 0.3 - Math.sin(time * 1.1) * 0.03;
  }
}

/* ─── Pupil tracking helper (primitive only) ─── */
export function trackMouse(targets, mouseX, mouseY) {
  if (!targets || !targets.leftEye) return;
  const lookX = mouseX * 0.1;
  const lookY = mouseY * 0.06;
  const le = targets.leftEye;
  const re = targets.rightEye;
  if (le.children[1]) { le.children[1].position.x = lookX * 0.15; le.children[1].position.y = lookY * 0.15; }
  if (re.children[1]) { re.children[1].position.x = lookX * 0.15; re.children[1].position.y = lookY * 0.15; }
}

/* ─── Reset pet pose ─── */
export function resetPetPose(targets) {
  if (!targets) return;
  if (targets.leftEar) { targets.leftEar.rotation.z = -0.3; targets.rightEar.rotation.z = 0.3; }
}

/* ─── Pet wiggle ─── */
export function petWiggle(targets, t) {
  if (!targets || !targets.leftEar) return;
  targets.leftEar.rotation.z = -0.3 + Math.sin(t * Math.PI * 6) * 0.1;
  targets.rightEar.rotation.z = 0.3 - Math.sin(t * Math.PI * 6) * 0.1;
}
