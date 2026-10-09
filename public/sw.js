// ============================================================
// Service worker
// 1) Guarda el "cascarón" de la app (HTML, CSS, JS y el SDK de
//    Firebase) para que abra SIN INTERNET. Los datos los guarda
//    Firestore aparte (IndexedDB) y se sincronizan solos.
// 2) Recibe las notificaciones push ("🔔 Nuevo cliente para
//    3:00 pm") aunque la app esté cerrada.
// Al cambiar cualquier archivo, sube el número de VERSION.
// ============================================================
const VERSION = "reservo-v12";
const SDK = "https://www.gstatic.com/firebasejs/10.14.1";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./datos.js",
  "./ui.js",
  "./core.js",
  "./nlp.js",
  "./bot.js",
  "./notificaciones.js",
  "./firebase-config.js",
  "./vistas/agenda.js",
  "./vistas/clientes.js",
  "./vistas/caja.js",
  "./vistas/cobro.js",
  "./vistas/reportes.js",
  "./vistas/ajustes.js",
  "./vistas/simulador.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest-barber.json",
  "./icon-barber-192.png",
  "./icon-barber-512.png",
  "./manifest-reservo.json",
  "./icon-reservo-192.png",
  "./icon-reservo-512.png",
  "./rubros.js",
  "./vistas/viajes.js",
  `${SDK}/firebase-app.js`,
  `${SDK}/firebase-auth.js`,
  `${SDK}/firebase-firestore.js`,
  `${SDK}/firebase-messaging.js`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // Uno por uno: si un archivo falla, los demás igual quedan guardados
      Promise.allSettled(ARCHIVOS.map((a) => cache.add(new Request(a, { cache: "reload" })).catch((e) => console.warn("No se cacheó", a, e))))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((n) => Promise.all(n.filter((x) => x !== VERSION).map((x) => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Datos de Firebase y funciones de Netlify: siempre a la red
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) return;
  if (/googleapis\.com|firebaseio\.com|firebaseinstallations|fcmregistrations|identitytoolkit|securetoken/.test(url.hostname)) return;

  // Abrir la app: red primero (para tener la última versión) y si
  // no hay internet, la copia guardada.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(VERSION).then((c) => c.put("./index.html", copia));
          return r;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Archivos propios: copia guardada al instante y se actualiza en
  // segundo plano (stale-while-revalidate). SDK de Firebase: caché.
  event.respondWith(
    caches.match(req).then((guardado) => {
      const deRed = fetch(req)
        .then((r) => {
          if (r && r.ok && (url.origin === location.origin || url.href.startsWith(SDK))) {
            const copia = r.clone();
            caches.open(VERSION).then((c) => c.put(req, copia));
          }
          return r;
        })
        .catch(() => guardado);
      return guardado || deRed;
    })
  );
});

// ------------------------------------------------------------
// Notificaciones push (enviadas por la función de Netlify vía
// Firebase Cloud Messaging como mensaje "solo datos")
// ------------------------------------------------------------
self.addEventListener("push", (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = { data: { titulo: "Reservo", cuerpo: event.data?.text() || "" } };
  }
  const d = p.data || p.notification || {};
  const titulo = d.titulo || d.title || "🔔 Nueva cita";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: d.cuerpo || d.body || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag: d.citaId || undefined,
      renotify: true,
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: false,
      data: { url: d.url || "./#agenda" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || "./#agenda";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ("focus" in v) {
          v.postMessage({ tipo: "abrir", url: destino });
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
