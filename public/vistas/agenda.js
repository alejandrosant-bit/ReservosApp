// ============================================================
// Agenda: calendario del día, nueva cita, detalle y estados
// ============================================================
import { E, hoy, nuevoId, guardar, actualizar, borrar, serverTimestamp, datosCliente } from "../datos.js";
import {
  fechaLarga,
  fechaCorta,
  hora12,
  sumarDias,
  inicioSemana,
  DIAS_CORTOS,
  horasDisponibles,
  profesionalesLibres,
  profesionalesPara,
  horarioDelDia,
  aMinutos,
  deMinutos,
  formatoMoneda,
  nombresParecidos,
  soloDigitos,
  normalizar,
  rellenar,
  ESTADOS_QUE_OCUPAN,
  citasEnConflicto,
  estiloDe,
  vocabularioDe,
  ejemplosDe,
} from "../core.js";
import { esc, abrirModal, confirmar, toast, datosForm, iniciales } from "../ui.js";
import { cobrarCita, deshacerCobro } from "./cobro.js";
import { tarjetaViaje, panelSolicitudes, detalleViaje, asignarConductor, formularioViaje } from "./viajes.js";

export const ESTADOS = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  completada: "Atendida y cobrada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const COLORES = ["#c2185b", "#7c3aed", "#0891b2", "#ea580c", "#16a34a", "#2563eb", "#db2777", "#ca8a04"];
export const colorProf = (p, i = 0) => p?.color || COLORES[i % COLORES.length];

let fecha = null;
let cont = null;

export function montar(c, params) {
  cont = c;
  fecha = params[0] && /^\d{4}-\d{2}-\d{2}$/.test(params[0]) ? params[0] : hoy();
  pintar();
  return {
    actualizar(que) {
      if (["citas", "servicios", "profesionales", "config", "clientes"].includes(que)) pintar();
    },
    parametros(p) {
      if (p[0] && /^\d{4}-\d{2}-\d{2}$/.test(p[0])) {
        fecha = p[0];
        pintar();
      }
    },
  };
}

function irA(f) {
  fecha = f;
  history.replaceState(null, "", `#agenda/${f}`);
  pintar();
}

function citasDelDia(f) {
  return E.citas.filter((c) => c.fecha === f).sort((a, b) => a.hora.localeCompare(b.hora));
}

let enConflicto = new Set();

function tarjetaCita(c) {
  if (c.tipo === "viaje") return tarjetaViaje(c);
  const prof = E.profesionales.find((p) => p.id === c.profesionalId);
  const color = prof ? colorProf(prof, E.profesionales.indexOf(prof)) : E.servicios.find((s) => s.id === c.servicioId)?.color || "var(--pri)";
  const fin = deMinutos(aMinutos(c.hora) + (Number(c.duracion) || 30));
  const cliente = E.clientes.find((x) => x.id === c.clienteId);
  return `<div class="cita ${c.estado}" data-cita="${c.id}" style="--color:${esc(color)}">
    <div class="h">${hora12(c.hora)}<small>${hora12(fin)}</small></div>
    <div class="crece">
      <div class="q">${esc(c.clienteNombre || "Sin nombre")}${cliente?.notas ? ' <span title="Tiene notas">📝</span>' : ""}</div>
      <div class="peq suave">${esc(c.servicioNombre)}${c.profesionalNombre ? " · " + esc(c.profesionalNombre) : ""}</div>
    </div>
    <div class="fila" style="flex-direction:column;align-items:flex-end;gap:4px">
      <span class="chip chip-${c.estado}">${ESTADOS[c.estado] || c.estado}</span>
      ${c.origen === "whatsapp" ? '<span class="chip chip-wa">WhatsApp</span>' : ""}
      ${enConflicto.has(c.id) ? '<span class="chip chip-cruce" title="Hay otra cita a la misma hora">⚠️ Cruce</span>' : ""}
    </div>
  </div>`;
}

function pintar() {
  if (!cont) return;
  const V = vocabularioDe(E.config);
  const h = hoy();
  const lunes = inicioSemana(fecha);
  const semana = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  // En la central de taxis, los pedidos sin conductor van solo en el
  // panel de arriba (no se repiten en la lista del día)
  const todasDelDia = citasDelDia(fecha);
  const citas = todasDelDia.filter((c) => !(V.viajes && c.tipo === "viaje" && c.estado === "pendiente" && !c.programado));
  enConflicto = citasEnConflicto(citas.filter((c) => c.tipo !== "viaje"), E.config, E.profesionales);
  const activas = todasDelDia.filter((c) => c.estado !== "cancelada");
  const base = E.config.monedaPrincipal;
  const cobrado = E.movimientos.filter((m) => m.fecha === fecha && m.tipo === "ingreso").reduce((s, m) => s + (Number(m.montoBase) || 0), 0);
  const porCobrar = activas.filter((c) => ["pendiente", "confirmada"].includes(c.estado)).reduce((s, c) => s + (Number(c.precio) || 0), 0);
  const horario = horarioDelDia(E.config, fecha);
  const profesActivos = E.profesionales.filter((p) => p.activo !== false);

  let cuerpo;
  if (!citas.length) {
    cuerpo = `<div class="tarjeta vacio"><span class="grande">${horario ? "🗓️" : "🌙"}</span>${horario ? `No hay ${V.citas} este día.` : "Este día el negocio está cerrado."}<br><br>
      <button class="btn btn-pri" data-nueva>+ ${V.viajes ? "Registrar pedido" : "Agendar " + V.cita}</button></div>`;
  } else if (profesActivos.length > 1) {
    // Una columna por profesional (en computador quedan lado a lado)
    const grupos = profesActivos.map((p, i) => ({ p, i, citas: citas.filter((c) => c.profesionalId === p.id) }));
    const sinAsignar = citas.filter((c) => !profesActivos.some((p) => p.id === c.profesionalId));
    cuerpo = `<div class="columnas-prof" style="--n:${grupos.length + (sinAsignar.length ? 1 : 0)}">
      ${grupos
        .map(
          (g) => `<div class="columna-prof"><h4><span class="punto" style="--color:${esc(colorProf(g.p, g.i))}"></span>${esc(g.p.nombre)} <span class="suave mini">(${g.citas.filter((c) => c.estado !== "cancelada").length})</span></h4>
          <div class="lista-citas">${g.citas.map(tarjetaCita).join("") || '<p class="peq suave">Sin citas</p>'}</div></div>`
        )
        .join("")}
      ${sinAsignar.length ? `<div class="columna-prof"><h4>Sin asignar</h4><div class="lista-citas">${sinAsignar.map(tarjetaCita).join("")}</div></div>` : ""}
    </div>`;
  } else {
    cuerpo = `<div class="lista-citas">${citas.map(tarjetaCita).join("")}</div>`;
  }

  // Horas libres para el servicio más corto (referencia rápida)
  const servicioRef = [...E.servicios].filter((s) => s.activo !== false).sort((a, b) => (a.duracion || 30) - (b.duracion || 30))[0];
  const libres = servicioRef ? horasDisponibles({ fecha, servicio: servicioRef, citas: E.citas, profesionales: E.profesionales, config: E.config }) : [];

  cont.innerHTML = `
    <div class="cab-vista">
      <div>
        <div class="titulo-fecha">${fecha === h ? "Hoy, " : fecha === sumarDias(h, 1) ? "Mañana, " : ""}${fechaLarga(fecha)}</div>
        <div class="peq suave">${horario ? `Abierto ${hora12(deMinutos(horario.desde))} – ${hora12(deMinutos(horario.hasta))}` : "Cerrado"}</div>
      </div>
      <div class="nav-fecha">
        <button class="btn btn-sec btn-chico" data-ir="${sumarDias(fecha, -7)}" title="Semana anterior">«</button>
        <button class="btn btn-sec btn-chico" data-ir="${h}">Hoy</button>
        <button class="btn btn-sec btn-chico" data-ir="${sumarDias(fecha, 7)}" title="Semana siguiente">»</button>
        <input type="date" value="${fecha}" id="fecha-sel" aria-label="Elegir fecha" />
      </div>
    </div>
    <div class="tira-dias">
      ${semana
        .map((d, i) => {
          const n = E.citas.filter((c) => c.fecha === d && c.estado !== "cancelada").length;
          return `<button data-ir="${d}" class="${d === fecha ? "sel" : ""} ${d === h ? "hoy" : ""} ${n ? "con-citas" : ""}" title="${n} citas">
            <span class="d">${DIAS_CORTOS[(i + 1) % 7]}</span><span class="n">${Number(d.slice(8))}</span><span class="p"></span></button>`;
        })
        .join("")}
    </div>
    <div class="resumen-dia">
      <div class="kpi"><div class="v">${activas.length}</div><div class="t">${V.Citas}</div></div>
      <div class="kpi"><div class="v">${activas.filter((c) => c.estado === "completada").length}</div><div class="t">Atendidas</div></div>
      <div class="kpi"><div class="v">${formatoMoneda(porCobrar, base)}</div><div class="t">Por cobrar</div></div>
      <div class="kpi"><div class="v">${formatoMoneda(cobrado, base)}</div><div class="t">Cobrado</div></div>
    </div>
    ${V.viajes ? panelSolicitudes() : ""}
    ${
      enConflicto.size
        ? `<div class="tarjeta aviso-cruce" role="alert">⚠️ <b>${enConflicto.size} citas se cruzan</b> en el mismo horario. Toca una para moverla a otra hora o asignarla a otra persona.</div>`
        : ""
    }
    ${cuerpo}
    ${
      libres.length && horario && !V.viajes
        ? `<details class="seccion"><summary class="negrita" style="cursor:pointer">🕒 Horas libres (${libres.length})</summary>
            <div class="horas-grid" style="margin-top:8px">${libres.map((x) => `<button data-hueco="${x}">${hora12(x)}</button>`).join("")}</div></details>`
        : ""
    }
    <button class="fab" data-nueva>+ ${V.viajes ? "Pedido" : V.Cita}</button>`;

  cont.querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => irA(b.dataset.ir)));
  cont.querySelector("#fecha-sel").onchange = (e) => e.target.value && irA(e.target.value);
  cont.querySelectorAll("[data-nueva]").forEach((b) => (b.onclick = () => formularioCita({ fecha })));
  cont.querySelectorAll("[data-hueco]").forEach((b) => (b.onclick = () => formularioCita({ fecha, hora: b.dataset.hueco })));
  cont.querySelectorAll("[data-cita]").forEach((el) => (el.onclick = () => detalleCita(el.dataset.cita)));
  cont.querySelectorAll("[data-asignar]").forEach(
    (b) =>
      (b.onclick = (ev) => {
        ev.stopPropagation();
        const c = E.citas.find((x) => x.id === b.dataset.asignar);
        if (c) asignarConductor(c);
      })
  );
}

// ------------------------------------------------------------
// Detalle de una cita
// ------------------------------------------------------------
export function linkWhatsapp(telefono, texto = "") {
  let d = soloDigitos(telefono);
  if (!d) return null;
  // Número local sin código de país → se usa el del negocio
  if (d.length <= 10) d = (E.config.codigoPais || "57") + d.replace(/^0/, "");
  return `https://wa.me/${d}${texto ? "?text=" + encodeURIComponent(texto) : ""}`;
}

export function detalleCita(id) {
  const c = E.citas.find((x) => x.id === id);
  if (!c) return;
  if (c.tipo === "viaje") return detalleViaje(c);
  const cliente = E.clientes.find((x) => x.id === c.clienteId);
  const base = E.config.monedaPrincipal;
  const recordatorio = rellenar(E.config.mensajes.recordatorio, {
    negocio: E.config.nombre,
    cliente: (c.clienteNombre || "").split(" ")[0],
    servicio: c.servicioNombre,
    fecha: c.fecha === hoy() ? "hoy" : fechaLarga(c.fecha),
    hora: hora12(c.hora),
  });
  const wa = linkWhatsapp(c.telefono || cliente?.telefono, recordatorio);
  const abierta = ["pendiente", "confirmada"].includes(c.estado);

  abrirModal({
    titulo: `${hora12(c.hora)} · ${c.servicioNombre}`,
    html: `
      <div class="fila" style="gap:12px">
        <div class="avatar">${esc(iniciales(c.clienteNombre))}</div>
        <div class="crece">
          <div class="negrita">${esc(c.clienteNombre)}</div>
          <div class="peq suave">${cliente?.cedula ? "C.C. " + esc(cliente.cedula) + " · " : ""}${esc(c.telefono || cliente?.telefono || "Sin teléfono")}</div>
        </div>
        <span class="chip chip-${c.estado}">${ESTADOS[c.estado]}</span>
      </div>
      <div class="tarjeta" style="margin-top:12px;box-shadow:none;border:1px solid var(--borde)">
        <div>📅 ${fechaLarga(c.fecha)}, ${hora12(c.hora)} (${c.duracion || 30} min)</div>
        <div>${estiloDe(E.config).iconoServicio} ${esc(c.servicioNombre)} — ${formatoMoneda(c.precio, base)}</div>
        ${c.profesionalNombre ? `<div>💇 ${esc(c.profesionalNombre)}</div>` : ""}
        ${c.origen === "whatsapp" ? "<div>🤖 Agendada por el bot de WhatsApp</div>" : ""}
        ${c.estado === "completada" ? `<div class="positivo">💵 Cobrado: ${formatoMoneda(c.pagadoBase, base)}</div>` : ""}
        ${c.notas ? `<div>📝 ${esc(c.notas)}</div>` : ""}
        ${cliente?.notas ? `<div class="peq" style="margin-top:6px;background:var(--alerta-suave);padding:6px 8px;border-radius:8px">⚠️ Notas del cliente: ${esc(cliente.notas)}</div>` : ""}
        ${citasEnConflicto(E.citas.filter((x) => x.fecha === c.fecha), E.config, E.profesionales).has(c.id) ? `<div class="peq" style="margin-top:6px;background:var(--error-suave);color:var(--error);padding:6px 8px;border-radius:8px">⚠️ Esta cita se cruza con otra a la misma hora. Usa “Editar / mover”.</div>` : ""}
      </div>
      <div class="fila-botones" style="justify-content:stretch">
        ${abierta ? '<button class="btn btn-ok" data-acc="cobrar">💵 Cobrar</button>' : ""}
        ${c.estado === "pendiente" ? '<button class="btn btn-suave" data-acc="confirmar">✔️ Confirmar</button>' : ""}
        ${wa ? `<a class="btn btn-sec" href="${esc(wa)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ""}
      </div>
      <div class="fila-botones" style="justify-content:stretch">
        ${abierta ? '<button class="btn btn-sec" data-acc="editar">✏️ Editar / mover</button>' : ""}
        ${abierta ? '<button class="btn btn-sec" data-acc="no_asistio">🚫 No asistió</button>' : ""}
        ${abierta ? '<button class="btn btn-sec" data-acc="cancelar">❌ Cancelar</button>' : ""}
        ${c.estado === "completada" ? '<button class="btn btn-sec" data-acc="deshacer">↩️ Deshacer cobro</button>' : ""}
        ${["cancelada", "no_asistio"].includes(c.estado) ? '<button class="btn btn-sec" data-acc="reabrir">↩️ Reactivar</button>' : ""}
        ${cliente ? '<button class="btn btn-sec" data-acc="cliente">👤 Ver cliente</button>' : ""}
        <button class="btn btn-sec" data-acc="eliminar">🗑️ Eliminar</button>
      </div>`,
    onAbrir(cu, cerrar) {
      cu.querySelectorAll("[data-acc]").forEach(
        (b) =>
          (b.onclick = async () => {
            const acc = b.dataset.acc;
            if (acc === "cobrar") {
              cerrar();
              cobrarCita(c);
            } else if (acc === "confirmar") {
              actualizar("citas", c.id, { estado: "confirmada" });
              cerrar();
            } else if (acc === "editar") {
              cerrar();
              formularioCita({ cita: c });
            } else if (acc === "no_asistio") {
              actualizar("citas", c.id, { estado: "no_asistio" });
              if (c.clienteId) guardar("clientes", c.clienteId, { inasistencias: (cliente?.inasistencias || 0) + 1 });
              cerrar();
            } else if (acc === "cancelar") {
              if (await confirmar("¿Cancelar esta cita? El horario quedará libre.", { si: "Sí, cancelar", peligro: true })) {
                actualizar("citas", c.id, { estado: "cancelada", canceladaPor: "negocio", canceladaEn: serverTimestamp() });
                cerrar();
              }
            } else if (acc === "deshacer") {
              if (await confirmar("¿Deshacer el cobro? Se borrarán los pagos registrados en caja para esta cita.", { peligro: true })) {
                deshacerCobro(c);
                cerrar();
              }
            } else if (acc === "reabrir") {
              actualizar("citas", c.id, { estado: "confirmada" });
              cerrar();
            } else if (acc === "cliente") {
              cerrar();
              location.hash = `clientes/${c.clienteId}`;
            } else if (acc === "eliminar") {
              if (await confirmar("¿Eliminar la cita definitivamente? (Si solo no vino, mejor márcala como “No asistió”.)", { si: "Eliminar", peligro: true })) {
                if (c.estado === "completada") deshacerCobro(c);
                borrar("citas", c.id);
                cerrar();
              }
            }
          })
      );
    },
  });
}

// ------------------------------------------------------------
// Formulario: nueva cita / editar cita
// ------------------------------------------------------------
export function formularioCita({ cita = null, fecha: f = hoy(), hora = "", clienteId = "" } = {}) {
  const V = vocabularioDe(E.config);
  if (V.viajes && !cita) return formularioViaje();
  if (!E.servicios.filter((s) => s.activo !== false).length) {
    toast("Primero crea tus servicios en Ajustes → Servicios", "error", 5000);
    location.hash = "ajustes/servicios";
    return;
  }
  const editando = !!cita;
  const sel = {
    clienteId: cita?.clienteId || clienteId || "",
    servicioId: cita?.servicioId || "",
    profesionalId: cita?.profesionalId || "",
    fecha: cita?.fecha || f,
    hora: cita?.hora || hora,
  };
  const cli = E.clientes.find((c) => c.id === sel.clienteId);

  abrirModal({
    titulo: editando ? `Editar ${V.cita}` : V.nuevaCita,
    html: `
      <form id="f-cita">
        <label>Cliente
          <div class="buscador"><input id="buscar-cli" placeholder="Nombre, cédula o teléfono" autocomplete="off" value="${esc(cli?.nombre || cita?.clienteNombre || "")}" /></div>
        </label>
        <div id="sug" class="sugerencias oculto"></div>
        <div id="nuevo-cli" class="oculto tarjeta" style="box-shadow:none;border:1px dashed var(--borde)">
          <div class="negrita peq">Cliente nuevo</div>
          <div class="dos-col" style="margin-top:6px">
            <label>Cédula<input name="cedula" inputmode="numeric" autocomplete="off" /></label>
            <label>WhatsApp / teléfono<input name="telefono" inputmode="tel" autocomplete="off" /></label>
          </div>
        </div>
        <label>Servicio
          <select name="servicioId" required>
            <option value="">Elige un servicio</option>
            ${E.servicios
              .filter((s) => s.activo !== false || s.id === sel.servicioId)
              .map((s) => `<option value="${s.id}" ${s.id === sel.servicioId ? "selected" : ""}>${esc(s.nombre)} · ${s.duracion || 30} min · ${formatoMoneda(s.precio, E.config.monedaPrincipal)}</option>`)
              .join("")}
          </select>
        </label>
        ${
          E.profesionales.filter((p) => p.activo !== false).length
            ? `<label>Profesional<select name="profesionalId"><option value="">Cualquiera disponible</option></select></label>`
            : ""
        }
        <label>Fecha<input type="date" name="fecha" value="${sel.fecha}" required /></label>
        <div>
          <div class="fila entre"><span class="negrita peq">Hora</span><button type="button" class="btn-link peq" id="hora-manual-btn">Otra hora (sobrecupo)</button></div>
          <div class="horas-grid" id="horas" style="margin-top:6px"></div>
          <input type="time" id="hora-manual" class="oculto" style="margin-top:6px" step="300" />
        </div>
        <label>Notas de ${V.la} ${V.cita}<textarea name="notas" placeholder="Ej. ${esc(ejemplosDe(E.config).notaCita)}">${esc(cita?.notas || "")}</textarea></label>
        <p class="error" id="err"></p>
        <button class="btn btn-pri btn-bloque" type="submit">${editando ? "Guardar cambios" : "Agendar " + V.cita}</button>
      </form>`,
    onAbrir(cu, cerrar) {
      const form = cu.querySelector("#f-cita");
      const buscar = cu.querySelector("#buscar-cli");
      const sug = cu.querySelector("#sug");
      const nuevo = cu.querySelector("#nuevo-cli");
      const horasEl = cu.querySelector("#horas");
      const manual = cu.querySelector("#hora-manual");

      // --- Cliente: autocompletar ---
      const pintarSugerencias = () => {
        const q = buscar.value.trim();
        sel.clienteId = "";
        if (q.length < 2) {
          sug.classList.add("oculto");
          nuevo.classList.add("oculto");
          return;
        }
        const qn = normalizar(q);
        const qd = soloDigitos(q);
        const encontrados = E.clientes
          .filter((c) => (qd.length >= 3 && (soloDigitos(c.cedula).includes(qd) || soloDigitos(c.telefono).includes(qd))) || normalizar(c.nombre).includes(qn) || nombresParecidos(c.nombre, q))
          .slice(0, 8);
        sug.innerHTML =
          encontrados
            .map((c) => `<button type="button" data-id="${c.id}"><b>${esc(c.nombre)}</b> <span class="peq suave">${c.cedula ? "C.C. " + esc(c.cedula) : ""} ${esc(c.telefono || "")}</span></button>`)
            .join("") + (qd.length >= 5 && !/[a-z]/i.test(q) ? "" : `<button type="button" data-nuevo>➕ Crear cliente “${esc(q)}”</button>`);
        sug.classList.remove("oculto");
        nuevo.classList.add("oculto");
        sug.querySelectorAll("[data-id]").forEach(
          (b) =>
            (b.onclick = () => {
              const c = E.clientes.find((x) => x.id === b.dataset.id);
              sel.clienteId = c.id;
              buscar.value = c.nombre;
              sug.classList.add("oculto");
            })
        );
        sug.querySelector("[data-nuevo]")?.addEventListener("click", () => {
          sug.classList.add("oculto");
          nuevo.classList.remove("oculto");
          sel.clienteId = "__nuevo";
          form.cedula.focus();
        });
      };
      buscar.addEventListener("input", pintarSugerencias);

      // --- Profesionales según servicio ---
      const pintarProfes = () => {
        const s = form.servicioId.value;
        const select = form.profesionalId;
        if (!select) return;
        const lista = profesionalesPara(s, E.profesionales);
        select.innerHTML = `<option value="">Cualquiera disponible</option>` + lista.map((p) => `<option value="${p.id}" ${p.id === sel.profesionalId ? "selected" : ""}>${esc(p.nombre)}</option>`).join("");
      };

      // --- Horas disponibles ---
      const pintarHoras = () => {
        const servicio = E.servicios.find((s) => s.id === form.servicioId.value);
        const fechaSel = form.fecha.value;
        if (!servicio || !fechaSel) {
          horasEl.innerHTML = '<p class="peq suave">Elige servicio y fecha para ver las horas libres.</p>';
          return;
        }
        const citasSin = E.citas.filter((c) => c.id !== cita?.id);
        const prof = form.profesionalId?.value;
        let horas = horasDisponibles({
          fecha: fechaSel,
          servicio,
          citas: citasSin,
          profesionales: prof ? E.profesionales.filter((p) => p.id === prof) : E.profesionales,
          config: { ...E.config, anticipacionMinutos: 0 },
        });
        if (sel.hora && fechaSel === sel.fecha && !horas.includes(sel.hora) && editando) horas = [...horas, sel.hora].sort();
        horasEl.innerHTML = horas.length
          ? horas.map((h) => `<button type="button" data-h="${h}" class="${h === sel.hora ? "sel" : ""}">${hora12(h)}</button>`).join("")
          : `<p class="peq suave" style="grid-column:1/-1">${horarioDelDia(E.config, fechaSel) ? "No quedan horas libres este día." : "Ese día el negocio está cerrado."} Puedes usar “Otra hora”.</p>`;
        horasEl.querySelectorAll("[data-h]").forEach(
          (b) =>
            (b.onclick = () => {
              sel.hora = b.dataset.h;
              manual.classList.add("oculto");
              manual.value = "";
              horasEl.querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
            })
        );
      };

      cu.querySelector("#hora-manual-btn").onclick = () => {
        manual.classList.toggle("oculto");
        if (!manual.classList.contains("oculto")) manual.focus();
      };
      manual.addEventListener("input", () => {
        sel.hora = manual.value;
        horasEl.querySelectorAll("button").forEach((x) => x.classList.remove("sel"));
      });
      form.servicioId.addEventListener("change", () => {
        pintarProfes();
        pintarHoras();
      });
      form.profesionalId?.addEventListener("change", () => {
        sel.profesionalId = form.profesionalId.value;
        pintarHoras();
      });
      form.fecha.addEventListener("change", () => {
        if (form.fecha.value !== sel.fecha) sel.hora = "";
        sel.fecha = form.fecha.value;
        pintarHoras();
      });
      pintarProfes();
      pintarHoras();

      // --- Guardar ---
      form.onsubmit = (ev) => {
        ev.preventDefault();
        const err = cu.querySelector("#err");
        const d = datosForm(form);
        const servicio = E.servicios.find((s) => s.id === d.servicioId);
        if (!buscar.value.trim()) return (err.textContent = "Escribe el nombre del cliente.");
        if (!servicio) return (err.textContent = "Elige el servicio.");
        if (!sel.hora) return (err.textContent = "Elige la hora.");

        // Cliente: existente, nuevo, o solo nombre escrito
        let clienteId = sel.clienteId;
        let cliente = E.clientes.find((c) => c.id === clienteId);
        if (!cliente) {
          const nombre = buscar.value.trim().replace(/\s+/g, " ");
          const ced = soloDigitos(d.cedula);
          const existente = ced ? E.clientes.find((c) => soloDigitos(c.cedula) === ced) : E.clientes.find((c) => normalizar(c.nombre) === normalizar(nombre));
          if (existente) cliente = existente;
          else {
            clienteId = nuevoId("clientes");
            cliente = datosCliente({ nombre, cedula: d.cedula || "", telefono: d.telefono || "", origen: "app", visitas: 0, totalGastado: 0, creado: serverTimestamp(), creadoMs: Date.now() });
            guardar("clientes", clienteId, cliente, false);
            cliente = { id: clienteId, ...cliente };
          }
          clienteId = cliente.id;
        }

        // Profesional: el elegido o el primero libre
        let profesionalId = d.profesionalId || "";
        if (E.profesionales.filter((p) => p.activo !== false).length) {
          const libres = profesionalesLibres({
            fecha: form.fecha.value,
            inicio: aMinutos(sel.hora),
            duracion: Number(servicio.duracion) || 30,
            servicioId: servicio.id,
            citas: E.citas,
            profesionales: E.profesionales,
            config: E.config,
            ignorarCitaId: cita?.id,
          });
          if (!profesionalId) profesionalId = libres[0]?.id || profesionalesPara(servicio.id, E.profesionales)[0]?.id || "";
        }
        const prof = E.profesionales.find((p) => p.id === profesionalId);

        const data = {
          clienteId,
          clienteNombre: cliente.nombre,
          telefono: cliente.telefono || "",
          servicioId: servicio.id,
          servicioNombre: servicio.nombre,
          profesionalId,
          profesionalNombre: prof?.nombre || "",
          fecha: form.fecha.value,
          hora: sel.hora,
          duracion: Number(servicio.duracion) || 30,
          precio: Number(servicio.precio) || 0,
          notas: d.notas || "",
        };

        // Aviso si se cruza con otra cita (sobrecupo)
        const choca = E.citas.some(
          (c) =>
            c.id !== cita?.id &&
            c.fecha === data.fecha &&
            ESTADOS_QUE_OCUPAN.includes(c.estado) &&
            (!profesionalId || c.profesionalId === profesionalId) &&
            aMinutos(data.hora) < aMinutos(c.hora) + (c.duracion || 30) &&
            aMinutos(c.hora) < aMinutos(data.hora) + data.duracion
        );

        if (editando) {
          const cambioHora = cita.fecha !== data.fecha || cita.hora !== data.hora;
          guardar("citas", cita.id, { ...data, ...(cambioHora ? { recordatorioEnviado: false } : {}) });
        } else {
          guardar("citas", nuevoId("citas"), { ...data, estado: "confirmada", origen: "app", recordatorioEnviado: false, creado: serverTimestamp() }, false);
        }
        toast(choca ? `${V.Cita} guardada (⚠️ se cruza con otra)` : editando ? "Cambios guardados ✅" : `${V.Cita} ${V.agendada} ✅`);
        cerrar();
        if (cont?.isConnected) irA(data.fecha);
      };
    },
  });
}

export { fechaCorta };
