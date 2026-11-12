/**
 * WebSocket 客户端：自动重连、心跳、连不上就切单人静修模式。
 *
 * 单人静修模式的必要性：GitHub Pages 是纯静态托管，没有 Node 进程也就没有 WebSocket。
 * 这时页面不能白屏，要能完整展示 3D 殿与所有本地交互（拜、跳、画符、诵经、表情），
 * 只是把多人功能置灰并如实标注「未连接」。
 */
export class Net {
  constructor(handlers = {}) {
    this.h = handlers;
    this.ws = null;
    this.manual = false;
    this.failures = 0;
    this.connected = false;
    this.offline = false;
    this.retryTimer = null;
    this.pingTimer = null;
    this.last = { gender: 'm', hall: null };
  }

  connect({ gender = 'm', hall = null } = {}) {
    this.last = { gender, hall };
    this.manual = false;
    const proto = location.protocol;
    if (proto !== 'http:' && proto !== 'https:') {
      this._goOffline('静态页面');
      return;
    }
    // GitHub Pages 没有 WebSocket 服务，别让用户白等三次重连
    if (/github\.io$/i.test(location.hostname)) {
      this._goOffline('GitHub Pages 静态托管');
      return;
    }
    const scheme = proto === 'https:' ? 'wss' : 'ws';
    const q = new URLSearchParams();
    q.set('g', gender === 'f' ? 'f' : 'm');
    if (hall) q.set('hall', hall);
    const url = `${scheme}://${location.host}/ws?${q.toString()}`;

    let ws;
    try { ws = new WebSocket(url); } catch { this._retry(); return; }
    this.ws = ws;

    ws.onopen = () => {
      this.failures = 0;
      this.connected = true;
      this.offline = false;
      if (this.h.onOpen) this.h.onOpen();
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 10000);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (!m || typeof m !== 'object') return;
      switch (m.t) {
        case 'welcome':
          if (this.h.onWelcome) this.h.onWelcome(m);
          break;
        case 'tick':
          if (this.h.onTick && Array.isArray(m.e)) for (const ev of m.e) this.h.onTick(ev);
          break;
        case 'snapshot':
          if (this.h.onSnapshot) this.h.onSnapshot(m);
          break;
        case 'stats':
          if (this.h.onStats) this.h.onStats(m.s);
          break;
        case 'pong':
          if (this.h.onPong) this.h.onPong(m);
          break;
        case 'full':
          if (this.h.onFull) this.h.onFull(m);
          break;
        default:
          break;
      }
    };
    ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      if (this.h.onClose) this.h.onClose();
      if (!this.manual) this._retry();
    };
    ws.onerror = () => { /* onclose 会接着触发，统一在那里处理重连 */ };
  }

  _retry() {
    this.failures++;
    if (this.failures >= 3 && !this.offline) {
      this._goOffline('连接不上服务');
      return;
    }
    const wait = Math.min(8000, 1000 * Math.pow(2, this.failures - 1)) + Math.random() * 400;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(this.last), wait);
  }

  _goOffline(reason) {
    this.offline = true;
    clearInterval(this.pingTimer);
    if (this.h.onOffline) this.h.onOffline(reason);
  }

  /** 只发送白名单里的结构化消息，前端不提供任何自由文本上行通道 */
  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(obj)); return true; } catch { return false; }
    }
    return false;
  }

  close() {
    this.manual = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    if (this.ws) { try { this.ws.close(); } catch { /* ignore */ } }
    this.ws = null;
  }
}
