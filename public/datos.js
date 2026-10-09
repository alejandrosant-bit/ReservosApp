// ============================================================
// Datos: Firebase (Auth + Firestore) con funcionamiento offline.
// - Firestore guarda TODO en el teléfono (IndexedDB). Sin internet
//   la app lee y escribe en esa copia local y sube los cambios sola
//   cuando vuelve la señal.
// - Las escrituras NUNCA se esperan con "await" en la interfaz:
//   sin internet esa promesa no termina hasta reconectar, y la app
//   parecería congelada.
// ============================================================
import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  writeBatch,
  waitForPendingWrites,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { conDefectos, ahoraEnZona, sumarDias, inicioMes, normalizar, soloDigitos } from "./core.js";

export const configurado = !String(firebaseConfig.apiKey).startsWith("TU_");

export const app = configurado ? initializeApp(firebaseConfig) : null;
export const auth = configurado ? getAuth(app) : null;
export const db = configurado
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : null;
if (auth) setPersistence(auth, browserLocalPersistence).catch(() => {});

export { serverTimestamp, increment, where, orderBy, limit, query };

// ------------------------------------------------------------
// Estado en memoria (lo que pinta la interfaz)
// ------------------------------------------------------------
export const E = {
  uid: null,
  usuario: null,
  config: conDefectos({}),
  configExiste: null,
  servicios: [],
  profesionales: [],
  clientes: [],
  citas: [],
  movimientos: [],
  cajas: [],
  avisos: [],
  adminViendo: null, // negocio que el administrador está revisando
  desdeCargado: null, // fecha desde la que hay citas/movimientos en memoria
  cargado: {},
};

const oyentes = new Set();
export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
function avisar(que) {
  oyentes.forEach((fn) => {
    try {
      fn(que);
    } catch (e) {
      console.error(e);
    }
  });
}

export const hoy = () => ahoraEnZona(E.config.zonaHoraria).fecha;
export const ahora = () => ahoraEnZona(E.config.zonaHoraria);

// ------------------------------------------------------------
// Referencias
// ------------------------------------------------------------
export const refNegocio = () => doc(db, "negocios", E.uid);
export const col = (nombre) => collection(db, "negocios", E.uid, nombre);
export const refDoc = (nombre, id) => doc(db, "negocios", E.uid, nombre, id);
export const nuevoId = (nombre) => doc(col(nombre)).id;

// ------------------------------------------------------------
// Estado de sincronización
// ------------------------------------------------------------
export const sync = {
  enLinea: navigator.onLine,
  pendientes: 0,
  ultima: (() => {
    try {
      return Number(localStorage.getItem("ultimaSync") || 0);
    } catch {
      return 0;
    }
  })(),
};

function marcarSincronizado() {
  sync.ultima = Date.now();
  try {
    localStorage.setItem("ultimaSync", String(sync.ultima));
  } catch {}
  avisar("sync");
}

window.addEventListener("online", () => {
  sync.enLinea = true;
  avisar("sync");
});
window.addEventListener("offline", () => {
  sync.enLinea = false;
  avisar("sync");
});

// Envuelve cada escritura: no la espera, pero lleva la cuenta de
// cuántos cambios faltan por subir y avisa errores.
export function escribir(promesa, { silencioso = false } = {}) {
  sync.pendientes++;
  avisar("sync");
  promesa
    .catch((e) => {
      console.error(e);
      if (!silencioso) import("./ui.js").then(({ toast }) => toast("No se pudo guardar: " + (e.code || e.message), "error", 6000));
    })
    .finally(() => {
      sync.pendientes = Math.max(0, sync.pendientes - 1);
      if (!sync.pendientes) marcarSincronizado();
      else avisar("sync");
    });
}

export function guardar(nombre, id, data, merge = true) {
  escribir(setDoc(refDoc(nombre, id), data, { merge }));
}
export function actualizar(nombre, id, data) {
  escribir(updateDoc(refDoc(nombre, id), data));
}
export function borrar(nombre, id) {
  escribir(deleteDoc(refDoc(nombre, id)));
}
export function guardarConfig(data) {
  escribir(setDoc(refNegocio(), { ...data, actualizado: serverTimestamp() }, { merge: true }));
  // Vista optimista inmediata
  E.config = conDefectos({ ...E.config, ...data });
  avisar("config");
}
export function lote() {
  const b = writeBatch(db);
  return {
    set: (nombre, id, data, merge = true) => b.set(refDoc(nombre, id), data, { merge }),
    update: (nombre, id, data) => b.update(refDoc(nombre, id), data),
    delete: (nombre, id) => b.delete(refDoc(nombre, id)),
    setRaw: (ref, data, merge = true) => b.set(ref, data, { merge }),
    commit: () => escribir(b.commit()),
  };
}

export async function esperarSubida() {
  if (db) await waitForPendingWrites(db);
}

// ------------------------------------------------------------
// Sesión
// ------------------------------------------------------------
export const sesion = {
  entrar: (email, clave) => signInWithEmailAndPassword(auth, email, clave),
  registrar: (email, clave) => createUserWithEmailAndPassword(auth, email, clave),
  recuperar: (email) => sendPasswordResetEmail(auth, email),
  salir: () => signOut(auth),
  observar: (fn) => onAuthStateChanged(auth, fn),
};

// ------------------------------------------------------------
// Suscripciones en vivo
// ------------------------------------------------------------
let desuscribir = [];

const aLista = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// Momento en que abrió la app: solo se celebran registros creados
// después (con un margen por si el reloj del servidor va adelantado).
const ARRANQUE = Date.now() - 60000;

function escuchar(q, nombre, transformar = (x) => x, alAgregar = null) {
  const conocidos = new Set();
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      const lista = aLista(snap);
      if (alAgregar) {
        for (const d of lista) {
          if (conocidos.has(d.id)) continue;
          conocidos.add(d.id);
          // Un registro viejo que llega tarde desde la nube no se celebra
          if (E.cargado[nombre] && Number(d.creadoMs) >= ARRANQUE) {
            try {
              alAgregar(d);
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
      E[nombre] = transformar(lista);
      E.cargado[nombre] = true;
      if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) marcarSincronizado();
      avisar(nombre);
    },
    (err) => console.error(nombre, err)
  );
}

export function iniciarDatos(uid, { alNuevoAviso, alNuevoCliente, alNuevoMovimiento } = {}) {
  detenerDatos();
  // Si cambia de negocio (panel del administrador), no se mezclan datos
  if (E.uid !== uid) {
    E.config = conDefectos({});
    E.configExiste = null;
    for (const k of ["servicios", "profesionales", "clientes", "citas", "movimientos", "cajas", "avisos"]) E[k] = [];
  }
  E.uid = uid;
  E.cargado = {};
  const h = ahoraEnZona(E.config.zonaHoraria).fecha;
  // En memoria: desde el 1 del mes anterior en adelante. Los
  // reportes de fechas más antiguas se consultan aparte.
  E.desdeCargado = inicioMes(sumarDias(inicioMes(h), -1));

  desuscribir.push(
    onSnapshot(refNegocio(), { includeMetadataChanges: true }, (snap) => {
      E.configExiste = snap.exists();
      E.config = conDefectos(snap.data() || {});
      avisar("config");
    })
  );
  const porNombre = (a, b) => (a.orden ?? 99) - (b.orden ?? 99) || String(a.nombre).localeCompare(String(b.nombre));
  desuscribir.push(escuchar(col("servicios"), "servicios", (l) => l.sort(porNombre)));
  desuscribir.push(escuchar(col("profesionales"), "profesionales", (l) => l.sort(porNombre)));
  desuscribir.push(escuchar(col("clientes"), "clientes", (l) => l.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))), alNuevoCliente));
  desuscribir.push(escuchar(query(col("citas"), where("fecha", ">=", E.desdeCargado)), "citas"));
  desuscribir.push(escuchar(query(col("movimientos"), where("fecha", ">=", E.desdeCargado)), "movimientos", undefined, alNuevoMovimiento));
  desuscribir.push(escuchar(query(col("cajas"), orderBy("abiertaMs", "desc"), limit(120)), "cajas"));

  // Avisos (los escribe el bot): suenan solo los que llegan
  // después de abrir la app.
  let primeraCarga = true;
  desuscribir.push(
    onSnapshot(query(col("avisos"), orderBy("creado", "desc"), limit(40)), (snap) => {
      E.avisos = aLista(snap);
      if (!primeraCarga) {
        snap.docChanges().forEach((ch) => {
          if (ch.type === "added" && !ch.doc.metadata.hasPendingWrites) alNuevoAviso?.({ id: ch.doc.id, ...ch.doc.data() });
        });
      }
      primeraCarga = false;
      avisar("avisos");
    })
  );
}

export function detenerDatos() {
  desuscribir.forEach((f) => f());
  desuscribir = [];
}

// Consulta de un rango de fechas (para reportes de meses viejos).
// Usa la caché local si no hay internet.
export async function rango(nombre, desde, hasta) {
  if (desde >= E.desdeCargado) return E[nombre].filter((x) => x.fecha >= desde && x.fecha <= hasta);
  const snap = await getDocs(query(col(nombre), where("fecha", ">=", desde), where("fecha", "<=", hasta)));
  return aLista(snap);
}

export async function citasDeCliente(clienteId) {
  const snap = await getDocs(query(col("citas"), where("clienteId", "==", clienteId)));
  return aLista(snap).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
}

export async function listarColeccion(nombre, ...restricciones) {
  return aLista(await getDocs(query(col(nombre), ...restricciones)));
}

// ------------------------------------------------------------
// Ayudas de dominio
// ------------------------------------------------------------
export const claveTelefono = (t) => soloDigitos(t).slice(-10);

export function datosCliente(data) {
  return {
    ...data,
    nombreNorm: normalizar(data.nombre),
    telefonoClave: claveTelefono(data.telefono),
    cedula: soloDigitos(data.cedula),
  };
}

export const cajaAbierta = () => E.cajas.find((c) => c.estado === "abierta") || null;

export { doc, setDoc, deleteDoc, collection };

// Le avisa al cliente por WhatsApp un cambio de su servicio (ej. "tu
// taxi va en camino"). Necesita internet y WhatsApp conectado.
export async function avisarCliente(citaId, evento) {
  if (!navigator.onLine) throw new Error("Sin internet: el aviso al cliente no se pudo enviar.");
  const token = await auth?.currentUser?.getIdToken?.();
  const r = await fetch("/api/avisar-cliente", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
    body: JSON.stringify({ citaId, evento, negocioId: E.uid }),
  });
  let cuerpo = {};
  try {
    cuerpo = await r.json();
  } catch {}
  if (!r.ok) throw new Error(cuerpo.error || "No se pudo avisar al cliente");
  return cuerpo;
}

// Panel Reservo (solo administradores): alta de negocios, actividad
// y membresía. Lo atiende la función /api/admin.
export async function llamarAdmin(accion, datos = {}) {
  if (!navigator.onLine) throw new Error("Sin internet: el panel necesita conexión.");
  const token = await auth?.currentUser?.getIdToken?.();
  let r;
  try {
    r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}` },
      body: JSON.stringify({ accion, ...datos }),
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor.");
  }
  let cuerpo = {};
  try {
    cuerpo = await r.json();
  } catch {}
  if (!r.ok) throw new Error(cuerpo.error || "El servidor no respondió. ¿Ya se desplegó en Netlify?");
  return cuerpo;
}
