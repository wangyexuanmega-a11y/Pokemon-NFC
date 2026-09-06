/* 主接线：图鉴选择 → 平台展示（可缩放持久）→ 悬浮宠物（App，原生拖拽/长按收起）；
 * 养成：GPS 运动距离(1km=1🍬) → 糖果(原生账本) → 升级/进化；训练家账号 */

import { NFCManager } from './nfc.js';
import { Pet } from './pet.js';
import { BUDDIES, findBuddy } from './buddies.js';

const params = new URLSearchParams(window.location.search);
const isOverlay = params.has('overlay');
const isNative = params.has('native');

const canvas = document.getElementById('pet-canvas'); // 悬浮窗画布
const stageCanvas = document.getElementById('stage-canvas'); // 平台画布
const selectionScreen = document.getElementById('selection-screen');
const controlCard = document.getElementById('control-card');
const ccName = document.getElementById('cc-name');
const ccLevel = document.getElementById('cc-level');
const ccCandy = document.getElementById('cc-candy');
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
const scaleSlider = document.getElementById('scale-slider');
const scaleValue = document.getElementById('scale-value');
const closeAppBtn = document.getElementById('close-app-btn');
const trainerBar = document.getElementById('trainer-bar');
const trainerNameEl = document.getElementById('trainer-name');
const todayStepsEl = document.getElementById('today-steps');
const trainerModal = document.getElementById('trainer-modal');
const tmClose = document.getElementById('tm-close');
const tmName = document.getElementById('tm-name');
const tmId = document.getElementById('tm-id');
const tmDate = document.getElementById('tm-date');
const tmTotal = document.getElementById('tm-total');
const tmToday = document.getElementById('tm-today');
const tmCandy = document.getElementById('tm-candy');
const tmDist = document.getElementById('tm-dist');
const tmSave = document.getElementById('tm-save');
const wechatBtn = document.getElementById('wechat-btn');
const wechatNote = document.getElementById('wechat-note');
const exerciseCard = document.getElementById('exercise-card');
const exBtn = document.getElementById('ex-btn');
const exSession = document.getElementById('ex-session');
const exTotal = document.getElementById('ex-total');

const pet = new Pet(canvas, { contain: true, groundAt: 0.62 }); // 悬浮窗宠物（自适应窗口）
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
  if (isNative && currentBuddy && window.PetBridge) {
    // App 模式：按新尺寸重建悬浮窗（保持宠物中心）
    const d = overlayDims(findBuddy(currentBuddy));
    window.PetBridge.reloadOverlay(String(currentBuddy), d.winW, d.winH, d.petL, d.petT, d.petW, d.petH);
  }
});

/* ─── 糖果账本（原生持久化：1km=1🍬 由运动服务发放） ─── */
const LEVEL_COST = 1; // 升级消耗糖果
const EVOLVE_COST = 5; // 进化消耗糖果
const EVO_LEVEL_STAGE1 = 10;
const EVO_LEVEL_STAGE2 = 20;

let candies = 0;
function syncCandies() {
  if (isNative && window.PetBridge && typeof window.PetBridge.getCandies === 'function') {
    candies = Number(window.PetBridge.getCandies() || 0);
  } else {
    try { candies = parseInt(localStorage.getItem('petCandies'), 10) || 0; } catch (e) { /* ignore */ }
  }
}
function spendCandies(n) {
  if (isNative && window.PetBridge) return !!window.PetBridge.consumeCandy(n);
  if (candies >= n) {
    candies -= n;
    try { localStorage.setItem('petCandies', String(candies)); } catch (e) { /* ignore */ }
    return true;
  }
  return false;
}
/* 旧版 H5 本地糖果一次性并入原生账本 */
try {
  if (isNative && !localStorage.getItem('candiesImported')) {
    const old = parseInt(localStorage.getItem('petCandies'), 10) || 0;
    if (old > 0 && window.PetBridge) window.PetBridge.addCandy(old);
    localStorage.setItem('candiesImported', '1');
    try { localStorage.removeItem('petCandies'); } catch (e) { /* ignore */ }
  }
} catch (e) { /* ignore */ }

/* ─── 训练家账号（本地档案） ─── */
let trainer = null;
try { trainer = JSON.parse(localStorage.getItem('petTrainer') || 'null'); } catch (e) { trainer = null; }
if (!trainer || !trainer.id) {
  const id = Math.floor(100000 + Math.random() * 900000);
  trainer = { id: id, name: '训练家' + String(id).slice(0, 4), createdAt: new Date().toISOString().slice(0, 10) };
  try { localStorage.setItem('petTrainer', JSON.stringify(trainer)); } catch (e) { /* ignore */ }
}
function saveTrainer() {
  try { localStorage.setItem('petTrainer', JSON.stringify(trainer)); } catch (e) { /* ignore */ }
}
function updateTrainerUI() {
  trainerNameEl.textContent = trainer.name;
  todayStepsEl.textContent = todaySteps().toLocaleString();
}

/* ─── 每日步数（跨日自动结算） ─── */
let dayKey = '';
let dayBase = 0;
let totalSteps = 0;
try {
  dayKey = localStorage.getItem('petDayKey') || '';
  dayBase = parseInt(localStorage.getItem('petDayBase'), 10) || 0;
} catch (e) { /* ignore */ }
function rollDay() {
  const today = new Date().toDateString();
  if (today !== dayKey) {
    dayKey = today;
    dayBase = totalSteps;
    try {
      localStorage.setItem('petDayKey', dayKey);
      localStorage.setItem('petDayBase', String(dayBase));
    } catch (e) { /* ignore */ }
  }
}
function todaySteps() {
  return Math.max(0, totalSteps - dayBase);
}

/* ─── 等级（本地存档） ─── */
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
function evoInfo(dex) {
  const b = findBuddy(dex);
  if (!b || !b.next) return null;
  const nxt = findBuddy(b.next);
  if (!nxt) return null;
  const needLv = nxt.next ? EVO_LEVEL_STAGE1 : EVO_LEVEL_STAGE2;
  return { next: nxt, needLv: needLv };
}

/* ─── 我的账号弹窗 ─── */
function openTrainerModal() {
  tmName.value = trainer.name;
  tmId.textContent = '#' + String(trainer.id).padStart(6, '0');
  tmDate.textContent = trainer.createdAt;
  tmTotal.textContent = totalSteps.toLocaleString();
  tmToday.textContent = todaySteps().toLocaleString();
  tmCandy.textContent = String(candies);
  const km = nativeMeters() / 1000;
  tmDist.textContent = km >= 0.001 ? km.toFixed(2) + ' km' : '0.00 km';
  trainerModal.classList.remove('hidden');
}
function closeTrainerModal() {
  trainerModal.classList.add('hidden');
}
trainerBar.addEventListener('click', openTrainerModal);
tmClose.addEventListener('click', closeTrainerModal);
trainerModal.addEventListener('click', (e) => {
  if (e.target === trainerModal) closeTrainerModal();
});
tmSave.addEventListener('click', () => {
  const v = tmName.value.trim();
  if (v) {
    trainer.name = v.slice(0, 12);
    saveTrainer();
    updateTrainerUI();
  }
  closeTrainerModal();
});
wechatBtn.addEventListener('click', () => {
  wechatNote.classList.toggle('hidden');
});

/* ─── 运动（GPS 距离 → 糖果，原生前台服务） ─── */
let exRunning = false;
let exBaseMeters = 0;
function nativeMeters() {
  if (isNative && window.PetBridge && typeof window.PetBridge.getExerciseMeters === 'function') {
    return Number(window.PetBridge.getExerciseMeters() || 0);
  }
  return 0;
}
function updateExerciseUI() {
  if (!isNative) return;
  const meters = nativeMeters();
  const totalKm = (meters / 1000).toFixed(2);
  exTotal.textContent = totalKm;
  if (exRunning) {
    const sess = Math.max(0, meters - exBaseMeters);
    exSession.textContent = (sess / 1000).toFixed(2);
  } else {
    exSession.textContent = '—';
  }
  exBtn.textContent = exRunning ? '结束运动' : '开始运动';
  exBtn.classList.toggle('running', exRunning);
}
function pollNative() {
  if (!isNative) return;
  if (window.PetBridge) {
    exRunning = !!window.PetBridge.isExercising();
    syncCandies();
  }
  updateExerciseUI();
  updateResourceUI();
  updateTrainerUI();
  rollDay();
}
exBtn.addEventListener('click', () => {
  if (!isNative || !window.PetBridge) return;
  if (exRunning) {
    window.PetBridge.endExercise();
    exRunning = false;
    setStatus('运动结束，糖果已结算', 'success');
  } else {
    exBaseMeters = nativeMeters();
    window.PetBridge.startExercise();
    setStatus('开始记录运动，锁屏也会继续~', 'success');
  }
  setTimeout(pollNative, 800);
});

/* ─── 步数（传感器，账号资料） ─── */
function updateStepsUI() {
  if (!isNative) return;
  stepsBadge.classList.remove('hidden');
  stepsCount.textContent = totalSteps.toLocaleString();
}
function refreshSteps() {
  if (isNative && window.PetBridge && typeof window.PetBridge.getTotalSteps === 'function') {
    totalSteps = Number(window.PetBridge.getTotalSteps() || 0);
    updateStepsUI();
    updateTrainerUI();
  }
}
window.__petSteps = function (n) {
  totalSteps = Number(n || 0);
  updateStepsUI();
  updateTrainerUI();
};
window.__petExerciseDenied = function () {
  setStatus('需要定位权限才能记录运动距离', 'warn');
};

/* ─── 资源/升级/进化 UI ─── */
function updateResourceUI() {
  candyCount.textContent = String(candies);
  if (ccCandy) ccCandy.textContent = '🍬 ' + candies;
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

levelupBtn.addEventListener('click', () => {
  if (!currentBuddy) return;
  syncCandies();
  if (!spendCandies(LEVEL_COST)) {
    setStatus('糖果不足，去运动攒糖果吧（1km=1🍬）', 'warn');
    return;
  }
  setLevel(currentBuddy, getLevel(currentBuddy) + 1);
  syncCandies();
  updateResourceUI();
  setStatus('升级成功！' + findBuddy(currentBuddy).name + ' Lv.' + getLevel(currentBuddy), 'success');
});

evolveBtn.addEventListener('click', () => {
  if (!currentBuddy) return;
  const b = findBuddy(currentBuddy);
  const evo = evoInfo(currentBuddy);
  if (!b || !evo) return;
  const lv = getLevel(b.dex);
  syncCandies();
  if (lv < evo.needLv || !spendCandies(EVOLVE_COST)) {
    setStatus('进化条件不足（Lv.' + evo.needLv + ' + ' + EVOLVE_COST + '🍬）', 'warn');
    return;
  }
  setLevel(evo.next.dex, Math.max(getLevel(evo.next.dex), lv));
  syncCandies();
  updateResourceUI();
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

/* ─── 悬浮窗窗口尺寸（物理 px，一次性传给原生；不再反馈式改尺寸） ─── */
function clampNum(v, a, b) {
  return Math.min(b, Math.max(a, v));
}
function overlayDims(b) {
  const s = scale;
  const CH = 150 * s; // 期望宠物内容高（css px）
  const cssH = clampNum(CH * 1.34, 100, 620);
  const cssW = clampNum(CH * 1.34 * (b.w / b.h), 80, 660);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const winW = Math.round(cssW * dpr);
  const winH = Math.round(cssH * dpr);
  // 初始命中区：整窗内缩 10%（悬浮页加载后会 setPetRect 精确校正）
  const padX = Math.max(6, Math.round(cssW * 0.1 * dpr));
  const padY = Math.max(6, Math.round(cssH * 0.1 * dpr));
  return {
    winW: winW, winH: winH,
    petL: padX, petT: padY,
    petW: winW - padX * 2, petH: winH - padY * 2,
  };
}

/* ─── 召唤 ─── */
function summon(id) {
  const b = findBuddy(id);
  if (!b) return;
  currentBuddy = b.dex;
  preview(b);
  showControl(b);
  syncCandies();
  updateResourceUI();
  setStatus('已召唤 ' + b.name, 'success');
  if (isNative && window.PetBridge) {
    const d = overlayDims(b);
    window.PetBridge.summon(String(b.dex), d.winW, d.winH, d.petL, d.petT, d.petW, d.petH);
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

/* ─── 悬浮窗模式：纯渲染；窗口尺寸/命中区由原生契约管理，触摸全在原生层 ─── */
if (isOverlay) {
  document.body.classList.add('overlay-mode');
  document.documentElement.style.background = 'transparent';
  pet.resize();
  const reportRect = () => {
    if (!window.PetBridge) return;
    const r = pet.getContentRectCss();
    if (!r) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    window.PetBridge.setPetRect(
      Math.round(r.l * dpr), Math.round(r.t * dpr),
      Math.round(r.w * dpr), Math.round(r.h * dpr)
    );
  };
  pet.onImageReady = reportRect;
  window.addEventListener('resize', reportRect);
  const id = params.get('buddy') || '1';
  const b = findBuddy(id);
  if (b) {
    pet.setFrames('sprites/anim/' + b.dex + '.png', b);
    pet.appear();
  }
}

/* ─── 初始界面 / NFC ─── */
if (!isOverlay) {
  renderGrid();
  applyScaleUI();
  updateTrainerUI();
  syncCandies();
  updateResourceUI();
  const first = BUDDIES['1'];
  if (first) preview(first); // 平台默认展示 1 号

  // 初始界面右上角关闭（App 内退出）
  if (isNative) {
    closeAppBtn.classList.remove('hidden');
    closeAppBtn.addEventListener('click', () => {
      if (window.PetBridge) window.PetBridge.exit();
    });
    exerciseCard.classList.remove('hidden');
  }

  refreshSteps();
  pollNative();
  setInterval(refreshSteps, 5000);
  setInterval(pollNative, 2500);

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
