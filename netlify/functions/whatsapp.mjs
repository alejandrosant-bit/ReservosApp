// ============================================================
// Webhook de WhatsApp  →  https://TU-SITIO.netlify.app/api/whatsapp
// Meta llama aquí cada vez que un cliente escribe. El bot
// responde y, si agenda, la cita aparece al instante en la app
// del dueño (y le llega la notificación al celular).
// ============================================================
import { procesarMensaje } from "../../public/bot.js";
import { firebase } from "./lib/firebase.mjs";
import { crearStoreFirestore, negocioDeNumero } from "./lib/store-firestore.mjs";
import { enviarWhatsapp, marcarLeido, firmaValida, tokenDe } from "./lib/whatsapp-api.mjs";
import { refConversacion, registrarMensajes } from "./lib/chat.mjs";
import { avisarMensaje } from "./lib/notificar.mjs";
import { mensajeDeChat, deSalidaDelBot, botPausado, etiquetaDeTipo } from "../../public/chat.js";

export const config = { path: "/api/whatsapp" };

export default async (req) => {
  const url = new URL(req.url);

  // 1) Verificación inicial del webhook (se hace una sola vez desde Meta)
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Token inválido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });

  const crudo = await req.text();
  if (!firmaValida(crudo, req.headers.get("x-hub-signature-256"))) {
    return new Response("Firma inválida", { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(crudo);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const tareas = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const phoneNumberId = v.metadata?.phone_number_id;
      for (const m of v.messages || []) {
        const contacto = (v.contacts || []).find((c) => c.wa_id === m.from);
        tareas.push(atender({ phoneNumberId, mensaje: m, nombrePerfil: contacto?.profile?.name || "" }));
      }
    }
  }
  const resultados = await Promise.allSettled(tareas);
  resultados.filter((r) => r.status === "rejected").forEach((r) => console.error(r.reason));
  // Siempre 200: si respondemos error, Meta reintenta y el cliente
  // recibiría respuestas repetidas.
  return new Response("OK", { status: 200 });
};

async function atender({ phoneNumberId, mensaje, nombrePerfil }) {
  const negocioId = await negocioDeNumero(phoneNumberId);
  if (!negocioId) {
    console.warn("Número de WhatsApp sin negocio asociado:", phoneNumberId);
    return;
  }
  const { db, FieldValue } = firebase();

  // Meta a veces entrega el mismo mensaje dos veces: lo registramos
  // con su id y si ya existía no lo volvemos a procesar.
  try {
    await db.doc(`negocios/${negocioId}/mensajesProcesados/${mensaje.id}`).create({ creado: FieldValue.serverTimestamp() });
  } catch {
    return;
  }

  const token = await tokenDe(negocioId);
  if (!token) throw new Error("Falta el token de WhatsApp del negocio " + negocioId);
  marcarLeido({ phoneNumberId, token, messageId: mensaje.id });

  // ¿Una persona del negocio tomó esta conversación? Entonces el bot
  // no responde: el mensaje queda en la pestaña "Chats" y se le avisa.
  const ms = Number(mensaje.timestamp) * 1000 || Date.now();
  const conv = (await refConversacion(negocioId, mensaje.from).get()).data() || {};
  const pausado = botPausado(conv);
  const extra = nombrePerfil ? { nombrePerfil } : {};

  let texto = "";
  let opcionId = null;
  let ubicacion = null;
  let soportado = true;
  if (mensaje.type === "text") texto = mensaje.text?.body || "";
  else if (mensaje.type === "location") {
    // Ubicación compartida desde WhatsApp (pedir taxi, domicilios...)
    const l = mensaje.location || {};
    ubicacion = { lat: l.latitude, lng: l.longitude, nombre: l.name || "", direccion: l.address || "" };
    texto = [l.name, l.address].filter(Boolean).join(" ");
  } else if (mensaje.type === "interactive") {
    const r = mensaje.interactive?.button_reply || mensaje.interactive?.list_reply;
    opcionId = r?.id || null;
    texto = r?.title || "";
  } else if (mensaje.type === "button") {
    // Botón de una plantilla (ej. "Cancelar" en el recordatorio)
    texto = mensaje.button?.text || "";
  } else {
    soportado = false;
    texto = etiquetaDeTipo(mensaje.type);
  }
  const delCliente = mensajeDeChat("cliente", texto || (ubicacion ? "📍 Ubicación" : ""), ms);

  if (pausado) {
    await registrarMensajes(negocioId, mensaje.from, [delCliente], extra);
    await avisarMensaje(negocioId, { telefono: mensaje.from, nombre: conv.nombre || nombrePerfil, texto: delCliente.texto }).catch((e) => console.error("avisarMensaje", e.message));
    return;
  }

  if (!soportado) {
    const aviso = { tipo: "texto", texto: textoNoSoportado(mensaje.type) };
    await enviarWhatsapp({ phoneNumberId, token, para: mensaje.from, mensaje: aviso });
    await registrarMensajes(negocioId, mensaje.from, [delCliente, deSalidaDelBot(aviso, Date.now())], extra);
    return;
  }

  let mensajes;
  try {
    const store = await crearStoreFirestore(negocioId);
    ({ mensajes } = await procesarMensaje({ telefono: mensaje.from, nombrePerfil, texto, opcionId, ubicacion }, store, {
      marcaTiempo: ms,
    }));
  } catch (e) {
    // Nunca dejar al cliente sin respuesta: se registra el error y se
    // le pide que repita el mensaje (la conversación sigue donde iba).
    console.error("Error del bot", negocioId, e);
    mensajes = [{ tipo: "texto", texto: "Uy, tuve un problemita para procesar tu mensaje 🙈. ¿Me lo escribes de nuevo, por favor?" }];
  }

  for (const m of mensajes) {
    try {
      await enviarWhatsapp({ phoneNumberId, token, para: mensaje.from, mensaje: m });
    } catch (e) {
      // Si un mensaje con botones/lista falla, se reintenta como texto simple
      console.error("Error enviando a WhatsApp", e.message);
      if (m.tipo !== "texto") {
        const opciones = (m.botones || m.filas || []).map((o, i) => `${i + 1}. ${o.titulo}`).join("\n");
        await enviarWhatsapp({ phoneNumberId, token, para: mensaje.from, mensaje: { tipo: "texto", texto: `${m.texto}\n\n${opciones}\n\nResponde con el número de tu opción.` } }).catch(() => {});
      }
    }
  }

  // Historial de la conversación (pestaña "Chats" de la app)
  await registrarMensajes(negocioId, mensaje.from, [delCliente, ...mensajes.map((m) => deSalidaDelBot(m, Date.now()))], extra);
}

// Audios, fotos, stickers...: el bot solo lee texto. Se le dice al
// cliente qué hacer en vez de dejarlo sin respuesta.
function textoNoSoportado(tipo) {
  const que =
    tipo === "audio"
      ? "No puedo escuchar audios 🙉"
      : tipo === "image" || tipo === "video"
        ? "No puedo ver fotos ni videos 🙈"
        : tipo === "sticker"
          ? "😄 ¡Buen sticker! Pero solo leo texto"
          : "Por ahora solo puedo leer mensajes de texto ✍️";
  return `${que}. Escríbeme lo que necesitas (por ejemplo: _quiero agendar para el jueves a las 3_) o escribe *menú* para ver las opciones. Si prefieres que te atienda una persona, escribe *asesor*.`;
}
