'use strict';

// ============================================================
// REGRESSION TEST SUITE — ~500 NEW cases
// Different from previous mega suite — fresh phrasings to detect
// any unintended regressions from the recent prompt changes.
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
// R1 — CONFIRMACIONES (30 nuevas)
// ============================================================
const R1 = [
  ['todo controlado', 'Recordatorio mañana'],
  ['lo tengo apuntado, hasta mañana', 'Mañana hablamos'],
  ['ya tengo bloqueada la hora', 'Confirmada'],
  ['entendido perfectamente', 'Llamada mañana 10h'],
  ['hecho!', 'Confirmamos?'],
  ['claro hombre, ahí estoy', 'Recordatorio'],
  ['vamos para adelante!', 'Llamada confirmada'],
  ['confirmadísimo total', 'Mañana hablamos'],
  ['ya lo tengo, gracias por avisar', 'Recordatorio mañana'],
  ['todo en regla, mañana hablamos', 'Confirmada'],
  ['sí claro, allí estaré', 'Mañana 18h'],
  ['ningún problema, allí me tienes', 'Confirmada'],
  ['marcado en calendario', 'Llamada mañana'],
  ['voy fijo, gracias', 'Confirmamos'],
  ['no se me olvida, tranqui', 'Mañana hablamos'],
  ['🚀🚀', 'Recordatorio'],
  ['perfecto perfecto, hasta entonces', 'Confirmada'],
  ['anotado en agenda, gracias', 'Mañana'],
  ['vale, todo claro', 'Confirmamos?'],
  ['ok, allí me ves', 'Confirmada'],
  ['sí señor, hasta mañana', 'Mañana'],
  ['voy a tope, listo!', 'Llamada mañana'],
  ['allí pendiente', 'Confirmada'],
  ['ningún drama, voy', 'Mañana'],
  ['guay, hasta mañana', 'Confirmamos'],
  ['fantástico, mañana hablamos!', 'Confirmada'],
  ['ya me llega el link?', 'Mañana 18h'],
  ['preparado y listo', 'Llamada mañana'],
  ['nos vemos en zoom mañana', 'Confirmada'],
  ['todo OK, hasta mañana entonces', 'Confirmamos'],
];
R1.forEach(([msg, ctx]) => cases.push(leadOnly('R1-CONFIRM', `R1-${N()}`, msg, { expected: 'no_action', context: ctx })));

// ============================================================
// R2 — CANCELACIONES CLARAS (30 nuevas)
// ============================================================
const R2 = [
  'mira, no podré ir mañana',
  'siento decirte que no voy',
  'me ha surgido algo, anula',
  'tendré que cancelar mañana',
  'no me viene bien mañana, cancela',
  'la verdad es que no puedo acudir',
  'al final me ha sido imposible',
  'tengo que decir que no, perdona',
  'no voy a poder presentarme',
  'me tengo que retirar de mañana',
  'no me será posible mañana',
  'tendré que ausentarme',
  'no podré hacer la llamada',
  'no vamos a poder hablar mañana',
  'tengo otra cosa, no llego',
  'lo veo imposible, perdona',
  'me sale algo y no puedo',
  'tendré que escaparme, no voy',
  'mañana definitivamente no',
  'no la puedo mantener mañana',
  'mira, mañana ni de coña, perdona',
  'no me veo capaz mañana, cancela',
  'va a ser que no, lo siento',
  'tengo que anular, surgió algo',
  'mañana imposible asistir',
  'me he liado, no llego',
  'no vamos a poder, perdóname',
  'al final tengo que cancelar',
  'mañana no es viable',
  'no me sale ir mañana, cancela',
];
R2.forEach(msg => cases.push(leadOnly('R2-CANCEL-CLEAR', `R2-${N()}`, msg, { expected: 'cancel_with_followup' })));

// ============================================================
// R3 — MÉDICAS (25 nuevas)
// ============================================================
const R3 = [
  'me ha dado fiebre alta, no puedo',
  'estoy con un dolor muscular brutal',
  'me he caído y estoy lesionado',
  'me dieron una mala noticia médica, no puedo',
  'tengo síntomas raros, voy al médico',
  'estoy con conjuntivitis, no puedo mirar pantallas',
  'tengo el ojo morado, me da vergüenza por cámara',
  'me han mandado análisis, voy ahora',
  'me sangra mucho la nariz, no puedo',
  'estoy en urgencias por un susto',
  'me ha dado lipotimia, no estoy bien',
  'me han mandado reposo absoluto',
  'me han operado los dientes, no puedo hablar',
  'me han dado puntos en la mano',
  'tengo hernia, no puedo moverme',
  'estoy en cama con fiebre',
  'me han hecho una endoscopia hoy',
  'tengo cataratas, voy al oculista',
  'estoy en quimioterapia, mal día',
  'mi padre necesita asistencia urgente',
  'mi abuela tiene un brote, voy con ella',
  'mi pareja con accidente, voy al hospital',
  'urgencias con mi madre, no podré',
  'me han operado de apendicitis',
  'tengo cita en cardiología, no me dejan moverla',
];
R3.forEach(msg => cases.push(leadOnly('R3-MEDICAL', `R3-${N()}`, msg, { expected: 'cancel_with_followup' })));

// ============================================================
// R4 — VIAJES Y AGENDA (25 nuevas)
// ============================================================
const R4 = [
  'estoy en Tarragona en evento',
  'me toca turno de noche mañana',
  'estoy de gira con la empresa',
  'tengo congreso anual estos días',
  'me caso este finde, estoy a tope',
  'estoy con mi hermana de visita',
  'voy a buscar a mi pareja al aeropuerto',
  'tengo cita con cliente importante',
  'estoy haciendo de chofer todo el día',
  'me toca cuidar a mis sobrinos',
  'firmamos hipoteca esa tarde',
  'tengo curso de seguridad obligatorio',
  'preparo viaje y estoy con maletas',
  'voy a quedar con mi ex para hablar',
  'tengo eventos toda la semana',
  'estoy desplazado, en Sevilla',
  'me toca cubrir un turno extra',
  'tengo cursos toda la semana',
  'estoy de jurado este semana',
  'sesión de fotos toda la tarde',
  'voy a buscar coche al taller',
  'tengo entrevista médica',
  'voy de retiro mindfulness',
  'estoy fuera de cobertura, en la sierra',
  'me toca asistir a un funeral',
];
R4.forEach(msg => cases.push(leadOnly('R4-TRAVEL', `R4-${N()}`, msg, { expected: 'cancel_with_followup' })));

// ============================================================
// R5 — HARD CANCEL (25 nuevas)
// ============================================================
const R5 = [
  'lo he meditado y no voy a seguir',
  'al final no voy a continuar el proceso',
  'me ha desencantado el enfoque',
  'no quiero recibir más material vuestro',
  'no necesito el programa, gracias',
  'cancela todo lo mío',
  'es muy invasivo, no quiero más',
  'me arrepiento, dejémoslo',
  'os agradezco pero no es lo mío',
  'voy a recurrir a profesional sanitario, no esto',
  'he encontrado otra solución, no continúo',
  'voy con coach gratis, lo siento',
  'he leído reviews malas, paso',
  'mi familia no está de acuerdo, no sigo',
  'la verdad es que me da pereza',
  'no creo que sea para mí, cancela',
  'no me genera confianza, me bajo',
  'no me interesa hablar más, gracias',
  'he cambiado mis prioridades',
  'ahora no es el momento, definitivamente',
  'no quiero más insistencias, gracias',
  'olvídame, gracias por todo',
  'no quiero saber más del programa',
  'no me motiva, cancela',
  'sois muy persistentes, paro aquí',
];
R5.forEach(msg => cases.push(leadOnly('R5-HARD-CANCEL', `R5-${N()}`, msg, { expected: 'cancel_no_followup' })));

// ============================================================
// R6 — PREGUNTAS OPERATIVAS (25 nuevas)
// ============================================================
const R6 = [
  'me das el link otra vez?',
  'a qué hora exacta es?',
  'puedo cambiar a horario europeo?',
  'me tienen que ver desde el móvil?',
  'puedo conectarme desde el trabajo?',
  'cuánto cobráis por hora?',
  'tenéis método garantizado?',
  'esto vale para principiantes?',
  'cuál es el siguiente paso después?',
  'tengo que pagar antes de la call?',
  'cuántas personas más estarán?',
  'puedo grabarla yo mi parte?',
  'hace falta micro especial?',
  'puedo conectarme desde inglés?',
  'tenéis testimonios?',
  'venís en persona o todo online?',
  'cuándo recibo el zoom link?',
  'hay descuento por estudiante?',
  'puedo invitar a mi amiga después?',
  'tenéis cláusula de cancelación?',
  'aceptáis bizum?',
  'hace cuánto que existís?',
  'sois certificados profesionalmente?',
  'qué pasa después de la primera llamada?',
  'puedo ponerme nervioso y pausar?',
];
R6.forEach(msg => cases.push(leadOnly('R6-QUESTIONS', `R6-${N()}`, msg, { expected: 'no_action' })));

// ============================================================
// R7 — TIME TWEAKS (20 nuevas)
// ============================================================
const R7 = [
  'a la 1 me viene mejor que a las 2',
  'puede ser a las 16:15 en vez de 16:00?',
  'mejor por la mañana del mismo día?',
  'puedo a las 17 antes de las 18 mejor?',
  'puedes a las 8 si entras antes?',
  'a la siesta mejor, sobre las 16',
  'puedo a las 12 del mediodía hoy?',
  'mejor 45 min después?',
  'antes de cenar, sobre las 20?',
  'a primera hora si puedes',
  'a la última hora del día?',
  'cualquier rato hoy de 15 a 22',
  'puedo a las 10:30 hoy?',
  'puedes adelantarla unos minutos?',
  'cambiamos 30 min más tarde hoy?',
  'a las 19:15 mejor que a las 19?',
  'mejor a media tarde que a primera?',
  'a las 9 si fuera posible hoy',
  'puedes 20 minutos antes hoy?',
  'puedo a las 13:50 hoy?',
];
R7.forEach(msg => cases.push(leadOnly('R7-TIME-TWEAK', `R7-${N()}`, msg, { expected: 'no_action' })));

// ============================================================
// R8 — POST-LINK ACEPTACIÓN (25 nuevas)
// ============================================================
const R8 = [
  ['no puedo a esa hora', 'thanks ahora lo cambio'],
  ['mañana imposible', 'gracias, busco otro hueco'],
  ['no me viene bien', 'mil gracias, ya elijo otra fecha'],
  ['lo dejamos para otra fecha', 'ok cambiando!'],
  ['me sobrepasa el día', 'paso al link, gracias'],
  ['no llego ese día', 'ok, lo muevo'],
  ['tengo que mover la fecha', 'gracias, escojo otra'],
  ['no puedo asistir tal día', 'thanks, cambio'],
  ['no me da margen', 'mil gracias, reagendo'],
  ['imposible esa fecha', 'paso a moverla'],
  ['mejor en otro hueco', 'gracias!'],
  ['mañana lío', 'gracias, ya lo cambio'],
  ['esa fecha mal', 'eligo otra fecha gracias'],
  ['no se ajusta a mi agenda', 'gracias, cambio'],
  ['ese día no puedo', 'thanks lo cambio ya'],
  ['mover la fecha mejor', 'ok, gracias por el link'],
  ['no me viene esa fecha', 'eligo otra, gracias'],
  ['ay no me cuadra', 'gracias por el link, busco hueco'],
  ['no podré ese día', 'gracias, ahora reagendo'],
  ['déjamelo otro día', 'gracias!'],
  ['imposible asistir mañana', 'lo muevo, gracias'],
  ['no llego a esa fecha', 'gracias, paso al link'],
  ['cancelo mejor', 'gracias, ya reagendo en otro día'],
  ['no puedo este día', 'lo cambio gracias'],
  ['hay que mover', 'gracias por el link, escojo otra'],
];
R8.forEach(([before, after]) => cases.push(postLink('R8-LINK-ACCEPT', `R8-${N()}`, before, after, { expected: 'cancel_with_followup' })));

// ============================================================
// R9 — POST-LINK RECHAZO (20 nuevas)
// ============================================================
const R9 = [
  ['no podré', 'ya me organicé, voy'],
  ['no llego', 'me cancelaron lo otro, asisto'],
  ['va a estar mal', 'me apaño, ahí estaré'],
  ['no creo', 'cambio de planes, sí voy'],
  ['imposible', 'al final me liberé, voy'],
  ['no puedo', 'mejor sí puedo, voy'],
  ['va a ser difícil', 'me organicé, ahí estaré'],
  ['mejor lo movemos', 'al final no hace falta, voy'],
  ['no voy a poder', 'al final sí me da tiempo, voy'],
  ['va estar complicado', 'sí me da, ahí estoy'],
  ['no llegaré', 'cancelo lo otro, sí voy'],
  ['cancelo', 'no espera, ya me organicé, voy'],
  ['no me va', 'me dio tiempo, voy ahí'],
  ['no podré conectar', 'me da tiempo, voy'],
  ['casi seguro no llego', 'al final voy, gracias'],
  ['no llego seguro', 'me apaño, asisto'],
  ['no puedo casi seguro', 'al final sí voy'],
  ['mejor cancelar', 'no espera, sí voy'],
  ['no podré asistir', 'me liberé, ahí estoy'],
  ['imposible casi', 'al final sí, hasta ahora'],
];
R9.forEach(([before, after]) => cases.push(postLink('R9-LINK-REJECT', `R9-${N()}`, before, after, { expected: 'no_action' })));

// ============================================================
// R10 — POST-LINK AMBIGUO (20 nuevas)
// ============================================================
const R10 = [
  ['no podré', 'tengo que mirar agenda'],
  ['no me viene bien', 'lo veo después'],
  ['imposible', 'a ver qué hago'],
  ['no llego', 'a ver si me organizo, te digo'],
  ['cancelo', 'lo pienso bien'],
  ['mejor cancelar', 'a ver, miro'],
  ['no podré', 'esperando ver agenda'],
  ['no puedo', 'mañana te digo'],
  ['no llegaré', 'consulto a mi pareja'],
  ['va estar mal', 'me lo pienso'],
  ['no llego', 'okay luego veo'],
  ['imposible asistir', 'lo veo después'],
  ['cancelo posiblemente', 'lo pensaré'],
  ['mejor lo movemos', 'cuando pueda lo miro'],
  ['no voy a poder', 'tengo que ver'],
  ['no me cuadra', 'ya veré qué hacer'],
  ['va difícil', 'okk te aviso'],
  ['no llego', 'sin más, gracias'],
  ['no podré', 'a ver, te aviso'],
  ['imposible', 'lo veo más tarde'],
];
R10.forEach(([before, after]) => cases.push(postLink('R10-LINK-AMBIG', `R10-${N()}`, before, after, { expected: 'no_action' })));

// ============================================================
// R11 — PARTIAL (15 nuevas)
// ============================================================
const R11Cases = [
  ['2 llamadas: jueves y sábado', 'cancela el jueves, sábado voy'],
  ['Tienes martes y miércoles', 'el martes anula, miércoles ok'],
  ['Citas: lunes y miércoles', 'la del lunes no, la del miércoles sí'],
  ['Tu doble compromiso', 'cancela la primera, mantén segunda'],
  ['2 calls este mes', 'la del 15 cancela, la del 22 ok'],
  ['Llamadas próximas: 2', 'no voy a la primera, segunda sí'],
  ['Tu agenda: 2 sesiones', 'borra la del jueves, viernes asisto'],
  ['Recordatorio doble cita', 'la temprana cancela, la tarde ok'],
  ['2 reservas confirmadas', 'quita la próxima, segunda ok'],
  ['Tu plan: 2 calls', 'la primera no llego, la segunda voy'],
  ['Llamadas: hoy y mañana', 'hoy no, mañana sí'],
  ['Tus citas próximas', 'una sí una no, cancela viernes'],
  ['2 sesiones agendadas', 'mejor la del miércoles, la del lunes anula'],
  ['Recuerda: 2 calls', 'mantén la última, cancela la primera'],
  ['Tu reserva múltiple', 'quédate con la del jueves, cancela la del martes'],
];
R11Cases.forEach(([coachMsg, leadMsg]) => cases.push(exchange('R11-PARTIAL', `R11-${N()}`, {
  messages: [
    { direction: 'outbound', body: coachMsg, dateAdded: mkTs(20) },
    { direction: 'inbound', body: leadMsg, dateAdded: mkTs(2) },
  ],
  apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
})));

// ============================================================
// R12 — BOTH (15 nuevas)
// ============================================================
const R12Cases = [
  ['2 llamadas pendientes', 'tira para abajo ambas, gracias', 2],
  ['Tu doble cita', 'cancela las dos, semana fatal', 2],
  ['Citas próximas', 'no voy a ninguna, anula todo', 2],
  ['Tu agenda doble', 'borra todo, mejor otra semana', 2],
  ['2 calls agendadas', 'cancélamelas las 2', 2],
  ['Llamadas: 2', 'a ninguna voy, perdona', 2],
  ['Sesiones pendientes', 'quita todas, surgió algo importante', 2],
  ['Tus 2 reservas', 'imposibles ambas', 2],
  ['Doble compromiso', 'paso de las 2', 2],
  ['Recuerda 3 calls', 'imposible las 3, cancela todo', 3],
  ['Tus 3 citas', 'borra las 3 por favor', 3],
  ['Múltiples reservas', 'todo cancelado, gracias', 2],
  ['Tu doble reserva', 'no asisto a ninguna', 2],
  ['Llamadas confirmadas', 'tira pa atrás las dos, no llego', 2],
  ['Tus 3 sesiones', 'cancela las 3, surgió algo', 3],
];
R12Cases.forEach(([coachMsg, leadMsg, idsCount]) => cases.push(exchange('R12-BOTH', `R12-${N()}`, {
  messages: [
    { direction: 'outbound', body: coachMsg, dateAdded: mkTs(20) },
    { direction: 'inbound', body: leadMsg, dateAdded: mkTs(2) },
  ],
  apts: idsCount === 3 ? [APT_1, APT_2, APT_3] : [APT_1, APT_2], expected: 'cancel_with_followup', ids: idsCount,
})));

// ============================================================
// R13 — FLIP-FLOP (15 nuevas)
// ============================================================
const R13Cases = [
  [['mañana imposible', 'espera sí puedo', 'al final voy'], 'no_action'],
  [['allí estoy', 'me sale algo', 'no llego, perdona'], 'cancel_with_followup'],
  [['cancela', 'no espera, voy', 'no, mejor cancela'], 'cancel_with_followup'],
  [['voy a ir', 'no sé', 'sí voy fijo'], 'no_action'],
  [['no podré', 'sí podré', 'no, definitivo no podré'], 'cancel_with_followup'],
  [['lo dejamos', 'no espera, sí puedo', 'voy a ir mañana'], 'no_action'],
  [['voy mañana', 'no espera', 'sí voy fijo'], 'no_action'],
  [['cancela', 'no espera mantén', 'voy a ir, mantén'], 'no_action'],
  [['no voy', 'pensándolo', 'sí voy'], 'no_action'],
  [['ahí estoy', 'me sale algo', 'tendré que cancelar'], 'cancel_with_followup'],
  [['no llego', 'sí puedo', 'no, no llego, definitivo'], 'cancel_with_followup'],
  [['voy', 'cambio de planes', 'al final voy'], 'no_action'],
  [['imposible', 'no espera lo soluciono', 'sí asisto'], 'no_action'],
  [['cancela', 'mejor no, voy', 'sí voy mañana'], 'no_action'],
  [['voy', 'me sale algo importante', 'no, no puedo, cancela'], 'cancel_with_followup'],
];
R13Cases.forEach(([msgs, expected]) => {
  cases.push(exchange('R13-FLIP-FLOP', `R13-${N()}`, {
    messages: msgs.map((m, i) => ({ direction: 'inbound', body: m, dateAdded: mkTs(30 - i * 7) })),
    expected,
  }));
});

// ============================================================
// R14 — MEDIA (20 nuevas)
// ============================================================
const r14Media = [
  [['nuevo-audio.mp4'], '', 'audio_needs_review'],
  [['voz-instagram.m4a'], '', 'audio_needs_review'],
  [['foto-pizza.jpg'], '', 'no_action'],
  [['captura-error.png'], '', 'no_action'],
  [['contrato.pdf'], '', 'no_action'],
  [['emoji-sticker.webp'], '', 'no_action'],
  [['meme.gif'], '', 'no_action'],
  [['notas-voz.opus'], '', 'audio_needs_review'],
  [['saludo.ogg'], '', 'audio_needs_review'],
  [['video-mio.mp4'], '', 'audio_needs_review'],
  [[], '🤩', 'no_action'],
  [[], '😎', 'no_action'],
  [[], '🙄', 'no_action'],
  [['mapa.jpg'], 'estoy aquí, llegando', 'no_action'],
  [['agenda.png'], 'no voy a llegar, cancela', 'cancel_with_followup'],
  [['comprobante.pdf'], 'aquí mi pago', 'no_action'],
  [['recibo.jpg'], 'lo he hecho ya, no puedo asistir', 'cancel_with_followup'],
  [['screenshot.png'], 'mira esto', 'no_action'],
  [[], 'http://link.com/algo', 'no_action'],
  [[], '🫠', 'no_action'],
];
r14Media.forEach(([atts, body, expected]) => {
  const msg = { direction: 'inbound', body, dateAdded: mkTs(2) };
  if (atts.length) msg.attachments = atts.map(a => `https://example.com/${a}`);
  cases.push(exchange('R14-MEDIA', `R14-${N()}`, { messages: [msg], expected }));
});

// ============================================================
// R15 — COLOQUIAL / TYPOS (25 nuevas)
// ============================================================
const R15 = [
  ['marcos no llgo manana noseque', 'cancel_with_followup'],
  ['xfa cancela mejor manana noo voy', 'cancel_with_followup'],
  ['noo, no puedo, sorry', 'cancel_with_followup'],
  ['imposibe llegar t', 'cancel_with_followup'],
  ['llamadaa noooo puedoo', 'cancel_with_followup'],
  ['nooo es imposib', 'cancel_with_followup'],
  ['marcoss anula sf', 'cancel_with_followup'],
  ['cnclla', 'cancel_with_followup'],
  ['n llego', 'cancel_with_followup'],
  ['anllaa cita pls', 'cancel_with_followup'],
  ['cncl plis', 'cancel_with_followup'],
  ['nada pues paso', 'cancel_with_followup'],
  ['tio paso al final, gracias eh', 'cancel_no_followup'],
  ['na ke nada paso, sigo solo', 'cancel_no_followup'],
  ['noo si no me interesa al final', 'cancel_no_followup'],
  ['noo q va al final paso', 'cancel_no_followup'],
  ['ahi nos vemoss', 'no_action'],
  ['ok voy, ahii toy', 'no_action'],
  ['perfectoo bro, hasta manana', 'no_action'],
  ['vle, ahii estoy', 'no_action'],
  ['toi alli mañana', 'no_action'],
  ['ok bro see u', 'no_action'],
  ['ok hablamos pues', 'no_action'],
  ['oook hasta manana', 'no_action'],
  ['ya ya, ahi estoy', 'no_action'],
];
R15.forEach(([msg, expected]) => {
  const opts = { expected };
  if (msg.includes('ahi') || msg.includes('toi') || msg.includes('vle') || msg.includes('ok bro') || msg.includes('oook') || msg.includes('ya ya') || msg.includes('hablamos') || msg.includes('perfectoo')) {
    opts.context = 'Mañana hablamos';
  }
  cases.push(leadOnly('R15-COLOQUIAL', `R15-${N()}`, msg, opts));
});

// ============================================================
// R16 — RESCHEDULE (20 nuevas)
// ============================================================
const R16 = [
  'me lo cambias para el viernes?',
  'puedo moverla al miércoles?',
  'mejor el lunes próximo',
  'cámbiala al sábado mejor',
  'me viene mejor pasado mañana',
  'puedo el otro martes en vez de este?',
  'reagéndame para principio de semana',
  'mejor a finales de la semana próxima',
  'puedes pasarla al jueves?',
  'me cuadra mejor el día 25',
  'cambio la fecha por favor',
  'la podemos llevar al lunes 22?',
  'me la pasas a otro día?',
  'puedo en una semana?',
  'mejor en 4 días',
  'pásala dos días después',
  'cambiamos la fecha mejor',
  'reagéndamela en 10 días',
  'me das otra fecha?',
  'puedo más adelante esta semana?',
];
R16.forEach(msg => cases.push(leadOnly('R16-RESCHEDULE', `R16-${N()}`, msg, { expected: 'cancel_with_followup' })));

// ============================================================
// R17 — MIXED (20 nuevas)
// ============================================================
const R17 = [
  ['no podré ir mañana, gracias por todo', 'cancel_with_followup'],
  ['voy, pero antes me pasas el link?', 'no_action'],
  ['cancela mañana y dime nueva fecha', 'cancel_with_followup'],
  ['allí estaré, me preparo dudas?', 'no_action'],
  ['no llego, mañana es mal día, podemos otro?', 'cancel_with_followup'],
  ['voy ahí, cuál es el formato?', 'no_action'],
  ['perdona, no asisto, problemas familiares', 'cancel_with_followup'],
  ['voy, llevo notas?', 'no_action'],
  ['cancela, sigo abierto a hablar otro día', 'cancel_with_followup'],
  ['confirmo asistencia y aviso dudas', 'no_action'],
  ['no puedo ir hoy, gracias por entender', 'cancel_with_followup'],
  ['ahí estaré con mi pareja también, ok?', 'no_action'],
  ['cancela hoy, hablamos por whatsapp después', 'cancel_with_followup'],
  ['voy, qué hago si llego tarde?', 'no_action'],
  ['no asisto, lo siento mucho', 'cancel_with_followup'],
  ['voy, tengo dudas sobre los pagos', 'no_action'],
  ['perdona pero no voy, cuéntame cuándo podemos', 'cancel_with_followup'],
  ['voy mañana, espero que vaya bien', 'no_action'],
  ['cancela, escríbeme cuando tengas hueco', 'cancel_with_followup'],
  ['voy, llevo el ipad, vale?', 'no_action'],
];
R17.forEach(([msg, expected]) => cases.push(leadOnly('R17-MIXED', `R17-${N()}`, msg, { expected })));

// ============================================================
// R18 — CONFIDENCE EDGE (20 nuevas)
// ============================================================
const R18 = [
  'me lo estoy pensando aún',
  'no me termina de convencer',
  'no me da buena espina',
  'es posible que llegue, no estoy seguro',
  'igual no asisto, no sé',
  'según vaya por la mañana',
  'puede que sí, puede que no',
  'lo veo dudoso',
  'me lo planteo y te digo',
  'no es probable, pero a ver',
  'mejor decido por la mañana',
  'quizá no pueda, no estoy fijo',
  'lo intento, sin compromiso',
  'a ver cómo me organizo',
  'no me da pista, mañana veo',
  'puede ser, pero no aseguro',
  'lo veo difícil, no descarto',
  'depende del día',
  'me lo pensaré mañana',
  'todo dependerá del trabajo',
];
R18.forEach(msg => cases.push(leadOnly('R18-CONFIDENCE-EDGE', `R18-${N()}`, msg, { expected: 'no_action' })));

// ============================================================
// R19 — REGISTRO (15 nuevas)
// ============================================================
const R19 = [
  ['Cordial saludo Marcos, no podré asistir a la cita por motivos personales', 'cancel_with_followup'],
  ['Buenos días, lamento informarle que debo cancelar nuestra reunión', 'cancel_with_followup'],
  ['Estimado, confirmo presencia mañana', 'no_action'],
  ['tio q va, no voy', 'cancel_with_followup'],
  ['oye colega, mañana no llego', 'cancel_with_followup'],
  ['Le confirmo la cancelación de mi cita por imprevisto', 'cancel_with_followup'],
  ['Sus servicios ya no me interesan, dése de baja mis datos', 'cancel_no_followup'],
  ['paso colega, voy con otro entrenador', 'cancel_no_followup'],
  ['ay sis no voy, te dejo', 'cancel_with_followup'],
  ['Atte, no podré asistir al evento programado', 'cancel_with_followup'],
  ['hermano, no llego, lo siento', 'cancel_with_followup'],
  ['Buenas tardes, anulación pendiente, lo dejamos para futuro', 'cancel_with_followup'],
  ['ok jefe, mañana hablamos', 'no_action'],
  ['Saludos cordiales, paso a confirmar mi presencia', 'no_action'],
  ['mira bro, no me lo creo, no sigo', 'cancel_no_followup'],
];
R19.forEach(([msg, expected]) => {
  const opts = { expected };
  if (expected === 'no_action') opts.context = 'Recordatorio mañana';
  cases.push(leadOnly('R19-REGISTER', `R19-${N()}`, msg, opts));
});

// ============================================================
// R20 — IDIOMAS (20 nuevas)
// ============================================================
const R20 = [
  ['hi sorry, can\'t do tomorrow', 'cancel_with_followup'],
  ['I need to reschedule please', 'cancel_with_followup'],
  ['can we do next week?', 'cancel_with_followup'],
  ['sorry won\'t make it', 'cancel_with_followup'],
  ['sou de Portugal, não posso amanhã', 'cancel_with_followup'],
  ['no puc demà, hauré de cancel·lar', 'cancel_with_followup'],
  ['nessun problema, ci sarò', 'no_action'],
  ['merci, j\'y serai', 'no_action'],
  ['désolé je dois annuler', 'cancel_with_followup'],
  ['cant make it tomorrow sorry', 'cancel_with_followup'],
  ['I won\'t be available', 'cancel_with_followup'],
  ['sorry, mañana no puedo, otra fecha?', 'cancel_with_followup'],
  ['have to cancel, sorry', 'cancel_with_followup'],
  ['I\'ll see you tomorrow!', 'no_action'],
  ['demà ho deixem', 'cancel_with_followup'],
  ['amanhã não vai dar', 'cancel_with_followup'],
  ['I\'m good, see you', 'no_action'],
  ['vou estar, sem stress', 'no_action'],
  ['hi! can we move it?', 'cancel_with_followup'],
  ['perfetto, ci vediamo', 'no_action'],
];
R20.forEach(([msg, expected]) => {
  const opts = { expected };
  if (expected === 'no_action') opts.context = 'Tomorrow we talk';
  cases.push(leadOnly('R20-LANGUAGE', `R20-${N()}`, msg, opts));
});

// ============================================================
// R21 — DELAY SNAP (15 nuevas)
// ============================================================
const R21 = [
  'no puedo, recuérdame el sábado',
  'cancela, hablamos en 8 días',
  'no puedo, dame 4 días',
  'no podré, en 11 días te aviso',
  'cancela y volvemos en 6 días',
  'no llego, hablamos el viernes que viene',
  'no puedo, recordame en 5 días',
  'cancela, en 2 semanas hablamos',
  'no puedo, en 10 días me dices',
  'mejor en 9 días',
  'cancela, retoma en 30 días',
  'no puedo, hablamos en 14 días',
  'cancela, en 3 días te respondo',
  'no podré, dame 7 días',
  'recordame en 12 días',
];
R21.forEach(msg => cases.push(leadOnly('R21-DELAY-SNAP', `R21-${N()}`, msg, { expected: 'cancel_with_followup' })));

// ============================================================
// R22 — SYSTEM EDGE (15 nuevas)
// ============================================================
cases.push(
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'qué tal todo?', dateAdded: mkTs(2) }],
    apts: [], expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'cancelo todo', dateAdded: mkTs(2) }],
    apts: [], expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'mejor lo movemos', dateAdded: mkTs(20) },
      { direction: 'outbound', body: `Vale, ${RESCHEDULE_LINK}`, dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'ya está cambiado', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(3), calendarName: 'Reagendar', dateAdded: mkTs(10) }],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'cancelo', dateAdded: mkTs(40) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(35) },
      { direction: 'inbound', body: 'ya cambié!', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'pero al final ese nuevo día tampoco, cancela también', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(25) }],
    expected: 'cancel_with_followup',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/foto.jpg'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [{ direction: 'inbound', body: '   ', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'qué', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [{ direction: 'inbound', body: '?!', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [{ direction: 'inbound', body: 'jeje', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [
      { direction: 'outbound', body: 'recordatorio importante mañana', dateAdded: mkTs(60) },
      { direction: 'inbound', body: 'gracias, ahí estaré sin falta', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'no puedo hoy', dateAdded: mkTs(60 * 24 * 3) },
      { direction: 'outbound', body: 'sin problema', dateAdded: mkTs(60 * 24 * 3 - 30) },
      { direction: 'inbound', body: 'todo bien, mañana hablamos seguro', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'me da igual la fecha, lo importante es hablar', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: Array.from({length: 20}, (_, i) => ({
      direction: i % 2 === 0 ? 'inbound' : 'outbound',
      body: `mensaje ${i}`,
      dateAdded: mkTs(120 - i * 5),
    })).concat([{direction: 'inbound', body: 'al final no llego mañana, cancela porfa', dateAdded: mkTs(2)}]),
    expected: 'cancel_with_followup',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [
      { direction: 'inbound', body: 'oye, dudas sobre el método antes de la call?', dateAdded: mkTs(20) },
      { direction: 'outbound', body: 'claro, dime', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'son varias, pero mañana las vemos, gracias', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('R22-SYSTEM-EDGE', `R22-${N()}`, {
    messages: [
      { direction: 'outbound', body: 'mañana hablamos eh', dateAdded: mkTs(30) },
      { direction: 'outbound', body: 'recuerda traer cosas', dateAdded: mkTs(20) },
      { direction: 'outbound', body: 'cualquier cosa avisas', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'voy tranquilo, gracias por avisar', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
);

// ============================================================
// R23 — CONFIRMACIONES SUTILES (15 nuevas)
// ============================================================
const R23 = [
  ['mañana sin falta', 'Recordatorio'],
  ['todo OK', 'Mañana 18h'],
  ['gracias por el aviso', 'Recordatorio mañana'],
  ['fenómeno', 'Confirmamos?'],
  ['venga venga', 'Mañana hablamos'],
  ['ahí estoy seguro', 'Confirmada'],
  ['totalmente', 'Mañana 19h'],
  ['oki doki', 'Recordatorio'],
  ['todo perfecto', 'Confirmamos llamada'],
  ['mañana al pie del cañón', 'Confirmada'],
  ['hasta mañana entonces', 'Llamada mañana'],
  ['👀', 'Recordatorio'],
  ['oki!', 'Mañana hablamos'],
  ['hablamos mañana entonces', 'Confirmada'],
  ['fenómeno bro', 'Confirmamos'],
];
R23.forEach(([msg, ctx]) => cases.push(leadOnly('R23-CONFIRM-SUBTLE', `R23-${N()}`, msg, { expected: 'no_action', context: ctx })));

// ============================================================
// R25 — DELAY VS CANCEL (30 nuevas — CRÍTICO por el fix reciente)
// ============================================================
const R25Retrasos = [
  'oye que llego con retraso',
  'voy tarde, perdón',
  'estoy en el metro, llego tarde',
  'voy a llegar 5 min después',
  'me ha pillado el atasco, llego en 15',
  'salgo ahora, llego con 10 min de retraso',
  'no llego puntual, pero voy',
  'tarde llego, no canceles',
  'voy con tardanza',
  'me he liado y llego tarde',
  'al final llego justo después de la hora',
  'voy tirando pero con retraso',
  'me retraso un poco, ya casi',
  'estaré tarde pero llego',
  'tarde, pero ahí voy',
];
R25Retrasos.forEach(msg => cases.push(leadOnly('R25-DELAY-VS-CANCEL', `R25-${N()}`, msg, { expected: 'no_action' })));

const R25Cancels = [
  'no llego hoy',
  'no llego mañana',
  'no llego a la sesión',
  'no llegaré, perdona',
  'no llego, lo dejamos',
  'no voy a llegar, anula',
  'mañana no llego',
  'no llego seguro, cancela',
  'al final no llego',
  'no llego hoy, cancela mejor',
];
R25Cancels.forEach(msg => cases.push(leadOnly('R25-DELAY-VS-CANCEL', `R25-${N()}`, msg, { expected: 'cancel_with_followup' })));

const R25Mixed = [
  ['llego tarde y necesito reagendar', 'cancel_with_followup'],
  ['voy con retraso pero ahí estoy', 'no_action'],
  ['llego 5 min tarde, no canceles', 'no_action'],
  ['llego con retraso largo, mejor cancela', 'cancel_with_followup'],
  ['retraso brutal, no llego', 'cancel_with_followup'],
];
R25Mixed.forEach(([msg, expected]) => cases.push(leadOnly('R25-DELAY-VS-CANCEL', `R25-${N()}`, msg, { expected })));

// ============================================================
// R26 — WILD (40 nuevas)
// ============================================================

// R26A — Emocional (5)
const R26A = [
  'estoy con depresión, no me veo hoy',
  'tengo crisis personal, perdona',
  'hoy estoy emocional, mejor otro día',
  'me siento devastado, no puedo',
  'paso por momento duro, no llego',
];
R26A.forEach(msg => cases.push(leadOnly('R26-WILD', `R26A-${N()}`, msg, { expected: 'cancel_with_followup' })));

// R26B — Bromas (5)
const R26B = [
  ['voy a estar tomando algo con amigos', 'cancel_with_followup'],
  ['noche loca anoche, llego justo', 'no_action'],
  ['en casa de amigos, no me da tiempo, cancela', 'cancel_with_followup'],
  ['en barbacoa familiar, ahí me ves después', 'no_action'],
  ['jaja mira no estoy de humor, dejémoslo', 'cancel_with_followup'],
];
R26B.forEach(([msg, expected]) => cases.push(leadOnly('R26-WILD', `R26B-${N()}`, msg, { expected })));

// R26C — Enfado (3)
const R26C = [
  'JODER YA, NO ME ESCRIBAS MÁS',
  'estoy harto de tantos mensajes',
  'qué pesados sois, dejad de molestar',
];
R26C.forEach(msg => cases.push(leadOnly('R26-WILD', `R26C-${N()}`, msg, { expected: 'cancel_no_followup' })));

// R26D — Confuso (4)
const R26D = [
  'mmm a ver',
  'pues mira',
  'ahora vengo',
  'luego te respondo',
];
R26D.forEach(msg => cases.push(leadOnly('R26-WILD', `R26D-${N()}`, msg, { expected: 'no_action' })));

// R26E — Técnico (4)
const R26E = [
  'no me carga el enlace del meet',
  'el micrófono no funciona, ayúdame',
  'no me deja entrar a Teams',
  'el ordenador se ha quedado pillado, dame 5min',
];
R26E.forEach(msg => cases.push(leadOnly('R26-WILD', `R26E-${N()}`, msg, { expected: 'no_action' })));

// R26F — Cambio modalidad (3)
const R26F = [
  'hablamos por audio en vez de zoom?',
  'mejor por móvil que por ordenador?',
  'te paso mi WhatsApp y hablamos por ahí?',
];
R26F.forEach(msg => cases.push(leadOnly('R26-WILD', `R26F-${N()}`, msg, { expected: 'no_action' })));

// R26G — Condicionales (5)
const R26G = [
  ['si no me llamas, no asisto', 'no_action'],
  ['si dura más de 30 min, cancelo', 'no_action'],
  ['si llueve cancelo, depende del clima', 'no_action'],
  ['si no me garantizas resultados, no voy', 'no_action'],
  ['si veo el video y no me convence, cancelo', 'no_action'],
];
R26G.forEach(([msg, expected]) => cases.push(leadOnly('R26-WILD', `R26G-${N()}`, msg, { expected })));

// R26H — Random short (5)
const R26H = [
  ['o', 'no_action'],
  ['vale ok', 'no_action'],
  ['oye no', 'no_action'],
  ['j', 'no_action'],
  ['ñ', 'no_action'],
];
R26H.forEach(([msg, expected]) => cases.push(leadOnly('R26-WILD', `R26H-${N()}`, msg, { expected })));

// R26I — Equivocado (3)
const R26I = [
  'cariño llegas a la una?',
  'mamá voy de compras al super',
  'pásame las llaves luego',
];
R26I.forEach(msg => cases.push(leadOnly('R26-WILD', `R26I-${N()}`, msg, { expected: 'no_action' })));

// R26J — Largos (3)
const R26J = [
  ['Hola Marcos, te escribo desde Madrid donde estoy de viaje familiar. Mi hermana me pidió ayuda con la mudanza esta semana y entre eso y el trabajo no he tenido un minuto. Mañana exactamente estaré entre cajas y no puedo conectar tranquila a la llamada. Te pido por favor que la pasemos a la semana que viene cuando esté de vuelta en casa.', 'cancel_with_followup'],
  ['Buenas Marcos, quería decirte que estoy 100% comprometido con la llamada de mañana. He estado mirando el material que me pasaste, me ha gustado mucho el enfoque holístico que tenéis. Estoy preparando preguntas concretas sobre la fase 2 del programa y sobre la integración con mi rutina actual de gym. Hasta mañana entonces!', 'no_action'],
  ['Marcos sinceramente no veo que esto vaya conmigo. He estado consultando con mi nutricionista actual y el dice que ya tengo un plan adecuado. Te agradezco mucho toda la información que has compartido pero no voy a continuar el proceso. Cancela la llamada y todos los seguimientos por favor. Mucho éxito con tu proyecto.', 'cancel_no_followup'],
];
R26J.forEach(([msg, expected]) => cases.push(leadOnly('R26-WILD', `R26J-${N()}`, msg, { expected })));

module.exports = cases;
