// Prueba de la central de taxis en Chromium (Firebase falso en memoria).
//   node test/e2e/taxi.e2e.mjs
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
page.on("console", (m) => m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g|404/.test(m.text()) && errores.push("console: " + m.text()));

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
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/taxi-${String(++paso).padStart(2, "0")}-${nombre}.png` });
}
function ok(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("✔", msg);
}
const E = () => page.evaluate(() => window.__agenda.E);

try {
  await page.goto(URL_BASE);
  await page.waitForSelector("text=Configuremos tu negocio");
  await page.check('input[name="rubro"][value="taxi"]', { force: true });
  await page.uncheck("#tecno-ini"); // estilo propio de taxis (amarillo)
  await page.fill('input[name="nombre"]', "Taxis Express");
  await foto("asistente");
  await page.click("text=Empezar");
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => document.documentElement.dataset.estilo)) === "taxi", "estilo taxi aplicado");
  ok((await page.textContent('#nav a[data-tab="agenda"]')).includes("Central"), "el menú dice Central");
  ok((await page.textContent('#nav a[data-tab="clientes"]')).includes("Pasajeros"), "el menú dice Pasajeros");
  ok(await page.isVisible("text=No hay pedidos esperando conductor"), "panel de pedidos vacío");

  // Registrar un conductor con placa
  await page.click('a[data-tab="ajustes"]');
  await page.click('[data-s="profesionales"]');
  await page.waitForSelector("text=Agregar conductor");
  await page.click("text=Agregar conductor");
  await page.fill('#f input[name="nombre"]', "Juan Pérez");
  await page.fill('#f input[name="placa"]', "abc 123");
  await page.fill('#f input[name="vehiculo"]', "Hyundai Atos amarillo");
  await page.click('#f button.btn-pri');
  await page.waitForTimeout(300);
  const prof = (await E()).profesionales[0];
  ok(prof?.placa === "ABC123", "conductor guardado con placa " + prof?.placa);
  await page.keyboard.press("Escape");

  // Llega un pedido por WhatsApp
  await page.evaluate(async () => {
    const { setDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const E = window.__agenda.E;
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
    await setDoc(doc({}, "negocios", "negocio1", "citas", "v1"), {
      tipo: "viaje", clienteId: "p1", clienteNombre: "Laura Díaz", telefono: "573005556677", servicioId: E.servicios[0].id, servicioNombre: E.servicios[0].nombre,
      profesionalId: "", profesionalNombre: "", fecha: hoy, hora: "10:00", duracion: 30, precio: 9000, estado: "pendiente", origen: "whatsapp",
      recogida: "Cra 7 # 32-16, Bogotá", ubicacion: { lat: 4.6097, lng: -74.0817 }, destino: "Aeropuerto", programado: false, creadoMs: Date.now(),
    });
    await setDoc(doc({}, "negocios", "negocio1", "avisos", "a1"), { tipo: "viaje", titulo: "🚕 ¡Nueva solicitud de taxi!", cuerpo: "Cra 7 # 32-16 · Laura Díaz", leido: false, creado: { toDate: () => new Date() } });
  });
  await page.click('a[data-tab="agenda"]');
  await page.waitForSelector(".solicitudes [data-asignar]");
  ok((await page.textContent(".solicitudes")).includes("1 pedido espera conductor"), "el pedido aparece en la central");
  await foto("pedido");

  // Asignar conductor
  await page.click(".solicitudes [data-asignar]");
  await page.waitForSelector("#f-asignar");
  await page.click('[data-eta="5"]');
  await foto("asignar");
  await page.click("#f-asignar button.btn-pri");
  await page.waitForTimeout(600);
  let v = (await E()).citas.find((c) => c.id === "v1");
  ok(v.estado === "confirmada" && v.profesionalId === prof.id && v.etaMinutos === 5, "conductor asignado con tiempo de llegada");
  ok(await page.isVisible("text=No hay pedidos esperando conductor"), "el pedido sale de la cola");

  // Llegó y cobrar
  await page.click('[data-cita="v1"]');
  await page.waitForSelector('[data-acc="llego"]');
  await foto("detalle");
  await page.click('[data-acc="llego"]');
  await page.waitForTimeout(300);
  ok((await E()).citas.find((c) => c.id === "v1").llegoMs > 0, "marcado como llegó");
  await page.click('[data-cita="v1"]');
  await page.click('[data-acc="cobrar"]');
  await page.click("button:has-text('Abrir caja')");
  await page.waitForSelector("#f-cobro");
  await page.click("text=Registrar pago");
  await page.waitForSelector(".celebracion-pago");
  ok((await page.textContent(".celebracion-pago")).includes("Carrera cobrada"), "celebración de carrera cobrada");
  ok((await E()).citas.find((c) => c.id === "v1").estado === "completada", "viaje terminado");

  // Pedido tomado por teléfono
  await page.waitForTimeout(500);
  await page.click(".fab");
  await page.waitForSelector("#f-viaje");
  await page.fill('#f-viaje input[name="nombre"]', "Carlos Ruiz");
  await page.fill('#f-viaje input[name="telefono"]', "3001112233");
  await page.fill('#f-viaje input[name="recogida"]', "Hotel Central, Calle 5 # 4-10");
  await page.click("#f-viaje button.btn-pri");
  await page.waitForTimeout(400);
  ok((await E()).citas.filter((c) => c.tipo === "viaje" && c.estado === "pendiente").length === 1, "pedido telefónico en la cola");

  // Simulador del bot: pedir taxi enviando ubicación
  await page.click('a[data-tab="ajustes"]');
  await page.click('[data-s="simulador"]');
  await page.waitForSelector("#sim-ubic");
  await page.fill("#sim-txt", "hola necesito un taxi");
  await page.press("#sim-txt", "Enter");
  await page.waitForTimeout(250);
  await page.fill("#sim-txt", "Andrés");
  await page.press("#sim-txt", "Enter");
  await page.waitForTimeout(250);
  await page.click("#sim-ubic");
  await page.waitForTimeout(250);
  await page.click(".wa .ops button >> nth=-1");
  await page.waitForTimeout(250);
  await page.click("text=✅ Sí, pedir taxi");
  await page.waitForTimeout(300);
  await foto("simulador");
  ok((await page.textContent("#chat")).includes("buscando el taxi más cercano"), "el bot toma el pedido con la ubicación");
  await page.keyboard.press("Escape");

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
