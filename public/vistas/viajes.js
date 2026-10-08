// ============================================================
// Central de taxis: solicitudes que llegan por WhatsApp, asignar
// conductor (placa y tiempo de llegada), avisar "llegó", terminar
// y cobrar. Cada cambio le llega al pasajero por WhatsApp.
// ============================================================
import { E, hoy, ahora, nuevoId, guardar, actualizar, serverTimestamp, datosCliente, avisarCliente } from "../datos.js";
import { hora12, fechaLarga, fechaCorta, deMinutos, formatoMoneda, soloDigitos, normalizar } from "../core.js";
import { esc, abrirModal, confirmar, toast, datosForm, iniciales } from "../ui.js";
import { cobrarCita } from "./cobro.js";

export const ESTADOS_VIAJE = {
  pendiente: "Buscando conductor",
  confirmada: "En camino",
  completada: "Terminado",
  cancelada: "Cancelado",
  no_asistio: "No se presentó",
};

export function estadoViaje(c) {
  if (c.estado === "confirmada" && c.llegoMs) return "Esperando al pasajero";
  if (c.estado === "pendiente" && c.programado) return "Programado";
  return ESTADOS_VIAJE[c.estado] || c.estado;
}

const minutosDesde = (ms) => Math.max(0, Math.round((Date.now() - Number(ms || 0)) / 60000));

export function tarjetaViaje(c) {
  const prof = E.profesionales.find((p) => p.id === c.profesionalId);
  return `<div class="cita viaje ${c.estado}" data-cita="${c.id}" style="--color:${c.estado === "pendiente" ? "var(--alerta)" : "var(--pri)"}">
    <div class="h">${hora12(c.hora)}<small>${c.programado ? "programado" : c.creadoMs ? "hace " + minutosDesde(c.creadoMs) + " min" : ""}</small></div>
    <div class="crece">
      <div class="q">📍 ${esc(c.recogida || "Sin dirección")}</div>
      <div class="peq suave">${esc(c.clienteNombre || "")}${c.destino ? " → " + esc(c.destino) : ""}</div>
      ${prof ? `<div class="peq">🚘 ${esc(prof.nombre)}${prof.placa ? " · " + esc(prof.placa) : ""}${c.etaMinutos && !c.llegoMs ? " · llega en ~" + c.etaMinutos + " min" : ""}</div>` : ""}
    </div>
    <div class="fila" style="flex-direction:column;align-items:flex-end;gap:4px">
      <span class="chip chip-${c.estado}">${estadoViaje(c)}</span>
      ${c.estado === "pendiente" && !c.programado ? `<button class="btn btn-pri btn-chico" data-asignar="${c.id}">Asignar</button>` : ""}
    </div>
  </div>`;
}

// Panel superior: pedidos esperando conductor (los más viejos primero)
export function panelSolicitudes() {
  const h = hoy();
  const pendientes = E.citas
    .filter((c) => c.tipo === "viaje" && c.estado === "pendiente" && (!c.programado || c.fecha === h))
    .sort((a, b) => (a.creadoMs || 0) - (b.creadoMs || 0));
  if (!pendientes.length) return `<div class="tarjeta solicitudes vacio-solicitudes">🚕 No hay pedidos esperando conductor.</div>`;
  return `<div class="tarjeta solicitudes" role="region" aria-label="Pedidos por asignar">
    <div class="fila entre"><h3>🚨 ${pendientes.length} ${pendientes.length === 1 ? "pedido espera" : "pedidos esperan"} conductor</h3></div>
    <div class="lista-citas" style="margin-top:8px">${pendientes.map(tarjetaViaje).join("")}</div>
  </div>`;
}

async function avisar(cita, evento) {
  try {
    await avisarCliente(cita.id, evento);
    toast("📲 Le avisamos al pasajero por WhatsApp");
  } catch (e) {
    toast(`Guardado, pero no se pudo avisar por WhatsApp: ${e.message}`, "error", 7000);
  }
}

export function asignarConductor(c) {
  const conductores = E.profesionales.filter((p) => p.activo !== false);
  if (!conductores.length) {
    toast("Primero registra tus conductores en Ajustes → Conductores", "error", 5000);
    location.hash = "ajustes/profesionales";
    return;
  }
  const ocupados = new Set(E.citas.filter((x) => x.tipo === "viaje" && x.estado === "confirmada" && x.fecha === hoy()).map((x) => x.profesionalId));
  abrirModal({
    titulo: "Asignar conductor",
    html: `<p class="peq suave">📍 ${esc(c.recogida || "")}${c.destino ? " → " + esc(c.destino) : ""}</p>
      <form id="f-asignar">
        <div class="lista conductores">
          ${conductores
            .map(
              (p, i) => `<label class="item conductor ${ocupados.has(p.id) ? "ocupado" : ""}">
              <input type="radio" name="conductor" value="${p.id}" ${i === 0 && !ocupados.has(p.id) ? "checked" : ""} />
              <div class="avatar">${esc(iniciales(p.nombre))}</div>
              <div class="crece"><div class="negrita">${esc(p.nombre)}</div><div class="peq suave">${esc(p.vehiculo || "Taxi")} · ${esc(p.placa || "sin placa")}</div></div>
              ${ocupados.has(p.id) ? '<span class="chip chip-confirmada">En servicio</span>' : '<span class="chip chip-completada">Libre</span>'}
            </label>`
            )
            .join("")}
        </div>
        <label>¿En cuántos minutos llega?
          <div class="horas-grid eta">${[3, 5, 8, 10, 15, 20, 30].map((m) => `<button type="button" data-eta="${m}" class="${m === 8 ? "sel" : ""}">${m} min</button>`).join("")}</div>
        </label>
        <button class="btn btn-pri btn-bloque">🚕 Asignar y avisar al pasajero</button>
      </form>`,
    onAbrir(cu, cerrar) {
      let eta = 8;
      cu.querySelectorAll("[data-eta]").forEach(
        (b) =>
          (b.onclick = () => {
            eta = Number(b.dataset.eta);
            cu.querySelectorAll("[data-eta]").forEach((x) => x.classList.toggle("sel", x === b));
          })
      );
      cu.querySelector("#f-asignar").onsubmit = (ev) => {
        ev.preventDefault();
        const id = datosForm(ev.target).conductor;
        const p = E.profesionales.find((x) => x.id === id);
        if (!p) return toast("Elige un conductor", "error");
        actualizar("citas", c.id, { estado: "confirmada", profesionalId: p.id, profesionalNombre: p.nombre, etaMinutos: eta, asignadoMs: Date.now() });
        cerrar();
        avisar(c, "asignado");
      };
    },
  });
}

export function detalleViaje(c) {
  const prof = E.profesionales.find((p) => p.id === c.profesionalId);
  const mapa = c.ubicacion?.lat ? `https://www.google.com/maps/search/?api=1&query=${c.ubicacion.lat},${c.ubicacion.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.recogida || "")}`;
  const waze = c.ubicacion?.lat ? `https://waze.com/ul?ll=${c.ubicacion.lat},${c.ubicacion.lng}&navigate=yes` : "";
  const activo = ["pendiente", "confirmada"].includes(c.estado);
  abrirModal({
    titulo: `🚕 ${c.programado ? "Taxi programado" : "Pedido de taxi"} · ${hora12(c.hora)}`,
    html: `<div class="fila" style="gap:12px">
        <div class="avatar">${esc(iniciales(c.clienteNombre))}</div>
        <div class="crece"><div class="negrita">${esc(c.clienteNombre || "")}</div><div class="peq suave">${esc(c.telefono || "")}</div></div>
        <span class="chip chip-${c.estado}">${estadoViaje(c)}</span>
      </div>
      <div class="tarjeta" style="margin-top:12px;box-shadow:none;border:1px solid var(--borde)">
        <div>📍 <b>Recoger:</b> ${esc(c.recogida || "")}</div>
        <div>🏁 <b>Destino:</b> ${esc(c.destino || "Se lo dice al conductor")}</div>
        <div>📅 ${fechaLarga(c.fecha)}, ${hora12(c.hora)} · ${esc(c.servicioNombre || "")} ${c.precio ? "· desde " + formatoMoneda(c.precio, E.config.monedaPrincipal) : ""}</div>
        ${prof ? `<div>🚘 ${esc(prof.nombre)} · ${esc(prof.vehiculo || "Taxi")} · <b>${esc(prof.placa || "")}</b>${c.etaMinutos ? ` · llega en ~${c.etaMinutos} min` : ""}</div>` : ""}
        ${c.estado === "completada" ? `<div class="positivo">💵 Cobrado: ${formatoMoneda(c.pagadoBase, E.config.monedaPrincipal)}</div>` : ""}
      </div>
      <div class="fila-botones" style="justify-content:stretch">
        <a class="btn btn-sec" href="${esc(mapa)}" target="_blank" rel="noopener">🗺️ Ver en el mapa</a>
        ${waze ? `<a class="btn btn-sec" href="${esc(waze)}" target="_blank" rel="noopener">🧭 Waze</a>` : ""}
      </div>
      ${
        activo
          ? `<div class="fila-botones" style="justify-content:stretch">
        <button class="btn btn-pri" data-acc="asignar">${c.profesionalId ? "🔁 Cambiar conductor" : "🚕 Asignar conductor"}</button>
        ${c.profesionalId && !c.llegoMs ? '<button class="btn btn-suave" data-acc="llego">📍 Ya llegó</button>' : ""}
        ${c.profesionalId ? '<button class="btn btn-ok" data-acc="cobrar">💵 Terminar y cobrar</button>' : ""}
      </div>
      <div class="fila-botones" style="justify-content:stretch">
        ${!c.profesionalId ? '<button class="btn btn-sec" data-acc="sintaxis">🙏 No hay taxis</button>' : ""}
        <button class="btn btn-sec" data-acc="cancelar">❌ Cancelar</button>
      </div>`
          : ""
      }`,
    onAbrir(cu, cerrar) {
      cu.querySelectorAll("[data-acc]").forEach(
        (b) =>
          (b.onclick = async () => {
            const acc = b.dataset.acc;
            if (acc === "asignar") {
              cerrar();
              asignarConductor(c);
            } else if (acc === "llego") {
              actualizar("citas", c.id, { llegoMs: Date.now() });
              cerrar();
              avisar(c, "llego");
            } else if (acc === "cobrar") {
              cerrar();
              cobrarCita(c);
            } else if (acc === "sintaxis") {
              if (await confirmar("¿Avisar al pasajero que no hay taxis disponibles y cerrar el pedido?", { si: "Sí, avisar", peligro: true })) {
                actualizar("citas", c.id, { estado: "cancelada", canceladaPor: "empresa", canceladaEn: serverTimestamp() });
                cerrar();
                avisar(c, "sinTaxis");
              }
            } else if (acc === "cancelar") {
              if (await confirmar("¿Cancelar este viaje?", { si: "Cancelar viaje", peligro: true })) {
                actualizar("citas", c.id, { estado: "cancelada", canceladaPor: "negocio", canceladaEn: serverTimestamp() });
                cerrar();
              }
            }
          })
      );
    },
  });
}

// Pedido tomado por teléfono en la central
export function formularioViaje() {
  const a = ahora();
  abrirModal({
    titulo: "Nuevo pedido de taxi",
    html: `<form id="f-viaje">
      <div class="dos-col">
        <label>Nombre del pasajero<input name="nombre" required autocomplete="off" /></label>
        <label>Teléfono / WhatsApp<input name="telefono" inputmode="tel" autocomplete="off" /></label>
      </div>
      <label>📍 Dirección de recogida<input name="recogida" required placeholder="Calle 10 # 20-30, barrio Centro" autocomplete="off" /></label>
      <label>🏁 Destino (opcional)<input name="destino" autocomplete="off" /></label>
      <div class="dos-col">
        <label>Servicio<select name="servicioId">${E.servicios.filter((s) => s.activo !== false).map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join("")}</select></label>
        <label>¿Cuándo?<select name="cuando"><option value="ya">Ahora mismo</option><option value="prog">Programar</option></select></label>
      </div>
      <div class="dos-col oculto" id="prog">
        <label>Fecha<input type="date" name="fecha" value="${a.fecha}" /></label>
        <label>Hora<input type="time" name="hora" value="${deMinutos(a.minutos)}" /></label>
      </div>
      <button class="btn btn-pri btn-bloque">Registrar pedido</button>
    </form>`,
    onAbrir(cu, cerrar) {
      const f = cu.querySelector("#f-viaje");
      f.cuando.onchange = () => cu.querySelector("#prog").classList.toggle("oculto", f.cuando.value !== "prog");
      f.onsubmit = (ev) => {
        ev.preventDefault();
        const d = datosForm(f);
        const s = E.servicios.find((x) => x.id === d.servicioId);
        const tel = soloDigitos(d.telefono);
        let cliente = tel ? E.clientes.find((c) => soloDigitos(c.telefono).slice(-10) === tel.slice(-10)) : E.clientes.find((c) => normalizar(c.nombre) === normalizar(d.nombre));
        if (!cliente) {
          const id = nuevoId("clientes");
          const data = datosCliente({ nombre: d.nombre.trim(), telefono: d.telefono, cedula: "", origen: "app", visitas: 0, totalGastado: 0, creado: serverTimestamp(), creadoMs: Date.now() });
          guardar("clientes", id, data, false);
          cliente = { id, ...data };
        }
        const prog = d.cuando === "prog";
        const ah = ahora();
        guardar(
          "citas",
          nuevoId("citas"),
          {
            tipo: "viaje",
            clienteId: cliente.id,
            clienteNombre: cliente.nombre,
            telefono: cliente.telefono || d.telefono || "",
            servicioId: s?.id || "",
            servicioNombre: s?.nombre || "Viaje",
            profesionalId: "",
            profesionalNombre: "",
            fecha: prog ? d.fecha : ah.fecha,
            hora: prog ? d.hora : deMinutos(ah.minutos),
            duracion: Number(s?.duracion) || 30,
            precio: Number(s?.precio) || 0,
            estado: "pendiente",
            origen: "app",
            recogida: d.recogida.trim(),
            destino: d.destino.trim(),
            programado: prog,
            creado: serverTimestamp(),
            creadoMs: Date.now(),
            recordatorioEnviado: false,
          },
          false
        );
        toast("Pedido registrado 🚕");
        cerrar();
      };
    },
  });
}

export { fechaCorta };
