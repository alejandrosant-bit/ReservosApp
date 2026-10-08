// Store en memoria con la misma interfaz que el de Firestore
// (netlify/functions/lib/store-firestore.mjs), para probar el bot.
import { nombresParecidos, soloDigitos, profesionalesLibres, aMinutos, conDefectos } from "../public/core.js";

export function crearStoreMemoria({ config = {}, servicios = [], profesionales = [], clientes = [], citas = [] } = {}) {
  let n = 0;
  const estados = new Map();
  const db = { clientes: [...clientes], citas: [...citas] };
  const notificaciones = [];
  return {
    config,
    servicios,
    profesionales,
    db,
    notificaciones,
    estados,
    async getEstado(tel) {
      return estados.get(tel) ? structuredClone(estados.get(tel)) : null;
    },
    async setEstado(tel, e) {
      estados.set(tel, structuredClone(e));
    },
    async getCitas(desde, hasta) {
      return db.citas.filter((c) => c.fecha >= desde && c.fecha <= hasta);
    },
    async buscarClientePorTelefono(tel) {
      return db.clientes.find((c) => soloDigitos(c.telefono) === tel) || null;
    },
    async buscarClientePorCedula(ced) {
      return db.clientes.find((c) => c.cedula === ced) || null;
    },
    async buscarClientesPorNombre(nombre) {
      return db.clientes.filter((c) => nombresParecidos(c.nombre, nombre));
    },
    async crearCliente(data) {
      const id = "cli" + ++n;
      db.clientes.push({ id, ...data });
      return id;
    },
    async actualizarCliente(id, data) {
      Object.assign(db.clientes.find((c) => c.id === id), data);
    },
    async crearCita(data) {
      // Igual que la transacción real: vuelve a revisar el cupo
      const libres = profesionalesLibres({ fecha: data.fecha, inicio: aMinutos(data.hora), duracion: data.duracion, servicioId: data.servicioId, citas: db.citas, profesionales, config: conDefectos(config) });
      if (!libres.length) return null;
      const id = "cita" + ++n;
      db.citas.push({ id, ...data });
      return id;
    },
    async crearViaje(data) {
      const id = "viaje" + ++n;
      db.citas.push({ id, ...data });
      return id;
    },
    async citasFuturasDeClientes(ids, desde) {
      return db.citas.filter((c) => ids.includes(c.clienteId) && c.fecha >= desde);
    },
    async citasPorIds(ids) {
      return db.citas.filter((c) => ids.includes(c.id));
    },
    async cancelarCita(id, extra) {
      Object.assign(db.citas.find((c) => c.id === id), { estado: "cancelada", ...extra });
    },
    async notificar(evento) {
      notificaciones.push(evento);
    },
  };
}
