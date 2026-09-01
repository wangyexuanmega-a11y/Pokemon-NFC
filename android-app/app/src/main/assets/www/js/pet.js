/* 通用 2D 宠物渲染器
 *
 * 两种素材模式：
 *   1. 透明 PNG 图片：加载后自动裁剪到不透明内容，配合程序化待机动画
 *      （浮动呼吸、摇摆、地面阴影、出场/开心/收起粒子特效）
 *   2. 无图片：回退为程序化绘制的 chibi 皮卡丘（占位）
 *
 * 对外接口：setImage() / appear() / happy() / wave() / dismiss() / tick(dt) / draw()
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

/* ─── 程序化皮卡丘（占位回退） ─── */
function drawTail(ctx, wag) {
  ctx.save();
  ctx.translate(0.72, -0.1);
  ctx.rotate(0.5 + wag);
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

function drawEars(ctx, ear) {
  ctx.save();
  ctx.translate(-0.44, -0.58);
  ctx.rotate(-0.26 + ear);
  drawEar(ctx);
  ctx.restore();
  ctx.save();
  ctx.translate(0.44, -0.58);
  ctx.rotate(0.26 - ear);
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

function drawEye(ctx, x, y, r, blink) {
  ctx.save();
  ctx.translate(x, y);
  const open = blink > 0.9 ? 0.08 : 1;
  ctx.fillStyle = '#2B1B12';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * open, 0, 0, TAU);
  ctx.fill();
  if (blink < 0.5) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(r * 0.3, -r * 0.35, r * 0.26, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawFace(ctx, blink, mouth) {
  drawEye(ctx, -0.32, -0.24, 0.19, blink);
  drawEye(ctx, 0.32, -0.24, 0.19, blink);
  ctx.fillStyle = '#2B1B12';
  ctx.beginPath();
  ctx.ellipse(0, -0.02, 0.045, 0.035, 0, 0, TAU);
  ctx.fill();
  if (mouth > 0) {
    ctx.fillStyle = '#7A2C2C';
    ctx.beginPath();
    ctx.ellipse(0, 0.15, 0.17, 0.1 + 0.08 * mouth, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FF8A8A';
    ctx.beginPath();
    ctx.ellipse(0, 0.24, 0.08, 0.04, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#2B1B12';
    ctx.lineWidth = 0.035;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0.02, 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
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

function drawArm(ctx, x, rot) {
  ctx.save();
  ctx.translate(x, 0.28);
  ctx.rotate(rot);
  ctx.fillStyle = '#F8D030';
  ctx.strokeStyle = '#C9A227';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.ellipse(0, 0.16, 0.14, 0.24, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawArms(ctx, arm) {
  drawArm(ctx, -0.92, -0.4 - arm * 0.7);
  drawArm(ctx, 0.92, 0.4 + arm * 0.7);
}

/* ─── 特效 ─── */
function drawHeart(ctx, s) {
  ctx.fillStyle = '#FF5C8A';
  ctx.beginPath();
  ctx.moveTo(0, s * 0.35);
  ctx.bezierCurveTo(-s, -s * 0.4, -s * 0.45, -s, 0, -s * 0.32);
  ctx.bezierCurveTo(s * 0.45, -s, s, -s * 0.4, 0, s * 0.35);
  ctx.fill();
}

function drawStar(ctx, s) {
  ctx.fillStyle = '#FFD34D';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * (TAU / 5);
    const a2 = a + Math.PI / 5;
    const px = Math.cos(a) * s, py = Math.sin(a) * s;
    const ix = Math.cos(a2) * s * 0.45, iy = Math.sin(a2) * s * 0.45;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
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
    this.state = 'hidden'; // hidden | appearing | idle | happy | waving | leaving
    this.stateT = 0;
    this.time = 0;
    this.appearAt = -10; // 出场时刻（用于光环淡出）
    this.visible = false;
    this.particles = [];
    this.floaters = [];
    this.onVisibleChange = null;

    this.image = null;
    this.contentBox = null; // 不透明内容边界 {x,y,w,h}
    this.imageFailed = false;

    if (opts.image) this.setImage(opts.image);

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

  /** 更换宠物图片（透明 PNG） */
  setImage(src) {
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
    this.spawnParticles();
    if (this.onVisibleChange) this.onVisibleChange(true);
  }

  happy() {
    if (!this.visible || this.state === 'leaving') return;
    this.state = 'happy';
    this.stateT = 0;
    this.spawnFloaters();
  }

  wave() {
    if (!this.visible || this.state === 'leaving') return;
    this.state = 'waving';
    this.stateT = 0;
  }

  dismiss() {
    if (!this.visible) return;
    this.state = 'leaving';
    this.stateT = 0;
  }

  spawnParticles() {
    this.particles = [];
    for (let i = 0; i < 26; i++) {
      const ang = Math.random() * TAU;
      const sp = 0.5 + Math.random() * 1.4;
      this.particles.push({
        x: 0, y: 0,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 0, maxLife: 0.5 + Math.random() * 0.6,
        size: 0.025 + Math.random() * 0.05,
        warm: Math.random() < 0.55,
      });
    }
  }

  spawnFloaters() {
    for (let i = 0; i < 5; i++) {
      this.floaters.push({
        x: (Math.random() - 0.5) * 0.7,
        y: -0.75 + Math.random() * 0.2,
        vy: -(0.55 + Math.random() * 0.55),
        life: 0, maxLife: 1.6 + Math.random() * 0.6,
        size: 0.14 + Math.random() * 0.1,
        kind: Math.random() < 0.7 ? 'heart' : 'star',
      });
    }
  }

  tick(dt) {
    this.time += dt;
    this.stateT += dt;

    const D = { appearing: 0.9, happy: 1.3, waving: 1.3, leaving: 0.6 };
    if (this.state === 'appearing' && this.stateT >= D.appearing) this.state = 'idle';
    if ((this.state === 'happy' || this.state === 'waving') && this.stateT >= D[this.state]) this.state = 'idle';
    if (this.state === 'leaving' && this.stateT >= D.leaving) {
      this.state = 'hidden';
      this.visible = false;
      if (this.onVisibleChange) this.onVisibleChange(false);
    }

    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);

    for (const f of this.floaters) {
      f.life += dt;
      f.y += f.vy * dt;
      f.x += Math.sin(f.life * 6) * 0.015;
    }
    this.floaters = this.floaters.filter((f) => f.life < f.maxLife);
  }

  _params() {
    const t = this.time;
    const st = this.stateT;
    const s = this.state;
    const p = { alpha: 1, scale: 1, bob: 0, breath: 0, rot: 0, jump: 0, ring: 1 };

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

    p.bob = Math.sin(t * 2.1) * 0.05;
    p.breath = Math.sin(t * 1.7) * 0.02;
    p.rot = Math.sin(t * 0.7) * 0.03;

    if (s === 'happy' || s === 'waving') {
      const prog = st / 1.3;
      p.jump = Math.sin(prog * Math.PI * 3) * (1 - prog) * 0.26;
      p.rot = s === 'waving' ? Math.sin(st * 10) * 0.14 : Math.sin(st * 6) * 0.06;
    }

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
    const petY = this.cy + (p.bob + p.jump) * R;

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

    // 特效粒子
    ctx.save();
    ctx.translate(this.cx, petY);
    ctx.scale(R, R);
    this._drawParticles(ctx);
    this._drawFloaters(ctx);
    ctx.restore();
  }

  _drawHalo(ctx, cy, radius) {
    const g = ctx.createRadialGradient(0, cy, radius * 0.1, 0, cy, radius);
    g.addColorStop(0, 'rgba(140, 220, 140, 0.22)');
    g.addColorStop(1, 'rgba(140, 220, 140, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(-radius, cy - radius, radius * 2, radius * 2);
  }

  _drawImage(ctx, p) {
    const cb = this.contentBox;
    const targetH = 1.6 * (1 + p.breath);
    const aspect = cb.w / cb.h;
    const dw = targetH * aspect;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // 底部对齐（脚踩在地面）
    ctx.drawImage(this.image, cb.x, cb.y, cb.w, cb.h, -dw / 2, -targetH, dw, targetH);
  }

  _drawProcedural(ctx, p) {
    const t = this.time;
    const ear = Math.sin(t * 0.9) * 0.03;
    const tail = Math.sin(t * 1.3) * 0.16;
    const cyc = t % 3.0;
    let blink = 0;
    if (cyc < 0.12) blink = 1;
    else if (cyc < 0.2) blink = 1 - (cyc - 0.12) / 0.08;
    const mouth = this.state === 'happy' || this.state === 'waving' ? 1 : 0;
    const arm = this.state === 'waving'
      ? Math.abs(Math.sin(this.stateT * 9))
      : (this.state === 'happy' ? 0.35 : 0);

    drawTail(ctx, tail);
    drawEars(ctx, ear);
    drawBody(ctx, p.breath);
    drawFeet(ctx);
    drawArms(ctx, arm);
    drawFace(ctx, blink, mouth);
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      const k = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.warm ? `rgba(248,208,48,${k})` : `rgba(0,212,255,${k})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
  }

  _drawFloaters(ctx) {
    for (const f of this.floaters) {
      const k = 1 - f.life / f.maxLife;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.globalAlpha = k;
      if (f.kind === 'heart') drawHeart(ctx, f.size);
      else drawStar(ctx, f.size);
      ctx.restore();
    }
  }
}
