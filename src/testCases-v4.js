'use strict';

// =============================================================================
// TEST CASES V4 — 200 casos TORCIDOS para estresar el clasificador
//
// Diseñados sobre commit 88d2664 (post fixes V10-006 + V4-012). Casos donde
// la decisión requiere LEER bien la conversación y no caer en superficie.
//
// Categories (padded a 2 dígitos para no chocar con prefix-match):
//   T01 (20) — Contradicciones / flip-flops en cadena
//   T02 (15) — Cancel + interés en otra cosa (precio/info)
//   T03 (15) — Sarcasmo / pasivo-agresivo
//   T04 (15) — Pregunta empresa entremezclada con cancel
//   T05 (15) — Cambio múltiple en cadena
//   T06 (15) — Frases emocionales ambiguas
//   T07 (15) — Cancel_partial multi-cita complejo
//   T08 (15) — Dialectos LATAM / regional ES
//   T09 (15) — Typos extremos + abreviaturas WhatsApp
//   T10 (15) — Cancel enterrado en conversación sobre otro tema
//   T11 (15) — Compound emotional + practical
//   T12 (15) — Ambigüedades temporales ("mañana"/"el lunes"/etc)
//   T13 (15) — Post-link scenarios complejos
//   TOTAL: 200
// =============================================================================

const APT_ID = 'TEST_APT_1';
const APT_ID_2 = 'TEST_APT_2';
const APT_ID_3 = 'TEST_APT_3';
const CAL = 'CAL_A';

const APT_TOMORROW_16 = '2026-05-21T16:00:00+02:00';
const APT_FRIDAY_22 = '2026-05-22T16:00:00+02:00';
const APT_TUE_25 = '2026-05-26T16:00:00+02:00';
const APT_FUTURE_2 = '2026-05-23T17:00:00+02:00';
const APT_FUTURE_3 = '2026-05-25T18:00:00+02:00';

const TS_COACH = '2026-05-19T20:00:00Z';
const TS_LEAD_BASE = '2026-05-20T10:00:00Z';

const RESCHEDULE_LINK = 'https://api.leadconnectorhq.com/widget/bookings/round-normal/marcos-rebook';

const apts1 = [{ id: APT_ID, startTime: APT_TOMORROW_16, calendarId: CAL }];
const apts3 = [
  { id: APT_ID, startTime: APT_TOMORROW_16, calendarId: CAL },
  { id: APT_ID_2, startTime: APT_FUTURE_2, calendarId: CAL },
  { id: APT_ID_3, startTime: APT_FUTURE_3, calendarId: CAL },
];

function mkCase(name, category, leadMessages, expectedIntent, opts = {}) {
  const coachMsg = opts.coachMsg || 'Hola! Te recuerdo que tenemos llamada mañana a las 16';
  const messages = [{ direction: 'outbound', body: coachMsg, dateAdded: TS_COACH }];
  // Optional second outbound (e.g. reschedule link)
  if (opts.extraCoachMsg) {
    messages.push({
      direction: 'outbound',
      body: opts.extraCoachMsg,
      dateAdded: opts.extraCoachTs || '2026-05-20T09:55:00Z',
    });
  }
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
  if (opts.coachMsg) out.coachMsg = opts.coachMsg;
  return out;
}

const cases = [];

// =============================================================================
// T01 — Contradicciones / flip-flops en cadena (20)
// Regla: si la cadena termina FIRME en cancel → cancel. Si termina ambigua
// o revertida → no_action (defensa).
// =============================================================================
const T01 = [
  { msgs: ['cancela', 'no espera', 'déjalo', 'mejor mañana sí voy'], exp: 'no_action' },
  { msgs: ['no puedo', 'bueno sí puedo', 'no me preguntes ya no sé'], exp: 'no_action' },
  { msgs: ['déjalo', 'no espera', 'olvídate', 'bueno aver mañana te digo'], exp: 'no_action' },
  { msgs: ['cancela mañana', 'ah espera, déjala', 'sí voy'], exp: 'no_action' },
  { msgs: ['a ver mañana', 'no espera, cancela', 'sí no puedo'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mejor no', 'olvídalo', 'no sé qué decirte'], exp: 'no_action' },
  { msgs: ['cambiamos al jueves', 'ah no mejor déjalo', 'sí va mañana'], exp: 'no_action' },
  { msgs: ['mejor anula', 'no espera, dame un segundo', 'vale anula'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['sí mañana ahí estaré', 'ah no, mejor cancélala', 'ahí estaré'], exp: 'no_action' },
  { msgs: ['no espera ya no', 'déjalo en pie', 'mañana ahí estaré sí'], exp: 'no_action' },
  { msgs: ['cancela', 'no, no, mejor no', 'aver pues cancélala porfa'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['paso', 'no espera', 'mejor lo pienso', 'te digo a la tarde'], exp: 'no_action' },
  { msgs: ['jajaja olvídate', 'no, sí voy', 'aver'], exp: 'no_action' },
  { msgs: ['nose', 'déjalo', 'bueno mañana hablamos'], exp: 'no_action' },
  { msgs: ['mejor lo cancelamos', 'no espera te pongo otra hora', 'te aviso'], exp: 'no_action' },
  { msgs: ['cancela porfa', 'espera', 'espera', 'espera', 'vale cancela'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['si', 'no', 'si', 'no', 'cancela mejor'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['déjalo en pie', 'ah mejor mañana no puedo', 'cambia día'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['paso', 'olvídate', 'es broma sí voy'], exp: 'no_action' },
  { msgs: ['si no voy', 'no espera sí voy', 'no me lies tu'], exp: 'no_action' },
];
for (let i = 0; i < T01.length; i++) {
  const c = T01[i];
  cases.push(mkCase(`T01-${String(i + 1).padStart(3, '0')}`, 'T01', c.msgs, c.exp,
    c.delay !== undefined ? { expectedDelay: c.delay, expectedIdsCount: c.ids } : {}));
}

// =============================================================================
// T02 — Cancel + interés en otra cosa (15) → cancel_with_followup
// Regla: si lead cancela firme, da igual qué más pida. Cancel manda.
// =============================================================================
const T02 = [
  ['cancela mañana porfa, dime cuánto cuesta tu programa'],
  ['no puedo mañana, pero mándame info de planes'],
  ['mañana imposible. cuánto está el premium?'],
  ['la cancelo, pero quiero saber si trabajáis con vegetarianos'],
  ['paso de la llamada de mañana. cuál es vuestra metodología?'],
  ['no me va bien mañana, qué planes tenéis con financiación?'],
  ['cancela, mira sigo interesado mándame info'],
  ['no puedo mañana, podemos hablarlo todo por whatsapp y ya?'],
  ['no la hagamos mañana, dime precios'],
  ['paso de la llamada. me das el link de tu web?'],
  ['mañana imposible. me cuentas en mensaje?'],
  ['la cancelo. cuánto duraría un mes?'],
  ['no puedo ir mañana, pero por aquí seguimos hablando'],
  ['cancela la cita. me interesa, pero por chat'],
  ['mañana no puedo. me apunto el siguiente mes?'],
];
for (let i = 0; i < T02.length; i++) {
  cases.push(mkCase(`T02-${String(i + 1).padStart(3, '0')}`, 'T02', T02[i], 'cancel_with_followup',
    { expectedDelay: 1, expectedIdsCount: 1 }));
}

// =============================================================================
// T03 — Sarcasmo / pasivo-agresivo (15)
// Regla: sarcasmo + descarte explícito → cancel. Solo queja sin descarte → no_action.
// =============================================================================
const T03 = [
  { msgs: ['jajaja otra llamada más para venderme, mejor cancela'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['genial otra llamada para que me vendas tu programa carísimo'], exp: 'no_action' },
  { msgs: ['claro claro mañana fijo ahí estaré'], exp: 'no_action' },
  { msgs: ['paso, no necesito más vendedores en mi vida, cancela porfa'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['a ver si me convencéis mañana eh, porque hasta ahora flojito'], exp: 'no_action' },
  { msgs: ['qué bien otra llamada para nada, da igual cancela'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['seguro que mañana me vendéis algo carísimo, mejor lo dejamos'], exp: 'no_action' },
  { msgs: ['mañana espero que aportéis algo de valor de verdad porque la última no'], exp: 'no_action' },
  { msgs: ['jajaja cancélala mejor que no perdamos tiempo los dos'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mira mañana tengo otra cosa, lo siento por ti'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['a ver si esta vez no me venden la moto'], exp: 'no_action' },
  { msgs: ['paso, paso, otro entrenador más diciéndome lo mismo, anula'], exp: 'cancel_no_followup', ids: 1 },
  { msgs: ['qué pereza la llamada eh, paso mejor'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['bueno mañana hablamos a ver si me convencéis... mejor no, paso'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['si total para que me vendáis lo mismo, mejor cancela esa'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
];
for (let i = 0; i < T03.length; i++) {
  const c = T03[i];
  const opts = {};
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T03-${String(i + 1).padStart(3, '0')}`, 'T03', c.msgs, c.exp, opts));
}

// =============================================================================
// T04 — Pregunta empresa entremezclada con cancel (15)
// Regla: condicional ("si X entonces cancela") → no_action.
// Cancel firme + pregunta → cancel.
// =============================================================================
const T04 = [
  { msgs: ['si no trabajáis con veganos cancela mañana'], exp: 'no_action' },
  { msgs: ['antes de mañana dime si trabajáis con principiantes, sino cancela'], exp: 'no_action' },
  { msgs: ['mañana no puedo, pero antes dime si trabajáis con mujeres'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['solo si trabajáis con personas mayores hacemos la llamada'], exp: 'no_action' },
  { msgs: ['cancela mañana. trabajáis con planes mensuales?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['antes de la llamada quiero saber el precio, si es caro lo dejamos'], exp: 'no_action' },
  { msgs: ['si no aceptáis pagos a plazos mejor lo dejamos'], exp: 'no_action' },
  { msgs: ['mañana imposible. trabajáis con principiantes total?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['si es solo para venderme un programa carísimo, no perdamos tiempo'], exp: 'no_action' },
  { msgs: ['paso mañana. cuánto cobráis al mes?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['depende del precio voy o no. cuánto sale?'], exp: 'no_action' },
  { msgs: ['mañana cancélala. y el plan barato cuál es?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['si trabajáis online sí voy, sino cancela'], exp: 'no_action' },
  { msgs: ['antes de hablar mañana, dime si hacéis nutrición también'], exp: 'no_action' },
  { msgs: ['no me va bien mañana. dime también vuestro horario por favor'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
];
for (let i = 0; i < T04.length; i++) {
  const c = T04[i];
  const opts = {};
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T04-${String(i + 1).padStart(3, '0')}`, 'T04', c.msgs, c.exp, opts));
}

// =============================================================================
// T05 — Cambio múltiple en cadena (15)
// Regla: la última decisión firme manda. Si revierte al estado actual → no_action.
// =============================================================================
const T05 = [
  { msgs: ['cambia al jueves', 'no mejor sábado', 'mejor el viernes'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['muévela al lunes', 'ah no, al martes', 'perdona, al miércoles mejor'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['pásala al viernes', 'ah no perdona, déjala como está'], exp: 'no_action' },
  { msgs: ['el jueves sí', 'no, mejor el viernes', 'sí, viernes'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mañana no', 'el otro día sí', 'bueno mañana ya veré'], exp: 'no_action' },
  { msgs: ['la quito de mañana', 'la pongo el sábado', 'ah no, el domingo'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['cancela y reagéndame jueves', 'ah no, sábado mejor'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mejor el lunes', 'no espera el martes', 'vamos déjalo así'], exp: 'no_action' },
  { msgs: ['el jueves', 'el viernes', 'el sábado', 'ya da igual'], exp: 'no_action' },
  { msgs: ['cambia al jueves a las 16', 'ah no, mejor a las 17', 'a las 18 vamos'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['pásala 2 horas más tarde', 'no espera, 3 horas', 'ah no, 1 hora'], exp: 'no_action' },
  { msgs: ['jueves no, mejor sábado', 'ah no, déjala mañana'], exp: 'no_action' },
  { msgs: ['el otro lunes', 'ah no, el otro martes', 'déjalo en pie'], exp: 'no_action' },
  { msgs: ['mejor cancelo y vemos otro día', 'es que ya no sé cuándo'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['jueves, viernes, sábado, lo que sea, no puedo mañana'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
];
for (let i = 0; i < T05.length; i++) {
  const c = T05[i];
  const opts = {};
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T05-${String(i + 1).padStart(3, '0')}`, 'T05', c.msgs, c.exp, opts));
}

// =============================================================================
// T06 — Frases emocionales ambiguas (15)
// Regla: descarte implícito específico de la llamada → cancel. Solo desahogo → no_action.
// =============================================================================
const T06 = [
  { msgs: ['estoy super agobiada mañana'], exp: 'no_action' },
  { msgs: ['no puedo más con todo esto'], exp: 'no_action' },
  { msgs: ['estoy fatal mañana, paso de la llamada'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['me siento muy mal últimamente'], exp: 'no_action' },
  { msgs: ['estoy a tope mañana, paso de todo'], exp: 'no_action' },
  { msgs: ['llevo dos días sin dormir, mañana me cae fatal'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['estoy quemada, no quiero ni hablar mañana'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['me agobio yo solo, mejor no la hacemos'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['estoy con depresión, hoy paso de todo'], exp: 'no_action' },
  { msgs: ['no puedo más, déjame en paz hoy'], exp: 'no_action' },
  { msgs: ['mañana estoy súper liada', 'no creo que pueda'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['estoy harta, harta, harta'], exp: 'no_action' },
  { msgs: ['estoy sin energía para nada mañana'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mañana voy a estar de mal humor, mejor déjalo'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['estoy en una crisis con mi pareja, no estoy para llamadas'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
];
for (let i = 0; i < T06.length; i++) {
  const c = T06[i];
  const opts = {};
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T06-${String(i + 1).padStart(3, '0')}`, 'T06', c.msgs, c.exp, opts));
}

// =============================================================================
// T07 — Cancel_partial multi-cita complejo (15)
// 3 citas activas. Lead pide cancelar subset O todas O rechazo total.
// =============================================================================
const T07 = [
  { msgs: ['cancela la 1ª y la 3ª, mantén la 2ª'], exp: 'cancel_partial', ids: 2 },
  { msgs: ['solo cancela la del miércoles'], exp: 'cancel_partial', ids: 1 },
  { msgs: ['cancela las dos próximas mantén la última'], exp: 'cancel_partial', ids: 2 },
  { msgs: ['muévelas todas al viernes'], exp: 'cancel_with_followup', delay: 1, ids: 3 },
  { msgs: ['déjame solo la del viernes, cancela el resto'], exp: 'cancel_partial', ids: 2 },
  { msgs: ['cancela el viernes, las otras déjalas igual'], exp: 'cancel_partial', ids: 1 },
  { msgs: ['mañana cancela, el jueves cancela, el viernes mantenlo'], exp: 'cancel_partial', ids: 2 },
  { msgs: ['ya tengo entrenador, cancela todas'], exp: 'cancel_no_followup', ids: 3 },
  { msgs: ['anula todas, no me interesa nada'], exp: 'cancel_no_followup', ids: 3 },
  { msgs: ['borra la primera y déjame las otras dos'], exp: 'cancel_partial', ids: 1 },
  { msgs: ['déjame solo la siguiente'], exp: 'cancel_partial', ids: 2 },
  { msgs: ['cambiad la del lunes y mantenedme las otras como están'], exp: 'cancel_partial', ids: 1 },
  { msgs: ['cancela mañana, lo confirmo el jueves para el resto'], exp: 'cancel_partial', ids: 1 },
  { msgs: ['voy a todas menos la del miércoles'], exp: 'cancel_partial', ids: 1 },
  { msgs: ['ninguna ya, cancelad todas pls'], exp: 'cancel_with_followup', delay: 1, ids: 3 },
];
for (let i = 0; i < T07.length; i++) {
  const c = T07[i];
  const opts = { appointments: apts3 };
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T07-${String(i + 1).padStart(3, '0')}`, 'T07', c.msgs, c.exp, opts));
}

// =============================================================================
// T08 — Dialectos LATAM / regional ES (15) → cancel_with_followup
// =============================================================================
const T08 = [
  ['che, mañana no puedo, cambiamos el día?'],
  ['órale Marcos, mañana imposible, qué tenés el jueves?'],
  ['mae, no llego mañana, hay opción el viernes?'],
  ['bro mañana no puedo, hay forma de cambiar día?'],
  ['acho que mañana no me cuadra, pasamos al lunes?'],
  ['amigo, ando ocupado mañana, me lo movés?'],
  ['men no puedo mañana, cambiamos?'],
  ['loco mañana no llego, hay otro día?'],
  ['xaval mañana imposible eh, dame otro día'],
  ['mañana me lió todo, cancela porfa'],
  ['wei mañana no se va a poder, otro día?'],
  ['compadre, mañana me sale algo, cambiamos día?'],
  ['pibe la llamada de mañana se cae, qué otro día tenés?'],
  ['tronco mañana no puedo eh, cambiamos día?'],
  ['compa, no puedo mañana, agendamos otro día?'],
];
for (let i = 0; i < T08.length; i++) {
  cases.push(mkCase(`T08-${String(i + 1).padStart(3, '0')}`, 'T08', T08[i], 'cancel_with_followup',
    { expectedDelay: 1, expectedIdsCount: 1 }));
}

// =============================================================================
// T09 — Typos extremos + abreviaturas WhatsApp (15)
// =============================================================================
const T09 = [
  { msgs: ['ksk no pdo mñn cambiamos'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['porfa cncela maña'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mñn imposible m psa algo'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['nopuedoirmaña dame otro dia'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['x fi cancelala'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mna no pudo, jbs xq'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['no pudo mñn, kmbiamos?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mañana mb no llego pdmos pasarla?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['m apuntr al jueves x fa'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['ksen pte tengo q cncelar mna'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['sry mna no llgo no tngo wifi'], exp: 'no_action' },
  { msgs: ['porfaa cambia la lcta al sabad'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['nadi puedo mna ni pasado, kmbiamos xfa'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mñn xrt no puedo, hay opcion?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['mna imp pasa algoo'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
];
for (let i = 0; i < T09.length; i++) {
  const c = T09[i];
  const opts = {};
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T09-${String(i + 1).padStart(3, '0')}`, 'T09', c.msgs, c.exp, opts));
}

// =============================================================================
// T10 — Cancel enterrado en conversación sobre otro tema (15)
// Regla: si hay cancel/orden firme al final, vale aunque venga después de fluff.
// =============================================================================
const T10 = [
  { msgs: ['Oye lo del cardio bien, llevo 3 sesiones esta semana. Por cierto mañana no puedo, cambiamos día?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['He estado pensando en la dieta y me cuesta seguir las macros, podemos hablarlo. Ah por cierto mañana cancela'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['El último ejercicio que me mandaste el hipthrust me molesta la zona lumbar. A propósito mañana cancela porfa'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['Llevo 2kg menos esta semana. La llamada de mañana cancélala que tengo lío'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['Vi tu reel de proteínas estuvo bien. Mi suegra está mal, no puedo mañana'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['Tengo dudas sobre creatina si me ayuda... mañana no llego a la call'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['Marcos buenas, leyendo el plan, qué duro lo de la sentadilla a una pierna ehh'], exp: 'no_action' },
  { msgs: ['Cada vez que pienso en hablar de mi dieta me da pereza pero mañana ahí estoy'], exp: 'no_action' },
  { msgs: ['Te quería preguntar por el pre entreno, pero antes mañana cancélamela'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['Conseguí el sueño de 8h pero estoy más cansado raro... cancela mañana mejor'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['Vi a tu mujer en tu insta, qué guapos la verdad. Por cierto reagéndame mañana'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['Quería decirte que llevo 30 días sin comer dulce. mañana entre tu y yo no puedo ir'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['Salí a correr 10km, primera vez en años, increíble. Mañana cancélala que estoy reventado'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['Marcos las medidas las hago el sábado. Voy ahí mañana sin falta'], exp: 'no_action' },
  { msgs: ['Pude hacer 20 dominadas seguidas, mira el video. Mañana no llego al inicio, voy media hora tarde'], exp: 'no_action' },
];
for (let i = 0; i < T10.length; i++) {
  const c = T10[i];
  const opts = {};
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T10-${String(i + 1).padStart(3, '0')}`, 'T10', c.msgs, c.exp, opts));
}

// =============================================================================
// T11 — Compound emotional + practical (15)
// Lead expresa emoción + decisión práctica. Hay que leer la decisión.
// =============================================================================
const T11 = [
  { msgs: ['estoy harta pero quiero seguir, mañana cancela igualmente'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['me siento mal pero la de mañana sí la hago'], exp: 'no_action' },
  { msgs: ['mi padre está hospitalizado, no puedo mañana'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['estoy de bajón pero voy mañana fijo'], exp: 'no_action' },
  { msgs: ['estoy fatal con todo pero estaré mañana'], exp: 'no_action' },
  { msgs: ['aunque esté mal mañana ahí estaré'], exp: 'no_action' },
  { msgs: ['he tenido un día horrible, mañana cancela'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['sin energía mañana, no creo que pueda'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['familiarmente fatal pero la llamada la mantengo'], exp: 'no_action' },
  { msgs: ['fatal de ánimos, paso de la llamada'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['la verdad estoy bajón pero quiero seguir con vosotros, mañana ahí estoy'], exp: 'no_action' },
  { msgs: ['mañana sigo de bajón, lo cancelamos?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['aunque me cueste mucho mañana voy'], exp: 'no_action' },
  { msgs: ['estoy regular pero la llamada para qué la cancelo'], exp: 'no_action' },
  { msgs: ['mi rutina es un caos, no puedo mañana, cambiamos?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
];
for (let i = 0; i < T11.length; i++) {
  const c = T11[i];
  const opts = {};
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T11-${String(i + 1).padStart(3, '0')}`, 'T11', c.msgs, c.exp, opts));
}

// =============================================================================
// T12 — Ambigüedades temporales (15)
// Cita es mañana 21-05 16h salvo donde se indique. Lead usa días concretos.
// =============================================================================
const T12 = [
  // Día concreto que sí coincide con la cita
  { msgs: ['no puedo el jueves'], exp: 'cancel_with_followup', delay: 1, ids: 1 }, // 21-05 = jueves
  // Día concreto que NO coincide con la cita
  { msgs: ['el viernes que viene no puedo'], exp: 'no_action' },
  // "este X" cuando X es el día de la cita
  { msgs: ['este jueves no puedo'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  // "el otro X" — futuro lejano
  { msgs: ['el otro jueves no puedo'], exp: 'no_action' },
  // "mañana" cuando cita es mañana
  { msgs: ['mañana no puedo'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  // "hoy" cuando cita es mañana
  { msgs: ['hoy no puedo nada'], exp: 'no_action' },
  // "esta semana imposible" cuando cita es mañana (esta semana incluye mañana)
  { msgs: ['esta semana imposible'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  // "el lunes que viene no puedo" cuando cita es mañana jueves
  { msgs: ['el lunes que viene no puedo'], exp: 'no_action' },
  // Fecha concreta numérica
  { msgs: ['el día 22 no puedo'], exp: 'no_action' },
  { msgs: ['el día 21 no puedo'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  // Rango
  { msgs: ['los próximos días imposible'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  // En X días
  { msgs: ['en 3 días no puedo'], exp: 'no_action' },
  // Mes que viene
  { msgs: ['el mes que viene no puedo'], exp: 'no_action' },
  // "mañana por la mañana" cuando cita es mañana por la tarde
  { msgs: ['mañana por la mañana no puedo'], exp: 'no_action' },
  // "mañana por la tarde" cuando cita es mañana por la tarde
  { msgs: ['mañana por la tarde no puedo, cambiamos?'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
];
for (let i = 0; i < T12.length; i++) {
  const c = T12[i];
  const opts = {};
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T12-${String(i + 1).padStart(3, '0')}`, 'T12', c.msgs, c.exp, opts));
}

// =============================================================================
// T13 — Post-link scenarios complejos (15)
// Coach envió link de reagendar. Lead responde de formas variadas.
// =============================================================================
const T13Cases = [
  { msgs: ['ya lo hice'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['no me sale el link'], exp: 'no_action' },
  { msgs: ['déjame pensarlo'], exp: 'no_action' },
  { msgs: ['no, mejor sí voy'], exp: 'no_action' },
  { msgs: ['vale'], exp: 'no_action' },
  { msgs: ['gracias, lo veo'], exp: 'no_action' },
  { msgs: ['perfecto, lo hago ahora'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['no me sale ninguna fecha que me cuadre'], exp: 'no_action' },
  { msgs: ['no puedo abrirlo desde el móvil'], exp: 'no_action' },
  { msgs: ['mañana no llego al horario que tienes, dame uno por la tarde'], exp: 'no_action' },
  { msgs: ['ese link no funciona'], exp: 'no_action' },
  { msgs: ['voy a hacerlo ahora'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['luego te confirmo si reagendo o no'], exp: 'no_action' },
  { msgs: ['gracias, ya cambié al sábado'], exp: 'cancel_with_followup', delay: 1, ids: 1 },
  { msgs: ['no me funciona, dame otro?'], exp: 'no_action' },
];
for (let i = 0; i < T13Cases.length; i++) {
  const c = T13Cases[i];
  const opts = {
    coachMsg: 'Hola! Mira si te va mejor reagendar la llamada, aquí tienes el enlace para elegir otro hueco',
    extraCoachMsg: `Aquí el link: ${RESCHEDULE_LINK}`,
    extraCoachTs: '2026-05-20T09:55:00Z',
  };
  if (c.delay !== undefined) opts.expectedDelay = c.delay;
  if (c.ids !== undefined) opts.expectedIdsCount = c.ids;
  cases.push(mkCase(`T13-${String(i + 1).padStart(3, '0')}`, 'T13', c.msgs, c.exp, opts));
}

module.exports = cases;
