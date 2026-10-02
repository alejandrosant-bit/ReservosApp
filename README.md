# Reservo 💆‍♀️💇‍♂️

Software para **spa, peluquería, barbería y uñas**: agenda de citas, bot de
WhatsApp que agenda y cancela solo, base de datos de clientes, caja con
apertura/cierre y arqueo, reportes semanales y mensuales, multimoneda
(COP, USD, Bs y más). Funciona en **celular y computador**, se instala como
app y **trabaja sin internet**.

- **Hosting:** Netlify (la página + el bot como Netlify Functions)
- **Base de datos:** Firebase (Firestore + Authentication + Cloud Messaging)
- **WhatsApp:** API oficial de WhatsApp Business (Meta Cloud API)

---

## ¿Qué hace?

| Módulo | Qué incluye |
|---|---|
| 📅 **Agenda** | Vista por día con tira de la semana, columnas por profesional (en computador), horas libres, estados (pendiente, confirmada, atendida, cancelada, no asistió), editar/mover, sobrecupo manual, botón de WhatsApp con recordatorio listo. |
| 🤖 **Bot de WhatsApp** | Entiende “hola quiero una cita para el jueves a las 3”, “mañana en la tarde”, “el 15 de octubre a las 4 y media”, “quiero cancelar la cita que hice”. Saluda con el nombre del negocio y del asistente, responde **solo con opciones válidas** (botones y listas de WhatsApp con servicios, días abiertos y horas con cupo real). Si la hora pedida está ocupada ofrece las más cercanas. Agenda, se despide pidiendo no faltar y cancelar con 2 h de anticipación. Para cancelar pide el nombre, busca la cita y la elimina del calendario. También “mis citas” y reagendar. |
| 🔔 **Notificaciones** | Sonido + notificación tipo mensaje en el celular: **“🔔 Nuevo cliente para 3:00 pm — Manicure · María”**, aunque la app esté cerrada. Campanita con historial. |
| 👥 **Clientes** | Nombre, cédula, teléfono, correo, cumpleaños, notas (alergias, fórmula de color…). **Visitas de este mes**, visitas totales, total gastado, inasistencias, gráfica de visitas por mes, historial. Filtros: más visitas, mayor gasto, no vienen hace 60 días, cumpleañeros del mes. Exportar a Excel. |
| 💵 **Caja** | Apertura con base por moneda, cobro de citas con **pago mixto** (ej. 5 US$ en efectivo + el resto en Bs por pago móvil), vuelto automático, propinas y descuentos, ingresos y gastos manuales por categoría, **cierre con arqueo** (cuánto debe haber vs. cuánto se contó, por moneda), historial de cierres. |
| 📊 **Reportes / arqueo semanal y mensual** | Hoy, esta semana, semana pasada, este mes, mes pasado o rango libre: ingresos, gastos, utilidad, ticket promedio, inasistencia, citas por WhatsApp, clientes nuevos, ingresos por día, arqueo por moneda, cierres, métodos de pago, servicios más vendidos, **comisiones por profesional**, gastos por categoría, mejores clientes, horas más pedidas. Excel e imprimir. |
| ⚙️ **Personalización** | Nombre, logo, color, dirección; **monedas que maneja y tasas de cambio**; métodos de pago (Nequi, Daviplata, Pago móvil, Zelle, Binance…); horario por día, almuerzo y feriados; intervalos, anticipación, horas mínimas para cancelar; servicios (precio, duración, palabras clave para el bot); profesionales (servicios que hacen, comisión); **todos los mensajes del bot editables**; simulador para probar el bot. |
| 📴 **Sin internet** | Abre sin conexión mostrando lo último sincronizado (el indicador dice “Sin internet · datos de las 3:40 pm”). Todo lo que hagas se guarda en el teléfono y **se sube solo** cuando vuelve la señal. |

### Ideas tomadas de los programas exitosos

Revisamos Fresha, Booksy, AgendaPro y bots de WhatsApp para salones en
Latinoamérica. Conclusiones aplicadas:

1. **Los recordatorios automáticos son lo que más reduce las inasistencias**
   (reportes del sector hablan de 30–50 % menos “no-shows”). → Recordatorio
   automático por WhatsApp X horas antes + registro de inasistencias por cliente.
2. **En Latinoamérica el cliente ya está en WhatsApp**: más del 80 % de las
   pymes atienden por ahí, pero a mano. → Bot que agenda 24/7 con botones (sin
   que el cliente tenga que escribir bien).
3. **Políticas de cancelación claras** (Fresha/Booksy). → Regla de “cancelar
   hasta N horas antes” que el bot hace cumplir.
4. **Ficha del cliente con notas e historial** → alergias, fórmula de color,
   preferencias visibles al abrir la cita.
5. **Comisiones y reportes por profesional, POS integrado** → cobro desde la
   cita, comisiones en reportes.
6. **Simplicidad**: asistente inicial de 1 minuto con servicios de ejemplo
   según el tipo de negocio y país (moneda, métodos de pago y zona horaria).

Ideas para una siguiente versión: página pública de reservas (link en
Instagram), anticipos/depósitos para reservar, inventario de productos,
cuentas para empleados con permisos, mensajes de cumpleaños y de “te
extrañamos” automáticos, y lista de espera.

---

## Puesta en marcha (paso a paso)

### 1. Firebase (base de datos)

1. Entra a <https://console.firebase.google.com> → **Agregar proyecto** →
   crea un proyecto **NUEVO** solo para esta app, p. ej. `reservo`.
   ⚠️ No uses el proyecto de Prestahelp: son apps distintas y cada una
   tiene su propia base de datos.
2. **Authentication** → Comenzar → activa **Correo electrónico/contraseña**.
3. **Firestore Database** → Crear base de datos → modo producción → región
   `southamerica-east1` (São Paulo) o `us-east1`.
4. **Firestore → Reglas**: pega el contenido de [`firestore.rules`](firestore.rules) → **Publicar**.
5. **Configuración del proyecto (⚙️) → General → Tus apps → Web (`</>`)**:
   registra la app y copia la configuración en
   [`public/firebase-config.js`](public/firebase-config.js).
6. **Configuración del proyecto → Cloud Messaging → Certificados push web →
   Generar par de claves**. Copia la clave pública en `vapidKey` del mismo
   archivo (necesario para las notificaciones con la app cerrada).
7. **Configuración del proyecto → Cuentas de servicio → Generar nueva clave
   privada**. Se descarga un `.json`: **NO lo subas a GitHub**, se usa en el
   paso 2.

> `permitirRegistro` en `firebase-config.js`: `true` deja crear cuentas desde
> la app (cada cuenta = un negocio independiente). Pon `false` si prefieres
> crearlas tú en Authentication → Users.

### 2. Netlify (hosting + bot)

1. En Netlify: **Add new site → Import from Git** → elige el repositorio
   de GitHub **de esta app** (`reservo`, separado de Prestahelp). Es un
   sitio de Netlify nuevo, distinto al de Prestahelp.
2. No hace falta configurar nada más del build: todo lo toma de `netlify.toml`.
3. **Site configuration → Environment variables**, agrega:

| Variable | Valor |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Todo el contenido del `.json` del paso 1.7 (o el mismo en base64). |
| `WHATSAPP_VERIFY_TOKEN` | Una palabra secreta que inventes, p. ej. `spa-luna-2026`. |
| `WHATSAPP_APP_SECRET` | “Clave secreta de la app” de Meta (App → Configuración → Básica). Protege el webhook. |
| `WHATSAPP_TOKEN` | *(Opcional)* Token de WhatsApp si es un solo negocio; si no, cada negocio lo pone en la app. |
| `NEGOCIO_ID_POR_DEFECTO` | *(Opcional)* uid del negocio, si un número no está asociado. |

4. **Deploy**. Abre la URL (`https://tu-sitio.netlify.app`), crea tu cuenta
   y sigue el asistente inicial.
5. En Firebase → Authentication → **Settings → Authorized domains**, agrega
   tu dominio de Netlify.

### 3. WhatsApp Business (Meta)

1. <https://developers.facebook.com/apps> → **Crear app** → tipo **Empresa** →
   agrega el producto **WhatsApp**.
2. **WhatsApp → Configuración de la API**: agrega y verifica el número del
   negocio. Copia el **Phone number ID**.
   *(El número no puede estar usándose al mismo tiempo en la app normal de
   WhatsApp Business del celular.)*
3. Crea un **token permanente**: business.facebook.com → Configuración del
   negocio → Usuarios del sistema → Agregar (admin) → Generar token → permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`.
4. **WhatsApp → Configuración → Webhook**:
   - URL de devolución: `https://tu-sitio.netlify.app/api/whatsapp`
   - Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`
   - Suscribirse al campo **messages**.
5. En la app: **Ajustes → Conectar WhatsApp** → pega el Phone number ID y el token.
6. Escribe “hola” al número desde otro celular. 🎉

**Recordatorios:** WhatsApp solo deja escribirle libremente a un cliente
dentro de las 24 h siguientes a su último mensaje. Para recordatorios de citas
agendadas con más anticipación, crea en Meta (WhatsApp Manager → Plantillas)
una plantilla de categoría *Utilidad*, por ejemplo:

```
Hola {{1}}, te recordamos tu cita de {{2}} {{3}} a las {{4}}. Si no puedes asistir responde CANCELAR.
```

y escribe su nombre en **Ajustes → Bot de WhatsApp → Plantilla de recordatorio**.
La función `recordatorios` corre sola cada 30 minutos.

### 4. Instalar en los celulares

- **Android:** Chrome → menú ⋮ → *Instalar aplicación*.
- **iPhone:** Safari → Compartir → *Agregar a pantalla de inicio* (necesario
  en iPhone para recibir notificaciones).
- Luego en **Ajustes → Notificaciones → Activar** en cada dispositivo que
  deba sonar.

---

## Cómo está hecho (para desarrolladores)

```
(raíz del repositorio)
├── public/                    ← la app (sin compilación, módulos ES)
│   ├── core.js                ← horarios, cupos, monedas, mensajes (compartido con el bot)
│   ├── nlp.js                 ← entiende español: días, horas, servicios, intenciones
│   ├── bot.js                 ← conversación del bot (misma lógica en servidor y simulador)
│   ├── datos.js               ← Firebase con caché offline y estado de sincronización
│   ├── app.js, ui.js, notificaciones.js
│   ├── vistas/                ← agenda, clientes, caja, cobro, reportes, ajustes, simulador
│   └── sw.js                  ← service worker: offline + push
├── netlify/functions/
│   ├── whatsapp.mjs           ← webhook /api/whatsapp
│   ├── recordatorios.mjs      ← función programada cada 30 min
│   └── lib/                   ← Firestore (admin), envío a Meta, notificaciones FCM
├── firestore.rules
└── test/                      ← pruebas del bot y de la interfaz
```

**Datos (Firestore):** `negocios/{uid}` (configuración) y sus subcolecciones
`servicios`, `profesionales`, `clientes`, `citas`, `movimientos`, `cajas`,
`avisos`, `dispositivos`, `conversaciones`, `privado`. `whatsappNumeros/{phoneNumberId}`
asocia cada número de WhatsApp con su negocio (varios negocios pueden usar
el mismo despliegue).

**Fechas:** se guardan como texto local del negocio (`fecha: "2026-10-08"`,
`hora: "15:00"`) usando la zona horaria configurada, así el servidor (UTC) y
los teléfonos siempre coinciden.

**Doble reserva:** el bot crea la cita dentro de una transacción que vuelve a
revisar el cupo; si dos clientes piden la misma hora a la vez, solo uno la obtiene.

**Pruebas:**

```bash
npm install
npm test                         # lógica del bot, NLP y cupos (corre también en cada deploy)
node test/e2e/ui.e2e.mjs         # interfaz completa en Chromium con Firebase simulado (requiere playwright)
```
