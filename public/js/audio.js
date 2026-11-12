/**
 * 音频：默认无限循环《太上清静经》，但必须诚实处理「本机没有诵经人声音轨」这件事。
 *
 * 三级降级：
 *   1. public/audio/qingjingjing.mp3 存在 → 循环播放真人诵经，Web Audio 合成层降到环境垫底。
 *   2. 文件不存在 → 纯 Web Audio 实时合成道乐（低频 drone + 磬泛音 + 木鱼 + 风声水声），
 *      UI 明确标注「当前为合成道乐，未检测到诵经音轨」，绝不谎称有诵经人声。
 *   3. 浏览器未解锁音频 → 静音等待，由「入观」按钮的用户手势解锁（自动播放策略硬性要求）。
 *
 * 全部本地、零额度、零外链。页面隐藏时挂起，回来再继续。
 */
export class TaoAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.track = null;
    this.mode = 'pending';       // pending | synth | track
    this.trackNote = '未启动';
    this.unlocked = false;
    this.volume = 0.85;
    this.muted = false;
    this.nodes = [];
    this.timers = [];
    this.onModeChange = null;
    this.recitation = null;
    this.onRecitationMissing = null;
    this.onRecitationEnd = null;

    document.addEventListener('visibilitychange', () => {
      if (!this.unlocked) return;
      if (document.hidden) {
        try { this.ctx.suspend(); } catch { /* ignore */ }
        if (this.track) this.track.pause();
      } else {
        try { this.ctx.resume(); } catch { /* ignore */ }
        if (this.track) this.track.play().catch(() => {});
      }
    });
  }

  async unlock() {
    if (this.unlocked) { try { await this.ctx.resume(); } catch { /* ignore */ } return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.mode = 'synth'; this.trackNote = '浏览器不支持 Web Audio'; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
    try { await this.ctx.resume(); } catch { /* ignore */ }
    this.unlocked = true;

    // 预生成 1 秒白噪声，供风声 / 水声 / 木鱼复用
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.startAmbient();
    await this.tryTrack();
    this._notify();
  }

  _notify() { if (this.onModeChange) this.onModeChange(this.mode, this.trackNote); }

  async tryTrack(url = './audio/qingjingjing.mp3') {
    let exists = false;
    try {
      const r = await fetch(url, { method: 'HEAD' });
      exists = r.ok;
    } catch { exists = false; }
    if (!exists) {
      this.mode = 'synth';
      this.trackNote = '合成道乐 · 未检测到诵经音轨';
      return;
    }
    const a = new Audio(url);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0.9;
    a.addEventListener('error', () => {
      this.mode = 'synth';
      this.trackNote = '音轨加载失败 · 已切回合成道乐';
      this.track = null;
      this._notify();
    });
    try {
      await a.play();
      this.track = a;
      this.mode = 'track';
      this.trackNote = '《太上清静经》循环播放中';
      // 有真人诵经时，合成层只留很轻的环境垫底
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * .32, this.ctx.currentTime, .6);
    } catch {
      this.mode = 'synth';
      this.trackNote = '浏览器拦截了音轨 · 已切回合成道乐';
    }
  }

  startAmbient() {
    if (!this.unlocked || this.nodes.length) return;
    const ctx = this.ctx, now = ctx.currentTime;

    // 极轻的低频垫底（上一版太重，听感是嗡嗡声）
    const droneGain = ctx.createGain();
    droneGain.gain.value = .018;
    droneGain.connect(this.master);
    for (const f of [65.41, 98.00]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(droneGain); o.start(now);
      this.nodes.push(o);
    }
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = .07; lfoGain.gain.value = .008;
    lfo.connect(lfoGain).connect(droneGain.gain);
    lfo.start(now);
    this.nodes.push(lfo);

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
    const wg = ctx.createGain(); wg.gain.value = .009;
    wind.connect(wf).connect(wg).connect(this.master);
    wind.start(now); this.nodes.push(wind);

    const water = ctx.createBufferSource();
    water.buffer = this.noiseBuf; water.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 1150; bf.Q.value = .7;
    const bg = ctx.createGain(); bg.gain.value = .005;
    water.connect(bf).connect(bg).connect(this.master);
    water.start(now); this.nodes.push(water);

    // 主旋律：五声音阶（宫商角徵羽）编钟，持续循环。
    // 一旦检测到真人诵经音轨，旋律自动停，只留上面的环境垫底，不抢经声。
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
    const phrase = [0, 2, 4, 3, 2, 1, 0, 2, 4, 5, 4, 2, 1, 3, 2, 0, 4, 6, 5, 4, 2, 1, 0, 1];
    let note = 0;
    const melodyStep = () => {
      if (this.track || this.muted || document.hidden) {
        this.melodyTimer = setTimeout(melodyStep, 1200);
        return;
      }
      const f = scale[phrase[note % phrase.length]];
      this._tone(f, 2.7, .085, 'sine');
      this._tone(f * 2.01, 1.7, .026, 'sine', .02);
      this._tone(f * 3.02, 1.0, .010, 'sine', .03);
      note++;
      this.melodyTimer = setTimeout(melodyStep, 2050 + Math.random() * 500);
    };
    melodyStep();

    // 不定时一记引磬
    const qingStep = () => {
      this.qingTimer = setTimeout(() => {
        if (!document.hidden && !this.muted && !this.track) this.qing(.6);
        qingStep();
      }, 9000 + Math.random() * 8000);
    };
    qingStep();
  }

  _tone(freq, dur, gain = .1, type = 'sine', delay = 0) {
    if (!this.unlocked || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + .03);
  }

  _noise(dur, freq, q, gain) {
    if (!this.unlocked || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t); s.stop(t + dur + .02);
  }

  /** 引磬：基频 + 两个泛音，长衰减 */
  qing(scale = 1) {
    const f = 523.25;
    this._tone(f, 3.1 * scale, .090 * scale);
    this._tone(f * 1.51, 2.3 * scale, .034 * scale, 'sine', .01);
    this._tone(f * 2.72, 1.5 * scale, .016 * scale, 'sine', .02);
  }
  /** 木鱼：短促、带木质共鸣 */
  woodfish() { this._noise(.13, 720, 6, .16); this._tone(196, .10, .045, 'triangle'); }
  /** 叩拜：一记低磬 + 轻木鱼 */
  bow() { this._tone(261.63, 1.1, .055); this._noise(.09, 520, 5, .10); }
  /** 跳跃落地 */
  jump() { this._noise(.11, 300, 3, .10); this._tone(130.81, .18, .05, 'triangle'); }
  /** 敕符 / 盖章 */
  seal() { this._noise(.16, 380, 2.5, .16); this._tone(392, .55, .055); }
  /** 打招呼：一声小铜铃 */
  greet() { this._tone(784, .75, .045); this._tone(1176, .45, .020, 'sine', .02); }
  /** 持诵断句 */
  chantBeat() { this.woodfish(); }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.master && this.unlocked) {
      const base = this.mode === 'track' ? .32 : 1;
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * base, this.ctx.currentTime, .05);
    }
    if (this.track) this.track.volume = Math.min(1, this.volume * 1.25);
  }
  /** 点读经文：播放一段标准朗读，同时把背景道乐压低，避免两层声音打架 */
  playRecitation(url, label = '经文') {
    this.stopRecitation();
    // 支持候选列表：先找单篇音轨，没有就回落到「八大神咒连读」合集
    const urls = (Array.isArray(url) ? url : [url]).filter(Boolean);
    let idx = 0;
    const attempt = () => {
      if (idx >= urls.length) {
        this.recitation = null;
        this._unduck();
        if (this.onRecitationMissing) this.onRecitationMissing(label);
        return;
      }
      const a = new Audio(urls[idx++]);
      a.preload = 'auto';
      a.volume = Math.min(1, this.volume);
      let settled = false;
      const fallback = () => {
        if (settled) return;
        settled = true;
        try { a.removeAttribute('src'); } catch { /* ignore */ }
        attempt();
      };
      a.addEventListener('error', fallback);
      a.addEventListener('ended', () => {
        settled = true;
        this.recitation = null;
        this._unduck();
        if (this.onRecitationEnd) this.onRecitationEnd();
      });
      a.play().catch(fallback);
      this.recitation = a;
    };
    attempt();
    this._duck();
  }
  stopRecitation() {
    if (this.recitation) {
      try { this.recitation.pause(); this.recitation.removeAttribute('src'); } catch { /* ignore */ }
      this.recitation = null;
    }
    this._unduck();
  }
  _duck() {
    if (this.master && this.unlocked) this.master.gain.setTargetAtTime(this.volume * .12, this.ctx.currentTime, .2);
    if (this.track) this.track.volume = .10;
  }
  _unduck() {
    const base = this.mode === 'track' ? .32 : 1;
    if (this.master && this.unlocked) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * base, this.ctx.currentTime, .3);
    }
    if (this.track) this.track.volume = Math.min(1, this.volume * 1.25);
  }

  toggleMute() {
    this.muted = !this.muted;
    this.setVolume(this.volume);
    if (this.track) { if (this.muted) this.track.pause(); else this.track.play().catch(() => {}); }
    return this.muted;
  }
}
