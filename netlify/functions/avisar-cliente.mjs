// ============================================================
// /api/avisar-cliente — la app le avisa al cliente por WhatsApp
// cuando la central cambia algo de su servicio. Hoy se usa en la
// línea de taxis: "Tu taxi va en camino (placa, conductor, ETA)",
// "Tu taxi llegó" y "No hay taxis disponibles".
// Solo el dueño del negocio (con su sesión de Firebase) puede usarla.
// ============================================================
import { getAuth } from "firebase-admin/auth";
import { firebase } from "./lib/firebase.mjs";
import { negocioDe } from "./lib/admin.mjs";
import { enviarWhatsapp, tokenDe } from "./lib/whatsapp-api.mjs";
import { conDefectos, rellenar } from "../../public/core.js";

export const config = { path: "/api/avisar-cliente" };

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const { db } = firebase();

  // 1) ¿Quién llama? Debe traer el token de su sesión
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let quien;
  try {
    quien = await getAuth().verifyIdToken(token);
  } catch {
    return json({ error: "Sesión no válida. Vuelve a entrar a la app." }, 401);
  }

  let datos;
  try {
    datos = await req.json();
  } catch {
    return json({ error: "Datos inválidos" }, 400);
  }
  const { citaId, evento } = datos || {};
  // El administrador de Reservo puede actuar sobre el negocio que revisa
  const uid = negocioDe(quien, datos?.negocioId);
  if (!citaId || !["asignado", "llego", "sinTaxis"].includes(evento)) return json({ error: "Faltan datos" }, 400);

  // 2) Solo puede avisar sobre servicios de SU negocio
  const raiz = db.doc(`negocios/${uid}`);
  const [cfgSnap, citaSnap] = await Promise.all([raiz.get(), raiz.collection("citas").doc(citaId).get()]);
  if (!citaSnap.exists) return json({ error: "No existe ese servicio" }, 404);
  const cita = citaSnap.data();
  if (!cita.telefono) return json({ error: "El cliente no tiene WhatsApp registrado" }, 400);
  const cfg = conDefectos(cfgSnap.data() || {});

  let placa = "";
  let vehiculo = "";
  if (cita.profesionalId) {
    const p = await raiz.collection("profesionales").doc(cita.profesionalId).get();
    placa = p.data()?.placa || "";
    vehiculo = p.data()?.vehiculo || "Taxi";
  }
  const clave = { asignado: "asignado", llego: "llego", sinTaxis: "canceladoPorEmpresa" }[evento];
  const texto = rellenar(cfg.mensajes[clave] || "", {
    negocio: cfg.nombre,
    cliente: (cita.clienteNombre || "").split(" ")[0],
    conductor: cita.profesionalNombre || "",
    placa: placa || "—",
    vehiculo: vehiculo || "Taxi",
    eta: cita.etaMinutos || 10,
  });

  // 3) Enviar por el número de WhatsApp del negocio
  const phoneNumberId = cfg.whatsappPhoneNumberId;
  const tokenWa = await tokenDe(uid);
  if (!phoneNumberId || !tokenWa) return json({ error: "Conecta WhatsApp en Ajustes para avisar al cliente" }, 400);
  try {
    await enviarWhatsapp({ phoneNumberId, token: tokenWa, para: cita.telefono, mensaje: { tipo: "texto", texto } });
  } catch (e) {
    console.error("avisar-cliente", e.message);
    return json({ error: "WhatsApp no aceptó el mensaje. Si pasaron más de 24 h desde que el cliente escribió, no se le puede escribir libremente." }, 502);
  }
  await citaSnap.ref.set({ avisos: { [evento]: Date.now() } }, { merge: true });
  return json({ ok: true });
};
