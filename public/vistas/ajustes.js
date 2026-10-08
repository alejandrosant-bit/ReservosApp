// ============================================================
// Ajustes: personalización del negocio, monedas, horario,
// servicios, profesionales, bot de WhatsApp y notificaciones.
// ============================================================
import { E, alCambiar, guardarConfig, guardar, borrar, nuevoId, sesion, db, doc, setDoc, deleteDoc, escribir, listarColeccion, lote } from "../datos.js";
import { ESTILOS, estiloDe, RUBROS, ORDEN_RUBROS, rubroDe, vocabularioDe, MONEDAS, DIAS, MENSAJES_POR_DEFECTO, HORARIO_POR_DEFECTO, formatoMoneda, fechaCorta } from "../core.js";
import { esc, abrirModal, confirmar, toast, datosForm, campoMonto, leerMonto, montoATexto, sonar, descargar, aplicarFondo } from "../ui.js";
import { prepararPush, probarNotificacion, pushDisponible } from "../notificaciones.js";
import { colorProf } from "./agenda.js";

let cont = null;

const SECCIONES = [
  ["negocio", "🏪", "Mi negocio", "Nombre, logo, colores, dirección"],
  ["monedas", "💱", "Monedas y tasas", "COP, USD, Bs… y tasa de cambio"],
  ["pagos", "💳", "Métodos de pago y gastos", "Efectivo, Nequi, Pago móvil, Zelle…"],
  ["horario", "🕘", "Horario de atención", "Días, horas, descanso y feriados"],
  ["reglas", "📏", "Reglas de la agenda", "Intervalos, anticipación, cancelación"],
  ["servicios", "✂️", "Servicios", "Precios y duración"],
  ["profesionales", "💇", "Profesionales", "Equipo, servicios y comisiones"],
  ["bot", "🤖", "Bot de WhatsApp", "Nombre del asistente y mensajes"],
  ["simulador", "🧪", "Probar el bot", "Chatea con tu bot aquí mismo"],
  ["whatsapp", "🔗", "Conectar WhatsApp", "Número de WhatsApp Business"],
  ["notificaciones", "🔔", "Notificaciones", "Sonido y avisos en el celular"],
  ["respaldo", "💾", "Respaldo e instalación", "Descargar copia de tus datos"],
];

export function montar(c, params) {
  cont = c;
  pintar();
  if (params[0]) setTimeout(() => abrirSeccion(params[0]), 0);
  return {
    actualizar(que) {
      if (que === "config" || que === "servicios" || que === "profesionales") pintar();
    },
    parametros(p) {
      if (p[0]) abrirSeccion(p[0]);
    },
  };
}

function secciones() {
  const V = vocabularioDe(E.config);
  return SECCIONES.map(([k, ico, t, d]) =>
    k === "profesionales"
      ? [k, V.viajes ? "🚘" : "👥", V.Profesionales, V.viajes ? "Conductores, placas y vehículos" : "Equipo, servicios y comisiones"]
      : k === "reglas"
        ? [k, ico, t, `Intervalos, anticipación, cancelación de ${V.citas}`]
        : [k, ico, t, d]
  );
}

function pintar() {
  if (!cont) return;
  cont.innerHTML = `
    <div class="cab-vista"><h2>Ajustes</h2><span class="peq suave">${esc(E.usuario?.email || "")}</span></div>
    <div class="menu-ajustes">
      ${secciones().map(([k, ico, t, d]) => `<button class="tarjeta" data-s="${k}"><span class="ico">${ico}</span><span><b>${t}</b><small>${d}</small></span></button>`).join("")}
    </div>
    <div class="seccion"><button class="btn btn-sec btn-bloque" id="salir">Cerrar sesión</button></div>`;
  cont.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => abrirSeccion(b.dataset.s)));
  cont.querySelector("#salir").onclick = async () => {
    if (await confirmar("¿Cerrar sesión en este dispositivo?")) sesion.salir();
  };
}

function abrirSeccion(s) {
  const f = {
    negocio: seccionNegocio,
    monedas: seccionMonedas,
    pagos: seccionPagos,
    horario: seccionHorario,
    reglas: seccionReglas,
    servicios: seccionServicios,
    profesionales: seccionProfesionales,
    bot: seccionBot,
    simulador: () => import("./simulador.js").then((m) => m.abrirSimulador()),
    whatsapp: seccionWhatsapp,
    notificaciones: seccionNotificaciones,
    respaldo: seccionRespaldo,
  }[s];
  f?.();
}

// ------------------------------------------------------------
// Negocio
// ------------------------------------------------------------
// Fondos sugeridos: claros y suaves para el día a día, y oscuros
// para quien quiera un look más elegante o de barbería.
const FONDOS = [
  ["#fbf4f7", "Rosa"],
  ["#f7f1ff", "Lila"],
  ["#eef8f3", "Menta"],
  ["#eef5fb", "Cielo"],
  ["#fbf6ec", "Crema"],
  ["#f2f2f2", "Gris"],
  ["#ecebe8", "Hueso"],
  ["#2b2430", "Ciruela"],
  ["#1c1c1f", "Carbón"],
  ["#0f172a", "Noche"],
];
const ZONAS = [
  ["America/Bogota", "Colombia / Perú / Panamá / Ecuador (UTC−5)"],
  ["America/Caracas", "Venezuela (UTC−4)"],
  ["America/Mexico_City", "México (centro)"],
  ["America/Santo_Domingo", "República Dominicana / Puerto Rico"],
  ["America/Santiago", "Chile"],
  ["America/Argentina/Buenos_Aires", "Argentina"],
  ["America/New_York", "EE. UU. (este) / Miami"],
  ["Europe/Madrid", "España"],
];

function redimensionarImagen(archivo, lado = 192) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = lado;
      const ctx = c.getContext("2d");
      const m = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, lado, lado);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(archivo);
  });
}

function seccionNegocio() {
  const c = E.config;
  abrirModal({
    titulo: "Mi negocio",
    html: `<form id="f">
      <div class="fila" style="gap:14px">
        <img id="logo-prev" src="${esc(c.logo || "./icon-192.png")}" style="width:72px;height:72px;border-radius:18px;object-fit:cover" alt="Logo" />
        <div class="crece"><label>Logo<input type="file" accept="image/*" id="logo" /></label>
        ${c.logo ? '<button type="button" class="btn-link peq" id="quitar-logo">Quitar logo</button>' : ""}</div>
      </div>
      <label>Nombre del negocio<input name="nombre" required value="${esc(c.nombre)}" /></label>
      <label>Tipo de negocio
        <select name="rubro">${ORDEN_RUBROS.map((k) => `<option value="${k}" ${k === rubroDe(c).id ? "selected" : ""}>${RUBROS[k].icono} ${RUBROS[k].nombre}</option>`).join("")}</select>
        <span class="ayuda">Cambia las palabras de la app y del bot (cita, turno, consulta, paciente, conductor…) y el tono de WhatsApp.</span></label>
      <label>Estilo visual
        <select name="estilo">${Object.entries(ESTILOS).map(([k, e]) => `<option value="${k}" ${k === c.estilo ? "selected" : ""}>${e.nombre}</option>`).join("")}</select>
        <span class="ayuda">Colores, letras e íconos. Puedes combinar cualquier estilo con cualquier tipo de negocio.</span></label>
      <label>Dirección<input name="direccion" value="${esc(c.direccion)}" placeholder="Cra 10 # 20-30, Bogotá" /></label>
      <div class="dos-col">
        <label>Teléfono del negocio<input name="telefono" inputmode="tel" value="${esc(c.telefono)}" /></label>
        <label>Código de país<input name="codigoPais" inputmode="numeric" value="${esc(c.codigoPais || "57")}" placeholder="57" />
          <span class="ayuda">57 Colombia · 58 Venezuela · 52 México</span></label>
      </div>
      <div class="dos-col">
        <label>Color principal<input type="color" name="colorPrimario" value="${esc(c.colorPrimario)}" /></label>
        <label>Zona horaria<select name="zonaHoraria">${ZONAS.map(([z, n]) => `<option value="${z}" ${z === c.zonaHoraria ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      </div>
      <div class="fila-wrap">${["#c2185b", "#7c3aed", "#0f766e", "#1d4ed8", "#b45309", "#111827", "#be123c", "#15803d"].map((col) => `<button type="button" class="color-muestra" style="background:${col};border:0;cursor:pointer" data-col="${col}" aria-label="Color ${col}"></button>`).join("")}</div>
      <fieldset class="fondo-campo">
        <legend>Color de fondo</legend>
        <div class="fondos">
          <button type="button" class="fondo-op" data-fondo="" title="El del estilo"><span class="fondo-muestra fondo-estilo"></span>Estilo</button>
          ${FONDOS.map(([col, n]) => `<button type="button" class="fondo-op" data-fondo="${col}" title="${n}"><span class="fondo-muestra" style="background:${col}"></span>${n}</button>`).join("")}
          <label class="fondo-op fondo-libre" title="Elegir otro color"><input type="color" id="fondo-libre" value="${esc(c.colorFondo || "#ffffff")}" /><span>Otro</span></label>
        </div>
        <p class="ayuda" id="fondo-nota">Se ve al instante. Si el fondo es oscuro, las letras que van encima se ponen claras solas para que se lean.</p>
      </fieldset>
      <button class="btn btn-pri btn-bloque">Guardar</button>
    </form>`,
    onAbrir(cu, cerrar) {
      let logo = c.logo || "";
      let fondo = c.colorFondo || "";
      let guardado = false;
      const f = cu.querySelector("#f");
      const marcarFondo = () => {
        cu.querySelectorAll("[data-fondo]").forEach((b) => b.classList.toggle("sel", b.dataset.fondo === fondo));
        cu.querySelector(".fondo-libre").classList.toggle("sel", !!fondo && !FONDOS.some(([col]) => col === fondo));
        aplicarFondo(fondo); // vista previa
      };
      cu.querySelectorAll("[data-fondo]").forEach(
        (b) =>
          (b.onclick = () => {
            fondo = b.dataset.fondo;
            marcarFondo();
          })
      );
      cu.querySelector("#fondo-libre").addEventListener("input", (e) => {
        fondo = e.target.value;
        marcarFondo();
      });
      marcarFondo();
      // Si cierra sin guardar, vuelve el fondo que tenía
      const observador = new MutationObserver(() => {
        if (!cu.isConnected) {
          observador.disconnect();
          if (!guardado) aplicarFondo(E.config.colorFondo);
        }
      });
      observador.observe(document.body, { childList: true });
      cu.querySelectorAll("[data-col]").forEach((b) => (b.onclick = () => (f.colorPrimario.value = b.dataset.col)));
      cu.querySelector("#logo").onchange = async (e) => {
        const a = e.target.files[0];
        if (!a) return;
        logo = await redimensionarImagen(a);
        cu.querySelector("#logo-prev").src = logo;
      };
      cu.querySelector("#quitar-logo")?.addEventListener("click", () => {
        logo = "";
        cu.querySelector("#logo-prev").src = "./icon-192.png";
      });
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(f);
        const cambios = { ...d, codigoPais: d.codigoPais.replace(/\D/g, ""), logo, colorFondo: fondo };
        guardado = true;
        const rubroAnterior = rubroDe(c);
        const estiloAnterior = c.estilo;
        if (d.rubro !== rubroAnterior.id) {
          // Nuevo tipo de negocio: el bot adopta su vocabulario y tono.
          const nuevo = rubroDe({ rubro: d.rubro });
          cambios.mensajes = { ...nuevo.mensajes };
          if (c.asistente === rubroAnterior.asistente) cambios.asistente = nuevo.asistente;
          // Si no tocó el estilo, también pasa al estilo del nuevo tipo
          if (d.estilo === estiloAnterior) cambios.estilo = nuevo.estilo;
          if (nuevo.modo === "viajes") Object.assign(cambios, { pedirCedula: false, horasMinCancelacion: 0 });
        }
        const estiloFinal = cambios.estilo || d.estilo;
        if (estiloFinal !== estiloAnterior && d.colorPrimario === ESTILOS[estiloAnterior]?.color) cambios.colorPrimario = ESTILOS[estiloFinal].color;
        guardarConfig(cambios);
        toast("Guardado ✅");
        cerrar();
      };
    },
  });
}

// ------------------------------------------------------------
// Monedas y tasas
// ------------------------------------------------------------
function seccionMonedas() {
  const c = E.config;
  abrirModal({
    titulo: "Monedas y tasas de cambio",
    html: `<form id="f">
      <label>Moneda principal (en la que pones los precios y ves los reportes)
        <select name="monedaPrincipal">${Object.entries(MONEDAS).map(([k, m]) => `<option value="${k}" ${k === c.monedaPrincipal ? "selected" : ""}>${k} — ${m.nombre}</option>`).join("")}</select></label>
      <div class="negrita peq" style="margin-top:6px">¿Qué monedas recibes?</div>
      <div id="lista-mon">${Object.entries(MONEDAS)
        .map(
          ([k, m]) => `<div class="fila" style="padding:6px 0;border-bottom:1px solid var(--borde)">
          <label class="check crece"><input type="checkbox" name="monedas" value="${k}" ${c.monedas.includes(k) || k === c.monedaPrincipal ? "checked" : ""} /> ${k} <span class="peq suave">${m.nombre}</span></label>
          <div data-tasa="${k}" class="fila peq" style="gap:4px"><span class="suave">1 ${k} =</span><input style="width:120px" data-t="${k}" value="${montoATexto(Number(c.tasas?.[k]) || 0, 4)}" placeholder="0" /><span class="suave" data-pri></span></div>
        </div>`
        )
        .join("")}</div>
      <p class="ayuda">Ejemplo: si tu moneda principal es COP y el dólar está a 4.000, escribe 1 USD = 4.000. En Venezuela con principal USD: 1 VES = 0,027 (o usa VES como principal y 1 USD = 36,5). Actualiza la tasa cuando cambie: los pagos ya registrados guardan la tasa del día.</p>
      <button class="btn btn-pri btn-bloque">Guardar</button>
    </form>`,
    onAbrir(cu, cerrar) {
      const f = cu.querySelector("#f");
      cu.querySelectorAll("[data-t]").forEach((i) => campoMonto(i, 4));
      const refrescar = () => {
        const pri = f.monedaPrincipal.value;
        cu.querySelectorAll("[data-tasa]").forEach((el) => {
          const k = el.dataset.tasa;
          const marcado = cu.querySelector(`input[name=monedas][value="${k}"]`).checked;
          el.style.visibility = k !== pri && marcado ? "visible" : "hidden";
          el.querySelector("[data-pri]").textContent = pri;
        });
        cu.querySelector(`input[name=monedas][value="${pri}"]`).checked = true;
      };
      f.addEventListener("change", refrescar);
      refrescar();
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const pri = f.monedaPrincipal.value;
        const monedas = [...cu.querySelectorAll("input[name=monedas]:checked")].map((i) => i.value);
        if (!monedas.includes(pri)) monedas.unshift(pri);
        const tasas = {};
        cu.querySelectorAll("[data-t]").forEach((i) => {
          const v = leerMonto(i.value, 4);
          if (v && i.dataset.t !== pri) tasas[i.dataset.t] = v;
        });
        const faltan = monedas.filter((m) => m !== pri && !tasas[m]);
        if (faltan.length) toast(`Recuerda poner la tasa de: ${faltan.join(", ")}`, "error", 5000);
        guardarConfig({ monedaPrincipal: pri, monedas: [pri, ...monedas.filter((m) => m !== pri)], tasas, tasasActualizadas: new Date().toISOString() });
        toast("Monedas guardadas ✅");
        cerrar();
      };
    },
  });
}

// ------------------------------------------------------------
// Métodos de pago y categorías de gasto
// ------------------------------------------------------------
function seccionPagos() {
  const c = E.config;
  abrirModal({
    titulo: "Métodos de pago y gastos",
    html: `<form id="f">
      <label>Métodos de pago (uno por línea)<textarea name="metodosPago" rows="7">${esc(c.metodosPago.join("\n"))}</textarea>
        <span class="ayuda">Ideas: Efectivo, Transferencia, Nequi, Daviplata, Bancolombia, Pago móvil, Zelle, Binance, Punto de venta, Tarjeta. Todo lo que diga “Efectivo” cuenta para el arqueo del cajón.</span></label>
      <label>Categorías de gastos (una por línea)<textarea name="categoriasGasto" rows="7">${esc(c.categoriasGasto.join("\n"))}</textarea></label>
      <button class="btn btn-pri btn-bloque">Guardar</button>
    </form>`,
    onAbrir(cu, cerrar) {
      cu.querySelector("#f").onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(ev.target);
        const lineas = (t) => [...new Set(t.split("\n").map((x) => x.trim()).filter(Boolean))];
        const metodos = lineas(d.metodosPago);
        if (!metodos.some((m) => /efectivo/i.test(m))) metodos.unshift("Efectivo");
        guardarConfig({ metodosPago: metodos, categoriasGasto: lineas(d.categoriasGasto) });
        toast("Guardado ✅");
        cerrar();
      };
    },
  });
}

// ------------------------------------------------------------
// Horario
// ------------------------------------------------------------
function seccionHorario() {
  const c = E.config;
  const orden = [1, 2, 3, 4, 5, 6, 0];
  abrirModal({
    titulo: "Horario de atención",
    html: `<form id="f">
      ${orden
        .map((d) => {
          const h = c.horario[d] || HORARIO_POR_DEFECTO[d];
          return `<div class="horario-fila"><label class="check"><input type="checkbox" name="abierto${d}" ${h.abierto ? "checked" : ""} /> ${DIAS[d][0].toUpperCase() + DIAS[d].slice(1)}</label>
          <input type="time" name="desde${d}" value="${h.desde}" /><input type="time" name="hasta${d}" value="${h.hasta}" /></div>`;
        })
        .join("")}
      <div class="negrita peq" style="margin-top:8px">Descanso / almuerzo (opcional, todos los días)</div>
      <div class="dos-col"><input type="time" name="descDesde" value="${esc(c.descanso?.desde || "")}" /><input type="time" name="descHasta" value="${esc(c.descanso?.hasta || "")}" /></div>
      <label>Días cerrados (feriados, vacaciones)
        <div class="fila"><input type="date" id="nuevo-cerrado" /><button type="button" class="btn btn-sec" id="add-cerrado">Agregar</button></div></label>
      <div id="cerrados" class="fila-wrap"></div>
      <button class="btn btn-pri btn-bloque">Guardar</button>
    </form>`,
    onAbrir(cu, cerrar) {
      let cerrados = [...(c.diasCerrados || [])].filter((x) => x >= new Date().toISOString().slice(0, 10)).sort();
      const pintarC = () => {
        cu.querySelector("#cerrados").innerHTML = cerrados.map((x) => `<span class="chip">${fechaCorta(x)} ${x.slice(0, 4)} <button type="button" class="btn-link" data-q="${x}">✕</button></span>`).join("") || '<span class="peq suave">Ninguno</span>';
        cu.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => ((cerrados = cerrados.filter((x) => x !== b.dataset.q)), pintarC())));
      };
      pintarC();
      cu.querySelector("#add-cerrado").onclick = () => {
        const v = cu.querySelector("#nuevo-cerrado").value;
        if (v && !cerrados.includes(v)) cerrados = [...cerrados, v].sort();
        pintarC();
      };
      cu.querySelector("#f").onsubmit = (ev) => {
        ev.preventDefault();
        const f = ev.target;
        const horario = {};
        for (const d of orden) {
          horario[d] = { abierto: f[`abierto${d}`].checked, desde: f[`desde${d}`].value || "08:00", hasta: f[`hasta${d}`].value || "18:00" };
          if (horario[d].abierto && horario[d].desde >= horario[d].hasta) return toast(`Revisa el horario del ${DIAS[d]}`, "error");
        }
        guardarConfig({ horario, descanso: { desde: f.descDesde.value, hasta: f.descHasta.value }, diasCerrados: cerrados });
        toast("Horario guardado ✅");
        cerrar();
      };
    },
  });
}

// ------------------------------------------------------------
// Reglas de la agenda
// ------------------------------------------------------------
function seccionReglas() {
  const c = E.config;
  const conProfes = E.profesionales.filter((p) => p.activo !== false).length;
  abrirModal({
    titulo: "Reglas de la agenda",
    html: `<form id="f">
      <div class="dos-col">
        <label>Citas cada (minutos)<select name="intervalo">${[10, 15, 20, 30, 45, 60].map((n) => `<option ${n === Number(c.intervalo) ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label>Citas a la misma hora<input type="number" min="1" max="30" name="capacidad" value="${c.capacidad}" ${conProfes ? "disabled" : ""} />
          <span class="ayuda">${conProfes ? "Se calcula con tus profesionales." : "Sillas/camillas disponibles."}</span></label>
      </div>
      <div class="dos-col">
        <label>Anticipación mínima (minutos)<input type="number" min="0" name="anticipacionMinutos" value="${c.anticipacionMinutos}" /><span class="ayuda">Para citas del mismo día por WhatsApp.</span></label>
        <label>Agendar hasta (días adelante)<input type="number" min="1" max="180" name="diasMaxAnticipacion" value="${c.diasMaxAnticipacion}" /></label>
      </div>
      <div class="dos-col">
        <label>Cancelar hasta (horas antes)<input type="number" min="0" max="72" name="horasMinCancelacion" value="${c.horasMinCancelacion}" /></label>
        <label>Recordatorio (horas antes)<input type="number" min="0" max="48" name="recordatorioHoras" value="${c.recordatorioHoras}" /><span class="ayuda">0 = no enviar.</span></label>
      </div>
      <button class="btn btn-pri btn-bloque">Guardar</button>
    </form>`,
    onAbrir(cu, cerrar) {
      cu.querySelector("#f").onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(ev.target);
        const num = (k, def) => (d[k] === undefined || d[k] === "" ? def : Number(d[k]));
        guardarConfig({
          intervalo: num("intervalo", 30),
          capacidad: num("capacidad", c.capacidad),
          anticipacionMinutos: num("anticipacionMinutos", 60),
          diasMaxAnticipacion: num("diasMaxAnticipacion", 30),
          horasMinCancelacion: num("horasMinCancelacion", 2),
          recordatorioHoras: num("recordatorioHoras", 3),
        });
        toast("Guardado ✅");
        cerrar();
      };
    },
  });
}

// ------------------------------------------------------------
// Servicios
// ------------------------------------------------------------
function seccionServicios() {
  const base = E.config.monedaPrincipal;
  const { cuerpo, cerrar } = abrirModal({
    titulo: "Servicios",
    html: `<div id="lista"></div><button class="btn btn-pri btn-bloque" id="nuevo" style="margin-top:12px">+ Nuevo servicio</button>`,
    onAbrir(cu) {
      cu.querySelector("#nuevo").onclick = () => editarServicio();
    },
  });
  const pintarL = () => {
    cuerpo.querySelector("#lista").innerHTML = E.servicios.length
      ? `<div class="lista">${E.servicios
          .map(
            (s) => `<div class="item" data-id="${s.id}"><span class="punto" style="--color:${esc(s.color || "var(--pri)")}"></span>
          <div class="crece"><div class="negrita">${esc(s.nombre)} ${s.activo === false ? '<span class="chip">Oculto</span>' : ""}</div><div class="peq suave">${s.duracion || 30} min${s.categoria ? " · " + esc(s.categoria) : ""}</div></div>
          <div class="negrita">${formatoMoneda(s.precio, base)}</div></div>`
          )
          .join("")}</div>`
      : '<p class="vacio">Aún no tienes servicios.</p>';
    cuerpo.querySelectorAll("[data-id]").forEach((el) => (el.onclick = () => editarServicio(E.servicios.find((s) => s.id === el.dataset.id))));
  };
  const quitar = alCambiar((x) => {
    if (!cuerpo.isConnected) return quitar();
    if (x === "servicios") pintarL();
  });
  pintarL();
  return cerrar;
}

function editarServicio(s = null) {
  const base = E.config.monedaPrincipal;
  const dec = MONEDAS[base]?.decimales ?? 2;
  abrirModal({
    titulo: s ? "Editar servicio" : "Nuevo servicio",
    html: `<form id="f">
      <label>Nombre<input name="nombre" required value="${esc(s?.nombre || "")}" placeholder="Ej. Manicure semipermanente" /></label>
      <div class="dos-col">
        <label>Precio (${base})<input name="precio" value="${montoATexto(s?.precio || 0, dec)}" autocomplete="off" /></label>
        <label>Duración (min)<input type="number" name="duracion" min="5" step="5" value="${s?.duracion || 30}" required /></label>
      </div>
      <div class="dos-col">
        <label>Categoría<input name="categoria" value="${esc(s?.categoria || "")}" placeholder="Uñas, Cabello, Spa…" /></label>
        <label>Color<input type="color" name="color" value="${esc(s?.color || "#c2185b")}" /></label>
      </div>
      <label>Descripción corta (la ve el cliente en WhatsApp)<input name="descripcion" maxlength="60" value="${esc(s?.descripcion || "")}" /></label>
      <label>Otras palabras con que lo piden<input name="palabrasClave" value="${esc(s?.palabrasClave || "")}" placeholder="Ej. uñas, manos, esmaltado" />
        <span class="ayuda">Ayuda al bot a entender: si escriben “quiero arreglarme las uñas” sabrá que es este servicio.</span></label>
      <div class="dos-col">
        <label>Orden en la lista<input type="number" name="orden" value="${s?.orden ?? ""}" placeholder="1, 2, 3…" /></label>
        <label class="check" style="margin-top:22px"><input type="checkbox" name="activo" ${s?.activo === false ? "" : "checked"} /> Visible para agendar</label>
      </div>
      <div class="fila-botones">${s ? '<button type="button" class="btn btn-sec" id="borrar">🗑️ Eliminar</button>' : ""}<button class="btn btn-pri">Guardar</button></div>
    </form>`,
    onAbrir(cu, cerrar) {
      const f = cu.querySelector("#f");
      campoMonto(f.precio, dec);
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(f);
        guardar("servicios", s?.id || nuevoId("servicios"), {
          nombre: d.nombre.trim(),
          precio: leerMonto(d.precio, dec),
          duracion: Number(d.duracion) || 30,
          categoria: d.categoria.trim(),
          color: d.color,
          descripcion: d.descripcion.trim(),
          palabrasClave: d.palabrasClave.trim(),
          orden: d.orden === "" ? 99 : Number(d.orden),
          activo: f.activo.checked,
        });
        toast("Servicio guardado ✅");
        cerrar();
      };
      cu.querySelector("#borrar")?.addEventListener("click", async () => {
        if (await confirmar(`¿Eliminar “${s.nombre}”? Las citas pasadas no se borran. (Si solo quieres ocultarlo, desmarca “Visible”.)`, { si: "Eliminar", peligro: true })) {
          borrar("servicios", s.id);
          cerrar();
        }
      });
    },
  });
}

// ------------------------------------------------------------
// Profesionales
// ------------------------------------------------------------
function seccionProfesionales() {
  const V = vocabularioDe(E.config);
  const { cuerpo } = abrirModal({
    titulo: V.Profesionales,
    html: `<p class="ayuda">${
      V.viajes
        ? "Registra a tus conductores con su placa y vehículo. Al asignar un pedido, el pasajero recibe por WhatsApp el nombre, la placa y el tiempo de llegada."
        : `Si registras a tu equipo, cada uno tiene su propia agenda: el bot ofrece una hora si al menos uno de los que hacen ese servicio está libre. Si trabajas sola/o, no necesitas agregar a nadie.`
    }</p>
      <div id="lista"></div><button class="btn btn-pri btn-bloque" id="nuevo" style="margin-top:12px">+ Agregar ${V.profesional}</button>`,
    onAbrir(cu) {
      cu.querySelector("#nuevo").onclick = () => editarProfesional();
    },
  });
  const pintarL = () => {
    cuerpo.querySelector("#lista").innerHTML = E.profesionales.length
      ? `<div class="lista">${E.profesionales
          .map(
            (p, i) => `<div class="item" data-id="${p.id}"><span class="punto" style="--color:${esc(colorProf(p, i))}"></span>
          <div class="crece"><div class="negrita">${esc(p.nombre)} ${p.activo === false ? '<span class="chip">Inactivo</span>' : ""}</div>
          <div class="peq suave">${p.servicios?.length ? p.servicios.map((id) => E.servicios.find((s) => s.id === id)?.nombre).filter(Boolean).join(", ") : "Todos los servicios"}</div></div>
          <div class="peq">${p.placa ? esc(p.placa) : p.comision ? p.comision + "%" : ""}</div></div>`
          )
          .join("")}</div>`
      : '<p class="vacio">Sin profesionales registrados.</p>';
    cuerpo.querySelectorAll("[data-id]").forEach((el) => (el.onclick = () => editarProfesional(E.profesionales.find((p) => p.id === el.dataset.id))));
  };
  const quitar = alCambiar((x) => {
    if (!cuerpo.isConnected) return quitar();
    if (x === "profesionales") pintarL();
  });
  pintarL();
}

function editarProfesional(p = null) {
  const V = vocabularioDe(E.config);
  abrirModal({
    titulo: p ? `Editar ${V.profesional}` : `Nuevo ${V.profesional}`,
    html: `<form id="f">
      <label>Nombre<input name="nombre" required value="${esc(p?.nombre || "")}" /></label>
      ${
        V.viajes
          ? `<div class="tres-col">
        <label>Placa<input name="placa" value="${esc(p?.placa || "")}" placeholder="ABC123" autocomplete="off" style="text-transform:uppercase" /></label>
        <label>Vehículo<input name="vehiculo" value="${esc(p?.vehiculo || "")}" placeholder="Kia Picanto amarillo" autocomplete="off" /></label>
        <label>Celular<input name="celular" inputmode="tel" value="${esc(p?.celular || "")}" autocomplete="off" /></label>
      </div>`
          : ""
      }
      <div class="dos-col">
        <label>Comisión (%)<input type="number" min="0" max="100" step="0.5" name="comision" value="${p?.comision ?? ""}" placeholder="Ej. 40" /></label>
        <label>Color en la agenda<input type="color" name="color" value="${esc(p?.color || colorProf(null, E.profesionales.length))}" /></label>
      </div>
      <div class="negrita peq">¿Qué servicios hace? (ninguno marcado = todos)</div>
      <div>${E.servicios.map((s) => `<label class="check" style="padding:4px 0"><input type="checkbox" name="servicios" value="${s.id}" ${p?.servicios?.includes(s.id) ? "checked" : ""} /> ${esc(s.nombre)}</label>`).join("")}</div>
      <label class="check"><input type="checkbox" name="activo" ${p?.activo === false ? "" : "checked"} /> Activo (recibe ${V.citas})</label>
      <div class="fila-botones">${p ? '<button type="button" class="btn btn-sec" id="borrar">🗑️ Eliminar</button>' : ""}<button class="btn btn-pri">Guardar</button></div>
    </form>`,
    onAbrir(cu, cerrar) {
      const f = cu.querySelector("#f");
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(f);
        guardar("profesionales", p?.id || nuevoId("profesionales"), {
          nombre: d.nombre.trim(),
          comision: Number(d.comision) || 0,
          color: d.color,
          servicios: [].concat(d.servicios || []),
          activo: f.activo.checked,
          ...(V.viajes ? { placa: String(d.placa || "").toUpperCase().replace(/\s+/g, ""), vehiculo: (d.vehiculo || "").trim(), celular: (d.celular || "").trim() } : {}),
        });
        toast("Guardado ✅");
        cerrar();
      };
      cu.querySelector("#borrar")?.addEventListener("click", async () => {
        if (await confirmar(`¿Eliminar a ${p.nombre}? Sus citas pasadas se conservan.`, { si: "Eliminar", peligro: true })) {
          borrar("profesionales", p.id);
          cerrar();
        }
      });
    },
  });
}

// ------------------------------------------------------------
// Bot de WhatsApp: personalidad y mensajes
// ------------------------------------------------------------
const ETIQUETAS_MENSAJES = {
  bienvenida: "Saludo de bienvenida",
  elegirServicio: "Pedir el servicio",
  elegirDia: "Pedir el día",
  elegirHora: "Mostrar horas libres",
  horaDisponible: "Hay cupo a la hora pedida",
  horaOcupada: "No hay cupo a la hora pedida",
  diaCerrado: "Día cerrado",
  confirmada: "Cita confirmada (despedida)",
  pedirNombre: "Pedir nombre (cliente nuevo)",
  pedirCedula: "Pedir cédula",
  pedirNombreCancelar: "Cancelar: pedir nombre",
  elegirCitaCancelar: "Cancelar: elegir cita",
  confirmarCancelar: "Cancelar: confirmar",
  cancelada: "Cita cancelada",
  sinCitas: "No se encontraron citas",
  muyTarde: "Muy tarde para cancelar",
  recordatorio: "Recordatorio automático",
  despedida: "Respuesta a “gracias”",
  noEntendi: "No entendí",
  fueraDeServicio: "Bot apagado",
};

const ETIQUETAS_TAXI = {
  bienvenida: "Saludo de bienvenida",
  pedirNombre: "Pedir nombre (pasajero nuevo)",
  pedirOrigen: "Pedir dirección o ubicación de recogida",
  pedirDestino: "Pedir destino",
  pedirCuando: "Pedir día y hora (taxi programado)",
  confirmarViaje: "Confirmar el pedido",
  viajePedido: "Pedido recibido (buscando conductor)",
  viajeProgramado: "Taxi programado",
  asignado: "Taxi en camino (conductor, placa, minutos)",
  llego: "El taxi llegó",
  canceladoPorEmpresa: "No hay taxis disponibles",
  cancelada: "Viaje cancelado",
  sinViajes: "No tiene viajes para cancelar",
  muyTarde: "No se puede cancelar (ya va en camino)",
  recordatorio: "Recordatorio de taxi programado",
  despedida: "Respuesta a “gracias”",
  noEntendi: "No entendí",
  fueraDeServicio: "Bot apagado",
};

function seccionBot() {
  const c = E.config;
  const ETIQ = vocabularioDe(c).viajes ? ETIQUETAS_TAXI : ETIQUETAS_MENSAJES;
  abrirModal({
    titulo: "Bot de WhatsApp",
    ancho: "ancho",
    html: `<form id="f">
      <label class="check"><input type="checkbox" name="botActivo" ${c.botActivo !== false ? "checked" : ""} /> Bot encendido (responde y agenda solo)</label>
      <div class="dos-col">
        <label>Nombre del asistente<input name="asistente" value="${esc(c.asistente)}" placeholder="Sofi" /></label>
        <label class="check" style="margin-top:22px"><input type="checkbox" name="pedirCedula" ${c.pedirCedula ? "checked" : ""} /> Pedir cédula a clientes nuevos</label>
      </div>
      <p class="ayuda">Variables que puedes usar: {negocio} {asistente} {cliente} {servicio} {fecha} {hora} {direccion} {horas_cancelacion}. Taxis: {origen} {destino} {conductor} {placa} {vehiculo} {eta}. Usa *texto* para <b>negrita</b> y _texto_ para <i>cursiva</i> en WhatsApp.</p>
      ${Object.entries(ETIQ)
        .map(
          ([k, t]) => `<label>${t} <button type="button" class="btn-link mini" data-reset="${k}" style="align-self:flex-start">Restaurar original</button>
          <textarea name="m_${k}" rows="${(c.mensajes[k] || "").length > 140 ? 6 : 2}">${esc(c.mensajes[k])}</textarea></label>`
        )
        .join("")}
      <details><summary class="negrita peq" style="cursor:pointer">Plantilla de recordatorio (avanzado)</summary>
        <p class="ayuda">WhatsApp solo deja escribirle libremente a un cliente durante 24 h después de su último mensaje. Para recordatorios fuera de ese tiempo crea una plantilla en Meta con 4 variables ({{1}} cliente, {{2}} servicio, {{3}} fecha, {{4}} hora) y escribe aquí su nombre.</p>
        <div class="dos-col"><label>Nombre de la plantilla<input name="plantillaRecordatorio" value="${esc(c.plantillaRecordatorio || "")}" placeholder="recordatorio_cita" /></label>
        <label>Idioma<input name="plantillaIdioma" value="${esc(c.plantillaIdioma || "es")}" /></label></div>
      </details>
      <div class="fila-botones"><button type="button" class="btn btn-sec" id="probar">🧪 Probar bot</button><button class="btn btn-pri">Guardar</button></div>
    </form>`,
    onAbrir(cu, cerrar) {
      const f = cu.querySelector("#f");
      const originales = rubroDe(c).mensajes;
      cu.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = () => (f[`m_${b.dataset.reset}`].value = originales[b.dataset.reset])));
      const leer = () => {
        const d = datosForm(f);
        const mensajes = {};
        for (const k of Object.keys(ETIQ)) mensajes[k] = (d[`m_${k}`] || "").trim() || originales[k];
        return {
          botActivo: f.botActivo.checked,
          pedirCedula: f.pedirCedula.checked,
          asistente: d.asistente.trim() || "Asistente",
          plantillaRecordatorio: d.plantillaRecordatorio.trim(),
          plantillaIdioma: d.plantillaIdioma.trim() || "es",
          mensajes,
        };
      };
      cu.querySelector("#probar").onclick = () => {
        guardarConfig(leer());
        import("./simulador.js").then((m) => m.abrirSimulador());
      };
      f.onsubmit = (ev) => {
        ev.preventDefault();
        guardarConfig(leer());
        toast("Bot actualizado ✅");
        cerrar();
      };
    },
  });
}

// ------------------------------------------------------------
// Conectar WhatsApp (Meta WhatsApp Cloud API)
// ------------------------------------------------------------
async function seccionWhatsapp() {
  const c = E.config;
  const webhook = `${location.origin}/api/whatsapp`;
  abrirModal({
    titulo: "Conectar WhatsApp Business",
    ancho: "ancho",
    html: `<ol class="peq" style="padding-left:18px;line-height:1.6">
        <li>Entra a <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com</a> → crea una app tipo <b>Empresa</b> → agrega el producto <b>WhatsApp</b>.</li>
        <li>En <b>WhatsApp → Configuración de la API</b> registra el número del negocio y copia el <b>Identificador del número de teléfono</b> (Phone number ID).</li>
        <li>Crea un <b>token permanente</b> (Configuración del negocio → Usuarios del sistema → Generar token con permisos <i>whatsapp_business_messaging</i>).</li>
        <li>En <b>WhatsApp → Configuración → Webhook</b> pega:<br>URL: <code>${esc(webhook)}</code><br>Token de verificación: el mismo que pusiste en Netlify como <code>WHATSAPP_VERIFY_TOKEN</code>.<br>Y suscríbete al campo <b>messages</b>.</li>
      </ol>
      <form id="f">
        <label>Identificador del número (Phone number ID)<input name="phoneNumberId" inputmode="numeric" value="${esc(c.whatsappPhoneNumberId || "")}" placeholder="123456789012345" /></label>
        <label>Token de acceso permanente<input name="token" type="password" placeholder="${c.whatsappConectado ? "•••••••• (guardado — escribe solo si quieres cambiarlo)" : "EAAG…"}" autocomplete="off" />
          <span class="ayuda">Se guarda en una zona privada de tu base de datos. Si en Netlify configuraste WHATSAPP_TOKEN puedes dejarlo vacío.</span></label>
        <label>Número de WhatsApp del negocio (para mostrar)<input name="whatsappNumero" inputmode="tel" value="${esc(c.whatsappNumero || "")}" placeholder="+57 300 123 4567" /></label>
        <div class="fila-botones">
          ${c.whatsappNumero ? `<a class="btn btn-sec" target="_blank" rel="noopener" href="https://wa.me/${esc(String(c.whatsappNumero).replace(/\D/g, ""))}?text=Hola">Abrir chat de prueba</a>` : ""}
          <button class="btn btn-pri">Guardar conexión</button>
        </div>
      </form>`,
    onAbrir(cu, cerrar) {
      cu.querySelector("#f").onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(ev.target);
        const pnid = d.phoneNumberId.replace(/\D/g, "");
        const anterior = c.whatsappPhoneNumberId;
        if (anterior && anterior !== pnid) escribir(deleteDoc(doc(db, "whatsappNumeros", anterior)), { silencioso: true });
        if (pnid) escribir(setDoc(doc(db, "whatsappNumeros", pnid), { negocioId: E.uid, actualizado: Date.now() }));
        if (d.token.trim()) escribir(setDoc(doc(db, "negocios", E.uid, "privado", "whatsapp"), { token: d.token.trim() }, { merge: true }));
        guardarConfig({ whatsappPhoneNumberId: pnid, whatsappNumero: d.whatsappNumero.trim(), whatsappConectado: !!(pnid && (d.token.trim() || c.whatsappConectado)) });
        toast("Conexión guardada ✅ Escribe “hola” al número para probar.", "ok", 6000);
        cerrar();
      };
    },
  });
}

// ------------------------------------------------------------
// Notificaciones
// ------------------------------------------------------------
function seccionNotificaciones() {
  const permiso = "Notification" in window ? Notification.permission : "no-disponible";
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  abrirModal({
    titulo: "Notificaciones",
    html: `<p>Cuando alguien agende o cancele por WhatsApp sonará un aviso y te llegará una notificación como esta:</p>
      <div class="tarjeta" style="box-shadow:none;border:1px solid var(--borde)"><b>🔔 Nuevo cliente para 3:00 pm</b><div class="peq suave">Manicure · María Pérez · hoy</div></div>
      <p class="peq">Estado en este dispositivo: <b>${permiso === "granted" ? "✅ Activadas" : permiso === "denied" ? "⛔ Bloqueadas (actívalas en los ajustes del navegador)" : permiso === "no-disponible" ? "No disponible en este navegador" : "Sin activar"}</b></p>
      ${esIOS && !instalada ? '<p class="tarjeta" style="background:var(--alerta-suave);box-shadow:none">📱 En iPhone primero toca <b>Compartir → Agregar a pantalla de inicio</b>, abre la app desde ese ícono y luego activa las notificaciones.</p>' : ""}
      <div class="fila-botones" style="flex-direction:column">
        <button class="btn btn-pri" id="activar">🔔 Activar notificaciones en este dispositivo</button>
        <button class="btn btn-sec" id="sonido">🔊 Probar sonido</button>
        <button class="btn btn-sec" id="prueba" ${pushDisponible() ? "" : "disabled"}>📲 Probar notificación</button>
      </div>
      <p class="ayuda">Actívalas en cada celular o computador donde quieras recibir los avisos (dueño, recepción…).</p>`,
    onAbrir(cu) {
      cu.querySelector("#activar").onclick = () => prepararPush();
      cu.querySelector("#sonido").onclick = () => sonar();
      cu.querySelector("#prueba").onclick = async () => {
        if (Notification.permission !== "granted") await prepararPush();
        if (Notification.permission === "granted") {
          sonar();
          probarNotificacion();
        }
      };
    },
  });
}

// ------------------------------------------------------------
// Respaldo e instalación
// ------------------------------------------------------------
function seccionRespaldo() {
  abrirModal({
    titulo: "Respaldo e instalación",
    html: `<h4>📲 Instalar como app</h4>
      <p class="peq"><b>Android (Chrome):</b> menú ⋮ → <i>Instalar aplicación</i> o <i>Agregar a pantalla de inicio</i>.<br>
      <b>iPhone (Safari):</b> botón Compartir → <i>Agregar a pantalla de inicio</i>.<br>
      <b>Computador (Chrome/Edge):</b> ícono de instalar en la barra de direcciones.</p>
      <p class="peq">Una vez instalada abre sin internet y muestra lo último que se sincronizó. Lo que hagas sin señal se sube solo al volver la conexión.</p>
      <h4 style="margin-top:14px">💾 Copia de seguridad</h4>
      <p class="peq">Descarga todos tus datos (clientes, citas, caja, configuración) en un archivo.</p>
      <button class="btn btn-sec btn-bloque" id="respaldo">⬇️ Descargar respaldo completo</button>`,
    onAbrir(cu) {
      cu.querySelector("#respaldo").onclick = async () => {
        const b = cu.querySelector("#respaldo");
        b.disabled = true;
        b.textContent = "Preparando…";
        try {
          const nombres = ["servicios", "profesionales", "clientes", "citas", "movimientos", "cajas"];
          const datos = { exportado: new Date().toISOString(), config: E.config };
          for (const n of nombres) datos[n] = await listarColeccion(n);
          descargar(`respaldo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(datos, null, 1), "application/json");
        } catch (e) {
          toast("No se pudo crear el respaldo: " + e.message, "error");
        }
        b.disabled = false;
        b.textContent = "⬇️ Descargar respaldo completo";
      };
    },
  });
}

// ------------------------------------------------------------
// Asistente de primera vez
// ------------------------------------------------------------

const PAISES = {
  CO: { nombre: "Colombia", moneda: "COP", monedas: ["COP", "USD"], zona: "America/Bogota", codigo: "57", metodos: ["Efectivo", "Transferencia", "Nequi", "Daviplata", "Tarjeta"], tasas: { USD: 4000 } },
  VE: { nombre: "Venezuela", moneda: "USD", monedas: ["USD", "VES"], zona: "America/Caracas", codigo: "58", metodos: ["Efectivo", "Pago móvil", "Zelle", "Punto de venta", "Binance", "Transferencia"], tasas: { VES: 0.027 } },
  MX: { nombre: "México", moneda: "MXN", monedas: ["MXN", "USD"], zona: "America/Mexico_City", codigo: "52", metodos: ["Efectivo", "Transferencia", "Tarjeta"], tasas: { USD: 18 } },
  PE: { nombre: "Perú", moneda: "PEN", monedas: ["PEN", "USD"], zona: "America/Bogota", codigo: "51", metodos: ["Efectivo", "Yape", "Plin", "Tarjeta"], tasas: { USD: 3.7 } },
  OT: { nombre: "Otro", moneda: "USD", monedas: ["USD"], zona: "America/Bogota", codigo: "1", metodos: ["Efectivo", "Transferencia", "Tarjeta"], tasas: {} },
};

export function asistenteInicial() {
  const sugerido = document.documentElement.dataset.estilo === "barberia" ? "barberia" : "spa";
  abrirModal({
    titulo: "¡Hola! Configuremos tu negocio",
    ancho: "ancho",
    html: `<form id="f">
      <p class="peq suave">Solo toma un minuto. Todo se puede cambiar después en Ajustes.</p>
      <fieldset class="rubros-campo">
        <legend>¿Qué tipo de negocio tienes?</legend>
        <div class="rubros">
          ${ORDEN_RUBROS.map(
            (k) => `<label class="rubro-op">
            <input type="radio" name="rubro" value="${k}" ${k === sugerido ? "checked" : ""} />
            <span class="rubro-ico" aria-hidden="true">${RUBROS[k].icono}</span>
            <span class="rubro-nombre">${esc(RUBROS[k].nombre)}</span>
          </label>`
          ).join("")}
        </div>
      </fieldset>
      <label>Nombre del negocio<input name="nombre" required id="nombre-ini" placeholder="Ej. Spa Luna" /></label>
      <div class="dos-col">
        <label>País<select name="pais">${Object.entries(PAISES).map(([k, p]) => `<option value="${k}">${p.nombre}</option>`).join("")}</select></label>
        <label>Nombre del asistente de WhatsApp<input name="asistente" id="asis-ini" value="${RUBROS[sugerido].asistente}" /></label>
      </div>
      <label class="check"><input type="checkbox" name="ejemplos" checked /> Crear servicios de ejemplo (luego ajustas precios)</label>
      <button class="btn btn-pri btn-bloque">Empezar 🚀</button>
    </form>`,
    onAbrir(cu, cerrar) {
      const f0 = cu.querySelector("#f");
      const ejemplosNombre = { spa: "Spa Luna", barberia: "Barbería El Clásico", consultorio: "Consultorio Dra. Ruiz", odontologia: "Sonrisa Dental", taxi: "Taxis Express", veterinaria: "Veterinaria Huellitas", gimnasio: "Studio Fit", lavadero: "Lavadero El Brillo" };
      const vistaPrevia = () => {
        const r = RUBROS[f0.rubro.value];
        document.documentElement.dataset.estilo = r.estilo;
        document.documentElement.style.setProperty("--pri", ESTILOS[r.estilo].color);
        const asis = cu.querySelector("#asis-ini");
        if (Object.values(RUBROS).some((x) => x.asistente === asis.value)) asis.value = r.asistente;
        cu.querySelector("#nombre-ini").placeholder = "Ej. " + (ejemplosNombre[f0.rubro.value] || "Mi negocio");
      };
      cu.querySelectorAll('input[name="rubro"]').forEach((i) => i.addEventListener("change", vistaPrevia));
      vistaPrevia();
      f0.onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(ev.target);
        const p = PAISES[d.pais];
        const r = rubroDe({ rubro: d.rubro });
        guardarConfig({
          nombre: d.nombre.trim(),
          rubro: r.id,
          tipoNegocio: r.id,
          estilo: r.estilo,
          asistente: d.asistente.trim() || r.asistente,
          colorPrimario: ESTILOS[r.estilo].color,
          mensajes: { ...r.mensajes },
          ...(r.modo === "viajes" ? { pedirCedula: false, horasMinCancelacion: 0 } : {}),
          pais: d.pais,
          monedaPrincipal: p.moneda,
          monedas: p.monedas,
          tasas: p.tasas,
          zonaHoraria: p.zona,
          codigoPais: p.codigo,
          metodosPago: p.metodos,
          creado: Date.now(),
        });
        if (ev.target.ejemplos.checked) {
          const factor = { COP: 1, USD: 1 / 4000, MXN: 1 / 220, PEN: 1 / 1100 }[p.moneda] ?? 1 / 4000;
          const b = lote();
          r.servicios.forEach(([nombre, duracion, precio, categoria, palabrasClave], i) => {
            const valor = p.moneda === "COP" || !precio ? precio : Math.max(1, Math.round(precio * factor));
            b.set("servicios", nuevoId("servicios"), { nombre, duracion, precio: valor, categoria, palabrasClave, orden: i + 1, activo: true }, false);
          });
          b.commit();
        }
        toast(r.modo === "viajes" ? "¡Listo! Tu central de taxis está creada 🚕" : "¡Listo! Tu agenda está creada 🎉", "ok", 5000);
        cerrar();
      };
    },
  });
}
