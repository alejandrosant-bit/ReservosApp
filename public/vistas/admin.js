// ============================================================
// Panel Reservo — solo para el equipo de Reservo (correoAdmin).
// Dar de alta negocios, ver cómo van, entrar a configurarlos y
// llevar la membresía de US$30 al mes.
// ============================================================
import { llamarAdmin, sesion } from "../datos.js";
import { $, $$, esc, toast, abrirModal, confirmar, datosForm } from "../ui.js";
import { RUBROS, ORDEN_RUBROS, ahoraEnZona, diferenciaDias, fechaCorta, sumarMeses } from "../core.js";

export const PRECIO_MEMBRESIA = 30;

let estado = { negocios: [], hoy: "", buscar: "", cargando: false, error: "" };
let raiz = null;
let alEntrar = null;

function claveAleatoria() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const num = String(Math.floor(1000 + Math.random() * 9000));
  let s = "";
  for (let i = 0; i < 5; i++) s += letras[Math.floor(Math.random() * letras.length)];
  return s[0].toUpperCase() + s.slice(1) + num;
}

const hace = (ms) => {
  if (!ms) return "nunca";
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 2) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
};

// Estado de la membresía: al día, por vencer o vencida
function membresia(n, hoy) {
  if (!n.proximoPago) return { clase: "chip-pendiente", texto: "Sin fecha de pago", vencida: false };
  const dias = diferenciaDias(hoy, n.proximoPago);
  if (dias < 0) return { clase: "chip-no_asistio", texto: `Vencida hace ${-dias} d`, vencida: true };
  if (dias <= 5) return { clase: "chip-pendiente", texto: dias === 0 ? "Vence hoy" : `Vence en ${dias} d`, vencida: false };
  return { clase: "chip-completada", texto: `Al día · ${fechaCorta(n.proximoPago)}`, vencida: false };
}

export function montarPanel(contenedor, { usuario, entrar }) {
  raiz = contenedor;
  alEntrar = entrar;
  raiz.innerHTML = `
    <header class="panel-cab">
      <div class="contenedor-panel panel-cab-fila">
        <div class="reservo-logo panel-logo">
          <svg class="reservo-iso" aria-hidden="true"><use href="#iso-reservo"/></svg>
          <span class="reservo-palabra">reservo</span><span class="panel-sello">panel</span>
        </div>
        <div class="fila">
          <span class="peq suave panel-correo">${esc(usuario.email || "")}</span>
          <button type="button" class="btn btn-sec btn-chico" id="panel-salir">Salir</button>
        </div>
      </div>
    </header>
    <main class="contenedor-panel panel-cuerpo">
      <div class="cab-vista">
        <div><h2>Negocios</h2><p class="peq suave">Da de alta, revisa y configura cada negocio. Membresía: US$${PRECIO_MEMBRESIA} al mes.</p></div>
        <button type="button" class="btn btn-pri" id="panel-nuevo">+ Nuevo negocio</button>
      </div>
      <div class="kpis" id="panel-kpis"></div>
      <div class="fila panel-herramientas">
        <input type="search" id="panel-buscar" placeholder="Buscar por nombre o correo" aria-label="Buscar negocio" />
        <button type="button" class="btn btn-sec" id="panel-recargar" aria-label="Actualizar">↻</button>
      </div>
      <div id="panel-lista" class="panel-lista"></div>
    </main>`;
  $("#panel-salir", raiz).onclick = () => sesion.salir();
  $("#panel-nuevo", raiz).onclick = nuevoNegocio;
  $("#panel-recargar", raiz).onclick = cargar;
  $("#panel-buscar", raiz).oninput = (e) => {
    estado.buscar = e.target.value;
    pintarLista();
  };
  cargar();
}

export async function cargar() {
  if (!raiz) return;
  estado.cargando = true;
  estado.error = "";
  pintar();
  try {
    const r = await llamarAdmin("listar");
    estado.negocios = r.negocios || [];
    estado.hoy = r.hoy || ahoraEnZona().fecha;
  } catch (e) {
    estado.error = e.message;
  }
  estado.cargando = false;
  pintar();
}

function pintar() {
  pintarKpis();
  pintarLista();
}

function pintarKpis() {
  const el = $("#panel-kpis", raiz);
  if (!el) return;
  const ns = estado.negocios;
  const activos = ns.filter((n) => n.activo);
  const vencidos = activos.filter((n) => membresia(n, estado.hoy).vencida);
  const citas = ns.reduce((t, n) => t + (n.citasMes || 0), 0);
  el.innerHTML = [
    [activos.length, "Negocios activos"],
    [`US$${(activos.length * PRECIO_MEMBRESIA).toLocaleString("es-CO")}`, "Ingreso mensual"],
    [vencidos.length, "Pagos vencidos"],
    [citas.toLocaleString("es-CO"), "Citas este mes (todos)"],
  ]
    .map(([v, t]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="t">${esc(t)}</div></div>`)
    .join("");
}

function pintarLista() {
  const el = $("#panel-lista", raiz);
  if (!el) return;
  if (estado.cargando && !estado.negocios.length) {
    el.innerHTML = `<div class="vacio"><div class="spinner" style="margin:0 auto 10px"></div>Cargando negocios…</div>`;
    return;
  }
  if (estado.error) {
    el.innerHTML = `<div class="tarjeta aviso-cruce"><b>No se pudo cargar el panel.</b><p class="peq">${esc(estado.error)}</p>
      <button type="button" class="btn btn-sec btn-chico" id="panel-reintentar" style="margin-top:8px">Reintentar</button></div>`;
    $("#panel-reintentar", el).onclick = cargar;
    return;
  }
  const q = estado.buscar.trim().toLowerCase();
  const lista = estado.negocios.filter((n) => !q || `${n.nombre} ${n.correo}`.toLowerCase().includes(q));
  if (!lista.length) {
    el.innerHTML = `<div class="vacio"><span class="grande">🏪</span>${q ? "Ningún negocio coincide con la búsqueda." : "Aún no hay negocios. Toca “+ Nuevo negocio” para dar de alta el primero."}</div>`;
    return;
  }
  el.innerHTML = lista.map(tarjeta).join("");
  $$("[data-accion]", el).forEach((b) =>
    b.addEventListener("click", () => {
      const n = estado.negocios.find((x) => x.uid === b.dataset.uid);
      if (!n) return;
      ({ entrar: () => alEntrar(n), pago: () => registrarPago(n), estado: () => cambiarEstado(n), mas: () => detalles(n) })[b.dataset.accion]?.();
    })
  );
}

function tarjeta(n) {
  const r = RUBROS[n.rubro];
  const m = membresia(n, estado.hoy);
  return `<article class="tarjeta panel-negocio ${n.activo ? "" : "pausado"}">
    <div class="fila panel-negocio-cab">
      <div class="avatar" aria-hidden="true">${r ? r.icono : "🏪"}</div>
      <div class="crece">
        <div class="negrita">${esc(n.nombre || "Sin configurar")}</div>
        <div class="peq suave">${esc(n.correo)}${r ? ` · ${esc(r.nombre)}` : ""}</div>
      </div>
    </div>
    <div class="fila-wrap">
      <span class="chip ${n.activo ? "chip-completada" : "chip-cancelada"}">${n.activo ? "Activo" : "Pausado"}</span>
      <span class="chip ${m.clase}">${esc(m.texto)}</span>
      ${n.configurado ? "" : '<span class="chip chip-pendiente">Falta configurar</span>'}
      ${n.whatsappConectado ? '<span class="chip chip-wa">WhatsApp</span>' : ""}
    </div>
    <div class="panel-datos">
      <div><b>${n.citasMes}</b><span>citas este mes</span></div>
      <div><b>${n.clientes}</b><span>clientes</span></div>
      <div><b>${esc(hace(n.ultimoIngreso))}</b><span>último ingreso</span></div>
      <div><b>${esc(hace(n.ultimaActividad))}</b><span>última cita creada</span></div>
    </div>
    <div class="fila-wrap panel-acciones">
      <button type="button" class="btn btn-pri btn-chico" data-accion="entrar" data-uid="${esc(n.uid)}">${n.configurado ? "Entrar" : "Configurar"}</button>
      <button type="button" class="btn btn-sec btn-chico" data-accion="pago" data-uid="${esc(n.uid)}">💵 Registrar pago</button>
      <button type="button" class="btn btn-sec btn-chico" data-accion="estado" data-uid="${esc(n.uid)}">${n.activo ? "⏸ Pausar" : "▶ Activar"}</button>
      <button type="button" class="btn btn-sec btn-chico" data-accion="mas" data-uid="${esc(n.uid)}">Más…</button>
    </div>
  </article>`;
}

// ---------- Alta de un negocio ----------
function nuevoNegocio() {
  const hoy = estado.hoy || ahoraEnZona().fecha;
  abrirModal({
    titulo: "Nuevo negocio",
    html: `<form id="f">
      <label>Nombre del negocio<input name="nombre" required maxlength="80" placeholder="Ej. Spa Luna" /></label>
      <label>Tipo de negocio<select name="rubro">${ORDEN_RUBROS.map((k) => `<option value="${k}">${RUBROS[k].icono} ${esc(RUBROS[k].nombre)}</option>`).join("")}</select></label>
      <div class="dos-col">
        <label>Correo del dueño<input name="correo" type="email" required autocomplete="off" placeholder="dueno@correo.com" /></label>
        <label>Clave inicial<input name="clave" required minlength="6" autocomplete="off" value="${claveAleatoria()}" />
          <span class="ayuda">Se la envías; luego puede cambiarla.</span></label>
      </div>
      <label>WhatsApp del dueño (opcional)<input name="telefono" inputmode="tel" placeholder="3001234567" />
        <span class="ayuda">Para enviarle sus datos de entrada con un toque.</span></label>
      <label class="check"><input type="checkbox" name="pago" checked /> Ya pagó el primer mes (US$${PRECIO_MEMBRESIA})</label>
      <p class="error" id="err"></p>
      <button class="btn btn-pri btn-bloque" id="crear">Crear negocio</button>
    </form>`,
    onAbrir(c, cerrar) {
      const f = $("#f", c);
      f.onsubmit = async (ev) => {
        ev.preventDefault();
        const d = datosForm(f);
        const boton = $("#crear", c);
        boton.disabled = true;
        boton.textContent = "Creando…";
        $("#err", c).textContent = "";
        try {
          const pago = Boolean(d.pago);
          const r = await llamarAdmin("crear", {
            nombre: d.nombre,
            correo: d.correo,
            clave: d.clave,
            rubro: d.rubro,
            telefono: d.telefono,
            proximoPago: pago ? sumarMeses(hoy) : hoy,
          });
          if (pago) await llamarAdmin("pago", { uid: r.uid, monto: PRECIO_MEMBRESIA, moneda: "USD", proximoPago: sumarMeses(hoy) }).catch(() => {});
          cerrar();
          toast("Negocio creado ✅");
          await cargar();
          listo({ uid: r.uid, nombre: d.nombre.trim(), correo: d.correo.trim().toLowerCase(), clave: d.clave, telefono: d.telefono, rubro: d.rubro });
        } catch (e) {
          $("#err", c).textContent = e.message;
          boton.disabled = false;
          boton.textContent = "Crear negocio";
        }
      };
    },
  });
}

function textoBienvenida({ nombre, correo, clave }) {
  return `¡Hola! Ya está lista tu cuenta de Reservo para *${nombre}* 🎉\n\nEntra en: ${location.origin}\nCorreo: ${correo}\nClave: ${clave}\n\nTe recomendamos cambiar la clave después de entrar. Cualquier duda, escríbenos por aquí.`;
}

function enlaceWhatsapp(telefono, texto) {
  let num = String(telefono || "").replace(/[^\d]/g, "");
  if (num.length === 10 && num.startsWith("3")) num = "57" + num; // celular colombiano
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

function listo(n) {
  const texto = textoBienvenida(n);
  abrirModal({
    titulo: "¡Negocio creado!",
    html: `<p>Estos son los datos de entrada de <b>${esc(n.nombre)}</b>:</p>
      <div class="tarjeta panel-credenciales"><div>Correo: <b>${esc(n.correo)}</b></div><div>Clave: <b>${esc(n.clave)}</b></div></div>
      <div class="fila-botones">
        ${n.telefono ? `<a class="btn btn-ok" href="${esc(enlaceWhatsapp(n.telefono, texto))}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ""}
        <button type="button" class="btn btn-sec" id="copiar">Copiar datos</button>
        <button type="button" class="btn btn-pri" id="configurar">Configurar ahora</button>
      </div>`,
    onAbrir(c, cerrar) {
      $("#copiar", c).onclick = async () => {
        try {
          await navigator.clipboard.writeText(texto);
          toast("Copiado 📋");
        } catch {
          toast("No se pudo copiar", "error");
        }
      };
      $("#configurar", c).onclick = () => {
        cerrar();
        const neg = estado.negocios.find((x) => x.uid === n.uid) || { ...n, configurado: false, activo: true };
        alEntrar(neg);
      };
    },
  });
}

// ---------- Membresía ----------
function registrarPago(n) {
  const hoy = estado.hoy || ahoraEnZona().fecha;
  const base = n.proximoPago && n.proximoPago > hoy ? n.proximoPago : hoy;
  abrirModal({
    titulo: `Pago · ${n.nombre || n.correo}`,
    html: `<form id="f">
      <div class="dos-col">
        <label>Monto<input name="monto" inputmode="decimal" value="${PRECIO_MEMBRESIA}" /></label>
        <label>Moneda<select name="moneda"><option>USD</option><option>COP</option><option>VES</option></select></label>
      </div>
      <label>Próximo cobro<input type="date" name="proximoPago" required value="${sumarMeses(base)}" />
        <span class="ayuda">Por defecto, un mes después del vencimiento actual.</span></label>
      ${n.pagos?.length ? `<div class="peq suave">Últimos pagos: ${n.pagos.map((p) => `${esc(fechaCorta(p.fecha))} · ${esc(p.moneda)} ${esc(p.monto)}`).join(" — ")}</div>` : ""}
      <p class="error" id="err"></p>
      <button class="btn btn-ok btn-bloque" id="guardar">Registrar pago</button>
    </form>`,
    onAbrir(c, cerrar) {
      $("#f", c).onsubmit = async (ev) => {
        ev.preventDefault();
        const d = datosForm(ev.target);
        $("#guardar", c).disabled = true;
        try {
          await llamarAdmin("pago", { uid: n.uid, monto: Number(String(d.monto).replace(",", ".")) || 0, moneda: d.moneda, proximoPago: d.proximoPago });
          cerrar();
          toast("Pago registrado 💵");
          cargar();
        } catch (e) {
          $("#err", c).textContent = e.message;
          $("#guardar", c).disabled = false;
        }
      };
    },
  });
}

async function cambiarEstado(n) {
  const pausar = n.activo;
  const ok = await confirmar(
    pausar
      ? `¿Pausar ${n.nombre || n.correo}? No podrá entrar a la app hasta que lo actives de nuevo. Sus datos no se borran.`
      : `¿Activar de nuevo ${n.nombre || n.correo}?`,
    { si: pausar ? "Pausar" : "Activar", peligro: pausar }
  );
  if (!ok) return;
  try {
    await llamarAdmin("estado", { uid: n.uid, activo: !pausar });
    toast(pausar ? "Cuenta pausada ⏸" : "Cuenta activada ▶");
    cargar();
  } catch (e) {
    toast(e.message, "error", 6000);
  }
}

function detalles(n) {
  abrirModal({
    titulo: n.nombre || n.correo,
    html: `<form id="f">
      <p class="peq suave">Alta: ${n.creado ? esc(new Date(n.creado).toLocaleDateString("es-CO", { dateStyle: "medium" })) : "—"} · ${esc(n.correo)}</p>
      <label>WhatsApp del dueño<input name="telefono" inputmode="tel" value="${esc(n.telefono || "")}" /></label>
      <label>Nota interna<textarea name="nota" maxlength="500" placeholder="Ej. paga por Nequi el 5 de cada mes">${esc(n.nota || "")}</textarea></label>
      <p class="error" id="err"></p>
      <button class="btn btn-pri btn-bloque">Guardar</button>
      <div class="fila-wrap" style="margin-top:6px">
        ${n.telefono ? `<a class="btn btn-sec btn-chico" target="_blank" rel="noopener" href="${esc(enlaceWhatsapp(n.telefono, `Hola, te escribimos de Reservo sobre ${n.nombre || "tu negocio"}.`))}">💬 Escribirle</a>` : ""}
        <button type="button" class="btn btn-sec btn-chico" id="reset">📧 Enviarle correo para cambiar la clave</button>
      </div>
    </form>`,
    onAbrir(c, cerrar) {
      $("#reset", c).onclick = async () => {
        try {
          await sesion.recuperar(n.correo);
          toast(`Correo enviado a ${n.correo} 📧`);
        } catch (e) {
          toast(e.message, "error");
        }
      };
      $("#f", c).onsubmit = async (ev) => {
        ev.preventDefault();
        const d = datosForm(ev.target);
        try {
          await llamarAdmin("nota", { uid: n.uid, nota: d.nota, telefono: d.telefono });
          cerrar();
          toast("Guardado ✅");
          cargar();
        } catch (e) {
          $("#err", c).textContent = e.message;
        }
      };
    },
  });
}
