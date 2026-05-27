// webserial.js — Transporte para el flasher usando la Web Serial API del navegador.
// Implementa la misma interfaz que el transporte de Node: write / read(n,timeout) / drain.

export class WebSerialTransport {
  constructor(port) {
    this.port = port;
    this.writer = null;
    this.reader = null;
    this.buf = new Uint8Array(0);
    this.waiters = [];
    this._readLoop = null;
  }

  async open(baudRate = 19200) {
    await this.port.open({ baudRate });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this._readLoop = (async () => {
      try {
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value && value.length) this._append(value);
        }
      } catch {
        /* puerto cerrado */
      }
    })();
  }

  _append(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    this._pump();
  }

  _pump() {
    while (this.waiters.length) {
      const w = this.waiters[0];
      if (this.buf.length < w.n) break;
      const out = this.buf.slice(0, w.n);
      this.buf = this.buf.slice(w.n);
      this.waiters.shift();
      clearTimeout(w.timer);
      w.resolve(out);
    }
  }

  write(u8) {
    return this.writer.write(u8 instanceof Uint8Array ? u8 : Uint8Array.from(u8));
  }

  read(n, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      const w = {
        n, resolve,
        timer: setTimeout(() => {
          const i = this.waiters.indexOf(w);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new Error(`timeout leyendo ${n} byte(s)`));
        }, timeoutMs),
      };
      this.waiters.push(w);
      this._pump();
    });
  }

  async drain() {
    this.buf = new Uint8Array(0);
  }

  async close() {
    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    try { await this.writer?.close(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port.close(); } catch {}
  }
}
