// chips.js — Perfiles de los chips que sabe grabar la placa programadora.
// Cada perfil reúne TODO lo que cambia entre chips: firma, geometría de flash,
// fuses por defecto y los firmwares disponibles. El resto del código
// (stk500.js / flasher.js) es agnóstico del chip y se parametriza con esto.

/**
 * @typedef {Object} ChipProfile
 * @property {string}   id          clave estable (la del objeto CHIPS)
 * @property {string}   name        nombre legible para la UI
 * @property {number[]} signature   3 bytes de firma esperados
 * @property {number}   pageSize    tamaño de página de flash, en BYTES
 * @property {number}   flashSize   flash total, en bytes
 * @property {number}   eepromSize  EEPROM total, en bytes
 * @property {{lfuse:number,hfuse:number,efuse:number}} fuses  fuses a escribir
 * @property {string}   clockDesc   descripción del reloj (para la UI/log)
 * @property {{file:string,label:string,desc:string}[]} firmwares
 */

/** @type {Record<string, ChipProfile>} */
export const CHIPS = {
  attiny85: {
    id: "attiny85",
    name: "ATtiny85",
    signature: [0x1e, 0x93, 0x0b],
    pageSize: 64,
    flashSize: 8192,
    eepromSize: 512,
    // ATTinyCore 8 MHz interno, BOD off.
    fuses: { lfuse: 0xe2, hfuse: 0xdf, efuse: 0xff },
    clockDesc: "8 MHz interno",
    firmwares: [
      { file: "blink.hex",   label: "Blink de prueba", desc: "parpadea el LED, para verificar que todo funciona" },
      { file: "dftest.hex",  label: "Test DFPlayer",   desc: "sin botones: reproduce la pista 1 cada 4 s para probar la comunicación con el DFPlayer" },
      { file: "btntest1.hex",label: "Test botones",    desc: "cualquier botón reproduce SIEMPRE la pista 1: separa fallo de botón/ADC del de la tarjeta SD" },
      { file: "sampler.hex", label: "Sampler",         desc: "firmware del reproductor (botonera + DFPlayer)" },
    ],
  },

  atmega328p: {
    id: "atmega328p",
    name: "ATmega328P",
    signature: [0x1e, 0x95, 0x0f],
    pageSize: 128,
    flashSize: 32768,
    eepromSize: 1024,
    // Cristal externo 16 MHz, SIN bootloader (BOOTRST sin programar), BOD 2.7 V.
    // Igual que un Arduino Uno salvo hfuse 0xDF (0xDE tendría bootloader).
    fuses: { lfuse: 0xff, hfuse: 0xdf, efuse: 0xfd },
    clockDesc: "cristal externo 16 MHz",
    firmwares: [
      { file: "blink_atmega328p.hex", label: "Blink de prueba", desc: "parpadea el LED en el pin 3 (PD3), para verificar que todo funciona" },
    ],
  },
};

export const DEFAULT_CHIP = "attiny85";
