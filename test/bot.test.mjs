import { test } from "node:test";
import assert from "node:assert/strict";
import { procesarMensaje } from "../public/bot.js";
import { analizar } from "../public/nlp.js";
import { horasDisponibles, puedeCancelar, conDefectos } from "../public/core.js";
import { crearStoreMemoria } from "./memoria.mjs";

// Lunes 5 de octubre de 2026, 9:00 am
const AHORA = { fecha: "2026-10-05", minutos: 9 * 60 };
const SERVICIOS = [
  { id: "s1", nombre: "Corte de cabello", duracion: 30, precio: 25000 },
  { id: "s2", nombre: "Manicure", duracion: 60, precio: 30000 },
  { id: "s3", nombre: "Masaje relajante", duracion: 60, precio: 80000 },
];
const CONFIG = { nombre: "Spa Luna", asistente: "Sofi", horasMinCancelacion: 2, pedirCedula: true };

const enviar = (store, texto, extra = {}) => procesarMensaje({ telefono: "573001112233", texto, ...extra }, store, { ahora: AHORA });
const opcion = (store, opcionId) => procesarMensaje({ telefono: "573001112233", opcionId }, store, { ahora: AHORA });
const todoTexto = (r) => r.mensajes.map((m) => m.texto).join("\n");

test("nlp: día y hora en lenguaje natural", () => {
  const ctx = { hoyISO: AHORA.fecha, servicios: SERVICIOS };
  let a = analizar("hola quiero una cita para jueves a las 3", ctx);
  assert.equal(a.intencion, "agendar");
  assert.equal(a.fecha, "2026-10-08");
  assert.equal(a.hora, "15:00");

  a = analizar("me agendas un masaje mañana a las 10 de la mañana", ctx);
  assert.equal(a.fecha, "2026-10-06");
  assert.equal(a.hora, "10:00");
  assert.equal(a.servicio.id, "s3");

  a = analizar("tienes cupo el 15 de octubre a las 4 y media de la tarde para manicur", ctx);
  assert.equal(a.fecha, "2026-10-15");
  assert.equal(a.hora, "16:30");
  assert.equal(a.servicio.id, "s2");

  a = analizar("el sábado 3pm", ctx);
  assert.equal(a.fecha, "2026-10-10");
  assert.equal(a.hora, "15:00");

  a = analizar("pasado mañana 3 de la tarde", ctx);
  assert.equal(a.fecha, "2026-10-07");
  assert.equal(a.hora, "15:00");

  a = analizar("hola quiero cancelar la cita que hice", ctx);
  assert.equal(a.intencion, "cancelar");
});

test("cupos respetan horario, duración y citas existentes", () => {
  const config = conDefectos({ ...CONFIG, capacidad: 1 });
  const citas = [{ id: "x", fecha: "2026-10-08", hora: "15:00", duracion: 60, estado: "pendiente" }];
  const horas = horasDisponibles({ fecha: "2026-10-08", servicio: SERVICIOS[1], citas, profesionales: [], config, ahora: AHORA });
  assert.ok(!horas.includes("15:00"));
  assert.ok(!horas.includes("14:30")); // 60 min chocaría con la de las 15:00
  assert.ok(horas.includes("16:00"));
  assert.ok(horas.includes("17:00"));
  assert.ok(!horas.includes("17:30")); // terminaría después del cierre (18:00)
  // Domingo cerrado por defecto
  assert.deepEqual(horasDisponibles({ fecha: "2026-10-11", servicio: SERVICIOS[0], citas: [], profesionales: [], config, ahora: AHORA }), []);
});

test("flujo completo: cliente nuevo agenda jueves a las 3", async () => {
  const store = crearStoreMemoria({ config: CONFIG, servicios: SERVICIOS });
  let r = await enviar(store, "hola quiero una cita para jueves a las 3");
  assert.match(todoTexto(r), /Spa Luna/);
  assert.match(todoTexto(r), /Sofi/);
  assert.match(todoTexto(r), /nombre y apellido/);

  r = await enviar(store, "maría pérez");
  assert.match(todoTexto(r), /cédula/);

  r = await enviar(store, "1.023.456.789");
  // Tiene día y hora pero falta el servicio
  assert.equal(r.mensajes.at(-1).tipo, "lista");
  assert.equal(r.mensajes.at(-1).filas.length, 3);

  r = await opcion(store, "srv:s2");
  assert.equal(r.mensajes.at(-1).tipo, "botones");
  assert.match(todoTexto(r), /jueves 8 de octubre/);
  assert.match(todoTexto(r), /3:00 pm/);

  r = await opcion(store, "ok");
  assert.match(todoTexto(r), /no faltes/);
  assert.match(todoTexto(r), /2 horas antes/);
  assert.equal(store.db.citas.length, 1);
  assert.equal(store.db.citas[0].hora, "15:00");
  assert.equal(store.db.citas[0].clienteNombre, "María Pérez");
  assert.equal(store.db.clientes[0].cedula, "1023456789");
  assert.equal(store.notificaciones[0].tipo, "nueva");
});

test("hora ocupada ofrece las más cercanas; cliente conocido no repite datos", async () => {
  const store = crearStoreMemoria({
    config: CONFIG,
    servicios: SERVICIOS,
    clientes: [{ id: "c1", nombre: "Ana Gómez", cedula: "555", telefono: "573001112233" }],
    citas: [{ id: "o", clienteId: "z", fecha: "2026-10-08", hora: "15:00", duracion: 60, estado: "pendiente" }],
  });
  let r = await enviar(store, "buenas, quiero manicure el jueves a las 3");
  assert.match(todoTexto(r), /Ana/);
  assert.match(todoTexto(r), /ya no hay cupo/);
  const filas = r.mensajes.at(-1).filas.map((f) => f.id);
  assert.ok(filas.includes("hora:16:00"));
  assert.ok(!filas.includes("hora:15:00"));

  // Responder con el número de la opción también funciona
  const idx = filas.indexOf("hora:16:00") + 1;
  r = await enviar(store, String(idx));
  assert.equal(r.mensajes.at(-1).tipo, "botones");
  r = await enviar(store, "si");
  assert.equal(store.db.citas.filter((c) => c.clienteId === "c1").length, 1);
});

test("cancelar: pide el nombre, encuentra la cita y la cancela", async () => {
  const store = crearStoreMemoria({
    config: CONFIG,
    servicios: SERVICIOS,
    clientes: [{ id: "c1", nombre: "Ana Gómez", cedula: "555", telefono: "573001112233" }],
    citas: [{ id: "k1", clienteId: "c1", clienteNombre: "Ana Gómez", servicioNombre: "Manicure", fecha: "2026-10-08", hora: "15:00", duracion: 60, estado: "pendiente" }],
  });
  let r = await enviar(store, "hola quiero cancelar la cita que hice");
  assert.match(todoTexto(r), /nombre/);
  r = await enviar(store, "ana gomez");
  assert.equal(r.mensajes.at(-1).tipo, "botones");
  r = await opcion(store, "sicancel");
  assert.match(todoTexto(r), /cancelada/);
  assert.equal(store.db.citas[0].estado, "cancelada");
  assert.equal(store.notificaciones[0].tipo, "cancelada");
});

test("cancelar desde otro número exige cédula", async () => {
  const store = crearStoreMemoria({
    config: CONFIG,
    servicios: SERVICIOS,
    clientes: [{ id: "c1", nombre: "Ana Gómez", cedula: "555666", telefono: "573009999999" }],
    citas: [{ id: "k1", clienteId: "c1", servicioNombre: "Manicure", fecha: "2026-10-08", hora: "15:00", duracion: 60, estado: "pendiente" }],
  });
  await enviar(store, "cancelar cita");
  let r = await enviar(store, "Ana Gómez");
  assert.match(todoTexto(r), /cédula/);
  r = await enviar(store, "111222");
  assert.match(todoTexto(r), /no coincide/);
  assert.equal(store.db.citas[0].estado, "pendiente");
});

test("no se puede cancelar con menos de 2 horas", () => {
  const config = conDefectos(CONFIG);
  assert.equal(puedeCancelar({ fecha: AHORA.fecha, hora: "10:30" }, config, AHORA), false);
  assert.equal(puedeCancelar({ fecha: AHORA.fecha, hora: "11:00" }, config, AHORA), true);
});

test("con profesionales: cada uno tiene su propia agenda", () => {
  const config = conDefectos(CONFIG);
  const profesionales = [
    { id: "p1", nombre: "Laura", servicios: [] },
    { id: "p2", nombre: "Diana", servicios: ["s2"] },
  ];
  const citas = [{ id: "a", fecha: "2026-10-08", hora: "15:00", duracion: 60, estado: "pendiente", profesionalId: "p1" }];
  // Manicure: Diana sigue libre a las 15:00
  assert.ok(horasDisponibles({ fecha: "2026-10-08", servicio: SERVICIOS[1], citas, profesionales, config, ahora: AHORA }).includes("15:00"));
  // Masaje: solo Laura lo hace y está ocupada
  assert.ok(!horasDisponibles({ fecha: "2026-10-08", servicio: SERVICIOS[2], citas, profesionales, config, ahora: AHORA }).includes("15:00"));
});

// ------------------------------------------------------------
// Dos personas agendan la misma hora
// ------------------------------------------------------------
async function llevarAConfirmar(store, telefono, nombre, cedula) {
  const env = (texto, opcionId = null) => procesarMensaje({ telefono, texto, opcionId }, store, { ahora: AHORA });
  await env("hola quiero manicure el jueves a las 3");
  await env(nombre);
  return env(cedula);
}

test("dos clientes piden la misma hora: el segundo recibe otras opciones", async () => {
  const store = crearStoreMemoria({ config: CONFIG, servicios: SERVICIOS });
  const a = await llevarAConfirmar(store, "573001111111", "Ana Gómez", "111111");
  const b = await llevarAConfirmar(store, "573002222222", "Bea Ruiz", "222222");
  assert.equal(a.mensajes.at(-1).tipo, "botones"); // ambas ven "¿La confirmo?"
  assert.equal(b.mensajes.at(-1).tipo, "botones");

  const ra = await procesarMensaje({ telefono: "573001111111", opcionId: "ok" }, store, { ahora: AHORA });
  const rb = await procesarMensaje({ telefono: "573002222222", opcionId: "ok" }, store, { ahora: AHORA });
  assert.match(todoTexto(ra), /no faltes/);
  assert.match(todoTexto(rb), /acaba de tomar esa hora/);
  // Le ofrece elegir otra hora (primero mañana/tarde si hay muchas libres)
  const ultimo = rb.mensajes.at(-1);
  assert.ok(["lista", "botones"].includes(ultimo.tipo));
  assert.ok(!(ultimo.filas || ultimo.botones).some((f) => f.id === "hora:15:00"));
  assert.equal(store.db.citas.filter((c) => c.hora === "15:00" && c.fecha === "2026-10-08").length, 1);
});

test("confirmaciones exactamente simultáneas: solo una cita queda creada", async () => {
  const store = crearStoreMemoria({ config: CONFIG, servicios: SERVICIOS });
  await llevarAConfirmar(store, "573001111111", "Ana Gómez", "111111");
  await llevarAConfirmar(store, "573002222222", "Bea Ruiz", "222222");
  const [ra, rb] = await Promise.all([
    procesarMensaje({ telefono: "573001111111", opcionId: "ok" }, store, { ahora: AHORA }),
    procesarMensaje({ telefono: "573002222222", opcionId: "ok" }, store, { ahora: AHORA }),
  ]);
  const textos = [todoTexto(ra), todoTexto(rb)];
  assert.equal(textos.filter((t) => /no faltes/.test(t)).length, 1);
  assert.equal(textos.filter((t) => /acaba de tomar esa hora/.test(t)).length, 1);
  assert.equal(store.db.citas.length, 1);
});

test("con dos profesionales, dos personas sí pueden tener la misma hora", async () => {
  const profesionales = [
    { id: "p1", nombre: "Laura", servicios: [] },
    { id: "p2", nombre: "Diana", servicios: [] },
  ];
  const store = crearStoreMemoria({ config: CONFIG, servicios: SERVICIOS, profesionales });
  await llevarAConfirmar(store, "573001111111", "Ana Gómez", "111111");
  await llevarAConfirmar(store, "573002222222", "Bea Ruiz", "222222");
  await procesarMensaje({ telefono: "573001111111", opcionId: "ok" }, store, { ahora: AHORA });
  await procesarMensaje({ telefono: "573002222222", opcionId: "ok" }, store, { ahora: AHORA });
  const c = store.db.citas;
  assert.equal(c.length, 2);
  assert.notEqual(c[0].profesionalId, c[1].profesionalId);
});

test("detecta citas cruzadas creadas a mano (sobrecupo)", async () => {
  const { citasEnConflicto } = await import("../public/core.js");
  const citas = [
    { id: "a", fecha: "2026-10-08", hora: "15:00", duracion: 60, estado: "pendiente", profesionalId: "p1" },
    { id: "b", fecha: "2026-10-08", hora: "15:30", duracion: 30, estado: "confirmada", profesionalId: "p1" },
    { id: "c", fecha: "2026-10-08", hora: "15:00", duracion: 60, estado: "pendiente", profesionalId: "p2" },
    { id: "d", fecha: "2026-10-08", hora: "15:00", duracion: 60, estado: "cancelada", profesionalId: "p2" },
  ];
  const prof = [{ id: "p1" }, { id: "p2" }];
  assert.deepEqual([...citasEnConflicto(citas, {}, prof)].sort(), ["a", "b"]);
  // Sin profesionales y capacidad 1: todas las activas que se cruzan
  assert.deepEqual([...citasEnConflicto(citas, { capacidad: 1 }, [])].sort(), ["a", "b", "c"]);
  assert.equal(citasEnConflicto(citas, { capacidad: 3 }, []).size, 0);
});

// ------------------------------------------------------------
// Estilo barbería: mismo bot, otro tono
// ------------------------------------------------------------
test("barbería: el bot habla de turnos y con tono de barbería", async () => {
  const store = crearStoreMemoria({ config: { nombre: "Barbería El Clásico", estilo: "barberia" }, servicios: SERVICIOS });
  let r = await enviar(store, "hola");
  assert.match(todoTexto(r), /Bienvenido a \*Barbería El Clásico\*/);
  assert.match(todoTexto(r), /Max/);
  assert.ok(r.mensajes.at(-1).botones.some((b) => b.titulo.includes("Pedir turno")));
  r = await enviar(store, "quiero un corte el jueves a las 3");
  r = await enviar(store, "Carlos Ruiz");
  r = await enviar(store, "1020304050");
  assert.match(todoTexto(r), /¿Te lo aparto\?/);
  r = await enviar(store, "dale");
  assert.match(todoTexto(r), /turno quedó apartado/);
  assert.match(todoTexto(r), /Llega puntual/);
  r = await enviar(store, "quiero cancelar mi turno");
  assert.match(todoTexto(r), /A nombre de quién está el turno/);
});

test("'agendar mi cita' es agendar, no consultar", () => {
  const ctx = { hoyISO: AHORA.fecha, servicios: SERVICIOS };
  assert.equal(analizar("quiero agendar mi cita para mañana", ctx).intencion, "agendar");
  assert.equal(analizar("a qué hora es mi turno?", ctx).intencion, "miscitas");
});
