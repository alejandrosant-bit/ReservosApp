import { test } from "node:test";
import assert from "node:assert/strict";
import { sumarMeses } from "../public/core.js";
import { esAdmin, negocioDe, correosAdmin } from "../netlify/functions/lib/admin.mjs";

test("membresía: sumar meses respeta el fin de mes y el cambio de año", () => {
  assert.equal(sumarMeses("2026-10-09"), "2026-11-09");
  assert.equal(sumarMeses("2026-01-31"), "2026-02-28");
  assert.equal(sumarMeses("2028-01-31"), "2028-02-29");
  assert.equal(sumarMeses("2026-12-15"), "2027-01-15");
  assert.equal(sumarMeses("2026-03-31", 3), "2026-06-30");
});

test("panel: solo el correo del equipo es administrador", () => {
  assert.ok(correosAdmin().includes("alejandrosant2001@gmail.com"));
  assert.equal(esAdmin({ uid: "a", email: "Alejandrosant2001@gmail.com" }), true);
  assert.equal(esAdmin({ uid: "b", email: "dueno@spa.com" }), false);
  assert.equal(esAdmin({ uid: "c" }), false);
});

test("panel: el administrador actúa sobre el negocio que revisa; un dueño solo sobre el suyo", () => {
  assert.equal(negocioDe({ uid: "admin1", email: "alejandrosant2001@gmail.com" }, "negocio9"), "negocio9");
  assert.equal(negocioDe({ uid: "admin1", email: "alejandrosant2001@gmail.com" }, undefined), "admin1");
  assert.equal(negocioDe({ uid: "dueno1", email: "dueno@spa.com" }, "negocio9"), "dueno1");
});
