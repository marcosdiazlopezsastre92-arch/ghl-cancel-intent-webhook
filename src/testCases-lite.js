'use strict';

// =============================================================================
// TEST CASES LITE — 150 cases
//
// Reduced balanced subset of testCases-v2, designed to run within Anthropic
// tier 1 rate limits (~50 RPM = ~1.2s/request needed). Total runtime with
// built-in delay: ~5-6 minutes.
//
// Use this for quick regression checks. For full coverage use /test/run-v2.
//
// Categories:
//   L1  (30) — Lead incierto + ofrece confirmar más tarde [incl. CASOREAL]
//   L2  (15) — Firm direct cancellations
//   L3  (15) — Firm reschedule asks
//   L4  (10) — Conditional objections + soft off-ramp
//   L5  (10) — Same-day hour adjustments
//   L6  (10) — Retrasos with explicit qualifiers
//   L7  (10) — Asistencia confirmations
//   L8  (10) — Technical problems with explicit tech terms
//   L9  (10) — Total program rejection → cancel_no_followup
//   L10 (10) — Cancel partial (multi-cita scenarios)
//   L11 (10) — Slang/typos heavy
//   L12 (5)  — Borderline ambiguous → no_action default
//   L13 (5)  — Competitor mention (soft vs firme)
//   TOTAL: 150
// =============================================================================

const APT_ID = 'TEST_APT_1';
const APT_ID_2 = 'TEST_APT_2';
const APT_ID_3 = 'TEST_APT_3';
const CAL = 'CAL_A';

const APT_FUTURE_1 = '2026-05-20T16:00:00+02:00';
const APT_FUTURE_2 = '2026-05-21T17:00:00+02:00';
const APT_FUTURE_3 = '2026-05-22T18:00:00+02:00';

const TS_COACH = '2026-05-18T20:00:00Z';
const TS_LEAD_BASE = '2026-05-19T17:46:00Z';

const apts1 = [{ id: APT_ID, startTime: APT_FUTURE_1, calendarId: CAL }];
const apts3 = [
  { id: APT_ID, startTime: APT_FUTURE_1, calendarId: CAL },
  { id: APT_ID_2, startTime: APT_FUTURE_2, calendarId: CAL },
  { id: APT_ID_3, startTime: APT_FUTURE_3, calendarId: CAL },
];

function mkCase(name, category, leadMessages, expectedIntent, opts = {}) {
  const coachMsg = opts.coachMsg || 'Hola! Te recuerdo que tenemos llamada mañana a las 16';
  const messages = [{ direction: 'outbound', body: coachMsg, dateAdded: TS_COACH }];
  const base = new Date(TS_LEAD_BASE).getTime();
  for (let i = 0; i < leadMessages.length; i++) {
    messages.push({
      direction: 'inbound',
      body: leadMessages[i],
      dateAdded: new Date(base + i * 1000).toISOString(),
    });
  }
  const out = {
    name,
    category,
    messages,
    appointments: opts.appointments || apts1,
    expectedIntent,
  };
  if (opts.expectedDelay !== undefined) out.expectedDelay = opts.expectedDelay;
  if (opts.expectedIdsCount !== undefined) out.expectedIdsCount = opts.expectedIdsCount;
  return out;
}

const cases = [];

// =============================================================================
// L1 — Lead incierto + ofrece confirmar más tarde (30 cases)
// =============================================================================

// Real production case (verbatim)
cases.push({
  name: 'L1-CASOREAL-PEPE',
  category: 'L1',
  messages: [
    { direction: 'outbound', body: 'Hola! Te recuerdo que tenemos llamada mañana a las 16', dateAdded: TS_COACH },
    { direction: 'inbound', body: 'Buenas tardes! Pues, te quería comentar espero estar mañana pero puede que no pueda por problemas familiares. Tengo al padre de mi pareja ingresado en el hospital y puede que nos tengamos que ir a ayudarles ya que no vivimos en la misma comunidad. Seguramente hasta el jueves no vayamos pero no estoy seguro', dateAdded: '2026-05-19T17:46:00Z' },
    { direction: 'inbound', body: 'Te importa si te confirmo mañana a la mañana o cambiamos la cita?', dateAdded: '2026-05-19T17:46:30Z' },
    { direction: 'inbound', body: 'Lo de las recetas me es igual que sean elaboradas o sencillas.', dateAdded: '2026-05-19T17:47:00Z' },
    { direction: 'inbound', body: '👌🏼😁', dateAdded: '2026-05-19T17:47:30Z' },
  ],
  appointments: apts1,
  expectedIntent: 'no_action',
});

const L1_VARIANTS = [
  ['Mi madre está mal de salud, igual no puedo mañana. Te confirmo por la mañana'],
  ['Tengo un familiar en el hospital, no sé seguro si podré. Te aviso mañana'],
  ['Familiar hospitalizado, te confirmo a primera hora cómo está la cosa'],
  ['Tengo lío con el trabajo, no sé si podré. Te confirmo en un rato'],
  ['Me ha salido reunión sorpresa, intento llegar pero te aviso'],
  ['Reunión inesperada que igual se alarga, te aviso si llego'],
  ['Probablemente sí pero te confirmo en un rato'],
  ['A ver si llego, sino te aviso'],
  ['Espero estar, te confirmo mañana'],
  ['No estoy seguro si podré, te confirmo a primera hora'],
  ['Igual no llego, te aviso por la mañana'],
  ['Te confirmo mañana, no estoy seguro'],
  ['Espero estar pero puede que no, te confirmo mañana o cambiamos'],
  ['A ver cómo va el día, te aviso si voy sino reagendamos'],
  ['Te aviso si finalmente puedo, sino reagendamos'],
  ['Si me da tiempo voy, sino te aviso y reagendamos'],
  ['Te confirmo mañana si llego o si necesitamos cambiar el día'],
  ['Mi pareja está mal y no sé si tendré que cuidarla. Te aviso mañana'],
  ['Tengo unas pruebas médicas, igual no me dejan ir. Te confirmo'],
  ['Estoy con dolor de cabeza, a ver cómo me encuentro. Te confirmo más tarde'],
  // Multi-msg
  ['Buenas! Te quería comentar algo', 'Igual no puedo mañana por un tema familiar', 'Te confirmo a primera hora o cambiamos cita?'],
  ['Hola Marcos', 'Estoy con la cabeza loca con un tema personal', 'No sé si podré, te aviso mañana cómo va'],
  ['Buenas tardes', 'Me ha surgido un imprevisto familiar', 'Espero estar pero te confirmo o cambiamos'],
  ['Hola, te aviso', 'No sé si podré por temas de trabajo', 'A ver si llego, te confirmo a la tarde'],
  ['Hola Marcos perdona', 'No estoy seguro si podré por temas familiares', 'Te confirmo en cuanto sepa'],
  // More uncertain variants
  ['Estamos con un tema familiar serio, te aviso mañana si podré ir'],
  ['Tengo a mi hijo enfermo, no estoy seguro si podré dejarlo. Te aviso a la tarde'],
  ['Espero ir pero está siendo un día complicado, te aviso luego'],
  ['Vamos viendo, te confirmo si voy o si tenemos que cambiarlo'],
];

for (let i = 0; i < L1_VARIANTS.length; i++) {
  cases.push(mkCase(
    `L1-${String(i + 1).padStart(3, '0')}`,
    'L1',
    L1_VARIANTS[i],
    'no_action'
  ));
}

// =============================================================================
// L2 — Firm direct cancellations (15 cases)
// =============================================================================
const L2_VARIANTS = [
  ['Cancela porfa, mañana no puedo'],
  ['No puedo asistir mañana, tengo que cancelar'],
  ['Anula la cita por favor'],
  ['No voy a poder ir mañana'],
  ['Imposible ir mañana'],
  ['No llego mañana, lo siento'],
  ['Cancela la llamada'],
  ['Mañana imposible, cancelo'],
  ['Estoy malo, cancela la llamada de mañana'],
  ['Anula, no llego'],
  ['Hola Marcos', 'No puedo mañana, cancela porfa'],
  ['Perdona Marcos', 'No voy a poder ir, anula la llamada'],
  ['Buenas', 'Me surgió un compromiso', 'Tengo que cancelar la llamada'],
  ['Estoy enfermo, cancela la llamada'],
  ['Tengo que viajar de urgencia, cancela'],
];
for (let i = 0; i < L2_VARIANTS.length; i++) {
  cases.push(mkCase(`L2-${String(i + 1).padStart(3, '0')}`, 'L2', L2_VARIANTS[i], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
}

// =============================================================================
// L3 — Firm reschedule asks (15 cases)
// =============================================================================
const L3_VARIANTS = [
  ['Mañana no me va bien, podemos cambiar el día?'],
  ['Buenas noches, perdona mañana no me va bien la llamada', 'Podemos cambiar el día?'],
  ['No puedo mañana, cambiamos?'],
  ['Mañana imposible, qué huecos tenéis otro día?'],
  ['Tengo que cambiar el día sí o sí'],
  ['No me viene bien mañana, podemos pasarlo a otro día?'],
  ['Mañana no puedo, qué disponibilidad tenéis el jueves?'],
  ['Necesito cambiar el día de la llamada'],
  ['Podemos pasarla a la semana que viene?'],
  ['Tengo que mover la llamada, no puedo mañana'],
  ['Perdona Marcos', 'Mañana no puedo', 'Podemos cambiarla al jueves?'],
  ['Hola', 'No me viene bien mañana', 'Cambiamos la llamada al viernes?'],
  ['Me ha salido un viaje mañana, podemos cambiar el día?'],
  ['Tengo boda mañana, cambiamos la llamada'],
  ['Tengo cita médica mañana, cambiamos día por favor'],
];
for (let i = 0; i < L3_VARIANTS.length; i++) {
  cases.push(mkCase(`L3-${String(i + 1).padStart(3, '0')}`, 'L3', L3_VARIANTS[i], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
}

// =============================================================================
// L4 — Conditional objections + soft off-ramp (10 cases)
// =============================================================================
const L4_VARIANTS = [
  ['Como máximo puedo 65€', 'Si no es posible dímelo', 'Y no hace falta la llamada'],
  ['Si es muy caro mejor no hacemos la call'],
  ['Solo tengo media hora', 'Si necesitáis más mejor no la hacemos'],
  ['Si es solo para venderme algo', 'Prefiero no hacerla'],
  ['Mi pareja no me apoya', 'Si no es flexible mejor lo dejamos'],
  ['Si no me convence en la primera media hora mejor lo dejamos'],
  ['Si está fuera de mi presupuesto no la hacemos'],
  ['Marcos perdona', 'Tengo dudas sobre el precio', 'Si es muy caro mejor no la hacemos'],
  ['Hola', 'Estoy ajustado de presupuesto', 'Si no me cuadra mejor lo dejamos'],
  ['Si no podéis con mis horarios mejor lo dejamos'],
];
for (let i = 0; i < L4_VARIANTS.length; i++) {
  cases.push(mkCase(`L4-${String(i + 1).padStart(3, '0')}`, 'L4', L4_VARIANTS[i], 'no_action'));
}

// =============================================================================
// L5 — Same-day hour adjustments (10 cases)
// =============================================================================
const L5_VARIANTS = [
  ['Podemos cambiar mañana a las 18 en vez de 16?'],
  ['30 min más tarde si te va bien?'],
  ['Puedo a las 20 mejor mañana?'],
  ['Podemos atrasar 15min?'],
  ['Mañana a las 18 mejor que a las 16'],
  ['Misma fecha pero a las 18 mejor'],
  ['Puedes media hora más tarde?'],
  ['Hola', 'Mañana sí pero podemos cambiar hora?', 'Mejor a las 19'],
  ['Tengo reunión hasta las 17, podemos a las 18 mañana?'],
  ['Trabajo me apretó, podemos atrasar a las 19 mismo día?'],
];
for (let i = 0; i < L5_VARIANTS.length; i++) {
  cases.push(mkCase(`L5-${String(i + 1).padStart(3, '0')}`, 'L5', L5_VARIANTS[i], 'no_action'));
}

// =============================================================================
// L6 — Retrasos with explicit qualifiers (10 cases)
// =============================================================================
const L6_VARIANTS = [
  ['Llego tarde mañana, 10 min'],
  ['No podré llegar a tiempo, me retraso 15 min'],
  ['Voy con 20 minutos de retraso mañana'],
  ['Llegaré tarde, unos 15 min'],
  ['Voy a llegar tarde por el tráfico, 15min'],
  ['Puedo entrar 5 min tarde?'],
  ['No llego al inicio, entro a la mitad'],
  ['Hola', 'Llego tarde mañana', 'Unos 10 min nada más'],
  ['Estoy de camino, llego 5 min tarde'],
  ['Mañana voy pero llego un poco tarde, 10 min'],
];
for (let i = 0; i < L6_VARIANTS.length; i++) {
  cases.push(mkCase(`L6-${String(i + 1).padStart(3, '0')}`, 'L6', L6_VARIANTS[i], 'no_action'));
}

// =============================================================================
// L7 — Asistencia confirmations (10 cases)
// =============================================================================
const L7_VARIANTS = [
  ['Sí, mañana ahí estaré'],
  ['Perfecto, allí estoy'],
  ['Confirmado, hablamos mañana'],
  ['Vale, ahí te leo'],
  ['Sí voy, gracias por avisar'],
  ['Sigue en pie mañana?'],
  ['Genial, ahí estaré sin falta'],
  ['Recibido, ahí estoy mañana'],
  ['Sí sí, hablamos mañana'],
  ['Sí mañana sin falta'],
];
for (let i = 0; i < L7_VARIANTS.length; i++) {
  cases.push(mkCase(`L7-${String(i + 1).padStart(3, '0')}`, 'L7', L7_VARIANTS[i], 'no_action'));
}

// =============================================================================
// L8 — Technical problems (10 cases)
// =============================================================================
const L8_VARIANTS = [
  ['No me funciona Zoom'],
  ['No puedo entrar al meet, dame otro link?'],
  ['No me carga la cámara'],
  ['No me entra al meet, ayuda'],
  ['Se me ha colgado el ordenador'],
  ['No me sale el link de la call'],
  ['Zoom me pide actualizar, dame un min'],
  ['No me funciona el micrófono'],
  ['Hola', 'No puedo entrar al meet', 'Me da error el enlace'],
  ['Mi cámara no enciende, dame un min'],
];
for (let i = 0; i < L8_VARIANTS.length; i++) {
  cases.push(mkCase(`L8-${String(i + 1).padStart(3, '0')}`, 'L8', L8_VARIANTS[i], 'no_action'));
}

// =============================================================================
// L9 — Total program rejection (10 cases)
// =============================================================================
const L9_VARIANTS = [
  ['Ya no me interesa, gracias'],
  ['Voy a tirar con otro entrenador, gracias'],
  ['Ya tengo entrenador, no necesito otro'],
  ['Estoy entrenando con alguien, no necesito más'],
  ['Borra mis datos por favor'],
  ['Déjame en paz'],
  ['Paso completamente del tema'],
  ['Cancelo todo contigo, gracias'],
  ['Perdí el interés, mejor lo dejamos'],
  ['No me contactes más'],
];
for (let i = 0; i < L9_VARIANTS.length; i++) {
  cases.push(mkCase(`L9-${String(i + 1).padStart(3, '0')}`, 'L9', L9_VARIANTS[i], 'cancel_no_followup', { expectedIdsCount: 1 }));
}

// =============================================================================
// L10 — Cancel partial (10 cases)
// =============================================================================
const L10_VARIANTS = [
  ['Cancela solo la de mañana, la del jueves mantenla'],
  ['La de mañana no puedo, pero la siguiente sí'],
  ['Anula la primera, las otras déjalas'],
  ['Solo cancela mañana, las próximas están bien'],
  ['No puedo mañana pero el viernes sí, anula solo esa'],
  ['Mañana no puedo, pero el resto déjalas como están'],
  ['La de mañana cancélala, las próximas no las toques'],
  ['Hola', 'Solo cancela la de mañana', 'Las otras las mantengo'],
  ['Perdona', 'Anula la primera', 'Las próximas siguen en pie'],
  ['Cancela la cita del miércoles solo'],
];
for (let i = 0; i < L10_VARIANTS.length; i++) {
  cases.push(mkCase(`L10-${String(i + 1).padStart(3, '0')}`, 'L10', L10_VARIANTS[i], 'cancel_partial', { appointments: apts3, expectedIdsCount: 1 }));
}

// =============================================================================
// L11 — Slang/typos heavy (10 cases)
// =============================================================================
cases.push(mkCase('L11-001', 'L11', ['no pudo asistir manyana, cnacela porfi'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('L11-002', 'L11', ['nshe si podre manyana, tcnfrmo a la mañana'], 'no_action'));
cases.push(mkCase('L11-003', 'L11', ['kpasa, mañna no llego'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('L11-004', 'L11', ['no me sale la kmara'], 'no_action'));
cases.push(mkCase('L11-005', 'L11', ['si voy si voy'], 'no_action'));
cases.push(mkCase('L11-006', 'L11', ['mñn imposble, kncelo'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('L11-007', 'L11', ['ya ngo entrenadr grsias paso'], 'cancel_no_followup', { expectedIdsCount: 1 }));
cases.push(mkCase('L11-008', 'L11', ['llego 10 mns tard'], 'no_action'));
cases.push(mkCase('L11-009', 'L11', ['mañna no me cuadra cmbio'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('L11-010', 'L11', ['t aviso mañna no toy seguro'], 'no_action'));

// =============================================================================
// L12 — Borderline ambiguous (5 cases)
// =============================================================================
const L12_VARIANTS = [
  ['Vale'],
  ['Ok'],
  ['Mmmm'],
  ['Déjame pensarlo'],
  ['A ver qué pasa mañana'],
];
for (let i = 0; i < L12_VARIANTS.length; i++) {
  cases.push(mkCase(`L12-${String(i + 1).padStart(3, '0')}`, 'L12', L12_VARIANTS[i], 'no_action'));
}

// =============================================================================
// L13 — Competitor mention (5 cases)
// =============================================================================
cases.push(mkCase('L13-001', 'L13', ['Tengo ya un entrenador', 'Si no aportáis más mejor no la hacemos'], 'no_action'));
cases.push(mkCase('L13-002', 'L13', ['Trabajo con otro coach', 'Si no encaja con vuestro método mejor lo dejamos'], 'no_action'));
cases.push(mkCase('L13-003', 'L13', ['Ya tengo entrenador, no necesito otro, gracias'], 'cancel_no_followup', { expectedIdsCount: 1 }));
cases.push(mkCase('L13-004', 'L13', ['Estoy entrenando con alguien, no me hace falta más'], 'cancel_no_followup', { expectedIdsCount: 1 }));
cases.push(mkCase('L13-005', 'L13', ['Tengo coach, gracias, paso'], 'cancel_no_followup', { expectedIdsCount: 1 }));

module.exports = cases;
