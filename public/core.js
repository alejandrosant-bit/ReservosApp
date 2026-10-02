// ============================================================
// Agenda Spa — lógica compartida (sin dependencias)
// La usan tanto la app del navegador como el bot de WhatsApp
// (Netlify Functions), así los cupos que ve el dueño en el
// calendario y los que ofrece el bot salen del MISMO cálculo.
// ============================================================

// ------------------------------------------------------------
// Monedas
// ------------------------------------------------------------
export const MONEDAS = {
  COP: { nombre: "Peso colombiano", simbolo: "$", locale: "es-CO", decimales: 0 },
  USD: { nombre: "Dólar estadounidense", simbolo: "US$", locale: "en-US", decimales: 2 },
  VES: { nombre: "Bolívar venezolano", simbolo: "Bs.", locale: "es-VE", decimales: 2 },
  EUR: { nombre: "Euro", simbolo: "€", locale: "es-ES", decimales: 2 },
  MXN: { nombre: "Peso mexicano", simbolo: "$", locale: "es-MX", decimales: 2 },
  PEN: { nombre: "Sol peruano", simbolo: "S/", locale: "es-PE", decimales: 2 },
  CLP: { nombre: "Peso chileno", simbolo: "$", locale: "es-CL", decimales: 0 },
  ARS: { nombre: "Peso argentino", simbolo: "$", locale: "es-AR", decimales: 2 },
  DOP: { nombre: "Peso dominicano", simbolo: "RD$", locale: "es-DO", decimales: 2 },
  PAB: { nombre: "Balboa panameño", simbolo: "B/.", locale: "es-PA", decimales: 2 },
  GTQ: { nombre: "Quetzal", simbolo: "Q", locale: "es-GT", decimales: 2 },
  BRL: { nombre: "Real brasileño", simbolo: "R$", locale: "pt-BR", decimales: 2 },
};

export function formatoMoneda(monto, moneda = "COP") {
  const info = MONEDAS[moneda] || { simbolo: moneda, locale: "es-CO", decimales: 2 };
  const n = Number(monto) || 0;
  const texto = n.toLocaleString(info.locale, {
    minimumFractionDigits: info.decimales,
    maximumFractionDigits: info.decimales,
  });
  return `${info.simbolo} ${texto}`;
}

// Las tasas se guardan como "cuántas unidades de la moneda X vale
// 1 unidad de la moneda principal". Ej. principal COP:
// { USD: 0.00025 } sería incómodo, por eso guardamos al revés:
// tasas[X] = cuánto vale 1 X en la moneda principal
// (1 USD = 4000 COP  →  tasas.USD = 4000). Es como lo piensa el dueño.
export function aMonedaBase(monto, moneda, config) {
  const base = config.monedaPrincipal || "COP";
  if (moneda === base) return Number(monto) || 0;
  const tasa = Number(config.tasas?.[moneda]) || 0;
  return (Number(monto) || 0) * tasa;
}

export function desdeMonedaBase(montoBase, moneda, config) {
  const base = config.monedaPrincipal || "COP";
  if (moneda === base) return Number(montoBase) || 0;
  const tasa = Number(config.tasas?.[moneda]) || 0;
  return tasa ? (Number(montoBase) || 0) / tasa : 0;
}

// ------------------------------------------------------------
// Fechas y horas — siempre como texto local del negocio:
// fecha "YYYY-MM-DD" y hora "HH:MM". Así no hay líos de zona
// horaria entre el teléfono, el servidor de Netlify (UTC) y
// Firestore.
// ------------------------------------------------------------
export const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function sumarDias(fechaISO, dias) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return `${f.getUTCFullYear()}-${pad2(f.getUTCMonth() + 1)}-${pad2(f.getUTCDate())}`;
}

export function diaSemana(fechaISO) {
  const [y, m, d] = fechaISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function diferenciaDias(desdeISO, hastaISO) {
  const a = Date.parse(desdeISO + "T00:00:00Z");
  const b = Date.parse(hastaISO + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

export function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

export function deMinutos(min) {
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
}

// "15:00" → "3:00 pm"
export function hora12(hhmm) {
  const min = aMinutos(hhmm);
  let h = Math.floor(min / 60);
  const m = min % 60;
  const sufijo = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${pad2(m)} ${sufijo}`;
}

// "2026-10-08" → "jueves 8 de octubre"
export function fechaLarga(fechaISO) {
  const [, m, d] = fechaISO.split("-").map(Number);
  return `${DIAS[diaSemana(fechaISO)]} ${d} de ${MESES[m - 1]}`;
}

export function fechaCorta(fechaISO) {
  const [, m, d] = fechaISO.split("-").map(Number);
  return `${DIAS_CORTOS[diaSemana(fechaISO)]} ${d}/${pad2(m)}`;
}

// Fecha y minuto actual EN LA ZONA HORARIA DEL NEGOCIO, sin importar
// dónde corra el código.
export function ahoraEnZona(zona = "America/Bogota", ahora = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ahora);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

export function inicioSemana(fechaISO) {
  // Semana de lunes a domingo
  const dia = diaSemana(fechaISO);
  return sumarDias(fechaISO, dia === 0 ? -6 : 1 - dia);
}

export function inicioMes(fechaISO) {
  return fechaISO.slice(0, 8) + "01";
}

export function finMes(fechaISO) {
  const [y, m] = fechaISO.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad2(m)}-${pad2(ultimo)}`;
}

// ------------------------------------------------------------
// Texto
// ------------------------------------------------------------
export function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function soloDigitos(t) {
  return String(t || "").replace(/\D/g, "");
}

// Distancia de Levenshtein para tolerar errores de escritura
// ("manicur", "pedicure", "masage").
export function distancia(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// ¿Se parecen dos nombres de persona? Compara palabra por palabra:
// "maria perez" ~ "María Pérez Gómez", "jose" ~ "José Luis".
export function nombresParecidos(a, b) {
  const pa = normalizar(a).split(" ").filter(Boolean);
  const pb = normalizar(b).split(" ").filter(Boolean);
  if (!pa.length || !pb.length) return false;
  const corta = pa.length <= pb.length ? pa : pb;
  const larga = corta === pa ? pb : pa;
  return corta.every((w) => larga.some((x) => x === w || (w.length >= 4 && distancia(w, x) <= 1)));
}

// ------------------------------------------------------------
// Horarios y cupos
// ------------------------------------------------------------
// horario: { "1": { abierto: true, desde: "08:00", hasta: "18:00" }, ... }  (clave = día de la semana 0-6)
export const HORARIO_POR_DEFECTO = {
  0: { abierto: false, desde: "09:00", hasta: "14:00" },
  1: { abierto: true, desde: "08:00", hasta: "18:00" },
  2: { abierto: true, desde: "08:00", hasta: "18:00" },
  3: { abierto: true, desde: "08:00", hasta: "18:00" },
  4: { abierto: true, desde: "08:00", hasta: "18:00" },
  5: { abierto: true, desde: "08:00", hasta: "18:00" },
  6: { abierto: true, desde: "08:00", hasta: "16:00" },
};

export function horarioDelDia(config, fechaISO) {
  if ((config.diasCerrados || []).includes(fechaISO)) return null;
  const h = (config.horario || HORARIO_POR_DEFECTO)[diaSemana(fechaISO)];
  if (!h || !h.abierto) return null;
  return { desde: aMinutos(h.desde), hasta: aMinutos(h.hasta) };
}

export const ESTADOS_QUE_OCUPAN = ["pendiente", "confirmada", "completada"];

// Profesionales que pueden hacer un servicio. Lista de servicios
// vacía = hace todos.
export function profesionalesPara(servicioId, profesionales) {
  return (profesionales || []).filter(
    (p) => p.activo !== false && (!p.servicios || !p.servicios.length || p.servicios.includes(servicioId))
  );
}

function seCruzan(iniA, finA, iniB, finB) {
  return iniA < finB && iniB < finA;
}

// Devuelve los profesionales libres en [inicio, inicio+duracion).
// Si el negocio no registró profesionales, se usa "capacidad"
// (cuántas citas simultáneas atiende) con profesionales virtuales.
export function profesionalesLibres({ fecha, inicio, duracion, servicioId, citas, profesionales, config, ignorarCitaId }) {
  const fin = inicio + duracion;
  const ocupadas = (citas || []).filter(
    (c) =>
      c.fecha === fecha &&
      c.id !== ignorarCitaId &&
      ESTADOS_QUE_OCUPAN.includes(c.estado || "pendiente") &&
      seCruzan(inicio, fin, aMinutos(c.hora), aMinutos(c.hora) + (Number(c.duracion) || 30))
  );

  const candidatos = profesionalesPara(servicioId, profesionales);
  if ((profesionales || []).filter((p) => p.activo !== false).length) {
    return candidatos.filter((p) => !ocupadas.some((c) => c.profesionalId === p.id));
  }
  const capacidad = Math.max(1, Number(config.capacidad) || 1);
  const libres = capacidad - ocupadas.length;
  return Array.from({ length: Math.max(0, libres) }, (_, i) => ({ id: "", nombre: "", virtual: i }));
}

// Horas disponibles para un servicio en una fecha.
export function horasDisponibles({ fecha, servicio, citas, profesionales, config, ahora }) {
  const h = horarioDelDia(config, fecha);
  if (!h) return [];
  const paso = Number(config.intervalo) || 30;
  const duracion = Number(servicio?.duracion) || 30;
  const anticipacion = Number(config.anticipacionMinutos ?? 60);
  const hoy = ahora || ahoraEnZona(config.zonaHoraria);
  if (fecha < hoy.fecha) return [];

  const resultado = [];
  for (let t = h.desde; t + duracion <= h.hasta; t += paso) {
    if (fecha === hoy.fecha && t < hoy.minutos + anticipacion) continue;
    if (config.descanso?.desde && config.descanso?.hasta) {
      if (seCruzan(t, t + duracion, aMinutos(config.descanso.desde), aMinutos(config.descanso.hasta))) continue;
    }
    const libres = profesionalesLibres({ fecha, inicio: t, duracion, servicioId: servicio?.id, citas, profesionales, config });
    if (libres.length) resultado.push(deMinutos(t));
  }
  return resultado;
}

// Próximos días en que el negocio abre y queda al menos un cupo.
export function diasConCupo({ servicio, citas, profesionales, config, ahora, cantidad = 7, maxDias = 30 }) {
  const hoy = ahora || ahoraEnZona(config.zonaHoraria);
  const dias = [];
  for (let i = 0; i < maxDias && dias.length < cantidad; i++) {
    const fecha = sumarDias(hoy.fecha, i);
    const horas = horasDisponibles({ fecha, servicio, citas, profesionales, config, ahora: hoy });
    if (horas.length) dias.push({ fecha, horas });
  }
  return dias;
}

// Las N horas libres más cercanas a una hora pedida.
export function horasCercanas(horas, pedidaHHMM, n = 3) {
  const objetivo = aMinutos(pedidaHHMM);
  return [...horas].sort((a, b) => Math.abs(aMinutos(a) - objetivo) - Math.abs(aMinutos(b) - objetivo)).slice(0, n).sort();
}

// ¿Todavía se puede cancelar? (regla de las N horas antes)
export function puedeCancelar(cita, config, ahora) {
  const hoy = ahora || ahoraEnZona(config.zonaHoraria);
  const horas = Number(config.horasMinCancelacion ?? 2);
  const minutosHasta = diferenciaDias(hoy.fecha, cita.fecha) * 1440 + aMinutos(cita.hora) - hoy.minutos;
  return minutosHasta >= horas * 60;
}

// ------------------------------------------------------------
// Plantillas de mensajes del bot (el dueño las puede cambiar)
// Variables: {negocio} {asistente} {cliente} {servicio} {fecha}
// {hora} {horas_cancelacion} {direccion} {profesional}
// ------------------------------------------------------------
export const MENSAJES_POR_DEFECTO = {
  bienvenida: "¡Hola{cliente_coma}! 👋 Bienvenid@ a *{negocio}*. Soy {asistente}, tu asistente virtual. ¿En qué te puedo ayudar?",
  pedirNombre: "Para atenderte mejor, ¿me dices tu *nombre y apellido*?",
  pedirCedula: "Gracias, {cliente}. ¿Me regalas tu número de *cédula*? (solo números)",
  elegirServicio: "¿Qué servicio deseas? Elige una opción 👇",
  elegirDia: "¿Qué día te queda mejor para tu *{servicio}*?",
  elegirHora: "Estas son las horas disponibles el *{fecha}* 👇",
  horaDisponible: "¡Buenas noticias! El *{fecha}* a las *{hora}* hay cupo para *{servicio}*. ¿La confirmo?",
  horaOcupada: "Lo siento, el *{fecha}* a las *{hora}* ya no hay cupo 😕. Estas son las horas más cercanas disponibles:",
  diaCerrado: "Ese día no tenemos atención 🙏. Estos son los próximos días con cupo:",
  confirmada:
    "✅ ¡Listo, {cliente}! Tu cita quedó agendada:\n\n💆 *{servicio}*\n📅 {fecha}\n🕒 {hora}{profesional_linea}\n📍 {direccion}\n\nPor favor *no faltes* a tu cita. Si no puedes asistir, escríbenos para cancelar *al menos {horas_cancelacion} horas antes*, por ejemplo: _\"quiero cancelar mi cita\"_.\n\n¡Te esperamos! 💖",
  pedirNombreCancelar: "Claro, te ayudo a cancelar. ¿A nombre de quién está la cita? (nombre y apellido)",
  elegirCitaCancelar: "Encontré estas citas a nombre de *{cliente}*. ¿Cuál deseas cancelar?",
  confirmarCancelar: "¿Seguro que deseas cancelar tu cita de *{servicio}* del *{fecha}* a las *{hora}*?",
  cancelada: "Tu cita de *{servicio}* del {fecha} a las {hora} fue *cancelada* ✅. Gracias por avisarnos con tiempo. Cuando quieras agendar de nuevo, escríbenos. 😊",
  sinCitas: "No encontré citas próximas a nombre de *{cliente}* 🤔. Revisa que el nombre esté bien escrito o escríbelo como lo diste al agendar.",
  muyTarde:
    "Tu cita de *{servicio}* es hoy a las *{hora}* y ya faltan menos de {horas_cancelacion} horas, así que no se puede cancelar por aquí 🙏. Por favor comunícate directamente con el negocio.",
  despedida: "¡Con gusto! Que tengas un lindo día 🌸",
  noEntendi: "Disculpa, no te entendí bien 🙈. Por favor elige una de las opciones 👇",
  recordatorio: "⏰ Hola {cliente}, te recordamos tu cita de *{servicio}* hoy {fecha} a las *{hora}* en {negocio}. ¡Te esperamos! Si no puedes asistir responde *cancelar*.",
  fueraDeServicio: "En este momento el agendamiento por WhatsApp no está disponible. Por favor llámanos. 🙏",
};

export function rellenar(plantilla, vars) {
  return String(plantilla || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}

export const CONFIG_POR_DEFECTO = {
  nombre: "Mi Spa",
  asistente: "Sofi",
  direccion: "",
  telefono: "",
  colorPrimario: "#c2185b",
  logo: "",
  zonaHoraria: "America/Bogota",
  monedaPrincipal: "COP",
  monedas: ["COP"],
  tasas: {},
  metodosPago: ["Efectivo", "Transferencia", "Nequi", "Daviplata", "Tarjeta"],
  categoriasGasto: ["Productos e insumos", "Arriendo", "Servicios públicos", "Nómina", "Comisiones", "Publicidad", "Otros"],
  horario: HORARIO_POR_DEFECTO,
  descanso: { desde: "", hasta: "" },
  diasCerrados: [],
  intervalo: 30,
  capacidad: 1,
  anticipacionMinutos: 60,
  horasMinCancelacion: 2,
  diasMaxAnticipacion: 30,
  pedirCedula: true,
  recordatorioHoras: 3,
  botActivo: true,
  mensajes: MENSAJES_POR_DEFECTO,
};

export function conDefectos(config) {
  const c = { ...CONFIG_POR_DEFECTO, ...(config || {}) };
  c.mensajes = { ...MENSAJES_POR_DEFECTO, ...(config?.mensajes || {}) };
  c.horario = { ...HORARIO_POR_DEFECTO, ...(config?.horario || {}) };
  return c;
}
