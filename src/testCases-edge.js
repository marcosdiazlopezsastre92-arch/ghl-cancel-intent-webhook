'use strict';

// Edge case stress suite — combinaciones raras y escenarios reales no cubiertos
// por testCases-multimsg.js (que valida lo "estándar").
//
// ~140 casos en 10 categorías:
//   E1 (20) — Multi-señal compleja (lead mezcla varias cosas en una conversación)
//   E2 (15) — Lead cambia de opinión durante la conversación
//   E3 (20) — Slang / informal extremo (estilo WhatsApp real)
//   E4 (15) — Typos heavy / mala ortografía / abreviaciones
//   E5 (15) — Retraso + cancel mezclado ambiguo
//   E6 (10) — Confusión / wrong number / spam-suspect
//   E7 (10) — Hostil / disqualifying / agresivo
//   E8 (10) — Emergencia / motivo serio
//   E9 (10) — Conversación larga (10+ mensajes) con drift
//   E10 (15) — Cancel partial complejo (3 citas, combinaciones)

const APT_ONE = [{
  id: 'TEST_APT_1',
  startTime: '2026-05-18T16:00:00+02:00',
  calendarId: 'CAL_A',
}];

const APT_TWO = [
  { id: 'TEST_APT_1', startTime: '2026-05-18T16:00:00+02:00', calendarId: 'CAL_A' },
  { id: 'TEST_APT_2', startTime: '2026-05-20T16:00:00+02:00', calendarId: 'CAL_B' },
];

const APT_THREE = [
  { id: 'TEST_APT_1', startTime: '2026-05-18T16:00:00+02:00', calendarId: 'CAL_A' },
  { id: 'TEST_APT_2', startTime: '2026-05-20T16:00:00+02:00', calendarId: 'CAL_B' },
  { id: 'TEST_APT_3', startTime: '2026-05-22T16:00:00+02:00', calendarId: 'CAL_C' },
];

let CASE_ID = 0;
function nextName(prefix) {
  CASE_ID += 1;
  return `${prefix}-${String(CASE_ID).padStart(3, '0')}`;
}

function ts(offset = 0) {
  return new Date(Date.parse('2026-05-17T20:00:00Z') + offset * 1000).toISOString();
}

function tc(prefix, category, msgs, expectedIntent, opts = {}) {
  const messages = msgs.map((m, i) => ({
    direction: m[0],
    body: m[1],
    dateAdded: ts(i * 30),
  }));
  const out = {
    name: nextName(prefix),
    category,
    messages,
    appointments: opts.appointments || APT_ONE,
    expectedIntent,
  };
  if (opts.expectedDelay !== undefined) out.expectedDelay = opts.expectedDelay;
  if (opts.expectedIdsCount !== undefined) out.expectedIdsCount = opts.expectedIdsCount;
  return out;
}

const cases = [];

// ============================================================
// E1: Multi-señal compleja (20 cases)
// ============================================================

const E1_CASES = [
  [['outbound', 'Mañana 16h'], ['inbound', 'estoy de viaje'], ['inbound', 'vuelvo el lunes'], ['inbound', 'a partir de las 17 va bien']],
  [['outbound', 'Recordatorio mañana'], ['inbound', 'no puedo mañana'], ['inbound', 'ni pasado'], ['inbound', 'mejor la semana que viene']],
  [['outbound', 'Te espero mañana 16h'], ['inbound', 'tengo lío esta semana'], ['inbound', 'cancela'], ['inbound', 'en 2 semanas si te va bien']],
  [['outbound', 'Mañana llamada'], ['inbound', 'estoy en Madrid en evento'], ['inbound', 'no puedo conectarme'], ['inbound', 'cancela porfa']],
  [['outbound', 'Llamada confirmada'], ['inbound', 'no sé si voy a poder'], ['inbound', 'mejor lo movemos al jueves?']],
  [['outbound', 'Recordatorio'], ['inbound', 'perdona perdona'], ['inbound', 'es que se me ha liado todo'], ['inbound', 'familiares y trabajo'], ['inbound', 'cancela porfa lo siento']],
  [['outbound', 'Mañana 16h te espero'], ['inbound', 'ufff no puedo creer la semana que llevo'], ['inbound', 'cancela hoy lo siento']],
  [['outbound', 'Confirmamos llamada'], ['inbound', 'no puedo a esa hora'], ['inbound', 'si tenéis hueco a partir de las 19 cualquier día va bien']],
  [['outbound', 'Recordatorio'], ['inbound', 'estoy malo desde el lunes'], ['inbound', 'voy a estar 3-4 días así'], ['inbound', 'mejor cuando recupere']],
  [['outbound', 'Mañana'], ['inbound', 'estoy en Tarragona en feria'], ['inbound', 'esta semana imposible'], ['inbound', 'la siguiente?']],
  [['outbound', 'Recordatorio'], ['inbound', 'gracias por estar pendiente'], ['inbound', 'pero no puedo asistir hoy'], ['inbound', 'lo siento']],
  [['outbound', 'Mañana 16h'], ['inbound', 'no me viene bien'], ['inbound', 'puedes mandarme info por aquí?']],
  [['outbound', 'Llamada'], ['inbound', 'me he resfriado fuerte'], ['inbound', 'creo que mañana ya estaré bien'], ['inbound', 'mejor pasamos al miércoles?']],
  [['outbound', 'Recordatorio'], ['inbound', 'si esto es para venderme algo'], ['inbound', 'no me interesa'], ['inbound', 'cancela']],
  [['outbound', 'Mañana 16h'], ['inbound', 'mira, no voy a poder'], ['inbound', 'me ha pasado de todo esta semana'], ['inbound', 'cancela y ya hablamos en otro momento']],
  [['outbound', 'Confirmado para mañana'], ['inbound', 'genial'], ['inbound', 'pero puedes a las 17 mejor que a las 16?']],
  [['outbound', 'Recordatorio'], ['inbound', 'no llego mañana'], ['inbound', 'qué tengo que hacer para mover la cita?']],
  [['outbound', 'Mañana 18h'], ['inbound', 'me ha surgido algo con mi pareja'], ['inbound', 'tengo que estar para ella'], ['inbound', 'cancela porfa']],
  [['outbound', 'Recordatorio'], ['inbound', 'oye muchas gracias por el detalle'], ['inbound', 'pero al final no voy a poder ir'], ['inbound', 'lo siento']],
  [['outbound', 'Llamada hoy'], ['inbound', 'estoy reventado'], ['inbound', 'voy a desconectar el resto de la semana'], ['inbound', 'cancela y hablamos la siguiente']],
];

const E1_EXPECTED = [
  ['cancel_with_followup', 3],
  ['cancel_with_followup', 7],
  ['cancel_with_followup', 7],
  ['cancel_with_followup', 1],
  ['cancel_with_followup', undefined],
  ['cancel_with_followup', 1],
  ['cancel_with_followup', 1],
  ['cancel_with_followup', undefined],
  ['cancel_with_followup', 3],
  ['cancel_with_followup', 7],
  ['cancel_with_followup', 1],
  ['cancel_with_followup', 1],
  ['cancel_with_followup', undefined],
  ['cancel_with_followup', 1],
  ['cancel_with_followup', 1],
  ['no_action', undefined],
  ['cancel_with_followup', 1],
  ['cancel_with_followup', 1],
  ['cancel_with_followup', 1],
  ['cancel_with_followup', 7],
];

for (let i = 0; i < E1_CASES.length; i++) {
  const [intent, delay] = E1_EXPECTED[i];
  if (intent === 'no_action') {
    cases.push(tc('E1', 'E1-MULTI-SENAL', E1_CASES[i], intent));
  } else {
    const opts = delay !== undefined ? { expectedDelay: delay, expectedIdsCount: 1 } : { expectedIdsCount: 1 };
    cases.push(tc('E1', 'E1-MULTI-SENAL', E1_CASES[i], intent, opts));
  }
}

// ============================================================
// E2: Lead cambia de opinión (15 cases)
// ============================================================

const E2_CASES = [
  { msgs: [['outbound', 'Te espero a las 16'], ['inbound', 'cancela porfa'], ['inbound', 'espera espera'], ['inbound', 'al final sí puedo']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'no voy a poder ir'], ['inbound', 'ah espera, perdona'], ['inbound', 'sí puedo, ignora el mensaje']], intent: 'no_action' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'anula la cita'], ['inbound', 'no perdona'], ['inbound', 'me he equivocado, allí estaré']], intent: 'no_action' },
  { msgs: [['outbound', 'Te espero mañana'], ['inbound', 'podemos cambiarla al jueves?'], ['inbound', 'ah no, espera'], ['inbound', 'me lié, sí puedo mañana']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana 18h'], ['inbound', 'no llego'], ['inbound', 'no, mentira'], ['inbound', 'sí llego']], intent: 'no_action' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'cancela'], ['inbound', 'no'], ['inbound', 'al final sí voy']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'creo que no podré'], ['inbound', 'déjame ver'], ['inbound', 'vale al final sí, allí estaré']], intent: 'no_action' },
  { msgs: [['outbound', 'Confirmamos'], ['inbound', 'no voy'], ['inbound', 'bueno, déjame mirar'], ['inbound', 'sí sí, sí voy']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'allí estaré'], ['inbound', 'ah espera, me ha surgido algo'], ['inbound', 'cancela mejor']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'perfecto'], ['inbound', 'no espera'], ['inbound', 'mejor lo movemos al viernes']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'paso'], ['inbound', 'no espera'], ['inbound', 'voy']], intent: 'no_action' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'cancela porfa'], ['inbound', 'olvida lo anterior'], ['inbound', 'sí voy mañana']], intent: 'no_action' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'no puedo'], ['inbound', 'ignora ese mensaje'], ['inbound', 'sí puedo']], intent: 'no_action' },
  { msgs: [['outbound', 'Llamada hoy'], ['inbound', 'no llego'], ['inbound', '*sí llego*'], ['inbound', 'perdona el typo']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'me viene mejor otro día'], ['inbound', 'pero pensándolo mejor'], ['inbound', 'mantén la de mañana, voy sí o sí']], intent: 'no_action' },
];

for (const c of E2_CASES) {
  cases.push(tc('E2', 'E2-CAMBIO-OPINION', c.msgs, c.intent,
    c.intent !== 'no_action' ? { expectedIdsCount: 1 } : {}));
}

// ============================================================
// E3: Slang / informal extremo (20 cases)
// ============================================================

const E3_CASES = [
  { msgs: [['outbound', 'Recordatorio mañana 16h'], ['inbound', 'tio q no puedo']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Llamada mañana'], ['inbound', 'neeeee'], ['inbound', 'no llego']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'k coñazo'], ['inbound', 'no puedo asistir hoy']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'joder no llego'], ['inbound', 'mil disculpas']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'no me da la vida'], ['inbound', 'mejor lo dejamos para más adelante']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Llamada'], ['inbound', 'buf no puedo'], ['inbound', 'estoy hasta el moño']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Hoy 18h'], ['inbound', 'ostras q lio q tengo'], ['inbound', 'cancela']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'sip ahí estoy']], intent: 'no_action' },
  { msgs: [['outbound', 'Llamada mañana'], ['inbound', 'venga vale']], intent: 'no_action' },
  { msgs: [['outbound', 'Confirmado'], ['inbound', 'guay'], ['inbound', 'nos vemos']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'pf q palo'], ['inbound', 'no me apetece nada hoy'], ['inbound', 'lo dejamos para otro día?']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Llamada'], ['inbound', 'wenas'], ['inbound', 'q no llego']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Hoy 16h'], ['inbound', 'tron no me viene bien'], ['inbound', 'mejor otro día']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'me piro de finde'], ['inbound', 'no llego']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'q estoy reventau'], ['inbound', 'no puedo']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'voy a tope con el curro'], ['inbound', 'cancela porfi']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Llamada hoy'], ['inbound', 'ufff no puedo'], ['inbound', 'estoy con un dolor de cabeza brutal']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'q rabia'], ['inbound', 'no llego al final']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'tio me ha caido la del pulpo'], ['inbound', 'pasamos la cita?']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Hoy 18h'], ['inbound', 'q viva la madre que me parió'], ['inbound', 'al final sí voy']], intent: 'no_action' },
];

for (const c of E3_CASES) {
  cases.push(tc('E3', 'E3-SLANG-INFORMAL', c.msgs, c.intent,
    c.intent !== 'no_action' ? { expectedDelay: 1, expectedIdsCount: 1 } : {}));
}

// ============================================================
// E4: Typos heavy (15 cases)
// ============================================================

const E4_CASES = [
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'kancela porfa']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'no pued ir'], ['inbound', 'cancla pls']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Llamada'], ['inbound', 'mjor no'], ['inbound', 'tengo lio']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Hoy 18h'], ['inbound', 'anua la cita']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'noo llgo'], ['inbound', 'lo sient']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'puede k pase de la call hoy']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'al fin no voi'], ['inbound', 'cancela']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'q no llego mañna'], ['inbound', 'porfa cancla']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'tngo q trabjar'], ['inbound', 'no voy a llegr']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Llamada hoy'], ['inbound', 'no llegoo'], ['inbound', 'cancla']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'ok prfct']], intent: 'no_action' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'vle'], ['inbound', 'allí estaré']], intent: 'no_action' },
  { msgs: [['outbound', 'Hoy 16h'], ['inbound', 'qe vine tarde 15 min']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'eske no llego'], ['inbound', 'mil perdones']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'soyy yo'], ['inbound', 'no podre ir hoyy']], intent: 'cancel_with_followup' },
];

for (const c of E4_CASES) {
  cases.push(tc('E4', 'E4-TYPOS', c.msgs, c.intent,
    c.intent !== 'no_action' ? { expectedDelay: 1, expectedIdsCount: 1 } : {}));
}

// ============================================================
// E5: Retraso + cancel mezclado ambiguo (15 cases)
// ============================================================

const E5_CASES = [
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'voy a llegar 30 min tarde'], ['inbound', 'mejor cancela']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'voy con retraso'], ['inbound', 'mejor pasamos a otro día?']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'no llego a tiempo'], ['inbound', 'tengo que cancelar']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Hoy 18h'], ['inbound', 'llego 10 tarde'], ['inbound', 'pero voy']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'llego 40 min tarde'], ['inbound', 'eso no nos vale verdad?']], intent: 'no_action' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'llego tarde y mal'], ['inbound', 'mejor déjalo']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'voy 15 tarde']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'me ha pillado el tráfico'], ['inbound', 'ya es muy tarde, cancela']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Hoy 16h'], ['inbound', 'no llego a tiempo'], ['inbound', 'lo paso para mañana']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Llamada'], ['inbound', 'tráfico horrible'], ['inbound', 'llego 20 tarde pero voy']], intent: 'no_action' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'voy a llegar tarde'], ['inbound', 'no sé si me da tiempo'], ['inbound', 'cancela mejor']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'si llego mucho tarde mejor cancela'], ['inbound', 'pero intento llegar']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'voy a llegar 45 min tarde'], ['inbound', 'eso ya no tiene sentido verdad?']], intent: 'no_action' },
  { msgs: [['outbound', 'Hoy 18h'], ['inbound', 'imposible llegar a las 18'], ['inbound', 'cancela porfa, lo siento']], intent: 'cancel_with_followup' },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'no creo que llegue puntual'], ['inbound', 'lo dejo?']], intent: 'no_action' },
];

for (const c of E5_CASES) {
  cases.push(tc('E5', 'E5-RETRASO-CANCEL', c.msgs, c.intent,
    c.intent !== 'no_action' ? { expectedDelay: 1, expectedIdsCount: 1 } : {}));
}

// ============================================================
// E6: Confusión / wrong number / spam-suspect (10 cases)
// ============================================================

const E6_CASES = [
  { msgs: [['outbound', 'Recordatorio mañana 16h'], ['inbound', 'qué? no sé quién eres']], intent: 'no_action' },
  { msgs: [['outbound', 'Llamada'], ['inbound', 'me equivoqué, no soy yo'], ['inbound', 'borradme porfa']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Te espero mañana'], ['inbound', 'creo que esto es spam'], ['inbound', 'yo no he pedido nada']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'tenéis mal el número'], ['inbound', 'yo no soy ese']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'perdona, esto era para mi pareja'], ['inbound', 'ella es la que pidió']], intent: 'no_action' },
  { msgs: [['outbound', 'Llamada hoy'], ['inbound', 'qué llamada?'], ['inbound', 'no sé de qué hablas']], intent: 'no_action' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'no recuerdo haber pedido nada'], ['inbound', 'pero vale, sí, lo intento mañana']], intent: 'no_action' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'uy esto era para otro'], ['inbound', 'no soy quien crees']], intent: 'no_action' },
  { msgs: [['outbound', 'Mañana llamada'], ['inbound', 'ah vale, ya recuerdo'], ['inbound', 'sí, ahí estoy']], intent: 'no_action' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'no he pedido esto, dejad de contactarme']], intent: 'cancel_no_followup' },
];

for (const c of E6_CASES) {
  cases.push(tc('E6', 'E6-CONFUSION-SPAM', c.msgs, c.intent,
    c.intent !== 'no_action' ? { expectedIdsCount: 1 } : {}));
}

// ============================================================
// E7: Hostil / disqualifying (10 cases)
// ============================================================

const E7_CASES = [
  { msgs: [['outbound', 'Recordatorio mañana'], ['inbound', 'DEJADME EN PAZ']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Llamada'], ['inbound', 'estoy hasta los huevos de mensajes'], ['inbound', 'no me llaméis más']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Te espero mañana'], ['inbound', 'spam'], ['inbound', 'borradme ya']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'no quiero saber nada'], ['inbound', 'no me contactéis nunca más']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'me estáis acosando']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Llamada'], ['inbound', 'joder qué pesados'], ['inbound', 'dejadme tranquilo']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'voy a denunciar este spam']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'BLOQUEAR'], ['inbound', 'no me escribáis más']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'no me interesa nada, ya os lo dije'], ['inbound', 'dejad de molestar']], intent: 'cancel_no_followup' },
  { msgs: [['outbound', 'Llamada hoy'], ['inbound', 'paso de todo'], ['inbound', 'quítame de la lista YA']], intent: 'cancel_no_followup' },
];

for (const c of E7_CASES) {
  cases.push(tc('E7', 'E7-HOSTIL', c.msgs, c.intent, { expectedIdsCount: 1 }));
}

// ============================================================
// E8: Emergencia / motivo serio (10 cases)
// ============================================================

const E8_CASES = [
  { msgs: [['outbound', 'Mañana 16h'], ['inbound', 'mi madre está ingresada'], ['inbound', 'cancela porfa, lo siento']], intent: 'cancel_with_followup', delay: 3 },
  { msgs: [['outbound', 'Llamada'], ['inbound', 'me ha pasado algo grave'], ['inbound', 'hablamos cuando pueda']], intent: 'cancel_with_followup', delay: 3 },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'estoy en urgencias'], ['inbound', 'imposible asistir hoy']], intent: 'cancel_with_followup', delay: 1 },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'me han atropellado'], ['inbound', 'hablo cuando me recupere']], intent: 'cancel_with_followup', delay: 7 },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'mi padre falleció ayer'], ['inbound', 'no estoy bien, cancela todo']], intent: 'cancel_with_followup', delay: 7 },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'estoy ingresado, voy a estar unos días'], ['inbound', 'hablamos al salir']], intent: 'cancel_with_followup', delay: 7 },
  { msgs: [['outbound', 'Llamada hoy'], ['inbound', 'tengo un problema familiar gordo'], ['inbound', 'lo siento, cancela']], intent: 'cancel_with_followup', delay: 1 },
  { msgs: [['outbound', 'Mañana'], ['inbound', 'me ha dado un ataque de ansiedad'], ['inbound', 'mejor cancela hoy']], intent: 'cancel_with_followup', delay: 1 },
  { msgs: [['outbound', 'Te espero'], ['inbound', 'duelo familiar'], ['inbound', 'no estoy para nada ahora']], intent: 'cancel_with_followup', delay: 3 },
  { msgs: [['outbound', 'Recordatorio'], ['inbound', 'operación urgente mañana'], ['inbound', 'tengo que cancelar']], intent: 'cancel_with_followup', delay: 3 },
];

for (const c of E8_CASES) {
  cases.push(tc('E8', 'E8-EMERGENCIA', c.msgs, c.intent, { expectedDelay: c.delay, expectedIdsCount: 1 }));
}

// ============================================================
// E9: Conversación larga 10+ mensajes (10 cases)
// ============================================================

const E9_CASES = [
  {
    msgs: [
      ['outbound', 'Hola, gracias por interesarte!'],
      ['inbound', 'hola'],
      ['outbound', 'Qué te gustaría conseguir?'],
      ['inbound', 'perder unos kilos'],
      ['outbound', 'Cuántos quieres bajar?'],
      ['inbound', 'unos 10kg'],
      ['outbound', 'Para cuándo?'],
      ['inbound', 'antes de verano'],
      ['outbound', 'Te paso enlace de llamada'],
      ['inbound', 'genial'],
      ['outbound', 'Confirmado mañana 16h'],
      ['inbound', 'al final me ha surgido algo'],
      ['inbound', 'cancela porfa'],
    ],
    intent: 'cancel_with_followup',
  },
  {
    msgs: [
      ['outbound', 'Recordatorio llamada'],
      ['inbound', 'hola, tengo una duda'],
      ['outbound', 'Cuéntame'],
      ['inbound', 'cuánto suele costar?'],
      ['outbound', 'En la llamada te lo explico bien'],
      ['inbound', 'vale'],
      ['outbound', 'Te espero mañana'],
      ['inbound', 'vale ahí estaré'],
      ['inbound', 'ah espera'],
      ['inbound', 'creo que mañana tengo lío'],
      ['inbound', 'puedes pasarla al jueves?'],
    ],
    intent: 'cancel_with_followup',
  },
  {
    msgs: [
      ['outbound', 'Hola!'],
      ['inbound', 'qué tal'],
      ['outbound', 'Bien, te escribo por la llamada'],
      ['inbound', 'ah sí'],
      ['outbound', 'Mañana a las 16h'],
      ['inbound', 'ok'],
      ['inbound', 'oye'],
      ['inbound', 'al final no voy a poder'],
      ['inbound', 'cancela porfa'],
    ],
    intent: 'cancel_with_followup',
  },
  {
    msgs: [
      ['outbound', 'Buenas, te confirmamos llamada'],
      ['inbound', 'perfecto'],
      ['outbound', 'A las 18h'],
      ['inbound', 'genial'],
      ['outbound', 'Cualquier cosa avisa'],
      ['inbound', 'oye una pregunta'],
      ['outbound', 'Dime'],
      ['inbound', 'la llamada es por meet o por whatsapp?'],
      ['outbound', 'Por google meet'],
      ['inbound', 'ah vale perfecto'],
      ['inbound', 'allí estaré'],
    ],
    intent: 'no_action',
  },
  {
    msgs: [
      ['outbound', 'Hola, recordatorio'],
      ['inbound', 'hola'],
      ['inbound', 'oye una cosa'],
      ['outbound', 'Dime'],
      ['inbound', 'qué tal duración?'],
      ['outbound', 'Entre 35 y 50 mins'],
      ['inbound', 'uy, demasiado'],
      ['inbound', 'yo solo tengo 20 minutos máximo'],
      ['inbound', 'si necesitáis más, mejor no la hacemos'],
    ],
    intent: 'no_action',
  },
  {
    msgs: [
      ['outbound', 'Buenas'],
      ['inbound', 'hola'],
      ['outbound', 'Te paso enlace de llamada'],
      ['inbound', 'ok'],
      ['inbound', 'pero ya tengo entrenador'],
      ['inbound', 'no me hace falta otro'],
      ['inbound', 'gracias igualmente'],
    ],
    intent: 'cancel_no_followup',
  },
  {
    msgs: [
      ['outbound', 'Hola, mañana llamada 16h'],
      ['inbound', 'hola'],
      ['outbound', 'Confirmas?'],
      ['inbound', 'sí'],
      ['inbound', 'oye'],
      ['inbound', 'al final podemos a las 17?'],
      ['inbound', 'me cuadra mejor'],
    ],
    intent: 'no_action',
  },
  {
    msgs: [
      ['outbound', 'Recordatorio mañana'],
      ['inbound', 'hola, qué tal'],
      ['outbound', 'Bien, mañana te espero'],
      ['inbound', 'estoy malo'],
      ['outbound', 'Oh vaya'],
      ['inbound', 'creo que no voy a poder mañana'],
      ['inbound', 'mejor cuando recupere'],
    ],
    intent: 'cancel_with_followup',
  },
  {
    msgs: [
      ['outbound', 'Hola'],
      ['inbound', 'hola'],
      ['outbound', 'Confirmamos la llamada de mañana?'],
      ['inbound', 'sí'],
      ['inbound', 'gracias'],
      ['inbound', 'pero oye'],
      ['inbound', 'no estaré disponible las próximas 2 semanas'],
      ['inbound', 'hablamos cuando vuelva']
    ],
    intent: 'cancel_with_followup',
  },
  {
    msgs: [
      ['outbound', 'Buenas, llamada mañana'],
      ['inbound', 'hola'],
      ['inbound', 'una pregunta antes'],
      ['outbound', 'Dime'],
      ['inbound', 'cuál es la inversión aproximada?'],
      ['outbound', 'En la llamada lo vemos, tenemos varios rangos'],
      ['inbound', 'vale entiendo'],
      ['inbound', 'pero como máximo puedo aportar 50€'],
      ['inbound', 'si está fuera no hace falta llamada'],
    ],
    intent: 'no_action',
  },
];

const E9_EXPECTED_OPTS = [
  { expectedDelay: 1, expectedIdsCount: 1 },
  { expectedIdsCount: 1 },
  { expectedDelay: 1, expectedIdsCount: 1 },
  {},
  {},
  { expectedIdsCount: 1 },
  {},
  { expectedIdsCount: 1 },
  { expectedDelay: 7, expectedIdsCount: 1 },
  {},
];

for (let i = 0; i < E9_CASES.length; i++) {
  cases.push(tc('E9', 'E9-CONV-LARGA', E9_CASES[i].msgs, E9_CASES[i].intent, E9_EXPECTED_OPTS[i]));
}

// ============================================================
// E10: Cancel partial complejo (15 cases)
// ============================================================

const E10_CASES = [
  { apt: APT_TWO, msgs: [['outbound', 'Tienes citas: lunes 18 y miércoles 20'], ['inbound', 'cancela la del lunes'], ['inbound', 'la del miércoles está bien']], intent: 'cancel_partial', ids: 1 },
  { apt: APT_TWO, msgs: [['outbound', 'Citas: lunes 18 y miércoles 20'], ['inbound', 'la del miércoles no la puedo hacer'], ['inbound', 'la del lunes sí voy']], intent: 'cancel_partial', ids: 1 },
  { apt: APT_TWO, msgs: [['outbound', 'Citas: lunes y miércoles'], ['inbound', 'tengo que cancelar las dos'], ['inbound', 'lo siento']], intent: 'cancel_with_followup', ids: 2 },
  { apt: APT_THREE, msgs: [['outbound', 'Tienes 3 citas reservadas'], ['inbound', 'anula solo la del lunes'], ['inbound', 'las otras dos las mantengo']], intent: 'cancel_partial', ids: 1 },
  { apt: APT_THREE, msgs: [['outbound', 'Tienes 3 citas reservadas'], ['inbound', 'cancélame la del lunes y la del miércoles'], ['inbound', 'la del viernes la mantengo']], intent: 'cancel_partial', ids: 2 },
  { apt: APT_THREE, msgs: [['outbound', '3 citas activas'], ['inbound', 'cancela todas porfa'], ['inbound', 'no puedo asistir a ninguna']], intent: 'cancel_with_followup', ids: 3 },
  { apt: APT_TWO, msgs: [['outbound', 'Tienes 2 llamadas'], ['inbound', 'cancela la primera'], ['inbound', 'la segunda déjala']], intent: 'cancel_partial', ids: 1 },
  { apt: APT_TWO, msgs: [['outbound', 'Llamadas: lunes 18 y miércoles 20'], ['inbound', 'quita la más temprana'], ['inbound', 'la otra está bien']], intent: 'cancel_partial', ids: 1 },
  { apt: APT_TWO, msgs: [['outbound', 'Citas: lunes y miércoles'], ['inbound', 'cancela la del lunes'], ['inbound', 'la del miércoles también muévela al jueves']], intent: 'cancel_with_followup', ids: 2 },
  { apt: APT_TWO, msgs: [['outbound', 'Tienes 2 reservadas'], ['inbound', 'déjame solo la del miércoles'], ['inbound', 'la otra anúlala']], intent: 'cancel_partial', ids: 1 },
  { apt: APT_TWO, msgs: [['outbound', 'Citas: lunes 18 y miércoles 20'], ['inbound', 'tio quítame la del lunes'], ['inbound', 'la otra ok']], intent: 'cancel_partial', ids: 1 },
  { apt: APT_TWO, msgs: [['outbound', 'Llamadas: lunes y miércoles'], ['inbound', 'no llego a la del lunes'], ['inbound', 'la del miércoles confirmadísima']], intent: 'cancel_partial', ids: 1 },
  { apt: APT_THREE, msgs: [['outbound', '3 llamadas: lunes, miércoles, viernes'], ['inbound', 'cancela las dos primeras'], ['inbound', 'solo voy a la del viernes']], intent: 'cancel_partial', ids: 2 },
  { apt: APT_TWO, msgs: [['outbound', 'Citas: lunes y miércoles'], ['inbound', 'cancela las dos'], ['inbound', 'y créame otra para el viernes']], intent: 'cancel_with_followup', ids: 2 },
  { apt: APT_TWO, msgs: [['outbound', 'Tienes 2 citas'], ['inbound', 'la del lunes mejor no la hacemos'], ['inbound', 'la del miércoles sí']], intent: 'cancel_partial', ids: 1 },
];

for (const c of E10_CASES) {
  cases.push(tc('E10', 'E10-PARTIAL-COMPLEJO', c.msgs, c.intent, {
    appointments: c.apt,
    expectedIdsCount: c.ids,
  }));
}

module.exports = cases;
