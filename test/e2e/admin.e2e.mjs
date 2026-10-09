// Prueba del Panel Reservo (administrador) con Firebase falso y la
// función /api/admin simulada. Uso: node test/e2e/admin.e2e.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import * as fake from "./fake-firebase.mjs";

const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const chromium = pw.chromium || pw.default.chromium;
const PUBLIC = fileURLToPath(new URL("../../public/", import.meta.url));
const SHOTS = process.env.SHOTS_DIR || null;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const ADMIN = "alejandrosant2001@gmail.com";

const server = createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try {
    const archivo = join(PUBLIC, ruta === "/" ? "index.html" : ruta);
    const data = await readFile(archivo);
    res.writeHead(200, { "Content-Type": TIPOS[extname(archivo)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const URL_BASE = `http://localhost:${server.address().port}/`;

// /api/admin simulada en memoria
const hoy = new Date().toISOString().slice(0, 10);
const cuentas = [
  { uid: "neg-viejo", correo: "barber@clasico.com", activo: true, creado: Date.now() - 864e6, ultimoIngreso: Date.now() - 36e5, configurado: true, nombre: "Barbería El Clásico", rubro: "barberia", telefono: "", whatsappConectado: true, citasMes: 42, clientes: 87, ultimaActividad: Date.now() - 6e5, proximoPago: "2020-01-01", pagos: [], nota: "" },
];
const llamadas = [];
function api(pedido) {
  llamadas.push(pedido);
  if (pedido.accion === "listar") return { negocios: cuentas, hoy };
  if (pedido.accion === "crear") {
    const uid = "neg-" + cuentas.length;
    cuentas.unshift({ uid, correo: pedido.correo, activo: true, creado: Date.now(), ultimoIngreso: null, configurado: false, nombre: pedido.nombre, rubro: pedido.rubro, telefono: pedido.telefono, whatsappConectado: false, citasMes: 0, clientes: 0, ultimaActividad: null, proximoPago: pedido.proximoPago, pagos: [], nota: "" });
    return { ok: true, uid };
  }
  const n = cuentas.find((c) => c.uid === pedido.uid);
  if (pedido.accion === "estado") n.activo = pedido.activo;
  if (pedido.accion === "pago") n.proximoPago = pedido.proximoPago;
  return { ok: true };
}

const errores = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g|ERR_FAILED/.test(m.text()) && errores.push("console: " + m.text()));
page.on("dialog", (d) => d.accept());

const js = (body) => ({ status: 200, contentType: "text/javascript", body });
await page.route("https://www.gstatic.com/firebasejs/**", (route) => {
  const u = route.request().url();
  if (u.endsWith("firebase-app.js")) return route.fulfill(js(fake.firebaseApp));
  if (u.endsWith("firebase-auth.js")) return route.fulfill(js(fake.firebaseAuth.replace('email: "dueno@spa.com"', `email: "${ADMIN}"`)));
  if (u.endsWith("firebase-firestore.js")) return route.fulfill(js(fake.firebaseFirestore));
  if (u.endsWith("firebase-messaging.js")) return route.fulfill(js(fake.firebaseMessaging));
  return route.abort();
});
await page.route(/fonts\.g/, (r) => r.abort());
await page.route("**/api/admin", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(api(JSON.parse(route.request().postData() || "{}"))) }));

let paso = 0;
const foto = async (n) => SHOTS && page.screenshot({ path: `${SHOTS}/admin-${String(++paso).padStart(2, "0")}-${n}.png` });
function ok(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("✔", msg);
}

try {
  await page.goto(URL_BASE);
  await page.waitForSelector("#vista-admin:not(.oculto) .panel-negocio", { timeout: 8000 });
  ok(true, "el correo del equipo abre el Panel Reservo");
  ok((await page.textContent("#panel-lista")).includes("Barbería El Clásico"), "lista los negocios existentes");
  ok((await page.textContent("#panel-lista")).includes("Vencida"), "marca la membresía vencida");
  ok((await page.textContent("#panel-kpis")).includes("US$30"), "calcula el ingreso mensual");
  await foto("panel");

  // Alta de un negocio
  await page.click("#panel-nuevo");
  await page.fill('input[name="nombre"]', "Consultorio Dra. Ruiz");
  await page.selectOption('select[name="rubro"]', "consultorio");
  await page.fill('input[name="correo"]', "dra@ruiz.com");
  await page.fill('input[name="telefono"]', "3001234567");
  await page.click("#crear");
  await page.waitForSelector("text=¡Negocio creado!");
  ok(llamadas.some((l) => l.accion === "crear" && l.correo === "dra@ruiz.com" && l.clave.length >= 6), "crea la cuenta con correo y clave");
  ok(llamadas.some((l) => l.accion === "pago" && l.monto === 30), "registra el primer mes pagado");
  const wa = await page.getAttribute('a:has-text("Enviar por WhatsApp")', "href");
  ok(wa.startsWith("https://wa.me/573001234567?text="), "enlace para enviarle los datos por WhatsApp");
  await foto("creado");

  // Configurarlo: entra al negocio y sale el asistente con los datos
  await page.click("#configurar");
  await page.waitForSelector("text=Configuremos tu negocio");
  ok((await page.inputValue("#nombre-ini")) === "Consultorio Dra. Ruiz", "el asistente trae el nombre");
  ok(await page.isChecked('input[name="rubro"][value="consultorio"]'), "el asistente trae el tipo de negocio");
  ok(!(await page.isHidden("#modo-admin")), "se ve la franja de modo administrador");
  await page.click("text=Empezar");
  await page.waitForTimeout(400);
  ok((await page.textContent("[data-nombre-negocio]")).includes("Consultorio Dra. Ruiz"), "queda configurado y abre su agenda");
  ok((await page.textContent('#nav a[data-tab="clientes"]')).includes("Pacientes"), "con el vocabulario del consultorio");
  await foto("dentro");

  // Volver al panel y pausar el negocio viejo
  await page.click("#modo-admin-volver");
  await page.waitForSelector("#vista-admin:not(.oculto) .panel-negocio");
  ok(await page.isHidden("#modo-admin"), "vuelve al panel sin la franja");
  await page.click('[data-accion="estado"][data-uid="neg-viejo"]');
  await page.click('.modal button:has-text("Pausar")');
  await page.waitForTimeout(300);
  ok(cuentas.find((c) => c.uid === "neg-viejo").activo === false, "pausa la cuenta");
  ok((await page.textContent("#panel-lista")).includes("Pausado"), "la lista muestra Pausado");

  // Entrar al negocio existente y volver
  await page.click('[data-accion="entrar"][data-uid="neg-viejo"]');
  await page.waitForSelector("#vista-app:not(.oculto)");
  ok((await page.textContent("#modo-admin-nombre")).includes("El Clásico"), "entra a revisar otro negocio");
  await page.click("#modo-admin-volver");
  await page.waitForSelector("#vista-admin:not(.oculto)");
  await foto("panel-final");

  ok(errores.length === 0, "sin errores de JavaScript " + (errores.length ? JSON.stringify(errores) : ""));
  console.log("\nTODO OK");
} catch (e) {
  console.error(e.message);
  console.error("Errores de la página:", errores);
  await foto("fallo");
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
