// ============================================================
// Clientes: base de datos, visitas por mes, historial y notas
// ============================================================
import { E, hoy, guardar, borrar, nuevoId, citasDeCliente, serverTimestamp, datosCliente } from "../datos.js";
import { vocabularioDe, formatoMoneda, fechaCorta, hora12, normalizar, soloDigitos, MESES, sumarDias, inicioMes } from "../core.js";
import { esc, abrirModal, confirmar, toast, datosForm, iniciales, descargar, aCSV } from "../ui.js";
import { formularioCita, linkWhatsapp, ESTADOS } from "./agenda.js";

let cont = null;
let busqueda = "";
let orden = "nombre";

export function montar(c, params) {
  cont = c;
  pintarBase();
  if (params[0]) setTimeout(() => fichaCliente(params[0]), 0);
  return {
    actualizar(que) {
      if (que === "clientes" || que === "citas") pintarLista();
    },
    parametros(p) {
      if (p[0]) fichaCliente(p[0]);
    },
  };
}

function visitasDelMes(clienteId, mes = hoy().slice(0, 7)) {
  return E.citas.filter((c) => c.clienteId === clienteId && c.estado === "completada" && c.fecha.startsWith(mes)).length;
}

function pintarBase() {
  const V = vocabularioDe(E.config);
  cont.innerHTML = `
    <div class="cab-vista">
      <h2>${V.Clientes} <span class="suave peq" id="cuenta"></span></h2>
      <div class="fila">
        <button class="btn btn-sec btn-chico" id="exportar">⬇️ Excel</button>
      </div>
    </div>
    <div class="fila-wrap" style="margin-bottom:10px">
      <div class="buscador crece" style="min-width:220px"><input id="buscar" placeholder="Buscar por nombre, cédula o teléfono" value="${esc(busqueda)}" autocomplete="off" /></div>
      <select id="orden" style="width:auto">
        <option value="nombre">A – Z</option>
        <option value="mes">Más visitas este mes</option>
        <option value="visitas">Más visitas en total</option>
        <option value="gastado">Mayor gasto</option>
        <option value="reciente">Visita más reciente</option>
        <option value="ausentes">No vienen hace +60 días</option>
        <option value="cumple">Cumplen años este mes</option>
      </select>
    </div>
    <div class="tarjeta" style="padding:4px 12px"><div class="lista" id="lista"></div></div>
    <button class="fab" id="nuevo">+ ${V.Cliente}</button>`;
  cont.querySelector("#orden").value = orden;
  cont.querySelector("#buscar").addEventListener("input", (e) => {
    busqueda = e.target.value;
    pintarLista();
  });
  cont.querySelector("#orden").onchange = (e) => {
    orden = e.target.value;
    pintarLista();
  };
  cont.querySelector("#nuevo").onclick = () => formularioCliente();
  cont.querySelector("#exportar").onclick = exportar;
  pintarLista();
}

function filtrados() {
  const q = normalizar(busqueda);
  const qd = soloDigitos(busqueda);
  const mesActual = hoy().slice(5, 7);
  let lista = E.clientes.filter((c) => !q || normalizar(c.nombre).includes(q) || (qd.length >= 3 && (soloDigitos(c.cedula).includes(qd) || soloDigitos(c.telefono).includes(qd))));
  const conMes = lista.map((c) => ({ ...c, mes: visitasDelMes(c.id) }));
  const ordenes = {
    nombre: (a, b) => String(a.nombre).localeCompare(String(b.nombre)),
    mes: (a, b) => b.mes - a.mes,
    visitas: (a, b) => (b.visitas || 0) - (a.visitas || 0),
    gastado: (a, b) => (b.totalGastado || 0) - (a.totalGastado || 0),
    reciente: (a, b) => String(b.ultimaVisita || "").localeCompare(String(a.ultimaVisita || "")),
  };
  if (orden === "ausentes") {
    const limite = sumarDias(hoy(), -60);
    return conMes.filter((c) => c.ultimaVisita && c.ultimaVisita < limite).sort(ordenes.reciente);
  }
  if (orden === "cumple") return conMes.filter((c) => c.cumple && c.cumple.slice(5, 7) === mesActual).sort((a, b) => a.cumple.slice(8).localeCompare(b.cumple.slice(8)));
  return conMes.sort(ordenes[orden] || ordenes.nombre);
}

function pintarLista() {
  const V = vocabularioDe(E.config);
  if (!cont?.querySelector("#lista")) return;
  const lista = filtrados();
  cont.querySelector("#cuenta").textContent = `(${E.clientes.length})`;
  const base = E.config.monedaPrincipal;
  const mesHoy = hoy().slice(5, 7);
  cont.querySelector("#lista").innerHTML =
    lista
      .slice(0, 300)
      .map(
        (c) => `<div class="item" data-id="${c.id}">
        <div class="avatar">${esc(iniciales(c.nombre))}</div>
        <div class="crece">
          <div class="negrita">${esc(c.nombre)} ${c.cumple && c.cumple.slice(5, 7) === mesHoy ? "🎂" : ""} ${(c.inasistencias || 0) >= 2 ? '<span class="chip chip-no_asistio">' + c.inasistencias + " faltas</span>" : ""}</div>
          <div class="peq suave">${c.cedula ? "C.C. " + esc(c.cedula) + " · " : ""}${esc(c.telefono || "")}</div>
        </div>
        <div class="derecha">
          <div class="negrita">${c.mes} <span class="peq suave">este mes</span></div>
          <div class="mini suave">${c.visitas || 0} visitas · ${formatoMoneda(c.totalGastado || 0, base)}</div>
        </div>
      </div>`
      )
      .join("") || `<p class="vacio"><span class="grande">👥</span>${busqueda ? "No se encontró a nadie con esa búsqueda." : `Aún no tienes ${V.clientes}. Se crean solos al agendar (también desde WhatsApp) o con el botón “+ ${V.Cliente}”.`}</p>`;
  cont.querySelectorAll("[data-id]").forEach((el) => (el.onclick = () => fichaCliente(el.dataset.id)));
}

// ------------------------------------------------------------
// Ficha del cliente
// ------------------------------------------------------------
export async function fichaCliente(id) {
  const c = E.clientes.find((x) => x.id === id);
  if (!c) return;
  const base = E.config.monedaPrincipal;
  const { cuerpo, cerrar } = abrirModal({
    titulo: c.nombre,
    ancho: "ancho",
    html: `
      <div class="fila-wrap">
        ${c.cedula ? `<span class="chip">C.C. ${esc(c.cedula)}</span>` : ""}
        ${c.telefono ? `<span class="chip">📱 ${esc(c.telefono)}</span>` : ""}
        ${c.email ? `<span class="chip">✉️ ${esc(c.email)}</span>` : ""}
        ${c.cumple ? `<span class="chip">🎂 ${Number(c.cumple.slice(8))} de ${MESES[Number(c.cumple.slice(5, 7)) - 1]}</span>` : ""}
        ${c.origen === "whatsapp" ? '<span class="chip chip-wa">Llegó por WhatsApp</span>' : ""}
      </div>
      ${c.notas ? `<div class="tarjeta" style="margin-top:10px;background:var(--alerta-suave);box-shadow:none">📝 ${esc(c.notas)}</div>` : ""}
      <div class="kpis" style="margin-top:12px">
        <div class="kpi"><div class="v">${visitasDelMes(c.id)}</div><div class="t">Visitas este mes</div></div>
        <div class="kpi"><div class="v">${c.visitas || 0}</div><div class="t">Visitas totales</div></div>
        <div class="kpi"><div class="v">${formatoMoneda(c.totalGastado || 0, base)}</div><div class="t">Total gastado</div></div>
        <div class="kpi"><div class="v">${c.inasistencias || 0}</div><div class="t">No asistió</div></div>
      </div>
      <div class="fila-botones">
        <button class="btn btn-pri" data-acc="cita">📅 Agendar</button>
        ${c.telefono ? `<a class="btn btn-sec" target="_blank" rel="noopener" href="${esc(linkWhatsapp(c.telefono, `Hola ${c.nombre.split(" ")[0]}, te escribimos de ${E.config.nombre} 😊`))}">💬 WhatsApp</a>` : ""}
        <button class="btn btn-sec" data-acc="editar">✏️ Editar</button>
        <button class="btn btn-sec" data-acc="eliminar">🗑️</button>
      </div>
      <div class="seccion"><h3>Visitas por mes</h3><div id="por-mes" class="peq suave">Cargando…</div></div>
      <div class="seccion"><h3>Historial de citas</h3><div id="historial" class="peq suave">Cargando…</div></div>`,
    onAbrir(cu, cerrar) {
      cu.querySelector('[data-acc="cita"]').onclick = () => {
        cerrar();
        formularioCita({ clienteId: c.id });
      };
      cu.querySelector('[data-acc="editar"]').onclick = () => {
        cerrar();
        formularioCliente(c);
      };
      cu.querySelector('[data-acc="eliminar"]').onclick = async () => {
        if (await confirmar(`¿Eliminar a ${c.nombre}? Sus citas y pagos se conservan en los reportes.`, { si: "Eliminar", peligro: true })) {
          borrar("clientes", c.id);
          cerrar();
        }
      };
    },
  });

  let citas = [];
  try {
    citas = await citasDeCliente(c.id);
  } catch (e) {
    citas = E.citas.filter((x) => x.clienteId === c.id);
  }
  // Visitas atendidas de los últimos 6 meses
  const meses = [];
  let m = inicioMes(hoy());
  for (let i = 0; i < 6; i++) {
    meses.unshift(m);
    m = inicioMes(sumarDias(m, -1));
  }
  const maxV = Math.max(1, ...meses.map((mm) => citas.filter((x) => x.estado === "completada" && x.fecha.startsWith(mm.slice(0, 7))).length));
  const porMes = cuerpo.querySelector("#por-mes");
  if (porMes)
    porMes.innerHTML = `<div class="barras" style="height:90px">${meses
      .map((mm) => {
        const n = citas.filter((x) => x.estado === "completada" && x.fecha.startsWith(mm.slice(0, 7))).length;
        return `<div class="b" style="height:${(n / maxV) * 100}%" data-t="${n} visitas"></div>`;
      })
      .join("")}</div><div class="barras-eje">${meses.map((mm) => `<span>${MESES[Number(mm.slice(5, 7)) - 1].slice(0, 3)}</span>`).join("")}</div>`;
  const hist = cuerpo.querySelector("#historial");
  if (hist)
    hist.innerHTML = citas.length
      ? `<div class="tabla-cont"><table><thead><tr><th>Fecha</th><th>Servicio</th><th>Estado</th><th class="num">Valor</th></tr></thead><tbody>
        ${citas
          .slice(0, 100)
          .map(
            (x) =>
              `<tr><td>${fechaCorta(x.fecha)} ${x.fecha.slice(0, 4)} · ${hora12(x.hora)}</td><td>${esc(x.servicioNombre)}${x.profesionalNombre ? `<div class="mini suave">${esc(x.profesionalNombre)}</div>` : ""}</td><td><span class="chip chip-${x.estado}">${ESTADOS[x.estado] || x.estado}</span></td><td class="num">${formatoMoneda(x.estado === "completada" ? x.pagadoBase : x.precio, base)}</td></tr>`
          )
          .join("")}</tbody></table></div>`
      : "Sin citas todavía.";
}

// ------------------------------------------------------------
// Crear / editar cliente
// ------------------------------------------------------------
export function formularioCliente(c = null) {
  const V = vocabularioDe(E.config);
  abrirModal({
    titulo: c ? `Editar ${V.cliente}` : `Nuevo ${V.cliente}`,
    html: `<form id="f-cli">
      <label>Nombre y apellido<input name="nombre" required value="${esc(c?.nombre || "")}" autocomplete="off" /></label>
      <div class="dos-col">
        <label>Cédula / documento<input name="cedula" inputmode="numeric" value="${esc(c?.cedula || "")}" autocomplete="off" /></label>
        <label>WhatsApp / teléfono<input name="telefono" inputmode="tel" value="${esc(c?.telefono || "")}" placeholder="3001234567" autocomplete="off" /></label>
      </div>
      <div class="dos-col">
        <label>Correo<input name="email" type="email" value="${esc(c?.email || "")}" /></label>
        <label>Cumpleaños<input name="cumple" type="date" value="${esc(c?.cumple || "")}" /></label>
      </div>
      <label>Notas (alergias, preferencias, fórmula de color…)<textarea name="notas">${esc(c?.notas || "")}</textarea></label>
      <p class="error" id="err"></p>
      <button class="btn btn-pri btn-bloque">Guardar</button>
    </form>`,
    onAbrir(cu, cerrar) {
      cu.querySelector("#f-cli").onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(ev.target);
        d.nombre = d.nombre.trim().replace(/\s+/g, " ");
        const ced = soloDigitos(d.cedula);
        const dup = ced && E.clientes.find((x) => soloDigitos(x.cedula) === ced && x.id !== c?.id);
        if (dup) return (cu.querySelector("#err").textContent = `Ya existe un cliente con esa cédula: ${dup.nombre}`);
        const id = c?.id || nuevoId("clientes");
        guardar("clientes", id, datosCliente({ ...d, ...(c ? {} : { visitas: 0, totalGastado: 0, origen: "app", creado: serverTimestamp(), creadoMs: Date.now() }) }));
        toast("Cliente guardado ✅");
        cerrar();
      };
    },
  });
}

function exportar() {
  const base = E.config.monedaPrincipal;
  const filas = [["Nombre", "Cédula", "Teléfono", "Correo", "Cumpleaños", "Visitas este mes", "Visitas totales", `Total gastado (${base})`, "Última visita", "No asistió", "Notas"]];
  filtrados().forEach((c) => filas.push([c.nombre, c.cedula, c.telefono, c.email, c.cumple, c.mes, c.visitas || 0, Math.round(c.totalGastado || 0), c.ultimaVisita, c.inasistencias || 0, c.notas]));
  descargar(`clientes-${hoy()}.csv`, aCSV(filas));
}

export { nuevoId };
