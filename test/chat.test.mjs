import { test } from "node:test";
import assert from "node:assert/strict";
import { agregarMensajes, mensajeDeChat, deSalidaDelBot, ventanaAbierta, botPausado, etiquetaDeTipo, MAX_MENSAJES, VENTANA_MS } from "../public/chat.js";

test("chat: el historial conserva solo los últimos mensajes", () => {
  let lista = [];
  for (let i = 0; i < MAX_MENSAJES + 25; i++) lista = agregarMensajes(lista, [mensajeDeChat("cliente", "m" + i, i + 1)]);
  assert.equal(lista.length, MAX_MENSAJES);
  assert.equal(lista.at(-1).texto, "m" + (MAX_MENSAJES + 24));
  assert.equal(lista[0].texto, "m25");
  assert.deepEqual(agregarMensajes(undefined, [mensajeDeChat("bot", "hola", 5)]), [{ de: "bot", texto: "hola", ms: 5 }]);
});

test("chat: los botones del bot quedan como opciones", () => {
  const m = deSalidaDelBot({ tipo: "botones", texto: "Elige", botones: [{ id: "a", titulo: "Pedir turno" }, { id: "b", titulo: "Mis turnos" }] }, 10);
  assert.deepEqual(m, { de: "bot", texto: "Elige", ms: 10, opciones: ["Pedir turno", "Mis turnos"] });
  assert.equal(deSalidaDelBot({ tipo: "texto", texto: "Hola" }, 1).opciones, undefined);
});

test("chat: solo se puede escribir dentro de las 24 horas", () => {
  const ahora = 1_800_000_000_000;
  assert.equal(ventanaAbierta({ ultimoClienteMs: ahora - 60_000 }, ahora), true);
  assert.equal(ventanaAbierta({ ultimoClienteMs: ahora - VENTANA_MS + 1000 }, ahora), true);
  assert.equal(ventanaAbierta({ ultimoClienteMs: ahora - VENTANA_MS - 1000 }, ahora), false);
  assert.equal(ventanaAbierta({}, ahora), false);
  assert.equal(ventanaAbierta(null, ahora), false);
});

test("chat: la pausa del bot vence sola", () => {
  const ahora = 1_800_000_000_000;
  assert.equal(botPausado({ pausaHasta: ahora + 1000 }, ahora), true);
  assert.equal(botPausado({ pausaHasta: ahora - 1 }, ahora), false);
  assert.equal(botPausado({ pausaHasta: 0 }, ahora), false);
  assert.equal(botPausado({}, ahora), false);
});

test("chat: audios y fotos se muestran con una etiqueta", () => {
  assert.match(etiquetaDeTipo("audio"), /Audio/);
  assert.match(etiquetaDeTipo("image"), /Foto/);
  assert.match(etiquetaDeTipo("algo-raro"), /Archivo/);
});
