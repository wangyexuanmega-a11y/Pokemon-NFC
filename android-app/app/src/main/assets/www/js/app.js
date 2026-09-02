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
  charmander: {
    name: '小火龙', type: '火系',
    hd: 'sprites/charmander.png', pixel: 'sprites/pixel/charmander.png',
  },
  squirtle: {
    name: '杰尼龟', type: '水系',
    hd: 'sprites/squirtle.png', pixel: 'sprites/pixel/squirtle.png',
  },
};

/* 预留空位（以后补充图鉴时直接启用） */
const RESERVED = ['pikachu', 'eevee', 'jigglypuff', 'meowth'];

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
    // App 模式：只刷新悬浮窗素材（不重新召唤、不弹权限）
    window.PetBridge.reloadOverlay();
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
  currentBuddy = null; // 已收起：之后切换素材不再联动
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

/** 把宠物在窗口里的实际像素范围告诉原生 → 原生把窗口缩到刚好包住宠物（缩小触摸影响区） */
function reportPetBounds() {
  if (!isOverlay || !window.PetBridge) return;
  const cb = pet.contentBox;
  if (!cb) return;
  const R = pet.R;
  const targetH = 1.6 * R;
  const dw = targetH * (cb.w / cb.h);
  const left = pet.cx - dw / 2;
  const top = pet.cy - targetH - R * 0.1; // 头顶留点余量
  const w = dw;
  const h = targetH + R * 0.5; // 含地面阴影
  window.PetBridge.setPetBounds(Math.round(left), Math.round(top), Math.round(w), Math.round(h));
}

if (isOverlay) {
  document.body.classList.add('overlay-mode');
  try {
    if (localStorage.getItem('petVariant') === 'pixel') variant = 'pixel';
  } catch (e) { /* ignore */ }
  // 悬浮窗：宠物固定尺寸，窗口贴合宠物（触摸只挡宠物附近，其它区域穿透）
  pet.fixedSize = true;
  pet.size = 90;
  pet.resize();
  pet.onImageReady = reportPetBounds;
  window.addEventListener('resize', reportPetBounds);
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
