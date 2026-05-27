// intelhex.js — Parser mínimo de Intel HEX -> imagen de flash plana.
// ES module, funciona igual en navegador y en Node.

/**
 * Convierte texto Intel HEX en una imagen de flash (Uint8Array).
 * Los huecos se rellenan con 0xFF (estado borrado del flash AVR).
 *
 * @param {string} hexText  Contenido del archivo .hex
 * @returns {{data: Uint8Array, minAddr: number, maxAddr: number}}
 */
export function parseIntelHex(hexText) {
  const lines = hexText.split(/\r?\n/);
  let extBase = 0;            // base por registros de dirección extendida (02/04)
  let maxAddr = 0;
  const bytes = new Map();    // dirección absoluta -> byte

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line[0] !== ":") throw new Error(`Línea HEX inválida: ${line.slice(0, 16)}`);

    const b = [];
    for (let i = 1; i < line.length; i += 2) {
      b.push(parseInt(line.substr(i, 2), 16));
    }
    const len = b[0];
    const addr = (b[1] << 8) | b[2];
    const type = b[3];
    const data = b.slice(4, 4 + len);

    // checksum
    const sum = b.slice(0, 4 + len + 1).reduce((a, c) => (a + c) & 0xff, 0);
    if (sum !== 0) throw new Error("Checksum HEX incorrecto");

    if (type === 0x00) {
      // datos
      for (let i = 0; i < len; i++) {
        const a = extBase + addr + i;
        bytes.set(a, data[i]);
        if (a + 1 > maxAddr) maxAddr = a + 1;
      }
    } else if (type === 0x01) {
      break; // EOF
    } else if (type === 0x02) {
      extBase = ((data[0] << 8) | data[1]) << 4; // Extended Segment Address
    } else if (type === 0x04) {
      extBase = ((data[0] << 8) | data[1]) << 16; // Extended Linear Address
    }
    // 0x03/0x05 (start address) se ignoran.
  }

  const data = new Uint8Array(maxAddr).fill(0xff);
  for (const [a, v] of bytes) data[a] = v;
  return { data, minAddr: 0, maxAddr };
}
