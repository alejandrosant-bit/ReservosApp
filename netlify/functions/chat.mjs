// ============================================================
// /api/chat — el dueño le responde a un cliente desde la pestaña
// "Chats" de la app. El mensaje sale por el número de WhatsApp del
// negocio y el bot se pausa en esa conversación para no cruzarse.
// Solo el dueño del negocio (con su sesión de Firebase) puede usarla.
// ============================================================
import { getAuth } from "firebase-admin/auth";
import { firebase } from "./lib/firebase.mjs";
import { negocioDe } from "./lib/admin.mjs";
import { enviarWhatsapp, tokenDe } from "./lib/whatsapp-api.mjs";
import { refConversacion, registrarMensajes } from "./lib/chat.mjs";
import { conDefectos, soloDigitos } from "../../public/core.js";
import { mensajeDeChat, ventanaAbierta, PAUSA_MS } from "../../public/chat.js";

export const config = { path: "/api/chat" };

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let db;
  try {
    ({ db } = firebase());
  } catch (e) {
    console.error("chat", e.message);
    return json({ error: "Falta configurar FIREBASE_SERVICE_ACCOUNT en Netlify (Variables de entorno)." }, 500);
  }

  // 1) ¿Quién llama? Debe traer el token de su sesión
  const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let quien;
  try {
    quien = await getAuth().verifyIdToken(idToken);
  } catch {
    return json({ error: "Sesión no válida. Vuelve a entrar a la app." }, 401);
  }

  let datos;
  try {
    datos = await req.json();
  } catch {
    return json({ error: "Datos inválidos" }, 400);
  }
  const telefono = soloDigitos(datos?.telefono);
  const texto = String(datos?.texto || "").trim();
  if (!telefono || !texto) return json({ error: "Escribe un mensaje" }, 400);
  if (texto.length > 4000) return json({ error: "El mensaje es demasiado largo" }, 400);

  // 2) Solo puede escribir a conversaciones de SU negocio (el
  // administrador de Reservo, a las del negocio que revisa)
  const uid = negocioDe(quien, datos?.negocioId);
  const [cfgSnap, convSnap] = await Promise.all([db.doc(`negocios/${uid}`).get(), refConversacion(uid, telefono).get()]);
  if (!convSnap.exists) return json({ error: "No existe esa conversación" }, 404);
  if (!ventanaAbierta(convSnap.data())) {
    return json({ error: "Pasaron más de 24 horas desde el último mensaje del cliente. WhatsApp solo deja escribirle cuando él vuelva a escribir." }, 409);
  }
  const cfg = conDefectos(cfgSnap.data() || {});
  const phoneNumberId = cfg.whatsappPhoneNumberId;
  const tokenWa = await tokenDe(uid);
  if (!phoneNumberId || !tokenWa) return json({ error: "Conecta WhatsApp en Ajustes para poder responder desde aquí" }, 400);

  // 3) Enviar por el número de WhatsApp del negocio
  try {
    await enviarWhatsapp({ phoneNumberId, token: tokenWa, para: telefono, mensaje: { tipo: "texto", texto } });
  } catch (e) {
    console.error("chat", e.message);
    return json({ error: "WhatsApp no aceptó el mensaje. Intenta de nuevo en un momento." }, 502);
  }

  // 4) Queda en el historial y el bot se pausa: ya atiende una persona
  const pausaHasta = Date.now() + PAUSA_MS;
  await registrarMensajes(uid, telefono, [mensajeDeChat("negocio", texto, Date.now())], { pausaHasta, pideHumano: false, noLeidos: 0 });
  return json({ ok: true, pausaHasta });
};
