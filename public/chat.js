// ============================================================
// Bandeja de chats: reglas compartidas entre la app y el servidor.
// Cada conversación de WhatsApp vive en
// negocios/{uid}/conversaciones/{telefono} y guarda ahí mismo sus
// últimos mensajes (lista corta, así no crece sin control).
// ============================================================

export const MAX_MENSAJES = 60; // mensajes que se conservan por conversación
export const VENTANA_MS = 24 * 60 * 60 * 1000; // WhatsApp: 24 h para responder con texto libre
export const PAUSA_MS = 60 * 60 * 1000; // el bot calla 1 h cuando atiende una persona

// de: "cliente" | "bot" | "negocio"
export function mensajeDeChat(de, texto, ms, opciones) {
  const m = { de, texto: String(texto || "").slice(0, 1500), ms: Number(ms) || Date.now() };
  if (opciones?.length) m.opciones = opciones.slice(0, 10).map((o) => String(o).slice(0, 40));
  return m;
}

// Mensaje del bot (texto / botones / lista) → mensaje de la bandeja
export function deSalidaDelBot(m, ms) {
  return mensajeDeChat("bot", m.texto, ms, (m.botones || m.filas || []).map((o) => o.titulo));
}

export function agregarMensajes(previos, nuevos, max = MAX_MENSAJES) {
  return [...(Array.isArray(previos) ? previos : []), ...nuevos].slice(-max);
}

// ¿Se le puede escribir libremente? Solo dentro de las 24 h
// siguientes al último mensaje que envió el cliente.
export const ventanaAbierta = (conv, ahora = Date.now()) => Number(conv?.ultimoClienteMs) > 0 && ahora - Number(conv.ultimoClienteMs) < VENTANA_MS;

// ¿El bot está en pausa porque una persona tomó la conversación?
export const botPausado = (conv, ahora = Date.now()) => Number(conv?.pausaHasta || 0) > ahora;

// Lo que mandó el cliente cuando no es texto
export function etiquetaDeTipo(tipo) {
  return { audio: "🎤 Audio", image: "📷 Foto", video: "🎬 Video", sticker: "🙂 Sticker", document: "📎 Documento", contacts: "👤 Contacto" }[tipo] || "📎 Archivo";
}
