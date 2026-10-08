// Implementación del "store" del bot sobre Firestore.
// Misma interfaz que test/memoria.mjs.
import { firebase } from "./firebase.mjs";
import { notificarDueno } from "./notificar.mjs";
import { profesionalesLibres, aMinutos, nombresParecidos, normalizar, soloDigitos, conDefectos } from "../../../public/core.js";

export const claveTelefono = (t) => soloDigitos(t).slice(-10);

// Busca a qué negocio pertenece un número de WhatsApp Business.
export async function negocioDeNumero(phoneNumberId) {
  const { db } = firebase();
  const snap = await db.doc(`whatsappNumeros/${phoneNumberId}`).get();
  if (snap.exists) return snap.data().negocioId;
  return process.env.NEGOCIO_ID_POR_DEFECTO || null;
}

export async function crearStoreFirestore(negocioId) {
  const { db, FieldValue } = firebase();
  const raiz = db.doc(`negocios/${negocioId}`);
  const [cfgSnap, servSnap, profSnap] = await Promise.all([
    raiz.get(),
    raiz.collection("servicios").get(),
    raiz.collection("profesionales").get(),
  ]);
  const config = conDefectos(cfgSnap.data() || {});
  const servicios = servSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99) || a.nombre.localeCompare(b.nombre));
  const profesionales = profSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let cacheClientes = null;
  async function todosLosClientes() {
    if (!cacheClientes) cacheClientes = docs(await raiz.collection("clientes").select("nombre", "cedula", "telefono").get());
    return cacheClientes;
  }

  return {
    negocioId,
    config,
    servicios,
    profesionales,

    async getEstado(tel) {
      const s = await raiz.collection("conversaciones").doc(tel).get();
      return s.exists ? s.data().estado || null : null;
    },
    async setEstado(tel, estado) {
      await raiz.collection("conversaciones").doc(tel).set({ estado: JSON.parse(JSON.stringify(estado)), actualizado: FieldValue.serverTimestamp() }, { merge: true });
    },

    async getCitas(desde, hasta) {
      return docs(await raiz.collection("citas").where("fecha", ">=", desde).where("fecha", "<=", hasta).get());
    },

    async buscarClientePorTelefono(tel) {
      const s = await raiz.collection("clientes").where("telefonoClave", "==", claveTelefono(tel)).limit(1).get();
      return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
    },
    async buscarClientePorCedula(ced) {
      const s = await raiz.collection("clientes").where("cedula", "==", String(ced)).limit(1).get();
      return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() };
    },
    async buscarClientesPorNombre(nombre) {
      return (await todosLosClientes()).filter((c) => nombresParecidos(c.nombre, nombre));
    },
    async crearCliente(data) {
      const ref = raiz.collection("clientes").doc();
      await ref.set({
        ...data,
        nombreNorm: normalizar(data.nombre),
        telefonoClave: claveTelefono(data.telefono),
        visitas: 0,
        totalGastado: 0,
        creado: FieldValue.serverTimestamp(),
        creadoMs: Date.now(),
      });
      cacheClientes = null;
      return ref.id;
    },
    async actualizarCliente(id, data) {
      const extra = data.telefono ? { telefonoClave: claveTelefono(data.telefono) } : {};
      await raiz.collection("clientes").doc(id).set({ ...data, ...extra }, { merge: true });
      cacheClientes = null;
    },

    // Crea la cita dentro de una transacción: si dos personas piden
    // la misma hora al mismo tiempo, solo una la obtiene.
    // Además de leer las citas del día, la transacción lee y escribe un
    // "candado" por día (bloqueos/{fecha}). Dos reservas simultáneas
    // para el mismo día chocan en ese documento: Firestore repite la
    // segunda, que vuelve a leer las citas, ve la hora ya tomada y
    // devuelve null (el bot ofrece otras horas).
    async crearCita(cita) {
      return db.runTransaction(async (tx) => {
        const candado = raiz.collection("bloqueos").doc(cita.fecha);
        await tx.get(candado);
        const delDia = docs(await tx.get(raiz.collection("citas").where("fecha", "==", cita.fecha)));
        const libres = profesionalesLibres({
          fecha: cita.fecha,
          inicio: aMinutos(cita.hora),
          duracion: cita.duracion,
          servicioId: cita.servicioId,
          citas: delDia,
          profesionales,
          config,
        });
        if (!libres.length) return null;
        if (cita.profesionalId && !libres.some((p) => p.id === cita.profesionalId)) {
          cita.profesionalId = libres[0].id || "";
          cita.profesionalNombre = libres[0].nombre || "";
        }
        const ref = raiz.collection("citas").doc();
        tx.set(candado, { reservas: FieldValue.increment(1), actualizado: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(ref, { ...cita, creado: FieldValue.serverTimestamp(), creadoMs: Date.now(), recordatorioEnviado: false });
        return ref.id;
      });
    },

    // Pedido de taxi: no ocupa un cupo de agenda; la central asigna
    // el conductor desde la app.
    async crearViaje(viaje) {
      const ref = raiz.collection("citas").doc();
      await ref.set({ ...viaje, creado: FieldValue.serverTimestamp(), creadoMs: Date.now(), recordatorioEnviado: false });
      return ref.id;
    },

    async citasFuturasDeClientes(ids, desde) {
      if (!ids.length) return [];
      const s = await raiz.collection("citas").where("clienteId", "in", ids.slice(0, 30)).get();
      return docs(s).filter((c) => c.fecha >= desde);
    },
    async citasPorIds(ids) {
      const refs = ids.filter(Boolean).map((id) => raiz.collection("citas").doc(id));
      if (!refs.length) return [];
      const snaps = await db.getAll(...refs);
      return snaps.filter((s) => s.exists).map((s) => ({ id: s.id, ...s.data() }));
    },
    async cancelarCita(id, extra = {}) {
      await raiz.collection("citas").doc(id).update({ estado: "cancelada", canceladaEn: FieldValue.serverTimestamp(), ...extra });
    },

    async notificar(evento) {
      try {
        await notificarDueno(negocioId, evento, config);
      } catch (e) {
        console.error("No se pudo notificar al dueño:", e);
      }
    },
  };
}
