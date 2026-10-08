// Notificaciones push al celular/computador del dueño (Firebase
// Cloud Messaging). Llegan aunque la app esté cerrada, como un
// mensaje: "Nuevo cliente 3:00 pm · Manicure".
import { firebase } from "./firebase.mjs";
import { hora12, fechaCorta, ahoraEnZona, sumarDias } from "../../../public/core.js";

export async function notificarDueno(negocioId, { tipo, cita }, config = {}) {
  const { db, messaging, FieldValue } = firebase();
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
