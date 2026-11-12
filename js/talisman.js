/**
 * 画符：黄纸 + 朱砂毛笔 + 符头三勾参考线 + 敕符盖印 + 导出 / 张贴。
 * 纯 2D Canvas，无外部素材、无 AI 生图、零额度。
 * 张贴出去的是 PNG data URL，服务端只接受 data:image/png;base64 且 ≤120KB。
 */
export class TalismanPaper {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    this.strokes = [];
    this.current = null;
    this.color = '#b3261e';
    this.width = 10;
    this.sealed = false;
    this.showGuide = true;
    this.onPost = opts.onPost || (() => {});
    this.onSound = opts.onSound || (() => {});
    canvas.style.touchAction = 'none';
    this._bind();
    this.redraw();
  }

  _paper() {
    const x = this.ctx, W = this.W, H = this.H;
    x.fillStyle = '#e9d395';
    x.fillRect(0, 0, W, H);
    // 固定种子的纤维噪点，避免每次重绘抖动
    let s = 20261112;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 1100; i++) {
      x.strokeStyle = `rgba(${140 + r() * 40},${110 + r() * 40},${55 + r() * 40},${.025 + r() * .05})`;
      x.lineWidth = .7;
      const px = r() * W, py = r() * H;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + r() * 34, py + r() * 7); x.stroke();
    }
    for (let i = 0; i < 30; i++) {
      x.fillStyle = `rgba(150,110,60,${.015 + r() * .03})`;
      x.beginPath(); x.arc(r() * W, r() * H, 10 + r() * 30, 0, Math.PI * 2); x.fill();
    }
    const v = x.createRadialGradient(W / 2, H / 2, W * .3, W / 2, H / 2, H * .62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(92,62,22,.22)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(122,84,32,.38)'; x.lineWidth = 4;
    x.strokeRect(16, 16, W - 32, H - 32);
  }

  _guide() {
    if (!this.showGuide) return;
    const x = this.ctx, W = this.W, H = this.H, cx = W / 2;
    x.save();
    x.strokeStyle = 'rgba(150,60,40,.20)';
    x.lineWidth = 2;
    x.setLineDash([7, 9]);
    // 符头三勾
    for (let i = 0; i < 3; i++) {
      const y = 66 + i * 30;
      x.beginPath();
      x.arc(cx - 44 + i * 44, y, 22, Math.PI * 1.05, Math.PI * 1.95);
      x.stroke();
    }
    // 中轴
    x.beginPath(); x.moveTo(cx, 130); x.lineTo(cx, H - 90); x.stroke();
    // 符胆框
    x.strokeRect(cx - 78, H * .40, 156, 110);
    // 符脚
    x.beginPath(); x.moveTo(cx - 60, H - 96); x.lineTo(cx, H - 52); x.lineTo(cx + 60, H - 96); x.stroke();
    x.setLineDash([]);
    x.font = '18px "Microsoft YaHei",sans-serif';
    x.fillStyle = 'rgba(140,70,45,.28)';
    x.textAlign = 'center';
    x.fillText('符头', cx, 46);
    x.fillText('符胆', cx, H * .40 + 64);
    x.fillText('符脚', cx, H - 28);
    x.restore();
  }

  _stroke(s) {
    const x = this.ctx, pts = s.pts;
    if (!pts.length) return;
    x.save();
    x.strokeStyle = s.color;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.shadowColor = 'rgba(150,40,25,.28)';
    x.shadowBlur = 3;
    if (pts.length === 1) {
      x.fillStyle = s.color;
      x.beginPath(); x.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2); x.fill();
      x.restore(); return;
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dt = Math.max(8, b.t - a.t);
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const speed = dist / dt;                       // px/ms，越快笔锋越细
      const w = Math.max(1.6, s.width * (1 - Math.min(.62, speed * .35)));
      x.lineWidth = w;
      x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
    }
    x.restore();
  }

  _seal() {
    if (!this.sealed) return;
    const x = this.ctx, S = 96;
    x.save();
    x.translate(this.W - S - 42, this.H - S - 46);
    x.rotate(-.09);
    x.globalCompositeOperation = 'multiply';
    x.globalAlpha = .88;
    x.strokeStyle = '#a81f18';
    x.lineWidth = 7;
    x.strokeRect(6, 6, S - 12, S - 12);
    x.lineWidth = 2;
    x.strokeRect(14, 14, S - 28, S - 28);
    x.fillStyle = '#a81f18';
    x.font = 'bold 34px "KaiTi","STKaiti","SimSun",serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('三', S / 2, 34);
    x.fillText('清', S / 2, 68);
    x.restore();
  }

  redraw() {
    this._paper();
    this._guide();
    for (const s of this.strokes) this._stroke(s);
    if (this.current) this._stroke(this.current);
    this._seal();
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.W / r.width),
      y: (e.clientY - r.top) * (this.H / r.height),
      t: performance.now()
    };
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
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
  }

  setColor(c) { this.color = c; }
  setWidth(n) { this.width = Math.max(2, Math.min(26, Number(n) || 10)); }
  setGuide(v) { this.showGuide = !!v; this.redraw(); }
  undo() { if (this.strokes.length) { this.strokes.pop(); this.redraw(); } }
  clear() { this.strokes = []; this.sealed = false; this.redraw(); }
  seal() { this.sealed = true; this.redraw(); this.onSound('seal'); }

  exportPNG(maxChars = 120000) {
    let url = this.canvas.toDataURL('image/png');
    if (url.length > maxChars) {
      const k = Math.sqrt(maxChars / url.length) * .92;
      const tmp = document.createElement('canvas');
      tmp.width = Math.floor(this.W * k);
      tmp.height = Math.floor(this.H * k);
      tmp.getContext('2d').drawImage(this.canvas, 0, 0, tmp.width, tmp.height);
      url = tmp.toDataURL('image/png');
    }
    return url;
  }

  download() {
    const a = document.createElement('a');
    a.href = this.exportPNG(4 * 1024 * 1024);
    a.download = '三清观符箓.png';
    document.body.appendChild(a); a.click(); a.remove();
  }

  post() {
    const url = this.exportPNG(120000);
    this.onPost(url);
    return url;
  }
}
