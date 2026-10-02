// Utilidades de interfaz: escapar HTML, modales, avisos, sonido.

export function esc(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// ------------------------------------------------------------
// Modal tipo "hoja" (en el teléfono sube desde abajo)
// ------------------------------------------------------------
const pila = [];

export function abrirModal({ titulo, html, onAbrir, ancho = "" }) {
  const cont = document.createElement("div");
  cont.className = "modal";
  cont.innerHTML = `
    <div class="modal-fondo"></div>
    <div class="modal-hoja ${ancho}" role="dialog" aria-modal="true">
      <div class="modal-cab">
        <h3>${esc(titulo)}</h3>
        <button type="button" class="btn-icono" data-cerrar aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-cuerpo">${html}</div>
    </div>`;
  document.body.appendChild(cont);
  document.body.classList.add("con-modal");
  const cerrar = () => {
    cont.remove();
    pila.splice(pila.indexOf(cerrar), 1);
    if (!pila.length) document.body.classList.remove("con-modal");
  };
  pila.push(cerrar);
  cont.querySelector(".modal-fondo").addEventListener("click", cerrar);
  cont.querySelector("[data-cerrar]").addEventListener("click", cerrar);
  const cuerpo = cont.querySelector(".modal-cuerpo");
  onAbrir?.(cuerpo, cerrar);
  const primero = cuerpo.querySelector("input:not([type=hidden]):not([readonly]), select, textarea");
  if (primero && window.matchMedia("(min-width: 800px)").matches) primero.focus();
  return { cuerpo, cerrar };
}

export function cerrarModalSuperior() {
  pila.at(-1)?.();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrarModalSuperior();
});

export function confirmar(mensaje, { si = "Sí", no = "Cancelar", peligro = false } = {}) {
  return new Promise((resolve) => {
    abrirModal({
      titulo: "Confirmar",
      html: `<p class="confirmar-txt">${esc(mensaje)}</p>
        <div class="fila-botones">
          <button type="button" class="btn btn-sec" data-no>${esc(no)}</button>
          <button type="button" class="btn ${peligro ? "btn-peligro" : "btn-pri"}" data-si>${esc(si)}</button>
        </div>`,
      onAbrir(c, cerrar) {
        c.querySelector("[data-si]").onclick = () => {
          cerrar();
          resolve(true);
        };
        c.querySelector("[data-no]").onclick = () => {
          cerrar();
          resolve(false);
        };
      },
    });
  });
}

// ------------------------------------------------------------
// Avisos flotantes
// ------------------------------------------------------------
export function toast(texto, tipo = "ok", ms = 3200) {
  let cont = document.getElementById("toasts");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toasts";
    document.body.appendChild(cont);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${tipo}`;
  t.textContent = texto;
  cont.appendChild(t);
  // Máximo 3 avisos a la vez para no tapar la pantalla
  while (cont.children.length > 3) cont.firstElementChild.remove();
  setTimeout(() => t.classList.add("salir"), ms);
  setTimeout(() => t.remove(), ms + 400);
}

// ------------------------------------------------------------
// Sonido de notificación (generado, no necesita archivo de audio)
// ------------------------------------------------------------
let audioCtx = null;
export function desbloquearAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
document.addEventListener("pointerdown", desbloquearAudio, { once: true });

export function sonar() {
  try {
    desbloquearAudio();
    const ctx = audioCtx;
    const notas = [880, 1174.66, 1567.98];
    notas.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.45);
    });
    navigator.vibrate?.([200, 100, 200]);
  } catch {}
}

// ------------------------------------------------------------
// Formularios
// ------------------------------------------------------------
export function datosForm(form) {
  const fd = new FormData(form);
  const o = {};
  for (const [k, v] of fd.entries()) {
    if (k in o) o[k] = [].concat(o[k], v);
    else o[k] = v;
  }
  return o;
}

// Campo de monto con separador de miles mientras se escribe
export function campoMonto(input, decimales = 0) {
  const d = () => (typeof decimales === "function" ? decimales() : decimales);
  input.setAttribute("inputmode", d() ? "decimal" : "numeric");
  input.addEventListener("input", () => {
    if (input.value.trim() === "") return;
    const desdeFinal = input.value.length - input.selectionStart;
    const partes = input.value.split(",");
    let entero = partes[0].replace(/\D/g, "");
    entero = entero ? Number(entero).toLocaleString("es-CO") : "0";
    input.value = d() && partes.length > 1 ? `${entero},${partes[1].replace(/\D/g, "").slice(0, d())}` : entero;
    try {
      input.setSelectionRange(input.value.length - desdeFinal, input.value.length - desdeFinal);
    } catch {}
  });
}

export function leerMonto(texto, decimales = 2) {
  const t = String(texto ?? "").trim();
  if (!t) return 0;
  const [entero, dec = ""] = t.split(",");
  const n = Number(entero.replace(/\D/g, "") + (decimales && dec ? "." + dec.replace(/\D/g, "") : ""));
  return isFinite(n) ? n : 0;
}

export function montoATexto(n, decimales = 0) {
  if (!n) return "";
  const entero = Math.trunc(n).toLocaleString("es-CO");
  if (!decimales) return entero;
  const dec = Math.round((n - Math.trunc(n)) * 10 ** decimales);
  return dec ? `${entero},${String(dec).padStart(decimales, "0")}` : entero;
}

export function descargar(nombre, contenido, tipo = "text/csv;charset=utf-8") {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function aCSV(filas) {
  const celda = (v) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ";" porque Excel en español usa coma decimal
  return "﻿" + filas.map((f) => f.map(celda).join(";")).join("\n");
}

export function iniciales(nombre) {
  return String(nombre || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}
