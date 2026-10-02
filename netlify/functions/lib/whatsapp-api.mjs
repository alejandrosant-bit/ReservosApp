// Envío de mensajes por la API oficial de WhatsApp Business
// (WhatsApp Cloud API de Meta). Convierte los mensajes del bot
// (texto / botones / lista) al formato que pide Meta.
import crypto from "node:crypto";
import { firebase } from "./firebase.mjs";

const VERSION = process.env.WHATSAPP_API_VERSION || "v23.0";

export async function tokenDe(negocioId) {
  const { db } = firebase();
  const s = await db.doc(`negocios/${negocioId}/privado/whatsapp`).get();
  return (s.exists && s.data().token) || process.env.WHATSAPP_TOKEN;
}

export function aPayloadMeta(para, m) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: para };
  if (m.tipo === "botones") {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: m.texto.slice(0, 1024) },
        action: { buttons: m.botones.map((b) => ({ type: "reply", reply: { id: b.id, title: b.titulo } })) },
      },
    };
  }
  if (m.tipo === "lista") {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: m.texto.slice(0, 1024) },
        action: {
          button: m.boton,
          sections: [{ title: "Opciones", rows: m.filas.map((f) => ({ id: f.id, title: f.titulo, ...(f.descripcion ? { description: f.descripcion } : {}) })) }],
        },
      },
    };
  }
  if (m.tipo === "plantilla") {
    return {
      ...base,
      type: "template",
      template: {
        name: m.nombre,
        language: { code: m.idioma || "es" },
        components: [{ type: "body", parameters: m.parametros.map((p) => ({ type: "text", text: String(p) })) }],
      },
    };
  }
  return { ...base, type: "text", text: { body: m.texto.slice(0, 4096), preview_url: false } };
}

export async function enviarWhatsapp({ phoneNumberId, token, para, mensaje }) {
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(aPayloadMeta(para, mensaje)),
  });
  if (!r.ok) {
    const detalle = await r.text();
    throw new Error(`WhatsApp API ${r.status}: ${detalle}`);
  }
  return r.json();
}

export async function marcarLeido({ phoneNumberId, token, messageId }) {
  await fetch(`https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
  }).catch(() => {});
}

// Verifica que el webhook realmente lo envía Meta (cabecera
// X-Hub-Signature-256 firmada con el "App Secret").
export function firmaValida(cuerpoCrudo, firma) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) return true; // sin secreto configurado no se valida
  if (!firma) return false;
  const esperado = "sha256=" + crypto.createHmac("sha256", secreto).update(cuerpoCrudo).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(firma);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
