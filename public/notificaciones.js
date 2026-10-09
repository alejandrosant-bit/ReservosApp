// Notificaciones push (Firebase Cloud Messaging).
// Registra este teléfono/computador para recibir "🔔 Nuevo cliente
// para 3:00 pm" aunque la app esté cerrada.
import { app, E, guardar } from "./datos.js";
import { ejemplosDe, vocabularioDe } from "./core.js";
import { vapidKey } from "./firebase-config.js";
import { toast } from "./ui.js";

export const pushDisponible = () => "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

async function hash(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export async function prepararPush({ silencioso = false } = {}) {
  if (!pushDisponible()) {
    if (!silencioso) toast("Este navegador no permite notificaciones. En iPhone primero agrega la app a la pantalla de inicio.", "error", 7000);
    return false;
  }
  if (silencioso && Notification.permission !== "granted") return false;
  if (!silencioso && Notification.permission !== "granted") {
    const p = await Notification.requestPermission();
    if (p !== "granted") {
      toast("Notificaciones bloqueadas. Actívalas en los ajustes del navegador.", "error", 6000);
      return false;
    }
  }
  if (!vapidKey) {
    if (!silencioso) toast("Notificaciones del sistema activadas en esta pantalla. Para recibirlas con la app cerrada falta la clave VAPID (ver README).", "ok", 7000);
    return true;
  }
  if (!navigator.onLine) return true;
  try {
    const { getMessaging, getToken, isSupported } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js");
    if (!(await isSupported())) return false;
    const registro = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registro });
    if (!token) return false;
    const id = await hash(token);
    guardar("dispositivos", id, { token, ua: navigator.userAgent.slice(0, 200), actualizado: Date.now() });
    try {
      localStorage.setItem("pushId", id);
    } catch {}
    if (!silencioso) toast("✅ Listo: este dispositivo recibirá notificaciones de citas nuevas.");
    return true;
  } catch (e) {
    console.warn("Push:", e);
    if (!silencioso) toast("No se pudo activar: " + (e.code || e.message), "error", 6000);
    return false;
  }
}

export async function probarNotificacion() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(`🔔 Nuevo ${vocabularioDe(E.config).cliente} para 3:00 pm`, {
    body: `${ejemplosDe(E.config).servicioPrincipal} · María Pérez · hoy`,
    icon: E.config.logo || "./icon-192.png",
    badge: "./icon-192.png",
    vibrate: [200, 100, 200],
    tag: "prueba",
    renotify: true,
  });
}
