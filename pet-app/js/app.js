/* 主接线：NFC → 弹宠物 → 交互 */

import { NFCManager, DEFAULT_BUDDY } from './nfc.js';
import { PikachuPet } from './pikachu.js';
// 以后换成真实图集时，取消下面注释即可：
// import { SpriteSheetPlayer } from './spritesheet.js';

/* 宝可梦目录：目前只有皮卡丘有占位美术，其余会先复用皮卡丘形象 */
const BUDDIES = {
  pikachu: { name: '皮卡丘', type: '电系', tag: '⚡' },
  bulbasaur: { name: '妙蛙种子', type: '草系', tag: '🌱' },
  charmander: { name: '小火龙', type: '火系', tag: '🔥' },
  squirtle: { name: '杰尼龟', type: '水系', tag: '💧' },
};

const canvas = document.getElementById('pet-canvas');
const tapPrompt = document.getElementById('tap-prompt');
const infoCard = document.getElementById('info-card');
const nfcStatus = document.getElementById('nfc-status');
const petName = document.getElementById('pet-name');
const petType = document.getElementById('pet-type');
const simulateBtn = document.getElementById('simulate-btn');
const petBtn = document.getElementById('pet-btn');
const waveBtn = document.getElementById('wave-btn');
const dismissBtn = document.getElementById('dismiss-btn');

const pet = new PikachuPet(canvas);

function setStatus(text, type = '') {
  nfcStatus.textContent = text;
  nfcStatus.className = 'status ' + type;
}

function setBuddy(id) {
  const b = BUDDIES[id] || BUDDIES[DEFAULT_BUDDY];
  petName.textContent = b.name;
  petType.textContent = b.type + ' · NFC 伙伴';
}

pet.onVisibleChange = (visible) => {
  tapPrompt.classList.toggle('hidden', visible);
  infoCard.classList.toggle('hidden', !visible);
};

function awaken(id) {
  setBuddy(id);
  pet.appear();
  setStatus('已唤醒', 'success');
}

/* ─── 交互 ─── */
petBtn.addEventListener('click', () => pet.happy());
waveBtn.addEventListener('click', () => pet.wave());
dismissBtn.addEventListener('click', () => {
  pet.dismiss();
  setStatus('已收起 · 再碰一次唤醒', '');
});

canvas.addEventListener('pointerdown', (e) => {
  if (!pet.visible) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const dx = x - pet.cx;
  const dy = y - pet.cy;
  if (dx * dx + dy * dy <= (pet.R * 1.5) ** 2) pet.happy();
});

/* ─── NFC ─── */
const nfc = new NFCManager({
  onAwaken: (id) => awaken(id),
  onError: () => setStatus('NFC 读取失败', 'error'),
  onStatus: (s) => {
    if (s === 'unsupported') setStatus('此设备不支持 Web NFC（桌面可用按钮模拟）', 'warn');
    else if (s === 'scanning') setStatus('正在扫描 NFC…', '');
  },
});

const urlBuddy = nfc.readBuddyFromURL();
if (urlBuddy) {
  awaken(urlBuddy);
} else {
  nfc.startScan().then((ok) => {
    if (!ok && !nfc.isSupported()) {
      simulateBtn.classList.remove('hidden');
      simulateBtn.addEventListener('click', () => awaken(DEFAULT_BUDDY));
    }
  });
}

/* ─── 渲染循环 ─── */
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  pet.tick(dt);
  pet.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
