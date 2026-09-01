/* 精灵图集播放器（真实 2D 素材接入用）
 *
 * 现在项目用的是程序化绘制的皮卡丘占位（见 pikachu.js）。
 * 等你提供真正的 spritesheet（透明 PNG/WebP + atlas 配置），用这个类替换即可，
 * 对外接口与 pikachu.js 的 PikachuPet 保持一致：
 *   appear() / happy() / wave() / dismiss() / tick(dt) / draw()
 *
 * atlas 规范（兼容 agent-pet 的 Codex 8×9 图集）：
 *   {
 *     cols: 8, rows: 9,           // 图集网格
 *     rowsDef: [                  // 每行 = 一个动画状态
 *       { index: 0, id: 'idle',    frames: 8, fps: 6 },
 *       { index: 1, id: 'running', frames: 4, fps: 8 },
 *       { index: 2, id: 'waving',  frames: 4, fps: 6 },
 *       ...
 *     ]
 *   }
 * 默认状态名约定：idle / appear / happy / wave / leave。
 * 每帧在同一个图集里按 (col, row) 取子图，帧宽 = 图宽 / cols，帧高 = 图高 / rows。
 */

export class SpriteSheetPlayer {
  constructor({ canvas, imageUrl, atlas, stateMap = {} }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.imageUrl = imageUrl;
    this.atlas = atlas;
    // stateMap: 把业务状态映射到 atlas 行 id，例如 { happy: 'waving' }
    this.stateMap = stateMap;

    this.img = new Image();
    this.ready = false;
    this.state = 'hidden';
    this.stateT = 0;
    this.time = 0;
    this.frame = 0;
    this.visible = false;
    this.onVisibleChange = null;

    this.img.onload = () => { this.ready = true; };
    this.img.src = imageUrl;
  }

  _row(id) {
    const def = this.atlas.rowsDef.find((r) => r.id === id);
    return def || this.atlas.rowsDef[0];
  }

  _stateRow() {
    const mapped = this.stateMap[this.state] || this.state;
    return this._row(mapped);
  }

  appear() { this._set('appear'); }
  happy() { if (!this.visible) return; this._set('happy'); }
  wave() { if (!this.visible) return; this._set('wave'); }
  dismiss() { if (!this.visible) return; this._set('leave'); }

  _set(state) {
    this.state = state;
    this.stateT = 0;
    this.frame = 0;
    this.visible = true;
    if (this.onVisibleChange) this.onVisibleChange(true);
  }

  tick(dt) {
    this.time += dt;
    this.stateT += dt;
    if (!this.ready) return;

    const row = this._stateRow();
    const dur = row.frames / row.fps;

    // 一次性状态播完回到 idle；idle 循环；leave 播完隐藏
    if (this.state === 'appear' || this.state === 'happy' || this.state === 'wave') {
      if (this.stateT >= dur) { this.state = 'idle'; this.stateT = 0; }
    } else if (this.state === 'leave') {
      if (this.stateT >= dur) {
        this.state = 'hidden';
        this.visible = false;
        if (this.onVisibleChange) this.onVisibleChange(false);
      }
    }

    if (row.loop !== false && this.state !== 'hidden') {
      this.frame = Math.floor(this.stateT * row.fps) % row.frames;
    } else {
      this.frame = Math.min(Math.floor(this.stateT * row.fps), row.frames - 1);
    }
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.ready || !this.visible || this.state === 'hidden') return;

    const { cols, rows } = this.atlas;
    const fw = this.img.naturalWidth / cols;
    const fh = this.img.naturalHeight / rows;
    const row = this._stateRow();
    const sx = this.frame * fw;
    const sy = row.index * fh;

    // 居中绘制，等比缩放到画布短边的一定比例
    const scale = Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * 0.8 / fw;
    const dw = fw * scale;
    const dh = fh * scale;
    const dx = (this.canvas.clientWidth - dw) / 2;
    const dy = (this.canvas.clientHeight - dh) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.img, sx, sy, fw, fh, dx, dy, dw, dh);
  }
}
