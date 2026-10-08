// ============================================================
// Simulador del bot: chatea con tu bot como si fueras un cliente.
// Usa EXACTAMENTE el mismo código que el bot real de WhatsApp,
// pero con una copia de tus datos: nada de lo que hagas aquí se
// guarda ni aparece en la agenda.
// ============================================================
import { E, ahora } from "../datos.js";
import { procesarMensaje } from "../bot.js";
import { nombresParecidos, soloDigitos, vocabularioDe } from "../core.js";
import { abrirModal, esc } from "../ui.js";

function formatoWhatsapp(t) {
  return esc(t)
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/_([^_\n]+)_/g, "<i>$1</i>");
}

function crearStorePrueba(telefono) {
  const db = {
    clientes: E.clientes.map((c) => ({ ...c })),
    citas: E.citas.map((c) => ({ ...c })),
  };
  let n = 0;
  let estado = null;
  return {
    config: E.config,
    servicios: E.servicios,
    profesionales: E.profesionales,
    async getEstado() {
      return estado && structuredClone(estado);
    },
    async setEstado(_, e) {
      estado = structuredClone(e);
    },
    async getCitas(desde, hasta) {
      return db.citas.filter((c) => c.fecha >= desde && c.fecha <= hasta);
    },
    async buscarClientePorTelefono(tel) {
      return db.clientes.find((c) => soloDigitos(c.telefono).slice(-10) === tel.slice(-10) && tel) || null;
    },
    async buscarClientePorCedula(ced) {
      return db.clientes.find((c) => soloDigitos(c.cedula) === ced) || null;
    },
    async buscarClientesPorNombre(nombre) {
      return db.clientes.filter((c) => nombresParecidos(c.nombre, nombre));
    },
    async crearCliente(d) {
      const id = "prueba-cli-" + ++n;
      db.clientes.push({ id, ...d });
      return id;
    },
    async actualizarCliente(id, d) {
      Object.assign(db.clientes.find((c) => c.id === id) || {}, d);
    },
    async crearCita(d) {
      const id = "prueba-cita-" + ++n;
      db.citas.push({ id, ...d });
      return id;
    },
    async crearViaje(d) {
      const id = "prueba-viaje-" + ++n;
      db.citas.push({ id, ...d });
      return id;
    },
    async citasFuturasDeClientes(ids, desde) {
      return db.citas.filter((c) => ids.includes(c.clienteId) && c.fecha >= desde);
    },
    async citasPorIds(ids) {
      return db.citas.filter((c) => ids.includes(c.id));
    },
    async cancelarCita(id) {
      const c = db.citas.find((x) => x.id === id);
      if (c) c.estado = "cancelada";
    },
    async notificar() {},
  };
}

export function abrirSimulador() {
  abrirModal({
    titulo: "🧪 Probar el bot",
    html: `
      <p class="ayuda">Escribe como lo haría un cliente, por ejemplo: <i>“hola quiero una cita para el jueves a las 3”</i> o <i>“quiero cancelar mi cita”</i>. Es una prueba: no se guarda nada.</p>
      <label class="check peq"><input type="checkbox" id="sim-nuevo" checked /> Simular un cliente nuevo (número desconocido)</label>
      <div class="wa" id="chat"></div>
      ${vocabularioDe(E.config).viajes ? '<button type="button" class="btn btn-sec btn-chico" id="sim-ubic" style="margin-top:8px">📍 Enviar mi ubicación (prueba)</button>' : ""}
      <form class="wa-entrada" id="sim-f" style="flex-direction:row">
        <input id="sim-txt" placeholder="Escribe un mensaje" autocomplete="off" />
        <button class="btn btn-pri">➤</button>
      </form>
      <button type="button" class="btn-link peq" id="sim-reiniciar">↺ Reiniciar conversación</button>`,
    onAbrir(cu) {
      const chat = cu.querySelector("#chat");
      const input = cu.querySelector("#sim-txt");
      let store;
      let telefono;
      const reiniciar = () => {
        const nuevo = cu.querySelector("#sim-nuevo").checked;
        const conocido = E.clientes.find((c) => c.telefono);
        telefono = nuevo || !conocido ? "999" + Date.now().toString().slice(-7) : soloDigitos(conocido.telefono);
        store = crearStorePrueba(telefono);
        chat.innerHTML = `<div class="burb bot mini" style="align-self:center;background:#fff8c5">${nuevo || !conocido ? "Cliente nuevo" : "Cliente registrado: " + esc(conocido.nombre)}</div>`;
      };
      const burbuja = (html, clase) => {
        chat.insertAdjacentHTML("beforeend", `<div class="burb ${clase}">${html}</div>`);
        chat.scrollTop = chat.scrollHeight;
      };
      const enviar = async (texto, opcionId = null, etiqueta = null, ubicacion = null) => {
        burbuja(esc(etiqueta || texto), "yo");
        chat.querySelectorAll(".ops button").forEach((b) => (b.disabled = true));
        const { mensajes } = await procesarMensaje({ telefono, texto, opcionId, ubicacion, nombrePerfil: "Cliente de prueba" }, store, { ahora: ahora() });
        for (const m of mensajes) {
          burbuja(formatoWhatsapp(m.texto), "bot");
          const ops = m.botones || m.filas;
          if (ops) {
            chat.insertAdjacentHTML(
              "beforeend",
              `<div class="ops">${ops.map((o) => `<button type="button" data-id="${esc(o.id)}" data-t="${esc(o.titulo)}">${esc(o.titulo)}${o.descripcion ? `<small>${esc(o.descripcion)}</small>` : ""}</button>`).join("")}</div>`
            );
            chat.lastElementChild.querySelectorAll("button").forEach((b) => (b.onclick = () => enviar(b.dataset.t, b.dataset.id, b.dataset.t)));
          }
        }
        chat.scrollTop = chat.scrollHeight;
      };
      cu.querySelector("#sim-f").onsubmit = (ev) => {
        ev.preventDefault();
        const t = input.value.trim();
        if (!t) return;
        input.value = "";
        enviar(t);
      };
      cu.querySelector("#sim-reiniciar").onclick = reiniciar;
      cu.querySelector("#sim-ubic")?.addEventListener("click", () =>
        enviar("", null, "📍 Ubicación: Cra 7 # 32-16, Bogotá", { lat: 4.6097, lng: -74.0817, nombre: "", direccion: "Cra 7 # 32-16, Bogotá" })
      );
      cu.querySelector("#sim-nuevo").onchange = reiniciar;
      reiniciar();
      input.focus();
    },
  });
}
