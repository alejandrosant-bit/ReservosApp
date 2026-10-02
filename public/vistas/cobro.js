// ============================================================
// Cobro: registra pagos (uno o varios, en distintas monedas y
// métodos) como movimientos de la caja abierta.
// Ej. en Venezuela: 10 US$ en efectivo + el resto en Bs por pago móvil.
// ============================================================
import { E, nuevoId, lote, hoy, ahora, cajaAbierta, increment, serverTimestamp, refDoc } from "../datos.js";
import { formatoMoneda, aMonedaBase, desdeMonedaBase, MONEDAS, deMinutos } from "../core.js";
import { abrirModal, esc, campoMonto, leerMonto, montoATexto, toast } from "../ui.js";
import { abrirCaja } from "./caja.js";

const dec = (m) => MONEDAS[m]?.decimales ?? 2;

function opcionesMoneda(sel) {
  return (E.config.monedas || [E.config.monedaPrincipal]).map((m) => `<option value="${m}" ${m === sel ? "selected" : ""}>${m}</option>`).join("");
}
function opcionesMetodo(sel) {
  return (E.config.metodosPago || ["Efectivo"]).map((m) => `<option ${m === sel ? "selected" : ""}>${esc(m)}</option>`).join("");
}

export function lineaPagoHTML({ moneda, monto = 0, metodo = "Efectivo" }) {
  return `<div class="linea-pago">
    <label>Monto<input data-monto value="${montoATexto(monto, dec(moneda))}" autocomplete="off" /></label>
    <label>Moneda<select data-moneda>${opcionesMoneda(moneda)}</select></label>
    <label>Método<select data-metodo>${opcionesMetodo(metodo)}</select></label>
    <button type="button" class="btn-icono" data-quitar title="Quitar">🗑️</button>
  </div>`;
}

export function leerLineas(cont) {
  return [...cont.querySelectorAll(".linea-pago")]
    .map((l) => {
      const moneda = l.querySelector("[data-moneda]").value;
      const monto = leerMonto(l.querySelector("[data-monto]").value, dec(moneda));
      return { moneda, monto, metodo: l.querySelector("[data-metodo]").value, montoBase: aMonedaBase(monto, moneda, E.config) };
    })
    .filter((l) => l.monto > 0);
}

export function activarLineas(cont, alCambiar) {
  const enlazar = (l) => {
    const input = l.querySelector("[data-monto]");
    campoMonto(input, () => dec(l.querySelector("[data-moneda]").value));
    input.addEventListener("input", alCambiar);
    l.querySelector("[data-moneda]").addEventListener("change", (e) => {
      // Al cambiar de moneda, convierte lo que falta por pagar
      alCambiar({ cambioMoneda: l, moneda: e.target.value });
    });
    l.querySelector("[data-metodo]").addEventListener("change", alCambiar);
    l.querySelector("[data-quitar]").addEventListener("click", () => {
      if (cont.querySelectorAll(".linea-pago").length > 1) l.remove();
      alCambiar();
    });
  };
  cont.querySelectorAll(".linea-pago").forEach(enlazar);
  return enlazar;
}

function textoEquivalencias(montoBase) {
  const base = E.config.monedaPrincipal;
  return (E.config.monedas || [])
    .filter((m) => m !== base && Number(E.config.tasas?.[m]))
    .map((m) => formatoMoneda(desdeMonedaBase(montoBase, m, E.config), m))
    .join(" · ");
}

// ------------------------------------------------------------
// Cobrar una cita
// ------------------------------------------------------------
export function cobrarCita(cita, { alTerminar } = {}) {
  const caja = cajaAbierta();
  if (!caja) {
    abrirCaja({ alAbrir: () => cobrarCita(cita, { alTerminar }), motivo: "Para cobrar primero abre la caja del día." });
    return;
  }
  const base = E.config.monedaPrincipal;
  const precio = Number(cita.precio) || 0;
  const prof = E.profesionales.find((p) => p.id === cita.profesionalId);

  abrirModal({
    titulo: "Cobrar cita",
    html: `
      <div class="tarjeta" style="background:var(--pri-suave);box-shadow:none">
        <div class="negrita">${esc(cita.servicioNombre)} · ${esc(cita.clienteNombre)}</div>
        <div class="peq suave">${prof ? "Atendió: " + esc(prof.nombre) : ""}</div>
      </div>
      <form id="f-cobro" style="margin-top:12px">
        <label>Valor del servicio (${base})<input name="valor" value="${montoATexto(precio, dec(base))}" autocomplete="off" /></label>
        <div class="dos-col">
          <label>Descuento (${base})<input name="descuento" value="" placeholder="0" autocomplete="off" /></label>
          <label>Propina (${base})<input name="propina" value="" placeholder="0" autocomplete="off" /></label>
        </div>
        <div class="fila entre"><span class="suave">Total a cobrar</span><span class="total-grande" id="total"></span></div>
        <div class="equivale derecha" id="equiv"></div>
        <h4 style="margin-top:6px">Pagos recibidos</h4>
        <div id="lineas">${lineaPagoHTML({ moneda: base, monto: precio })}</div>
        <button type="button" class="btn btn-sec btn-chico" id="otra-linea">+ Pagó con otra moneda o método</button>
        <div class="fila entre"><span class="suave" id="falta-t">Falta</span><span class="negrita" id="falta"></span></div>
        <p class="error" id="err"></p>
        <button class="btn btn-ok btn-bloque" type="submit">💵 Registrar pago</button>
      </form>`,
    onAbrir(c, cerrar) {
      const f = c.querySelector("#f-cobro");
      const lineas = c.querySelector("#lineas");
      ["valor", "descuento", "propina"].forEach((n) => campoMonto(f[n], dec(base)));

      const total = () => Math.max(0, leerMonto(f.valor.value, dec(base)) - leerMonto(f.descuento.value, dec(base)) + leerMonto(f.propina.value, dec(base)));
      const recalcular = (ev) => {
        if (ev?.cambioMoneda) {
          const otras = [...lineas.querySelectorAll(".linea-pago")].filter((l) => l !== ev.cambioMoneda).map((l) => {
            const m = l.querySelector("[data-moneda]").value;
            return aMonedaBase(leerMonto(l.querySelector("[data-monto]").value, dec(m)), m, E.config);
          });
          const resta = Math.max(0, total() - otras.reduce((s, x) => s + x, 0));
          const m = ev.moneda;
          const input = ev.cambioMoneda.querySelector("[data-monto]");
          input.value = montoATexto(Math.round(desdeMonedaBase(resta, m, E.config) * 10 ** dec(m)) / 10 ** dec(m), dec(m));
          if (m !== base && !Number(E.config.tasas?.[m])) toast(`Falta la tasa de ${m} en Ajustes → Monedas`, "error");
        }
        const t = total();
        c.querySelector("#total").textContent = formatoMoneda(t, base);
        c.querySelector("#equiv").textContent = textoEquivalencias(t);
        const pagado = leerLineas(lineas).reduce((s, x) => s + x.montoBase, 0);
        const falta = t - pagado;
        c.querySelector("#falta-t").textContent = falta >= 0 ? "Falta" : "Vuelto / cambio";
        c.querySelector("#falta").textContent = formatoMoneda(Math.abs(falta), base);
        c.querySelector("#falta").className = "negrita " + (Math.abs(falta) < 1 ? "positivo" : falta > 0 ? "negativo" : "");
      };
      const enlazar = activarLineas(lineas, recalcular);
      c.querySelector("#otra-linea").onclick = () => {
        const pagado = leerLineas(lineas).reduce((s, x) => s + x.montoBase, 0);
        const m = (E.config.monedas || []).find((x) => x !== base) || base;
        const resta = Math.max(0, total() - pagado);
        lineas.insertAdjacentHTML("beforeend", lineaPagoHTML({ moneda: m, monto: Math.round(desdeMonedaBase(resta, m, E.config) * 100) / 100, metodo: (E.config.metodosPago || [])[1] || "Efectivo" }));
        enlazar(lineas.lastElementChild);
        recalcular();
      };
      ["valor", "descuento", "propina"].forEach((n) => f[n].addEventListener("input", () => recalcular()));
      recalcular();

      f.onsubmit = (ev) => {
        ev.preventDefault();
        const pagos = leerLineas(lineas);
        if (!pagos.length) return (c.querySelector("#err").textContent = "Escribe el monto recibido.");
        const t = total();
        const pagado = pagos.reduce((s, x) => s + x.montoBase, 0);
        // El vuelto se descuenta del último pago en efectivo, para que
        // la caja cuadre con lo que realmente quedó.
        // Tolerancia de redondeo por conversión de monedas (medio centavo)
        const tolerancia = 0.5 / 10 ** dec(base);
        const vuelto = pagado - t > tolerancia ? Math.round((pagado - t) * 10 ** dec(base)) / 10 ** dec(base) : 0;
        registrarCobro(cita, {
          pagos,
          vueltoBase: vuelto,
          totalBase: Math.abs(pagado - t) <= tolerancia ? t : Math.min(t, pagado),
          propinaBase: leerMonto(f.propina.value, dec(base)),
          descuentoBase: leerMonto(f.descuento.value, dec(base)),
          caja,
        });
        toast(vuelto > 0 ? `Pago registrado ✅ Vuelto: ${formatoMoneda(vuelto, base)}` : "Pago registrado ✅");
        cerrar();
        alTerminar?.();
      };
    },
  });
}

function registrarCobro(cita, { pagos, vueltoBase, totalBase, propinaBase, descuentoBase, caja }) {
  const b = lote();
  const ah = ahora();
  const fecha = hoy();
  const hora = deMinutos(ah.minutos);
  const ids = [];
  const base = E.config.monedaPrincipal;

  // Vuelto: se entrega en la moneda principal en efectivo
  if (vueltoBase > 0) pagos.push({ moneda: base, monto: -vueltoBase, metodo: "Efectivo", montoBase: -vueltoBase, esVuelto: true });

  for (const p of pagos) {
    const id = nuevoId("movimientos");
    ids.push(id);
    b.set(
      "movimientos",
      id,
      {
        tipo: "ingreso",
        categoria: "Servicio",
        concepto: `${cita.servicioNombre} — ${cita.clienteNombre}${p.esVuelto ? " (vuelto)" : ""}`,
        monto: p.monto,
        moneda: p.moneda,
        tasa: p.moneda === base ? 1 : Number(E.config.tasas?.[p.moneda]) || 0,
        montoBase: p.montoBase,
        metodo: p.metodo,
        fecha,
        hora,
        cajaId: caja.id,
        citaId: cita.id,
        clienteId: cita.clienteId || "",
        servicioId: cita.servicioId || "",
        profesionalId: cita.profesionalId || "",
        profesionalNombre: cita.profesionalNombre || "",
        propinaBase: ids.length === 1 ? propinaBase : 0,
        creado: serverTimestamp(),
        creadoMs: Date.now(),
      },
      false
    );
  }
  b.update("citas", cita.id, {
    estado: "completada",
    pagadoBase: totalBase,
    propinaBase,
    descuentoBase,
    movimientoIds: ids,
    cobradaEn: serverTimestamp(),
  });
  if (cita.clienteId) {
    b.setRaw(refDoc("clientes", cita.clienteId), { visitas: increment(1), totalGastado: increment(totalBase), ultimaVisita: cita.fecha }, true);
  }
  b.commit();
}

// Deshacer un cobro (si se marcó por error)
export function deshacerCobro(cita) {
  const b = lote();
  (cita.movimientoIds || []).forEach((id) => b.delete("movimientos", id));
  b.update("citas", cita.id, { estado: "confirmada", pagadoBase: 0, movimientoIds: [] });
  if (cita.clienteId) b.setRaw(refDoc("clientes", cita.clienteId), { visitas: increment(-1), totalGastado: increment(-(Number(cita.pagadoBase) || 0)) }, true);
  b.commit();
}
