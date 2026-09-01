/* 主接线：宝可梦选择 → 召唤宠物（悬浮窗 / 页面内）→ 交互；NFC 唤醒 */

import { NFCManager } from './nfc.js';
import { Pet } from './pet.js';

/* ─── 宝可梦目录 ───
 * 加新宝可梦：把透明 PNG 放到 sprites/ 下，然后在这里加一行即可。
 */
const BUDDIES = {
  bulbasaur: { name: '妙蛙种子', type: '草系', image: 'sprites/bulbasaur.png' },
  ivysaur: { name: '妙蛙草', type: '草系', image: 'sprites/ivysaur.png' },
  venusaur: { name: '妙蛙花', type: '草系', image: 'sprites/venusaur.png' },
};

/* 预留空位（以后补充图鉴时直接启用） */
const RESERVED = ['charmander', 'squirtle', 'pikachu', 'eevee', 'jigglypuff', 'meowth'];

const params = new URLSearchParams(window.location.search);
const isOverlay = params.has('overlay');
const isNative = params.has('native');

const canvas = document.getElementById('pet-canvas');
const selectionScreen = document.getElementById('selection-screen');
const controlCard = document.getElementById('control-card');
const ccName = document.getElementById('cc-name');
const nfcStatus = document.getElementById('nfc-status');
const grid = document.getElementById('buddy-grid');
const petBtn = document.getElementById('pet-btn');
const waveBtn = document.getElementById('wave-btn');
const dismissBtn = document.getElementById('dismiss-btn');
const backBtn = document.getElementById('back-btn');

const pet = new Pet(canvas, {});
let currentBuddy = null;

function setStatus(text, type = '') {
  nfcStatus.textContent = text;
  nfcStatus.className = 'status ' + type;
}

function buddyOf(id) {
  return BUDDIES[id] || null;
}

/* ─── 选择界面 ─── */
function renderSelection() {
  grid.innerHTML = '';
  for (const id of Object.keys(BUDDIES)) {
    const b = BUDDIES[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buddy-option';
    btn.innerHTML = '<span class="pokeball"></span><span class="b-name">' + b.name + '</span>';
    btn.addEventListener('click', () => summon(id));
    grid.appendChild(btn);
  }
  for (let i = 0; i < RESERVED.length; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buddy-option locked';
    btn.disabled = true;
    btn.innerHTML = '<span class="pokeball"></span><span class="b-name">？？？</span>';
    grid.appendChild(btn);
  }
}

/* ─── 召唤 ─── */
function summon(id) {
  const b = buddyOf(id);
  if (!b) return;
  currentBuddy = id;
  showControl(b);
  setStatus('已召唤 ' + b.name, 'success');
  if (isNative && window.PetBridge) {
    // App 模式：原生创建悬浮宠物窗口
    window.PetBridge.summon(id);
  } else if (!isOverlay) {
    // 网页模式：直接显示在页面里
    pet.setImage(b.image);
    pet.appear();
  }
}

function showControl(b) {
  selectionScreen.classList.add('hidden');
  controlCard.classList.remove('hidden');
  ccName.textContent = b.name + ' · ' + b.type;
}

function backToSelection() {
  controlCard.classList.add('hidden');
  selectionScreen.classList.remove('hidden');
}

/* ─── 交互 ─── */
petBtn.addEventListener('click', () => {
  if (isNative && window.PetBridge) window.PetBridge.pet();
  else pet.happy();
});
waveBtn.addEventListener('click', () => {
  if (isNative && window.PetBridge) window.PetBridge.wave();
  else pet.wave();
});
dismissBtn.addEventListener('click', () => {
  if (isNative && window.PetBridge) window.PetBridge.dismiss();
  else pet.dismiss();
  backToSelection();
  setStatus('已收起', '');
});
backBtn.addEventListener('click', backToSelection);

/* 点一下宠物 = 摸摸它（悬浮窗模式里也生效） */
canvas.addEventListener('pointerdown', (e) => {
  if (!pet.visible || (isNative && !isOverlay)) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const dx = x - pet.cx;
  const dy = y - pet.cy;
  if (dx * dx + dy * dy <= (pet.R * 1.4) ** 2) pet.happy();
});

/* ─── 原生桥接（App 内） ─── */
window.__petNfc = function (id) {
  if (isOverlay) return;
  const b = buddyOf(id);
  if (!b) {
    setStatus('未知的宝可梦: ' + id, 'warn');
    return;
  }
  summon(id);
};

/* ─── 悬浮窗模式（App 的浮窗 WebView） ─── */
if (isOverlay) {
  document.body.classList.add('overlay-mode');
  const id = params.get('buddy') || 'bulbasaur';
  const b = buddyOf(id);
  if (b) {
    pet.setImage(b.image);
    pet.appear();
  }
  // 供原生控制：摸摸 / 打招呼
  window.__petHappy = () => pet.happy();
  window.__petWave = () => pet.wave();
}

/* ─── NFC ─── */
if (!isOverlay) {
  renderSelection();
  const nfc = new NFCManager({
    onAwaken: (id) => window.__petNfc(id),
    onError: () => setStatus('NFC 读取失败', 'error'),
    onStatus: (s) => {
      if (s === 'unsupported') {
        setStatus(isNative ? '等待 NFC 标签…' : '当前设备不支持 Web NFC', 'warn');
      } else if (s === 'scanning') {
        setStatus('正在扫描 NFC…', '');
      }
    },
  });

  if (isNative) {
    // App 模式：由原生 NFC 驱动
    setStatus('等待 NFC 标签…', '');
  } else {
    // 网页模式：URL 参数或 Web NFC 常驻扫描
    const urlBuddy = nfc.readBuddyFromURL();
    if (urlBuddy) {
      window.__petNfc(urlBuddy);
    } else {
      nfc.startScan();
    }
  }
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
