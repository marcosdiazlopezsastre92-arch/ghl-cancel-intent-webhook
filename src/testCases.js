'use strict';

// ============================================================
// MEGA STRESS TEST — ~1000 cases
// 26 categories covering normal cases + extreme edge cases
// Each case is intentionally unique (no duplicates)
// ============================================================

function mkTs(minsAgo) {
  return new Date(Date.now() - minsAgo * 60 * 1000).toISOString();
}
function mkFutureTs(daysAhead) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
}

const RESCHEDULE_LINK = 'Aquí tienes el enlace para mover la llamada: https://api.leadconnectorhq.com/widget/bookings/round-normalrqpm6x';

const APT_1 = { id: 'evt_FUTURE_001', startTime: mkFutureTs(1), calendarName: 'Calendario - VSL', dateAdded: mkTs(60 * 24 * 5) };
const APT_2 = { id: 'evt_FUTURE_002', startTime: mkFutureTs(3), calendarName: 'LM', dateAdded: mkTs(60 * 24 * 3) };
const APT_3 = { id: 'evt_FUTURE_003', startTime: mkFutureTs(5), calendarName: 'Calendario - VSL', dateAdded: mkTs(60 * 24 * 2) };

function leadOnly(category, name, body, opts = {}) {
  return {
    category, name,
    messages: [
      ...(opts.context ? [{ direction: 'outbound', body: opts.context, dateAdded: mkTs(20) }] : []),
      { direction: 'inbound', body, dateAdded: mkTs(2) },
    ],
    appointments: opts.apts || [APT_1],
    expectedIntent: opts.expected,
    ...(opts.delay !== undefined && { expectedDelay: opts.delay }),
    ...(opts.ids !== undefined && { expectedIdsCount: opts.ids }),
  };
}

function exchange(category, name, opts) {
  return {
    category, name,
    messages: opts.messages,
    appointments: opts.apts || [APT_1],
    expectedIntent: opts.expected,
    ...(opts.delay !== undefined && { expectedDelay: opts.delay }),
    ...(opts.ids !== undefined && { expectedIdsCount: opts.ids }),
  };
}

function postLink(category, name, leadBefore, leadAfter, opts = {}) {
  return exchange(category, name, {
    messages: [
      { direction: 'inbound', body: leadBefore, dateAdded: mkTs(20) },
      { direction: 'outbound', body: `Sin problema, ${RESCHEDULE_LINK}`, dateAdded: mkTs(15) },
      { direction: 'inbound', body: leadAfter, dateAdded: mkTs(2) },
    ],
    ...opts,
  });
}

const cases = [];
let counter = 0;
const N = () => String(++counter).padStart(4, '0');

// ============================================================
// G1 — CONFIRMACIONES (50)
// ============================================================
const G1 = [
  ['vale', 'Recordatorio: mañana a las 18h'],
  ['ok', 'Confirmado para mañana'],
  ['perfecto', 'Mañana hablamos'],
  ['genial!', 'Confirmada tu llamada'],
  ['listo', 'Quedamos mañana'],
  ['ahí estoy!', 'Llamada mañana 16h'],
  ['nos vemos mañana', 'Confirmamos?'],
  ['👍', 'Recordatorio de tu llamada'],
  ['✅', 'Confirmada la cita'],
  ['🔥', 'Te paso material'],
  ['sip', 'Mañana a las 17'],
  ['sí', 'Sigue en pie?'],
  ['claro que sí', 'Confirmamos?'],
  ['dale', 'Te paso el zoom'],
  ['venga, hasta mañana', 'Confirmada'],
  ['confirmado', 'Recordatorio llamada'],
  ['anotado, gracias', 'Mañana 11h'],
  ['recibido!', 'Link de Zoom'],
  ['Gracias, ahí estaré conectado', 'Recordatorio'],
  ['yes', 'See you tomorrow!'],
  ['mil gracias, ahí estaré', 'Confirmada'],
  ['arriba esa llamada', 'Mañana lo damos todo'],
  ['✅✅', 'Confirmamos?'],
  ['vamos!', 'Recordatorio'],
  ['aquí andamos', 'Confirmada'],
  ['oki', 'Mañana 18h'],
  ['👌', 'Confirmada'],
  ['💪', 'Mañana hablamos'],
  ['hasta mañana entonces', 'Confirmada'],
  ['allá voy', 'Llamada mañana'],
  ['de cabeza', 'Confirmada'],
  ['cuenta conmigo', 'Mañana 18h'],
  ['copiado', 'Mañana hablamos'],
  ['👍🏻', 'Recordatorio'],
  ['100%', 'Confirmamos?'],
  ['allí nos vemos', 'Mañana'],
  ['todo en orden, hasta mañana', 'Confirmada'],
  ['ok, anoto', 'Llamada mañana'],
  ['sin problema', 'Confirmada'],
  ['😊', 'Mañana hablamos'],
  ['hasta ahora!', 'Llamada en 1h'],
  ['cómo no', 'Confirmamos?'],
  ['por supuesto, ahí estoy', 'Confirmada'],
  ['vale vale, hasta mañana', 'Confirmada'],
  ['confirmadísimo', 'Llamada mañana'],
  ['venga, hablamos!', 'Confirmamos'],
  ['hecho, allí estaré', 'Confirmada'],
  ['🎯', 'Recordatorio'],
  ['suena bien, hasta mañana', 'Confirmada'],
  ['nos vemos en zoom', 'Mañana'],
];
G1.forEach(([msg, ctx]) => cases.push(leadOnly('G1-CONFIRM', `G1-${N()}`, msg, { expected: 'no_action', context: ctx })));

// ============================================================
// G2 — CANCELACIONES CLARAS PRE-LINK (50)
// ============================================================
const G2 = [
  'Marcos, no puedo ir mañana',
  'no podré asistir a la llamada',
  'se me complica la llamada de mañana',
  'mañana no me viene bien',
  'tengo que cancelar la cita',
  'al final no voy a poder',
  'imposible hoy',
  'Marcos no puedo ir a la llamada',
  'cancela la llamada por favor',
  'hoy no puedo, surgió un imprevisto',
  'anula la llamada por favor',
  'no voy a llegar a la llamada',
  'me surgió algo en el trabajo, no puedo',
  'no podré hacer la llamada hoy',
  'perdona Marcos pero cancela',
  'no voy a poder tener la llamada',
  'me cancelo lo de hoy',
  'no va a ser posible hoy',
  'cancélame la cita',
  'me es imposible acudir',
  'finalmente no puedo asistir a la llamada',
  'al final no llego',
  'tengo un imprevisto, no puedo conectarme',
  'no me va a dar tiempo a la llamada',
  'no me cuadra la hora, tengo que cancelar',
  'al final tengo que anular',
  'lo siento, no voy a poder estar',
  'me ha surgido algo y no puedo',
  'va a ser imposible asistir hoy',
  'tengo otra cosa que no puedo posponer',
  'definitivamente no puedo',
  'mejor lo anulamos por favor',
  'no podré estar conectado a esa hora',
  'me ha entrado un compromiso, no puedo',
  'cancela porfa, surgió algo urgente',
  'imposible, perdona',
  'lo siento mucho pero no llego a la llamada',
  'lamentablemente no voy a poder',
  'no me será posible asistir',
  'tengo que decir que no puedo',
  'no soy capaz de conectarme hoy',
  'no podré porque me ha salido algo',
  'tengo que anular, lo siento',
  'cancela mejor la llamada',
  'lo siento, me quedo sin opciones, no puedo',
  'la cancela porfa, no llego',
  'me veo obligado a cancelar',
  'no puedo asistir definitivo',
  'mira, no voy a poder',
  'siento decírtelo, no podré ir',
];
G2.forEach(msg => cases.push(leadOnly('G2-CANCEL-CLEAR', `G2-${N()}`, msg, { expected: 'cancel_with_followup' })));

// ============================================================
// G3 — MÉDICAS (40)
// ============================================================
const G3 = [
  ['tengo un dolor de cabeza horrible, no puedo hoy', 3],
  ['estoy mareado, no creo que pueda', 3],
  ['estoy resfriado, mejor lo dejamos', 3],
  ['tengo gripe fuerte, llevo en cama 3 días', 7],
  ['mi madre está en el hospital, no puedo hoy', 7],
  ['mi hijo se ha puesto malo, al médico', 3],
  ['me sale una cita médica de urgencia', 3],
  ['tengo 38 de fiebre, no estoy fino', 3],
  ['me operan mañana, estaré fuera 1 semana', 7],
  ['he dado positivo en covid, me quedo en casa', 7],
  ['no me siento bien hoy, mejor otro día', 3],
  ['estoy recuperándome de una operación', 7],
  ['tengo un cólico nefrítico, voy al hospital', 7],
  ['me ha entrado una migraña tremenda', 3],
  ['tengo a mi padre delicado, no salgo del hospital', 7],
  ['estoy con un ataque de ansiedad fuerte', 3],
  ['tengo pruebas médicas esta semana', 7],
  ['llevo todo el día vomitando', 3],
  ['estoy de baja médica una semana', 7],
  ['me he hecho daño en la espalda', 3],
  ['me ha dado un lumbago, no me puedo mover', 3],
  ['tengo gastroenteritis fuerte', 3],
  ['me ha dado alergia y estoy mal', 3],
  ['estoy con vertigo, no puedo ni levantarme', 3],
  ['estoy hospitalizado, sálgame en unos días', 7],
  ['mi pareja está enferma y la cuido', 3],
  ['urgencias me llaman para mi madre', 7],
  ['estoy con la regla muy mala hoy', 3],
  ['me ha dado un brote de migrañas crónicas', 7],
  ['estoy mal del estómago, no puedo', 3],
  ['tengo un esguince muy malo', 3],
  ['estoy con bronquitis, no puedo hablar', 7],
  ['tengo dolor de oídos brutal', 3],
  ['me han ingresado de urgencia esta noche', 7],
  ['me han operado de la rodilla esta mañana', 7],
  ['tengo intoxicación, llevo en cama desde ayer', 3],
  ['tengo crisis de pánico, no estoy bien', 3],
  ['mi hija con fiebre, tengo que ir al pediatra', 3],
  ['estoy en quimio esta semana, imposible', 7],
  ['acabo de salir del hospital, necesito descansar', 7],
];
G3.forEach(([msg, delay]) => cases.push(leadOnly('G3-MEDICAL', `G3-${N()}`, msg, { expected: 'cancel_with_followup', delay })));

// ============================================================
// G4 — VIAJES Y AGENDA (40)
// ============================================================
const G4 = [
  ['estoy de viaje de trabajo toda la semana', 7],
  ['esta semana fatal, imposible', 7],
  ['tengo un vuelo justo a esa hora', 3],
  ['estoy en una conferencia esta semana', 7],
  ['me voy de vacaciones, hablamos a la vuelta', 7],
  ['tengo una boda esta semana', 7],
  ['estoy de mudanza el finde, hablamos la próxima', 7],
  ['estoy de viaje familiar, regreso domingo', 7],
  ['esta semana a tope con cierre trimestre', 7],
  ['tengo un evento ese día, no puedo', 3],
  ['estoy en un curso intensivo toda la semana', 7],
  ['lo del coche, voy a estar liado todo el día', 3],
  ['estoy fuera de la ciudad hasta viernes', 7],
  ['cumple de mi hija ese día', 3],
  ['me pilla en el aeropuerto a esa hora', 3],
  ['reunión con mi jefe a la misma hora', 1],
  ['estoy fuera todo el fin de semana', 7],
  ['me toca quedarme hasta tarde currando', 1],
  ['tengo un funeral mañana', 7],
  ['evento largo toda la semana, hablamos la siguiente', 7],
  ['comunión sobrino, no puedo', 3],
  ['tengo una entrevista de trabajo esa tarde', 1],
  ['tengo viaje a Madrid esa mañana', 3],
  ['me voy a Lisboa todo el finde', 7],
  ['tengo curso del trabajo esta semana entera', 7],
  ['exámenes finales esta semana, imposible', 7],
  ['llevo a mi madre al notario ese día', 1],
  ['cita en hacienda esa mañana', 1],
  ['inauguración de mi negocio ese día', 7],
  ['oposiciones esta semana, no puedo nada', 7],
  ['voy a tope de obras en casa esta semana', 7],
  ['retiro espiritual hasta el lunes', 7],
  ['encuentro de empresa esa tarde', 1],
  ['me voy a Asturias el finde, hablamos en una semana', 7],
  ['feria de fitness, estoy todo el día allí', 1],
  ['casamiento de mi prima ese sábado', 7],
  ['ceremonia familiar ese día, imposible', 7],
  ['tengo guardia en el trabajo toda la semana', 7],
  ['me han llamado del trabajo para cubrir', 1],
  ['me voy a Tenerife unos días, hablamos cuando vuelva', 7],
];
G4.forEach(([msg, delay]) => cases.push(leadOnly('G4-TRAVEL', `G4-${N()}`, msg, { expected: 'cancel_with_followup', delay })));

// ============================================================
// G5 — HARD CANCEL / RECHAZO DEL PROGRAMA (40)
// ============================================================
const G5 = [
  'ya no me interesa',
  'voy a tirar con otro entrenador',
  'quítame de la lista por favor',
  'no me contactes más',
  'déjame en paz',
  'borra mis datos por favor',
  'la verdad perdí el interés',
  'he decidido irme con otro coach',
  'por favor no me molestes más',
  'voy a tirar con entrenador presencial. Gracias',
  'deja de mandarme mensajes',
  'cambié de opinión, no me interesa el programa',
  'cancela mi suscripción a tus mensajes',
  'bórrame de tu lista de contactos',
  'no quiero saber nada más, gracias',
  'paso completamente del tema, gracias por entender',
  'te agradezco todo pero no me interesa, prefiero seguir solo',
  'voy a empezar con otra agencia, gracias',
  'no me llames más por favor',
  'date de baja mi número de tu sistema',
  'no me vale la pena, gracias',
  'cancelo todo contigo, gracias',
  'prefiero hacerlo solo, no me contactes más',
  'lo he pensado y no es para mí',
  'no me convence el enfoque, no sigo',
  'he decidido que no es lo mío',
  'cierra mi expediente, gracias por todo',
  'no quiero continuar, gracias',
  'prefiero parar aquí',
  'desisto definitivamente',
  'voy a buscar otra cosa, gracias',
  'me retiro del proceso, gracias',
  'paso de seguir',
  'me bajo definitivamente',
  'no insistas más por favor',
  'es definitivo, no me interesa',
  'olvídate de mí',
  'borra todo, no quiero seguir',
  'voy con mi médico/nutricionista, gracias',
  'definitivamente no es para mí',
];
G5.forEach(msg => cases.push(leadOnly('G5-HARD-CANCEL', `G5-${N()}`, msg, { expected: 'cancel_no_followup' })));

// ============================================================
// G6 — PREGUNTAS OPERATIVAS (50)
// ============================================================
const G6 = [
  'la llamada es por Zoom o Meet?',
  'oye Marcos a qué hora era?',
  'sigue en pie lo de hoy?',
  'confírmame que tenemos llamada hoy porfa',
  'me pasas el link de la llamada?',
  'cuánto dura la llamada?',
  'tengo que preparar algo?',
  'me puedes llamar al móvil?',
  'vendrá alguien más a la llamada?',
  'se graba la llamada?',
  'la llamada es con cámara?',
  'me mandas un recordatorio antes?',
  'me has mandado el zoom nuevo?',
  'cuánta gente hay en el grupo?',
  'puedo usar mis datos del año pasado?',
  'qué precio tiene el programa?',
  'cómo se hace el pago?',
  'cuál es el formato de la llamada?',
  'la llamada es 1 a 1 o en grupo?',
  'con quién voy a hablar exactamente?',
  'hay algo que tenga que mirar antes?',
  'hasta cuándo puedo cancelar?',
  'recibiste mi confirmación?',
  'cuántas horas faltan para la llamada?',
  'tengo dudas, te las pongo aquí o en la call?',
  'puedo conectarme desde el móvil?',
  'qué pasa si llega tarde un poco?',
  'la llamada es en español o inglés?',
  'voy a estar en transporte, sirve solo audio?',
  'cuánto cuesta el programa después?',
  'es necesario ir cámara on?',
  'hay material previo que mirar?',
  'puedo mandar mis preguntas antes?',
  'cuánto tiempo lleváis con esto?',
  'qué incluye exactamente?',
  'puedo invitar a un amigo a la llamada?',
  'cuántos coaches sois?',
  'qué herramientas usáis?',
  'hay garantía de devolución?',
  'puedo pausarlo si me hace falta?',
  'tienes algún caso de éxito que pueda ver?',
  'esto vale para personas con lesiones?',
  'hay programa específico para mujeres?',
  'es online o presencial?',
  'dónde firmo si me uno?',
  'cuándo empezaríamos a entrenar si entro?',
  'hay seguimiento personal?',
  'puedo hablar con alguno de tus clientes?',
  'me das tu Instagram?',
  'qué hace que seáis diferentes a otros coaches?',
];
G6.forEach(msg => cases.push(leadOnly('G6-QUESTIONS', `G6-${N()}`, msg, { expected: 'no_action' })));

// ============================================================
// G7 — TIME TWEAKS (40)
// ============================================================
const G7 = [
  'podemos hacerla a las 18 en vez de las 16?',
  'puedo conectarme media hora antes?',
  'nos vemos un rato más tarde si puedes',
  'me viene mejor 30 min más tarde',
  'podemos a las 18:30 en vez de a las 18?',
  'puedo a las 20 mejor?',
  'puedo retrasar 15 minutos?',
  'me pasas a otra hora del mismo día?',
  'quedamos a las 21 en vez de las 19',
  'podemos hacer la llamada en otro rato hoy?',
  'no puedo a las 19 pero sí a las 20',
  'puedes hoy a las 14:30 en vez de 14?',
  'podemos hacerla un poco más tarde?',
  'mejor a las 20 que a las 17?',
  'cambiamos a la noche en vez de la tarde?',
  'podemos atrasar 15min?',
  'a la tarde sí pero a esa hora no',
  'puedo a las 16, 17 o 18, lo que te venga',
  'acomódame mejor a las 19',
  'mejor vamos un par de horas después?',
  'puedo a las 8 en vez de a las 10?',
  'cambio de hora dentro de hoy mismo, pa la tarde',
  'me viene mejor a las 12 en vez de a las 13',
  'oye 15 min antes podemos?',
  'a las 22 mejor?',
  'puedes a las 11 en vez de 10:30?',
  'me sale algo a primera hora, mejor por la tarde',
  'a las 13:45 puedes en vez de las 13:30?',
  'puedo más tarde dentro de hoy?',
  'cambiamos a las 7 de la tarde?',
  'puedo a las 18 y media hoy?',
  'oye, una hora antes podemos?',
  'me apañas 45 min después?',
  'puedo en horario distinto hoy mismo?',
  'a la noche mejor, a las 22?',
  'mejor a la mañana, a las 9?',
  'no a las 16 pero sí a las 16:30?',
  'a las 19:00 puedo, a las 18 no',
  'a la una mejor en vez de las dos?',
  'puedes 10 min antes?',
];
G7.forEach(msg => cases.push(leadOnly('G7-TIME-TWEAK', `G7-${N()}`, msg, { expected: 'no_action' })));

// ============================================================
// G8 — POST-LINK ACEPTACIÓN (50)
// ============================================================
const G8 = [
  ['no sé si podré asistir', 'vale gracias!'],
  ['tengo lío esta tarde', 'genial, lo cambio ahora mismo, gracias'],
  ['va a ser complicado', 'perfecto, ahora reagendo'],
  ['no podré a esa hora', 'dame'],
  ['me complica el día', 'miro y reagendo, gracias'],
  ['no me viene bien hoy', 'genial gracias'],
  ['no sé si llego', 'vale cuando pueda reagendo'],
  ['imposible hoy', 'ya cambio la cita, gracias'],
  ['no puedo a esa hora', 'mil gracias, reagendo ahora'],
  ['lo dejamos?', 'le doy, gracias'],
  ['no podré ir', 'cambiando ahora, gracias'],
  ['me surge algo', 'ya reagendé, gracias'],
  ['mejor más tarde', 'hecho, gracias'],
  ['no creo que pueda', 'lo reagendo yo, gracias'],
  ['esa fecha no me viene', 'cambio la fecha, gracias'],
  ['no llego', 'mejor así, gracias'],
  ['no puedo asistir', 'bingo, lo cambio'],
  ['mejor reagendamos', 'genial, cambio ahora mismo'],
  ['no podré llamarte', 'paso a cambiarla, gracias'],
  ['no me viene bien', 'okk, cambio ahora'],
  ['lo dejamos para otro día', 'eso es, gracias'],
  ['no puedo hoy', 'perfecto, cambio para mañana'],
  ['imposible esta semana', 'buscaré hueco, gracias'],
  ['no podré', 'gracias, cambio ahora'],
  ['cancelo', 'thanks, lo miro ya'],
  ['esta semana imposible', 'voy a buscar otra fecha'],
  ['mejor reagendar', 'sí, voy a cambiarla'],
  ['no me va a dar tiempo', 'lo cambio entonces, gracias'],
  ['no soy capaz hoy', 'ahora cambio, mil gracias'],
  ['esta semana fatal', 'voy a moverla, gracias'],
  ['cancelo lo de mañana', 'reagendo ya mismo'],
  ['no llego ni de coña', 'pongo otra fecha'],
  ['imposible llegar', 'ya cambio, gracias'],
  ['tendré que cancelar', 'mejor lo muevo, gracias'],
  ['no podré asistir', 'cambio fecha, mil gracias'],
  ['perdón, no puedo', 'reagendo ahora mismo'],
  ['no llego a tiempo', 'lo muevo, gracias'],
  ['no puedo definitivo', 'paso a reagendar'],
  ['ay no llego', 'ya elijo otra fecha'],
  ['lo siento mucho', 'reagendo ahora'],
  ['me veo obligado a moverla', 'gracias por el link, lo cambio'],
  ['cancela porfa', 'mil gracias, ahora reagendo'],
  ['ay tengo lío', 'lo cambio entonces!'],
  ['necesito moverla', 'gracias, ya elijo otra hora'],
  ['no puedo a esa hora', 'lo cambio, mil gracias'],
  ['cambiando ya', 'paso al link, mil gracias'],
  ['imposible', 'reagendando, gracias'],
  ['otro día mejor', 'eligo otra fecha, gracias'],
  ['cancela esto', 'ya lo muevo'],
  ['no estaré', 'paso a moverla, mil gracias'],
];
G8.forEach(([before, after]) => cases.push(postLink('G8-LINK-ACCEPT', `G8-${N()}`, before, after, { expected: 'cancel_with_followup' })));

// ============================================================
// G9 — POST-LINK RECHAZO (40)
// ============================================================
const G9 = [
  ['no sé si podré', 'vale sí puedo asistir'],
  ['no sé si llego', 'al final sí voy, gracias'],
  ['va estar dificil', 'no no, déjalo, iré'],
  ['no podré', 'olvídalo, sí voy'],
  ['no me cuadra', 'al final sí asisto'],
  ['duda asistir', 'tranquilo, voy'],
  ['igual no llego', 'al final lo resolví, voy'],
  ['no podré ir', 'no, no cambies nada, sí puedo'],
  ['no creo que pueda', 'sí puedo al final'],
  ['no llego', 'iré, tranquilo'],
  ['no me viene', 'no, voy sin problema'],
  ['no podré', 'no hay cambios, voy'],
  ['imposible hoy', 'al final sí asisto a la llamada'],
  ['mejor reagendamos', 'no espera mejor déjalo, sí puedo'],
  ['no podre llamada', 'no hace falta cambiarla, voy'],
  ['no creo que vaya', 'mantengo la cita, gracias'],
  ['cancelo', 'no, no, sí voy'],
  ['no podemos quedar', 'iremos, no te preocupes'],
  ['mejor cancela', 'confirma la cita que sí voy'],
  ['no llego', 'no, todo sigue igual, iré'],
  ['va a estar mal', 'me organizo, ahí estaré'],
  ['no podré asistir', 'lo arregló mi jefe, voy a poder'],
  ['no creo que llegue', 'me da tiempo, no muevas nada'],
  ['mejor moverlo', 'al final no hace falta, voy'],
  ['imposible casi seguro', 'al final voy, hasta luego'],
  ['no puedo seguramente', 'me lo apaño, voy a estar'],
  ['casi seguro no llego', 'cambio de planes, sí voy'],
  ['no voy a poder', 'me lo gestiono, voy'],
  ['no llegaré', 'ya está, voy a poder'],
  ['me será imposible', 'al final puedo, mantén la cita'],
  ['no podré dar la cita', 'no, sí puedo'],
  ['ay no llego', 'sí puedo, no muevas nada'],
  ['no podré conectar', 'me da tiempo, voy'],
  ['va a ser que no', 'al final sí, ahí estaré'],
  ['imposible', 'no, sí voy a estar'],
  ['lo veo difícil', 'me apaño, ahí estoy'],
  ['no creo que', 'tranquilo, voy'],
  ['mejor lo cancelamos', 'no espera, sí puedo'],
  ['no llego a la cita', 'me organicé, voy'],
  ['cancela mejor', 'no, sí voy, déjala'],
];
G9.forEach(([before, after]) => cases.push(postLink('G9-LINK-REJECT', `G9-${N()}`, before, after, { expected: 'no_action' })));

// ============================================================
// G10 — POST-LINK AMBIGUO (40)
// ============================================================
const G10 = [
  ['no sé', 'vale'],
  ['no sé si llegaré', 'ok'],
  ['no podré', 'gracias'],
  ['tengo dudas', 'déjame pensarlo y te digo'],
  ['no sé', 'luego te digo'],
  ['duda', 'ahora miro'],
  ['no sé', 'mmm'],
  ['igual no llego', 'okey'],
  ['no sé', '🤔'],
  ['no podré', 'veo'],
  ['no sé si llego', 'ya'],
  ['va estar dificil', 'ok ya te digo'],
  ['igual cancelo', 'ahora veo'],
  ['no podré', 'luego miro a ver'],
  ['mejor reagendar', 'te digo más tarde'],
  ['duda asistir', 'vale lo pensaré'],
  ['no sé', 'no sé aún'],
  ['igual no voy', 'ya veré'],
  ['no sé si llego', 'ahora no puedo mirarlo'],
  ['imposible', 'luego decido'],
  ['no me viene bien', 'lo pensaré'],
  ['cancelo', 'ahora veo, te aviso'],
  ['no llego', 'a ver, ahora miro'],
  ['ay no sé', 'okk'],
  ['va estar dificil', 'mmm bueno'],
  ['no podré', 'me lo pienso'],
  ['cancelo posible', 'ya te confirmo'],
  ['no llego seguro', 'cuando pueda lo miro'],
  ['imposible casi', 'okk, te digo'],
  ['cancelo', 'ya veo qué hago'],
  ['mejor cancelar', 'lo veo en un rato'],
  ['no llego a tiempo seguro', 'vale, ahora te digo'],
  ['no soy capaz hoy', 'ahora te confirmo'],
  ['va estar mal', 'a ver qué hago'],
  ['no podré', 'mmm, dame un rato'],
  ['imposible', 'a ver, te digo'],
  ['ay', 'jaja vale'],
  ['cancelo', 'gracias por avisar'],
  ['no llego', 'vale, ya veré'],
  ['no podré seguro', 'ya te confirmo'],
];
G10.forEach(([before, after]) => cases.push(postLink('G10-LINK-AMBIG', `G10-${N()}`, before, after, { expected: 'no_action' })));

// ============================================================
// G11 — MULTI-CITA PARTIAL (30)
// ============================================================
const G11Cases = [
  ['Tienes 2 llamadas, martes y jueves', 'cancela solo la del martes, la del jueves la mantengo'],
  ['Te recuerdo: martes y jueves', 'la del jueves mantén, cancela la del martes'],
  ['Llamadas martes y jueves', 'cancela la primera, la segunda voy'],
  ['Recuerda tus 2 llamadas', 'martes voy pero jueves no podré'],
  ['2 llamadas agendadas', 'anula solo una, la del lunes'],
  ['Llamadas: día 17 y día 19', 'cancela la del 17, la del 19 mantén'],
  ['Recuerda las 2 llamadas', 'la segunda no puedo, la primera sí'],
  ['Tienes llamada mañana y otra el viernes', 'la de mañana voy, la del viernes cancela'],
  ['2 llamadas: martes y jueves', 'no puedo el martes, déjame solo el jueves'],
  ['Recuerda tus 2 llamadas', 'mantengo solo la del jueves, la otra cancela'],
  ['2 calls programadas', 'anula la del lunes, voy a la otra'],
  ['2 cositas agendadas', 'no puedo a una, la del martes cancela'],
  ['Llamadas: mañana y pasado', 'cancela una, dejo la de pasado'],
  ['Tu agenda: mañana 16h y jueves 18h', 'mantengo la de jueves, la de mañana anúlala'],
  ['2 llamadas confirmadas', 'cancela la segunda? La primera sí puedo'],
  ['2 sesiones programadas', 'quita solo una, la primera, la segunda sí voy'],
  ['Recordatorio: 2 llamadas', 'conservo la segunda, cancela la primera'],
  ['Llamadas: 17 abril y 24 abril', 'solo cancelo la del 17, la del 24 voy'],
  ['Tienes martes y jueves', 'me deshago de la del martes, sigo con la del jueves'],
  ['Tu agenda esta semana: 2 calls', 'quita la del primer día, voy a la segunda'],
  ['Llamadas: este lunes y martes', 'cancela la del lunes, voy al martes'],
  ['Te recuerdo: hoy y mañana', 'la de hoy cancela, mañana sí voy'],
  ['2 calls esta semana', 'la primera mejor anula, segunda mantén'],
  ['Doble llamada esta semana', 'anúlame la primera, segunda voy ok'],
  ['Tu plan: 2 calls', 'una cancela, la del jueves seguro voy'],
  ['Citas: lunes y viernes', 'lunes no llego, viernes voy'],
  ['Recordatorio: tus 2 sesiones', 'mantengo la del viernes, lunes cancela'],
  ['Dos llamadas próximas', 'no puedo a la primera, segunda sí'],
  ['Tienes 2 fechas', 'cancélame solo la próxima, la siguiente sí voy'],
  ['Llamadas semana próxima: 2', 'quita la del lunes, dejo la del miércoles'],
];
G11Cases.forEach(([coachMsg, leadMsg]) => cases.push(exchange('G11-PARTIAL', `G11-${N()}`, {
  messages: [
    { direction: 'outbound', body: coachMsg, dateAdded: mkTs(20) },
    { direction: 'inbound', body: leadMsg, dateAdded: mkTs(2) },
  ],
  apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
})));

// ============================================================
// G12 — MULTI-CITA BOTH (25)
// ============================================================
const G12Cases = [
  ['Tienes 2 llamadas agendadas', 'cancela las dos por favor', 2],
  ['2 llamadas confirmadas', 'no puedo a ninguna, esta semana imposible', 2],
  ['3 calls esta semana', 'anula todas las llamadas que tengo', 3],
  ['2 sesiones programadas', 'cancela todo, esta semana imposible', 2],
  ['2 llamadas programadas', 'no llego a ninguna, perdona', 2],
  ['2 calls', 'cancela todas mis llamadas por favor', 2],
  ['2 llamadas activas', 'imposible mantener ninguna llamada esta semana', 2],
  ['2 citas', 'anula todo, gracias', 2],
  ['3 llamadas próximas', 'tienes que cancelar mis citas, no voy a poder', 3],
  ['2 llamadas confirmadas', 'borra todas mis llamadas activas', 2],
  ['2 calls esta semana', 'no voy a asistir a nada esta semana', 2],
  ['Tus 2 llamadas pendientes', 'las dos llamadas las tengo que cancelar', 2],
  ['2 sesiones próximas', 'quita todo de mi calendario, hablamos otra semana', 2],
  ['3 citas activas', 'cancela las 3 llamadas porfa, no puedo esta semana', 3],
  ['Tus 2 calls', 'no voy a ir a ninguna, cancela todo', 2],
  ['Doble llamada agendada', 'imposible, anula las 2', 2],
  ['2 fechas reservadas', 'mejor borra todo, no me da la semana', 2],
  ['Recordatorio: 2 llamadas', 'no puedo a ninguna, todo cancelado por favor', 2],
  ['Tu doble cita', 'imposible las 2, perdona', 2],
  ['2 calls planificadas', 'cancela todo, surgió algo', 2],
  ['Llamadas confirmadas', 'tira para abajo las dos, no llego', 2],
  ['Tu agenda: 2 sesiones', 'anula todo, semana fatal', 2],
  ['2 fechas', 'mejor que ninguna, cancela todo', 2],
  ['Tu doble compromiso', 'imposible, cancela ambas', 2],
  ['2 calls', 'no llego a ninguna, anula todo gracias', 2],
];
G12Cases.forEach(([coachMsg, leadMsg, idsCount]) => cases.push(exchange('G12-BOTH', `G12-${N()}`, {
  messages: [
    { direction: 'outbound', body: coachMsg, dateAdded: mkTs(20) },
    { direction: 'inbound', body: leadMsg, dateAdded: mkTs(2) },
  ],
  apts: idsCount === 3 ? [APT_1, APT_2, APT_3] : [APT_1, APT_2], expected: 'cancel_with_followup', ids: idsCount,
})));

// ============================================================
// G13 — FLIP-FLOP (40)
// ============================================================
const G13Cases = [
  [['no creo que pueda', 'ah espera sí, voy'], 'no_action'],
  [['ahí estoy', 'no espera, al final no puedo'], 'cancel_with_followup'],
  [['no puedo', 'sí puedo', 'no, mejor lo dejo', 'no espera, vale, al final voy sí'], 'no_action'],
  [['sí voy', 'ah no, no podré', 'espera sí puedo', 'no, ya definitivo, no puedo, cancela'], 'cancel_with_followup'],
  [['cancela', 'no espera, sí voy', 'no, mejor cancela definitivo'], 'cancel_with_followup'],
  [['no sé si ir', 'me lo pienso un momento', 'pues nada, voy a ir, ahí estaré'], 'no_action'],
  [['creo que no podré', 'sí, definitivo, no voy a poder'], 'cancel_with_followup'],
  [['me lo pienso', 'no sé', 'al final voy, gracias'], 'no_action'],
  [['no puedo asistir hoy', 'ah espera, sí puedo, voy'], 'no_action'],
  [['voy', 'no espera, no puedo, cancela'], 'cancel_with_followup'],
  [['vale ahí estoy', 'oye no sé si llego', 'no nada, voy, hasta ahora'], 'no_action'],
  [['sí voy', 'no espera', 'me lo pienso', 'finalmente no voy a poder, cancela'], 'cancel_with_followup'],
  [['cancela', 'no espera mantén', 'no mejor cancela', 'no no, mantén, voy a ir'], 'no_action'],
  [['voy', 'voy fijo', 'ah no, me ha surgido algo, cancela'], 'cancel_with_followup'],
  [['no puedo', 'espera sí puedo', 'no, no puedo', 'sí puedo, definitivo'], 'no_action'],
  [['cancela porfa', 'sí, cancela definitivo, no voy a poder esta semana'], 'cancel_with_followup'],
  [['no puedo hoy', 'mañana sí puedo no?', 'no espera, no, ni hoy ni mañana, cancela'], 'cancel_with_followup'],
  [['no creo que pueda', 'estoy mirando', 'ya, sí, sí puedo, allí nos vemos'], 'no_action'],
  [['no, no llego', 'espera, miro la agenda', 'sí puedo, voy', 'no, definitivo no, cancela'], 'cancel_with_followup'],
  [['no podré', 'me cambian los planes', 'sí, ahí estaré', 'definitivo!'], 'no_action'],
  [['cancela', 'espera, miro a ver', 'al final si puedo, no cancela'], 'no_action'],
  [['voy', 'igual no llego', 'mejor cancela', 'no espera, llego justo, voy'], 'no_action'],
  [['no llego', 'ah no, sí llego, voy', 'no, no voy', 'cancela definitivo'], 'cancel_with_followup'],
  [['mejor cancela', 'no espera no, sí voy', 'voy sí o sí'], 'no_action'],
  [['no puedo', 'no espera sí', 'no en serio no puedo'], 'cancel_with_followup'],
  [['ahí estaré', 'aunque igual no', 'no, sí voy fijo'], 'no_action'],
  [['confirmado', 'oye una cosa', 'al final no puedo'], 'cancel_with_followup'],
  [['voy', 'me sale algo', 'creo que llego', 'sí, sí voy'], 'no_action'],
  [['no voy', 'sí voy', 'no voy', 'no voy definitivo'], 'cancel_with_followup'],
  [['sí voy', 'no voy', 'sí voy', 'sí voy seguro'], 'no_action'],
  [['cancela', 'espera no, mantenla', 'mantén sí, voy'], 'no_action'],
  [['ay, no creo poder', 'lo intento', 'al final no, cancela'], 'cancel_with_followup'],
  [['imposible', 'espera me organizo', 'no, no llego, cancela'], 'cancel_with_followup'],
  [['no llego', 'a ver si me organizo', 'sí llego, voy'], 'no_action'],
  [['cancela', 'espera no, déjala', 'sí voy, déjala'], 'no_action'],
  [['voy', 'ay no', 'voy fijo', 'fijo voy'], 'no_action'],
  [['no podré', 'sí puedo', 'no en serio', 'no podré, cancela'], 'cancel_with_followup'],
  [['cancela', 'no espera', 'mantén', 'no mantén, voy a ir'], 'no_action'],
  [['cancela', 'cancela definitivamente', 'sí, cancela'], 'cancel_with_followup'],
  [['voy', 'voy seguro', 'no espera, no llego, cancela'], 'cancel_with_followup'],
];
G13Cases.forEach(([msgs, expected]) => {
  cases.push(exchange('G13-FLIP-FLOP', `G13-${N()}`, {
    messages: msgs.map((m, i) => ({ direction: 'inbound', body: m, dateAdded: mkTs(30 - i * 7) })),
    expected,
  }));
});

// ============================================================
// G14 — MEDIA (50)
// ============================================================
const mediaCases = [
  [['voice.mp4'], '', 'audio_needs_review'],
  [['audio.ogg'], '', 'audio_needs_review'],
  [['photo.jpg'], '', 'no_action'],
  [['screenshot.png'], '', 'no_action'],
  [['doc.pdf'], '', 'no_action'],
  [['sticker.webp'], '', 'no_action'],
  [['gif.gif'], '', 'no_action'],
  [['audio.mp3'], '', 'audio_needs_review'],
  [['ig.mp4'], '', 'audio_needs_review'],
  [['1.jpg', '2.jpg'], '', 'no_action'],
  [['1.jpg', 'voice.mp4'], '', 'audio_needs_review'],
  [[], 'https://something.com/link', 'no_action'],
  [[], '😊', 'no_action'],
  [[], '😢', 'no_action'],
  [[], '👏', 'no_action'],
  [[], '🤷', 'no_action'],
  [['video.mov'], '', 'audio_needs_review'],
  [['photo.webp'], '', 'no_action'],
  [['vcard.vcf'], '', 'no_action'],
  [['contact.vcf'], '', 'no_action'],
  [['audio.m4a'], '', 'audio_needs_review'],
  [['mensaje.opus'], '', 'audio_needs_review'],
  [['imagen.heic'], '', 'no_action'],
  [['document.docx'], '', 'no_action'],
  [['screenshot2.png'], '', 'no_action'],
  [['firma.svg'], '', 'no_action'],
  [['video-corto.mp4'], '', 'audio_needs_review'],
  [['captura.jpeg'], '', 'no_action'],
  [['planilla.xlsx'], '', 'no_action'],
  [['voz.wav'], '', 'audio_needs_review'],
];
mediaCases.forEach(([atts, body, expected]) => {
  const msg = { direction: 'inbound', body, dateAdded: mkTs(2) };
  if (atts.length) msg.attachments = atts.map(a => `https://example.com/${a}`);
  cases.push(exchange('G14-MEDIA', `G14-${N()}`, { messages: [msg], expected }));
});

const mixedMedia = [
  ['no podré ir a la llamada', 'cancel_with_followup'],
  ['ahí estaré, gracias', 'no_action'],
  ['perdona, no llego', 'cancel_with_followup'],
  ['vale, mañana hablamos', 'no_action'],
  ['cancela porfa', 'cancel_with_followup'],
  ['link funciona?', 'no_action'],
  ['voy a llegar tarde 10 min', 'no_action'],
  ['mañana imposible', 'cancel_with_followup'],
  ['recibo, hasta mañana', 'no_action'],
  ['confírmame el link', 'no_action'],
  ['envío esto, no podré', 'cancel_with_followup'],
  ['mira lo que mando, todo en orden', 'no_action'],
  ['esto es lo último, no voy', 'cancel_with_followup'],
  ['lo dejamos para luego', 'cancel_with_followup'],
  ['confirmo y mando esto', 'no_action'],
  ['llego en 5 min', 'no_action'],
  ['todo bien, voy', 'no_action'],
  ['ay no llego, perdona', 'cancel_with_followup'],
  ['gracias por el video', 'no_action'],
  ['no me funciona el link', 'no_action'],
];
mixedMedia.forEach(([body, expected]) => cases.push(exchange('G14-MEDIA', `G14-${N()}`, {
  messages: [{ direction: 'inbound', body, attachments: ['https://example.com/photo.jpg'], dateAdded: mkTs(2) }],
  expected,
})));

// ============================================================
// G15 — COLOQUIAL / TYPOS (50)
// ============================================================
const G15Cases = [
  ['mañana noay manera de q vaya', 'cancel_with_followup'],
  ['marcos no puedoo ir tio', 'cancel_with_followup'],
  ['ke no puedo ir tioo', 'cancel_with_followup'],
  ['xfaa cancelaaa', 'cancel_with_followup'],
  ['porfa cancelame', 'cancel_with_followup'],
  ['tio paso de esto, gracias', 'cancel_no_followup'],
  ['no llga', 'cancel_with_followup'],
  ['cncl', 'cancel_with_followup'],
  ['mr no puedo', 'cancel_with_followup'],
  ['tas loco si crees que voy a esa hora bro', 'cancel_with_followup'],
  ['noo pueod', 'cancel_with_followup'],
  ['na na, dejalo bro', 'cancel_with_followup'],
  ['vsa, cancela la llamada', 'cancel_with_followup'],
  ['cmpadre no voy a llegar', 'cancel_with_followup'],
  ['jefee se me complica, mañana imposible', 'cancel_with_followup'],
  ['na, paso de la llamada', 'cancel_with_followup'],
  ['no soy capaz de mantenerla esta vez tio', 'cancel_with_followup'],
  ['cncl la llmd porfa', 'cancel_with_followup'],
  ['cncl x favorrr', 'cancel_with_followup'],
  ['noooo puedoo manana sorry tio', 'cancel_with_followup'],
  ['jvr, paso bro, paso del todo', 'cancel_no_followup'],
  ['no podre tio, lo siento', 'cancel_with_followup'],
  ['ayrrr no voy a podeer mañana', 'cancel_with_followup'],
  ['noo q va, q va, no llego', 'cancel_with_followup'],
  ['marcos cancelaa porfaa', 'cancel_with_followup'],
  ['t escribo q no voy', 'cancel_with_followup'],
  ['na mejor lo dejmos', 'cancel_with_followup'],
  ['m anula la llamada', 'cancel_with_followup'],
  ['jo no puedo manana', 'cancel_with_followup'],
  ['marcos imposible ir', 'cancel_with_followup'],
  ['ke imposible bro', 'cancel_with_followup'],
  ['cancela ke imposible', 'cancel_with_followup'],
  ['no puedo bro, otra vez sera', 'cancel_with_followup'],
  ['anula mejor, no podre tio', 'cancel_with_followup'],
  ['jaja cancela porfa, surgio algo', 'cancel_with_followup'],
  ['mejor noo, paso', 'cancel_with_followup'],
  ['noo es definitivo, cancela', 'cancel_with_followup'],
  ['ke vaaa, no llego', 'cancel_with_followup'],
  ['tronco no podre', 'cancel_with_followup'],
  ['anula esoo porfa', 'cancel_with_followup'],
  ['ahi mismo, vamos', 'no_action'],
  ['grcs tio, ahi estoy', 'no_action'],
  ['perfectoooo nos vmos manana', 'no_action'],
  ['jajaja vale ahi estoy', 'no_action'],
  ['oki tronco, manana hablamos', 'no_action'],
  ['noses si llgo', 'no_action'],
  ['vle ahi vere si llego', 'no_action'],
  ['vergaaa cancela manooo (latino)', 'cancel_with_followup'],
  ['no manchess, no llego wey', 'cancel_with_followup'],
  ['paso, no qiero seguir, gracias', 'cancel_no_followup'],
];
G15Cases.forEach(([msg, expected]) => {
  const opts = { expected };
  if (msg.includes('ahi') || msg.includes('vle') || msg.includes('oki')) opts.context = 'Mañana hablamos';
  cases.push(leadOnly('G15-COLOQUIAL', `G15-${N()}`, msg, opts));
});

// ============================================================
// G16 — RESCHEDULE (40)
// ============================================================
const G16Cases = [
  'podemos cambiarla para el jueves?',
  'me viene mejor la semana que viene',
  'podemos mover la llamada al lunes?',
  'mejor en 3 días si te va bien',
  'mañana imposible, pasamos al viernes?',
  'lo dejamos para otro día?',
  'podemos hacerla la semana que viene?',
  'me reagendas la llamada por favor?',
  'puedes mover la fecha de la llamada?',
  'cámbiamela para el martes que viene',
  'pásala al jueves mejor, mañana imposible',
  'la podemos hacer en 5 días?',
  'mejor en 2 semanas?',
  'cuando tengas hueco, reagenda',
  'corre la fecha al lunes',
  'aplaza la llamada por favor',
  'puedo más tarde de esta semana, hoy no',
  'pasamos al jueves, hoy imposible',
  'me pasas a otra fecha?',
  'mejor en 3 días que hoy',
  'mira, mejor el lunes que el viernes',
  'cambiamos de día? me viene mejor el miercoles',
  'me empujas la llamada al jueves?',
  'puedes desplazarla unos días?',
  'reagéndala para esta semana próxima',
  'movemos a la semana del 25?',
  'mañana imposible, hablamos el lunes?',
  'la cambias al sábado mejor?',
  'me cuadra más el domingo',
  'paso al jueves?',
  'esta semana imposible, semana que viene',
  'reagéndame por favor',
  'puedes pasarla al otro miercoles?',
  'no llego hoy, hacemos otro día',
  'movemos al 23?',
  'cuándo tienes hueco la semana que viene?',
  'paso al jueves o viernes',
  'la cambiamos al mes que viene?',
  'reagendar mejor',
  'la pasamos para el otro lunes',
];
G16Cases.forEach(msg => cases.push(leadOnly('G16-RESCHEDULE', `G16-${N()}`, msg, { expected: 'cancel_with_followup' })));

// ============================================================
// G17 — MIXED (40)
// ============================================================
const G17Cases = [
  ['no puedo mañana, cuándo podemos quedar?', 'cancel_with_followup'],
  ['sí voy, por cierto cuánto dura?', 'no_action'],
  ['es por Zoom no? Voy a estar listo', 'no_action'],
  ['no podré ir, gracias por todo igualmente', 'cancel_with_followup'],
  ['ahí estoy, me pasas el link?', 'no_action'],
  ['voy, qué tema vamos a ver?', 'no_action'],
  ['perdóname pero no puedo asistir hoy', 'cancel_with_followup'],
  ['no puedo hoy, me das una nueva fecha?', 'cancel_with_followup'],
  ['voy, pero podemos hacerla 30min más tarde?', 'no_action'],
  ['no puedo, tengo trabajo, lo dejamos para otra ocasión', 'cancel_with_followup'],
  ['ahí estoy, me apunto algunas dudas?', 'no_action'],
  ['cancela porfa, y dime qué precio tiene el programa', 'cancel_with_followup'],
  ['voy, pero mejor si fuera más tarde', 'no_action'],
  ['perdón, no puedo ir, me sabe mal', 'cancel_with_followup'],
  ['me podrías decir el precio? Si es muy caro cancelo', 'no_action'],
  ['no puedo mañana pero sigo interesado, cuándo podemos?', 'cancel_with_followup'],
  ['sí voy mañana. Tengo preguntas sobre el plan, las vemos en la call?', 'no_action'],
  ['cancela mañana, me sale reunión, podemos viernes?', 'cancel_with_followup'],
  ['hola Marcos! Sí mañana ahí estaré, un saludo', 'no_action'],
  ['oye, llevo el ordenador o con el móvil basta?', 'no_action'],
  ['ahí me tienes, voy con dudas anotadas', 'no_action'],
  ['voy a ir, gracias por todo igualmente', 'no_action'],
  ['me alegro de hablar contigo, ahí estoy', 'no_action'],
  ['vale gracias, mañana hablamos seguro', 'no_action'],
  ['paso a confirmar y ahí me tienes', 'no_action'],
  ['oye que no llego, cuándo puedes la próxima?', 'cancel_with_followup'],
  ['no podré, sigo interesado eh', 'cancel_with_followup'],
  ['gracias y bueno, cancela porfa', 'cancel_with_followup'],
  ['voy seguro, pero por si acaso me mandas el zoom?', 'no_action'],
  ['mira, no puedo ya. Es definitivo. Otra vez será', 'cancel_with_followup'],
  ['ahí, ya tengo todo listo, gracias', 'no_action'],
  ['oye marcos, mañana imposible, perdona', 'cancel_with_followup'],
  ['ya tengo el calendario marcado, sí voy', 'no_action'],
  ['no puedo ir, te explico luego el motivo', 'cancel_with_followup'],
  ['voy, dudas tengo bastantes, me apunto?', 'no_action'],
  ['cancela, mañana no llego seguro', 'cancel_with_followup'],
  ['mañana no me viene, te aviso si quiero otra fecha', 'cancel_with_followup'],
  ['todo confirmado, mañana hablamos', 'no_action'],
  ['voy, me mandas el ID de Zoom?', 'no_action'],
  ['no puedo, otra vez será, gracias', 'cancel_with_followup'],
];
G17Cases.forEach(([msg, expected]) => cases.push(leadOnly('G17-MIXED', `G17-${N()}`, msg, { expected })));

// ============================================================
// G18 — CONFIDENCE EDGE (40)
// ============================================================
const G18Cases = [
  'veremos a ver si puedo',
  'igual no llego a tiempo',
  'no te aseguro nada',
  'intento estar pero no prometo',
  'veré si puedo, te confirmo en un rato',
  '50/50 ahora mismo',
  'eh no sé eh',
  'creo que puedo, ya te confirmo',
  'igual te aviso luego si llego',
  'quizás llegue, no estoy seguro',
  'ojalá pueda',
  'a ver si llego',
  'según vea voy o no',
  'difícil pero lo intento',
  'mira no te aseguro, hablamos por la mañana',
  'voy a intentarlo, no te prometo nada',
  'vamos a ver cómo voy de tiempo',
  'no sé aún si voy a poder',
  'depende del tráfico de salida',
  'lo miro y luego te digo',
  'tengo que ver agenda',
  'no sé qué te diga',
  'a ver si me organizo',
  'lo miro y veo',
  'depende de cómo vaya el trabajo',
  'tengo dudas, ya te digo',
  'no me comprometo aún',
  'es probable pero no seguro',
  'no estoy seguro de poder',
  'depende de muchas cosas',
  'tengo que ver, ya te digo',
  'no sé qué decirte',
  'igual sí igual no',
  'depende del día',
  'lo intentaré aunque me cuesta',
  'no sé si voy a llegar bien',
  'a ver lo que pasa',
  'me mantengo abierto, a ver',
  'no tengo seguro',
  'lo veo dudoso pero veré',
];
G18Cases.forEach(msg => cases.push(leadOnly('G18-CONFIDENCE-EDGE', `G18-${N()}`, msg, { expected: 'no_action' })));

// ============================================================
// G19 — REGISTRO (30)
// ============================================================
const G19Cases = [
  ['Estimado Marcos, le ruego me disculpe pero no podré asistir a la cita programada.', 'cancel_with_followup'],
  ['Buenas tardes, le escribo para comunicarle que no podré asistir a nuestra llamada agendada. Disculpe.', 'cancel_with_followup'],
  ['Estimado, confirmo mi asistencia. Saludos cordiales.', 'no_action'],
  ['tio cancela porfi', 'cancel_with_followup'],
  ['paso bro, voy con otro coach, ni me sigas escribiendo', 'cancel_no_followup'],
  ['¿Podría confirmarme si la llamada continúa programada?', 'no_action'],
  ['Hola Marcos. Mira tio, no voy a poder, lo dejamos para la próxima semana sí?', 'cancel_with_followup'],
  ['Marcos, ha surgido una urgencia médica familiar. Lamento profundamente comunicarle que no podré.', 'cancel_with_followup'],
  ['ke va imposible bro', 'cancel_with_followup'],
  ['No asistiré.', 'cancel_with_followup'],
  ['En representación del equipo solicito el reagendado', 'cancel_with_followup'],
  ['Tronco no llego ni de coña, hablamos en otro momento', 'cancel_with_followup'],
  ['Buenos días, le informo que debido a un imprevisto no me será posible asistir hoy.', 'cancel_with_followup'],
  ['Estimado Marcos, declino formalmente la continuidad del programa. Atentamente.', 'cancel_no_followup'],
  ['venga tio, ya hablamos cuando pueda', 'cancel_with_followup'],
  ['quería comentarle que mejor reagendamos', 'cancel_with_followup'],
  ['Por la presente comunico mi imposibilidad de asistir', 'cancel_with_followup'],
  ['Marcos, le agradezco el seguimiento pero declino', 'cancel_no_followup'],
  ['Cordialmente, tendré que cancelar la llamada', 'cancel_with_followup'],
  ['Le informo que no procederé con la cita programada', 'cancel_with_followup'],
  ['hola tronco, no llego eh', 'cancel_with_followup'],
  ['marcos ke no voy', 'cancel_with_followup'],
  ['Sirva la presente para confirmar la asistencia', 'no_action'],
  ['Le ruego me confirme la disponibilidad de la sesión', 'no_action'],
  ['Lamento profundamente desistir del programa', 'cancel_no_followup'],
  ['ay tio paso totalmente, gracias', 'cancel_no_followup'],
  ['Marcos por favor cancele mi suscripción al servicio', 'cancel_no_followup'],
  ['Estimado, por favor proceda a la cancelación de mi cita', 'cancel_with_followup'],
  ['Hola, quisiera reagendar para más adelante por favor', 'cancel_with_followup'],
  ['Atendiendo a su mensaje, confirmo asistencia', 'no_action'],
];
G19Cases.forEach(([msg, expected]) => {
  const opts = { expected };
  if (expected === 'no_action' && !msg.toLowerCase().includes('confirm') && !msg.toLowerCase().includes('hoy')) {
    opts.context = 'Recordatorio: mañana hablamos';
  }
  cases.push(leadOnly('G19-REGISTER', `G19-${N()}`, msg, opts));
});

// ============================================================
// G20 — IDIOMAS (40)
// ============================================================
const G20Cases = [
  ['sorry Marcos, can\'t make it tomorrow', 'cancel_with_followup'],
  ['sorry tio, no voy a poder hacer la call mañana', 'cancel_with_followup'],
  ['I can\'t make it to the call', 'cancel_with_followup'],
  ['no podré assistir a la trucada', 'cancel_with_followup'],
  ['demà no puc Marcos, ho deixem per un altre dia', 'cancel_with_followup'],
  ['desculpa Marcos não vou conseguir ir', 'cancel_with_followup'],
  ['désolé je ne pourrai pas venir', 'cancel_with_followup'],
  ['no la voy a hacer wey, me cae mal mañana', 'cancel_with_followup'],
  ['che boludo no la pueod hacer mañana', 'cancel_with_followup'],
  ['no call tomorrow, sorry', 'cancel_with_followup'],
  ['scusa Marcos non riesco a venire', 'cancel_with_followup'],
  ['sorry, kann nicht morgen', 'cancel_with_followup'],
  ['que va Marcos, mañana ni de coña, dejémoslo pa otro día picha', 'cancel_with_followup'],
  ['ezin dut bihar etorri, barkatu', 'cancel_with_followup'],
  ['hi Marcos, will need to reschedule', 'cancel_with_followup'],
  ['Hi sorry, my bad, can\'t make it', 'cancel_with_followup'],
  ['can we move it to next week?', 'cancel_with_followup'],
  ['I\'ll be late, sorry', 'no_action'],
  ['Tomorrow doesn\'t work for me', 'cancel_with_followup'],
  ['allons-y, je suis prêt', 'no_action'],
  ['ho appuntamento medico, non posso', 'cancel_with_followup'],
  ['no pasa nada, vou tar', 'no_action'],
  ['cancele por favor, não vou conseguir', 'cancel_no_followup'],
  ['ja no vull continuar, gràcies', 'cancel_no_followup'],
  ['ya no me intereesa el programa wey', 'cancel_no_followup'],
  ['can you reschedule for Tuesday?', 'cancel_with_followup'],
  ['can we make it later today?', 'no_action'],
  ['I\'m running late', 'no_action'],
  ['I won\'t be able to attend', 'cancel_with_followup'],
  ['perdone, hoje não dá', 'cancel_with_followup'],
  ['todo perfecto, ahí estoy mañana', 'no_action'],
  ['all set, see you tomorrow', 'no_action'],
  ['ok perfecto', 'no_action'],
  ['estoy listo bro!', 'no_action'],
  ['vou tar', 'no_action'],
  ['t\'écris pour annuler', 'cancel_with_followup'],
  ['Bueno marcos imposible mañana', 'cancel_with_followup'],
  ['gracias amigo voy a participar', 'no_action'],
  ['I\'ll be there tomorrow!', 'no_action'],
  ['eu vou estar, sem problemas', 'no_action'],
];
G20Cases.forEach(([msg, expected]) => {
  const opts = { expected };
  if (expected === 'no_action') opts.context = 'Mañana hablamos';
  cases.push(leadOnly('G20-LANGUAGE', `G20-${N()}`, msg, opts));
});

// ============================================================
// G21 — DELAY SNAP (30)
// ============================================================
const G21Cases = [
  'no puedo, recuérdame en 5 días por favor',
  'no podré, vuélveme a llamar en 2 semanas',
  'mejor en 10 días, esta semana imposible',
  'cancela, mejor en 4 días',
  'no puedo, recordame en 6 días',
  'no puedo hoy, en 2 días te aviso',
  'no puedo, en 1 semana hablamos',
  'no puedo, hablamos en un mes',
  'cancela, en 15 días vuelve a contactarme',
  'no puedo mañana, en pasado-mañana mejor',
  'no puedo, mejor el viernes que viene',
  'no puedo, en un par de días te aviso',
  'cancela y cuando puedas reagendamos',
  'mejor en 3 o 4 días',
  'cancela, en 9 días hablamos',
  'cancela y en 8 días me escribes',
  'no puedo, en 12 días te aviso',
  'imposible esta semana, en 21 días?',
  'cancela, en una semana y media te aviso',
  'cancela, en menos de una semana llámame',
  'cancela, esta noche te confirmo en 8 horas',
  'no puedo, en 2 semanas exactas',
  'cancela y en 30 días me contactas',
  'cancela, en 4 días lo retomamos',
  'no puedo, hablamos en 11 días',
  'cancela, en una semana y dos días',
  'no puedo, en aprox 5 días te contesto',
  'cancela, después de mañana en 3 días',
  'no podré, en 13 días vuelves a escribirme',
  'no puedo, en 7 días me dices',
];
G21Cases.forEach(msg => cases.push(leadOnly('G21-DELAY-SNAP', `G21-${N()}`, msg, { expected: 'cancel_with_followup' })));

// ============================================================
// G22 — SYSTEM EDGE (25)
// ============================================================
cases.push(
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'Hola q tal', dateAdded: mkTs(2) }],
    apts: [], expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'no puedo a la llamada', dateAdded: mkTs(2) }],
    apts: [], expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'pásame para reagendar porfa', dateAdded: mkTs(20) },
      { direction: 'outbound', body: `Claro, ${RESCHEDULE_LINK}`, dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'gracias!', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(10) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'reagendar', dateAdded: mkTs(30) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(25) },
      { direction: 'inbound', body: 'gracias!', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'espera, cancela también esa nueva, no creo que pueda esta semana', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(15) }],
    expected: 'cancel_with_followup',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'no puedo asistir', dateAdded: mkTs(360) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(355) },
      { direction: 'inbound', body: 'gracias', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(120) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'no puedo', dateAdded: mkTs(60 * 24 * 2) },
      { direction: 'outbound', body: 'no pasa, hablamos', dateAdded: mkTs(60 * 24 * 2 - 30) },
      { direction: 'inbound', body: 'vale gracias', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/photo.jpg'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'outbound', body: 'hola!', dateAdded: mkTs(60 * 24 * 30) },
      { direction: 'inbound', body: 'hola', dateAdded: mkTs(60 * 24 * 30 - 5) },
      { direction: 'outbound', body: 'qué tal estás?', dateAdded: mkTs(60 * 24 * 25) },
      { direction: 'inbound', body: 'bien gracias', dateAdded: mkTs(60 * 24 * 25 - 5) },
      { direction: 'outbound', body: 'te agendo una llamada?', dateAdded: mkTs(60 * 24 * 20) },
      { direction: 'inbound', body: 'sí porfa', dateAdded: mkTs(60 * 24 * 20 - 5) },
      { direction: 'outbound', body: 'recordatorio: mañana hablamos!', dateAdded: mkTs(60 * 24) },
      { direction: 'inbound', body: 'no puedo al final, cancela porfa', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'vale Marcos', dateAdded: mkTs(60) },
      { direction: 'outbound', body: 'Te paso el material adicional', dateAdded: mkTs(30) },
      { direction: 'outbound', body: 'Mira esto también', dateAdded: mkTs(5) },
    ],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: '😅', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'no puedo', dateAdded: mkTs(360) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(355) },
      { direction: 'inbound', body: 'gracias', dateAdded: mkTs(200) },
      { direction: 'inbound', body: 'oye que al final no quiero tener la llamada', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(300) }],
    expected: 'cancel_with_followup', ids: 1,
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'cancela todo lo viejo', dateAdded: mkTs(60 * 24 * 5) },
      { direction: 'inbound', body: 'vale ahí estoy', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'outbound', body: 'Recordatorio: llamada mañana a las 18h', dateAdded: mkTs(60) },
      { direction: 'outbound', body: 'Si tienes algo que comentar antes, dime', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'todo bien, mañana hablamos', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'no podré ir, cancela', dateAdded: mkTs(2) }],
    expected: 'cancel_with_followup',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'gracias por todo', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: Array.from({ length: 15 }, (_, i) => ({
      direction: i % 2 === 0 ? 'outbound' : 'inbound',
      body: i % 2 === 0 ? `mensaje coach ${i}` : `respuesta lead ${i}`,
      dateAdded: mkTs(100 - i * 5),
    })).concat([{ direction: 'inbound', body: 'no puedo mañana, cancela', dateAdded: mkTs(2) }]),
    expected: 'cancel_with_followup',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'mira esto', dateAdded: mkTs(20) },
      { direction: 'outbound', body: 'qué pasa?', dateAdded: mkTs(15) },
      { direction: 'inbound', body: '', attachments: ['https://example.com/voice.mp4'], dateAdded: mkTs(2) },
    ],
    expected: 'audio_needs_review',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: ' ', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'jajajajaja', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: '...', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'sí', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'mande?', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [{ direction: 'outbound', body: 'recordatorio mañana', dateAdded: mkTs(60) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', `G22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'no llego ehh', dateAdded: mkTs(120) },
      { direction: 'outbound', body: 'sin problema, hablamos', dateAdded: mkTs(60) },
      { direction: 'inbound', body: 'porfa ya cancela', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
);

// ============================================================
// G23 — CONFIRMACIONES SUTILES (30)
// ============================================================
const G23Cases = [
  ['✓', 'Recordatorio mañana'],
  ['recibido', 'Confirmamos llamada mañana?'],
  ['anotado', 'Te paso link mañana'],
  ['clear', 'See you tomorrow'],
  ['👍🏼', 'Recordatorio llamada mañana'],
  ['roger that', 'Mañana a las 18h'],
  ['all right', 'Confirmed for tomorrow'],
  ['noted', 'See you tomorrow'],
  ['🚀', 'Mañana cambiamos cosas'],
  ['❤️', 'Gracias por tu confianza'],
  ['👏', 'Cerrado para mañana'],
  ['vamos 💪', 'Mañana la liamos'],
  ['cool cool', 'See you tomorrow'],
  ['👍👍', 'Recordatorio'],
  ['😊', 'Te paso material'],
  ['👌', 'Confirmamos?'],
  ['ok mañana', 'Recordatorio'],
  ['ahí mañana', 'Confirmada'],
  ['hecho', 'Recordatorio mañana'],
  ['voy', 'Mañana 18h'],
  ['claro', 'Confirmada'],
  ['ahí estamos', 'Mañana hablamos'],
  ['fenómeno', 'Confirmada'],
  ['acepto', 'Hora mañana 18h'],
  ['hablamos', 'Confirmada'],
  ['ya nos vemos', 'Mañana'],
  ['👁️', 'Recordatorio'],
  ['estamos', 'Confirmada'],
  ['ok', 'Hora mañana'],
  ['recibo', 'Llamada mañana'],
];
G23Cases.forEach(([msg, ctx]) => cases.push(leadOnly('G23-CONFIRM-SUBTLE', `G23-${N()}`, msg, { expected: 'no_action', context: ctx })));

// ============================================================
// G24 — LEGACY (3)
// ============================================================
cases.push(
  {
    category: 'G24-LEGACY', name: `G24-${N()}`,
    messages: [
      { direction: 'inbound', body: 'Hola buenas tardes!! He tenido cólico nefriticos! Y mañana voy al hospital. Una amiga uróloga me va a hacer unas pruebas', dateAdded: mkTs(8) },
      { direction: 'inbound', body: 'Lo dejamos para otro di por favor? Gracias', dateAdded: mkTs(6) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup',
  },
  {
    category: 'G24-LEGACY', name: `G24-${N()}`,
    messages: [
      { direction: 'inbound', body: 'Marcos no creo que pueda hoy', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'ah espera sí, voy', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'no, mejor lo dejo, no me apetece', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'no espera, vale, al final voy sí', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  {
    category: 'G24-LEGACY', name: `G24-${N()}`,
    messages: [
      { direction: 'inbound', body: 'Marcos no voy a poder ir a la llamada de mañana, lo siento mucho', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup',
  },
);

// ============================================================
// G25 — DELAY VS CANCEL (60)
// ============================================================
const G25Retrasos = [
  'no podré llegar a tiempo lo siento',
  'no llegaré puntual a la llamada',
  'no podré llegar puntual hoy',
  'llego tarde, perdona',
  'llegaré tarde',
  'voy a llegar tarde',
  'llego un poco tarde',
  'me retraso 10 min',
  'voy con 15 min de retraso',
  'me retrasaré un poco, perdona',
  'me sale algo, llego un poco tarde',
  'no llego al inicio, entro a mitad',
  'puedo entrar 5 min tarde?',
  'se me hace tarde, voy a tardar 15 min',
  'estoy atrapado en el tráfico, llego tarde',
  'salgo ahora del trabajo, voy con retraso',
  'es 10 minutos tarde está bien?',
  'perdona el retraso, llego en 10',
  'no podré llegar a tiempo pero voy',
  'voy con retraso pero llego',
  'tengo un poco de atasco, voy tarde',
  'salgo a las 18 y llego justo después',
  'es un poco tarde para mí, llego en 20',
  'voy a llegar con retraso pero ahí estoy',
  'voy tarde pero conecto, no canceles',
  'me he atrasado, llego 15 min después',
  'voy a llegar después de la hora pero entro',
  'no puedo a la hora pero entro a mitad',
  'llego 20 minutos tarde, perdona',
  'llegaré con retraso pero asistiré',
];
G25Retrasos.forEach(msg => cases.push(leadOnly('G25-DELAY-VS-CANCEL', `G25-${N()}`, msg, { expected: 'no_action' })));

const G25Cancels = [
  'no llego a la llamada',
  'no podré ir mañana',
  'no podré asistir hoy',
  'me es imposible asistir',
  'al final no voy a poder',
  'no me será posible asistir',
  'no podré conectarme',
  'no voy a poder ir',
  'me cancelo la llamada',
  'no podré, lo cancela',
];
G25Cancels.forEach(msg => cases.push(leadOnly('G25-DELAY-VS-CANCEL', `G25-${N()}`, msg, { expected: 'cancel_with_followup' })));

const G25Mixed = [
  ['llego tarde y mejor cancela', 'cancel_with_followup'],
  ['no llego a tiempo, mejor reagenda', 'cancel_with_followup'],
  ['llego tarde, lo dejamos para otro día', 'cancel_with_followup'],
  ['no podré llegar a tiempo, mejor cancela', 'cancel_with_followup'],
  ['voy con 30 min de retraso, llego al final', 'no_action'],
  ['llego un poco tarde, en 20 min estoy', 'no_action'],
  ['puedo conectarme tarde a la llamada?', 'no_action'],
  ['llego con 5 min de retraso pero ahí estoy', 'no_action'],
  ['voy tarde así que mejor cancela', 'cancel_with_followup'],
  ['llego una hora tarde, no pasa nada?', 'no_action'],
];
G25Mixed.forEach(([msg, expected]) => cases.push(leadOnly('G25-DELAY-VS-CANCEL', `G25-${N()}`, msg, { expected })));

cases.push(
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'no podré llegar a tiempo lo siento', dateAdded: mkTs(20) },
      { direction: 'outbound', body: '¿prefieres moverla o llegas un poco tarde?', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'si es 10 minutos tarde está bien', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'no podré llegar a tiempo', dateAdded: mkTs(20) },
      { direction: 'outbound', body: '¿prefieres moverla o llegas tarde?', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'mejor muévela, no llego a la hora', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'llegaré 10 min tarde', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'al final no puedo, cancela mejor', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'voy a llegar tarde', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'pero llego, no canceles', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'me retraso 20 min', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'puedes esperarme un poco?', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'voy con retraso por trabajo', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'al final voy a tener que cancelar mejor', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'salgo tarde del cole', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'no me da tiempo, no llego, cancela', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'me retraso 10', dateAdded: mkTs(20) },
      { direction: 'outbound', body: 'no pasa nada, te espero', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'genial gracias', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'voy a llegar tarde', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'mejor cancela y movemos', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G25-DELAY-VS-CANCEL', `G25-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'no llego en hora hoy', dateAdded: mkTs(30) },
      { direction: 'outbound', body: 'es retraso o no asistes?', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'es solo retraso, llego en 15', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
);

// ============================================================
// G26 — WILD CASES (~150)
// ============================================================

const G26A = [
  ['estoy muy mal hoy, no me veo capaz', 'cancel_with_followup'],
  ['me siento fatal, no puedo más', 'cancel_with_followup'],
  ['estoy llorando, perdona, no puedo', 'cancel_with_followup'],
  ['estoy hundido marcos, no llego', 'cancel_with_followup'],
  ['no me sale hablar hoy', 'cancel_with_followup'],
  ['estoy de bajón, no puedo hoy', 'cancel_with_followup'],
  ['perdóname pero no puedo, estoy mal', 'cancel_with_followup'],
  ['me ha pasado algo grave, no podré ir', 'cancel_with_followup'],
  ['no soy capaz emocionalmente hoy', 'cancel_with_followup'],
  ['estoy roto hoy, lo siento', 'cancel_with_followup'],
  ['necesito unos días, perdona', 'cancel_with_followup'],
  ['hoy no puedo, estoy en proceso de duelo', 'cancel_with_followup'],
  ['me ha dejado mi pareja, no podré hoy', 'cancel_with_followup'],
  ['fallecimiento en la familia, no podré ir', 'cancel_with_followup'],
  ['no me veo bien para hablar hoy, lo dejamos', 'cancel_with_followup'],
];
G26A.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26A-${N()}`, msg, { expected, delay: 7 })));

const G26B = [
  ['jajaja marcos cancela que estoy de fiesta', 'cancel_with_followup'],
  ['tio paso, voy a tomar cervezas con los colegas', 'cancel_with_followup'],
  ['jajajaja no me apetece, mañana no voy', 'cancel_with_followup'],
  ['marcos cancela porfa, hoy no estoy de humor', 'cancel_with_followup'],
  ['estoy de resaca brutal, no llego', 'cancel_with_followup'],
  ['jaja perdona no puedo, tengo planes', 'cancel_with_followup'],
  ['estoy planchando, llego tarde', 'no_action'],
  ['estoy comiendo, voy en 10 min', 'no_action'],
  ['cocinando ahora, llego justo', 'no_action'],
  ['oye q estoy en el bar jaja, mañana hablamos', 'cancel_with_followup'],
  ['en el gym, llego puntual no preocupes', 'no_action'],
  ['paseando al perro, llego ya', 'no_action'],
];
G26B.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26B-${N()}`, msg, { expected })));

const G26C = [
  ['MARCOS NO ME ESCRIBAS MÁS', 'cancel_no_followup'],
  ['DEJA DE MOLESTAR', 'cancel_no_followup'],
  ['NO VOY, BÓRRAME', 'cancel_no_followup'],
  ['Hostia tio, déjame en paz', 'cancel_no_followup'],
  ['Vete a la mierda, no me escribas más', 'cancel_no_followup'],
  ['Sois pesados, ya no me interesa', 'cancel_no_followup'],
  ['ESTOY HARTO DE MENSAJES', 'cancel_no_followup'],
  ['Joder cancelad ya, no quiero saber nada', 'cancel_no_followup'],
  ['NO ME CONTACTEIS MÁS', 'cancel_no_followup'],
  ['borra mi puto número de la lista', 'cancel_no_followup'],
];
G26C.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26C-${N()}`, msg, { expected })));

const G26D = [
  ['espera', 'no_action'],
  ['déjame ver', 'no_action'],
  ['te llamo yo en un rato', 'no_action'],
  ['ah', 'no_action'],
  ['eh?', 'no_action'],
  ['un momento', 'no_action'],
  ['ahora vuelvo', 'no_action'],
  ['ya te digo', 'no_action'],
  ['lo veo', 'no_action'],
  ['te confirmo en breve', 'no_action'],
  ['déjame mirar la agenda', 'no_action'],
  ['ahora no puedo, te aviso', 'no_action'],
];
G26D.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26D-${N()}`, msg, { expected })));

const G26E = [
  ['no me funciona Zoom', 'no_action'],
  ['no me entra al meet, ayuda', 'no_action'],
  ['llevo 10 min intentando entrar, no me deja', 'no_action'],
  ['no me carga la cámara', 'no_action'],
  ['se me ha colgado el ordenador', 'no_action'],
  ['no tengo internet hoy, llego cuando vuelva', 'no_action'],
  ['mi micro no funciona, escríbeme y hablamos por aquí', 'no_action'],
  ['no me sale el link de la call', 'no_action'],
  ['Zoom me pide actualizar, dame un min', 'no_action'],
  ['el meet no me deja entrar, te llamo?', 'no_action'],
  ['no puedo entrar, dame otro link?', 'no_action'],
  ['nada, no me deja, sigues conectado?', 'no_action'],
];
G26E.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26E-${N()}`, msg, { expected })));

const G26F = [
  ['mejor hablamos por teléfono?', 'no_action'],
  ['en vez de zoom puede ser whatsapp?', 'no_action'],
  ['podemos hablar por audio en lugar de video?', 'no_action'],
  ['te llamo yo en vez del meet?', 'no_action'],
  ['mejor por meet que zoom?', 'no_action'],
  ['cambiamos a Discord?', 'no_action'],
  ['Skype mejor?', 'no_action'],
  ['hablamos por teams?', 'no_action'],
  ['te llamo al móvil mejor?', 'no_action'],
  ['mejor sin cámara, audio solo, ok?', 'no_action'],
];
G26F.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26F-${N()}`, msg, { expected })));

cases.push(
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'oye una cosa', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'es que', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'no llego eh', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'mira', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'tengo dudas si voy', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'al final sí, voy', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'hola', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'quería decirte', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'que no llego mañana', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'no podré, perdona', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'oye', dateAdded: mkTs(60) },
      { direction: 'inbound', body: 'puedes la semana que viene?', dateAdded: mkTs(40) },
      { direction: 'inbound', body: 'es que esta no voy a poder', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'mejor reagendar', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'qué tal marcos?', dateAdded: mkTs(60) },
      { direction: 'outbound', body: 'todo bien, mañana hablamos no?', dateAdded: mkTs(40) },
      { direction: 'inbound', body: 'sí pero', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'tendré que cancelar al final', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'voy mañana', dateAdded: mkTs(120) },
      { direction: 'outbound', body: 'perfect, hasta entonces', dateAdded: mkTs(110) },
      { direction: 'inbound', body: 'oye espera', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'tendré que pasarla a otro día', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'cancela', dateAdded: mkTs(60) },
      { direction: 'outbound', body: 'ok, te paso link de reagendar', dateAdded: mkTs(55) },
      { direction: 'inbound', body: 'gracias', dateAdded: mkTs(50) },
      { direction: 'inbound', body: 'aunque', dateAdded: mkTs(40) },
      { direction: 'inbound', body: 'al final podré', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'sí voy mañana, no cambies nada', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'no me llega el link', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'me lo mandas?', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'porfa', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'es por meet o zoom?', dateAdded: mkTs(30) },
      { direction: 'outbound', body: 'meet, te paso link', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'perfecto', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G26-WILD', `G26G-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'mira marcos', dateAdded: mkTs(60) },
      { direction: 'inbound', body: 'esto del coaching', dateAdded: mkTs(50) },
      { direction: 'inbound', body: 'creo que no es para mí', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'paso definitivamente', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_no_followup',
  }),
);

const G26H = [
  ['MAÑANA NO VOY', 'cancel_with_followup'],
  ['CANCELA PORFAVOR', 'cancel_with_followup'],
  ['NO PUEDO IR!!!!!', 'cancel_with_followup'],
  ['??????', 'no_action'],
  ['!!!!!', 'no_action'],
  ['¬¬', 'no_action'],
  ['marcos!!!!!!!', 'no_action'],
  ['NO LLEGO HOY', 'cancel_with_followup'],
  ['CONFIRMO!', 'no_action'],
  ['VAMOSSSSSS', 'no_action'],
];
G26H.forEach(([msg, expected]) => {
  const opts = { expected };
  if (expected === 'no_action') opts.context = 'Recordatorio mañana';
  cases.push(leadOnly('G26-WILD', `G26H-${N()}`, msg, opts));
});

const G26I = [
  ['hola mama', 'no_action'],
  ['mañana llegas a comer?', 'no_action'],
  ['te he reenviado el documento, mira', 'no_action'],
  ['oye pásate por aquí cuando puedas', 'no_action'],
  ['te llamo luego, ahora ocupado', 'no_action'],
  ['compra leche al volver porfa', 'no_action'],
  ['perdona, mensaje equivocado', 'no_action'],
  ['ay perdón, te llamaba a ti?', 'no_action'],
];
G26I.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26I-${N()}`, msg, { expected })));

const G26J = [
  ['tengo que ir si o si verdad?', 'no_action'],
  ['qué pasa si no voy?', 'no_action'],
  ['marcos.. la verdad es que..', 'no_action'],
  ['lo estoy pensando', 'no_action'],
  ['no me convence mucho la idea', 'no_action'],
  ['hablamos en otro momento mejor', 'cancel_with_followup'],
  ['oye no sé qué hacer la verdad', 'no_action'],
  ['no estoy convencido', 'no_action'],
  ['mejor lo hablamos por aquí', 'cancel_with_followup'],
  ['todo bien? Me parece bien hoy', 'no_action'],
  ['vale me lo planteo', 'no_action'],
  ['confirma de nuevo cuándo es exactamente', 'no_action'],
  ['estoy dudando si seguir', 'no_action'],
  ['quizás no sea el momento ahora', 'no_action'],
  ['va, lo intento', 'no_action'],
];
G26J.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26J-${N()}`, msg, { expected })));

const G26K = [
  ['si es muy caro no voy a hacer la call', 'no_action'],
  ['cuánto cuesta el programa? Si no me sale lo cancelamos', 'no_action'],
  ['necesito saber el precio antes', 'no_action'],
  ['si está fuera de mi presupuesto cancelo', 'no_action'],
  ['precio?', 'no_action'],
  ['cuánto pides?', 'no_action'],
  ['rango de precios?', 'no_action'],
  ['inversión total?', 'no_action'],
  ['cuál es la tarifa?', 'no_action'],
  ['cuánto vale meterme?', 'no_action'],
];
G26K.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26K-${N()}`, msg, { expected })));

const G26L = [
  ['voy yo a la otra persona, lo cubro', 'no_action'],
  ['mi pareja también puede asistir?', 'no_action'],
  ['puedo grabar la llamada?', 'no_action'],
  ['vienen mis hijos contigo, no problema?', 'no_action'],
  ['te paso a mi nutricionista para que también esté', 'no_action'],
  ['hay descuento por pareja?', 'no_action'],
  ['me dais factura?', 'no_action'],
  ['lo pago a plazos?', 'no_action'],
  ['cuántas sesiones son?', 'no_action'],
  ['empezamos cuándo?', 'no_action'],
  ['quiero saber si vale la pena para mi caso', 'no_action'],
  ['estoy embarazada, puedo hacer el programa?', 'no_action'],
  ['soy vegano, esto vale?', 'no_action'],
  ['tengo lesión de espalda, sirve?', 'no_action'],
  ['ya cancelé por la web', 'cancel_with_followup'],
];
G26L.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26L-${N()}`, msg, { expected })));

const G26M = [
  ['?', 'no_action'],
  ['...', 'no_action'],
  ['a', 'no_action'],
  ['x', 'no_action'],
  ['pq', 'no_action'],
  ['no', 'no_action'],
  ['ya', 'no_action'],
  ['k', 'no_action'],
  ['q', 'no_action'],
  ['😶', 'no_action'],
];
G26M.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26M-${N()}`, msg, { expected })));

const G26N = [
  ['Marcos, mira, te cuento. Llevo dos semanas dándole vueltas y al final he decidido que no es el momento para mí entrar en el programa. He estado mirando otros enfoques también y aunque entiendo el tuyo, ahora mismo no veo que me cuadre con mi rutina actual. Te agradezco mucho todo el tiempo que has invertido en mí pero prefiero pausar esto. Si en el futuro cambian las cosas ya te escribiré. Gracias por todo y suerte!', 'cancel_no_followup'],
  ['Hola Marcos, primero quería agradecerte la paciencia. He estado hablando con mi pareja y la situación familiar no me permite empezar ahora mismo. Mi madre está delicada de salud y voy a tener que volcarme en eso las próximas semanas. Lamento mucho cancelar la llamada de mañana, espero que entiendas. Cuando esté un poco más estable la situación, te vuelvo a escribir y miramos cómo seguir.', 'cancel_with_followup'],
  ['Buenos días Marcos. Quería confirmarte que mañana ahí estaré sin falta. He estado preparando todo lo que me mandaste, he visto el video también y la verdad que me encanta el enfoque que tenéis. Tengo unas dudas que te quiero plantear mañana sobre el método y sobre el seguimiento de las primeras semanas, pero todo bien. Hasta mañana!', 'no_action'],
  ['Marcos, ha sido una semana de locos, no he podido prepararme nada. Tengo el trabajo a tope, mis hijos enfermos y mi marido fuera de viaje. La verdad no estoy en mi mejor momento y no me veo capaz de tener la llamada mañana porque no podré conectar tranquila. Cancela por favor y cuando todo se calme te aviso para retomar. Mil disculpas por los inconvenientes.', 'cancel_with_followup'],
  ['Oye Marcos, una cosa, mira es que llevo desde ayer pensando en lo de la inversión. Te quería decir que sí estoy interesado pero necesito digerirlo bien. Mañana en la llamada vamos a poder ver bien todos los números y si me das un par de días después para decidir? No quiero comprometerme a algo y luego no estar 100% en ello. Mañana ahí estaré seguro, solo eso quería decirte.', 'no_action'],
];
G26N.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26N-${N()}`, msg, { expected })));

const G26O = [
  ['ay sí, súper ilusionado para la llamada eh', 'no_action'],
  ['encantado de hablar contigo mañana 🙄', 'no_action'],
  ['claro que voy, ni te lo pierdas eh', 'no_action'],
  ['oh sí mañana, qué ilu', 'no_action'],
  ['perfecto, justo lo que necesitaba en mi semana', 'no_action'],
  ['ya tengo todo listo para que me vendas algo más', 'no_action'],
  ['cuántos más mensajes esperaba recibir', 'no_action'],
  ['justo lo que me apetece, una llamada de ventas', 'no_action'],
];
G26O.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26O-${N()}`, msg, { expected, context: 'Mañana hablamos!' })));

const G26P = [
  ['[Reenviado de Juan] mira esto que me ha pasado', 'no_action'],
  ['mira lo que me han dicho en otro coach', 'no_action'],
  ['mira esta captura, qué te parece?', 'no_action'],
  ['un amigo me ha contado esto', 'no_action'],
  ['te reenvío esto que recibí, qué dices?', 'no_action'],
];
G26P.forEach(([msg, expected]) => cases.push(leadOnly('G26-WILD', `G26P-${N()}`, msg, { expected })));

module.exports = cases;
