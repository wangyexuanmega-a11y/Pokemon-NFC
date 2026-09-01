/* 通用 2D 宠物渲染器
 *
 * 当前阶段：静态素材模式 —— 透明 PNG + 轻微待机浮动（呼吸/摇摆/地面阴影），
 * 交互动作动画已暂停（后续换 3D 动画）。
 *
 * 支持「高清 / 像素」两种素材：
 *   高清：平滑缩放（imageSmoothingEnabled = true）
 *   像素：最近邻缩放，保持像素锐利（imageSmoothingEnabled = false）
 *
 * 对外接口：setImage(src, pixelated) / appear() / dismiss() / tick(dt) / draw()
 */

const TAU = Math.PI * 2;

function clamp(x, a = 0, b = 1) { return x < a ? a : x > b ? b : x; }
function easeOutBack(t) { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
function easeInBack(t) { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; }

/* ─── 地面阴影 + 召唤光环 ─── */
function drawShadow(ctx, p) {
  const k = 1 - clamp(p.bob * 3, 0, 0.45);
  ctx.fillStyle = `rgba(0,0,0,${0.24 * k})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.85 * k, 0.15 * k, 0, 0, TAU);
  ctx.fill();
}

function drawRing(ctx, k) {
  if (k <= 0) return;
  ctx.strokeStyle = `rgba(0, 212, 255, ${0.55 * k})`;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.1, 0.26, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = `rgba(120, 200, 120, ${0.4 * k})`;
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.85, 0.19, 0, 0, TAU);
  ctx.stroke();
}

/* ─── 程序化皮卡丘（仅当某只宝可梦没有图片时的占位回退，静态绘制） ─── */
function drawTail(ctx) {
  ctx.save();
  ctx.translate(0.72, -0.1);
  ctx.rotate(0.5);
  ctx.fillStyle = '#8B5A2B';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0.3, -0.08);
  ctx.lineTo(0.3, 0.22);
  ctx.lineTo(0, 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#F8D030';
  ctx.strokeStyle = '#C9A227';
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.moveTo(0.16, 0.05);
  ctx.lineTo(0.5, -0.35);
  ctx.lineTo(0.34, -0.28);
  ctx.lineTo(0.62, -0.62);
  ctx.lineTo(0.42, -0.55);
  ctx.lineTo(0.75, -0.95);
  ctx.lineTo(0.95, -0.42);
  ctx.lineTo(0.68, -0.36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawEar(ctx) {
  ctx.fillStyle = '#F8D030';
  ctx.strokeStyle = '#C9A227';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.moveTo(-0.22, 0.05);
  ctx.quadraticCurveTo(-0.26, -0.7, 0, -1.08);
  ctx.quadraticCurveTo(0.22, -0.7, 0.22, 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2B1B12';
  ctx.beginPath();
  ctx.moveTo(-0.1, -0.76);
  ctx.quadraticCurveTo(-0.08, -1.04, 0, -1.08);
  ctx.quadraticCurveTo(0.1, -0.76, 0.1, -0.76);
  ctx.closePath();
  ctx.fill();
}

function drawEars(ctx) {
  ctx.save();
  ctx.translate(-0.44, -0.58);
  ctx.rotate(-0.26);
  drawEar(ctx);
  ctx.restore();
  ctx.save();
  ctx.translate(0.44, -0.58);
  ctx.rotate(0.26);
  drawEar(ctx);
  ctx.restore();
}

function drawBody(ctx, breath) {
  ctx.save();
  ctx.scale(1 + breath, 1 + breath);
  ctx.fillStyle = '#F8D030';
  ctx.strokeStyle = '#C9A227';
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.ellipse(0, 0.05, 0.94, 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawEye(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#2B1B12';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(r * 0.3, -r * 0.35, r * 0.26, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawFace(ctx) {
  drawEye(ctx, -0.32, -0.24, 0.19);
  drawEye(ctx, 0.32, -0.24, 0.19);
  ctx.fillStyle = '#2B1B12';
  ctx.beginPath();
  ctx.ellipse(0, -0.02, 0.045, 0.035, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#2B1B12';
  ctx.lineWidth = 0.035;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0.02, 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = '#E5422D';
  ctx.beginPath();
  ctx.ellipse(-0.62, 0.14, 0.18, 0.14, 0, 0, TAU);
  ctx.ellipse(0.62, 0.14, 0.18, 0.14, 0, 0, TAU);
  ctx.fill();
}

function drawFeet(ctx) {
  ctx.fillStyle = '#F8D030';
  ctx.strokeStyle = '#C9A227';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.ellipse(-0.38, 0.88, 0.24, 0.12, 0, 0, TAU);
  ctx.ellipse(0.38, 0.88, 0.24, 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

function drawArms(ctx) {
  ctx.save();
  ctx.translate(-0.92, 0.28);
  ctx.rotate(-0.4);
  ctx.fillStyle = '#F8D030';
  ctx.strokeStyle = '#C9A227';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.ellipse(0, 0.16, 0.14, 0.24, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(0.92, 0.28);
  ctx.rotate(0.4);
  ctx.fillStyle = '#F8D030';
  ctx.strokeStyle = '#C9A227';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.ellipse(0, 0.16, 0.14, 0.24, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/* ─── 宠物主体 ─── */

export class Pet {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = 0;
    this.h = 0;
    this.cx = 0;
    this.cy = 0;
    this.R = 100; // 参考半径（px）
    this.state = 'hidden'; // hidden | appearing | idle | leaving
    this.stateT = 0;
    this.time = 0;
    this.appearAt = -10; // 出场时刻（用于光环淡出）
    this.visible = false;
    this.onVisibleChange = null;

    this.image = null;
    this.contentBox = null; // 不透明内容边界 {x,y,w,h}
    this.imageFailed = false;
    this.pixelated = false;

    if (opts.image) this.setImage(opts.image, !!opts.pixelated);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  resize() {
    this.w = this.canvas.clientWidth || window.innerWidth;
    this.h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.R = Math.min(this.w, this.h) * 0.26;
  }

  /** 更换宠物图片；pixelated = true 时用最近邻缩放（像素素材保持锐利） */
  setImage(src, pixelated = false) {
    this.pixelated = !!pixelated;
    this.image = null;
    this.contentBox = null;
    this.imageFailed = false;
    const img = new Image();
    img.onload = () => {
      // 计算不透明内容边界，自动裁掉透明边距
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cc = c.getContext('2d', { willReadFrequently: true });
        cc.drawImage(img, 0, 0);
        const data = cc.getImageData(0, 0, c.width, c.height).data;
        let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            if (data[(y * c.width + x) * 4 + 3] > 24) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX >= minX && maxY >= minY) {
          this.contentBox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
        }
      } catch {
        // 读取失败就当整图内容
      }
      this.image = img;
    };
    img.onerror = () => {
      this.imageFailed = true;
    };
    img.src = src;
  }

  appear() {
    this.state = 'appearing';
    this.stateT = 0;
    this.appearAt = this.time;
    this.visible = true;
    if (this.onVisibleChange) this.onVisibleChange(true);
  }

  dismiss() {
    if (!this.visible) return;
    this.state = 'leaving';
    this.stateT = 0;
  }

  tick(dt) {
    this.time += dt;
    this.stateT += dt;

    const D = { appearing: 0.9, leaving: 0.6 };
    if (this.state === 'appearing' && this.stateT >= D.appearing) this.state = 'idle';
    if (this.state === 'leaving' && this.stateT >= D.leaving) {
      this.state = 'hidden';
      this.visible = false;
      if (this.onVisibleChange) this.onVisibleChange(false);
    }
  }

  _params() {
    const t = this.time;
    const st = this.stateT;
    const s = this.state;
    const p = { alpha: 1, scale: 1, bob: 0, breath: 0, rot: 0, ring: 1 };

    if (s === 'hidden') { p.alpha = 0; p.scale = 0; return p; }
    if (s === 'appearing') {
      p.scale = easeOutBack(clamp(st / 0.9));
      p.ring = clamp(st / 0.5);
    } else if (s === 'leaving') {
      const k = clamp(st / 0.6);
      p.scale = 1 - easeInBack(k);
      p.alpha = 1 - k;
      p.ring = 1 - k;
    } else {
      // 出场完成后光环淡出
      p.ring = clamp(1 - (t - this.appearAt) / 0.8, 0, 1);
    }

    // 轻微待机浮动（让宠物看起来是“活的”，不是贴纸）
    p.bob = Math.sin(t * 2.1) * 0.05;
    p.breath = Math.sin(t * 1.7) * 0.02;
    p.rot = Math.sin(t * 0.7) * 0.03;

    return p;
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const p = this._params();
    if (p.alpha <= 0) return;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = p.alpha;

    const R = this.R;
    const groundY = this.cy + R * 1.35;
    const petY = this.cy + (p.bob + 0) * R;

    // 地面阴影 + 召唤光环（固定在地面）
    ctx.save();
    ctx.translate(this.cx, groundY);
    ctx.scale(R, R);
    drawShadow(ctx, p);
    drawRing(ctx, p.ring);
    ctx.restore();

    // 宠物本体（图片锚点在脚底，程序化锚点在身体中心）
    const imageMode = this.image && this.contentBox;
    const anchorY = imageMode ? petY : petY - 0.85 * R;
    ctx.save();
    ctx.translate(this.cx, anchorY);
    ctx.scale(R * p.scale, R * p.scale);
    ctx.rotate(p.rot);
    if (imageMode) {
      this._drawHalo(ctx, -0.75, 1.0);
      this._drawImage(ctx, p);
    } else {
      this._drawHalo(ctx, 0, 1.6);
      this._drawProcedural(ctx, p);
    }
    ctx.restore();
  }

  _drawHalo(ctx, cy, radius) {
    const g = ctx.createRadialGradient(0, cy, radius * 0.1, 0, cy, radius);
    g.addColorStop(0, 'rgba(140, 220, 140, 0.18)');
    g.addColorStop(1, 'rgba(140, 220, 140, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(-radius, cy - radius, radius * 2, radius * 2);
  }

  _drawImage(ctx, p) {
    const cb = this.contentBox;
    const targetH = 1.6 * (1 + p.breath);
    const aspect = cb.w / cb.h;
    const dw = targetH * aspect;
    // 像素素材用最近邻（锐利），高清素材用平滑
    ctx.imageSmoothingEnabled = !this.pixelated;
    // 底部对齐（脚踩在地面）
    ctx.drawImage(this.image, cb.x, cb.y, cb.w, cb.h, -dw / 2, -targetH, dw, targetH);
    ctx.imageSmoothingEnabled = true;
  }

  _drawProcedural(ctx, p) {
    drawTail(ctx);
    drawEars(ctx);
    drawBody(ctx, p.breath);
    drawFeet(ctx);
    drawArms(ctx);
    drawFace(ctx);
  }
}
