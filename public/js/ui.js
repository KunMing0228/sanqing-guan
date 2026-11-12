import { QINGJING_LINES, QINGJING_TITLE, MANTRAS, POSTSCRIPT } from './scripture.js';

/**
 * DOM 层：只负责界面渲染与事件转发，不持有任何业务状态。
 * 所有动作通过 cb 回调交给 main.js，方便单独替换界面或做测试。
 */
export class UI {
  constructor(cb = {}) {
    this.cb = cb;
    this.$ = (id) => document.getElementById(id);
    this.gender = 'm';
    this.emoji = 0;
    this.mantra = 0;
    this.tab = 'jing';
    this.chanting = false;
    this.stripOn = true;
    this.talisman = null;
    this._bind();
    this._renderScripture();
  }

  attachTalisman(t) {
    this.talisman = t;
    this.$('brushWidth').addEventListener('input', (e) => {
      t.setWidth(Number(e.target.value));
      this.$('brushVal').textContent = e.target.value;
    });
    document.querySelectorAll('.swatch').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        t.setColor(b.dataset.color);
      });
    });
    this.$('guideToggle').addEventListener('change', (e) => t.setGuide(e.target.checked));
    this.$('btnUndo').addEventListener('click', () => t.undo());
    this.$('btnClearFu').addEventListener('click', () => t.clear());
    this.$('btnSeal').addEventListener('click', () => t.seal());
    this.$('btnDownloadFu').addEventListener('click', () => t.download());
    this.$('btnPostFu').addEventListener('click', () => {
      const url = t.post();
      if (this.cb.onPostTalisman) this.cb.onPostTalisman(url);
    });
  }

  _bind() {
    // 入观页
    document.querySelectorAll('.gender-card').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.gender-card').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        this.gender = b.dataset.g;
      });
    });
    this.$('enterBtn').addEventListener('click', () => {
      if (this.cb.onEnter) this.cb.onEnter({ gender: this.gender, hall: this.$('hallSelect').value || null });
    });

    // 底部动作栏
    document.querySelectorAll('.act').forEach((b) => {
      b.addEventListener('click', () => { if (this.cb.onAct) this.cb.onAct(b.dataset.act); });
    });

    // 顶部按钮
    this.$('btnSound').addEventListener('click', () => { if (this.cb.onToggleMute) this.cb.onToggleMute(); });
    this.$('btnScripture').addEventListener('click', () => this.togglePanel('panelScripture'));
    this.$('btnWall').addEventListener('click', () => this.togglePanel('panelWall'));
    this.$('btnPaintings').addEventListener('click', () => this.togglePanel('panelPaintings'));
    this.$('btnSettings').addEventListener('click', () => this.togglePanel('panelSettings'));

    // 面板关闭
    document.querySelectorAll('[data-close]').forEach((b) => {
      b.addEventListener('click', () => this.closePanel(b.dataset.close));
    });

    // 打招呼
    this.$('greetSend').addEventListener('click', () => {
      if (this.cb.onGreet) this.cb.onGreet({
        e: this.emoji,
        to: this.$('greetTarget').value || null,
        g: this.$('geoInclude').checked ? 1 : 0
      });
    });

    // 经文 tabs
    document.querySelectorAll('.tab').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        this.tab = b.dataset.tab;
        this.$('tabJing').classList.toggle('hidden', this.tab !== 'jing');
        this.$('tabZhou').classList.toggle('hidden', this.tab !== 'zhou');
        this.$('tabZan').classList.toggle('hidden', this.tab !== 'zan');
      });
    });
    this.$('mantraSelect').addEventListener('change', (e) => {
      this.mantra = Number(e.target.value) || 0;
      this._renderMantra();
    });
    this.$('btnListen').addEventListener('click', () => {
      if (this.cb.onRecitation) this.cb.onRecitation('play', this.tab, this.mantra);
    });
    this.$('btnStopListen').addEventListener('click', () => {
      if (this.cb.onRecitation) this.cb.onRecitation('stop');
    });
    this.$('btnChant').addEventListener('click', () => {
      this.chanting = !this.chanting;
      this.setChanting(this.chanting);
      if (this.cb.onChantToggle) this.cb.onChantToggle(this.chanting);
    });

    // 设置
    document.querySelectorAll('.seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        this.setLookActive(b.dataset.look);
        if (this.cb.onLook) this.cb.onLook(b.dataset.look);
      });
    });
    this.$('btnRename').addEventListener('click', () => { if (this.cb.onRename) this.cb.onRename(); });
    this.$('volSlider').addEventListener('input', (e) => {
      this.$('volVal').textContent = e.target.value;
      if (this.cb.onVolume) this.cb.onVolume(Number(e.target.value) / 100);
    });
    this.$('qualitySel').addEventListener('change', (e) => { if (this.cb.onQuality) this.cb.onQuality(e.target.value); });
    this.$('hallSwitch').addEventListener('change', (e) => { if (this.cb.onHallChange) this.cb.onHallChange(e.target.value || null); });
    this.$('stripToggle').addEventListener('change', (e) => {
      this.stripOn = e.target.checked;
      this.$('scriptureStrip').classList.toggle('hidden', !this.stripOn);
    });
    this.$('motionToggle').addEventListener('change', (e) => { if (this.cb.onMotionToggle) this.cb.onMotionToggle(e.target.checked); });

    // 键盘：ESC 关面板
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAll();
    });
  }

  _renderScripture() {
    const box = this.$('jingLines');
    box.innerHTML = '';
    QINGJING_LINES.forEach((line, i) => {
      const d = document.createElement('div');
      d.className = 'jing-line';
      d.dataset.i = String(i);
      d.textContent = line;
      box.appendChild(d);
    });
    const sel = this.$('mantraSelect');
    sel.innerHTML = '';
    MANTRAS.forEach((m, i) => {
      const o = document.createElement('option');
      o.value = String(i); o.textContent = m.name;
      sel.appendChild(o);
    });
    this._renderMantra();
    const post = this.$('postText');
    post.innerHTML = '';
    POSTSCRIPT.forEach((p) => {
      const el = document.createElement('p'); el.textContent = p; post.appendChild(el);
    });
    this.setScriptureLine('人能常清静，天地悉皆归。', QINGJING_TITLE);
  }

  _renderMantra() {
    const m = MANTRAS[this.mantra] || MANTRAS[0];
    const box = this.$('mantraText');
    box.innerHTML = '';
    const h = document.createElement('div');
    h.style.cssText = 'font-size:15px;color:#d9b46a;margin-bottom:10px';
    h.textContent = m.name;
    box.appendChild(h);
    m.lines.forEach(l => { const p = document.createElement('p'); p.textContent = l; box.appendChild(p); });
  }

  currentChantLines() {
    return this.tab === 'zhou' ? (MANTRAS[this.mantra] || MANTRAS[0]).lines : QINGJING_LINES;
  }
  currentChantTitle() {
    return this.tab === 'zhou' ? (MANTRAS[this.mantra] || MANTRAS[0]).name : QINGJING_TITLE;
  }

  setChantLine(i, text) {
    document.querySelectorAll('.jing-line').forEach((el) => {
      el.classList.toggle('active', Number(el.dataset.i) === i && this.tab === 'jing');
    });
    this.setScriptureLine(text, this.currentChantTitle());
    if (this.tab === 'jing') {
      const el = document.querySelector(`.jing-line[data-i="${i}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  setChanting(v) {
    this.chanting = !!v;
    this.$('btnChant').textContent = this.chanting ? '停止持诵' : '开始持诵';
    this.$('chantInfo').textContent = this.chanting ? '持诵中…' : '每 2.4 秒一句，配一记木鱼；持诵计数由服务端记录';
  }
  setRecitationState(text) {
    const el = this.$('reciteInfo');
    if (el) el.textContent = text;
  }

  setScriptureLine(text, meta) {
    this.$('scriptureLine').textContent = text || '';
    if (meta) this.$('scriptureMeta').textContent = meta;
  }

  setGateHalls(list) {
    const a = this.$('hallSelect'), b = this.$('hallSwitch');
    a.innerHTML = '<option value="">自动安排（人少的殿）</option>';
    b.innerHTML = '<option value="">自动安排</option>';
    (list || []).forEach((h) => {
      const o1 = document.createElement('option'); o1.value = h.id; o1.textContent = `${h.name} · ${h.online} 人`; a.appendChild(o1);
      const o2 = document.createElement('option'); o2.value = h.id; o2.textContent = h.name; b.appendChild(o2);
    });
  }

  hideGate() { this.$('gate').classList.add('hidden'); }
  showHUD() {
    ['hudTop', 'hudLeft', 'hudBottom'].forEach(id => this.$(id).classList.remove('hidden'));
    if (this.stripOn) this.$('scriptureStrip').classList.remove('hidden');
  }

  setWelcome(w) {
    this.$('hallName').textContent = w.hall.name;
    this.$('hallSub').textContent = w.hall.subtitle || '';
    this.$('myName').textContent = w.you.name;
    this.setLookActive(w.you.gender);
    this.setGeo(w.geo && w.geo.text ? w.geo.text : '未知地域');
    this.renderEmojis(w.emojis || []);
    this.setGreetTargets(w.players || [], w.you.id);
    this.setCounters(w.you);
    this.setStats(w.stats);
    this.setGateHalls(w.halls);
    this.$('hallSwitch').value = w.hall.id;
    this.renderWall(w.talismans || []);
    this.renderPaintings(w.paintings || []);
  }

  renderEmojis(list) {
    const box = this.$('emojiGrid');
    box.innerHTML = '';
    list.forEach((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji' + (e.id === this.emoji ? ' sel' : '');
      b.dataset.e = String(e.id);
      b.innerHTML = `<i></i><small></small>`;
      b.querySelector('i').textContent = e.glyph;
      b.querySelector('small').textContent = e.label;
      b.addEventListener('click', () => {
        this.emoji = e.id;
        box.querySelectorAll('.emoji').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
      });
      box.appendChild(b);
    });
  }

  setGreetTargets(players, meId) {
    const sel = this.$('greetTarget');
    const prev = sel.value;
    sel.innerHTML = '<option value="">同殿众人</option>';
    players.filter(p => p.id !== meId && !p.npc).forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    });
    if ([...sel.options].some(o => o.value === prev)) sel.value = prev;
  }

  renderWall(items) {
    const box = this.$('wallGrid');
    box.innerHTML = '';
    if (!items.length) {
      box.innerHTML = '<div class="wall-empty">还没有人张贴符箓。画一道，贴上来看看。</div>';
      return;
    }
    items.slice(-12).forEach((it) => {
      const d = document.createElement('div'); d.className = 'wall-item';
      const img = document.createElement('img');
      img.src = it.src; img.alt = '匿名道友的符箓'; img.loading = 'lazy';
      const s = document.createElement('span'); s.textContent = it.name || '无名道友';
      d.appendChild(img); d.appendChild(s); box.appendChild(d);
    });
  }
  addWallItem(item) {
    const box = this.$('wallGrid');
    if (box.querySelector('.wall-empty')) box.innerHTML = '';
    const d = document.createElement('div'); d.className = 'wall-item';
    const img = document.createElement('img'); img.src = item.src; img.alt = '匿名道友的符箓';
    const s = document.createElement('span'); s.textContent = item.name || '无名道友';
    d.appendChild(img); d.appendChild(s);
    box.prepend(d);
    while (box.children.length > 12) box.lastChild.remove();
  }

  attachPaint(p) {
    this.paint = p;
    this.$('paintWidth').addEventListener('input', (e) => {
      p.setWidth(Number(e.target.value));
      this.$('paintWidthVal').textContent = e.target.value;
    });
    document.querySelectorAll('.paint-swatches .swatch').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.paint-swatches .swatch').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        p.setColor(b.dataset.color);
      });
    });
    this.$('btnPaintUndo').addEventListener('click', () => p.undo());
    this.$('btnPaintClear').addEventListener('click', () => p.clear());
    this.$('btnPaintSave').addEventListener('click', () => p.download());
    this.$('btnPostPaint').addEventListener('click', () => {
      const url = p.post();
      if (!url) { this.toast('还是白纸，先画两笔'); return; }
      if (this.cb.onPostPaint) this.cb.onPostPaint(url);
    });
  }

  renderPaintings(list) {
    const box = this.$('paintGrid');
    if (!box) return;
    box.innerHTML = '';
    const items = (list || []).filter(it => it && it.src);
    if (!items.length) {
      const d = document.createElement('div');
      d.className = 'wall-empty';
      d.textContent = '画墙还空着，点「画画」画一幅贴上去';
      box.appendChild(d);
      return;
    }
    items.slice(-8).reverse().forEach((it) => {
      const d = document.createElement('div'); d.className = 'wall-item';
      const img = document.createElement('img');
      img.src = it.src; img.alt = '同殿道友的画作'; img.loading = 'lazy';
      const s = document.createElement('span'); s.textContent = it.name || '无名道友';
      d.appendChild(img); d.appendChild(s); box.appendChild(d);
    });
  }
  addPainting(item) {
    const box = this.$('paintGrid');
    if (!box) return;
    if (box.querySelector('.wall-empty')) box.innerHTML = '';
    const d = document.createElement('div'); d.className = 'wall-item';
    const img = document.createElement('img'); img.src = item.src; img.alt = '同殿道友的画作';
    const s = document.createElement('span'); s.textContent = item.name || '无名道友';
    d.appendChild(img); d.appendChild(s);
    box.prepend(d);
    while (box.children.length > 8) box.lastChild.remove();
  }

  setGeo(text) { this.$('geoPreview').textContent = text || '未知地域'; }
  setStats(s) {
    if (!s) return;
    this.$('onlineNum').textContent = String(s.online ?? 0);
    this.$('cOnline').textContent = String(s.online ?? 0);
    const t = s.totals || {};
    const total = (t.bows || 0) + (t.beads || 0) + (t.chants || 0);
    this.$('cTotal').textContent = String(total);
  }
  setCounters(v) {
    if (!v) return;
    this.$('cBows').textContent = String(v.bows || 0);
    this.$('cBeads').textContent = String(v.beads || 0);
    this.$('cMuyu').textContent = String(v.muyu || 0);
    this.$('cChants').textContent = String(v.chants || 0);
    this.$('cMerit').textContent = String(v.merit || 0);
  }
  setLookActive(g) {
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.look === g));
    const tag = this.$('genderTag');
    tag.textContent = g === 'f' ? '道姑' : '道士';
    tag.style.color = g === 'f' ? '#e0a9c0' : '#9fc4d8';
  }
  setAudioMode(mode, note) {
    const label = mode === 'track' ? '《太上清静经》循环' : (mode === 'synth' ? '合成道乐（无诵经音轨）' : '音频待解锁');
    this.$('audioMode').textContent = label;
    this.$('audioDetail').textContent = `音频：${note || label}。把 qingjingjing.mp3 放进 public/audio/ 即自动循环真人诵经。`;
  }
  setMuted(muted) {
    const b = this.$('btnSound');
    b.textContent = muted ? '♪̸' : '♪';
    b.classList.toggle('off', muted);
  }
  setQuality(q) { this.$('qualitySel').value = q; }
  setOffline(reason) {
    const c = this.$('statusChip');
    c.textContent = `单人静修 · ${reason}（多人功能不可用）`;
    c.classList.remove('hidden');
  }
  clearOffline() { this.$('statusChip').classList.add('hidden'); }

  toast(text) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    this.$('toastBox').appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }
  setState(title, text, icon = '☯') {
    this.$('stateTitle').textContent = title;
    this.$('stateText').textContent = text;
    this.$('stateIcon').textContent = icon;
    this.$('stateOverlay').classList.remove('hidden');
  }
  clearState() { this.$('stateOverlay').classList.add('hidden'); }

  openPanel(id) {
    this.closeAll();
    this.$(id).classList.remove('hidden');
  }
  closePanel(id) { this.$(id).classList.add('hidden'); }
  togglePanel(id) {
    const el = this.$(id);
    const willOpen = el.classList.contains('hidden');
    this.closeAll();
    if (willOpen) el.classList.remove('hidden');
  }
  closeAll() {
    ['panelGreet', 'panelTalisman', 'panelScripture', 'panelWall',
      'panelPaint', 'panelPaintings', 'panelSettings']
      .forEach(id => this.$(id).classList.add('hidden'));
  }
}
