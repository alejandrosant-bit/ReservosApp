// ============================================================
// Entendimiento del lenguaje (español) para el bot de WhatsApp.
// No usa IA de pago: reconoce intenciones, días, horas y
// servicios con reglas + tolerancia a errores de escritura.
// Ejemplos que entiende:
//   "hola quiero una cita para el jueves a las 3"
//   "me puedes agendar un masaje mañana a las 10 de la mañana"
//   "tienes algo el 15 de octubre en la tarde?"
//   "quiero cancelar la cita que hice"
// ============================================================

import { normalizar, distancia, sumarDias, diaSemana, pad2, MESES } from "./core.js";

const NUMEROS = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};

const DIAS_TEXTO = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

const RE_CANCELAR = /\b(cancel\w*|anul\w*|no (voy|puedo|podre) (a )?(ir|asistir|llegar)|no podre ir|eliminar (la|mi) cita|borrar (la|mi) cita|desagendar)\b/;
const RE_REAGENDAR = /\b(reagend\w*|cambiar (la|mi) (cita|hora)|mover (la|mi) cita|reprogram\w*)\b/;
const RE_AGENDAR = /\b(cita|agend\w*|reserv\w*|turno|apart\w*|cupo|disponib\w*|separar|quiero (un|una)|necesito (un|una)|tienes (algo|espacio|cupo)|hay (espacio|cupo))\b/;
const RE_MIS_CITAS = /\b(mis citas|mi cita|tengo cita|cuando es mi cita|ver citas|a que hora es mi cita)\b/;
const RE_SALUDO = /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|ola|saludos|que tal|alo)\b/;
const RE_GRACIAS = /\b(gracias|muchas gracias|ok gracias|listo gracias|chao|adios|hasta luego|bendiciones)\b/;
const RE_SI = /^(si|sii+|sip|claro|dale|ok|okay|listo|confirmo|confirmar|de una|perfecto|correcto|esta bien|va|vale|por favor)\b/;
const RE_NO = /^(no|nop|nel|negativo|mejor no|todavia no)\b/;
const RE_MENU = /^(menu|inicio|empezar|volver|reiniciar|opciones)$/;

export function detectarIntencion(textoNorm) {
  const t = textoNorm;
  if (RE_CANCELAR.test(t)) return "cancelar";
  if (RE_REAGENDAR.test(t)) return "reagendar";
  if (RE_MIS_CITAS.test(t)) return "miscitas";
  if (RE_AGENDAR.test(t)) return "agendar";
  if (RE_MENU.test(t)) return "menu";
  if (RE_SALUDO.test(t)) return "saludo";
  if (RE_GRACIAS.test(t)) return "gracias";
  return null;
}

export function esSi(t) {
  return RE_SI.test(normalizar(t));
}
export function esNo(t) {
  return RE_NO.test(normalizar(t));
}

// ------------------------------------------------------------
// Franjas del día ("en la mañana", "por la tarde"...)
// Se quitan del texto ANTES de buscar el día, porque "mañana"
// también significa "el día de mañana".
// ------------------------------------------------------------
function extraerFranja(t) {
  let franja = null;
  const reglas = [
    [/\b(de|en|por) la manana\b|\btemprano\b/, "manana"],
    [/\b(de|en|por) la tarde\b/, "tarde"],
    [/\b(de|en|por) la noche\b/, "noche"],
    [/\bal mediodia\b|\bmediodia\b/, "mediodia"],
  ];
  let resto = t;
  for (const [re, f] of reglas) {
    if (re.test(resto)) {
      franja = franja || f;
      // Se deja una marca "hrs" para reconocer "3 de la tarde" → "3 hrs"
      resto = resto.replace(re, " hrs ");
    }
  }
  return { franja, resto };
}

// ------------------------------------------------------------
// Hora
// ------------------------------------------------------------
function numeroDe(token) {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMEROS[token] ?? null;
}

export function extraerHora(texto, franja) {
  let t = texto;
  let h = null;
  let m = 0;
  let ampm = null;
  let coincidencia = null;

  const patrones = [
    // 15:30, 3:30pm, 3.30 pm
    /\b(\d{1,2})[:.](\d{2})\s*(am|pm|a m|p m)?\b/,
    // 3pm, 3 pm, 3 p m
    /\b(\d{1,2})\s*(am|pm|a m|p m)\b/,
    // a las 3, a las tres, tipo 4, como a las 5, las 10 y media
    /\b(?:a las|alas|las|a la|tipo|como a las|sobre las|despues de las|antes de las)\s+(\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+y\s+(media|cuarto|\d{1,2}))?(?:\s*(am|pm|a m|p m))?\b/,
    // "3 de la tarde" (llega como "3 hrs"), "10 y media en punto", "15 horas"
    /\b(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+y\s+(media|cuarto))?\s*(?:hrs|horas|en punto)\b/,
  ];

  let match = t.match(patrones[0]);
  if (match) {
    h = Number(match[1]);
    m = Number(match[2]);
    ampm = match[3] ? match[3].replace(" ", "") : null;
    coincidencia = match[0];
  } else if ((match = t.match(patrones[1]))) {
    h = Number(match[1]);
    ampm = match[2].replace(" ", "");
    coincidencia = match[0];
  } else if ((match = t.match(patrones[2]))) {
    h = numeroDe(match[1]);
    if (match[2] === "media") m = 30;
    else if (match[2] === "cuarto") m = 15;
    else if (match[2]) m = Number(match[2]);
    ampm = match[3] ? match[3].replace(" ", "") : null;
    coincidencia = match[0];
  } else if ((match = t.match(patrones[3]))) {
    h = numeroDe(match[1]);
    if (match[2] === "media") m = 30;
    if (match[2] === "cuarto") m = 15;
    coincidencia = match[0];
  }

  if (h === null || h > 23 || m > 59) {
    if (franja === "mediodia") return { hora: "12:00", coincidencia: null };
    return { hora: null, coincidencia: null };
  }

  if (ampm === "pm" && h < 12) h += 12;
  else if (ampm === "am" && h === 12) h = 0;
  else if (!ampm && h <= 12) {
    if (franja === "tarde" || franja === "noche") {
      if (h < 12) h += 12;
    } else if (franja === "manana") {
      if (h === 12) h = 12;
    } else if (h >= 1 && h <= 7) {
      // "a las 3" en un spa casi siempre es de la tarde
      h += 12;
    }
  }
  return { hora: `${pad2(h)}:${pad2(m)}`, coincidencia };
}

// ------------------------------------------------------------
// Día
// ------------------------------------------------------------
export function extraerFecha(texto, hoyISO) {
  const t = texto;

  if (/\bpasado manana\b/.test(t)) return sumarDias(hoyISO, 2);
  if (/\bhoy\b|\bahorita\b|\besta tarde\b|\besta noche\b/.test(t)) return hoyISO;
  if (/\bmanana\b/.test(t)) return sumarDias(hoyISO, 1);

  // 15/10, 15-10, 15/10/2026
  let m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (m) {
    const d = Number(m[1]);
    const mes = Number(m[2]);
    let anio = m[3] ? Number(m[3]) : Number(hoyISO.slice(0, 4));
    if (anio < 100) anio += 2000;
    if (d >= 1 && d <= 31 && mes >= 1 && mes <= 12) {
      let f = `${anio}-${pad2(mes)}-${pad2(d)}`;
      if (!m[3] && f < hoyISO) f = `${anio + 1}-${pad2(mes)}-${pad2(d)}`;
      return f;
    }
  }

  // 15 de octubre
  const nombresMes = MESES.map((x) => normalizar(x));
  m = t.match(new RegExp(`\\b(\\d{1,2}) de (${nombresMes.join("|")})\\b`));
  if (m) {
    const d = Number(m[1]);
    const mes = nombresMes.indexOf(m[2]) + 1;
    let anio = Number(hoyISO.slice(0, 4));
    let f = `${anio}-${pad2(mes)}-${pad2(d)}`;
    if (f < hoyISO) f = `${anio + 1}-${pad2(mes)}-${pad2(d)}`;
    return f;
  }

  // jueves, el próximo jueves, este sábado
  for (const [nombre, num] of Object.entries(DIAS_TEXTO)) {
    if (new RegExp(`\\b${nombre}\\b`).test(t)) {
      const hoyNum = diaSemana(hoyISO);
      let delta = (num - hoyNum + 7) % 7;
      if (delta === 0 && /\b(proximo|siguiente|que viene)\b/.test(t)) delta = 7;
      return sumarDias(hoyISO, delta);
    }
  }

  // "el 15", "para el 20" (día del mes)
  m = t.match(/\b(?:el|para el|dia)\s+(\d{1,2})\b/);
  if (m) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) {
      let [anio, mes] = hoyISO.split("-").map(Number);
      let f = `${anio}-${pad2(mes)}-${pad2(d)}`;
      if (f < hoyISO) {
        mes += 1;
        if (mes > 12) {
          mes = 1;
          anio += 1;
        }
        f = `${anio}-${pad2(mes)}-${pad2(d)}`;
      }
      return f;
    }
  }
  return null;
}

// ------------------------------------------------------------
// Servicio: busca el servicio que mejor coincide con el texto.
// Devuelve la lista de candidatos ordenada (puede haber empate).
// ------------------------------------------------------------
const PALABRAS_VACIAS = new Set(["de", "la", "el", "los", "las", "y", "con", "para", "en", "un", "una", "por", "a", "del", "al"]);

export function buscarServicios(texto, servicios) {
  const palabras = normalizar(texto).split(" ").filter((w) => w.length >= 3 && !PALABRAS_VACIAS.has(w));
  if (!palabras.length) return [];
  const puntajes = [];
  for (const s of servicios) {
    const claves = normalizar(`${s.nombre} ${s.palabrasClave || ""}`)
      .split(" ")
      .filter((w) => w.length >= 3 && !PALABRAS_VACIAS.has(w));
    let puntos = 0;
    for (const c of claves) {
      for (const w of palabras) {
        if (w === c) puntos += 3;
        else if (c.length >= 5 && w.length >= 5 && (c.startsWith(w) || w.startsWith(c))) puntos += 2;
        else if (c.length >= 5 && distancia(w, c) <= (c.length >= 8 ? 2 : 1)) puntos += 2;
      }
    }
    // Plural/singular: "uñas" ~ "uña", "masajes" ~ "masaje"
    if (puntos > 0) puntajes.push({ servicio: s, puntos });
  }
  puntajes.sort((a, b) => b.puntos - a.puntos);
  if (!puntajes.length) return [];
  const mejor = puntajes[0].puntos;
  return puntajes.filter((p) => p.puntos === mejor).map((p) => p.servicio);
}

export function extraerCedula(texto) {
  const m = String(texto).replace(/[.\s-]/g, "").match(/\b[VEJvej]?(\d{5,11})\b/);
  return m ? m[1] : null;
}

// ------------------------------------------------------------
// Análisis completo de un mensaje
// ------------------------------------------------------------
export function analizar(texto, { hoyISO, servicios = [] }) {
  const norm = normalizar(texto);
  const intencion = detectarIntencion(norm);
  const { franja, resto } = extraerFranja(norm);
  const { hora, coincidencia } = extraerHora(resto, franja);
  const sinHora = coincidencia ? resto.replace(coincidencia, " ") : resto;
  const fecha = extraerFecha(sinHora, hoyISO);
  const candidatos = buscarServicios(norm, servicios);
  return {
    texto,
    norm,
    intencion,
    franja,
    hora,
    fecha,
    servicio: candidatos.length === 1 ? candidatos[0] : null,
    serviciosCandidatos: candidatos,
  };
}

export function filtrarPorFranja(horas, franja) {
  if (!franja) return horas;
  const rango = {
    manana: [0, 12 * 60],
    mediodia: [11 * 60, 14 * 60],
    tarde: [12 * 60, 18 * 60],
    noche: [18 * 60, 24 * 60],
  }[franja];
  const filtradas = horas.filter((h) => {
    const [hh, mm] = h.split(":").map(Number);
    const min = hh * 60 + mm;
    return min >= rango[0] && min < rango[1];
  });
  return filtradas.length ? filtradas : horas;
}
