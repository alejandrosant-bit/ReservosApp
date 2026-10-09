// ============================================================
// Reservo — arranque, sesión, navegación y avisos
// ============================================================
import { configurado, sesion, E, alCambiar, iniciarDatos, detenerDatos, sync, actualizar } from "./datos.js";
import * as cfgFirebase from "./firebase-config.js";
import { $, $$, esc, toast, sonar, abrirModal, celebrar, aplicarFondo, cerrarModalSuperior } from "./ui.js";
import { prepararPush } from "./notificaciones.js";
import { hora12, formatoMoneda, estiloDe, vocabularioDe, tintaParaFondo } from "./core.js";
import { iniciarRed } from "./red.js";

const VISTAS = {
  agenda: () => import("./vistas/agenda.js"),
  clientes: () => import("./vistas/clientes.js"),
  caja: () => import("./vistas/caja.js"),
  reportes: () => import("./vistas/reportes.js"),
  ajustes: () => import("./vistas/ajustes.js"),
};

function mostrar(id) {
  ["vista-cargando", "vista-sin-config", "vista-login", "vista-admin", "vista-app"].forEach((v) => $("#" + v).classList.toggle("oculto", v !== id));
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
  const pestanas = $("#login-pestanas");
  const boton = $("#login-boton");
  const error = $("#login-error");
  const clave = $("#login-clave");

  const ponerModo = (registro) => {
    modoRegistro = registro;
    boton.querySelector(".btn-texto").textContent = registro ? "Crear mi cuenta" : "Entrar";
    $("#login-encabezado").textContent = registro ? "Crea tu cuenta" : "Hola de nuevo";
    $("#login-sub").textContent = registro ? "En un minuto configuras tu negocio." : "Entra para ver tu agenda de hoy.";
    cambiar.textContent = registro ? "¿Ya tienes cuenta? Entrar" : "¿No tienes cuenta? Crear una";
    clave.autocomplete = registro ? "new-password" : "current-password";
    $("#login-olvido").classList.toggle("oculto", registro);
    $("#tab-entrar").classList.toggle("sel", !registro);
    $("#tab-crear").classList.toggle("sel", registro);
    $("#tab-entrar").setAttribute("aria-selected", String(!registro));
    $("#tab-crear").setAttribute("aria-selected", String(registro));
    error.textContent = "";
  };
  if (cfgFirebase.permitirRegistro) {
    cambiar.classList.remove("oculto");
    pestanas.classList.remove("oculto");
  } else {
    // Membresía: las cuentas las crea el equipo de Reservo
    $("#login-whatsapp").classList.remove("oculto");
  }
  cambiar.onclick = () => ponerModo(!modoRegistro);
  $("#tab-entrar").onclick = () => ponerModo(false);
  $("#tab-crear").onclick = () => ponerModo(true);

  $("#ver-clave").onclick = () => {
    const ver = clave.type === "password";
    clave.type = ver ? "text" : "password";
    $("#ver-clave").setAttribute("aria-pressed", String(ver));
    $("#ver-clave").setAttribute("aria-label", ver ? "Ocultar clave" : "Mostrar clave");
    $("#ver-clave").textContent = ver ? "🙈" : "👁️";
    clave.focus();
  };

  $("#login-olvido").onclick = async () => {
    const email = $("#login-email").value.trim();
    if (!email) return (error.textContent = "Escribe tu correo arriba y vuelve a tocar “¿Olvidaste tu clave?”.");
    try {
      await sesion.recuperar(email);
      toast("Te enviamos un correo para cambiar la clave 📧");
    } catch (e) {
      error.textContent = traducirError(e);
    }
  };

  $("#form-login").onsubmit = async (ev) => {
    ev.preventDefault();
    error.textContent = "";
    const email = $("#login-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return (error.textContent = "Revisa el correo, parece incompleto.");
    if (clave.value.length < 6) return (error.textContent = "La clave debe tener al menos 6 caracteres.");
    if (!navigator.onLine) return (error.textContent = "Sin internet. La primera vez necesitas conexión para entrar.");
    boton.disabled = true;
    boton.classList.add("cargando");
    try {
      if (modoRegistro) await sesion.registrar(email, clave.value);
      else await sesion.entrar(email, clave.value);
    } catch (e) {
      error.textContent = traducirError(e);
      $(".tarjeta-login").classList.remove("sacudir");
      void $(".tarjeta-login").offsetWidth;
      $(".tarjeta-login").classList.add("sacudir");
    } finally {
      boton.disabled = false;
      boton.classList.remove("cargando");
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
  if (c.includes("user-disabled")) return "Tu cuenta está pausada. Escríbenos por WhatsApp para reactivarla.";
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
    try {
      const mod = await VISTAS[nombre]();
      nombreVista = nombre;
      vistaActual = mod.montar(cont, params) || {};
    } catch (e) {
      // Sin internet y sin esa pantalla guardada, o un error inesperado:
      // se muestra un aviso con botón para reintentar en vez de romperse.
      console.error(e);
      nombreVista = null;
      vistaActual = null;
      cont.innerHTML = `<div class="tarjeta vacio"><span class="grande">🌧️</span>No se pudo abrir esta sección.<br>Revisa la conexión e intenta de nuevo.<br><br><button class="btn btn-pri" id="reintentar">Reintentar</button></div>`;
      cont.querySelector("#reintentar").onclick = navegar;
    }
    window.scrollTo(0, 0);
  } else {
    try {
      vistaActual?.parametros?.(params);
    } catch (e) {
      console.error(e);
    }
  }
}
window.addEventListener("hashchange", navegar);

alCambiar((que) => {
  if (que === "sync") return pintarSync();
  if (que === "avisos") pintarAvisos();
  if (que === "config") aplicarMarca();
  try {
    vistaActual?.actualizar?.(que);
  } catch (e) {
    console.error(e);
    // Si una pantalla falla al refrescarse, se vuelve a montar limpia
    nombreVista = null;
    navegar();
  }
});

// ------------------------------------------------------------
// Red de seguridad: cualquier error inesperado se registra y se
// muestra un aviso amable (como máximo uno cada 10 s), sin dejar
// la pantalla en blanco ni congelada.
// ------------------------------------------------------------
let ultimoAvisoError = 0;
function errorInesperado(err) {
  console.error("Error inesperado:", err);
  const msg = String(err?.message || err || "");
  // Errores del navegador o de extensiones que no afectan la app
  if (/ResizeObserver|Script error|extension:\/\//i.test(msg)) return;
  if (Date.now() - ultimoAvisoError < 10000) return;
  ultimoAvisoError = Date.now();
  toast("Algo no salió como esperábamos. Tus datos están a salvo; intenta de nuevo.", "error", 5000);
}
window.addEventListener("error", (e) => errorInesperado(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  errorInesperado(e.reason);
});

// ------------------------------------------------------------
// Celebraciones: pagos que entran y clientes nuevos (de este
// teléfono, de otro dispositivo o del bot de WhatsApp)
// ------------------------------------------------------------
let pagosPendientes = [];
let temporizadorPagos = null;
function alNuevoMovimiento(m) {
  if (m.tipo !== "ingreso") return;
  // Un cobro puede llegar en varias partes (ej. dólares + pago móvil):
  // se agrupan para celebrar una sola vez con el total.
  pagosPendientes.push(m);
  clearTimeout(temporizadorPagos);
  temporizadorPagos = setTimeout(() => {
    const total = pagosPendientes.reduce((t, x) => t + (Number(x.montoBase) || 0), 0);
    const quien = pagosPendientes.find((x) => x.concepto)?.concepto.split(" — ")[1] || "";
    pagosPendientes = [];
    if (total <= 0) return;
    const est = estiloDe(E.config);
    celebrar({ tipo: "pago", icono: est.lluviaPago[0], lluvia: est.lluviaPago, titulo: est.tituloPago, detalle: `${formatoMoneda(total, E.config.monedaPrincipal)}${quien ? " · " + quien : ""}` });
  }, 700);
}
function alNuevoCliente(c) {
  const nombre = String(c.nombre || "").split(" ")[0];
  const est = estiloDe(E.config);
  celebrar({
    tipo: "cliente",
    icono: c.origen === "whatsapp" ? "💬" : est.iconoCliente,
    lluvia: est.lluviaCliente,
    titulo: est.tituloCliente || `¡Nuevo ${vocabularioDe(E.config).cliente}!`,
    detalle: `${est.bienvenida(nombre)}${c.origen === "whatsapp" ? " · llegó por WhatsApp" : ""}`,
  });
}

// ------------------------------------------------------------
// Marca del negocio (nombre, color, logo)
// ------------------------------------------------------------
// Estilo visual: "belleza" (spa) o "barberia". Un despliegue puede
// fijar el estilo de la pantalla de entrada con estiloPorDefecto.
const ESTILO_DESPLIEGUE = cfgFirebase.estiloPorDefecto || "belleza";
const ICONOS_ESTILO = {
  belleza: ["./icon-192.png", "./manifest.json"],
  barberia: ["./icon-barber-192.png", "./manifest-barber.json"],
};
function aplicarEstilo(estilo) {
  const valido = ["belleza", "barberia", "salud", "general", "taxi", "tecno"].includes(estilo) ? estilo : "belleza";
  const barberia = valido === "barberia";
  document.documentElement.dataset.estilo = valido;
  // Ícono e instalación con la identidad de cada estilo (los demás
  // usan el ícono de Reservo)
  const [icono, manifiesto] = ICONOS_ESTILO[valido] || ["./icon-reservo-192.png", "./manifest-reservo.json"];
  $('link[rel="manifest"]')?.setAttribute("href", manifiesto);
  $('link[rel="apple-touch-icon"]')?.setAttribute("href", icono);
  $('link[rel="icon"]')?.setAttribute("href", icono);
  $$("[data-logo]").forEach((el) => {
    if (!E.config.logo) el.src = icono;
  });
  const login = $("#login-logo");
  if (login && !login.dataset.propio) login.src = icono;
  const sello = $("#reservo-sello");
  if (sello) sello.textContent = barberia ? "barber" : "";
}
aplicarEstilo(ESTILO_DESPLIEGUE);

function aplicarMarca() {
  const c = E.config;
  aplicarEstilo(E.configExiste ? c.estilo : ESTILO_DESPLIEGUE);
  document.documentElement.style.setProperty("--pri", c.colorPrimario || "#c2185b");
  // Letra legible encima del color principal (botones del estilo tecnológico)
  document.documentElement.style.setProperty("--pri-tinta", tintaParaFondo(c.colorPrimario, { oscura: "#1a110b", clara: "#ffffff" })?.tinta || "#ffffff");
  aplicarFondo(c.colorFondo);
  $('meta[name="theme-color"]').setAttribute("content", c.estilo === "tecno" ? c.colorFondo || "#0b0908" : c.colorPrimario || "#c2185b");
  $$("[data-nombre-negocio]").forEach((el) => (el.textContent = c.nombre || "Reservo"));
  $$("[data-logo]").forEach((el) => (el.src = c.logo || (ICONOS_ESTILO[document.documentElement.dataset.estilo] || ["./icon-reservo-192.png"])[0]));
  const V = vocabularioDe(c);
  const nav = $('#nav a[data-tab="clientes"] span:last-child');
  if (nav) nav.textContent = V.Clientes;
  const icoNav = $('#nav a[data-tab="agenda"] .ico');
  if (icoNav) icoNav.textContent = V.viajes ? "🚕" : "📅";
  const nAgenda = $('#nav a[data-tab="agenda"] span:last-child');
  if (nAgenda) nAgenda.textContent = V.viajes ? "Central" : "Agenda";
  document.title = c.nombre || (c.estilo === "barberia" ? "Reservo Barber" : "Reservo");
  if (E.adminViendo) return; // revisando otro negocio: no cambia la entrada de este equipo
  try {
    localStorage.setItem("marca", JSON.stringify({ nombre: c.nombre, color: c.colorPrimario, fondo: c.colorFondo || "", logo: c.logo, estilo: c.estilo }));
  } catch {}
}

function marcaGuardada() {
  try {
    const m = JSON.parse(localStorage.getItem("marca") || "null");
    if (!m) return;
    if (m.estilo) aplicarEstilo(m.estilo);
    if (m.fondo) aplicarFondo(m.fondo);
    if (m.color) document.documentElement.style.setProperty("--pri", m.color);
    if (m.nombre) {
      $("#login-titulo").textContent = m.nombre;
      $("#login-titulo").dataset.propio = "1";
      $("#login-negocio").classList.remove("oculto");
      $$("[data-nombre-negocio]").forEach((el) => (el.textContent = m.nombre));
    }
    if (m.logo) {
      $("#login-logo").src = m.logo;
      $("#login-logo").dataset.propio = "1";
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
      if (esAdmin(user)) abrirPanel();
      else abrirNegocio(user.uid);
    } else {
      cerrarNegocio();
      E.adminViendo = null;
      $("#vista-admin").innerHTML = "";
      mostrar("vista-login");
      iniciarRed($(".login-red"));
    }
  });
}

function abrirNegocio(uid) {
  iniciarDatos(uid, { alNuevoAviso, alNuevoCliente, alNuevoMovimiento });
  mostrar("vista-app");
  aplicarMarca();
  pintarSync();
  nombreVista = null;
  navegar();
  // Las notificaciones del negocio van al teléfono del dueño, no al
  // del administrador que lo está revisando.
  if (!E.adminViendo) prepararPush({ silencioso: true });
  revisarPrimeraVez();
}

function cerrarNegocio() {
  detenerDatos();
  E.uid = null;
  vistaActual?.desmontar?.();
  vistaActual = null;
  nombreVista = null;
  $("#contenido").innerHTML = "";
}

// ------------------------------------------------------------
// Panel Reservo (correo del equipo): alta de negocios, entrar a
// revisarlos/configurarlos y manejar la membresía.
// ------------------------------------------------------------
const esAdmin = (user) => Boolean(cfgFirebase.correoAdmin) && String(user?.email || "").toLowerCase() === cfgFirebase.correoAdmin.toLowerCase();

async function abrirPanel() {
  // Cierra ventanas que hayan quedado abiertas en el negocio revisado
  for (let i = 0; i < 20 && document.querySelector(".modal"); i++) cerrarModalSuperior();
  cerrarNegocio();
  E.adminViendo = null;
  $("#modo-admin").classList.add("oculto");
  $("#vista-app").classList.remove("con-admin");
  aplicarEstilo("tecno");
  document.documentElement.style.setProperty("--pri", "#e3a66e");
  document.documentElement.style.setProperty("--pri-tinta", "#1a110b");
  aplicarFondo("");
  $('meta[name="theme-color"]').setAttribute("content", "#0b0908");
  document.title = "Panel · Reservo";
  mostrar("vista-admin");
  const panel = await import("./vistas/admin.js");
  if (!$("#vista-admin").childElementCount) panel.montarPanel($("#vista-admin"), { usuario: E.usuario, entrar: entrarANegocio });
  else panel.cargar();
}

function entrarANegocio(n) {
  E.adminViendo = n;
  $("#modo-admin-nombre").textContent = n.nombre || n.correo;
  $("#modo-admin").classList.remove("oculto");
  $("#vista-app").classList.add("con-admin");
  location.hash = "agenda";
  abrirNegocio(n.uid);
}
$("#modo-admin-volver").onclick = () => abrirPanel();

// Primera vez: el negocio aún no tiene configuración → asistente
// (una vez por negocio: el administrador puede configurar varios)
let asistenteMostradoPara = null;
alCambiar((que) => {
  if (que === "config") revisarPrimeraVez();
});
async function revisarPrimeraVez() {
  if (!E.uid || asistenteMostradoPara === E.uid || E.configExiste !== false || !navigator.onLine) return;
  asistenteMostradoPara = E.uid;
  const { asistenteInicial } = await import("./vistas/ajustes.js");
  asistenteInicial();
}

// Exponer para depurar desde la consola
window.__agenda = { E, hora12 };
