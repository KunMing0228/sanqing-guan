'use strict';

/**
 * 极简 WebSocket 服务端（RFC 6455），只用 Node 内置模块。
 * 为什么自己写：本项目上行消息只有几十字节，引入 ws / Socket.IO 会带来
 * npm install、供应链、构建与容器层依赖，而单机 200 连接根本用不上那些特性。
 * 支持：握手、掩码解码、分片续帧、text/binary、ping/pong、close、长度上限、慢客户端保护。
 * 不支持：permessage-deflate 扩展、子协议（本项目都不需要）。
 */
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WSConn extends EventEmitter {
  constructor(socket, req, opts) {
    super();
    this.socket = socket;
    this.req = req;
    this.opts = opts;
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentBytes = 0;
    this.fragmentOpcode = 0;
    this.closed = false;
    this.alive = true;
    this.lastSeen = Date.now();

    socket.setNoDelay(true);
    socket.setTimeout(0); // 心跳由上层做
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._finish());
    socket.on('error', () => this._finish());
  }

  get ip() {
    // 不记录、不落盘，只用于限流分组；生产环境以反代传入的 X-Forwarded-For 为准
    return this.req.socket.remoteAddress || '';
  }

  _onData(chunk) {
    if (this.closed) return;
    this.lastSeen = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (!this.closed && this._parseFrame()) { /* drain */ }
    if (!this.closed && this.buf.length > this.opts.maxFrameBytes) this.close(1009, 'frame too large');
  }

  _parseFrame() {
    const b = this.buf;
    if (b.length < 2) return false;

    const fin = (b[0] & 0x80) !== 0;
    const rsv = b[0] & 0x70;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;

    if (rsv !== 0) { this.close(1002, 'rsv'); return false; }
    if (len === 126) {
      if (b.length < 4) return false;
      len = b.readUInt16BE(2); off = 4;
    } else if (len === 127) {
      if (b.length < 10) return false;
      const big = b.readBigUInt64BE(2);
      if (big > BigInt(this.opts.maxFrameBytes)) { this.close(1009, 'too big'); return false; }
      len = Number(big); off = 10;
    }
    if (!masked) { this.close(1002, 'client frame must be masked'); return false; }

    const maskOff = off;
    off += 4;
    const total = off + len;
    if (b.length < total) return false;

    const mask = b.subarray(maskOff, maskOff + 4);
    const payload = Buffer.from(b.subarray(off, total)); // 复制，随后会裁掉 buf
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    this.buf = b.subarray(total);

    return this._handleFrame(fin, opcode, payload);
  }

  _handleFrame(fin, opcode, payload) {
    if (opcode === 0x8) { this.close(1000); return false; }
    if (opcode === 0x9) {
      this.alive = true;
      this.lastSeen = Date.now();
      this._frame(0xA, payload);
      return true;
    }
    if (opcode === 0xA) {
      this.alive = true;
      this.lastSeen = Date.now();
      this.emit('pong');
      return true;
    }
    if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
      if (opcode !== 0x0) {
        this.fragments = [payload];
        this.fragmentBytes = payload.length;
        this.fragmentOpcode = opcode;
      } else {
        if (!this.fragments.length) { this.close(1002, 'orphan continuation'); return false; }
        this.fragments.push(payload);
        this.fragmentBytes += payload.length;
      }
      if (this.fragmentBytes > this.opts.maxMessageBytes) { this.close(1009, 'message too large'); return false; }
      if (fin) {
        const full = this.fragments.length === 1 ? this.fragments[0] : Buffer.concat(this.fragments);
        const kind = this.fragmentOpcode;
        this.fragments = [];
        this.fragmentBytes = 0;
        this.fragmentOpcode = 0;
        if (kind === 0x1) this.emit('message', full.toString('utf8'));
      }
      return true;
    }
    this.close(1002, 'bad opcode');
    return false;
  }

  _frame(opcode, payload) {
    if (this.closed || !this.socket.writable) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[0] = 0x80 | opcode;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    // 慢客户端保护：写缓冲堆积超过 1MB 直接断开，避免一个人拖垮整台机
    if (this.socket.writableLength > 1024 * 1024) { this.close(1001, 'slow client'); return; }
    try { this.socket.write(Buffer.concat([header, payload])); } catch { this.close(); }
  }

  send(text) {
    if (this.closed) return false;
    this._frame(0x1, Buffer.isBuffer(text) ? text : Buffer.from(String(text), 'utf8'));
    return true;
  }

  sendJSON(obj) { return this.send(JSON.stringify(obj)); }

  ping() {
    if (this.closed) return;
    this.alive = false;
    this._frame(0x9, Buffer.alloc(0));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    this.closed = true;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    if (reason) body.write(reason, 2);
    try { this._frameNow(0x8, body); } catch { /* ignore */ }
    try { this.socket.end(); } catch { /* ignore */ }
    this._finish();
  }

  // close 帧要在 closed=true 之后仍能发出，所以单独走一次底层写
  _frameNow(opcode, payload) {
    const len = payload.length;
    const header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
    this.socket.write(Buffer.concat([header, payload]));
  }

  _finish() {
    if (this._finished) return;
    this._finished = true;
    this.closed = true;
    try { this.socket.destroy(); } catch { /* ignore */ }
    this.emit('close');
  }
}

function badRequest(socket, code, text) {
  const body = `HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`;
  try { socket.write(body); socket.destroy(); } catch { /* ignore */ }
}

function attachWebSocket(server, onConnection, options = {}) {
  const opts = {
    path: options.path || '/ws',
    maxMessageBytes: options.maxMessageBytes || 256 * 1024,
    maxFrameBytes: options.maxFrameBytes || 2 * 1024 * 1024
  };

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return badRequest(socket, 400, 'Bad Request'); }
    if (url.pathname !== opts.path) return badRequest(socket, 404, 'Not Found');
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket') return badRequest(socket, 400, 'Bad Request');
    const key = req.headers['sec-websocket-key'];
    if (!key || !/^[A-Za-z0-9+/]{22}==$/.test(key)) return badRequest(socket, 400, 'Bad Request');

    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const conn = new WSConn(socket, req, opts);
    if (head && head.length) conn._onData(head);
    try { onConnection(conn, url); } catch (err) {
      console.error('[ws] onConnection failed:', err.message);
      conn.close(1011);
    }
  });
}

module.exports = { attachWebSocket, WSConn };
