/* 主接线：图鉴选择 → 平台展示（可缩放持久）→ 悬浮宠物（App）；NFC 唤醒；
 * 养成：步数(传感器) → 兑换神奇糖果 → 升级/进化 */

import { NFCManager } from './nfc.js';
import { Pet } from './pet.js';
import { BUDDIES, findBuddy } from './buddies.js';

const params = new URLSearchParams(window.location.search);
const isOverlay = params.has('overlay');
const isNative = params.has('native');

const canvas = document.getElementById('pet-canvas'); // 全屏画布（悬浮窗模式用）
const stageCanvas = document.getElementById('stage-canvas'); // 初始界面平台画布
const selectionScreen = document.getElementById('selection-screen');
const controlCard = document.getElementById('control-card');
const ccName = document.getElementById('cc-name');
const ccLevel = document.getElementById('cc-level');
const nfcStatus = document.getElementById('nfc-status');
const grid = document.getElementById('buddy-grid');
const searchInput = document.getElementById('search-input');
const dismissBtn = document.getElementById('dismiss-btn');
const backBtn = document.getElementById('back-btn');
const levelupBtn = document.getElementById('levelup-btn');
const evolveBtn = document.getElementById('evolve-btn');
const stepsBadge = document.getElementById('steps-badge');
const stepsCount = document.getElementById('steps-count');
const candyCount = document.getElementById('candy-count');
const stepsLeftEl = document.getElementById('steps-left');
const exchangeBtn = document.getElementById('exchange-btn');
const scaleSlider = document.getElementById('scale-slider');
const scaleValue = document.getElementById('scale-value');
const closeAppBtn = document.getElementById('close-app-btn');
const overlayClose = document.getElementById('overlay-close');

const pet = new Pet(canvas, {}); // 悬浮窗宠物
const stagePet = new Pet(stageCanvas, {
  fixedSize: true,
  size: 46,
  groundAt: 0.85, // 脚踩平台
  fitAboveGround: true, // 缩放不超出舞台
});
let currentBuddy = null; // dex 编号

/* ─── 大小缩放（持久保存；平台内不超界） ─── */
let scale = 1;
try { scale = parseFloat(localStorage.getItem('petScale')) || 1; } catch (e) { /* ignore */ }
scale = Math.min(1.85, Math.max(0.5, scale));
stagePet.scaleFactor = scale;
pet.scaleFactor = scale;

function applyScaleUI() {
  scaleSlider.value = Math.round(scale * 100);
  scaleValue.textContent = Math.round(scale * 100) + '%';
}
scaleSlider.addEventListener('input', () => {
  scale = parseFloat(scaleSlider.value) / 100;
  stagePet.scaleFactor = scale;
  scaleValue.textContent = scaleSlider.value + '%';
});
scaleSlider.addEventListener('change', () => {
  try { localStorage.setItem('petScale', String(scale)); } catch (e) { /* ignore */ }
  if (isNative && currentBuddy && window.PetBridge) window.PetBridge.reloadOverlay();
});

/* ─── 钱包：步数 → 神奇糖果 ─── */
const CANDY_RATE = 500; // 步数兑换一颗糖果
const LEVEL_COST = 1; // 升级消耗糖果
const EVOLVE_COST = 5; // 进化消耗糖果
const EVO_LEVEL_STAGE1 = 10; // 第一段进化等级
const EVO_LEVEL_STAGE2 = 20; // 第二段进化等级

let totalSteps = 0;
let candies = 0;
let stepsSpent = 0;
try { candies = parseInt(localStorage.getItem('petCandies'), 10) || 0; } catch (e) { /* ignore */ }
try { stepsSpent = parseInt(localStorage.getItem('petStepsSpent'), 10) || 0; } catch (e) { /* ignore */ }

function saveWallet() {
  try {
    localStorage.setItem('petCandies', String(candies));
    localStorage.setItem('petStepsSpent', String(stepsSpent));
  } catch (e) { /* ignore */ }
}
function loadLevels() {
  try { return JSON.parse(localStorage.getItem('petLevels') || '{}'); } catch (e) { return {}; }
}
function saveLevels(m) {
  try { localStorage.setItem('petLevels', JSON.stringify(m)); } catch (e) { /* ignore */ }
}
function getLevel(dex) {
  const m = loadLevels();
  return m[dex] || 1;
}
function setLevel(dex, lv) {
  const m = loadLevels();
  m[dex] = lv;
  saveLevels(m);
}
const stepsLeft = () => Math.max(0, totalSteps - stepsSpent);

function updateStepsUI() {
  if (!isNative) return;
  stepsBadge.classList.remove('hidden');
  stepsCount.textContent = totalSteps.toLocaleString();
}
function refreshSteps() {
  if (isNative && window.PetBridge && typeof window.PetBridge.getTotalSteps === 'function') {
    totalSteps = Number(window.PetBridge.getTotalSteps() || 0);
    updateStepsUI();
    updateResourceUI();
  }
}
window.__petSteps = function (n) {
  totalSteps = Number(n || 0);
  updateStepsUI();
  updateResourceUI();
};

/* ─── 资源/升级/进化 UI ─── */
function updateResourceUI() {
  candyCount.textContent = String(candies);
  if (isNative) {
    stepsLeftEl.textContent = stepsLeft().toLocaleString();
  } else {
    stepsLeftEl.textContent = '—';
  }
  exchangeBtn.disabled = !isNative || stepsLeft() < CANDY_RATE;
  // 控制卡信息
  if (currentBuddy) {
    const b = findBuddy(currentBuddy);
    if (b) {
      const lv = getLevel(b.dex);
      ccLevel.textContent = 'Lv.' + lv;
      const evo = evoInfo(b.dex);
      if (evo && lv >= evo.needLv) {
        evolveBtn.classList.remove('hidden');
        evolveBtn.textContent = '进化→' + evo.next.name + ' (' + EVOLVE_COST + '🍬)';
      } else {
        evolveBtn.classList.add('hidden');
      }
    }
  }
}

function evoInfo(dex) {
  const b = findBuddy(dex);
  if (!b || !b.next) return null;
  const nxt = findBuddy(b.next);
  if (!nxt) return null;
  // 下一段还有进化 = 三段线，当前是第一段；否则当前是第二段
  const needLv = nxt.next ? EVO_LEVEL_STAGE1 : EVO_LEVEL_STAGE2;
  return { next: nxt, needLv: needLv };
}

exchangeBtn.addEventListener('click', () => {
  if (!isNative) return;
  if (stepsLeft() < CANDY_RATE) {
    setStatus('步数不足，先走走再回来~', 'warn');
    return;
  }
  stepsSpent += CANDY_RATE;
  candies += 1;
  saveWallet();
  updateResourceUI();
  setStatus('获得 1 颗神奇糖果！', 'success');
});

levelupBtn.addEventListener('click', () => {
  if (!currentBuddy) return;
  if (candies < LEVEL_COST) {
    setStatus('糖果不足，先用步数兑换（' + CANDY_RATE + '步/颗）', 'warn');
    return;
  }
  candies -= LEVEL_COST;
  setLevel(currentBuddy, getLevel(currentBuddy) + 1);
  saveWallet();
  updateResourceUI();
  setStatus('升级成功！' + findBuddy(currentBuddy).name + ' Lv.' + getLevel(currentBuddy), 'success');
});

evolveBtn.addEventListener('click', () => {
  if (!currentBuddy) return;
  const b = findBuddy(currentBuddy);
  const evo = evoInfo(currentBuddy);
  if (!b || !evo) return;
  const lv = getLevel(b.dex);
  if (lv < evo.needLv || candies < EVOLVE_COST) {
    setStatus('进化条件不足（Lv.' + evo.needLv + ' + ' + EVOLVE_COST + '🍬）', 'warn');
    return;
  }
  candies -= EVOLVE_COST;
  setLevel(evo.next.dex, Math.max(getLevel(evo.next.dex), lv));
  saveWallet();
  setStatus('进化成功！' + b.name + ' → ' + evo.next.name + '！', 'success');
  summon(evo.next.dex);
});

function setStatus(text, type = '') {
  nfcStatus.textContent = text;
  nfcStatus.className = 'status ' + type;
}

/* ─── 图鉴网格 ─── */
function renderGrid(filter = '') {
  grid.innerHTML = '';
  const f = filter.toLowerCase();
  let shown = 0;
  for (const key of Object.keys(BUDDIES)) {
    const b = BUDDIES[key];
    if (f) {
      const match = b.name.toLowerCase().includes(f) ||
        (b.en && b.en.toLowerCase().includes(f)) ||
        String(b.dex).includes(f);
      if (!match) continue;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'buddy-option';
    btn.innerHTML = '<span class="pokeball"></span>' +
      '<span class="b-name">' + b.name + '<i>' + String(b.dex).padStart(3, '0') + '</i></span>';
    btn.addEventListener('click', () => summon(b.dex));
    grid.appendChild(btn);
    shown++;
  }
  if (shown === 0) {
    const p = document.createElement('p');
    p.className = 'no-result';
    p.textContent = '没有找到这只宝可梦';
    grid.appendChild(p);
  }
}
searchInput.addEventListener('input', () => renderGrid(searchInput.value.trim()));

/* ─── 平台预览 ─── */
function preview(b) {
  stagePet.setFrames('sprites/anim/' + b.dex + '.png', b);
  stagePet.scaleFactor = scale;
  stagePet.appear();
}

/* ─── 召唤 ─── */
function summon(id) {
  const b = findBuddy(id);
  if (!b) return;
  currentBuddy = b.dex;
  preview(b);
  showControl(b);
  updateResourceUI();
  setStatus('已召唤 ' + b.name, 'success');
  if (isNative && window.PetBridge) {
    // App 模式：悬浮宠物（App 前台时隐藏，回桌面显示）
    window.PetBridge.summon(String(b.dex));
  }
}

function showControl(b) {
  selectionScreen.classList.add('hidden');
  controlCard.classList.remove('hidden');
  ccName.textContent = b.name + ' · No.' + String(b.dex).padStart(3, '0');
}

function backToSelection() {
  controlCard.classList.add('hidden');
  selectionScreen.classList.remove('hidden');
}

/* ─── 交互 ─── */
dismissBtn.addEventListener('click', () => {
  currentBuddy = null;
  if (isNative && window.PetBridge) window.PetBridge.dismiss();
  else stagePet.dismiss();
  backToSelection();
  updateResourceUI();
  setStatus('已收起', '');
});
backBtn.addEventListener('click', backToSelection);

/* ─── 原生桥接（App 内） ─── */
window.__petNfc = function (id) {
  if (isOverlay) return;
  const b = findBuddy(id);
  if (!b) {
    setStatus('未知的宝可梦: ' + id, 'warn');
    return;
  }
  summon(b.dex);
};

/* ─── 悬浮窗模式（App 的浮窗 WebView） ─── */

/** 把宠物完整帧格的范围告诉原生 → 原生把窗口贴合宠物（不裁剪动画边缘，缩小触摸影响区） */
function reportPetBounds() {
  if (!isOverlay || !window.PetBridge) return;
  const box = pet.getFrameBox();
  if (!box) return;
  const R = pet.R;
  const pad = R * 0.12;
  const left = pet.cx - box.w / 2 - pad;
  const top = pet.cy - box.h - R * 0.08 - pad;
  const w = box.w + pad * 2;
  const h = box.h + pad * 2 + R * 0.25;
  window.PetBridge.setPetBounds(Math.round(left), Math.round(top), Math.round(w), Math.round(h));
}

/** 触摸点是否在宝可梦本体上（决定拖拽是否生效） */
function pointOnPet(x, y) {
  const s = pet.getDisplaySize();
  if (!s) return false;
  const left = pet.cx - s.w / 2;
  const top = pet.cy - s.h;
  return x >= left && x <= left + s.w && y >= top && y <= top + s.h;
}

if (isOverlay) {
  document.body.classList.add('overlay-mode');
  pet.fixedSize = true;
  pet.size = 90;
  pet.scaleFactor = scale;
  pet.resize();
  pet.onImageReady = reportPetBounds;
  window.addEventListener('resize', reportPetBounds);
  const id = params.get('buddy') || '1';
  const b = findBuddy(id);
  if (b) {
    pet.setFrames('sprites/anim/' + b.dex + '.png', b);
    pet.appear();
  }
  // 拖拽门控：只在宝可梦本体上生效
  const setPetTouch = (on) => {
    if (window.PetBridge) window.PetBridge.setTouchOnPet(!!on);
  };
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    setPetTouch(pointOnPet(e.clientX - rect.left, e.clientY - rect.top));
  });
  canvas.addEventListener('pointerup', () => setPetTouch(false));
  canvas.addEventListener('pointercancel', () => setPetTouch(false));
  // 悬浮窗右上角关闭按钮
  overlayClose.addEventListener('click', () => {
    if (window.PetBridge) window.PetBridge.dismiss();
  });
}

/* ─── 初始界面 / NFC ─── */
if (!isOverlay) {
  renderGrid();
  applyScaleUI();
  updateResourceUI();
  const first = BUDDIES['1'];
  if (first) preview(first); // 平台默认展示 1 号

  // 初始界面右上角关闭（App 内退出）
  if (isNative) {
    closeAppBtn.classList.remove('hidden');
    closeAppBtn.addEventListener('click', () => {
      if (window.PetBridge) window.PetBridge.exit();
    });
  }

  refreshSteps();
  setInterval(refreshSteps, 5000);

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
    setStatus('等待 NFC 标签…', '');
  } else {
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
  stagePet.tick(dt);
  stagePet.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
