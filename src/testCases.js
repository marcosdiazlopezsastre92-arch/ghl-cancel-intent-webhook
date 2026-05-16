'use strict';

// ============================================================
// Test cases for the cancel-intent classifier.
//
// SLIM REGRESSION + RETRASO STRESS TEST
// - 1-2 representative cases per existing category G1-G24 (regression)
// - G25-DELAY-VS-CANCEL with ~35 cases stress-testing the new rule
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

// ============================================================
// REGRESIÓN: 1-2 casos representativos por categoría
// ============================================================

// G1 CONFIRMACIONES
cases.push(
  leadOnly('G1-CONFIRM', 'G1-vale', 'vale', { expected: 'no_action', context: 'Mañana a las 18h tu llamada' }),
  leadOnly('G1-CONFIRM', 'G1-emoji-thumbs', '👍', { expected: 'no_action', context: 'Recordatorio de tu llamada' }),
);

// G2 CANCELACIONES CLARAS
cases.push(
  leadOnly('G2-CANCEL-CLEAR', 'G2-no-puedo-manana', 'Marcos, no puedo ir mañana', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-cancela-porfa', 'cancela la llamada por favor', { expected: 'cancel_with_followup' }),
);

// G3 MÉDICAS
cases.push(
  leadOnly('G3-MEDICAL', 'G3-dolor-cabeza', 'tengo un dolor de cabeza horrible, no puedo hoy', { expected: 'cancel_with_followup' }),
  leadOnly('G3-MEDICAL', 'G3-hospital-familiar', 'mi madre está en el hospital, no puedo hoy', { expected: 'cancel_with_followup' }),
);

// G4 VIAJES
cases.push(
  leadOnly('G4-TRAVEL', 'G4-semana-fatal', 'esta semana fatal, imposible', { expected: 'cancel_with_followup' }),
  leadOnly('G4-TRAVEL', 'G4-viaje-trabajo', 'estoy de viaje de trabajo toda la semana', { expected: 'cancel_with_followup' }),
);

// G5 HARD CANCELS
cases.push(
  leadOnly('G5-HARD-CANCEL', 'G5-no-interesa', 'ya no me interesa', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-otro-coach', 'he decidido irme con otro coach', { expected: 'cancel_no_followup' }),
);

// G6 PREGUNTAS
cases.push(
  leadOnly('G6-QUESTIONS', 'G6-zoom-meet', 'la llamada es por Zoom o Meet?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-sigue-pie', 'sigue en pie lo de hoy?', { expected: 'no_action' }),
);

// G7 TIME TWEAK
cases.push(
  leadOnly('G7-TIME-TWEAK', 'G7-mas-tarde', 'podemos hacerla a las 18 en vez de las 16?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-30-min', 'me viene mejor 30 min más tarde si te va bien', { expected: 'no_action' }),
);

// G8 POST-LINK ACEPTACIÓN
cases.push(
  postLink('G8-LINK-ACCEPT', 'G8-vale-gracias', 'no sé si podré asistir', 'vale gracias!', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-ya-cambio', 'imposible hoy', 'ya cambio la cita, gracias', { expected: 'cancel_with_followup' }),
);

// G9 POST-LINK RECHAZO
cases.push(
  postLink('G9-LINK-REJECT', 'G9-si-puedo', 'no sé si podré', 'vale sí puedo asistir', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-dejalo-ire', 'va estar dificil', 'no no, déjalo, iré', { expected: 'no_action' }),
);

// G10 POST-LINK AMBIGUO
cases.push(
  postLink('G10-LINK-AMBIG', 'G10-vale-solo', 'no sé', 'vale', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-pensarlo', 'tengo dudas', 'déjame pensarlo y te digo', { expected: 'no_action' }),
);

// G11 PARTIAL
cases.push(
  exchange('G11-PARTIAL', 'G11-solo-martes', {
    messages: [
      { direction: 'outbound', body: 'Tienes 2 llamadas, martes y jueves', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'cancela solo la del martes, la del jueves la mantengo', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
);

// G12 CANCEL TODAS
cases.push(
  exchange('G12-BOTH', 'G12-cancela-2', {
    messages: [
      { direction: 'outbound', body: 'Tienes 2 llamadas agendadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'cancela las dos por favor', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', ids: 2,
  }),
);

// G13 FLIP-FLOP
cases.push(
  exchange('G13-FLIP-FLOP', 'G13-cancel-then-go', {
    messages: [
      { direction: 'inbound', body: 'no creo que pueda', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'ah espera sí, voy', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-go-then-cancel', {
    messages: [
      { direction: 'inbound', body: 'ahí estoy', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'no espera, al final no puedo', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
);

// G14 MEDIA
cases.push(
  exchange('G14-MEDIA', 'G14-audio-only', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/voice.mp4'], dateAdded: mkTs(2) }],
    expected: 'audio_needs_review',
  }),
  exchange('G14-MEDIA', 'G14-image-only', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/photo.jpg'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
);

// G15 COLOQUIAL
cases.push(
  leadOnly('G15-COLOQUIAL', 'G15-porfa-cancelame', 'porfa cancelame', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-tio-paso', 'tio paso de esto, gracias', { expected: 'cancel_no_followup' }),
);

// G16 RESCHEDULE
cases.push(
  leadOnly('G16-RESCHEDULE', 'G16-cambiar-jueves', 'podemos cambiarla para el jueves?', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-otra-semana', 'podemos hacerla la semana que viene?', { expected: 'cancel_with_followup' }),
);

// G17 MIXED
cases.push(
  leadOnly('G17-MIXED', 'G17-cancel-cuando', 'no puedo mañana, cuándo podemos quedar?', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-confirm-link', 'ahí estoy, me pasas el link?', { expected: 'no_action' }),
);

// G18 CONFIDENCE EDGE
cases.push(
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-igual-no', 'igual no llego a tiempo', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-vere-si', 'veré si puedo, te confirmo en un rato', { expected: 'no_action' }),
);

// G19 REGISTRO
cases.push(
  leadOnly('G19-REGISTER', 'G19-formal-cancel', 'Estimado Marcos, le ruego me disculpe pero no podré asistir a la cita programada.', { expected: 'cancel_with_followup' }),
  leadOnly('G19-REGISTER', 'G19-informal-cancel', 'tio cancela porfi', { expected: 'cancel_with_followup' }),
);

// G20 IDIOMAS
cases.push(
  leadOnly('G20-LANGUAGE', 'G20-english-cancel', 'sorry Marcos, can\'t make it tomorrow', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-catalan', 'demà no puc Marcos, ho deixem per un altre dia', { expected: 'cancel_with_followup' }),
);

// G21 DELAY SNAP
cases.push(
  leadOnly('G21-DELAY-SNAP', 'G21-en-5-dias', 'no puedo, recuérdame en 5 días por favor', { expected: 'cancel_with_followup' }),
  leadOnly('G21-DELAY-SNAP', 'G21-en-2-semanas', 'no podré, vuélveme a llamar en 2 semanas', { expected: 'cancel_with_followup' }),
);

// G22 SYSTEM EDGE
cases.push(
  exchange('G22-SYSTEM-EDGE', 'G22-no-appts', {
    messages: [{ direction: 'inbound', body: 'Hola q tal', dateAdded: mkTs(2) }],
    apts: [], expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-post-link-thanks', {
    messages: [
      { direction: 'inbound', body: 'pásame para reagendar porfa', dateAdded: mkTs(20) },
      { direction: 'outbound', body: `Claro, ${RESCHEDULE_LINK}`, dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'gracias!', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(10) }],
    expected: 'no_action',
  }),
);

// G23 CONFIRMACIONES SUTILES
cases.push(
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-recibido', 'recibido', { expected: 'no_action', context: 'Confirmamos llamada mañana?' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-anotado', 'anotado', { expected: 'no_action', context: 'Te paso link mañana' }),
);

// G24 LEGACY
cases.push(
  {
    category: 'G24-LEGACY', name: 'G24-legacy-renal-colic',
    messages: [
      { direction: 'inbound', body: 'Hola buenas tardes!! He tenido cólico nefriticos! Y mañana voy al hospital. Una amiga uróloga me va a hacer unas pruebas', dateAdded: mkTs(8) },
      { direction: 'inbound', body: 'Lo dejamos para otro di por favor? Gracias', dateAdded: mkTs(6) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup',
  },
);

// ============================================================
// G25 — DELAY-VS-CANCEL (STRESS TEST de la nueva regla de retrasos)
// 35 casos cubriendo retrasos puros, cancelaciones puras, mixtos y edge cases
// ============================================================

// --- RETRASOS PUROS (expected: no_action) ---
cases.push(
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-001-no-tiempo', 'no podré llegar a tiempo lo siento', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-002-no-puntual', 'no llegaré puntual a la llamada', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-003-no-podre-puntual', 'no podré llegar puntual hoy', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-004-llego-tarde', 'llego tarde, perdona', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-005-llegare-tarde', 'llegaré tarde', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-006-voy-tarde', 'voy a llegar tarde', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-007-poco-tarde', 'llego un poco tarde', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-008-retraso-10min', 'me retraso 10 min', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-009-15-retraso', 'voy con 15 min de retraso', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-010-me-retrasare', 'me retrasaré un poco, perdona', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-011-me-sale-algo', 'me sale algo, llego un poco tarde', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-012-no-inicio', 'no llego al inicio, entro a mitad', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-013-puedo-tarde', 'puedo entrar 5 min tarde?', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-014-se-hace-tarde', 'se me hace tarde, voy a tardar 15 min', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-015-trafico', 'estoy atrapado en el tráfico, llego tarde', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-016-salgo-trabajo', 'salgo ahora del trabajo, voy con retraso', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-017-10-tarde-bien', 'es 10 minutos tarde está bien?', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-018-perdona-retraso', 'perdona el retraso, llego en 10', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-019-no-tiempo-pero-voy', 'no podré llegar a tiempo pero voy', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-020-voy-retraso-llego', 'voy con retraso pero llego', { expected: 'no_action' }),
);

// --- CANCELACIONES PURAS sin cualificador de tarde (expected: cancel_with_followup) ---
cases.push(
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-021-no-llego-llamada', 'no llego a la llamada', { expected: 'cancel_with_followup' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-022-no-podre-ir', 'no podré ir mañana', { expected: 'cancel_with_followup' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-023-no-podre-asistir', 'no podré asistir hoy', { expected: 'cancel_with_followup' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-024-imposible', 'me es imposible asistir', { expected: 'cancel_with_followup' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-025-no-voy-poder', 'al final no voy a poder', { expected: 'cancel_with_followup' }),
);

// --- MIXTOS - retraso + cancelación (expected: cancel_with_followup, gana el cancel) ---
cases.push(
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-026-tarde-mejor-cancela', 'llego tarde y mejor cancela', { expected: 'cancel_with_followup' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-027-no-tiempo-reagenda', 'no llego a tiempo, mejor reagenda', { expected: 'cancel_with_followup' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-028-tarde-otro-dia', 'llego tarde, lo dejamos para otro día', { expected: 'cancel_with_followup' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-029-no-tiempo-cancela', 'no podré llegar a tiempo, mejor cancela', { expected: 'cancel_with_followup' }),
);

// --- MIXTOS - retraso largo pero sigue siendo retraso (expected: no_action) ---
cases.push(
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-030-30min-retraso', 'voy con 30 min de retraso, llego al final', { expected: 'no_action' }),
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-031-20min-estoy', 'llego un poco tarde, en 20 min estoy', { expected: 'no_action' }),
);

// --- EDGE CASES ---
cases.push(
  // Pregunta sobre poder conectarse tarde - es no_action
  leadOnly('G25-DELAY-VS-CANCEL', 'G25-032-puedo-conectar-tarde', 'puedo conectarme tarde a la llamada?', { expected: 'no_action' }),
  // Lead responde "llego tarde" tras pregunta del coach sobre reagendar
  exchange('G25-DELAY-VS-CANCEL', 'G25-033-tras-coach-pregunta-reagendar', {
    messages: [
      { direction: 'inbound', body: 'no podré llegar a tiempo lo siento', dateAdded: mkTs(20) },
      { direction: 'outbound', body: '¿prefieres moverla o es que llegas un poco tarde?', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'si es 10 minutos tarde está bien', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  // Lead responde "mejor mueve" tras misma pregunta
  exchange('G25-DELAY-VS-CANCEL', 'G25-034-tras-coach-pide-mover', {
    messages: [
      { direction: 'inbound', body: 'no podré llegar a tiempo lo siento', dateAdded: mkTs(20) },
      { direction: 'outbound', body: '¿prefieres moverla o es que llegas un poco tarde?', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'mejor muévela, no llego a la hora', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  // Lead avisa retraso, coach no responde, lead cancela después
  exchange('G25-DELAY-VS-CANCEL', 'G25-035-retraso-luego-cancela', {
    messages: [
      { direction: 'inbound', body: 'llegaré 10 min tarde', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'al final no puedo, cancela mejor', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
);

module.exports = cases;
