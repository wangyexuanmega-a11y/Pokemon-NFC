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
    this.onImageReady = null; // 图片就绪回调（悬浮窗用它报告宠物尺寸）

    this.image = null;
    this.contentBox = null; // 不透明内容边界 {x,y,w,h}
    this.imageFailed = false;
    this.pixelated = false;
    this.mode = 'image'; // image | frames
    this.frameCount = 1;
    this.fps = 10;
    this.animT = 0;
    this.frame = 0;
    this.frameW = 0;
    this.frameH = 0;
    this.fixedSize = !!opts.fixedSize; // 悬浮窗模式：宠物固定尺寸
    this.size = opts.size || 90;
    this.scaleFactor = 1; // 用户缩放（初始界面滑块调节，持久保存）
    this.groundAt = opts.groundAt || 0.5; // 脚底在画布高度的比例（0.5 = 居中）
    this.fitAboveGround = !!opts.fitAboveGround; // 缩放时限制不超出画布
    this.groundY = 0; // 脚底位置（resize 时算）
    this.maxHeight = Infinity; // 最大显示高度（px）

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
    this.R = this.fixedSize ? this.size : Math.min(this.w, this.h) * 0.26;
    this.groundY = this.h * this.groundAt;
    this.maxHeight = this.fitAboveGround ? Math.max(30, this.groundY - 4) : Infinity;
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
      // 图片就绪时若正在出场，重播出场动画（避免闪现空白/旧素材）
      if (this.state === 'appearing') this.stateT = 0;
      if (this.onImageReady) this.onImageReady();
    };
    img.onerror = () => {
      this.imageFailed = true;
    };
    img.src = src;
  }

  /** 帧动画素材：图带（帧横向排列）+ 帧数/fps */
  setFrames(src, cfg) {
    this.mode = 'frames';
    this.pixelated = true; // 像素素材最近邻缩放
    this.image = null;
    this.contentBox = null;
    this.imageFailed = false;
    this.frameCount = (cfg && cfg.frames) || 2;
    this.fps = (cfg && cfg.fps) || 10;
    this.animT = 0;
    this.frame = 0;
    this.frameW = 0;
    this.frameH = 0;
    const img = new Image();
    img.onload = () => {
      this.frameW = img.naturalWidth / this.frameCount;
      this.frameH = img.naturalHeight;
      // 各帧内容边界取并集（用于悬浮窗贴合尺寸）
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cc = c.getContext('2d', { willReadFrequently: true });
        cc.drawImage(img, 0, 0);
        const data = cc.getImageData(0, 0, c.width, c.height).data;
        const fw = Math.round(this.frameW);
        const fh = Math.round(this.frameH);
        let minX = fw, minY = fh, maxX = 0, maxY = 0;
        for (let f = 0; f < this.frameCount; f++) {
          const ox = f * fw;
          for (let y = 0; y < fh; y++) {
            for (let x = 0; x < fw; x++) {
              if (data[((y * c.width) + ox + x) * 4 + 3] > 24) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
        }
        if (maxX >= minX && maxY >= minY) {
          this.contentBox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
        }
      } catch (e) { /* ignore */ }
      this.image = img;
      // 图片就绪时若正在出场，重播出场动画（避免闪现空白/旧素材）
      if (this.state === 'appearing') this.stateT = 0;
      if (this.onImageReady) this.onImageReady();
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

    // 帧动画推进
    if (this.mode === 'frames' && this.image && this.frameCount > 1) {
      this.animT += dt;
      this.frame = Math.floor(this.animT * this.fps) % this.frameCount;
    }
  }

  _params() {
    const t = this.time;
    const st = this.stateT;
    const s = this.state;
    const p = { alpha: 1, scale: 1, bob: 0, breath: 0, rot: 0 };

    if (s === 'hidden') { p.alpha = 0; p.scale = 0; return p; }
    if (s === 'appearing') {
      p.scale = easeOutBack(clamp(st / 0.9));
    } else if (s === 'leaving') {
      const k = clamp(st / 0.6);
      p.scale = 1 - easeInBack(k);
      p.alpha = 1 - k;
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

    // 素材未就绪：不绘制任何内容（不再显示占位图案）
    if (!(this.image && this.contentBox)) return;

    const R = this.R;
    const petY = this.groundY + p.bob * R;

    // 宠物本体（锚点在脚底）
    ctx.save();
    ctx.translate(this.cx, petY);
    ctx.scale(R * p.scale, R * p.scale);
    ctx.rotate(p.rot);
    this._drawImage(ctx, p);
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
    // 限制最大高度，保证缩放后不出画布
    const targetH = Math.min(1.6 * (1 + p.breath) * this.scaleFactor, this.maxHeight / this.R);
    const scale = targetH / cb.h;
    // 像素素材用最近邻（锐利），高清素材用平滑
    ctx.imageSmoothingEnabled = !this.pixelated;
    if (this.mode === 'frames') {
      const sx = Math.round(this.frame * this.frameW);
      const fw = Math.round(this.frameW);
      const fh = Math.round(this.frameH);
      const dw = fw * scale;
      const dh = fh * scale;
      // 底部对齐（脚踩在地面）
      ctx.drawImage(this.image, sx, 0, fw, fh, -dw / 2, -dh, dw, dh);
    } else {
      const dw = cb.w * scale;
      const dh = targetH;
      ctx.drawImage(this.image, cb.x, cb.y, cb.w, cb.h, -dw / 2, -dh, dw, dh);
    }
    ctx.imageSmoothingEnabled = true;
  }

  /** 宠物内容显示尺寸（px） */
  getDisplaySize() {
    const cb = this.contentBox;
    if (!cb) return null;
    const targetH = Math.min(1.6 * this.R * this.scaleFactor, this.maxHeight);
    const scale = targetH / cb.h;
    return { w: cb.w * scale, h: targetH };
  }

  /** 完整帧格尺寸（px），悬浮窗贴合用（避免动画边缘被裁剪） */
  getFrameBox() {
    const cb = this.contentBox;
    if (!cb) return null;
    const targetH = Math.min(1.6 * this.R * this.scaleFactor, this.maxHeight);
    const s = targetH / cb.h;
    if (this.mode === 'frames') {
      return { w: this.frameW * s, h: this.frameH * s };
    }
    return { w: cb.w * s, h: targetH };
  }
}
