// ============================================================
// Reportes y arqueo semanal / mensual
// ============================================================
import { E, hoy, rango, listarColeccion, where } from "../datos.js";
import { formatoMoneda, sumarDias, inicioSemana, inicioMes, finMes, fechaCorta, diferenciaDias, MESES, normalizar } from "../core.js";
import { esc, descargar, aCSV } from "../ui.js";

let cont = null;
let periodo = "semana";
let desdeP = null;
let hastaP = null;
let ultimo = null;

const PERIODOS = {
  hoy: "Hoy",
  semana: "Esta semana",
  semanaPasada: "Semana pasada",
  mes: "Este mes",
  mesPasado: "Mes pasado",
  personalizado: "Personalizado",
};

function calcularRango() {
  const h = hoy();
  switch (periodo) {
    case "hoy":
      return [h, h];
    case "semana":
      return [inicioSemana(h), sumarDias(inicioSemana(h), 6)];
    case "semanaPasada":
      return [sumarDias(inicioSemana(h), -7), sumarDias(inicioSemana(h), -1)];
    case "mes":
      return [inicioMes(h), finMes(h)];
    case "mesPasado": {
      const m = inicioMes(sumarDias(inicioMes(h), -1));
      return [m, finMes(m)];
    }
    default:
      return [desdeP || inicioMes(h), hastaP || h];
  }
}

export function montar(c) {
  cont = c;
  pintar();
  return {
    actualizar(que) {
      if (["citas", "movimientos", "cajas", "config"].includes(que) && !cont.querySelector("input:focus")) pintar();
    },
  };
}

async function pintar() {
  const [desde, hasta] = calcularRango();
  const base = E.config.monedaPrincipal;
  cont.innerHTML = `
    <div class="cab-vista no-imprimir"><h2>Reportes</h2>
      <div class="fila"><button class="btn btn-sec btn-chico" id="csv">⬇️ Excel</button><button class="btn btn-sec btn-chico" onclick="window.print()">🖨️ Imprimir</button></div></div>
    <div class="pestanas no-imprimir">${Object.entries(PERIODOS)
      .map(([k, v]) => `<button data-p="${k}" class="${k === periodo ? "sel" : ""}">${v}</button>`)
      .join("")}</div>
    ${
      periodo === "personalizado"
        ? `<div class="dos-col no-imprimir" style="margin-bottom:12px"><label>Desde<input type="date" id="desde" value="${desde}" /></label><label>Hasta<input type="date" id="hasta" value="${hasta}" /></label></div>`
        : ""
    }
    <h3 style="margin-bottom:10px">${esc(E.config.nombre)} · ${fechaCorta(desde)} ${desde.slice(0, 4)} – ${fechaCorta(hasta)} ${hasta.slice(0, 4)}</h3>
    <div id="rep"><div class="pantalla-centro" style="min-height:30vh"><div class="spinner"></div></div></div>`;
  cont.querySelectorAll("[data-p]").forEach(
    (b) =>
      (b.onclick = () => {
        periodo = b.dataset.p;
        pintar();
      })
  );
  cont.querySelector("#desde")?.addEventListener("change", (e) => {
    desdeP = e.target.value;
    pintar();
  });
  cont.querySelector("#hasta")?.addEventListener("change", (e) => {
    hastaP = e.target.value;
    pintar();
  });
  cont.querySelector("#csv").onclick = exportar;

  let citas, movs, cajas;
  try {
    [citas, movs] = await Promise.all([rango("citas", desde, hasta), rango("movimientos", desde, hasta)]);
    cajas = desde >= E.desdeCargado ? E.cajas.filter((c) => c.fecha >= desde && c.fecha <= hasta) : await listarColeccion("cajas", where("fecha", ">=", desde), where("fecha", "<=", hasta));
  } catch (e) {
    cont.querySelector("#rep").innerHTML = `<p class="vacio">No se pudieron cargar los datos de ese periodo sin internet.</p>`;
    return;
  }
  const r = calcular({ citas, movs, cajas, desde, hasta });
  ultimo = { ...r, desde, hasta };
  const rep = cont.querySelector("#rep");
  if (!rep) return;

  const tabla = (titulo, cabeceras, filas, pie) =>
    `<div class="seccion tarjeta"><h3>${titulo}</h3>${
      filas.length
        ? `<div class="tabla-cont"><table><thead><tr>${cabeceras.map((h, i) => `<th class="${i ? "num" : ""}">${h}</th>`).join("")}</tr></thead>
      <tbody>${filas.map((f) => `<tr>${f.map((x, i) => `<td class="${i ? "num" : ""}">${x}</td>`).join("")}</tr>`).join("")}</tbody>
      ${pie ? `<tfoot><tr>${pie.map((x, i) => `<td class="${i ? "num" : ""}">${x}</td>`).join("")}</tr></tfoot>` : ""}</table></div>`
        : '<p class="peq suave">Sin datos en este periodo.</p>'
    }</div>`;

  const f = (n) => formatoMoneda(n, base);
  const maxDia = Math.max(1, ...r.porDia.map((d) => d.ingresos));

  rep.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="v positivo">${f(r.ingresos)}</div><div class="t">Ingresos</div></div>
      <div class="kpi"><div class="v negativo">${f(r.egresos)}</div><div class="t">Gastos</div></div>
      <div class="kpi"><div class="v ${r.ingresos - r.egresos >= 0 ? "positivo" : "negativo"}">${f(r.ingresos - r.egresos)}</div><div class="t">Utilidad</div></div>
      <div class="kpi"><div class="v">${f(r.ticket)}</div><div class="t">Ticket promedio</div></div>
      <div class="kpi"><div class="v">${r.atendidas}</div><div class="t">Citas atendidas</div></div>
      <div class="kpi"><div class="v">${r.noAsistio}</div><div class="t">No asistieron</div></div>
      <div class="kpi"><div class="v">${r.canceladas}</div><div class="t">Canceladas</div></div>
      <div class="kpi"><div class="v">${r.porWhatsapp}</div><div class="t">Agendadas por WhatsApp</div></div>
      <div class="kpi"><div class="v">${r.clientesUnicos}</div><div class="t">Clientes atendidos</div></div>
      <div class="kpi"><div class="v">${r.clientesNuevos}</div><div class="t">Clientes nuevos</div></div>
      <div class="kpi"><div class="v">${f(r.propinas)}</div><div class="t">Propinas</div></div>
      <div class="kpi"><div class="v">${r.tasaInasistencia}%</div><div class="t">Inasistencia</div></div>
    </div>

    ${
      r.porDia.length > 1
        ? `<div class="seccion tarjeta"><h3>Ingresos por día</h3>
      <div class="barras">${r.porDia.map((d) => `<div class="b" style="height:${(d.ingresos / maxDia) * 100}%" data-t="${fechaCorta(d.fecha)}: ${f(d.ingresos)}"></div>`).join("")}</div>
      <div class="barras-eje">${r.porDia.map((d, i) => `<span>${r.porDia.length <= 10 || i % Math.ceil(r.porDia.length / 10) === 0 ? Number(d.fecha.slice(8)) : ""}</span>`).join("")}</div></div>`
        : ""
    }

    ${tabla(
      "💵 Arqueo del periodo (por moneda)",
      ["Moneda", "Entró efectivo", "Salió efectivo", "Otros medios (neto)", "Diferencias de cierres"],
      Object.entries(r.porMoneda).map(([m, p]) => [
        `<b>${m}</b>`,
        `<span class="positivo">${formatoMoneda(p.ingEf, m)}</span>`,
        `<span class="negativo">${formatoMoneda(p.egrEf, m)}</span>`,
        formatoMoneda(p.otros, m),
        `<span class="${p.dif < 0 ? "negativo" : p.dif > 0 ? "positivo" : ""}">${formatoMoneda(p.dif, m)}</span>`,
      ])
    )}

    ${tabla(
      "🗃️ Cierres de caja",
      ["Fecha", "Ingresos", "Gastos", "Arqueo"],
      r.cierres.map((c) => [
        `${fechaCorta(c.fecha)}${c.estado === "abierta" ? ' <span class="chip chip-confirmada">abierta</span>' : ""}`,
        f(c.ingresosBase || 0),
        f(c.egresosBase || 0),
        c.estado === "abierta"
          ? "—"
          : Object.entries(c.diferencia || {}).filter(([, v]) => Math.abs(v) > 0.009).map(([m, v]) => `<span class="${v < 0 ? "negativo" : "positivo"}">${formatoMoneda(v, m)}</span>`).join(" ") || '<span class="positivo">✔ Cuadró</span>',
      ])
    )}

    ${tabla("💳 Ingresos por método de pago", ["Método", "Monto", `Equivale (${base})`], r.porMetodo.map((x) => [esc(x.metodo) + ` <span class="mini suave">${x.moneda}</span>`, formatoMoneda(x.monto, x.moneda), f(x.base)]))}

    ${tabla(
      "💆 Servicios más vendidos",
      ["Servicio", "Cantidad", "Ingresos"],
      r.porServicio.map((x) => [esc(x.nombre), x.cantidad, f(x.ingresos)]),
      ["Total", r.porServicio.reduce((s, x) => s + x.cantidad, 0), f(r.porServicio.reduce((s, x) => s + x.ingresos, 0))]
    )}

    ${
      E.profesionales.length
        ? tabla(
            "💇 Profesionales y comisiones",
            ["Profesional", "Citas", "Vendido", "Comisión %", "Comisión", "Propinas", "Ya pagado"],
            r.porProfesional.map((x) => [esc(x.nombre), x.citas, f(x.vendido), `${x.pct}%`, `<b>${f(x.comision)}</b>`, f(x.propinas), f(x.pagado)])
          )
        : ""
    }

    ${tabla(
      "🧾 Gastos por categoría",
      ["Categoría", "Monto"],
      r.gastosCat.map((x) => [esc(x.categoria), f(x.monto)]),
      ["Total", f(r.egresos)]
    )}

    ${tabla(
      "⭐ Mejores clientes del periodo",
      ["Cliente", "Visitas", "Gastó"],
      r.topClientes.slice(0, 15).map((x) => [`<a href="#clientes/${x.id}">${esc(x.nombre)}</a>`, x.visitas, f(x.gasto)])
    )}

    ${tabla("🕒 Horas más pedidas", ["Hora", "Citas"], r.porHora.slice(0, 8).map((x) => [x.hora, x.n]))}
  `;
}

export function calcular({ citas, movs, cajas, desde, hasta }) {
  const ingresosMov = movs.filter((m) => m.tipo === "ingreso");
  const egresosMov = movs.filter((m) => m.tipo === "egreso");
  const suma = (l, k = "montoBase") => l.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const ingresos = suma(ingresosMov);
  const egresos = suma(egresosMov);
  const atendidasL = citas.filter((c) => c.estado === "completada");
  const noAsistio = citas.filter((c) => c.estado === "no_asistio").length;
  const canceladas = citas.filter((c) => c.estado === "cancelada").length;
  const clientesUnicos = new Set(atendidasL.map((c) => c.clienteId).filter(Boolean)).size;

  // Clientes nuevos: creados en el periodo
  const clientesNuevos = E.clientes.filter((c) => {
    const ms = c.creado?.toMillis?.();
    if (!ms) return false;
    const f = new Date(ms).toISOString().slice(0, 10);
    return f >= desde && f <= hasta;
  }).length;

  const porDia = [];
  const dias = Math.min(diferenciaDias(desde, hasta), 92);
  for (let i = 0; i <= dias; i++) {
    const fecha = sumarDias(desde, i);
    porDia.push({ fecha, ingresos: suma(ingresosMov.filter((m) => m.fecha === fecha)) });
  }

  const porMoneda = {};
  for (const m of movs) {
    const p = (porMoneda[m.moneda] ||= { ingEf: 0, egrEf: 0, otros: 0, dif: 0 });
    const ef = /efectivo|cash|contado/i.test(m.metodo || "");
    const n = Number(m.monto) || 0;
    if (ef) p[m.tipo === "ingreso" ? "ingEf" : "egrEf"] += n;
    else p.otros += m.tipo === "ingreso" ? n : -n;
  }
  for (const c of cajas) {
    for (const [m, v] of Object.entries(c.diferencia || {})) {
      (porMoneda[m] ||= { ingEf: 0, egrEf: 0, otros: 0, dif: 0 }).dif += Number(v) || 0;
    }
  }

  const agrupar = (lista, clave, valor) => {
    const o = {};
    lista.forEach((x) => {
      const k = clave(x);
      o[k] = (o[k] || 0) + valor(x);
    });
    return o;
  };

  const metodos = {};
  ingresosMov.forEach((m) => {
    const k = `${m.metodo}|${m.moneda}`;
    metodos[k] ||= { metodo: m.metodo, moneda: m.moneda, monto: 0, base: 0 };
    metodos[k].monto += Number(m.monto) || 0;
    metodos[k].base += Number(m.montoBase) || 0;
  });

  const servicios = {};
  atendidasL.forEach((c) => {
    const k = c.servicioId || c.servicioNombre;
    servicios[k] ||= { nombre: c.servicioNombre, cantidad: 0, ingresos: 0 };
    servicios[k].cantidad++;
    servicios[k].ingresos += (Number(c.pagadoBase) || 0) - (Number(c.propinaBase) || 0);
  });

  const porProfesional = E.profesionales.map((p) => {
    const suyas = atendidasL.filter((c) => c.profesionalId === p.id);
    const vendido = suyas.reduce((s, c) => s + (Number(c.pagadoBase) || 0) - (Number(c.propinaBase) || 0), 0);
    const pct = Number(p.comision) || 0;
    return {
      nombre: p.nombre,
      citas: suyas.length,
      vendido,
      pct,
      comision: (vendido * pct) / 100,
      propinas: suyas.reduce((s, c) => s + (Number(c.propinaBase) || 0), 0),
      pagado: suma(egresosMov.filter((m) => m.profesionalId === p.id)),
    };
  });

  const gastos = agrupar(egresosMov, (m) => m.categoria || "Otros", (m) => Number(m.montoBase) || 0);

  const top = {};
  atendidasL.forEach((c) => {
    if (!c.clienteId) return;
    top[c.clienteId] ||= { id: c.clienteId, nombre: c.clienteNombre, visitas: 0, gasto: 0 };
    top[c.clienteId].visitas++;
    top[c.clienteId].gasto += Number(c.pagadoBase) || 0;
  });

  const horas = agrupar(
    citas.filter((c) => c.estado !== "cancelada"),
    (c) => c.hora,
    () => 1
  );

  const total = atendidasL.length + noAsistio;
  return {
    ingresos,
    egresos,
    atendidas: atendidasL.length,
    noAsistio,
    canceladas,
    porWhatsapp: citas.filter((c) => c.origen === "whatsapp").length,
    clientesUnicos,
    clientesNuevos,
    propinas: atendidasL.reduce((s, c) => s + (Number(c.propinaBase) || 0), 0),
    ticket: atendidasL.length ? atendidasL.reduce((s, c) => s + (Number(c.pagadoBase) || 0), 0) / atendidasL.length : 0,
    tasaInasistencia: total ? Math.round((noAsistio / total) * 100) : 0,
    porDia,
    porMoneda,
    cierres: [...cajas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    porMetodo: Object.values(metodos).sort((a, b) => b.base - a.base),
    porServicio: Object.values(servicios).sort((a, b) => b.ingresos - a.ingresos),
    porProfesional,
    gastosCat: Object.entries(gastos)
      .map(([categoria, monto]) => ({ categoria, monto }))
      .sort((a, b) => b.monto - a.monto),
    topClientes: Object.values(top).sort((a, b) => b.gasto - a.gasto),
    porHora: Object.entries(horas)
      .map(([hora, n]) => ({ hora, n }))
      .sort((a, b) => b.n - a.n),
    movs,
  };
}

function exportar() {
  if (!ultimo) return;
  const base = E.config.monedaPrincipal;
  const filas = [["Fecha", "Hora", "Tipo", "Categoría", "Concepto", "Método", "Moneda", "Monto", "Tasa", `Equivale ${base}`, "Profesional"]];
  [...ultimo.movs]
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
    .forEach((m) => filas.push([m.fecha, m.hora, m.tipo, m.categoria, m.concepto, m.metodo, m.moneda, m.monto, m.tasa, Math.round((m.montoBase || 0) * 100) / 100, m.profesionalNombre || ""]));
  descargar(`movimientos-${normalizar(E.config.nombre).replace(/ /g, "-")}-${ultimo.desde}-a-${ultimo.hasta}.csv`, aCSV(filas));
}

export { MESES };
