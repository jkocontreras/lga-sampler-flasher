# lga-sampler-flasher

Graba un **ATtiny85** o un **ATmega328P** desde el navegador, con un clic, sin instalar nada.
Usa la placa programadora (Arduino Nano con **ArduinoISP**) y la **Web Serial API**.

👉 **Página:** https://jkocontreras.github.io/lga-sampler-flasher/
## Cómo se usa

1. Abre la página en **Chrome** o **Edge** de escritorio (Web Serial no existe en móvil ni en Firefox/Safari).
2. Conecta la placa programadora por USB y coloca **un solo chip** en su zócalo (las líneas SPI son compartidas).
3. Elige el **chip**, elige el firmware y pulsa **Conectar y grabar**.
4. Selecciona el puerto del Arduino en el diálogo. El log mostrará el progreso.

## Cómo funciona

El Arduino Nano corre el sketch **ArduinoISP**, que habla el protocolo **STK500v1**
por serie a 19200 baud. Esta página implementa ese protocolo en JavaScript puro
sobre Web Serial y graba el chip destino por SPI (ISP). No hay backend ni build:
es una web estática.

```
js/intelhex.js   Parser de Intel HEX -> imagen de flash
js/chips.js      Perfiles de chip (firma, page size, flash, fuses, firmwares)
js/stk500.js     Protocolo STK500v1 (sync, fuses, borrado, escritura por páginas)
js/flasher.js    Orquestación genérica por perfil (firma, borrado, fuses, programación)
js/webserial.js  Transporte Web Serial (navegador)
js/app.js        Interfaz de usuario
firmware/*.hex   Firmwares precompilados
test/            Validación del MISMO protocolo en Node (node-serialport)
```

Para añadir un chip nuevo basta con un perfil en `js/chips.js` (firma, page size,
tamaño de flash, fuses y firmwares); el resto del código no cambia.

| Chip | Page size | Flash | Reloj | Fuses (l/h/e) |
|------|-----------|-------|-------|---------------|
| ATtiny85   | 64 B  | 8 KB  | 8 MHz interno      | `0xE2 0xDF 0xFF` |
| ATmega328P | 128 B | 32 KB | cristal ext. 16 MHz | `0xFF 0xDF 0xFD` |

El ATmega328P se graba por **ISP directo sin bootloader** (hfuse `0xDF`); requiere el
cristal de 16 MHz soldado en la placa antes de fijar fuses.

## Regenerar los firmwares (.hex)

Con [`arduino-cli`](https://arduino.github.io/arduino-cli/):

```bash
# ATtiny85 (core ATTinyCore:avr)
FQBN="ATTinyCore:avr:attinyx5:chip=85,clock=8internal,bod=disable"
arduino-cli compile -b "$FQBN" --output-dir out ruta/al/sketch
cp out/*.hex firmware/nombre.hex

# ATmega328P (core arduino:avr; usar el .hex SIN bootloader)
arduino-cli compile -b arduino:avr:uno --output-dir out ruta/al/sketch
cp out/<sketch>.ino.hex firmware/nombre.hex
```

## Validar el protocolo en hardware (Node)

```bash
npm install
node test/node-flash.mjs /dev/ttyUSB0 attiny85   firmware/blink.hex
node test/node-flash.mjs /dev/ttyUSB0 atmega328p firmware/blink_atmega328p.hex
```

## Créditos

- Sketch [ArduinoISP](https://github.com/arduino/arduino-examples) (Randall Bohn / Arduino).
- Hardware basado en este [proyecto de Instructables](https://www.instructables.com/Programming-the-ATTiny85-ATTiny84-and-ATMega328P-A/).
