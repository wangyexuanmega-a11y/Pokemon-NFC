/* 主接线：选择宝可梦（高清/像素可切换）→ 召唤悬浮宠物（App）/ 页面显示（网页）；NFC 唤醒 */

import { NFCManager } from './nfc.js';
import { Pet } from './pet.js';

/* ─── 宝可梦目录 ───
 * 每只宝可梦有两种素材：
 *   hd    —— 高清图（默认）
 *   pixel —— 像素图
 * 加新宝可梦：把图片放到 sprites/ 下（高清）和 sprites/pixel/ 下（像素），加一行即可。
 */
const BUDDIES = {
  bulbasaur: {
    name: '妙蛙种子', type: '草系',
    hd: 'sprites/bulbasaur.png', pixel: 'sprites/pixel/bulbasaur.png',
  },
  ivysaur: {
    name: '妙蛙草', type: '草系',
    hd: 'sprites/ivysaur.png', pixel: 'sprites/pixel/ivysaur.png',
  },
  venusaur: {
    name: '妙蛙花', type: '草系',
    hd: 'sprites/venusaur.png', pixel: 'sprites/pixel/venusaur.png',
  },
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
const dismissBtn = document.getElementById('dismiss-btn');
const backBtn = document.getElementById('back-btn');
const variantHd = document.getElementById('variant-hd');
const variantPixel = document.getElementById('variant-pixel');

const pet = new Pet(canvas, {});
let currentBuddy = null;

/* 素材版本：高清 / 像素（记住选择） */
let variant = 'hd';
try {
  if (localStorage.getItem('petVariant') === 'pixel') variant = 'pixel';
} catch (e) { /* localStorage 不可用时保持默认 */ }

function setStatus(text, type = '') {
  nfcStatus.textContent = text;
  nfcStatus.className = 'status ' + type;
}

function buddyOf(id) {
  return BUDDIES[id] || null;
}

function variantImage(b) {
  return b[variant] || b.hd;
}

/* ─── 高清 / 像素切换 ─── */
function applyVariantUI() {
  variantHd.classList.toggle('active', variant === 'hd');
  variantPixel.classList.toggle('active', variant === 'pixel');
  if (!currentBuddy) return;
  // 已有宠物在场：立即应用新素材
  const b = buddyOf(currentBuddy);
  if (!b) return;
  if (isNative && window.PetBridge) {
    // App 模式：重载悬浮窗应用新素材
    window.PetBridge.summon(currentBuddy);
  } else if (!isOverlay) {
    pet.setImage(variantImage(b), variant === 'pixel');
  }
}
variantHd.addEventListener('click', () => {
  variant = 'hd';
  try { localStorage.setItem('petVariant', 'hd'); } catch (e) { /* ignore */ }
  applyVariantUI();
});
variantPixel.addEventListener('click', () => {
  variant = 'pixel';
  try { localStorage.setItem('petVariant', 'pixel'); } catch (e) { /* ignore */ }
  applyVariantUI();
});

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
    // App 模式：原生创建悬浮宠物窗口（可拖拽）
    window.PetBridge.summon(id);
  } else if (!isOverlay) {
    // 网页模式：直接显示在页面里
    pet.setImage(variantImage(b), variant === 'pixel');
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

/* ─── 交互（动作动画已暂停，仅保留收起/换一只） ─── */
dismissBtn.addEventListener('click', () => {
  if (isNative && window.PetBridge) window.PetBridge.dismiss();
  else pet.dismiss();
  backToSelection();
  setStatus('已收起', '');
});
backBtn.addEventListener('click', backToSelection);

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
  try {
    if (localStorage.getItem('petVariant') === 'pixel') variant = 'pixel';
  } catch (e) { /* ignore */ }
  const id = params.get('buddy') || 'bulbasaur';
  const b = buddyOf(id);
  if (b) {
    pet.setImage(variantImage(b), variant === 'pixel');
    pet.appear();
  }
}

/* ─── NFC ─── */
if (!isOverlay) {
  renderSelection();
  applyVariantUI();
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
