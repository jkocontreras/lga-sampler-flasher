// app.js — Pega la UI con el flasher. Pensado para uso simple (Jko).
import { WebSerialTransport } from "./webserial.js";
import { flashChip } from "./flasher.js";
import { CHIPS, DEFAULT_CHIP } from "./chips.js";

const $ = (id) => document.getElementById(id);
const logBox = $("log");
const bar = $("bar");
const btn = $("flashBtn");
const chipList = $("chipList");
const fwList = $("fwList");
const clockNote = $("clockNote");

function log(msg, cls = "") {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = msg;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function setProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  bar.style.width = pct + "%";
  bar.textContent = pct + "%";
}

function setBusy(busy) {
  btn.disabled = busy;
  btn.textContent = busy ? "Grabando…" : "🔌 Conectar y grabar";
}

const currentChip = () => CHIPS[document.querySelector('input[name="chip"]:checked').value];

// Reconstruye la lista de firmwares según el chip elegido.
function renderFirmwares() {
  const chip = currentChip();
  fwList.innerHTML = "";
  chip.firmwares.forEach((fw, i) => {
    const id = "fw_" + chip.id + "_" + i;
    const label = document.createElement("label");
    label.className = "fw";
    label.innerHTML =
      `<input type="radio" name="fw" id="${id}" value="${fw.file}" ${i === 0 ? "checked" : ""} />` +
      `<b>${fw.label}</b> — <small>${fw.desc}</small>`;
    fwList.appendChild(label);
  });
  clockNote.textContent =
    `El ${chip.name} se graba a ${chip.clockDesc}. ` +
    `Si falla, desconecta y vuelve a conectar la placa, y reintenta.`;
}

// Construye el selector de chip y engancha el cambio.
function renderChips() {
  Object.values(CHIPS).forEach((chip) => {
    const label = document.createElement("label");
    label.className = "fw";
    label.innerHTML =
      `<input type="radio" name="chip" value="${chip.id}" ${chip.id === DEFAULT_CHIP ? "checked" : ""} />` +
      `<b>${chip.name}</b> — <small>${chip.clockDesc}</small>`;
    chipList.appendChild(label);
  });
  chipList.addEventListener("change", renderFirmwares);
  renderFirmwares();
}

async function loadFirmware() {
  const file = document.querySelector('input[name="fw"]:checked').value;
  const res = await fetch("firmware/" + file, { cache: "no-store" });
  if (!res.ok) throw new Error("No pude cargar el firmware " + file);
  return res.text();
}

async function run() {
  if (!("serial" in navigator)) {
    log("Tu navegador no soporta Web Serial. Usa Chrome o Edge de escritorio.", "err");
    return;
  }

  logBox.innerHTML = "";
  setProgress(0, 1);
  setBusy(true);

  let transport;
  try {
    const chip = currentChip();
    const hexText = await loadFirmware();
    log(`Chip seleccionado: ${chip.name}`);

    log("Selecciona el puerto del programador (Arduino Nano) en el diálogo…");
    const port = await navigator.serial.requestPort();
    transport = new WebSerialTransport(port);
    await transport.open(19200);
    // dar un instante a ArduinoISP por si el puerto reseteó el Nano
    await new Promise((r) => setTimeout(r, 200));

    const t0 = Date.now();
    await flashChip(transport, hexText, chip, {
      log: (m) => log(m),
      onProgress: setProgress,
    });
    log(`Tiempo: ${((Date.now() - t0) / 1000).toFixed(1)} s`, "ok");
    log("Ya puedes desconectar y usar tu chip. 🎉", "ok");
  } catch (e) {
    log("❌ " + e.message, "err");
    log("Sugerencias: revisa que el chip esté bien colocado, el Nano conectado, " +
        "y que no haya otro programa usando el puerto.", "");
  } finally {
    if (transport) await transport.close();
    setBusy(false);
  }
}

renderChips();
btn.addEventListener("click", run);
