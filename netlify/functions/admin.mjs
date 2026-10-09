// ============================================================
// /api/admin — Panel Reservo (solo administradores)
// Dar de alta negocios, ver cómo van y manejar la membresía.
// Crear cuentas necesita permisos de administrador de Firebase,
// por eso pasa por aquí y no por la app.
// ============================================================
import { getAuth } from "firebase-admin/auth";
import { firebase } from "./lib/firebase.mjs";
import { esAdmin } from "./lib/admin.mjs";
import { ahoraEnZona, inicioMes } from "../../public/core.js";

export const config = { path: "/api/admin" };

const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f);

const MENSAJES_AUTH = {
  "auth/email-already-exists": "Ya existe una cuenta con ese correo.",
  "auth/invalid-email": "El correo no es válido.",
  "auth/invalid-password": "La clave debe tener al menos 6 caracteres.",
  "auth/user-not-found": "Esa cuenta ya no existe.",
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let db;
  try {
    ({ db } = firebase());
  } catch (e) {
    console.error("admin", e.message);
    return json({ error: "Falta configurar FIREBASE_SERVICE_ACCOUNT en Netlify (Variables de entorno)." }, 500);
  }

  // Solo administradores
  const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  let quien;
  try {
    quien = await getAuth().verifyIdToken(idToken);
  } catch {
    return json({ error: "Sesión no válida. Vuelve a entrar." }, 401);
  }
  if (!esAdmin(quien)) return json({ error: "Solo el equipo de Reservo puede usar el panel." }, 403);

  let pedido;
  try {
    pedido = await req.json();
  } catch {
    return json({ error: "Datos inválidos" }, 400);
  }
  const auth = getAuth();
  const cuentas = db.collection("cuentas");

  try {
    switch (pedido?.accion) {
      // ---------- Lista de negocios con su actividad ----------
      case "listar": {
        const hoy = ahoraEnZona("America/Bogota").fecha;
        const desdeMes = inicioMes(hoy);
        const usuarios = [];
        let pagina;
        do {
          const r = await auth.listUsers(1000, pagina);
          usuarios.push(...r.users);
          pagina = r.pageToken;
        } while (pagina);

        const negocios = await Promise.all(
          usuarios
            .filter((u) => !esAdmin({ email: u.email }))
            .map(async (u) => {
              const raiz = db.doc(`negocios/${u.uid}`);
              const [cfg, cuenta, citasMes, clientes, ultimaCita] = await Promise.all([
                raiz.get(),
                cuentas.doc(u.uid).get(),
                raiz.collection("citas").where("fecha", ">=", desdeMes).count().get(),
                raiz.collection("clientes").count().get(),
                raiz.collection("citas").orderBy("creadoMs", "desc").limit(1).get(),
              ]);
              const c = cfg.data() || {};
              const m = cuenta.data() || {};
              return {
                uid: u.uid,
                correo: u.email || "",
                activo: !u.disabled,
                creado: Date.parse(u.metadata.creationTime) || null,
                ultimoIngreso: Date.parse(u.metadata.lastRefreshTime || u.metadata.lastSignInTime) || null,
                configurado: cfg.exists,
                nombre: c.nombre || m.nombre || "",
                rubro: c.rubro || c.tipoNegocio || m.rubro || "",
                telefono: m.telefono || c.telefono || "",
                whatsappConectado: Boolean(c.whatsappPhoneNumberId),
                citasMes: citasMes.data().count,
                clientes: clientes.data().count,
                ultimaActividad: ultimaCita.docs[0]?.data().creadoMs || null,
                proximoPago: m.proximoPago || "",
                pagos: (m.pagos || []).slice(-6),
                nota: m.nota || "",
              };
            })
        );
        negocios.sort((a, b) => (b.creado || 0) - (a.creado || 0));
        return json({ negocios, hoy });
      }

      // ---------- Dar de alta un negocio ----------
      case "crear": {
        const correo = String(pedido.correo || "").trim().toLowerCase();
        const clave = String(pedido.clave || "");
        const nombre = String(pedido.nombre || "").trim().slice(0, 80);
        const telefono = String(pedido.telefono || "").replace(/[^\d]/g, "").slice(0, 15);
        const rubro = String(pedido.rubro || "").slice(0, 30);
        if (!correoValido(correo)) return json({ error: "Escribe un correo válido." }, 400);
        if (clave.length < 6) return json({ error: "La clave debe tener al menos 6 caracteres." }, 400);
        if (!nombre) return json({ error: "Escribe el nombre del negocio." }, 400);
        const u = await auth.createUser({ email: correo, password: clave, displayName: nombre });
        const hoy = ahoraEnZona("America/Bogota").fecha;
        await cuentas.doc(u.uid).set({
          correo,
          nombre,
          telefono,
          rubro,
          creadoMs: Date.now(),
          creadoPor: quien.email,
          proximoPago: fechaValida(pedido.proximoPago) ? pedido.proximoPago : hoy,
          pagos: [],
          nota: "",
        });
        return json({ ok: true, uid: u.uid });
      }

      // ---------- Pausar o reactivar la cuenta ----------
      case "estado": {
        const uid = String(pedido.uid || "");
        const objetivo = await auth.getUser(uid);
        if (esAdmin({ email: objetivo.email })) return json({ error: "No se puede pausar una cuenta de administrador." }, 400);
        await auth.updateUser(uid, { disabled: !pedido.activo });
        // Cierra las sesiones abiertas para que la pausa se note enseguida
        if (!pedido.activo) await auth.revokeRefreshTokens(uid);
        return json({ ok: true });
      }

      // ---------- Registrar el pago de la membresía ----------
      case "pago": {
        const uid = String(pedido.uid || "");
        await auth.getUser(uid);
        if (!fechaValida(pedido.proximoPago)) return json({ error: "Fecha inválida" }, 400);
        const ref = cuentas.doc(uid);
        await db.runTransaction(async (t) => {
          const actual = (await t.get(ref)).data() || {};
          const pagos = [...(actual.pagos || [])];
          const monto = Number(pedido.monto);
          if (monto > 0) pagos.push({ fecha: ahoraEnZona("America/Bogota").fecha, monto, moneda: String(pedido.moneda || "USD").slice(0, 3), por: quien.email });
          t.set(ref, { proximoPago: pedido.proximoPago, pagos: pagos.slice(-24) }, { merge: true });
        });
        return json({ ok: true });
      }

      // ---------- Nota interna sobre el negocio ----------
      case "nota": {
        const uid = String(pedido.uid || "");
        await auth.getUser(uid);
        await cuentas.doc(uid).set({ nota: String(pedido.nota || "").slice(0, 500), telefono: String(pedido.telefono || "").replace(/[^\d]/g, "").slice(0, 15) }, { merge: true });
        return json({ ok: true });
      }

      default:
        return json({ error: "Acción desconocida" }, 400);
    }
  } catch (e) {
    console.error("admin", pedido?.accion, e.code || "", e.message);
    return json({ error: MENSAJES_AUTH[e.code] || "No se pudo completar. Intenta de nuevo." }, e.code?.startsWith("auth/") ? 400 : 500);
  }
};
