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

  let texto = "";
  let opcionId = null;
  let ubicacion = null;
  if (mensaje.type === "text") texto = mensaje.text?.body || "";
  else if (mensaje.type === "location") {
    // Ubicación compartida desde WhatsApp (pedir taxi, domicilios...)
    const l = mensaje.location || {};
    ubicacion = { lat: l.latitude, lng: l.longitude, nombre: l.name || "", direccion: l.address || "" };
    texto = [l.name, l.address].filter(Boolean).join(" ");
  }
  else if (mensaje.type === "interactive") {
    const r = mensaje.interactive?.button_reply || mensaje.interactive?.list_reply;
    opcionId = r?.id || null;
    texto = r?.title || "";
  } else if (mensaje.type === "button") {
    // Botón de una plantilla (ej. "Cancelar" en el recordatorio)
    texto = mensaje.button?.text || "";
  } else {
    await enviarWhatsapp({
      phoneNumberId,
      token,
      para: mensaje.from,
      mensaje: { tipo: "texto", texto: "Por ahora solo puedo leer mensajes de texto ✍️. Escríbeme por ejemplo: _quiero una cita el jueves a las 3_" },
    });
    return;
  }

  let mensajes;
  try {
    const store = await crearStoreFirestore(negocioId);
    ({ mensajes } = await procesarMensaje({ telefono: mensaje.from, nombrePerfil, texto, opcionId, ubicacion }, store, {
      marcaTiempo: Number(mensaje.timestamp) * 1000 || Date.now(),
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

  // Últimos mensajes de la conversación (para verlos en la app)
  await db.doc(`negocios/${negocioId}/conversaciones/${mensaje.from}`).set(
    {
      nombrePerfil,
      ultimoMensaje: texto.slice(0, 200),
      ultimaRespuesta: (mensajes.at(-1)?.texto || "").slice(0, 300),
      actualizado: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
