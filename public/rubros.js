// ============================================================
// Tipos de negocio ("rubros"). Reservo se adapta a cada uno:
// cómo se llama lo que se agenda (cita, turno, consulta, sesión,
// clase, viaje), cómo se llama a quien llega (cliente, paciente,
// pasajero), al equipo (profesional, médico, conductor), el tono
// del bot de WhatsApp, el estilo visual y los servicios de ejemplo.
// Sin dependencias: lo usan la app, el bot y el servidor.
// ============================================================

// Lo que se agenda, con su género para armar frases correctas
export const VOCES = {
  cita: { s: "cita", p: "citas", g: "f" },
  turno: { s: "turno", p: "turnos", g: "m" },
  consulta: { s: "consulta", p: "consultas", g: "f" },
  sesion: { s: "sesión", p: "sesiones", g: "f" },
  clase: { s: "clase", p: "clases", g: "f" },
  reserva: { s: "reserva", p: "reservas", g: "f" },
  viaje: { s: "viaje", p: "viajes", g: "m" },
};

export function frasesDe(v) {
  const f = v.g === "f";
  return {
    la: f ? "la" : "el",
    una: f ? "una" : "un",
    agendada: f ? "agendada" : "agendado",
    cancelada: f ? "cancelada" : "cancelado",
    proximas: f ? "próximas" : "próximos",
    registradas: f ? "registradas" : "registrados",
    nueva: f ? "nueva" : "nuevo",
    ninguna: f ? "ninguna" : "ninguno",
  };
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// ------------------------------------------------------------
// Mensajes del bot
// ------------------------------------------------------------
// Spa y belleza: cálido y cercano
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

// Barbería: directo, relajado y masculino
export const MENSAJES_BARBERIA = {
  bienvenida: "¡Qué más{cliente_coma}! 💈 Bienvenido a *{negocio}*. Soy {asistente}, el asistente de la barbería. ¿Qué necesitas?",
  pedirNombre: "Listo, para apartarte el turno, ¿me das tu *nombre y apellido*?",
  pedirCedula: "Gracias, {cliente}. Pásame tu número de *cédula* (solo números).",
  elegirServicio: "¿Qué te vas a hacer? Escoge 👇",
  elegirDia: "¿Qué día te sirve para tu *{servicio}*?",
  elegirHora: "Estos son los turnos libres el *{fecha}* 👇",
  horaDisponible: "¡Hay silla! El *{fecha}* a las *{hora}* está libre para *{servicio}*. ¿Te lo aparto?",
  horaOcupada: "Ese turno del *{fecha}* a las *{hora}* ya está tomado. Estos son los más cercanos:",
  diaCerrado: "Ese día la barbería está cerrada. Estos son los próximos días con turnos:",
  confirmada:
    "✅ ¡Listo, {cliente}! Tu turno quedó apartado:\n\n💈 *{servicio}*\n📅 {fecha}\n🕒 {hora}{profesional_linea}\n📍 {direccion}\n\nLlega puntual 👊. Si no puedes venir, avísanos *mínimo {horas_cancelacion} horas antes* escribiendo _\"cancelar mi turno\"_, así le damos la silla a otro.\n\n¡Nos vemos!",
  pedirNombreCancelar: "Sin problema. ¿A nombre de quién está el turno? (nombre y apellido)",
  elegirCitaCancelar: "Estos son los turnos de *{cliente}*. ¿Cuál cancelo?",
  confirmarCancelar: "¿Cancelo tu turno de *{servicio}* del *{fecha}* a las *{hora}*?",
  cancelada: "Listo, cancelé tu turno de *{servicio}* del {fecha} a las {hora} ✅. Gracias por avisar. Cuando quieras volver, escríbenos 💈",
  sinCitas: "No encontré turnos próximos a nombre de *{cliente}*. Revisa que el nombre esté igual a como lo diste al agendar.",
  muyTarde:
    "Tu turno de *{servicio}* es hoy a las *{hora}* y faltan menos de {horas_cancelacion} horas, por aquí ya no se puede cancelar. Llama directo a la barbería, porfa.",
  despedida: "¡De una! Que te vaya bien 👊",
  noEntendi: "No te entendí bien. Escoge una de las opciones 👇",
  recordatorio: "⏰ Qué más {cliente}, te recordamos tu turno de *{servicio}* hoy {fecha} a las *{hora}* en {negocio}. ¡Te esperamos! Si no puedes venir responde *cancelar*.",
  fueraDeServicio: "Ahora mismo no estamos agendando por WhatsApp. Llámanos directo, porfa.",
};

// Tono profesional y amable para salud, servicios y demás negocios.
// Se arma con el vocabulario del rubro (consulta, sesión, clase...).
export function mensajesGenerales(r) {
  const v = VOCES[r.voz] || VOCES.cita;
  const f = frasesDe(v);
  return {
    bienvenida: `¡Hola{cliente_coma}! 👋 Te damos la bienvenida a *{negocio}*. Soy {asistente}, el asistente virtual. ¿En qué te puedo ayudar?`,
    pedirNombre: `Para agendar tu ${v.s}, ¿me dices tu *nombre y apellido*?`,
    pedirCedula: "Gracias, {cliente}. ¿Me regalas tu número de *cédula*? (solo números)",
    elegirServicio: r.preguntaServicio || "¿Qué servicio necesitas? Elige una opción 👇",
    elegirDia: "¿Qué día te queda mejor para *{servicio}*?",
    elegirHora: "Estos son los horarios disponibles el *{fecha}* 👇",
    horaDisponible: `El *{fecha}* a las *{hora}* hay disponibilidad para *{servicio}*. ¿Confirmo tu ${v.s}?`,
    horaOcupada: "El *{fecha}* a las *{hora}* ya no hay disponibilidad. Estos son los horarios más cercanos:",
    diaCerrado: "Ese día no hay atención. Estos son los próximos días disponibles:",
    confirmada: `✅ Listo, {cliente}. Tu ${v.s} quedó ${f.agendada}:\n\n${r.icono} *{servicio}*\n📅 {fecha}\n🕒 {hora}{profesional_linea}\n📍 {direccion}\n\n${r.recomendacion || "Te pedimos llegar 10 minutos antes."} Si no puedes asistir, avísanos *al menos {horas_cancelacion} horas antes* escribiendo _"cancelar mi ${v.s}"_.\n\n¡Te esperamos!`,
    pedirNombreCancelar: `Claro, te ayudo. ¿A nombre de quién está ${f.la} ${v.s}? (nombre y apellido)`,
    elegirCitaCancelar: `Encontré estas ${v.p} a nombre de *{cliente}*. ¿Cuál deseas cancelar?`,
    confirmarCancelar: `¿Confirmas que deseas cancelar tu ${v.s} de *{servicio}* del *{fecha}* a las *{hora}*?`,
    cancelada: `Tu ${v.s} de *{servicio}* del {fecha} a las {hora} quedó *${f.cancelada}* ✅. Gracias por avisarnos con tiempo. Cuando quieras agendar de nuevo, escríbenos.`,
    sinCitas: `No encontré ${v.p} ${f.proximas} a nombre de *{cliente}*. Revisa que el nombre esté escrito igual que cuando agendaste.`,
    muyTarde: `Tu ${v.s} de *{servicio}* es hoy a las *{hora}* y faltan menos de {horas_cancelacion} horas, así que no se puede cancelar por aquí. Por favor comunícate directamente con nosotros.`,
    despedida: "¡Con gusto! Que tengas un excelente día.",
    noEntendi: "Disculpa, no te entendí bien. Por favor elige una de las opciones 👇",
    recordatorio: `⏰ Hola {cliente}, te recordamos tu ${v.s} de *{servicio}* hoy {fecha} a las *{hora}* en {negocio}. Si no puedes asistir responde *cancelar*.`,
    fueraDeServicio: "En este momento no estamos agendando por WhatsApp. Por favor llámanos.",
  };
}

// Línea de taxis: pedidos inmediatos o programados
export const MENSAJES_TAXI = {
  bienvenida: "¡Hola{cliente_coma}! 🚕 Bienvenido a *{negocio}*. Soy {asistente}. ¿Pedimos un taxi?",
  pedirNombre: "Para enviarte el taxi, ¿me dices tu *nombre*?",
  pedirCedula: "Gracias, {cliente}. ¿Me regalas tu número de *cédula*? (solo números)",
  pedirOrigen: "📍 ¿Dónde te recogemos?\n\nToca el 📎 clip → *Ubicación* → *Enviar mi ubicación actual*, o escribe la dirección (ej. _Calle 10 # 20-30, barrio Centro_).",
  pedirDestino: "¿Para dónde vas? Escribe la dirección o el lugar.\n\nSi prefieres decírselo al conductor, toca el botón 👇",
  confirmarViaje: "🚕 *Confirma tu taxi*\n\n📍 Recogida: {origen}\n🏁 Destino: {destino}\n🕒 {cuando}\n\n¿Lo pido?",
  viajePedido: "✅ ¡Listo, {cliente}! Ya estamos buscando el taxi más cercano. Te escribo apenas tenga *conductor y placa* asignados.\n\nSi necesitas cancelar escribe *cancelar*.",
  viajeProgramado: "✅ ¡Listo, {cliente}! Tu taxi quedó *programado* para el {fecha} a las {hora}.\n📍 Recogida: {origen}\n\nTe avisamos cuando el conductor vaya en camino. Para cancelar escribe *cancelar*.",
  pedirCuando: "¿Para qué día y hora lo programo? Ej.: _mañana a las 5 am_ o _viernes 3 pm_",
  asignado: "🚕 *¡Tu taxi va en camino!*\n\n👤 Conductor: {conductor}\n🚘 {vehiculo} · Placa *{placa}*\n⏱️ Llega en unos *{eta} minutos*\n\nVerifica la placa antes de subir. ¡Buen viaje!",
  llego: "🚕 Tu taxi *ya llegó* y te está esperando. Placa *{placa}*.",
  cancelada: "Tu viaje fue *cancelado* ✅. Cuando necesites un taxi, escríbenos.",
  canceladoPorEmpresa: "Lo sentimos, {cliente}: en este momento no hay taxis disponibles para tu servicio 🙏. Intenta de nuevo en unos minutos.",
  sinViajes: "No tienes viajes activos para cancelar. ¿Pedimos un taxi?",
  despedida: "¡Con gusto! Buen viaje 🚕",
  noEntendi: "No te entendí bien. Elige una opción 👇",
  recordatorio: "⏰ Hola {cliente}, te recordamos tu taxi programado para hoy a las *{hora}*. Si ya no lo necesitas responde *cancelar*.",
  fueraDeServicio: "En este momento no estamos tomando pedidos por WhatsApp. Llámanos, por favor.",
  // Compatibilidad con pantallas que muestran todos los mensajes
  confirmada: "✅ ¡Listo, {cliente}! Tu viaje quedó programado para el {fecha} a las {hora}.",
  elegirServicio: "¿Qué servicio necesitas? 👇",
  elegirDia: "¿Qué día lo necesitas?",
  elegirHora: "Estas son las horas disponibles el *{fecha}* 👇",
  horaDisponible: "El *{fecha}* a las *{hora}* hay disponibilidad. ¿Lo programo?",
  horaOcupada: "A esa hora no hay disponibilidad. Estas son las horas más cercanas:",
  diaCerrado: "Ese día no hay servicio programado. Estos son los próximos días:",
  pedirNombreCancelar: "¿A nombre de quién está el viaje?",
  elegirCitaCancelar: "Estos son tus viajes. ¿Cuál cancelo?",
  confirmarCancelar: "¿Cancelo tu viaje del *{fecha}* a las *{hora}*?",
  sinCitas: "No encontré viajes a nombre de *{cliente}*.",
  muyTarde: "Tu taxi ya va en camino, por aquí no se puede cancelar. Llama a la central, por favor.",
};

// ------------------------------------------------------------
// Catálogo. "servicios": [nombre, minutos, precio COP, categoría,
// palabras clave]. Los precios son de referencia; el negocio los
// ajusta en Ajustes → Servicios.
// ------------------------------------------------------------
export const RUBROS = {
  spa: {
    nombre: "Spa / estética",
    icono: "💆",
    estilo: "belleza",
    voz: "cita",
    cliente: "cliente",
    clientes: "Clientes",
    profesional: "profesional",
    profesionales: "Profesionales",
    asistente: "Sofi",
    mensajes: MENSAJES_POR_DEFECTO,
    servicios: [
      ["Masaje relajante", 60, 90000, "Spa", "masaje, relajacion"],
      ["Masaje descontracturante", 60, 110000, "Spa", "masaje, contractura, espalda"],
      ["Limpieza facial", 60, 85000, "Facial", "facial, cara, limpieza"],
      ["Manicure", 45, 25000, "Uñas", "uñas, manos"],
      ["Pedicure", 60, 35000, "Uñas", "uñas, pies"],
    ],
  },
  peluqueria: {
    nombre: "Peluquería / salón de belleza",
    icono: "💇",
    estilo: "belleza",
    voz: "cita",
    cliente: "cliente",
    clientes: "Clientes",
    profesional: "estilista",
    profesionales: "Estilistas",
    asistente: "Sofi",
    mensajes: MENSAJES_POR_DEFECTO,
    servicios: [
      ["Corte de dama", 45, 35000, "Cabello", "corte, pelo, cabello"],
      ["Corte de caballero", 30, 25000, "Cabello", "corte, hombre"],
      ["Cepillado", 45, 30000, "Cabello", "brushing, secado, planchado"],
      ["Tinte / color", 120, 120000, "Color", "tinte, color, mechas, raiz"],
      ["Keratina", 150, 180000, "Tratamiento", "alisado, keratina"],
    ],
  },
  unas: {
    nombre: "Uñas / manicure",
    icono: "💅",
    estilo: "belleza",
    voz: "cita",
    cliente: "cliente",
    clientes: "Clientes",
    profesional: "manicurista",
    profesionales: "Manicuristas",
    asistente: "Sofi",
    mensajes: MENSAJES_POR_DEFECTO,
    servicios: [
      ["Manicure tradicional", 45, 20000, "Manos", "uñas, manos"],
      ["Semipermanente", 60, 45000, "Manos", "semi, gel, esmaltado"],
      ["Uñas acrílicas", 120, 90000, "Manos", "acrilicas, extension, postizas"],
      ["Pedicure", 60, 35000, "Pies", "pies, uñas"],
    ],
  },
  barberia: {
    nombre: "Barbería",
    icono: "💈",
    estilo: "barberia",
    voz: "turno",
    cliente: "cliente",
    clientes: "Clientes",
    profesional: "barbero",
    profesionales: "Barberos",
    asistente: "Max",
    etiquetaAgendar: "📅 Pedir turno",
    mensajes: MENSAJES_BARBERIA,
    frases: {
      sinProximas: "No tienes turnos próximos con este número. ¿Te aparto uno?",
      cedulaNoCoincide: "La cédula no coincide con la del turno. Si necesitas ayuda llama directo a la barbería.",
      cualCancelar: "¿Cuál turno cancelo?",
      nuevaCita: "Ahora escojamos tu nuevo turno 👇",
      sigueEnPie: "¡Listo! Tu turno sigue en pie 👊. ¿Algo más?",
      reagendar: "Para cambiar tu turno primero cancelamos el actual y luego te aparto uno nuevo 👊",
    },
    servicios: [
      ["Corte clásico", 30, 25000, "Corte", "corte, pelo, cabello, motilada"],
      ["Fade / degradado", 40, 30000, "Corte", "fade, degradado, desvanecido, bajo"],
      ["Corte + barba", 50, 40000, "Combo", "barba, combo, completo"],
      ["Arreglo de barba", 20, 15000, "Barba", "barba, perfilado, contorno"],
      ["Afeitado clásico con toalla caliente", 30, 25000, "Barba", "afeitado, rasurado, toalla"],
      ["Diseño / líneas", 15, 10000, "Extras", "diseño, lineas, raya"],
      ["Cejas", 10, 8000, "Extras", "cejas, ceja"],
    ],
  },
  consultorio: {
    nombre: "Consultorio médico",
    icono: "🩺",
    estilo: "salud",
    voz: "consulta",
    cliente: "paciente",
    clientes: "Pacientes",
    profesional: "médico",
    profesionales: "Médicos",
    asistente: "Clara",
    preguntaServicio: "¿Qué tipo de consulta necesitas? Elige una opción 👇",
    recomendacion: "Trae tu documento de identidad y, si tienes, tus exámenes o fórmulas anteriores. Llega 10 minutos antes.",
    servicios: [
      ["Consulta medicina general", 30, 70000, "Consulta", "medico, general, consulta, cita medica, dolor"],
      ["Control", 20, 50000, "Consulta", "control, revision, seguimiento"],
      ["Certificado médico", 15, 40000, "Trámites", "certificado, incapacidad"],
      ["Lectura de exámenes", 20, 45000, "Consulta", "examenes, resultados, laboratorio"],
      ["Consulta virtual", 30, 60000, "Virtual", "virtual, videollamada, telemedicina"],
    ],
  },
  odontologia: {
    nombre: "Odontología",
    icono: "🦷",
    estilo: "salud",
    voz: "cita",
    cliente: "paciente",
    clientes: "Pacientes",
    profesional: "odontólogo",
    profesionales: "Odontólogos",
    asistente: "Clara",
    recomendacion: "Llega 10 minutos antes y cepíllate antes de la cita 🪥.",
    servicios: [
      ["Valoración odontológica", 30, 50000, "Valoración", "valoracion, revision, dientes, muela"],
      ["Limpieza / profilaxis", 45, 90000, "Higiene", "limpieza, profilaxis, sarro"],
      ["Resina", 45, 120000, "Tratamiento", "resina, caries, calza"],
      ["Blanqueamiento", 60, 350000, "Estética", "blanqueamiento, blanquear"],
      ["Control de ortodoncia", 30, 80000, "Ortodoncia", "ortodoncia, brackets, frenillos"],
    ],
  },
  psicologia: {
    nombre: "Psicología / terapia",
    icono: "🧠",
    estilo: "salud",
    voz: "sesion",
    cliente: "paciente",
    clientes: "Pacientes",
    profesional: "terapeuta",
    profesionales: "Terapeutas",
    asistente: "Clara",
    recomendacion: "Si tu sesión es virtual, te enviaremos el enlace antes de empezar.",
    servicios: [
      ["Primera sesión / valoración", 60, 120000, "Sesión", "primera, valoracion, inicio"],
      ["Sesión individual", 50, 100000, "Sesión", "sesion, terapia, psicologo, individual"],
      ["Terapia de pareja", 75, 150000, "Sesión", "pareja"],
      ["Sesión virtual", 50, 90000, "Virtual", "virtual, online, videollamada"],
    ],
  },
  fisioterapia: {
    nombre: "Fisioterapia",
    icono: "🦴",
    estilo: "salud",
    voz: "sesion",
    cliente: "paciente",
    clientes: "Pacientes",
    profesional: "fisioterapeuta",
    profesionales: "Fisioterapeutas",
    asistente: "Clara",
    recomendacion: "Ven con ropa cómoda y trae tu orden médica si la tienes.",
    servicios: [
      ["Valoración fisioterapéutica", 45, 80000, "Valoración", "valoracion, evaluacion"],
      ["Sesión de fisioterapia", 45, 70000, "Sesión", "terapia, fisio, rehabilitacion, dolor"],
      ["Terapia deportiva", 60, 90000, "Sesión", "deportiva, lesion"],
      ["Drenaje linfático", 60, 90000, "Sesión", "drenaje, linfatico"],
    ],
  },
  veterinaria: {
    nombre: "Veterinaria / peluquería canina",
    icono: "🐾",
    estilo: "general",
    voz: "cita",
    cliente: "cliente",
    clientes: "Clientes",
    profesional: "veterinario",
    profesionales: "Veterinarios",
    asistente: "Toby",
    recomendacion: "Trae el carné de vacunas de tu mascota 🐾 y llega 10 minutos antes.",
    servicios: [
      ["Consulta veterinaria", 30, 60000, "Consulta", "consulta, veterinario, enfermo, revision"],
      ["Vacunación", 20, 50000, "Prevención", "vacuna, vacunacion"],
      ["Baño y corte", 90, 55000, "Estética", "baño, corte, peluqueria, grooming"],
      ["Desparasitación", 15, 35000, "Prevención", "desparasitar, parasitos"],
    ],
  },
  gimnasio: {
    nombre: "Gimnasio / clases",
    icono: "🏋️",
    estilo: "general",
    voz: "clase",
    cliente: "alumno",
    clientes: "Alumnos",
    profesional: "instructor",
    profesionales: "Instructores",
    asistente: "Leo",
    recomendacion: "Trae toalla e hidratación 💧.",
    servicios: [
      ["Clase de yoga", 60, 30000, "Clases", "yoga"],
      ["Spinning", 45, 25000, "Clases", "spinning, bici"],
      ["Entrenamiento personalizado", 60, 60000, "Personal", "personal, entrenador, personalizado"],
      ["Valoración física", 30, 40000, "Valoración", "valoracion, medidas"],
    ],
  },
  tatuajes: {
    nombre: "Tatuajes / piercing",
    icono: "🖋️",
    estilo: "barberia",
    voz: "cita",
    cliente: "cliente",
    clientes: "Clientes",
    profesional: "tatuador",
    profesionales: "Tatuadores",
    asistente: "Max",
    recomendacion: "Come bien antes de tu sesión y evita el alcohol 24 horas antes.",
    servicios: [
      ["Valoración de diseño", 30, 0, "Valoración", "valoracion, diseño, cotizacion"],
      ["Tatuaje pequeño", 60, 150000, "Tatuaje", "tatuaje, tattoo, pequeño"],
      ["Tatuaje mediano", 180, 400000, "Tatuaje", "tatuaje, mediano"],
      ["Piercing", 20, 60000, "Piercing", "piercing, perforacion"],
    ],
  },
  lavadero: {
    nombre: "Lavadero / taller de carros",
    icono: "🚗",
    estilo: "general",
    voz: "turno",
    cliente: "cliente",
    clientes: "Clientes",
    profesional: "operario",
    profesionales: "Operarios",
    asistente: "Leo",
    recomendacion: "Llega puntual con tu vehículo.",
    servicios: [
      ["Lavado sencillo", 30, 25000, "Lavado", "lavado, lavar, carro"],
      ["Lavado full + aspirado", 60, 45000, "Lavado", "full, aspirado, completo"],
      ["Polichada", 120, 120000, "Estética", "polichada, brillo, encerado"],
      ["Cambio de aceite", 30, 150000, "Taller", "aceite, mantenimiento"],
    ],
  },
  asesorias: {
    nombre: "Abogados / asesorías / contadores",
    icono: "💼",
    estilo: "general",
    voz: "cita",
    cliente: "cliente",
    clientes: "Clientes",
    profesional: "asesor",
    profesionales: "Asesores",
    asistente: "Clara",
    recomendacion: "Trae los documentos relacionados con tu caso.",
    servicios: [
      ["Consulta inicial", 30, 80000, "Consulta", "consulta, asesoria, abogado"],
      ["Asesoría", 60, 150000, "Asesoría", "asesoria, caso"],
      ["Revisión de documentos", 45, 100000, "Documentos", "documentos, contrato, revision"],
      ["Declaración de renta", 60, 200000, "Contable", "renta, impuestos, dian, contador"],
    ],
  },
  taxi: {
    nombre: "Línea de taxis / transporte",
    icono: "🚕",
    estilo: "taxi",
    modo: "viajes",
    voz: "viaje",
    cliente: "pasajero",
    clientes: "Pasajeros",
    profesional: "conductor",
    profesionales: "Conductores",
    asistente: "Toño",
    etiquetaAgendar: "🚕 Pedir taxi",
    mensajes: MENSAJES_TAXI,
    servicios: [
      ["Viaje en la ciudad", 30, 9000, "Viaje", "taxi, carrera, servicio"],
      ["Viaje al aeropuerto", 60, 45000, "Viaje", "aeropuerto"],
      ["Viaje intermunicipal", 120, 120000, "Viaje", "intermunicipal, otro municipio, pueblo"],
    ],
  },
};

export const ORDEN_RUBROS = Object.keys(RUBROS);

// Rubro de un negocio (los negocios viejos no tienen "rubro")
export function rubroDe(config) {
  const id = RUBROS[config?.rubro] ? config.rubro : config?.estilo === "barberia" || config?.tipoNegocio === "barberia" ? "barberia" : RUBROS[config?.tipoNegocio] ? config.tipoNegocio : "spa";
  const r = RUBROS[id];
  return { id, ...r, v: VOCES[r.voz] || VOCES.cita, mensajes: r.mensajes || mensajesGenerales(r) };
}

// Palabras listas para la interfaz: "Nueva consulta", "+ Turno"...
export function vocabularioDe(config) {
  const r = rubroDe(config);
  const v = r.v;
  const f = frasesDe(v);
  return {
    ...f,
    cita: v.s,
    citas: v.p,
    Cita: cap(v.s),
    Citas: cap(v.p),
    cliente: r.cliente,
    Cliente: cap(r.cliente),
    clientes: r.clientes.toLowerCase(),
    Clientes: r.clientes,
    profesional: r.profesional,
    Profesional: cap(r.profesional),
    Profesionales: r.profesionales,
    agendar: r.etiquetaAgendar || `📅 Agendar ${v.s}`,
    nuevaCita: `${cap(f.nueva)} ${v.s}`,
    viajes: r.modo === "viajes",
  };
}
