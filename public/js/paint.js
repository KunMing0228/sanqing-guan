/**
 * 殿内画画用的纸：自由涂画，画完可以「张贴到殿墙」，别人进殿就能看到。
 *
 * 约束（和画符一致的安全口径）：
 *  - 只导出位图（JPEG/PNG），不含任何文字输入，因此协议层没有可传的文字字段；
 *  - 导出前按体积压到服务端上限以内，超限自动降质/缩放，不会把消息撑爆；
 *  - 画布尺寸固定 480×620（3:4 挂屏比例），贴到墙上不会变形。
 */
const W = 480;
const H = 620;

export class PaintCanvas {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.W = W;
    this.H = H;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d');
    this.color = opts.color || '#3a5b8c';
    this.width = 8;
    this.strokes = [];
    this.current = null;
    this.onSound = opts.onSound || (() => {});
    this.redraw();
    this._bind();
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height)
    };
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.current = { color: this.color, width: this.width, pts: [this._pt(e)] };
      this.redraw();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.current) return;
      e.preventDefault();
      this.current.pts.push(this._pt(e));
      this.redraw();
    });
    const end = (e) => {
      if (!this.current) return;
      if (e && e.clientX !== undefined) this.current.pts.push(this._pt(e));
      this.strokes.push(this.current);
      this.current = null;
      this.redraw();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', end);
  }

  setColor(v) { this.color = v; }
  setWidth(n) { this.width = Math.max(2, Math.min(30, Number(n) || 8)); }
  undo() { if (this.strokes.length) { this.strokes.pop(); this.redraw(); } }
  clear() { this.strokes = []; this.current = null; this.redraw(); }
  get isEmpty() { return this.strokes.length === 0; }

  _paper(x) {
    // 米白宣纸底 + 淡淡纸纹，贴到墙上像一张真的画
    x.fillStyle = '#fdf7e7';
    x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(190,170,130,.28)';
    x.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      x.beginPath();
      x.moveTo(0, 30 + i * 33);
      x.lineTo(W, 26 + i * 33 + (i % 3) * 2);
      x.stroke();
    }
    x.strokeStyle = 'rgba(163,116,42,.45)';
    x.lineWidth = 6;
    x.strokeRect(10, 10, W - 20, H - 20);
  }

  _stroke(x, s) {
    const pts = s.pts;
    x.strokeStyle = s.color;
    x.lineWidth = s.width;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    if (pts.length === 1) {
      x.beginPath();
      x.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2);
      x.fillStyle = s.color;
      x.fill();
      return;
    }
    x.beginPath();
    x.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      x.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    x.lineTo(last.x, last.y);
    x.stroke();
  }

  redraw() {
    const x = this.ctx;
    this._paper(x);
    for (const s of this.strokes) this._stroke(x, s);
    if (this.current) this._stroke(x, this.current);
  }

  /** 导出成 JPEG：先按质量试，超字节上限就降质量，再不行缩尺寸 */
  exportJpeg(maxChars = 170000) {
    for (const [q, k] of [[0.82, 1], [0.7, 1], [0.62, 1], [0.7, .82], [0.6, .7]]) {
      let src = this.canvas;
      if (k !== 1) {
        const tmp = document.createElement('canvas');
        tmp.width = Math.round(W * k);
        tmp.height = Math.round(H * k);
        tmp.getContext('2d').drawImage(this.canvas, 0, 0, tmp.width, tmp.height);
        src = tmp;
      }
      const url = src.toDataURL('image/jpeg', q);
      if (url.length <= maxChars) return url;
    }
    const tmp = document.createElement('canvas');
    tmp.width = Math.round(W * .55);
    tmp.height = Math.round(H * .55);
    tmp.getContext('2d').drawImage(this.canvas, 0, 0, tmp.width, tmp.height);
    return tmp.toDataURL('image/jpeg', 0.5);
  }

  post() {
    if (this.isEmpty) return null;
    this.onSound('seal');
    return this.exportJpeg();
  }

  download() {
    const a = document.createElement('a');
    a.href = this.canvas.toDataURL('image/png');
    a.download = '三清观画作.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
