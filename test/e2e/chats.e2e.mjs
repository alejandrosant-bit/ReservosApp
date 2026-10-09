// Prueba de punta a punta de la pestaña "Chats" (bandeja de
// WhatsApp) en Chromium, con Firebase falso y /api/chat simulado.
//   node test/e2e/chats.e2e.mjs  (requiere playwright instalado)
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
    res.writeHead(200, { "Content-Type": TIPOS[extname(archivo)] || "application/octet-stream" });
    res.end(await readFile(archivo));
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(0);
const URL_BASE = `http://localhost:${server.address().port}/`;

const errores = [];
const browser = await chromium.launch();
function ok(cond, msg) {
  if (!cond) throw new Error("FALLÓ: " + msg);
  console.log("✔", msg);
}

const AHORA = Date.now();
const TEL = "573001112233";
const SEMILLA = [
  ["negocios/negocio1", { nombre: "Spa Luna", rubro: "spa", whatsappPhoneNumberId: "999", configurado: true }],
  [
    `negocios/negocio1/conversaciones/${TEL}`,
    {
      nombrePerfil: "Ana G",
      actualizado: 3,
      actualizadoMs: AHORA - 60000,
      ultimoClienteMs: AHORA - 60000,
      noLeidos: 2,
      pideHumano: true,
      mensajes: [
        { de: "cliente", texto: "hola", ms: AHORA - 180000 },
        { de: "bot", texto: "¡Hola! Soy Sofi 👋", ms: AHORA - 179000, opciones: ["Agendar cita", "Mis citas"] },
        { de: "cliente", texto: "quiero hablar con un asesor", ms: AHORA - 60000 },
        { de: "bot", texto: "¡Claro! Ya le avisé al equipo.", ms: AHORA - 59000 },
      ],
    },
  ],
  [
    "negocios/negocio1/conversaciones/573009998877",
    { nombrePerfil: "Luis", actualizado: 2, actualizadoMs: AHORA - 3 * 86400000, ultimoClienteMs: AHORA - 3 * 86400000, noLeidos: 0, mensajes: [{ de: "cliente", texto: "gracias", ms: AHORA - 3 * 86400000 }] },
  ],
];

async function correr(viewport, nombre) {
  const ctx = await browser.newContext({ viewport, serviceWorkers: "block" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && !/ERR_|fonts\.g/.test(m.text()) && errores.push("console: " + m.text()));
  const js = (body) => ({ status: 200, contentType: "text/javascript", body });
  await page.route("https://www.gstatic.com/firebasejs/**", (route) => {
    const u = route.request().url();
    if (u.endsWith("firebase-app.js")) return route.fulfill(js(fake.firebaseApp));
    if (u.endsWith("firebase-auth.js")) return route.fulfill(js(fake.firebaseAuth));
    if (u.endsWith("firebase-firestore.js")) return route.fulfill(js(fake.firebaseFirestore));
    if (u.endsWith("firebase-messaging.js")) return route.fulfill(js(fake.firebaseMessaging));
    return route.abort();
  });
  await page.route("**/firebase-config.js", (route) => route.fulfill(js(`export const firebaseConfig = { apiKey: "falsa" }; export const vapidKey = ""; export const permitirRegistro = true;`)));
  const enviados = [];
  await page.route("**/api/chat", async (route) => {
    enviados.push(JSON.parse(route.request().postData()));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.addInitScript((semilla) => (window.__fakeStore = new Map(semilla)), SEMILLA);

  await page.goto(URL_BASE + "#chats");
  await page.waitForSelector("#chats-lista .item", { timeout: 8000 });
  ok((await page.textContent("#chats-num")) === "1", `[${nombre}] el menú muestra 1 chat por atender`);
  ok((await page.locator("#chats-lista .item").count()) === 2, `[${nombre}] lista con 2 conversaciones`);
  ok((await page.textContent("#chats-lista .item >> nth=0")).includes("Pide atención"), `[${nombre}] primero el que pide una persona`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/chats-${nombre}-1-lista.png` });

  await page.click("#chats-lista .item >> nth=0");
  await page.waitForSelector("#chat-mensajes .burb");
  ok((await page.locator("#chat-mensajes .burb").count()) === 4, `[${nombre}] se ven los 4 mensajes`);
  ok((await page.textContent("#chat-estado")).includes("pidió"), `[${nombre}] avisa que pidió una persona`);
  await page.waitForFunction((t) => window.__fakeStore.get(`negocios/negocio1/conversaciones/${t}`).noLeidos === 0, TEL);
  ok(true, `[${nombre}] al abrirla queda leída`);

  await page.fill("#chat-texto", "Hola Ana, soy Laura del spa");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#chat-texto").value === "" && !document.querySelector("#chat-texto").disabled);
  ok(enviados.length === 1 && enviados[0].telefono === TEL && enviados[0].texto === "Hola Ana, soy Laura del spa", `[${nombre}] el mensaje se envía por /api/chat`);

  await page.click("#chat-bot");
  await page.waitForFunction(() => document.querySelector("#chat-bot").textContent.includes("Devolver"));
  ok((await page.textContent("#chat-estado")).includes("en pausa"), `[${nombre}] el bot queda en pausa`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/chats-${nombre}-2-hilo.png` });
  await page.click("#chat-bot");
  await page.waitForFunction(() => document.querySelector("#chat-bot").textContent.includes("Pausar"));
  ok((await page.evaluate((t) => window.__fakeStore.get(`negocios/negocio1/conversaciones/${t}`).estado, TEL)) === null, `[${nombre}] al devolverlo, el bot arranca de cero`);

  // Conversación vieja: fuera de las 24 horas no se puede escribir
  await page.evaluate(() => (location.hash = "chats/573009998877"));
  await page.waitForFunction(() => document.querySelector("#chat-texto")?.disabled === true);
  ok((await page.textContent("#chat-nota")).includes("24 horas"), `[${nombre}] bloquea escribir pasadas 24 horas`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/chats-${nombre}-3-vencida.png` });
  await ctx.close();
}

try {
  await correr({ width: 390, height: 844 }, "movil");
  await correr({ width: 1280, height: 800 }, "pc");
  ok(!errores.length, "sin errores de JavaScript:\n" + errores.join("\n"));
  console.log("\nChats: todo bien ✅");
} catch (e) {
  console.error(e.message);
  if (errores.length) console.error("Errores de la página:\n" + errores.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
