// Notificaciones push al celular/computador del dueño (Firebase
// Cloud Messaging). Llegan aunque la app esté cerrada, como un
// mensaje: "Nuevo cliente 3:00 pm · Manicure".
import { firebase } from "./firebase.mjs";
import { hora12, fechaCorta, ahoraEnZona, sumarDias } from "../../../public/core.js";

export async function notificarDueno(negocioId, evento, config = {}) {
  const { db, messaging, FieldValue } = firebase();
  // Un cliente pide que lo atienda una persona (o el bot no lo entendió)
  if (evento.tipo === "humano") return avisarHumano(negocioId, evento, { db, messaging, FieldValue });
  const { tipo, cita } = evento;
  const hoy = ahoraEnZona(config.zonaHoraria).fecha;
  const cuando = cita.fecha === hoy ? "hoy" : cita.fecha === sumarDias(hoy, 1) ? "mañana" : fechaCorta(cita.fecha);

  const esViaje = cita.tipo === "viaje";
  let titulo = tipo === "cancelada" ? `❌ Cita cancelada ${hora12(cita.hora)}` : `🔔 Nuevo cliente para ${hora12(cita.hora)}`;
  let cuerpo =
    tipo === "cancelada"
      ? `${cita.clienteNombre || "Cliente"} canceló ${cita.servicioNombre} (${cuando})`
      : `${cita.servicioNombre} · ${cita.clienteNombre || ""} · ${cuando}`;
  if (esViaje) {
    titulo =
      tipo === "cancelada"
        ? "❌ Taxi cancelado por el pasajero"
        : cita.programado
          ? `📅 Taxi programado ${cuando} ${hora12(cita.hora)}`
          : "🚕 ¡Nueva solicitud de taxi!";
    cuerpo = `${cita.recogida || ""} · ${cita.clienteNombre || ""}${cita.destino ? " → " + cita.destino : ""}`;
  }

  // Historial de avisos (la campanita dentro de la app)
  await db.collection(`negocios/${negocioId}/avisos`).add({
    tipo,
    titulo,
    cuerpo,
    citaId: cita.id || "",
    fecha: cita.fecha,
    leido: false,
    creado: FieldValue.serverTimestamp(),
  });

  const snap = await db.collection(`negocios/${negocioId}/dispositivos`).get();
  const tokens = snap.docs.map((d) => d.data().token).filter(Boolean);
  if (!tokens.length) return;

  // Mensaje "solo datos": el service worker (sw.js) lo convierte en
  // notificación con sonido y vibración, y al tocarla abre la cita.
  const res = await messaging.sendEachForMulticast({
    tokens,
    data: { titulo, cuerpo, tipo, citaId: cita.id || "", fecha: cita.fecha, url: `/#agenda/${cita.fecha}` },
    webpush: { headers: { Urgency: "high", TTL: "86400" } },
    android: { priority: "high" },
  });

  // Limpia los tokens de teléfonos que ya no existen
  const borrar = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code || "";
    if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
      borrar.push(snap.docs.find((d) => d.data().token === tokens[i])?.ref);
    }
  });
  await Promise.all(borrar.filter(Boolean).map((ref) => ref.delete()));
}

async function avisarHumano(negocioId, { motivo, telefono, nombre, texto }, { db, FieldValue }) {
  const titulo = motivo === "no_entendio" ? "🙋 El bot no entendió a un cliente" : "🙋 Un cliente pide hablar con una persona";
  const cuerpo = `${nombre || "Cliente"} · +${telefono}${texto ? ` · “${texto}”` : ""}`;
  await db.collection(`negocios/${negocioId}/avisos`).add({ tipo: "humano", titulo, cuerpo, telefono, citaId: "", fecha: "", leido: false, creado: FieldValue.serverTimestamp() });
  await empujar(negocioId, { titulo, cuerpo, tipo: "humano", citaId: "", fecha: "", url: `/#chats/${telefono}` });
}

// El cliente escribió mientras una persona atiende su conversación
// (el bot está en pausa): solo notificación al celular, sin campanita.
export async function avisarMensaje(negocioId, { telefono, nombre, texto }) {
  await empujar(negocioId, { titulo: `💬 ${nombre || "+" + telefono}`, cuerpo: String(texto || "").slice(0, 140), tipo: "mensaje", citaId: "", fecha: "", url: `/#chats/${telefono}` });
}

async function empujar(negocioId, data) {
  const { db, messaging } = firebase();
  const snap = await db.collection(`negocios/${negocioId}/dispositivos`).get();
  const tokens = snap.docs.map((d) => d.data().token).filter(Boolean);
  if (!tokens.length) return;
  await messaging.sendEachForMulticast({ tokens, data, webpush: { headers: { Urgency: "high", TTL: "86400" } }, android: { priority: "high" } });
}
