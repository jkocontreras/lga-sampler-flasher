// stk500.js — Cliente del protocolo STK500v1 tal como lo habla ArduinoISP.
// ES module agnóstico del transporte: funciona con WebSerial (navegador) o
// con node-serialport, siempre que el transporte ofrezca:
//
//   await transport.write(Uint8Array)         -> envía bytes
//   await transport.read(n, timeoutMs)        -> lee EXACTAMENTE n bytes (o lanza)
//
// Referencia de comandos: protocolo STK500 v1 + sketch ArduinoISP de Arduino.

// --- Constantes del protocolo ---
const Resp = { STK_OK: 0x10, STK_INSYNC: 0x14, STK_NOSYNC: 0x15, STK_FAILED: 0x11 };
const CRC_EOP = 0x20;

const Cmd = {
  GET_SYNC: 0x30,        // '0'
  GET_PARAMETER: 0x41,   // 'A'
  SET_DEVICE: 0x42,      // 'B'
  SET_DEVICE_EXT: 0x45,  // 'E'
  ENTER_PROGMODE: 0x50,  // 'P'
  LEAVE_PROGMODE: 0x51,  // 'Q'
  LOAD_ADDRESS: 0x55,    // 'U'
  UNIVERSAL: 0x56,       // 'V'  (envía 4 bytes de instrucción SPI ISP)
  PROG_PAGE: 0x64,       // 'd'
  READ_SIGN: 0x75,       // 'u'
};

const MEM_FLASH = 0x46; // 'F'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class STK500 {
  /**
   * @param {{write:Function, read:Function}} transport
   * @param {{log?:Function, pageSize?:number, flashSize?:number, eepromSize?:number}} [opts]
   */
  constructor(transport, opts = {}) {
    this.t = transport;
    this.log = opts.log || (() => {});
    this.pageSize = opts.pageSize || 64;     // ATtiny85: 64 B/página (ATmega328P: 128)
    this.flashSize = opts.flashSize || 8192; // ATtiny85: 8 KB
    this.eepromSize = opts.eepromSize || 512;
  }

  // Envía bytes + CRC_EOP y verifica la respuesta enmarcada [INSYNC ... OK].
  // Devuelve el payload entre INSYNC y OK.
  async _cmd(bytes, expectExtra = 0, timeoutMs = 1000) {
    await this.t.write(Uint8Array.from([...bytes, CRC_EOP]));
    const head = await this.t.read(1, timeoutMs);
    if (head[0] !== Resp.STK_INSYNC) {
      throw new Error(`Sin sincronía (recibí 0x${head[0].toString(16)})`);
    }
    let payload = new Uint8Array(0);
    if (expectExtra > 0) payload = await this.t.read(expectExtra, timeoutMs);
    const tail = await this.t.read(1, timeoutMs);
    if (tail[0] !== Resp.STK_OK) {
      throw new Error(`Respuesta no OK (0x${tail[0].toString(16)})`);
    }
    return payload;
  }

  // Intenta sincronizar con ArduinoISP (varios reintentos, vaciando basura).
  async getSync() {
    for (let i = 0; i < 5; i++) {
      try {
        await this.t.write(Uint8Array.from([Cmd.GET_SYNC, CRC_EOP]));
        // leemos hasta 2 bytes; si no llegan, reintentamos
        const a = await this.t.read(1, 400);
        if (a[0] === Resp.STK_INSYNC) {
          const b = await this.t.read(1, 400);
          if (b[0] === Resp.STK_OK) return true;
        }
      } catch { /* reintenta */ }
      await this.t.drain?.();
      await sleep(50);
    }
    throw new Error("No se pudo sincronizar con el programador (ArduinoISP).");
  }

  // STK_SET_DEVICE: lo esencial para ArduinoISP es el tamaño de página (commit
  // correcto). Mandamos un bloque de 20 bytes con pagesize y flash/eeprom size.
  async setDevice() {
    const ps = this.pageSize;
    const flash = this.flashSize, eeprom = this.eepromSize;
    const p = [
      0x14, // devicecode (irrelevante para ArduinoISP)
      0x00, // revision
      0x00, // progtype
      0x01, // parmode
      0x01, // polling
      0x01, // selftimed
      0x00, // lockbytes
      0x00, // fusebytes
      0xff, 0xff, 0xff, 0xff, // poll values
      (ps >> 8) & 0xff, ps & 0xff,           // pagesize (high, low)
      (eeprom >> 8) & 0xff, eeprom & 0xff,   // eeprom size
      (flash >> 24) & 0xff, (flash >> 16) & 0xff, (flash >> 8) & 0xff, flash & 0xff,
    ];
    await this._cmd([Cmd.SET_DEVICE, ...p]);
  }

  async enterProgmode() { await this._cmd([Cmd.ENTER_PROGMODE]); }
  async leaveProgmode() { await this._cmd([Cmd.LEAVE_PROGMODE]); }

  // Lee los 3 bytes de firma del chip destino.
  async readSignature() {
    const sig = await this._cmd([Cmd.READ_SIGN], 3);
    return [sig[0], sig[1], sig[2]];
  }

  // Envía una instrucción SPI ISP cruda de 4 bytes; devuelve el 4º byte recibido.
  async universal(a, b, c, d) {
    const r = await this._cmd([Cmd.UNIVERSAL, a, b, c, d], 1);
    return r[0];
  }

  async chipErase() {
    await this.universal(0xac, 0x80, 0x00, 0x00);
    await sleep(15); // tWD_ERASE
  }

  // Escribe los fuses (valores típicos ATTinyCore 8 MHz interno, BOD off).
  async writeFuses({ lfuse = 0xe2, hfuse = 0xdf, efuse = 0xff } = {}) {
    await this.universal(0xac, 0xa0, 0x00, lfuse); await sleep(10);
    await this.universal(0xac, 0xa8, 0x00, hfuse); await sleep(10);
    await this.universal(0xac, 0xa4, 0x00, efuse); await sleep(10);
  }

  // Carga la dirección de PALABRA (no de byte) para el siguiente PROG_PAGE.
  async loadAddress(wordAddr) {
    await this._cmd([Cmd.LOAD_ADDRESS, wordAddr & 0xff, (wordAddr >> 8) & 0xff]);
  }

  async progPage(dataChunk) {
    const len = dataChunk.length;
    await this._cmd([Cmd.PROG_PAGE, (len >> 8) & 0xff, len & 0xff, MEM_FLASH, ...dataChunk], 0, 2000);
  }

  /**
   * Programa la imagen de flash completa, página a página.
   * @param {Uint8Array} image
   * @param {(done:number,total:number)=>void} [onProgress]
   */
  async programFlash(image, onProgress) {
    const ps = this.pageSize;
    // redondea hacia arriba a múltiplo de página, rellenando con 0xFF
    const total = Math.ceil(image.length / ps) * ps;
    const padded = new Uint8Array(total).fill(0xff);
    padded.set(image);

    for (let addr = 0; addr < total; addr += ps) {
      await this.loadAddress(addr >> 1);           // dirección de palabra
      await this.progPage(padded.subarray(addr, addr + ps));
      onProgress?.(addr + ps, total);
    }
  }
}

export { Resp, Cmd };
