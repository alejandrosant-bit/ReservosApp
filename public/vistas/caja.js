// ============================================================
// Caja: apertura, ingresos/gastos, cierre con arqueo por moneda
// ============================================================
import { E, hoy, ahora, nuevoId, guardar, borrar, cajaAbierta, serverTimestamp } from "../datos.js";
import { formatoMoneda, aMonedaBase, deMinutos, hora12, fechaCorta, MONEDAS } from "../core.js";
import { esc, abrirModal, confirmar, toast, campoMonto, leerMonto, montoATexto, datosForm } from "../ui.js";

const dec = (m) => MONEDAS[m]?.decimales ?? 2;
const monedas = () => (E.config.monedas?.length ? E.config.monedas : [E.config.monedaPrincipal]);
const esEfectivo = (metodo) => /efectivo|cash|contado/i.test(metodo || "");

let cont = null;

export function montar(c) {
  cont = c;
  pintar();
  return {
    actualizar(que) {
      if (["cajas", "movimientos", "config"].includes(que)) pintar();
    },
  };
}

// Totales de una caja: por moneda, efectivo esperado, por método
export function resumenCaja(caja, movimientos = E.movimientos) {
  const movs = movimientos.filter((m) => m.cajaId === caja.id);
  const porMoneda = {};
  const porMetodo = {};
  for (const mon of new Set([...monedas(), ...Object.keys(caja.base || {})])) {
    porMoneda[mon] = { base: Number(caja.base?.[mon]) || 0, ingresosEfectivo: 0, egresosEfectivo: 0, ingresosOtros: 0, egresosOtros: 0 };
  }
  let ingresosBase = 0;
  let egresosBase = 0;
  for (const m of movs) {
    const pm = (porMoneda[m.moneda] ||= { base: 0, ingresosEfectivo: 0, egresosEfectivo: 0, ingresosOtros: 0, egresosOtros: 0 });
    const ef = esEfectivo(m.metodo);
    const monto = Number(m.monto) || 0;
    if (m.tipo === "ingreso") {
      pm[ef ? "ingresosEfectivo" : "ingresosOtros"] += monto;
      ingresosBase += Number(m.montoBase) || 0;
    } else {
      pm[ef ? "egresosEfectivo" : "egresosOtros"] += monto;
      egresosBase += Number(m.montoBase) || 0;
    }
    const k = `${m.metodo} (${m.moneda})`;
    porMetodo[k] = (porMetodo[k] || 0) + (m.tipo === "ingreso" ? monto : -monto);
  }
  for (const k in porMoneda) {
    const p = porMoneda[k];
    p.esperado = p.base + p.ingresosEfectivo - p.egresosEfectivo;
  }
  return { movs, porMoneda, porMetodo, ingresosBase, egresosBase };
}

function pintar() {
  if (!cont) return;
  const caja = cajaAbierta();
  const base = E.config.monedaPrincipal;
  const historial = E.cajas.filter((c) => c.estado === "cerrada").slice(0, 20);

  let html = `<div class="cab-vista"><h2>Caja</h2>
    <div class="fila"><a class="btn btn-sec btn-chico" href="#reportes">📊 Arqueo semanal / mensual</a></div></div>`;

  if (!caja) {
    html += `<div class="tarjeta estado-caja"><span class="ico">🔒</span><div class="crece"><div class="negrita">La caja está cerrada</div>
      <div class="peq suave">Ábrela al iniciar el día con el dinero base (sencillo) que hay en el cajón.</div></div>
      <button class="btn btn-pri" id="abrir">Abrir caja</button></div>`;
  } else {
    const r = resumenCaja(caja);
    const filasMon = Object.entries(r.porMoneda)
      .filter(([m, p]) => monedas().includes(m) || p.base || p.ingresosEfectivo || p.egresosEfectivo || p.ingresosOtros || p.egresosOtros)
      .map(
        ([m, p]) => `<tr><td class="negrita">${m}</td><td class="num">${formatoMoneda(p.base, m)}</td><td class="num positivo">+${formatoMoneda(p.ingresosEfectivo, m)}</td>
        <td class="num negativo">−${formatoMoneda(p.egresosEfectivo, m)}</td><td class="num negrita">${formatoMoneda(p.esperado, m)}</td><td class="num">${formatoMoneda(p.ingresosOtros - p.egresosOtros, m)}</td></tr>`
      )
      .join("");
    html += `
      <div class="tarjeta estado-caja"><span class="ico">🟢</span><div class="crece"><div class="negrita">Caja abierta</div>
        <div class="peq suave">Desde ${fechaCorta(caja.fecha)} a las ${hora12(caja.hora)}${caja.abiertaPor ? " · " + esc(caja.abiertaPor) : ""}</div></div>
        <button class="btn btn-pri" id="cerrar">Cerrar caja</button></div>
      <div class="kpis" style="margin-top:12px">
        <div class="kpi"><div class="v positivo">${formatoMoneda(r.ingresosBase, base)}</div><div class="t">Ingresos</div></div>
        <div class="kpi"><div class="v negativo">${formatoMoneda(r.egresosBase, base)}</div><div class="t">Gastos</div></div>
        <div class="kpi"><div class="v">${formatoMoneda(r.ingresosBase - r.egresosBase, base)}</div><div class="t">Neto</div></div>
        <div class="kpi"><div class="v">${r.movs.filter((m) => m.citaId).length ? new Set(r.movs.filter((m) => m.citaId).map((m) => m.citaId)).size : 0}</div><div class="t">Citas cobradas</div></div>
      </div>
      <div class="fila-botones">
        <button class="btn btn-ok" id="ingreso">+ Ingreso / venta</button>
        <button class="btn btn-peligro" id="gasto">− Gasto / salida</button>
      </div>
      <div class="seccion tarjeta"><h3>Efectivo en caja por moneda</h3>
        <div class="tabla-cont"><table><thead><tr><th>Moneda</th><th class="num">Base</th><th class="num">Entró</th><th class="num">Salió</th><th class="num">Debe haber</th><th class="num">Otros medios</th></tr></thead>
        <tbody>${filasMon}</tbody></table></div>
        <p class="ayuda">“Otros medios” = transferencias, tarjetas, pago móvil, Nequi, Zelle… (no están en el cajón).</p>
      </div>
      <div class="seccion tarjeta"><h3>Movimientos de esta caja</h3>
        ${
          r.movs.length
            ? `<div class="tabla-cont"><table><thead><tr><th>Hora</th><th>Concepto</th><th>Método</th><th class="num">Monto</th><th></th></tr></thead><tbody>
          ${[...r.movs]
            .sort((a, b) => (b.creadoMs || 0) - (a.creadoMs || 0))
            .map(
              (m) => `<tr><td>${hora12(m.hora)}</td><td>${esc(m.concepto)}<div class="mini suave">${esc(m.categoria || "")}</div></td><td>${esc(m.metodo)}</td>
              <td class="num ${m.tipo === "ingreso" ? "positivo" : "negativo"}">${m.tipo === "ingreso" ? "+" : "−"}${formatoMoneda(m.monto, m.moneda)}${m.moneda !== base ? `<div class="mini suave">${formatoMoneda(m.montoBase, base)}</div>` : ""}</td>
              <td>${m.citaId ? "" : `<button class="btn-icono" data-borrar="${m.id}" title="Borrar">🗑️</button>`}</td></tr>`
            )
            .join("")}</tbody></table></div>`
            : '<p class="vacio">Aún no hay movimientos. Los cobros de citas aparecen aquí solos.</p>'
        }
      </div>`;
  }

  html += `<div class="seccion tarjeta"><h3>Cierres anteriores</h3>
    ${
      historial.length
        ? `<div class="tabla-cont"><table><thead><tr><th>Fecha</th><th class="num">Ingresos</th><th class="num">Gastos</th><th>Diferencia arqueo</th><th></th></tr></thead><tbody>
      ${historial
        .map((c) => {
          const dif = Object.entries(c.diferencia || {}).filter(([, v]) => Math.abs(v) > 0.009);
          return `<tr><td>${fechaCorta(c.fecha)}${c.fechaCierre && c.fechaCierre !== c.fecha ? " → " + fechaCorta(c.fechaCierre) : ""}</td>
          <td class="num positivo">${formatoMoneda(c.ingresosBase || 0, base)}</td><td class="num negativo">${formatoMoneda(c.egresosBase || 0, base)}</td>
          <td>${dif.length ? dif.map(([m, v]) => `<span class="${v < 0 ? "negativo" : "positivo"}">${v > 0 ? "+" : ""}${formatoMoneda(v, m)}</span>`).join("<br>") : '<span class="positivo">✔ Cuadró</span>'}</td>
          <td><button class="btn btn-sec btn-chico" data-ver="${c.id}">Ver</button></td></tr>`;
        })
        .join("")}</tbody></table></div>`
        : '<p class="peq suave">Aún no hay cierres.</p>'
    }</div>`;

  cont.innerHTML = html;
  cont.querySelector("#abrir")?.addEventListener("click", () => abrirCaja());
  cont.querySelector("#cerrar")?.addEventListener("click", () => cerrarCaja(caja));
  cont.querySelector("#ingreso")?.addEventListener("click", () => movimiento("ingreso"));
  cont.querySelector("#gasto")?.addEventListener("click", () => movimiento("egreso"));
  cont.querySelectorAll("[data-borrar]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (await confirmar("¿Borrar este movimiento?", { si: "Borrar", peligro: true })) borrar("movimientos", b.dataset.borrar);
      })
  );
  cont.querySelectorAll("[data-ver]").forEach((b) => (b.onclick = () => verCierre(E.cajas.find((c) => c.id === b.dataset.ver))));
}

// ------------------------------------------------------------
// Abrir caja
// ------------------------------------------------------------
export function abrirCaja({ alAbrir, motivo } = {}) {
  if (cajaAbierta()) return alAbrir?.();
  const ultima = E.cajas.find((c) => c.estado === "cerrada");
  abrirModal({
    titulo: "Abrir caja",
    html: `<form id="f-abrir">
      ${motivo ? `<p class="peq">${esc(motivo)}</p>` : ""}
      <p class="ayuda">Escribe cuánto efectivo hay en el cajón para empezar (base o sencillo).${ultima ? " Se sugiere lo que se contó en el último cierre." : ""}</p>
      ${monedas()
        .map((m) => `<label>Base en ${m} (${MONEDAS[m]?.nombre || m})<input data-base="${m}" value="${montoATexto(Number(ultima?.contado?.[m]) || 0, dec(m))}" placeholder="0" autocomplete="off" /></label>`)
        .join("")}
      <button class="btn btn-pri btn-bloque">🔓 Abrir caja</button>
    </form>`,
    onAbrir(cu, cerrar) {
      cu.querySelectorAll("[data-base]").forEach((i) => campoMonto(i, dec(i.dataset.base)));
      cu.querySelector("#f-abrir").onsubmit = (ev) => {
        ev.preventDefault();
        const baseMon = {};
        cu.querySelectorAll("[data-base]").forEach((i) => (baseMon[i.dataset.base] = leerMonto(i.value, dec(i.dataset.base))));
        const id = nuevoId("cajas");
        const a = ahora();
        const caja = { estado: "abierta", fecha: a.fecha, hora: deMinutos(a.minutos), base: baseMon, abiertaMs: Date.now(), abiertaEn: serverTimestamp(), abiertaPor: E.usuario?.email || "" };
        guardar("cajas", id, caja, false);
        E.cajas.unshift({ id, ...caja }); // disponible al instante aunque no haya internet
        toast("Caja abierta ✅");
        cerrar();
        alAbrir?.();
      };
    },
  });
}

// ------------------------------------------------------------
// Ingreso o gasto manual
// ------------------------------------------------------------
export function movimiento(tipo) {
  const caja = cajaAbierta();
  if (!caja) return abrirCaja({ alAbrir: () => movimiento(tipo), motivo: "Primero abre la caja." });
  const base = E.config.monedaPrincipal;
  const categorias = tipo === "ingreso" ? ["Venta de productos", "Servicio sin cita", "Abono / anticipo", "Otro ingreso"] : E.config.categoriasGasto;
  abrirModal({
    titulo: tipo === "ingreso" ? "Registrar ingreso" : "Registrar gasto",
    html: `<form id="f-mov">
      <label>Concepto<input name="concepto" required placeholder="${tipo === "ingreso" ? "Ej. Shampoo keratina" : "Ej. Compra de esmaltes"}" autocomplete="off" /></label>
      <label>Categoría<select name="categoria">${categorias.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
      ${
        tipo === "egreso" && E.profesionales.length
          ? `<label>¿Es pago a un profesional? (opcional)<select name="profesionalId"><option value="">No</option>${E.profesionales.map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("")}</select></label>`
          : ""
      }
      <div class="tres-col">
        <label>Monto<input name="monto" required autocomplete="off" /></label>
        <label>Moneda<select name="moneda">${monedas().map((m) => `<option ${m === base ? "selected" : ""}>${m}</option>`).join("")}</select></label>
        <label>Método<select name="metodo">${(E.config.metodosPago || ["Efectivo"]).map((m) => `<option>${esc(m)}</option>`).join("")}</select></label>
      </div>
      <p class="equivale" id="equiv"></p>
      <button class="btn ${tipo === "ingreso" ? "btn-ok" : "btn-peligro"} btn-bloque">Guardar</button>
    </form>`,
    onAbrir(cu, cerrar) {
      const f = cu.querySelector("#f-mov");
      campoMonto(f.monto, () => dec(f.moneda.value));
      const equiv = () => {
        const m = f.moneda.value;
        const n = leerMonto(f.monto.value, dec(m));
        cu.querySelector("#equiv").textContent = m !== base ? `≈ ${formatoMoneda(aMonedaBase(n, m, E.config), base)} (tasa ${E.config.tasas?.[m] || "sin definir"})` : "";
      };
      f.monto.addEventListener("input", equiv);
      f.moneda.addEventListener("change", equiv);
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(f);
        const monto = leerMonto(d.monto, dec(d.moneda));
        if (!monto) return toast("Escribe el monto", "error");
        const a = ahora();
        const prof = E.profesionales.find((p) => p.id === d.profesionalId);
        guardar(
          "movimientos",
          nuevoId("movimientos"),
          {
            tipo,
            concepto: d.concepto.trim(),
            categoria: d.categoria,
            monto,
            moneda: d.moneda,
            tasa: d.moneda === base ? 1 : Number(E.config.tasas?.[d.moneda]) || 0,
            montoBase: aMonedaBase(monto, d.moneda, E.config),
            metodo: d.metodo,
            fecha: a.fecha,
            hora: deMinutos(a.minutos),
            cajaId: caja.id,
            profesionalId: prof?.id || "",
            profesionalNombre: prof?.nombre || "",
            creado: serverTimestamp(),
            creadoMs: Date.now(),
          },
          false
        );
        toast("Guardado ✅");
        cerrar();
      };
    },
  });
}

// ------------------------------------------------------------
// Cerrar caja (arqueo): se cuenta el efectivo y se compara
// ------------------------------------------------------------
function cerrarCaja(caja) {
  const r = resumenCaja(caja);
  const pendientes = E.citas.filter((c) => c.fecha === hoy() && ["pendiente", "confirmada"].includes(c.estado)).length;
  abrirModal({
    titulo: "Cerrar caja — arqueo",
    html: `<form id="f-cierre">
      ${pendientes ? `<p class="tarjeta" style="background:var(--alerta-suave);box-shadow:none">⚠️ Hay ${pendientes} cita(s) de hoy sin cobrar.</p>` : ""}
      <p class="ayuda">Cuenta el efectivo que hay en el cajón y escríbelo. La app calcula si sobra o falta.</p>
      ${Object.entries(r.porMoneda)
        .map(
          ([m, p]) => `<div class="tarjeta" style="box-shadow:none;border:1px solid var(--borde)">
          <div class="fila entre"><span class="negrita">${m}</span><span class="peq">Debe haber: <b>${formatoMoneda(p.esperado, m)}</b></span></div>
          <label style="margin-top:6px">Efectivo contado<input data-contado="${m}" data-esperado="${p.esperado}" value="${montoATexto(p.esperado, dec(m))}" autocomplete="off" /></label>
          <div class="peq" data-dif="${m}"></div></div>`
        )
        .join("")}
      <label>Observaciones<textarea name="notas" placeholder="Ej. faltan 5.000 porque se dio vuelto de más"></textarea></label>
      <button class="btn btn-pri btn-bloque">🔒 Cerrar caja</button>
    </form>`,
    onAbrir(cu, cerrar) {
      const calc = () =>
        cu.querySelectorAll("[data-contado]").forEach((i) => {
          const m = i.dataset.contado;
          const dif = leerMonto(i.value, dec(m)) - Number(i.dataset.esperado);
          const el = cu.querySelector(`[data-dif="${m}"]`);
          el.className = "peq " + (Math.abs(dif) < 0.01 ? "positivo" : dif < 0 ? "negativo" : "positivo");
          el.textContent = Math.abs(dif) < 0.01 ? "✔ Cuadra exacto" : dif < 0 ? `Falta ${formatoMoneda(-dif, m)}` : `Sobra ${formatoMoneda(dif, m)}`;
        });
      cu.querySelectorAll("[data-contado]").forEach((i) => {
        campoMonto(i, dec(i.dataset.contado));
        i.addEventListener("input", calc);
      });
      calc();
      cu.querySelector("#f-cierre").onsubmit = (ev) => {
        ev.preventDefault();
        const contado = {};
        const esperado = {};
        const diferencia = {};
        cu.querySelectorAll("[data-contado]").forEach((i) => {
          const m = i.dataset.contado;
          contado[m] = leerMonto(i.value, dec(m));
          esperado[m] = Number(i.dataset.esperado);
          diferencia[m] = Math.round((contado[m] - esperado[m]) * 100) / 100;
        });
        const a = ahora();
        guardar("cajas", caja.id, {
          estado: "cerrada",
          contado,
          esperado,
          diferencia,
          ingresosBase: r.ingresosBase,
          egresosBase: r.egresosBase,
          porMetodo: r.porMetodo,
          notas: ev.target.notas.value,
          fechaCierre: a.fecha,
          horaCierre: deMinutos(a.minutos),
          cerradaEn: serverTimestamp(),
          cerradaPor: E.usuario?.email || "",
        });
        toast("Caja cerrada ✅");
        cerrar();
      };
    },
  });
}

function verCierre(c) {
  if (!c) return;
  const base = E.config.monedaPrincipal;
  abrirModal({
    titulo: `Cierre ${fechaCorta(c.fecha)}`,
    html: `<p class="peq suave">Abierta ${fechaCorta(c.fecha)} ${hora12(c.hora)} · Cerrada ${fechaCorta(c.fechaCierre || c.fecha)} ${c.horaCierre ? hora12(c.horaCierre) : ""}</p>
      <div class="tabla-cont"><table><thead><tr><th>Moneda</th><th class="num">Base</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th></tr></thead><tbody>
      ${Object.keys(c.contado || {})
        .map(
          (m) => `<tr><td>${m}</td><td class="num">${formatoMoneda(c.base?.[m] || 0, m)}</td><td class="num">${formatoMoneda(c.esperado?.[m] || 0, m)}</td><td class="num">${formatoMoneda(c.contado[m], m)}</td>
          <td class="num ${c.diferencia?.[m] < 0 ? "negativo" : "positivo"}">${formatoMoneda(c.diferencia?.[m] || 0, m)}</td></tr>`
        )
        .join("")}</tbody></table></div>
      <h4 style="margin-top:12px">Por método de pago</h4>
      <div class="tabla-cont"><table><tbody>${Object.entries(c.porMetodo || {})
        .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.toLocaleString("es-CO", { maximumFractionDigits: 2 })}</td></tr>`)
        .join("")}</tbody></table></div>
      <p>Ingresos: <b class="positivo">${formatoMoneda(c.ingresosBase || 0, base)}</b> · Gastos: <b class="negativo">${formatoMoneda(c.egresosBase || 0, base)}</b></p>
      ${c.notas ? `<p>📝 ${esc(c.notas)}</p>` : ""}`,
  });
}
