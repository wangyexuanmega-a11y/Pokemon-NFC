/* 主接线：选择宝可梦（151 图鉴，像素动画）→ 召唤悬浮宠物（App）/ 页面显示（网页）；NFC 唤醒；步数 */

import { NFCManager } from './nfc.js';
import { Pet } from './pet.js';
import { BUDDIES, findBuddy } from './buddies.js';

const params = new URLSearchParams(window.location.search);
const isOverlay = params.has('overlay');
const isNative = params.has('native');

const canvas = document.getElementById('pet-canvas');
const selectionScreen = document.getElementById('selection-screen');
const controlCard = document.getElementById('control-card');
const ccName = document.getElementById('cc-name');
const nfcStatus = document.getElementById('nfc-status');
const grid = document.getElementById('buddy-grid');
const searchInput = document.getElementById('search-input');
const dismissBtn = document.getElementById('dismiss-btn');
const backBtn = document.getElementById('back-btn');
const stepsBadge = document.getElementById('steps-badge');
const stepsCount = document.getElementById('steps-count');

const pet = new Pet(canvas, {});
let currentBuddy = null; // dex 编号

function setStatus(text, type = '') {
  nfcStatus.textContent = text;
  nfcStatus.className = 'status ' + type;
}

/* ─── 步数（App 内手机硬件计步，为进化系统积累数据） ─── */
let totalSteps = 0;
function updateStepsUI() {
  if (!isNative) return;
  stepsBadge.classList.remove('hidden');
  stepsCount.textContent = totalSteps.toLocaleString();
}
function refreshSteps() {
  if (isNative && window.PetBridge && typeof window.PetBridge.getTotalSteps === 'function') {
    totalSteps = Number(window.PetBridge.getTotalSteps() || 0);
    updateStepsUI();
  }
}
window.__petSteps = function (n) {
  totalSteps = Number(n || 0);
  updateStepsUI();
};

/* ─── 选择界面 ─── */
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

/* ─── 召唤 ─── */
function summon(id) {
  const b = findBuddy(id);
  if (!b) return;
  currentBuddy = b.dex;
  showControl(b);
  setStatus('已召唤 ' + b.name, 'success');
  if (isNative && window.PetBridge) {
    // App 模式：原生创建悬浮宠物窗口（可拖拽）
    window.PetBridge.summon(String(b.dex));
  } else if (!isOverlay) {
    // 网页模式：直接显示在页面里
    pet.setFrames('sprites/anim/' + b.dex + '.png', b);
    pet.appear();
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

/* ─── 交互（动作动画已暂停，仅保留收起/换一只） ─── */
dismissBtn.addEventListener('click', () => {
  currentBuddy = null;
  if (isNative && window.PetBridge) window.PetBridge.dismiss();
  else pet.dismiss();
  backToSelection();
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

/** 把宠物在窗口里的实际像素范围告诉原生 → 原生把窗口缩到刚好包住宠物（缩小触摸影响区） */
function reportPetBounds() {
  if (!isOverlay || !window.PetBridge) return;
  const s = pet.getDisplaySize();
  if (!s) return;
  const R = pet.R;
  const pad = R * 0.15; // 动画摇摆余量
  const left = pet.cx - s.w / 2 - pad;
  const top = pet.cy - s.h - R * 0.1 - pad;
  const w = s.w + pad * 2;
  const h = s.h + R * 0.5 + pad;
  window.PetBridge.setPetBounds(Math.round(left), Math.round(top), Math.round(w), Math.round(h));
}

if (isOverlay) {
  document.body.classList.add('overlay-mode');
  // 悬浮窗：宠物固定尺寸，窗口贴合宠物（触摸只挡宠物附近，其它区域穿透）
  pet.fixedSize = true;
  pet.size = 90;
  pet.resize();
  pet.onImageReady = reportPetBounds;
  window.addEventListener('resize', reportPetBounds);
  const id = params.get('buddy') || '1';
  const b = findBuddy(id);
  if (b) {
    pet.setFrames('sprites/anim/' + b.dex + '.png', b);
    pet.appear();
  }
}

/* ─── NFC ─── */
if (!isOverlay) {
  renderGrid();
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
