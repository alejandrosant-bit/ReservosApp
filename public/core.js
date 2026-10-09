// ============================================================
// Reservo — lógica compartida (sin dependencias)
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

// Suma meses a una fecha "YYYY-MM-DD" (31 ene + 1 mes = 28/29 feb)
export function sumarMeses(fechaISO, n = 1) {
  const [a, m, d] = fechaISO.split("-").map(Number);
  const destino = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  return `${destino.getUTCFullYear()}-${pad2(destino.getUTCMonth() + 1)}-${pad2(Math.min(d, ultimo))}`;
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

// Citas que se cruzan (sobrecupo): con profesionales, dos citas del
// mismo profesional a la vez; sin profesionales, más citas simultáneas
// que la capacidad. Devuelve un Set con los ids en conflicto.
export function citasEnConflicto(citas, config, profesionales) {
  const conflicto = new Set();
  const activas = (citas || []).filter((c) => ["pendiente", "confirmada"].includes(c.estado || "pendiente"));
  const conProfes = (profesionales || []).some((p) => p.activo !== false);
  const capacidad = Math.max(1, Number(config?.capacidad) || 1);
  const porDia = {};
  activas.forEach((c) => (porDia[c.fecha] ||= []).push(c));
  for (const lista of Object.values(porDia)) {
    for (const a of lista) {
      const ini = aMinutos(a.hora);
      const fin = ini + (Number(a.duracion) || 30);
      const cruces = lista.filter((b) => b !== a && seCruzan(ini, fin, aMinutos(b.hora), aMinutos(b.hora) + (Number(b.duracion) || 30)));
      if (conProfes ? cruces.some((b) => a.profesionalId && b.profesionalId === a.profesionalId) : cruces.length + 1 > capacidad) conflicto.add(a.id);
    }
  }
  return conflicto;
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
// Mensajes del bot y tipos de negocio: ver rubros.js
// Variables: {negocio} {asistente} {cliente} {servicio} {fecha}
// {hora} {horas_cancelacion} {direccion} {profesional}
// ------------------------------------------------------------
import { MENSAJES_POR_DEFECTO, MENSAJES_BARBERIA, MENSAJES_TAXI, RUBROS, rubroDe, vocabularioDe } from "./rubros.js";
export { MENSAJES_POR_DEFECTO, MENSAJES_BARBERIA, MENSAJES_TAXI, RUBROS, rubroDe, vocabularioDe };
export { ORDEN_RUBROS, VOCES, frasesDe, mensajesGenerales, ejemplosDe } from "./rubros.js";

// Estilos visuales: cambian colores, letras, íconos y celebraciones.
// El tono del bot y las palabras ("cita", "paciente"...) los da el
// tipo de negocio (rubro).
export const ESTILOS = {
  belleza: {
    nombre: "Spa y belleza (rosa)",
    color: "#c2185b",
    iconoServicio: "💆",
    lluviaPago: ["💸", "💰", "✨", "💖", "🪙"],
    lluviaCliente: ["💖", "🌸", "✨", "🎀", "💕"],
    iconoCliente: "🌸",
    tituloPago: "¡Pago recibido!",
    tituloCliente: null,
    bienvenida: (n) => (n ? `Bienvenid@, ${n}` : "Bienvenid@"),
  },
  barberia: {
    nombre: "Barbería (carbón y dorado)",
    color: "#a16207",
    iconoServicio: "💈",
    lluviaPago: ["💵", "💰", "🪙", "🔥", "💸"],
    lluviaCliente: ["💈", "✂️", "🪒", "🔥", "👊"],
    iconoCliente: "💈",
    tituloPago: "¡Billete a la caja!",
    tituloCliente: "¡Cliente nuevo en la silla!",
    bienvenida: (n) => (n ? `Bienvenido, ${n}` : "Bienvenido"),
  },
  salud: {
    nombre: "Salud (verde calma)",
    color: "#0f766e",
    iconoServicio: "🩺",
    lluviaPago: ["💵", "✨", "💚", "🪙", "💸"],
    lluviaCliente: ["💚", "✨", "🌿", "🤍", "💙"],
    iconoCliente: "🌿",
    tituloPago: "¡Pago registrado!",
    tituloCliente: null,
    bienvenida: (n) => (n ? `Te damos la bienvenida, ${n}` : "Te damos la bienvenida"),
  },
  general: {
    nombre: "Profesional (índigo)",
    color: "#4f46e5",
    iconoServicio: "📌",
    lluviaPago: ["💵", "💰", "✨", "🪙", "💸"],
    lluviaCliente: ["✨", "🎉", "💙", "⭐", "🙌"],
    iconoCliente: "🙌",
    tituloPago: "¡Pago recibido!",
    tituloCliente: null,
    bienvenida: (n) => (n ? `Bienvenido(a), ${n}` : "Bienvenido(a)"),
  },
  tecno: {
    nombre: "Tecnológico (oscuro)",
    color: "#e3a66e",
    iconoServicio: "⚡",
    lluviaPago: ["💸", "⚡", "✨", "🪙", "💰"],
    lluviaCliente: ["✨", "⚡", "💬", "⭐", "🚀"],
    iconoCliente: "🚀",
    tituloPago: "¡Pago recibido!",
    tituloCliente: null,
    bienvenida: (n) => (n ? `Bienvenido(a), ${n}` : "Bienvenido(a)"),
  },
  taxi: {
    nombre: "Taxis (amarillo)",
    color: "#1f2937",
    iconoServicio: "🚕",
    lluviaPago: ["💵", "🚕", "🪙", "💰", "✨"],
    lluviaCliente: ["🚕", "📍", "✨", "🙌", "⭐"],
    iconoCliente: "🚕",
    tituloPago: "¡Carrera cobrada!",
    tituloCliente: "¡Nuevo pasajero!",
    bienvenida: (n) => (n ? `Bienvenido, ${n}` : "Bienvenido"),
  },
};

export const estiloDe = (config) => ESTILOS[config?.estilo] || ESTILOS[rubroDe(config).estilo] || ESTILOS.belleza;

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
};

const HORARIO_24H = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { abierto: true, desde: "00:00", hasta: "23:59" }]));

export function conDefectos(config) {
  const rubro = rubroDe(config);
  const est = estiloDe(config);
  const c = {
    ...CONFIG_POR_DEFECTO,
    colorPrimario: est.color,
    asistente: rubro.asistente,
    ...(rubro.modo === "viajes" ? { horario: HORARIO_24H, pedirCedula: false, horasMinCancelacion: 0, intervalo: 15 } : {}),
    ...(config || {}),
  };
  c.rubro = rubro.id;
  c.estilo = config?.estilo || rubro.estilo;
  c.mensajes = { ...rubro.mensajes, ...(config?.mensajes || {}) };
  c.horario = { ...(rubro.modo === "viajes" ? HORARIO_24H : HORARIO_POR_DEFECTO), ...(config?.horario || {}) };
  return c;
}

// ------------------------------------------------------------
// Color de fondo personalizado: elige el color de letra que mejor
// se lee sobre el fondo (contraste WCAG), para que un fondo oscuro
// o muy saturado nunca deje los textos ilegibles.
// ------------------------------------------------------------
export function hexValido(hex) {
  return /^#[0-9a-f]{6}$/i.test(String(hex || ""));
}

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function tintaParaFondo(fondo, { oscura = "#1d1b20", clara = "#fbf8fa" } = {}) {
  if (!hexValido(fondo)) return null;
  const usarClara = contraste(fondo, clara) > contraste(fondo, oscura);
  let tinta = usarClara ? clara : oscura;
  // Fondos de tono medio (grises, colores intensos): si la letra suave
  // no alcanza el mínimo legible (4.5:1), se usa blanco o negro puro.
  if (contraste(fondo, tinta) < 4.5) tinta = contraste(fondo, "#ffffff") > contraste(fondo, "#000000") ? "#ffffff" : "#000000";
  return { tinta, oscuro: tinta !== oscura && tinta !== "#000000", contraste: contraste(fondo, tinta) };
}
