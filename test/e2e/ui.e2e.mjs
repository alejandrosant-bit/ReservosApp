// Prueba de punta a punta de la interfaz en Chromium, con un
// Firebase falso en memoria. Uso:
//   node test/e2e/ui.e2e.mjs  (requiere playwright instalado)
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

const errores = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errores.push("console: " + m.text()));

const js = (body) => ({ status: 200, contentType: "text/javascript", body });
await page.route("https://www.gstatic.com/firebasejs/**", (route) => {
  const u = route.request().url();
  if (u.endsWith("firebase-app.js")) return route.fulfill(js(fake.firebaseApp));
  if (u.endsWith("firebase-auth.js")) return route.fulfill(js(fake.firebaseAuth));
  if (u.endsWith("firebase-firestore.js")) return route.fulfill(js(fake.firebaseFirestore));
  if (u.endsWith("firebase-messaging.js")) return route.fulfill(js(fake.firebaseMessaging));
  return route.abort();
});
await page.route("**/firebase-config.js", (route) =>
  route.fulfill(js(`export const firebaseConfig = { apiKey: "falsa" }; export const vapidKey = ""; export const permitirRegistro = true;`))
);

let paso = 0;
async function foto(nombre) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++paso).padStart(2, "0")}-${nombre}.png`, fullPage: false });
}
function ok(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("✔", msg);
}

try {
  await page.goto(URL_BASE);
  // 1) Asistente de primera vez
  await page.waitForSelector("text=Configuremos tu negocio", { timeout: 5000 });
  await foto("asistente");
  await page.fill('input[name="nombre"]', "Spa Luna");
  await page.selectOption('select[name="pais"]', "VE");
  await page.click("text=Empezar");
  await page.waitForTimeout(300);
  ok((await page.textContent("[data-nombre-negocio]")).includes("Spa Luna"), "nombre del negocio aplicado");
  const nServ = await page.evaluate(() => window.__agenda.E.servicios.length);
  ok(nServ === 5, "servicios de ejemplo creados (" + nServ + ")");
  await foto("agenda-vacia");

  // 2) Nueva cita con cliente nuevo
  await page.click(".fab");
  await page.fill("#buscar-cli", "María Pérez");
  await page.click("text=Crear cliente");
  await page.fill('input[name="cedula"]', "12345678");
  await page.fill('input[name="telefono"]', "4141234567");
  const opts = await page.$$eval('select[name="servicioId"] option', (o) => o.map((x) => x.value).filter(Boolean));
  await page.selectOption('select[name="servicioId"]', opts[3]);
  // Mañana (hoy puede estar cerrado o tarde)
  const manana = await page.evaluate(() => {
    const d = new Date(Date.now() + 86400000 * 2);
    return d.toISOString().slice(0, 10);
  });
  await page.fill('input[name="fecha"]', manana);
  await page.dispatchEvent('input[name="fecha"]', "change");
  const hayHoras = await page.$("#horas button");
  if (hayHoras) await hayHoras.click();
  else {
    await page.click("#hora-manual-btn");
    await page.fill("#hora-manual", "15:00");
  }
  await foto("nueva-cita");
  await page.click("#f-cita button[type=submit]");
  await page.waitForTimeout(300);
  ok((await page.$$(".cita")).length === 1, "la cita aparece en la agenda");
  ok((await page.evaluate(() => window.__agenda.E.clientes.length)) === 1, "cliente creado");
  await foto("agenda-con-cita");

  // 3) Cobrar (pide abrir caja primero) con pago mixto USD + VES
  await page.click(".cita");
  await foto("detalle-cita");
  await page.click('[data-acc="cobrar"]');
  await page.waitForSelector("text=Abrir caja");
  await page.click("button:has-text('Abrir caja')");
  await page.waitForSelector("#f-cobro");
  await page.fill("#lineas [data-monto]", "5");
  await page.click("#otra-linea");
  await foto("cobro-mixto");
  await page.click("text=Registrar pago");
  await page.waitForTimeout(300);
  const movs = await page.evaluate(() => window.__agenda.E.movimientos.map((m) => [m.moneda, m.monto, m.metodo]));
  ok(movs.length === 2 && movs.some((m) => m[0] === "VES"), "pago mixto USD + VES registrado " + JSON.stringify(movs));
  ok((await page.evaluate(() => window.__agenda.E.citas[0].estado)) === "completada", "cita marcada como cobrada");

  // 4) Caja: gasto y cierre con arqueo
  await page.click('a[data-tab="caja"]');
  await page.waitForSelector("text=Caja abierta");
  await page.click("#gasto");
  await page.fill('input[name="concepto"]', "Esmaltes");
  await page.fill('input[name="monto"]', "3");
  await page.click("#f-mov button.btn-peligro");
  await page.waitForTimeout(200);
  await foto("caja");
  await page.click("#cerrar");
  await page.waitForSelector("#f-cierre");
  const primero = await page.$("[data-contado]");
  await primero.fill("100");
  await primero.dispatchEvent("input");
  await foto("arqueo");
  await page.click("text=🔒 Cerrar caja");
  await page.waitForTimeout(300);
  ok(await page.isVisible("text=La caja está cerrada"), "caja cerrada");
  ok(await page.isVisible("text=Cierres anteriores"), "historial de cierres visible");

  // 5) Reportes
  await page.click('a[data-tab="reportes"]');
  await page.waitForSelector("text=Ingresos por método de pago");
  await page.click("text=Este mes");
  await page.waitForSelector("text=Servicios más vendidos");
  await foto("reportes");

  // 6) Clientes
  await page.click('a[data-tab="clientes"]');
  await page.waitForSelector(".item");
  ok((await page.textContent(".item")).includes("María Pérez"), "cliente en la lista");
  await page.click(".item");
  await page.waitForSelector("text=Historial de citas");
  await page.waitForTimeout(200);
  await foto("ficha-cliente");
  await page.keyboard.press("Escape");

  // 7) Ajustes y simulador del bot
  await page.click('a[data-tab="ajustes"]');
  for (const s of ["negocio", "monedas", "pagos", "horario", "reglas", "servicios", "profesionales", "bot", "whatsapp", "notificaciones", "respaldo"]) {
    await page.click(`[data-s="${s}"]`);
    await page.waitForSelector(".modal");
    await page.keyboard.press("Escape");
  }
  ok(true, "todas las secciones de ajustes abren");
  await page.click('[data-s="simulador"]');
  await page.waitForSelector("#sim-txt");
  await page.fill("#sim-txt", "hola quiero una cita para el jueves a las 3");
  await page.press("#sim-txt", "Enter");
  await page.waitForTimeout(300);
  await page.fill("#sim-txt", "Carlos Ruiz");
  await page.press("#sim-txt", "Enter");
  await page.waitForTimeout(200);
  await page.fill("#sim-txt", "20123456");
  await page.press("#sim-txt", "Enter");
  await page.waitForTimeout(300);
  await foto("simulador");
  const textoChat = await page.textContent("#chat");
  ok(textoChat.includes("Spa Luna") && textoChat.includes("Sofi"), "el bot saluda con el nombre del negocio y del asistente");
  await page.keyboard.press("Escape");

  // 8) Aviso que llega del bot (como si alguien agendara por WhatsApp)
  await page.evaluate(async () => {
    const { setDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    await setDoc(doc({}, "negocios", "negocio1", "avisos", "a1"), { titulo: "🔔 Nuevo cliente para 3:00 pm", cuerpo: "Manicure · Ana", leido: false, creado: { toDate: () => new Date() }, fecha: "2026-10-08" });
  });
  await page.waitForSelector(".toast-aviso");
  ok(true, "llega el aviso con sonido cuando el bot agenda");
  ok(await page.isVisible("#avisos-num"), "la campanita muestra el contador");
  await foto("aviso");

  // 9) Escritorio
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('a[data-tab="agenda"]');
  await page.waitForTimeout(300);
  await foto("escritorio-agenda");

  ok(!errores.length, "sin errores de JavaScript" + (errores.length ? ":\n" + errores.join("\n") : ""));
  console.log("\nTODO OK");
} catch (e) {
  console.error(e.message);
  console.error("Errores de la página:\n" + errores.join("\n"));
  await foto("error");
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
