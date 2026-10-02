// SDK de Firebase FALSO (en memoria) para probar la interfaz en un
// navegador sin conectarse a Firebase. Lo inyecta test/e2e/ui.e2e.mjs.
export const firebaseApp = `export const initializeApp = () => ({});`;

export const firebaseAuth = `
const user = { uid: "negocio1", email: "dueno@spa.com" };
export const getAuth = () => ({});
export const onAuthStateChanged = (a, fn) => { setTimeout(() => fn(user), 0); return () => {}; };
export const signInWithEmailAndPassword = async () => ({ user });
export const createUserWithEmailAndPassword = async () => ({ user });
export const sendPasswordResetEmail = async () => {};
export const signOut = async () => {};
export const browserLocalPersistence = {};
export const setPersistence = async () => {};
`;

export const firebaseMessaging = `
export const getMessaging = () => ({});
export const getToken = async () => "token-falso";
export const isSupported = async () => false;
`;

export const firebaseFirestore = `
const store = window.__fakeStore = window.__fakeStore || new Map(); // path -> data
const oyentes = new Set();
let n = 0;
const rnd = () => "id" + (++n) + Math.random().toString(36).slice(2, 7);
export const initializeFirestore = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const serverTimestamp = () => ({ __ts: true });
export const increment = (v) => ({ __inc: v });
export const collection = (db, ...p) => ({ tipo: "col", path: p.join("/") });
export const doc = (a, ...p) => {
  if (a && a.tipo === "col") return { tipo: "doc", path: a.path + "/" + (p[0] || rnd()), get id() { return this.path.split("/").pop(); } };
  const path = p.join("/");
  return { tipo: "doc", path, id: path.split("/").pop() };
};
export const where = (campo, op, valor) => ({ w: [campo, op, valor] });
export const orderBy = (campo, dir = "asc") => ({ o: [campo, dir] });
export const limit = (k) => ({ l: k });
export const query = (c, ...r) => ({ tipo: "q", path: c.path, r });
const resolver = (viejo, nuevo) => {
  const out = { ...(viejo || {}) };
  for (const [k, v] of Object.entries(nuevo)) {
    if (v && v.__inc !== undefined) out[k] = (Number(out[k]) || 0) + v.__inc;
    else if (v && v.__ts) out[k] = { toMillis: () => Date.now(), toDate: () => new Date() };
    else out[k] = v;
  }
  return out;
};
function emitir() { oyentes.forEach((o) => o()); }
function escribirDoc(ref, data, merge) {
  store.set(ref.path, resolver(merge ? store.get(ref.path) : {}, data));
}
export const setDoc = async (ref, data, opt = {}) => { escribirDoc(ref, data, opt.merge); emitir(); };
export const updateDoc = async (ref, data) => { escribirDoc(ref, data, true); emitir(); };
export const deleteDoc = async (ref) => { store.delete(ref.path); emitir(); };
export const writeBatch = () => {
  const ops = [];
  return {
    set: (r, d, o = {}) => ops.push(() => escribirDoc(r, d, o.merge)),
    update: (r, d) => ops.push(() => escribirDoc(r, d, true)),
    delete: (r) => ops.push(() => store.delete(r.path)),
    commit: async () => { ops.forEach((f) => f()); emitir(); },
  };
};
export const waitForPendingWrites = async () => {};
function ejecutar(q) {
  const base = q.path;
  const prof = base.split("/").length + 1;
  let docs = [...store.entries()].filter(([p]) => p.startsWith(base + "/") && p.split("/").length === prof)
    .map(([p, d]) => ({ id: p.split("/").pop(), data: () => d, metadata: {} }));
  for (const r of q.r || []) {
    if (r.w) {
      const [c, op, v] = r.w;
      docs = docs.filter((d) => {
        const x = d.data()[c];
        return op === "==" ? x === v : op === ">=" ? x >= v : op === "<=" ? x <= v : op === "in" ? v.includes(x) : true;
      });
    }
    if (r.o) {
      const [c, dir] = r.o;
      docs.sort((a, b) => ((a.data()[c] > b.data()[c] ? 1 : -1) * (dir === "desc" ? -1 : 1)));
    }
    if (r.l) docs = docs.slice(0, r.l);
  }
  return docs;
}
export const getDocs = async (q) => {
  const docs = ejecutar(q.tipo === "col" ? { path: q.path, r: [] } : q);
  return { docs, empty: !docs.length };
};
export const onSnapshot = (ref, ...args) => {
  const fn = args.find((a) => typeof a === "function");
  const meta = { fromCache: false, hasPendingWrites: false };
  let previos = new Set();
  const disparar = () => {
    if (ref.tipo === "doc") {
      const d = store.get(ref.path);
      fn({ exists: () => !!d, data: () => d, id: ref.id, metadata: meta });
    } else {
      const docs = ejecutar(ref.tipo === "col" ? { path: ref.path, r: [] } : ref);
      const cambios = docs.filter((d) => !previos.has(d.id)).map((d) => ({ type: "added", doc: d }));
      previos = new Set(docs.map((d) => d.id));
      fn({ docs, metadata: meta, docChanges: () => cambios });
    }
  };
  oyentes.add(disparar);
  setTimeout(disparar, 0);
  return () => oyentes.delete(disparar);
};
`;
