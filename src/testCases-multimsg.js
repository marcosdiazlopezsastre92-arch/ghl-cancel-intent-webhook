'use strict';

// Multi-message stress test suite focused on the PRINCIPIO DE LECTURA fix
// and the soft vs firm cancellation language distinction.
//
// ~400 cases across 10 categories:
//   M1 (80) — Firm cancellations split across messages (must cancel)
//   M2 (80) — Objections/conditionals with soft off-ramp (must NOT cancel)
//   M3 (40) — Retrasos split across messages (must NOT cancel)
//   M4 (40) — Reagendados (must cancel_with_followup)
//   M5 (30) — Ajustes menores hora mismo día (must NOT cancel)
//   M6 (30) — Problemas técnicos (must NOT cancel)
//   M7 (30) — Confirmaciones / charla normal (must NOT cancel)
//   M8 (30) — Cancels en un solo mensaje (regresión single-msg)
//   M9 (20) — Rechazo total programa (cancel_no_followup)
//   M10 (20) — Delay distribution (validar bias 95/4/1)

const APT_ONE = [{
  id: 'TEST_APT_1',
  startTime: '2026-05-18T16:00:00+02:00',
  calendarId: 'CAL_A',
}];

const APT_TWO = [
  { id: 'TEST_APT_1', startTime: '2026-05-18T16:00:00+02:00', calendarId: 'CAL_A' },
  { id: 'TEST_APT_2', startTime: '2026-05-20T16:00:00+02:00', calendarId: 'CAL_B' },
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
// M1: Firm cancellations split across messages (80 cases)
// Expected: cancel_with_followup, delay 1
// ============================================================

const FIRM_PREFACES = [
  'me ha surgido algo',
  'tengo un imprevisto',
  'se me ha liado todo',
  'me ha salido un compromiso',
  'tengo una reunión imprevista',
  'me ha llamado mi jefe',
  'estoy desbordado hoy',
  'perdona',
  'lo siento',
  'oye disculpa',
  'qué rabia',
  'al final',
];

const FIRM_CANCELS = [
  'cancela porfa',
  'anula la cita',
  'no voy a poder',
  'no puedo ir',
  'tengo que cancelar',
  'no asistiré',
  'imposible asistir',
  'cancélala',
];

for (let i = 0; i < 80; i++) {
  const p = FIRM_PREFACES[i % FIRM_PREFACES.length];
  const c = FIRM_CANCELS[Math.floor(i / FIRM_PREFACES.length) % FIRM_CANCELS.length];
  cases.push(tc('M1', 'M1-FIRM-MULTI', [
    ['outbound', 'Confirmado mañana 16h, te espero'],
    ['inbound', p],
    ['inbound', c],
  ], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
}

// ============================================================
// M2: Objections/conditionals with soft off-ramp (80 cases)
// Expected: no_action (lead is negotiating, coach should handle live)
// ============================================================

const M2_BUDGET = [
  { x: 'como máximo puedo aportar 50€/mes', y: 'si está fuera, no hace falta llamada' },
  { x: 'tengo presupuesto justo, máximo 80€', y: 'si no encaja, no perdamos tiempo' },
  { x: 'el max que puedo invertir son 100€', y: 'si no es posible mejor no la hacemos' },
  { x: 'mi tope son 60€', y: 'si no podéis adaptaros déjalo' },
  { x: 'no puedo pagar más de 70€', y: 'si está fuera mejor no' },
  { x: 'tengo un presupuesto muy ajustado', y: 'si no encaja prefiero no hacerla' },
  { x: 'solo puedo llegar a 50€', y: 'si no es viable, no hace falta seguir' },
  { x: 'mi presupuesto máximo es 90€', y: 'si no entra en eso lo dejamos' },
];

for (let i = 0; i < 20; i++) {
  const v = M2_BUDGET[i % M2_BUDGET.length];
  cases.push(tc('M2', 'M2-OBJ-BUDGET-MULTI', [
    ['outbound', 'Te paso enlace para llamada esta semana'],
    ['inbound', v.x],
    ['inbound', v.y],
  ], 'no_action'));
}

const M2_TIME = [
  { x: 'solo tengo 20 minutos como máximo', y: 'si necesitáis más mejor no la hacemos' },
  { x: 'mi horario es muy justo', y: 'si la llamada dura más de media hora prefiero no' },
  { x: 'estoy hasta arriba esta semana', y: 'si no podéis adaptaros mejor no' },
  { x: 'tengo poquísimo tiempo', y: 'si no es algo rápido no perdamos el tiempo' },
  { x: 'solo puedo 25 min', y: 'si necesitáis más no la hacemos' },
];

for (let i = 0; i < 15; i++) {
  const v = M2_TIME[i % M2_TIME.length];
  cases.push(tc('M2', 'M2-OBJ-TIME-MULTI', [
    ['outbound', 'Confirmamos llamada para hoy'],
    ['inbound', v.x],
    ['inbound', v.y],
  ], 'no_action'));
}

const M2_FORMAT = [
  { x: 'si la llamada es solo para venderme algo', y: 'prefiero no hacerla' },
  { x: 'no me gustan las llamadas comerciales', y: 'si es solo para vender, mejor no' },
  { x: 'si es una sesión de venta agresiva', y: 'paso, mejor lo dejamos' },
  { x: 'si vais a presionarme a comprar', y: 'no la hacemos' },
  { x: 'si solo es para meter caña con ventas', y: 'no perdamos tiempo' },
  { x: 'no soporto las llamadas tipo curso', y: 'si es eso mejor no' },
];

for (let i = 0; i < 15; i++) {
  const v = M2_FORMAT[i % M2_FORMAT.length];
  cases.push(tc('M2', 'M2-OBJ-FORMAT-MULTI', [
    ['outbound', 'Mañana 16h, te espero'],
    ['inbound', v.x],
    ['inbound', v.y],
  ], 'no_action'));
}

const M2_PERSONAL = [
  { x: 'mi pareja no me apoya con esto', y: 'si no es flexible mejor lo dejamos' },
  { x: 'tengo niños pequeños y es complicado', y: 'si no podéis adaptaros no la hacemos' },
  { x: 'trabajo a turnos rotativos', y: 'si no podéis ajustar horarios no perdamos tiempo' },
  { x: 'mi situación familiar es muy liada', y: 'si necesitáis dedicación completa mejor no' },
  { x: 'estoy en un momento complicado', y: 'si no encaja prefiero no' },
];

for (let i = 0; i < 15; i++) {
  const v = M2_PERSONAL[i % M2_PERSONAL.length];
  cases.push(tc('M2', 'M2-OBJ-PERSONAL-MULTI', [
    ['outbound', 'Llamada mañana 18h'],
    ['inbound', v.x],
    ['inbound', v.y],
  ], 'no_action'));
}

const M2_EXPECT = [
  { x: 'no sé si esto encaja realmente conmigo', y: 'si no me convence mejor lo dejamos' },
  { x: 'tengo mis dudas sobre el método', y: 'si no me cuadra prefiero no hacerla' },
  { x: 'no me termina de convencer', y: 'si no es lo que busco no hace falta llamada' },
  { x: 'tengo ya un entrenador', y: 'si no aportáis más mejor no' },
  { x: 'no estoy seguro de necesitar esto', y: 'si no encaja mejor lo dejamos' },
];

for (let i = 0; i < 15; i++) {
  const v = M2_EXPECT[i % M2_EXPECT.length];
  cases.push(tc('M2', 'M2-OBJ-EXPECT-MULTI', [
    ['outbound', 'Llamada confirmada'],
    ['inbound', v.x],
    ['inbound', v.y],
  ], 'no_action'));
}

// ============================================================
// M3: Retrasos split across messages (40 cases)
// Expected: no_action
// ============================================================

const M3_RETRASOS = [
  ['oye', 'voy a llegar 10 min tarde por el tráfico'],
  ['perdona', 'me retraso un cuarto de hora máximo'],
  ['hola', 'no voy a poder llegar a tiempo, llegaré tarde'],
  ['ufff', 'me retraso 20 min'],
  ['oye disculpa', 'llego un poco tarde, 15 min'],
  ['lo siento', 'voy con retraso, 10-15 min'],
  ['hola', 'voy mal de tiempo, 10 tarde'],
  ['perdona', 'puedo conectarme 5 min tarde?'],
  ['ufff', 'tráfico horrible, llego tarde'],
  ['hola', 'estaré 10 minutos tarde a la call'],
];

for (let i = 0; i < 40; i++) {
  const msgs = M3_RETRASOS[i % M3_RETRASOS.length];
  cases.push(tc('M3', 'M3-RETRASO-MULTI', [
    ['outbound', 'Te espero a las 18'],
    ['inbound', msgs[0]],
    ['inbound', msgs[1]],
  ], 'no_action'));
}

// ============================================================
// M4: Reagendados split across messages (40 cases)
// Expected: cancel_with_followup (no post-link marker)
// ============================================================

const M4_REAGENDAS = [
  ['no puedo mañana', 'podemos pasarlo al jueves?'],
  ['hola', 'me viene mejor la semana que viene'],
  ['oye', 'puedo pasar la cita a otro día?'],
  ['perdona', 'tendría que reagendar'],
  ['hola', 'voy a mover la cita'],
  ['no me cuadra mañana', 'puedes el viernes?'],
  ['ufff', 'tengo lío esa hora', 'movemos a otro día?'],
  ['hola', 'mejor el lunes que viene'],
  ['perdona', 'me viene mejor en 4 o 5 días'],
  ['no llego mañana', 'reagendo a la semana que viene'],
];

for (let i = 0; i < 40; i++) {
  const msgs = M4_REAGENDAS[i % M4_REAGENDAS.length];
  const msgArr = [['outbound', 'Mañana 16h, confirmamos']];
  for (const m of msgs) msgArr.push(['inbound', m]);
  cases.push(tc('M4', 'M4-REAGENDA-MULTI', msgArr, 'cancel_with_followup', { expectedIdsCount: 1 }));
}

// ============================================================
// M5: Ajustes menores hora mismo día (30 cases)
// Expected: no_action
// ============================================================

const M5_AJUSTES = [
  ['hola', 'podemos hacerla a las 18 hoy en vez de 16?'],
  ['oye', 'mejor a las 17 si te va bien'],
  ['perdona', 'puedo media hora antes?'],
  ['hola', 'podemos atrasar 30 min?'],
  ['oye', 'mejor a las 19 hoy'],
  ['hola', 'puedo a las 20 mejor?'],
  ['perdona', 'acomódame a las 17:30 hoy si puedes'],
  ['hola', 'puedo conectarme 15 min antes?'],
  ['oye', 'mejor a la noche en lugar de la tarde'],
  ['hola', 'media hora más tarde si te va bien?'],
];

for (let i = 0; i < 30; i++) {
  const msgs = M5_AJUSTES[i % M5_AJUSTES.length];
  cases.push(tc('M5', 'M5-AJUSTE-HORA-MULTI', [
    ['outbound', 'Llamada hoy 16h'],
    ['inbound', msgs[0]],
    ['inbound', msgs[1]],
  ], 'no_action'));
}

// ============================================================
// M6: Problemas técnicos (30 cases)
// Expected: no_action
// ============================================================

const M6_TECNICOS = [
  ['hola', 'no me funciona Zoom'],
  ['perdona', 'no me carga la cámara del ordenador'],
  ['oye', 'no me sale el link de la call'],
  ['hola', 'llevo 10 min intentando entrar al meet, no me deja'],
  ['perdona', 'Zoom me pide actualizar, dame un minuto'],
  ['oye', 'no puedo entrar', 'dame otro link porfa'],
  ['hola', 'el enlace no me funciona'],
  ['perdona', 'se me ha colgado el ordenador'],
  ['oye', 'no me entra al meet, ayuda'],
  ['hola', 'tengo problema con el micrófono'],
];

for (let i = 0; i < 30; i++) {
  const msgs = M6_TECNICOS[i % M6_TECNICOS.length];
  const msgArr = [['outbound', 'Te espero en el meet']];
  for (const m of msgs) msgArr.push(['inbound', m]);
  cases.push(tc('M6', 'M6-TECNICO-MULTI', msgArr, 'no_action'));
}

// ============================================================
// M7: Confirmaciones / charla normal (30 cases)
// Expected: no_action
// ============================================================

const M7_CONFIRMS = [
  ['perfecto', 'ahí estaré'],
  ['vale', 'genial'],
  ['ok', 'me apunto la hora'],
  ['perfecto', 'gracias!'],
  ['vale', 'nos vemos mañana'],
  ['genial', 'te espero conectado'],
  ['gracias', 'confirmado'],
  ['perfecto', 'tengo la hora apuntada'],
  ['ok', 'nos vemos'],
  ['fenomenal', 'allí estaré sin falta'],
];

for (let i = 0; i < 30; i++) {
  const msgs = M7_CONFIRMS[i % M7_CONFIRMS.length];
  cases.push(tc('M7', 'M7-CONFIRM-MULTI', [
    ['outbound', 'Confirmado mañana 16h'],
    ['inbound', msgs[0]],
    ['inbound', msgs[1]],
  ], 'no_action'));
}

// ============================================================
// M8: Cancels en UN SOLO mensaje (regresión single-msg) (30 cases)
// Expected: cancel_with_followup, delay 1
// ============================================================

const M8_SINGLE_CANCELS = [
  'cancela porfa',
  'anula la cita gracias',
  'no voy a poder ir hoy',
  'no puedo asistir, cancela',
  'tengo que cancelar',
  'no asistiré',
  'imposible ir, anula',
  'cancélala porfa',
  'no podré ir mañana, cancela',
  'no llego hoy',
  'lo siento no voy a poder',
  'me ha surgido algo, cancela',
  'tengo un imprevisto, anula',
  'no me viene bien, cancela',
  'mejor cancelamos',
];

for (let i = 0; i < 30; i++) {
  const msg = M8_SINGLE_CANCELS[i % M8_SINGLE_CANCELS.length];
  cases.push(tc('M8', 'M8-FIRM-SINGLE', [
    ['outbound', 'Confirmado para mañana'],
    ['inbound', msg],
  ], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
}

// ============================================================
// M9: Rechazo total programa (20 cases)
// Expected: cancel_no_followup
// ============================================================

const M9_REJECTS = [
  'ya no me interesa, gracias',
  'paso del tema, gracias',
  'voy con otro entrenador',
  'borra mis datos por favor',
  'no me contactes más',
  'quítame de tu lista',
  'no me vale la pena, gracias',
  'déjame en paz porfa',
  'no me molestes más',
  'perdí el interés totalmente',
  'cancelo todo contigo gracias',
  'no me interesa el programa',
  'voy a tirar con otra persona',
  'paso completamente',
  'gracias pero no, no me interesa',
];

for (let i = 0; i < 20; i++) {
  const msg = M9_REJECTS[i % M9_REJECTS.length];
  cases.push(tc('M9', 'M9-REJECT-TOTAL', [
    ['outbound', 'Hola, te recuerdo la llamada de mañana'],
    ['inbound', msg],
  ], 'cancel_no_followup', { expectedIdsCount: 1 }));
}

// ============================================================
// M10: Delay distribution (20 cases) — validar bias 95/4/1
// ============================================================

const M10_DELAY_1 = [
  { msgs: ['no puedo hoy, cancela'], expected: 1 },
  { msgs: ['me ha surgido algo, anula'], expected: 1 },
  { msgs: ['resaca brutal, no llego hoy'], expected: 1 },
  { msgs: ['estoy malo, no voy a poder'], expected: 1 },
  { msgs: ['sigo de viaje', 'no llego'], expected: 1 },
  { msgs: ['estoy fuera, cancélala'], expected: 1 },
  { msgs: ['no llego, lío con el curro'], expected: 1 },
  { msgs: ['lío de reuniones, cancela'], expected: 1 },
  { msgs: ['no puedo esta semana, anula'], expected: 1 },
  { msgs: ['no me viene bien, cancélala'], expected: 1 },
  { msgs: ['mañana mejor que hoy', 'cancela hoy'], expected: 1 },
  { msgs: ['olvidé que tengo otra cosa, cancela'], expected: 1 },
];

const M10_DELAY_3 = [
  { msgs: ['llevo 2 días con gripe', 'dame un par más por favor'], expected: 3 },
  { msgs: ['este finde estoy fuera', 'mejor el lunes'], expected: 3 },
  { msgs: ['estoy en un congreso hasta el viernes', 'mejor después'], expected: 3 },
  { msgs: ['vuelvo en 3-4 días', 'mejor entonces'], expected: 3 },
  { msgs: ['tengo gripe llevo días, dame 3-4 más'], expected: 3 },
];

const M10_DELAY_7 = [
  { msgs: ['estoy de vacaciones 10 días, hablamos cuando vuelva'], expected: 7 },
  { msgs: ['esta semana imposible', 'hablemos la siguiente'], expected: 7 },
  { msgs: ['voy a estar 2 semanas fuera', 'cancela'], expected: 7 },
];

for (const v of [...M10_DELAY_1, ...M10_DELAY_3, ...M10_DELAY_7]) {
  const msgArr = [['outbound', 'Llamada mañana 16h, te espero']];
  for (const m of v.msgs) msgArr.push(['inbound', m]);
  cases.push(tc('M10', `M10-DELAY-${v.expected}D`, msgArr, 'cancel_with_followup', {
    expectedDelay: v.expected,
    expectedIdsCount: 1,
  }));
}

module.exports = cases;
