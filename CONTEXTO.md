# Reservo — contexto del proyecto (para continuar en otra conversación)

> Pega o sube este archivo al empezar una conversación nueva con Claude
> sobre Reservo. Resume qué es, cómo está hecho, qué se decidió y qué falta.
> Última actualización: octubre de 2026 (commit `a865f4d`).

## Qué es
**Reservo** es una app (PWA) de agenda, clientes y caja para negocios que
viven de citas o pedidos: spas, peluquerías, uñas, barberías, consultorios,
odontología, psicología, fisioterapia, veterinarias, gimnasios, tatuajes,
lavaderos, asesorías y **líneas de taxis**. Incluye un **bot de WhatsApp**
que agenda solo. Es un producto **independiente de Prestahelp** (otra app
del mismo dueño), con su propio repositorio y su propio Firebase. No se
deben mezclar.

- Dueño / equipo: Alejandro, empresa Nuvexsoft. WhatsApp del equipo: **+57 311 868 6298**.
- Modelo de negocio: **membresía de US$30 al mes**, todo incluido. Nadie se registra solo:
  la entrada dice "¿Aún no tienes una cuenta?" → WhatsApp del equipo, y el
  administrador da de alta cada negocio desde el **Panel Reservo**.

## Enlaces
- Código: https://github.com/alejandrosant-bit/ReservosApp (rama `main`)
- Hosting: Netlify, proyecto `reservoapp` → https://reservoapp.netlify.app
  (app en `/`, página web de ventas en `/sitio/`)
- Firebase: proyecto `reservoapp-d0cca` (Auth correo/clave + Firestore)
- Administrador: `alejandrosant2001@gmail.com`

## Cómo está hecho
- **Sin compilación**: JavaScript moderno (módulos ES) en `public/`. Firebase 10.14.1 desde el CDN de gstatic.
- **Funciona sin internet**: Firestore con caché persistente + service worker (`public/sw.js`).
  **Regla:** cada vez que cambie algo en `public/`, subir `VERSION` en `sw.js` (va en `reservo-v24`)
  y agregar archivos nuevos a la lista `ARCHIVOS`.
- **Servidor**: Netlify Functions en `netlify/functions/` (usan `firebase-admin`):
  - `whatsapp.mjs` → `/api/whatsapp`: webhook de WhatsApp Cloud API (Meta), firma HMAC.
  - `avisar-cliente.mjs` → `/api/avisar-cliente`: avisa al pasajero (taxis) por WhatsApp.
  - `recordatorios.mjs`: función programada cada 30 min.
  - `chat.mjs` → `/api/chat`: el dueño responde a un cliente desde la pestaña Chats (pausa el bot 1 h).
  - `admin.mjs` → `/api/admin`: Panel Reservo (listar, crear, estado, pago, nota). Solo administradores.
  - `lib/admin.mjs`: quién es administrador (`ADMIN_EMAILS` o el correo por defecto).
- **Pruebas**: `npm test` (24 pruebas unitarias). De punta a punta con Playwright y un Firebase falso:
  `PLAYWRIGHT_MODULE=$(npm root -g)/playwright/index.mjs node test/e2e/ui.e2e.mjs`
  (también `RUBRO=barberia|consultorio`, `taxi.e2e.mjs` y `admin.e2e.mjs`). Netlify corre `npm test` al compilar.

### Archivos principales (`public/`)
| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura: entrada, panel admin, app, isotipo SVG |
| `app.js` | Arranque, sesión, navegación, panel admin (`abrirPanel`, `entrarANegocio`), celebraciones |
| `datos.js` | Firebase, estado `E`, escuchas en vivo, escrituras sin esperar, `llamarAdmin` |
| `core.js` | Lógica compartida con el bot: horarios, cupos, monedas, `ESTILOS`, `sumarMeses` |
| `rubros.js` | Los 14 tipos de negocio: vocabulario (cita/turno/consulta/viaje), mensajes del bot, ejemplos |
| `bot.js` + `nlp.js` | Bot de WhatsApp (máquina de estados) y lectura de fechas/horas en español |
| `ui.js` | Ventanas, avisos, celebraciones, sonido, fondo personalizado |
| `red.js` | Red de partículas animada de la entrada |
| `vistas/*.js` | agenda, clientes, caja, cobro, reportes, ajustes (incluye asistente inicial), simulador, viajes (taxis), **chats** (bandeja de WhatsApp), **admin** |
| `chat.js` | Reglas de la bandeja de chats (historial de 60 mensajes, ventana de 24 h, pausa del bot) |
| `firebase-config.js` | Config de Firebase, `permitirRegistro = false`, `correoAdmin`, `estiloPorDefecto = "tecno"` |
| `sitio/index.html` | Página web de ventas (estilo tecnológico, precio US$30, botones a WhatsApp) |
| `marca/` | Logotipo e isotipo (burbuja de chat + calendario + chulo), colores café pastel |

### Datos en Firestore
- `negocios/{uid}`: configuración del negocio (el id es el uid del dueño). Subcolecciones:
  `servicios, profesionales, clientes, citas, movimientos, cajas, avisos, dispositivos, conversaciones, privado, bloqueos, mensajesProcesados`.
- `cuentas/{uid}`: membresía (próximo pago, pagos, nota, teléfono). Solo la escribe `/api/admin`.
- `whatsappNumeros/{phoneNumberId}` → `negocioId`.
- Fechas guardadas como texto local ("YYYY-MM-DD", "HH:MM") en la zona del negocio.
- Doble reserva: transacción con un candado por día (`bloqueos/{fecha}`).
- Reglas en `firestore.rules`: cada dueño solo ve lo suyo; `esAdmin()` (correo del administrador) ve todo.

### Bandeja de chats
- Cada conversación (`conversaciones/{telefono}`) guarda sus últimos 60 mensajes (`mensajes`), `noLeidos`,
  `pideHumano`, `ultimoClienteMs` (ventana de 24 h de WhatsApp) y `pausaHasta` (bot en pausa).
- El bot avisa al negocio cuando el cliente pide una persona o no lo entiende dos veces seguidas.
- Si el dueño responde desde Chats, el bot se pausa 1 hora en ese chat; "Devolver al bot" lo reactiva.
- Prueba de punta a punta: `node test/e2e/chats.e2e.mjs`.

## Decisiones tomadas
- Página de ventas en lenguaje sencillo, sin temas técnicos (nada de "bot", API ni cómo entiende los mensajes):
  problema → beneficios → 3 pasos → precio. No inventar testimonios ni cifras de clientes.
- Página de ventas: dos planes, **Reservo US$30** (hasta 30 citas al día) y **Reservo Pro US$45** (negocios grandes).
  No se menciona el cobro de mensajes de Meta. Firma "hecho por Nuvex". Se destacan las citas médicas, no los taxis.
  El panel maneja el plan por negocio (`cuentas/{uid}.plan`) y avisa cuando uno en el plan base supera 30 citas en un día.
- Nombre **Reservo**. Marca café pastel (Cacao #5B4033, Caramelo #B9875E, Crema #F3E7DA) con
  letra Comfortaa en el logo. Sello "hecho con reservo" en la app.
- **Diseño tecnológico oscuro** (ámbar #E3A66E + cian #5EE7D4, Space Grotesk / Inter / JetBrains Mono)
  en la entrada, en la página web y como estilo por defecto. Otros estilos elegibles en Ajustes:
  belleza (rosa), barbería (carbón y latón), salud, general (índigo) y taxi (amarillo).
- Cada tipo de negocio cambia las palabras y el tono del bot (ej. consultorio = "consulta/paciente",
  barbería = "turno", taxi = "viaje/pasajero/conductor").
- Celebraciones visuales al entrar pagos y clientes nuevos; red de seguridad para que nunca se vea un error.
- Multimoneda (COP, USD, VES…), caja con apertura/cierre y arqueo diario, semanal y mensual.
- WhatsApp: API oficial de Meta. Cada negocio conecta su propio número; Meta cobra aparte
  (1.000 respuestas gratis al mes por número).

## Configuración pendiente (la hace el dueño; requiere su cuenta)
1. Netlify: que el último despliegue quede **Published** (Deploys → Trigger deploy).
2. Netlify → Variables de entorno: `FIREBASE_SERVICE_ACCOUNT` (ya existe; verificar que sea el JSON completo),
   `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` cuando se conecte Meta.
3. Firebase Auth: correo/clave habilitado, dominio `reservoapp.netlify.app` autorizado, cuenta del
   administrador creada y, recomendado, **desactivar la creación de cuentas (registro)**.
4. Firestore → Reglas: pegar `firestore.rules` y Publicar.
5. Meta: crear la app de WhatsApp Business y apuntar el webhook a `/api/whatsapp` (ver README).
- La clave de la cuenta de servicio **nunca** se pega en un chat ni se sube a GitHub.

## Ideas para después
- Cobro automático de la membresía (Wompi / Mercado Pago) y bloqueo automático por falta de pago.
- Pagos o anticipos en línea al reservar.
- Página pública de reservas por negocio.

## Convenciones
- Todo (código, comentarios, textos) en español, tono cercano.
- Commits con autor `alejandrosant-bit <alejandrosant2001@gmail.com>`.
- Antes de subir: `npm test` y, si cambia la interfaz, las pruebas de punta a punta.
