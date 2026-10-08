// ============================================================
// Cerebro del bot de WhatsApp.
// Es una "máquina de pasos": en cada mensaje lee lo que el
// cliente escribió (o la opción que tocó), entiende la intención
// y responde SOLO con opciones válidas (servicios activos, días
// abiertos y horas con cupo real). No depende de WhatsApp ni de
// Firebase directamente: recibe un "store" con las funciones de
// datos, así se puede probar sin internet (ver test/).
// ============================================================

import {
  conDefectos,
  rellenar,
  fechaLarga,
  fechaCorta,
  hora12,
  horasDisponibles,
  diasConCupo,
  horasCercanas,
  horarioDelDia,
  profesionalesLibres,
  aMinutos,
  ahoraEnZona,
  sumarDias,
  puedeCancelar,
  nombresParecidos,
  normalizar,
  formatoMoneda,
  soloDigitos,
  deMinutos,
  rubroDe,
  vocabularioDe,
} from "./core.js";
import { analizar, esSi, esNo, extraerCedula, filtrarPorFranja, buscarServicios } from "./nlp.js";

const EXPIRA_MINUTOS = 30;
const MAX_FILAS = 10; // límite de WhatsApp para listas

// ------------------------------------------------------------
// Constructores de mensajes de salida
// ------------------------------------------------------------
const corta = (t, n) => (String(t).length > n ? String(t).slice(0, n - 1) + "…" : String(t));

function texto(t) {
  return { tipo: "texto", texto: t };
}
function botones(t, lista) {
  return { tipo: "botones", texto: t, botones: lista.slice(0, 3).map((b) => ({ id: b.id, titulo: corta(b.titulo, 20) })) };
}
function lista(t, filas, boton = "Ver opciones") {
  return {
    tipo: "lista",
    texto: t,
    boton: corta(boton, 20),
    filas: filas.slice(0, MAX_FILAS).map((f) => ({ id: f.id, titulo: corta(f.titulo, 24), descripcion: f.descripcion ? corta(f.descripcion, 72) : undefined })),
  };
}

// Se guarda qué ids se ofrecieron, para aceptar también que el
// cliente responda escribiendo "1", "2", "3"...
function idsOfrecidos(mensajes) {
  const ultimo = [...mensajes].reverse().find((m) => m.tipo === "botones" || m.tipo === "lista");
  if (!ultimo) return [];
  return (ultimo.botones || ultimo.filas).map((x) => x.id);
}

// ------------------------------------------------------------
// Bot
// ------------------------------------------------------------
export async function procesarMensaje({ telefono, nombrePerfil, texto: textoEntrada = "", opcionId = null, ubicacion = null }, store, opciones = {}) {
  const config = conDefectos(store.config);
  // Vocabulario según el tipo de negocio ("cita", "turno", "consulta",
  // "sesión"...). Algunos rubros traen frases propias (barbería).
  const rubro = rubroDe(config);
  const V = vocabularioDe(config);
  const fr = (clave, porDefecto) => rubro.frases?.[clave] || porDefecto;
  const ahora = opciones.ahora || ahoraEnZona(config.zonaHoraria);
  const servicios = (store.servicios || []).filter((s) => s.activo !== false);
  const profesionales = store.profesionales || [];
  const tel = soloDigitos(telefono);

  let estado = (await store.getEstado(tel)) || null;
  if (estado && opciones.marcaTiempo && estado.ts && opciones.marcaTiempo - estado.ts > EXPIRA_MINUTOS * 60000) {
    estado = null;
  }
  estado = estado || { paso: "inicio", datos: {} };
  const datos = estado.datos || {};

  // Respuesta numérica a una lista ("2") → la convertimos en la opción
  if (!opcionId && /^\s*\d{1,2}\s*$/.test(textoEntrada) && estado.opciones?.length && estado.paso !== "pedir_cedula" && estado.paso !== "cancelar_cedula") {
    const idx = Number(textoEntrada) - 1;
    if (estado.opciones[idx]) opcionId = estado.opciones[idx];
  }

  const a = analizar(textoEntrada, { hoyISO: ahora.fecha, servicios });
  // "Pedir un carro / un servicio" solo es taxi en una línea de taxis
  if (a.intencion === "taxi" && rubro.modo !== "viajes") a.intencion = "agendar";
  const salida = [];
  const vars = (extra = {}) => ({
    negocio: config.nombre,
    asistente: config.asistente,
    direccion: config.direccion || config.nombre,
    horas_cancelacion: config.horasMinCancelacion,
    cliente: datos.nombre || "",
    cliente_coma: datos.nombre ? `, ${datos.nombre.split(" ")[0]}` : "",
    ...extra,
  });
  const msg = (clave, extra) => rellenar(config.mensajes[clave], vars(extra));

  // ----- Funciones auxiliares de cada paso -----
  const servicioActual = () => servicios.find((s) => s.id === datos.servicioId);

  async function citasEntre(desde, hasta) {
    return store.getCitas(desde, hasta);
  }

  function menuPrincipal(encabezado) {
    return botones(encabezado, [
      { id: "menu:agendar", titulo: V.agendar },
      { id: "menu:cancelar", titulo: `❌ Cancelar ${V.cita}` },
      { id: "menu:miscitas", titulo: `🗓️ Mis ${V.citas}` },
    ]);
  }

  function ofrecerServicios(prefijo, candidatos) {
    const ids = (candidatos || []).map((c) => c.id);
    const base = ids.length > 1 ? servicios.filter((s) => ids.includes(s.id)) : servicios;
    estado.paso = "elegir_servicio";
    const filas = base.slice(0, MAX_FILAS).map((s) => ({
      id: `srv:${s.id}`,
      titulo: s.nombre,
      descripcion: [s.duracion ? `${s.duracion} min` : "", s.precio ? formatoMoneda(s.precio, config.monedaPrincipal) : "", s.descripcion || ""]
        .filter(Boolean)
        .join(" · "),
    }));
    salida.push(lista([prefijo, msg("elegirServicio")].filter(Boolean).join("\n\n"), filas, "Ver servicios"));
  }

  async function ofrecerDias(prefijo, desde = 0) {
    const servicio = servicioActual();
    const citas = await citasEntre(ahora.fecha, sumarDias(ahora.fecha, Number(config.diasMaxAnticipacion) || 30));
    const dias = diasConCupo({ servicio, citas, profesionales, config, ahora, cantidad: 30, maxDias: Number(config.diasMaxAnticipacion) || 30 });
    estado.paso = "elegir_dia";
    if (!dias.length) {
      salida.push(texto("Por ahora no tengo cupos disponibles en los próximos días 😔. Por favor escríbenos más adelante."));
      estado.paso = "inicio";
      return;
    }
    const pagina = dias.slice(desde, desde + MAX_FILAS - 1);
    const filas = pagina.map((d) => ({
      id: `dia:${d.fecha}`,
      titulo: d.fecha === ahora.fecha ? `Hoy ${fechaCorta(d.fecha)}` : d.fecha === sumarDias(ahora.fecha, 1) ? `Mañana ${fechaCorta(d.fecha)}` : fechaCorta(d.fecha),
      descripcion: `${d.horas.length} horario${d.horas.length === 1 ? "" : "s"} libre${d.horas.length === 1 ? "" : "s"} · desde ${hora12(d.horas[0])}`,
    }));
    if (dias.length > desde + pagina.length) filas.push({ id: `mas:dia:${desde + pagina.length}`, titulo: "Más días ➡️" });
    salida.push(lista([prefijo, msg("elegirDia", { servicio: servicio?.nombre || V.cita })].filter(Boolean).join("\n\n"), filas, "Ver días"));
  }

  async function horasDe(fecha) {
    const citas = await citasEntre(fecha, fecha);
    return horasDisponibles({ fecha, servicio: servicioActual(), citas, profesionales, config, ahora });
  }

  async function ofrecerHoras(prefijo, horas, desde = 0) {
    estado.paso = "elegir_hora";
    const pagina = horas.slice(desde, desde + MAX_FILAS - 1);
    const filas = pagina.map((h) => ({ id: `hora:${h}`, titulo: hora12(h) }));
    if (horas.length > desde + pagina.length) filas.push({ id: `mas:hora:${desde + pagina.length}`, titulo: "Más horas ➡️" });
    else filas.push({ id: "otrodia", titulo: "📅 Otro día" });
    salida.push(lista([prefijo, msg("elegirHora", { fecha: fechaLarga(datos.fecha) })].filter(Boolean).join("\n\n"), filas, "Ver horas"));
  }

  // Muchos cupos en el día: primero "¿mañana, tarde o noche?"
  function ofrecerFranjas(prefijo, horas) {
    estado.paso = "elegir_hora";
    const rangos = { manana: [0, 720], tarde: [720, 1080], noche: [1080, 1440] };
    const conteo = (f) => horas.filter((h) => aMinutos(h) >= rangos[f][0] && aMinutos(h) < rangos[f][1]).length;
    const opcionesFranja = [
      { id: "franja:manana", titulo: "🌅 Mañana", n: conteo("manana") },
      { id: "franja:tarde", titulo: "☀️ Tarde", n: conteo("tarde") },
      { id: "franja:noche", titulo: "🌙 Noche", n: conteo("noche") },
    ].filter((o) => o.n > 0);
    salida.push(botones([prefijo, `El *${fechaLarga(datos.fecha)}* tengo ${horas.length} horarios libres. ¿En qué parte del día prefieres?`].filter(Boolean).join("\n\n"), opcionesFranja));
  }

  // Avanza el agendamiento con lo que ya sabemos (servicio, día, hora)
  async function avanzarAgenda(prefijo) {
    if (!datos.servicioId) {
      if (servicios.length === 1) datos.servicioId = servicios[0].id;
      else return ofrecerServicios(prefijo, datos.candidatos);
    }
    if (!datos.fecha) return ofrecerDias(prefijo);

    const maxFecha = sumarDias(ahora.fecha, Number(config.diasMaxAnticipacion) || 30);
    if (datos.fecha < ahora.fecha || datos.fecha > maxFecha || !horarioDelDia(config, datos.fecha)) {
      const fechaPedida = datos.fecha;
      datos.fecha = null;
      datos.hora = null;
      const aviso =
        fechaPedida > maxFecha
          ? `Solo agendamos con hasta ${config.diasMaxAnticipacion} días de anticipación. Estos son los próximos días con cupo:`
          : msg("diaCerrado");
      return ofrecerDias([prefijo, aviso].filter(Boolean).join("\n\n"));
    }

    const horas = await horasDe(datos.fecha);
    if (!horas.length) {
      const f = datos.fecha;
      datos.fecha = null;
      datos.hora = null;
      return ofrecerDias([prefijo, `El *${fechaLarga(f)}* ya no quedan cupos 😕. Estos son los próximos días disponibles:`].filter(Boolean).join("\n\n"));
    }

    if (!datos.hora) {
      const filtradas = filtrarPorFranja(horas, datos.franja);
      if (!datos.franja && filtradas.length > MAX_FILAS - 1) return ofrecerFranjas(prefijo, horas);
      return ofrecerHoras(prefijo, filtradas);
    }

    if (horas.includes(datos.hora)) {
      estado.paso = "confirmar";
      const s = servicioActual();
      const detalle = s?.precio ? `\n💲 ${formatoMoneda(s.precio, config.monedaPrincipal)} · ⏱️ ${s.duracion || 30} min` : "";
      salida.push(
        botones([prefijo, msg("horaDisponible", { fecha: fechaLarga(datos.fecha), hora: hora12(datos.hora), servicio: s?.nombre || "" }) + detalle].filter(Boolean).join("\n\n"), [
          { id: "ok", titulo: "✅ Sí, agendar" },
          { id: "otrahora", titulo: "🕒 Otra hora" },
          { id: "otrodia", titulo: "📅 Otro día" },
        ])
      );
      return;
    }

    const pedida = datos.hora;
    datos.hora = null;
    const cercanas = horasCercanas(horas, pedida, MAX_FILAS - 1);
    estado.paso = "elegir_hora";
    const filas = cercanas.map((h) => ({ id: `hora:${h}`, titulo: hora12(h) }));
    filas.push({ id: "otrodia", titulo: "📅 Otro día" });
    salida.push(
      lista(
        [prefijo, msg("horaOcupada", { fecha: fechaLarga(datos.fecha), hora: hora12(pedida), servicio: servicioActual()?.nombre || "" })].filter(Boolean).join("\n\n"),
        filas,
        "Ver horas"
      )
    );
  }

  // ----- Identificación del cliente -----
  async function identificarPorTelefono() {
    if (datos.clienteId) return true;
    const c = await store.buscarClientePorTelefono(tel);
    if (c) {
      datos.clienteId = c.id;
      datos.nombre = c.nombre;
      return true;
    }
    return false;
  }

  async function guardarClienteNuevo() {
    // ¿Ya existe con esa cédula? (ej. escribe desde otro número)
    if (datos.cedula) {
      const porCedula = await store.buscarClientePorCedula(datos.cedula);
      if (porCedula) {
        datos.clienteId = porCedula.id;
        datos.nombre = porCedula.nombre;
        if (!porCedula.telefono) await store.actualizarCliente(porCedula.id, { telefono: tel });
        return;
      }
    } else {
      // Sin cédula: si hay exactamente un cliente con ese nombre y
      // sin teléfono registrado, asumimos que es él.
      const parecidos = (await store.buscarClientesPorNombre(datos.nombre)).filter((c) => !c.telefono);
      if (parecidos.length === 1) {
        datos.clienteId = parecidos[0].id;
        await store.actualizarCliente(parecidos[0].id, { telefono: tel });
        return;
      }
    }
    datos.clienteId = await store.crearCliente({
      nombre: datos.nombre,
      cedula: datos.cedula || "",
      telefono: tel,
      origen: "whatsapp",
      nombrePerfilWhatsapp: nombrePerfil || "",
    });
  }

  async function empezarAgenda(prefijo) {
    estado.flujo = "agendar";
    if (!(await identificarPorTelefono())) {
      estado.paso = "pedir_nombre";
      salida.push(texto([prefijo, msg("pedirNombre")].filter(Boolean).join("\n\n")));
      return;
    }
    await avanzarAgenda(prefijo);
  }

  async function crearCita() {
    const s = servicioActual();
    const citas = await citasEntre(datos.fecha, datos.fecha);
    const libres = profesionalesLibres({
      fecha: datos.fecha,
      inicio: aMinutos(datos.hora),
      duracion: Number(s?.duracion) || 30,
      servicioId: s?.id,
      citas,
      profesionales,
      config,
    });
    if (!libres.length) {
      datos.hora = null;
      await avanzarAgenda("¡Uy! Alguien acaba de tomar esa hora 😅.");
      return;
    }
    const prof = libres[0];
    const cita = {
      clienteId: datos.clienteId,
      clienteNombre: datos.nombre,
      telefono: tel,
      servicioId: s?.id || "",
      servicioNombre: s?.nombre || "",
      profesionalId: prof.id || "",
      profesionalNombre: prof.nombre || "",
      fecha: datos.fecha,
      hora: datos.hora,
      duracion: Number(s?.duracion) || 30,
      precio: Number(s?.precio) || 0,
      estado: "pendiente",
      origen: "whatsapp",
    };
    const id = await store.crearCita(cita);
    if (!id) {
      datos.hora = null;
      await avanzarAgenda("¡Uy! Alguien acaba de tomar esa hora 😅.");
      return;
    }
    salida.push(
      texto(
        msg("confirmada", {
          servicio: cita.servicioNombre,
          fecha: fechaLarga(cita.fecha),
          hora: hora12(cita.hora),
          profesional: cita.profesionalNombre,
          profesional_linea: cita.profesionalNombre ? `\n👤 Con ${cita.profesionalNombre}` : "",
        })
      )
    );
    await store.notificar?.({ tipo: "nueva", cita: { ...cita, id } });
    estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
  }

  // ----- Cancelación -----
  async function citasFuturasDe(clienteIds) {
    const todas = await store.citasFuturasDeClientes(clienteIds, ahora.fecha);
    return todas
      .filter((c) => ["pendiente", "confirmada"].includes(c.estado || "pendiente"))
      .filter((c) => c.fecha > ahora.fecha || aMinutos(c.hora) > ahora.minutos)
      .sort((x, y) => (x.fecha + x.hora).localeCompare(y.fecha + y.hora));
  }

  async function mostrarCitasParaCancelar(clienteIds, nombre) {
    const citas = await citasFuturasDe(clienteIds);
    if (!citas.length) {
      estado.paso = "inicio";
      salida.push(menuPrincipal(msg("sinCitas", { cliente: nombre })));
      return;
    }
    datos.cancelables = citas.map((c) => c.id);
    if (citas.length === 1) return pedirConfirmarCancelacion(citas[0]);
    estado.paso = "cancelar_elegir";
    salida.push(
      lista(
        msg("elegirCitaCancelar", { cliente: nombre }),
        citas.map((c) => ({ id: `cancel:${c.id}`, titulo: `${fechaCorta(c.fecha)} ${hora12(c.hora)}`, descripcion: c.servicioNombre })),
        `Ver mis ${V.citas}`
      )
    );
  }

  async function pedirConfirmarCancelacion(cita) {
    if (!puedeCancelar(cita, config, ahora)) {
      estado.paso = "inicio";
      salida.push(texto(msg("muyTarde", { servicio: cita.servicioNombre, hora: hora12(cita.hora), fecha: fechaLarga(cita.fecha) })));
      return;
    }
    datos.citaCancelar = cita.id;
    estado.paso = "cancelar_confirmar";
    salida.push(
      botones(msg("confirmarCancelar", { servicio: cita.servicioNombre, fecha: fechaLarga(cita.fecha), hora: hora12(cita.hora) }), [
        { id: "sicancel", titulo: "Sí, cancelar" },
        { id: "nocancel", titulo: "No, la mantengo" },
      ])
    );
  }

  async function buscarClientesParaCancelar(nombre) {
    const candidatos = await store.buscarClientesPorNombre(nombre);
    if (!candidatos.length) return { clientes: [], verificar: false };
    // Si alguno coincide con este WhatsApp, es él.
    const propio = candidatos.filter((c) => soloDigitos(c.telefono) === tel);
    if (propio.length) return { clientes: propio, verificar: false };
    // Nombre de otra persona registrada con otro número: por
    // seguridad pedimos la cédula antes de cancelar.
    return { clientes: candidatos, verificar: true };
  }

  async function empezarCancelacion(prefijo) {
    estado.flujo = "cancelar";
    estado.paso = "cancelar_nombre";
    datos.citaCancelar = null;
    salida.push(texto([prefijo, msg("pedirNombreCancelar")].filter(Boolean).join("\n\n")));
  }

  async function mostrarMisCitas(prefijo) {
    await identificarPorTelefono();
    const clientes = datos.clienteId ? [datos.clienteId] : [];
    const citas = clientes.length ? await citasFuturasDe(clientes) : [];
    estado.paso = "inicio";
    if (!citas.length) {
      salida.push(menuPrincipal([prefijo, fr("sinProximas", `No tienes ${V.citas} ${V.proximas} ${V.registradas} con este número. ¿Quieres agendar ${V.una}?`)].filter(Boolean).join("\n\n")));
      return;
    }
    const lineas = citas.map((c) => `• *${fechaLarga(c.fecha)}* a las *${hora12(c.hora)}* — ${c.servicioNombre}`);
    salida.push(menuPrincipal([prefijo, `Tus ${V.proximas} ${V.citas}:\n\n${lineas.join("\n")}`].filter(Boolean).join("\n\n")));
  }

  // ----- Mezcla lo que entendimos del texto con lo que ya sabíamos -----
  function absorberDatos() {
    if (a.servicio) {
      datos.servicioId = a.servicio.id;
      datos.candidatos = null;
    } else if (a.serviciosCandidatos.length > 1 && !datos.servicioId) {
      datos.candidatos = a.serviciosCandidatos;
    }
    if (a.fecha) {
      if (a.fecha !== datos.fecha) datos.hora = null;
      datos.fecha = a.fecha;
    }
    if (a.hora) datos.hora = a.hora;
    if (a.franja) datos.franja = a.franja;
  }

  // ============================================================
  // Línea de taxis: pedir ya o programado, recogida por ubicación
  // de WhatsApp o dirección escrita, destino y confirmación.
  // ============================================================
  function textoUbicacion(u) {
    if (!u) return "";
    if (u.direccion || u.nombre) return [u.nombre, u.direccion].filter(Boolean).join(" · ");
    return `📍 Ubicación GPS (${Number(u.lat).toFixed(5)}, ${Number(u.lng).toFixed(5)})`;
  }

  function menuTaxi(encabezado) {
    return botones(encabezado, [
      { id: "viaje:ahora", titulo: "🚕 Pedir taxi ya" },
      { id: "viaje:programar", titulo: "📅 Programar taxi" },
      { id: "viaje:cancelar", titulo: "❌ Cancelar taxi" },
    ]);
  }

  async function siguientePasoViaje(prefijo = "") {
    const junto = (t) => [prefijo, t].filter(Boolean).join("\n\n");
    if (!datos.clienteId) {
      estado.paso = "viaje_nombre";
      return salida.push(texto(junto(msg("pedirNombre"))));
    }
    if (datos.programado && !(datos.fecha && datos.hora)) {
      estado.paso = "viaje_cuando";
      return salida.push(texto(junto(msg("pedirCuando"))));
    }
    if (!datos.recogida) {
      estado.paso = "viaje_origen";
      return salida.push(texto(junto(msg("pedirOrigen"))));
    }
    if (datos.destino === undefined || datos.destino === null) {
      estado.paso = "viaje_destino";
      return salida.push(botones(junto(msg("pedirDestino")), [{ id: "viaje:sindestino", titulo: "Se lo digo al conductor" }]));
    }
    estado.paso = "viaje_confirmar";
    salida.push(
      botones(
        junto(
          msg("confirmarViaje", {
            origen: datos.recogida,
            destino: datos.destino || "Se lo dices al conductor",
            cuando: datos.programado ? `${fechaLarga(datos.fecha)} a las ${hora12(datos.hora)}` : "Ahora mismo",
          })
        ),
        [
          { id: "viaje:ok", titulo: "✅ Sí, pedir taxi" },
          { id: "viaje:cambiar", titulo: "✏️ Cambiar dirección" },
          { id: "viaje:no", titulo: "❌ No, gracias" },
        ]
      )
    );
  }

  async function crearViaje() {
    const s = (datos.servicioId && servicios.find((x) => x.id === datos.servicioId)) || servicios[0];
    const ahoraHora = deMinutos(Math.min(ahora.minutos, 23 * 60 + 59));
    const viaje = {
      tipo: "viaje",
      clienteId: datos.clienteId,
      clienteNombre: datos.nombre,
      telefono: tel,
      servicioId: s?.id || "",
      servicioNombre: s?.nombre || "Viaje",
      profesionalId: "",
      profesionalNombre: "",
      fecha: datos.programado ? datos.fecha : ahora.fecha,
      hora: datos.programado ? datos.hora : ahoraHora,
      duracion: Number(s?.duracion) || 30,
      precio: Number(s?.precio) || 0,
      estado: "pendiente",
      origen: "whatsapp",
      recogida: datos.recogida,
      ubicacion: datos.ubicacion || null,
      destino: datos.destino || "",
      programado: !!datos.programado,
    };
    const id = await (store.crearViaje || store.crearCita).call(store, viaje);
    if (!id) {
      salida.push(menuTaxi("No pude registrar tu pedido 😕. ¿Lo intentamos de nuevo?"));
      estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
      return;
    }
    salida.push(
      texto(
        datos.programado
          ? msg("viajeProgramado", { fecha: fechaLarga(viaje.fecha), hora: hora12(viaje.hora), origen: viaje.recogida })
          : msg("viajePedido")
      )
    );
    await store.notificar?.({ tipo: "viaje", cita: { ...viaje, id } });
    estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
  }

  async function cancelarViajeActivo() {
    await identificarPorTelefono();
    const activos = datos.clienteId
      ? (await store.citasFuturasDeClientes([datos.clienteId], ahora.fecha))
          .filter((c) => c.tipo === "viaje" && ["pendiente", "confirmada"].includes(c.estado))
          .sort((x, y) => (x.fecha + x.hora).localeCompare(y.fecha + y.hora))
      : [];
    estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
    if (!activos.length) return salida.push(menuTaxi(msg("sinViajes")));
    const viaje = activos[0];
    // Si el conductor ya va en camino, mejor hablar con la central
    if (viaje.estado === "confirmada" && viaje.profesionalId && !viaje.programado) return salida.push(texto(msg("muyTarde")));
    await store.cancelarCita(viaje.id, { canceladaPor: "cliente_whatsapp" });
    await store.notificar?.({ tipo: "cancelada", cita: viaje });
    salida.push(texto(msg("cancelada")));
  }

  async function flujoViaje() {
    const ahoraMismo = opcionId === "viaje:ahora";
    if (opcionId === "viaje:cancelar" || (!opcionId && a.intencion === "cancelar" && estado.paso !== "viaje_confirmar")) return cancelarViajeActivo();
    if (ahoraMismo || opcionId === "viaje:programar") {
      await identificarPorTelefono();
      Object.assign(datos, { programado: !ahoraMismo, fecha: null, hora: null, recogida: null, ubicacion: null, destino: null });
      return siguientePasoViaje("");
    }
    if (!opcionId && a.intencion === "menu") {
      estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
      return salida.push(menuTaxi(bienvenida()));
    }

    switch (estado.paso) {
      case "viaje_nombre": {
        const nombre = textoEntrada.trim().replace(/\s+/g, " ");
        if (normalizar(nombre).length < 2 || /\d/.test(nombre) || nombre.length > 60) return salida.push(texto(msg("pedirNombre")));
        datos.nombre = nombre.toLowerCase().split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        await guardarClienteNuevo();
        return siguientePasoViaje(`Gracias, ${datos.nombre.split(" ")[0]} 🙌`);
      }
      case "viaje_cuando": {
        if (!a.hora) return salida.push(texto(msg("pedirCuando")));
        let fecha = a.fecha || ahora.fecha;
        if (!a.fecha && aMinutos(a.hora) <= ahora.minutos) fecha = sumarDias(ahora.fecha, 1);
        if (fecha === ahora.fecha && aMinutos(a.hora) <= ahora.minutos) return salida.push(texto("Esa hora ya pasó 🕒. " + msg("pedirCuando")));
        datos.fecha = fecha;
        datos.hora = a.hora;
        return siguientePasoViaje("");
      }
      case "viaje_origen": {
        if (ubicacion) {
          datos.ubicacion = ubicacion;
          datos.recogida = textoUbicacion(ubicacion);
        } else if (textoEntrada.trim().length >= 5) {
          datos.recogida = textoEntrada.trim().slice(0, 160);
        } else return salida.push(texto(msg("pedirOrigen")));
        return siguientePasoViaje("");
      }
      case "viaje_destino": {
        if (opcionId === "viaje:sindestino") datos.destino = "";
        else if (ubicacion) datos.destino = textoUbicacion(ubicacion);
        else if (textoEntrada.trim().length >= 3) {
          datos.destino = textoEntrada.trim().slice(0, 160);
          const s = buscarServicios(textoEntrada, servicios);
          if (s.length === 1) datos.servicioId = s[0].id; // ej. "aeropuerto"
        } else return siguientePasoViaje("");
        return siguientePasoViaje("");
      }
      case "viaje_confirmar": {
        if (opcionId === "viaje:ok" || (!opcionId && esSi(textoEntrada))) return crearViaje();
        if (opcionId === "viaje:cambiar") {
          datos.recogida = null;
          datos.ubicacion = null;
          datos.destino = null;
          return siguientePasoViaje("");
        }
        if (opcionId === "viaje:no" || (!opcionId && (esNo(textoEntrada) || a.intencion === "cancelar"))) {
          estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
          return salida.push(menuTaxi("Listo, no pedí nada. ¿Te ayudo con algo más?"));
        }
        salida.push(texto(msg("noEntendi")));
        return siguientePasoViaje("");
      }
      default: {
        await identificarPorTelefono();
        // Mandó la ubicación de una: es un pedido inmediato
        if (ubicacion) {
          Object.assign(datos, { programado: false, recogida: textoUbicacion(ubicacion), ubicacion, destino: null });
          return siguientePasoViaje(esNuevaConversacion ? bienvenida() : "");
        }
        if (["taxi", "agendar"].includes(a.intencion) || a.hora || a.fecha) {
          const programado = !!(a.hora || a.fecha) && !/\b(ya|ahora|ahorita|urgente)\b/.test(a.norm);
          Object.assign(datos, { programado, fecha: null, hora: null, recogida: null, ubicacion: null, destino: null });
          if (programado && a.hora) {
            let fecha = a.fecha || ahora.fecha;
            if (!a.fecha && aMinutos(a.hora) <= ahora.minutos) fecha = sumarDias(ahora.fecha, 1);
            datos.fecha = fecha;
            datos.hora = a.hora;
          }
          return siguientePasoViaje(esNuevaConversacion ? bienvenida() : "");
        }
        if (a.intencion === "gracias" && !esNuevaConversacion) return salida.push(texto(msg("despedida")));
        return salida.push(menuTaxi(esNuevaConversacion || a.intencion === "saludo" ? bienvenida() : msg("noEntendi")));
      }
    }
  }

  // ============================================================
  // Despacho
  // ============================================================
  if (config.botActivo === false) {
    return { mensajes: [texto(msg("fueraDeServicio"))], estado: null };
  }

  const bienvenida = () => msg("bienvenida");
  const esNuevaConversacion = estado.paso === "inicio" && !estado.saludado;

  // Intenciones globales que cambian de flujo en cualquier momento
  if (rubro.modo === "viajes") {
    await flujoViaje();
  } else if (!opcionId && a.intencion === "cancelar" && estado.paso !== "cancelar_confirmar") {
    await identificarPorTelefono();
    await empezarCancelacion(esNuevaConversacion ? bienvenida() : "");
  } else if (!opcionId && a.intencion === "menu") {
    estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
    salida.push(menuPrincipal(bienvenida()));
  } else if (opcionId === "menu:agendar") {
    await empezarAgenda("");
  } else if (opcionId === "menu:cancelar") {
    await empezarCancelacion("");
  } else if (opcionId === "menu:miscitas" || (!opcionId && a.intencion === "miscitas" && estado.paso === "inicio")) {
    await mostrarMisCitas(esNuevaConversacion && !opcionId ? bienvenida() : "");
  } else {
    switch (estado.paso) {
      case "inicio": {
        await identificarPorTelefono();
        const hayDatosDeCita = a.servicio || a.serviciosCandidatos.length || a.fecha || a.hora;
        if (a.intencion === "reagendar") {
          await empezarCancelacion(
            (esNuevaConversacion ? bienvenida() + "\n\n" : "") + fr("reagendar", `Para cambiar tu ${V.cita} primero cancelamos ${V.la} actual y luego te ayudo a agendar ${V.la} ${V.nueva}. 😉`)
          );
          datos.reagendar = true;
        } else if (a.intencion === "agendar" || hayDatosDeCita) {
          absorberDatos();
          await empezarAgenda(esNuevaConversacion ? bienvenida() : "");
        } else if (a.intencion === "gracias" && !esNuevaConversacion) {
          salida.push(texto(msg("despedida")));
        } else {
          salida.push(menuPrincipal(esNuevaConversacion || a.intencion === "saludo" ? bienvenida() : msg("noEntendi")));
        }
        break;
      }

      case "pedir_nombre": {
        const nombre = textoEntrada.trim().replace(/\s+/g, " ");
        if (normalizar(nombre).split(" ").filter((w) => w.length >= 2).length < 2 || /\d/.test(nombre) || nombre.length > 60) {
          salida.push(texto("Por favor escríbeme tu *nombre y apellido* (ej. _María Pérez_)."));
          break;
        }
        datos.nombre = nombre
          .toLowerCase()
          .split(" ")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        if (config.pedirCedula) {
          estado.paso = "pedir_cedula";
          salida.push(texto(msg("pedirCedula")));
        } else {
          await guardarClienteNuevo();
          await avanzarAgenda(`¡Mucho gusto, ${datos.nombre.split(" ")[0]}! 😊`);
        }
        break;
      }

      case "pedir_cedula": {
        const ced = extraerCedula(textoEntrada);
        if (!ced) {
          salida.push(texto("La cédula debe tener solo números (ej. 1023456789). ¿Me la escribes de nuevo?"));
          break;
        }
        datos.cedula = ced;
        await guardarClienteNuevo();
        await avanzarAgenda(`¡Gracias, ${datos.nombre.split(" ")[0]}! 😊`);
        break;
      }

      case "elegir_servicio": {
        if (opcionId?.startsWith("srv:")) {
          datos.servicioId = opcionId.slice(4);
          datos.candidatos = null;
        } else {
          absorberDatos();
          if (!datos.servicioId) {
            const c = buscarServicios(textoEntrada, servicios);
            if (c.length === 1) datos.servicioId = c[0].id;
          }
        }
        if (!servicioActual()) {
          datos.servicioId = null;
          ofrecerServicios(msg("noEntendi"), datos.candidatos);
          break;
        }
        await avanzarAgenda("");
        break;
      }

      case "elegir_dia": {
        if (opcionId?.startsWith("mas:dia:")) {
          await ofrecerDias("", Number(opcionId.split(":")[2]));
          break;
        }
        if (opcionId?.startsWith("dia:")) {
          datos.fecha = opcionId.slice(4);
          datos.hora = datos.hora || null;
        } else {
          absorberDatos();
        }
        if (!datos.fecha) {
          await ofrecerDias(msg("noEntendi"));
          break;
        }
        await avanzarAgenda("");
        break;
      }

      case "elegir_hora": {
        if (opcionId?.startsWith("mas:hora:")) {
          const horas = filtrarPorFranja(await horasDe(datos.fecha), datos.franja);
          await ofrecerHoras("", horas, Number(opcionId.split(":")[2]));
          break;
        }
        if (opcionId === "otrodia") {
          datos.fecha = null;
          datos.hora = null;
          datos.franja = null;
          await ofrecerDias("");
          break;
        }
        // En este paso "mañana" a secas significa "en la mañana"
        if (!opcionId && /^(en la |por la |de la )?(manana|tarde|noche)$/.test(a.norm)) {
          opcionId = "franja:" + a.norm.split(" ").pop();
        }
        if (opcionId?.startsWith("franja:")) {
          datos.franja = opcionId.slice(7);
          await ofrecerHoras("", filtrarPorFranja(await horasDe(datos.fecha), datos.franja));
          break;
        }
        if (opcionId?.startsWith("hora:")) {
          datos.hora = opcionId.slice(5);
        } else {
          absorberDatos();
        }
        if (!datos.hora) {
          const horas = filtrarPorFranja(await horasDe(datos.fecha), datos.franja);
          await ofrecerHoras(msg("noEntendi"), horas);
          break;
        }
        await avanzarAgenda("");
        break;
      }

      case "confirmar": {
        if (opcionId === "ok" || (!opcionId && esSi(textoEntrada))) {
          await crearCita();
        } else if (opcionId === "otrahora") {
          datos.hora = null;
          datos.franja = null;
          await avanzarAgenda("");
        } else if (opcionId === "otrodia") {
          datos.fecha = null;
          datos.hora = null;
          datos.franja = null;
          await ofrecerDias("");
        } else if (!opcionId && esNo(textoEntrada)) {
          estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
          salida.push(menuPrincipal("Está bien, no agendé nada. ¿Te ayudo con algo más?"));
        } else {
          absorberDatos();
          if (a.fecha || a.hora || a.servicio) await avanzarAgenda("");
          else {
            salida.push(texto(msg("noEntendi")));
            await avanzarAgenda("");
          }
        }
        break;
      }

      case "cancelar_nombre": {
        const nombre = textoEntrada.trim();
        if (normalizar(nombre).length < 3) {
          salida.push(texto(msg("pedirNombreCancelar")));
          break;
        }
        const { clientes, verificar } = await buscarClientesParaCancelar(nombre);
        if (!clientes.length) {
          estado.paso = "inicio";
          salida.push(menuPrincipal(msg("sinCitas", { cliente: nombre })));
          break;
        }
        datos.nombreCancelar = nombre;
        if (verificar && clientes.some((c) => c.cedula)) {
          datos.clientesCancelar = clientes.map((c) => c.id);
          estado.paso = "cancelar_cedula";
          salida.push(texto(`Por seguridad, ¿me confirmas el número de *cédula* de ${clientes[0].nombre}?`));
          break;
        }
        await mostrarCitasParaCancelar(
          clientes.map((c) => c.id),
          clientes[0].nombre
        );
        break;
      }

      case "cancelar_cedula": {
        const ced = extraerCedula(textoEntrada);
        const cliente = ced ? await store.buscarClientePorCedula(ced) : null;
        if (!cliente || !(datos.clientesCancelar || []).includes(cliente.id)) {
          estado.paso = "inicio";
          salida.push(menuPrincipal(fr("cedulaNoCoincide", `La cédula no coincide con la de ${V.la} ${V.cita} 🙏. Si necesitas ayuda comunícate directamente con el negocio.`)));
          break;
        }
        await mostrarCitasParaCancelar([cliente.id], cliente.nombre);
        break;
      }

      case "cancelar_elegir": {
        let id = opcionId?.startsWith("cancel:") ? opcionId.slice(7) : null;
        if (!id) {
          // Escribió la fecha u hora en vez de tocar la opción
          const todas = await store.citasPorIds(datos.cancelables || []);
          const match = todas.filter((c) => (!a.fecha || c.fecha === a.fecha) && (!a.hora || c.hora === a.hora) && (a.fecha || a.hora));
          if (match.length === 1) id = match[0].id;
        }
        if (!id || !(datos.cancelables || []).includes(id)) {
          salida.push(texto(msg("noEntendi")));
          const todas = await store.citasPorIds(datos.cancelables || []);
          salida.push(
            lista(
              fr("cualCancelar", `¿Cuál ${V.cita} deseas cancelar?`),
              todas.map((c) => ({ id: `cancel:${c.id}`, titulo: `${fechaCorta(c.fecha)} ${hora12(c.hora)}`, descripcion: c.servicioNombre })),
              `Ver mis ${V.citas}`
            )
          );
          break;
        }
        const [cita] = await store.citasPorIds([id]);
        await pedirConfirmarCancelacion(cita);
        break;
      }

      case "cancelar_confirmar": {
        if (opcionId === "sicancel" || (!opcionId && (esSi(textoEntrada) || a.intencion === "cancelar"))) {
          const [cita] = await store.citasPorIds([datos.citaCancelar]);
          if (!cita || !puedeCancelar(cita, config, ahora)) {
            estado.paso = "inicio";
            salida.push(texto(msg("muyTarde", { servicio: cita?.servicioNombre || "", hora: cita ? hora12(cita.hora) : "" })));
            break;
          }
          await store.cancelarCita(cita.id, { canceladaPor: "cliente_whatsapp" });
          await store.notificar?.({ tipo: "cancelada", cita });
          salida.push(texto(msg("cancelada", { servicio: cita.servicioNombre, fecha: fechaLarga(cita.fecha), hora: hora12(cita.hora) })));
          const reagendar = datos.reagendar;
          estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
          if (reagendar) {
            Object.assign(datos, estado.datos);
            estado.datos = datos;
            datos.servicioId = cita.servicioId;
            datos.fecha = null;
            datos.hora = null;
            datos.franja = null;
            await empezarAgenda(fr("nuevaCita", `Ahora elijamos tu ${V.nueva} ${V.cita} 👇`));
          }
        } else {
          estado = { paso: "inicio", datos: { clienteId: datos.clienteId, nombre: datos.nombre } };
          salida.push(menuPrincipal(fr("sigueEnPie", `¡Perfecto! Tu ${V.cita} sigue en pie 😊. ¿Te ayudo con algo más?`)));
        }
        break;
      }

      default:
        estado = { paso: "inicio", datos: {} };
        salida.push(menuPrincipal(bienvenida()));
    }
  }

  estado.datos = estado.datos === datos || !estado.datos ? datos : estado.datos;
  estado.saludado = true;
  estado.opciones = idsOfrecidos(salida);
  estado.ts = opciones.marcaTiempo || Date.now();
  // No guardar objetos completos de servicios en el estado
  if (estado.datos.candidatos) estado.datos.candidatos = estado.datos.candidatos.map((s) => ({ id: s.id, nombre: s.nombre }));
  await store.setEstado(tel, estado);
  return { mensajes: salida, estado };
}
