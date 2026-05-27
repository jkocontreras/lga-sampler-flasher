// flasher.js — Orquesta la grabación completa de un chip vía ArduinoISP.
// Reutilizado por la página WebSerial y por el test de Node (mismo código).
// Es agnóstico del chip: recibe un perfil de chips.js.

import { STK500 } from "./stk500.js";
import { parseIntelHex } from "./intelhex.js";
import { CHIPS } from "./chips.js";

// Retrocompat: la firma del ATtiny85 se exportaba desde aquí.
export const ATTINY85_SIGNATURE = CHIPS.attiny85.signature;

const sigHex = (s) => s.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(" ");

/**
 * Graba un firmware (.hex) en el chip descrito por `profile`.
 * @param {{write:Function,read:Function,drain?:Function}} transport
 * @param {string} hexText  contenido del .hex
 * @param {import("./chips.js").ChipProfile} profile  perfil del chip destino
 * @param {object} opts  { log, onProgress, setFuses=true }
 */
export async function flashChip(transport, hexText, profile, opts = {}) {
  const log = opts.log || (() => {});
  const setFuses = opts.setFuses !== false;
  const { data } = parseIntelHex(hexText);

  if (data.length > profile.flashSize) {
    throw new Error(
      `El firmware (${data.length} B) no cabe en la flash del ${profile.name} (${profile.flashSize} B).`
    );
  }

  const isp = new STK500(transport, {
    log,
    pageSize: profile.pageSize,
    flashSize: profile.flashSize,
    eepromSize: profile.eepromSize,
  });

  log("Sincronizando con el programador (ArduinoISP)…");
  await isp.getSync();
  await isp.setDevice();

  log("Entrando en modo programación…");
  await isp.enterProgmode();

  try {
    const sig = await isp.readSignature();
    log("Firma del chip: " + sigHex(sig));
    const ok = profile.signature.every((b, i) => b === sig[i]);
    if (!ok) {
      throw new Error(
        `Firma inesperada (${sigHex(sig)}). ¿Hay un ${profile.name} bien colocado en el zócalo? ` +
        `(esperaba ${sigHex(profile.signature)})`
      );
    }

    log("Borrando chip…");
    await isp.chipErase();

    if (setFuses) {
      log(`Configurando fuses (${profile.clockDesc})…`);
      await isp.writeFuses(profile.fuses);
    }

    log(`Programando flash (${data.length} bytes)…`);
    await isp.programFlash(data, opts.onProgress);
  } finally {
    await isp.leaveProgmode().catch(() => {});
  }

  log("✅ Firmware grabado correctamente.");
}

/**
 * Retrocompat: graba un ATtiny85 (envoltura sobre flashChip con el perfil fijo).
 * @deprecated usa flashChip(transport, hex, CHIPS.attiny85, opts)
 */
export async function flashAttiny85(transport, hexText, opts = {}) {
  return flashChip(transport, hexText, CHIPS.attiny85, opts);
}
