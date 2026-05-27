// node-flash.mjs — Valida el protocolo STK500v1 contra el hardware REAL
// usando node-serialport, reutilizando el mismo flasher.js que usará el navegador.
//
//   node test/node-flash.mjs [puerto] [chip] [archivo.hex]
//   node test/node-flash.mjs /dev/ttyUSB0 attiny85   ../firmware/blink.hex
//   node test/node-flash.mjs /dev/ttyUSB0 atmega328p ../firmware/blink_atmega328p.hex

import { SerialPort } from "serialport";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { flashChip } from "../js/flasher.js";
import { CHIPS, DEFAULT_CHIP } from "../js/chips.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const portPath = process.argv[2] || "/dev/ttyUSB0";
const chipId = process.argv[3] || DEFAULT_CHIP;
const profile = CHIPS[chipId];
if (!profile) {
  console.error(`Chip desconocido: ${chipId}. Opciones: ${Object.keys(CHIPS).join(", ")}`);
  process.exit(1);
}
const hexPath = resolve(__dir, process.argv[4] || ("../firmware/" + profile.firmwares[0].file));

// Transporte serie con lectura por bloques de N bytes + timeout.
class NodeSerialTransport {
  constructor(port) {
    this.port = port;
    this.buf = Buffer.alloc(0);
    this.waiters = [];
    port.on("data", (d) => {
      this.buf = Buffer.concat([this.buf, d]);
      this._pump();
    });
  }
  _pump() {
    while (this.waiters.length) {
      const w = this.waiters[0];
      if (this.buf.length < w.n) break;
      const out = this.buf.subarray(0, w.n);
      this.buf = this.buf.subarray(w.n);
      this.waiters.shift();
      clearTimeout(w.timer);
      w.resolve(new Uint8Array(out));
    }
  }
  write(u8) {
    return new Promise((res, rej) =>
      this.port.write(Buffer.from(u8), (e) => (e ? rej(e) : res()))
    );
  }
  read(n, timeoutMs = 1000) {
    return new Promise((resolve, reject) => {
      const w = {
        n, resolve,
        timer: setTimeout(() => {
          const i = this.waiters.indexOf(w);
          if (i >= 0) this.waiters.splice(i, 1);
          reject(new Error(`timeout leyendo ${n} byte(s) del serial`));
        }, timeoutMs),
      };
      this.waiters.push(w);
      this._pump();
    });
  }
  async drain() { this.buf = Buffer.alloc(0); }
}

async function main() {
  console.log(`Puerto: ${portPath}`);
  console.log(`Chip: ${profile.name}`);
  console.log(`Firmware: ${hexPath}`);
  const hexText = readFileSync(hexPath, "utf8");

  const port = new SerialPort({ path: portPath, baudRate: 19200, autoOpen: false });
  await new Promise((res, rej) => port.open((e) => (e ? rej(e) : res())));
  // Pequeña pausa: dar tiempo a ArduinoISP por si el puerto reseteó el Nano.
  await new Promise((r) => setTimeout(r, 200));

  const transport = new NodeSerialTransport(port);
  const t0 = Date.now();
  try {
    await flashChip(transport, hexText, profile, {
      log: (m) => console.log("  " + m),
      onProgress: (done, total) =>
        process.stdout.write(`\r  Progreso: ${done}/${total} bytes`),
    });
    process.stdout.write("\n");
    console.log(`Terminado en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    process.stdout.write("\n");
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    port.close();
  }
}

main();
