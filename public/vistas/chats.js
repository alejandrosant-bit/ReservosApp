// ============================================================
// Chats: bandeja de las conversaciones de WhatsApp. Aquí se ve lo
// que escribió cada cliente y lo que respondió el bot, y el dueño
// puede responder en persona (el bot se pausa en esa conversación).
// ============================================================
import { E, guardar, enviarChat, claveTelefono } from "../datos.js";
import { ventanaAbierta, botPausado, PAUSA_MS } from "../chat.js";
import { esc, toast, iniciales } from "../ui.js";

let cont = null;
let abierto = null; // teléfono de la conversación abierta
let pintado = null; // teléfono cuyo hilo ya está armado en pantalla
let enviando = false;
let reloj = null;
const marcando = new Set(); // conversaciones que se están marcando como leídas

export function montar(c, params) {
  cont = c;
  abierto = params[0] || null;
  pintado = null;
  cont.innerHTML = `
    <div class="cab-vista"><h2>Chats <span class="suave peq" id="chats-cuenta"></span></h2></div>
    <div class="chats" id="chats">
      <div class="tarjeta chats-lista"><div class="lista" id="chats-lista"></div></div>
      <div class="tarjeta chats-hilo" id="chats-hilo"></div>
    </div>`;
  pintar();
  // La pausa del bot y la ventana de 24 h cambian con el tiempo
  reloj = setInterval(() => abierto && actualizarHilo(), 30000);
  return {
    actualizar(que) {
      if (que === "conversaciones" || que === "clientes" || que === "config") pintar();
    },
    parametros(p) {
      abierto = p[0] || null;
      pintar();
    },
    desmontar() {
      clearInterval(reloj);
      cont = null;
    },
  };
}

// ------------------------------------------------------------
// Datos de apoyo
// ------------------------------------------------------------
const conv = (tel) => E.conversaciones.find((c) => c.id === tel) || null;

function nombreDe(c) {
  const cliente = E.clientes.find((x) => x.telefonoClave && x.telefonoClave === claveTelefono(c.id));
  return cliente?.nombre || c.nombre || c.nombrePerfil || "+" + c.id;
}

const hora = (ms) => (ms ? new Date(ms).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) : "");

function cuando(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return hora(ms);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

const marcaDe = (c) => c.actualizadoMs || c.actualizado?.toMillis?.() || 0;

// ------------------------------------------------------------
// Pintado
// ------------------------------------------------------------
function pintar() {
  if (!cont) return;
  cont.querySelector("#chats").classList.toggle("con-hilo", Boolean(abierto));
  pintarLista();
  if (abierto !== pintado) armarHilo();
  else actualizarHilo();
}

function pintarLista() {
  const lista = [...E.conversaciones].filter((c) => c.mensajes?.length || c.ultimoMensaje);
  // Primero las que esperan a una persona, luego las más recientes
  lista.sort((a, b) => Number(Boolean(b.pideHumano)) - Number(Boolean(a.pideHumano)) || marcaDe(b) - marcaDe(a));
  const esperando = lista.filter((c) => c.noLeidos > 0 || c.pideHumano).length;
  cont.querySelector("#chats-cuenta").textContent = esperando ? `· ${esperando} por atender` : "";
  cont.querySelector("#chats-lista").innerHTML =
    lista
      .map((c) => {
        const ultimo = c.mensajes?.at(-1);
        const previo = ultimo ? `${ultimo.de === "cliente" ? "" : ultimo.de === "bot" ? "🤖 " : "Tú: "}${ultimo.texto}` : c.ultimoMensaje || "";
        const n = Number(c.noLeidos) || 0;
        return `<div class="item ${c.id === abierto ? "activo" : ""} ${n || c.pideHumano ? "no-leido" : ""}" data-tel="${esc(c.id)}">
          <div class="avatar">${esc(iniciales(nombreDe(c)))}</div>
          <div class="crece">
            <div class="fila"><span class="negrita crece chats-corta">${esc(nombreDe(c))}</span><span class="mini suave">${esc(cuando(marcaDe(c)))}</span></div>
            <div class="fila"><span class="peq suave crece chats-corta">${esc(previo)}</span>
              ${c.pideHumano ? '<span class="chip chip-pendiente">🙋 Pide atención</span>' : botPausado(c) ? '<span class="chip">⏸ Bot en pausa</span>' : ""}
              ${n ? `<span class="chats-n">${n > 9 ? "9+" : n}</span>` : ""}
            </div>
          </div></div>`;
      })
      .join("") ||
    `<p class="vacio"><span class="grande">💬</span>Aún no hay conversaciones.<br>Aquí aparecen los chats de WhatsApp de tus clientes cuando el bot esté conectado.</p>`;
  cont.querySelectorAll("#chats-lista [data-tel]").forEach((el) => (el.onclick = () => (location.hash = `chats/${el.dataset.tel}`)));
}

// Arma el hilo una sola vez por conversación (para no borrar lo que
// el dueño va escribiendo cuando llegan mensajes nuevos).
function armarHilo() {
  pintado = abierto;
  const caja = cont.querySelector("#chats-hilo");
  const c = abierto && conv(abierto);
  if (!c) {
    caja.innerHTML = `<p class="vacio"><span class="grande">👈</span>${abierto && E.cargado.conversaciones ? "No encontramos esa conversación." : "Elige una conversación para verla."}</p>`;
    if (abierto && !E.cargado.conversaciones) pintado = null; // aún cargando: se reintenta
    return;
  }
  caja.innerHTML = `
    <div class="chats-cab">
      <button type="button" class="btn-icono chats-volver" id="chat-volver" aria-label="Volver a la lista">←</button>
      <div class="avatar">${esc(iniciales(nombreDe(c)))}</div>
      <div class="crece">
        <div class="negrita chats-corta">${esc(nombreDe(c))}</div>
        <div class="mini suave">+${esc(c.id)}</div>
      </div>
      <button type="button" class="btn btn-sec btn-chico" id="chat-bot"></button>
    </div>
    <div class="mini chats-estado" id="chat-estado"></div>
    <div class="wa chats-mensajes" id="chat-mensajes"></div>
    <div class="peq suave chats-nota oculto" id="chat-nota"></div>
    <form class="wa-entrada" id="chat-form">
      <textarea id="chat-texto" rows="1" maxlength="4000" placeholder="Escribe una respuesta" class="crece"></textarea>
      <button class="btn btn-pri" id="chat-enviar" aria-label="Enviar">➤</button>
    </form>`;
  caja.querySelector("#chat-volver").onclick = () => (location.hash = "chats");
  caja.querySelector("#chat-bot").onclick = alternarBot;
  const form = caja.querySelector("#chat-form");
  const campo = caja.querySelector("#chat-texto");
  form.onsubmit = (e) => {
    e.preventDefault();
    enviar();
  };
  // Enter envía; Shift+Enter hace salto de línea
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      enviar();
    }
  });
  actualizarHilo(true);
}

function actualizarHilo(alFondo = false) {
  if (!cont || !abierto) return;
  const c = conv(abierto);
  const caja = cont.querySelector("#chats-hilo");
  const mensajes = caja.querySelector("#chat-mensajes");
  if (!c || !mensajes) return armarHilo();

  // Al abrirla se marca como leída
  // (una sola escritura: la pantalla se repinta antes de que llegue el cambio)
  if (!(c.noLeidos > 0)) marcando.delete(c.id);
  else if (!marcando.has(c.id)) {
    marcando.add(c.id);
    guardar("conversaciones", c.id, { noLeidos: 0 });
  }

  const pausado = botPausado(c);
  caja.querySelector("#chat-bot").textContent = pausado ? "▶ Devolver al bot" : "⏸ Pausar bot";
  caja.querySelector("#chat-estado").innerHTML = pausado
    ? `⏸ El bot está en pausa en este chat hasta las <b>${esc(hora(c.pausaHasta))}</b>. Tú atiendes.`
    : c.pideHumano
      ? "🙋 Este cliente pidió que lo atienda una persona. Al responderle, el bot se pausa."
      : "🤖 El bot está atendiendo este chat. Si le escribes, se pausa una hora.";

  const estabaAbajo = mensajes.scrollHeight - mensajes.scrollTop - mensajes.clientHeight < 80;
  mensajes.innerHTML =
    (c.mensajes || [])
      .map(
        (m) => `<div class="burb ${m.de === "cliente" ? "bot" : "yo"} ${m.de === "bot" ? "del-bot" : ""}">${m.de === "bot" ? '<span class="chats-quien">🤖 Bot</span>' : ""}${esc(m.texto)}${
          m.opciones?.length ? `<span class="chats-ops">${m.opciones.map((o) => `<span>${esc(o)}</span>`).join("")}</span>` : ""
        }<span class="chats-hora">${esc(hora(m.ms))}</span></div>`
      )
      .join("") || `<p class="vacio">Sin mensajes guardados todavía.</p>`;
  if (alFondo || estabaAbajo) mensajes.scrollTop = mensajes.scrollHeight;

  // ¿Se le puede escribir?
  const nota = caja.querySelector("#chat-nota");
  const campo = caja.querySelector("#chat-texto");
  const boton = caja.querySelector("#chat-enviar");
  let motivo = "";
  if (!E.config.whatsappPhoneNumberId) motivo = "Conecta WhatsApp en Ajustes para responder desde aquí.";
  else if (!ventanaAbierta(c)) motivo = `Pasaron más de 24 horas desde su último mensaje. WhatsApp solo deja escribirle cuando el cliente vuelva a escribir. <a href="https://wa.me/${esc(c.id)}" target="_blank" rel="noopener">Abrir en mi WhatsApp</a>`;
  nota.innerHTML = motivo;
  nota.classList.toggle("oculto", !motivo);
  campo.disabled = Boolean(motivo) || enviando;
  boton.disabled = Boolean(motivo) || enviando;
}

// ------------------------------------------------------------
// Acciones
// ------------------------------------------------------------
async function enviar() {
  const campo = cont?.querySelector("#chat-texto");
  const texto = campo?.value.trim();
  if (!texto || enviando || campo.disabled) return;
  const tel = abierto;
  enviando = true;
  actualizarHilo();
  try {
    await enviarChat(tel, texto);
    if (cont && abierto === tel) cont.querySelector("#chat-texto").value = "";
  } catch (e) {
    toast(e.message, "error", 6000);
  } finally {
    enviando = false;
    if (cont && abierto) {
      actualizarHilo(true);
      cont.querySelector("#chat-texto")?.focus();
    }
  }
}

// Pausar el bot para atender en persona, o devolverle el chat.
function alternarBot() {
  const c = conv(abierto);
  if (!c) return;
  if (botPausado(c)) {
    // Al volver, el bot arranca la conversación de cero
    guardar("conversaciones", c.id, { pausaHasta: 0, pideHumano: false, estado: null });
    toast("Listo, el bot vuelve a atender este chat.");
  } else {
    guardar("conversaciones", c.id, { pausaHasta: Date.now() + PAUSA_MS, pideHumano: false });
    toast("Bot en pausa por una hora en este chat.");
  }
}
