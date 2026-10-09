// Guarda en la conversación los mensajes que van y vienen, para
// que el dueño los vea en la pestaña "Chats" de la app.
import { firebase } from "./firebase.mjs";
import { agregarMensajes } from "../../../public/chat.js";

export const refConversacion = (negocioId, telefono) => firebase().db.doc(`negocios/${negocioId}/conversaciones/${telefono}`);

// nuevos: mensajes ya armados con mensajeDeChat(). extra: otros
// campos de la conversación (pausa, nombre...). En transacción,
// porque dos mensajes pueden llegar casi al mismo tiempo.
export async function registrarMensajes(negocioId, telefono, nuevos, extra = {}) {
  const { db, FieldValue } = firebase();
  const ref = refConversacion(negocioId, telefono);
  await db.runTransaction(async (t) => {
    const previo = (await t.get(ref)).data() || {};
    const delCliente = nuevos.filter((m) => m.de === "cliente");
    const respuesta = [...nuevos].reverse().find((m) => m.de !== "cliente");
    const cambios = {
      mensajes: agregarMensajes(previo.mensajes, nuevos),
      actualizado: FieldValue.serverTimestamp(),
      actualizadoMs: Date.now(),
    };
    if (delCliente.length) {
      cambios.ultimoClienteMs = Date.now();
      cambios.noLeidos = (Number(previo.noLeidos) || 0) + delCliente.length;
      cambios.ultimoMensaje = delCliente.at(-1).texto.slice(0, 200);
    }
    if (respuesta) cambios.ultimaRespuesta = respuesta.texto.slice(0, 300);
    t.set(ref, { ...cambios, ...extra }, { merge: true });
  });
}
