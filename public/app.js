// ============================================================
// Reservo — arranque, sesión, navegación y avisos
// ============================================================
import { configurado, sesion, E, alCambiar, iniciarDatos, detenerDatos, sync, actualizar } from "./datos.js";
import { permitirRegistro } from "./firebase-config.js";
import { $, $$, esc, toast, sonar, abrirModal } from "./ui.js";
import { prepararPush } from "./notificaciones.js";
import { hora12 } from "./core.js";

const VISTAS = {
  agenda: () => import("./vistas/agenda.js"),
  clientes: () => import("./vistas/clientes.js"),
  caja: () => import("./vistas/caja.js"),
  reportes: () => import("./vistas/reportes.js"),
  ajustes: () => import("./vistas/ajustes.js"),
};

function mostrar(id) {
  ["vista-cargando", "vista-sin-config", "vista-login", "vista-app"].forEach((v) => $("#" + v).classList.toggle("oculto", v !== id));
}

// ------------------------------------------------------------
// Service worker (abre sin internet + notificaciones push)
// ------------------------------------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW:", e));
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.tipo === "abrir" && e.data.url) location.hash = e.data.url.split("#")[1] || "agenda";
  });
}

// ------------------------------------------------------------
// Login
// ------------------------------------------------------------
let modoRegistro = false;
function prepararLogin() {
  const cambiar = $("#login-cambiar");
  if (permitirRegistro) cambiar.classList.remove("oculto");
  cambiar.onclick = () => {
    modoRegistro = !modoRegistro;
    $("#login-boton").textContent = modoRegistro ? "Crear cuenta" : "Entrar";
    cambiar.textContent = modoRegistro ? "¿Ya tienes cuenta? Entrar" : "¿No tienes cuenta? Crear una";
    $("#login-clave").autocomplete = modoRegistro ? "new-password" : "current-password";
  };
  $("#login-olvido").onclick = async () => {
    const email = $("#login-email").value.trim();
    if (!email) return ($("#login-error").textContent = "Escribe tu correo y vuelve a tocar “¿Olvidaste tu clave?”.");
    try {
      await sesion.recuperar(email);
      toast("Te enviamos un correo para cambiar la clave 📧");
    } catch (e) {
      $("#login-error").textContent = traducirError(e);
    }
  };
  $("#form-login").onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = $("#login-boton");
    btn.disabled = true;
    $("#login-error").textContent = "";
    try {
      const email = $("#login-email").value.trim();
      const clave = $("#login-clave").value;
      if (modoRegistro) await sesion.registrar(email, clave);
      else await sesion.entrar(email, clave);
    } catch (e) {
      $("#login-error").textContent = traducirError(e);
    } finally {
      btn.disabled = false;
    }
  };
}

function traducirError(e) {
  const c = e.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "Correo o clave incorrectos.";
  if (c.includes("email-already-in-use")) return "Ese correo ya tiene cuenta. Toca “Entrar”.";
  if (c.includes("weak-password")) return "La clave debe tener al menos 6 caracteres.";
  if (c.includes("network")) return "Sin internet. La primera vez necesitas conexión para entrar.";
  if (c.includes("too-many-requests")) return "Demasiados intentos. Espera unos minutos.";
  if (c.includes("invalid-email")) return "El correo no es válido.";
  return e.message || "Ocurrió un error.";
}

// ------------------------------------------------------------
// Navegación
// ------------------------------------------------------------
let vistaActual = null;
let nombreVista = null;

async function navegar() {
  const [tab, ...params] = (location.hash.slice(1) || "agenda").split("/");
  const nombre = VISTAS[tab] ? tab : "agenda";
  $$("#nav a").forEach((a) => a.classList.toggle("activo", a.dataset.tab === nombre));
  const cont = $("#contenido");
  if (nombre !== nombreVista) {
    vistaActual?.desmontar?.();
    cont.innerHTML = '<div class="pantalla-centro" style="min-height:40vh"><div class="spinner"></div></div>';
    const mod = await VISTAS[nombre]();
    nombreVista = nombre;
    vistaActual = mod.montar(cont, params) || {};
    window.scrollTo(0, 0);
  } else {
    vistaActual?.parametros?.(params);
  }
}
window.addEventListener("hashchange", navegar);

alCambiar((que) => {
  if (que === "sync") return pintarSync();
  if (que === "avisos") pintarAvisos();
  if (que === "config") aplicarMarca();
  vistaActual?.actualizar?.(que);
});

// ------------------------------------------------------------
// Marca del negocio (nombre, color, logo)
// ------------------------------------------------------------
function aplicarMarca() {
  const c = E.config;
  document.documentElement.style.setProperty("--pri", c.colorPrimario || "#c2185b");
  $('meta[name="theme-color"]').setAttribute("content", c.colorPrimario || "#c2185b");
  $$("[data-nombre-negocio]").forEach((el) => (el.textContent = c.nombre || "Reservo"));
  $$("[data-logo]").forEach((el) => (el.src = c.logo || "./icon-192.png"));
  document.title = c.nombre || "Reservo";
  try {
    localStorage.setItem("marca", JSON.stringify({ nombre: c.nombre, color: c.colorPrimario, logo: c.logo }));
  } catch {}
}

function marcaGuardada() {
  try {
    const m = JSON.parse(localStorage.getItem("marca") || "null");
    if (!m) return;
    if (m.color) document.documentElement.style.setProperty("--pri", m.color);
    if (m.nombre) {
      $("#login-titulo").textContent = m.nombre;
      $$("[data-nombre-negocio]").forEach((el) => (el.textContent = m.nombre));
    }
    if (m.logo) {
      $("#login-logo").src = m.logo;
      $$("[data-logo]").forEach((el) => (el.src = m.logo));
    }
  } catch {}
}

// ------------------------------------------------------------
// Indicador de conexión: "En línea", "Subiendo 3 cambios…" o
// "Sin internet · datos de las 3:40 pm"
// ------------------------------------------------------------
function textoUltima() {
  if (!sync.ultima) return "nunca";
  const d = new Date(sync.ultima);
  const hoyMismo = new Date().toDateString() === d.toDateString();
  const hora = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  return hoyMismo ? hora : `${d.toLocaleDateString("es-CO", { day: "numeric", month: "short" })} ${hora}`;
}

function pintarSync() {
  const el = $("#estado-sync");
  el.className = "chip-sync";
  if (!sync.enLinea) {
    el.classList.add("sin-red");
    el.textContent = `📴 Sin internet · ${textoUltima()}`;
  } else if (sync.pendientes) {
    el.classList.add("subiendo");
    el.textContent = `⏫ Subiendo ${sync.pendientes}…`;
  } else {
    el.classList.add("en-linea");
    el.textContent = "● En línea";
  }
}
$("#estado-sync").onclick = () =>
  abrirModal({
    titulo: "Conexión y respaldo",
    html: `<p>${sync.enLinea ? "✅ Hay internet. Todo lo que hagas se guarda en la nube al instante." : "📴 <b>No hay internet.</b> Puedes seguir trabajando normal: todo se guarda en este teléfono y se sube solo cuando vuelva la señal."}</p>
      <p>Última sincronización con la nube: <b>${esc(textoUltima())}</b></p>
      ${sync.pendientes ? `<p>Cambios esperando subir: <b>${sync.pendientes}</b></p>` : ""}
      <p class="ayuda">Si abres la app sin internet, verás la información tal como estaba la última vez que hubo conexión.</p>`,
  });
setInterval(pintarSync, 60000);

// ------------------------------------------------------------
// Avisos (campanita) — los genera el bot al agendar/cancelar
// ------------------------------------------------------------
function pintarAvisos() {
  const n = E.avisos.filter((a) => !a.leido).length;
  const b = $("#avisos-num");
  b.textContent = n > 9 ? "9+" : n;
  b.classList.toggle("oculto", !n);
}

$("#btn-avisos").onclick = () => {
  const items = E.avisos
    .map(
      (a) => `<div class="item ${a.leido ? "" : "no-leido"}" data-fecha="${esc(a.fecha || "")}" style="cursor:pointer">
        <div class="avatar">${a.tipo === "cancelada" ? "❌" : "🔔"}</div>
        <div class="crece"><div class="negrita">${esc(a.titulo)}</div><div class="peq suave">${esc(a.cuerpo)}</div>
        <div class="mini suave">${a.creado?.toDate ? a.creado.toDate().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : ""}</div></div></div>`
    )
    .join("");
  abrirModal({
    titulo: "Avisos",
    html: `<div class="lista avisos-lista">${items || '<p class="vacio"><span class="grande">🔕</span>Aún no hay avisos. Aquí aparecen las citas que agenda o cancela el bot de WhatsApp.</p>'}</div>`,
    onAbrir(c, cerrar) {
      c.querySelectorAll("[data-fecha]").forEach((el) =>
        el.addEventListener("click", () => {
          if (el.dataset.fecha) location.hash = `agenda/${el.dataset.fecha}`;
          cerrar();
        })
      );
      E.avisos.filter((a) => !a.leido).forEach((a) => actualizar("avisos", a.id, { leido: true }));
    },
  });
};

function alNuevoAviso(a) {
  sonar();
  toast(`${a.titulo} — ${a.cuerpo}`, "aviso", 7000);
}

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------
marcaGuardada();
if (!configurado) {
  mostrar("vista-sin-config");
} else {
  prepararLogin();
  sesion.observar((user) => {
    if (user) {
      E.usuario = user;
      iniciarDatos(user.uid, { alNuevoAviso });
      mostrar("vista-app");
      aplicarMarca();
      pintarSync();
      nombreVista = null;
      navegar();
      prepararPush({ silencioso: true });
      revisarPrimeraVez();
    } else {
      detenerDatos();
      E.uid = null;
      vistaActual?.desmontar?.();
      vistaActual = null;
      nombreVista = null;
      mostrar("vista-login");
    }
  });
}

// Primera vez: el negocio aún no tiene configuración → asistente
let asistenteMostrado = false;
const quitarOyente = alCambiar(async (que) => {
  if (que !== "config" || asistenteMostrado) return;
  revisarPrimeraVez();
});
async function revisarPrimeraVez() {
  if (asistenteMostrado || E.configExiste !== false || !navigator.onLine) return;
  asistenteMostrado = true;
  quitarOyente();
  const { asistenteInicial } = await import("./vistas/ajustes.js");
  asistenteInicial();
}

// Exponer para depurar desde la consola
window.__agenda = { E, hora12 };
