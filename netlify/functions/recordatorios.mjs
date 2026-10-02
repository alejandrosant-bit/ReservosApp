// ============================================================
// Recordatorios automáticos por WhatsApp (función programada de
// Netlify, corre cada 30 minutos). Envía a cada cliente un aviso
// unas horas antes de su cita — es lo que más reduce las
// inasistencias según los programas exitosos del sector.
//
// Importante: WhatsApp solo deja escribir "texto libre" a un
// cliente hasta 24 h después de su último mensaje. Para avisos
// fuera de esa ventana hay que usar una PLANTILLA aprobada por
// Meta (ver README). Si el negocio configuró el nombre de la
// plantilla, se usa; si no, se intenta con texto normal.
// ============================================================
import { firebase } from "./lib/firebase.mjs";
import { enviarWhatsapp, tokenDe } from "./lib/whatsapp-api.mjs";
import { ahoraEnZona, sumarDias, diferenciaDias, aMinutos, conDefectos, rellenar, fechaLarga, hora12 } from "../../public/core.js";

export const config = { schedule: "*/30 * * * *" };

export default async () => {
  const { db, FieldValue } = firebase();
  const numeros = await db.collection("whatsappNumeros").get();

  for (const n of numeros.docs) {
    const { negocioId } = n.data();
    const phoneNumberId = n.id;
    try {
      const cfgSnap = await db.doc(`negocios/${negocioId}`).get();
      const cfg = conDefectos(cfgSnap.data() || {});
      const horasAntes = Number(cfg.recordatorioHoras) || 0;
      if (!horasAntes || cfg.botActivo === false) continue;

      const ahora = ahoraEnZona(cfg.zonaHoraria);
      const citas = await db
        .collection(`negocios/${negocioId}/citas`)
        .where("fecha", ">=", ahora.fecha)
        .where("fecha", "<=", sumarDias(ahora.fecha, 2))
        .get();

      const token = await tokenDe(negocioId);
      if (!token) continue;

      for (const d of citas.docs) {
        const c = d.data();
        if (c.recordatorioEnviado || !["pendiente", "confirmada"].includes(c.estado) || !c.telefono) continue;
        const faltan = diferenciaDias(ahora.fecha, c.fecha) * 1440 + aMinutos(c.hora) - ahora.minutos;
        if (faltan <= 0 || faltan > horasAntes * 60) continue;

        const vars = {
          negocio: cfg.nombre,
          cliente: (c.clienteNombre || "").split(" ")[0],
          servicio: c.servicioNombre,
          fecha: c.fecha === ahora.fecha ? "hoy" : fechaLarga(c.fecha),
          hora: hora12(c.hora),
        };
        const mensaje = cfg.plantillaRecordatorio
          ? { tipo: "plantilla", nombre: cfg.plantillaRecordatorio, idioma: cfg.plantillaIdioma || "es", parametros: [vars.cliente, vars.servicio, vars.fecha, vars.hora] }
          : { tipo: "texto", texto: rellenar(cfg.mensajes.recordatorio, vars) };
        try {
          await enviarWhatsapp({ phoneNumberId, token, para: c.telefono, mensaje });
          await d.ref.update({ recordatorioEnviado: true, recordatorioEn: FieldValue.serverTimestamp() });
        } catch (e) {
          console.error("Recordatorio no enviado", negocioId, d.id, e.message);
          await d.ref.update({ recordatorioEnviado: true, recordatorioError: String(e.message).slice(0, 300) });
        }
      }
    } catch (e) {
      console.error("Error con negocio", negocioId, e);
    }
  }
  return new Response("ok");
};
