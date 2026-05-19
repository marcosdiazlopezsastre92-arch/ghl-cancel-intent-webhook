'use strict';

// =============================================================================
// TEST CASES V2 — 400 cases
//
// Created in response to production failure on 2026-05-19 (Pepe del padre
// hospitalizado): lead said "espero estar mañana pero puede que no pueda...
// te confirmo mañana o cambiamos?" and was wrongly classified as
// cancel_with_followup.
//
// This suite verifies that:
//   1. The NEW exception (LEAD INCIERTO + OFRECE CONFIRMAR) catches the
//      production failure pattern and similar variants (N1 - 60 cases).
//   2. None of the previously-fixed patterns regress (N2-N13).
//
// Categories:
//   N1 (60)  — NEW: Lead incierto + ofrece confirmar más tarde
//   N2 (50)  — Firm direct cancellations
//   N3 (40)  — Firm reschedule asks (Laura pattern)
//   N4 (35)  — Conditional objections + soft off-ramp (65€ pattern)
//   N5 (30)  — Same-day hour adjustments
//   N6 (30)  — Retrasos with explicit qualifiers
//   N7 (25)  — Asistencia confirmations
//   N8 (30)  — Technical problems with explicit tech terms
//   N9 (25)  — Total program rejection → cancel_no_followup
//   N10 (25) — Cancel partial (multi-cita scenarios)
//   N11 (25) — Slang/typos heavy
//   N12 (15) — Borderline ambiguous → no_action default
//   N13 (10) — Competitor mention (soft vs firme)
//   TOTAL: 400
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

// Helper to build a 2-message case (coach reminder + lead reply variants).
// `leadMessages` is array of strings (1+ messages, each adds 1s timestamp).
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
// N1 — NEW PATTERN: Lead incierto + ofrece confirmar más tarde (60 cases)
// All should return no_action
// =============================================================================

// The real production case from 2026-05-19 — verbatim message
cases.push({
  name: 'N1-CASOREAL-PEPE',
  category: 'N1',
  messages: [
    { direction: 'outbound', body: 'Hola! Te recuerdo que tenemos llamada mañana a las 16', dateAdded: TS_COACH },
    { direction: 'inbound', body: 'Buenas tardes! Pues, te quería comentar espero estar mañana pero puede que no pueda por problemas familiares. Tengo al padre de mi pareja ingresado en el hospital y puede que nos tengamos que ir a ayudarles ya que no vivimos en la misma comunidad. Seguramente hasta el jueves no vayamos pero no estoy seguro', dateAdded: '2026-05-19T17:46:00Z' },
    { direction: 'inbound', body: 'Te importa si te confirmo mañana a la mañana o cambiamos la cita?', dateAdded: '2026-05-19T17:46:30Z' },
    { direction: 'inbound', body: 'Lo de las recetas me es igual que sean elaboradas o sencillas. Cocino el domingo para toda la semana si hay que hacer cosas más elaboradas no me importa.', dateAdded: '2026-05-19T17:47:00Z' },
    { direction: 'inbound', body: '👌🏼😁', dateAdded: '2026-05-19T17:47:30Z' },
  ],
  appointments: apts1,
  expectedIntent: 'no_action',
});

const N1_VARIANTS = [
  // Emergencias familiares (10)
  ['Mi madre está mal de salud, igual no puedo mañana. Te confirmo por la mañana'],
  ['Tengo un familiar en el hospital, no sé seguro si podré. Te aviso mañana'],
  ['A ver si me da tiempo de salir del hospital, te confirmo a la tarde'],
  ['Espero llegar pero puede que no pueda por temas médicos, te aviso'],
  ['Tengo a mi abuela ingresada, igual nos toca ir. Te confirmo mañana o cambiamos'],
  ['Mi padre está en urgencias, no sé cómo evolucionará. Te aviso si finalmente puedo'],
  ['Estamos con un tema familiar serio, te aviso mañana si podré ir'],
  ['Mi hermano está delicado, igual tenemos que viajar. Te confirmo si llego'],
  ['Tengo a mi hijo enfermo, no estoy seguro si podré dejarlo. Te aviso a la tarde'],
  ['Familiar hospitalizado, te confirmo a primera hora cómo está la cosa'],

  // Lío de trabajo (10)
  ['Tengo lío con el trabajo, no sé si podré. Te confirmo en un rato'],
  ['Me ha salido reunión sorpresa, intento llegar pero te aviso'],
  ['Estoy con un fuego en la oficina, te confirmo si llego o reagendamos'],
  ['Tengo una semana caótica, te confirmo mañana si puedo'],
  ['Me han pedido cubrir un turno, a ver si me libro. Te aviso'],
  ['Tengo una entrega urgente, intento estar pero no seguro. Te confirmo'],
  ['Reunión inesperada que igual se alarga, te aviso si llego'],
  ['Trabajo me está apretando, te confirmo si finalmente puedo conectar'],
  ['Tengo que cubrir a un compañero, espero llegar pero te aviso'],
  ['Estoy en medio de una crisis laboral, te confirmo a la tarde si llego'],

  // Condicionales/inciertas cortas (10)
  ['Probablemente sí pero te confirmo en un rato'],
  ['A ver si llego, sino te aviso'],
  ['Espero estar, te confirmo mañana'],
  ['No estoy seguro si podré, te confirmo a primera hora'],
  ['Igual no llego, te aviso por la mañana'],
  ['Vamos viendo, te aviso'],
  ['Te confirmo en un ratillo a ver'],
  ['A ver cómo me va, te aviso'],
  ['Te confirmo mañana, no estoy seguro'],
  ['No 100% seguro, te aviso un par de horas antes'],

  // Con reagenda como alternativa con "O" (10)
  ['Espero estar pero puede que no, te confirmo mañana o cambiamos'],
  ['Igual no llego, te aviso y si no podemos cambiar día'],
  ['A ver cómo va el día, te aviso si voy sino reagendamos'],
  ['Te aviso si finalmente puedo, sino reagendamos'],
  ['Si me da tiempo voy, sino te aviso y reagendamos'],
  ['Te confirmo mañana si llego o si necesitamos cambiar el día'],
  ['A ver cómo va la mañana, te aviso o reagendamos'],
  ['Vamos viendo, te confirmo si voy o si tenemos que cambiarlo'],
  ['Espero ir pero igual te tengo que pedir mover el día, te confirmo'],
  ['Te aviso a primera hora si finalmente puedo o si lo cambiamos'],

  // Mezcla / temas personales variados (10)
  ['Mi pareja está mal y no sé si tendré que cuidarla. Te aviso mañana'],
  ['Tengo unas pruebas médicas, igual no me dejan ir. Te confirmo'],
  ['Estoy con un tema personal complicado, te confirmo si llego'],
  ['No estoy seguro de poder, te aviso a la tarde'],
  ['Espero ir pero a ver si me da tiempo, te aviso por la mañana'],
  ['Vamos viendo, espero estar pero te confirmo en un par de horas'],
  ['Me ha surgido algo familiar, te aviso luego si finalmente puedo'],
  ['Estoy con dolor de cabeza, a ver cómo me encuentro. Te confirmo más tarde'],
  ['Igual no llego, te aviso si voy o lo movemos'],
  ['No estoy seguro de llegar, te confirmo en una hora'],

  // Multi-msg patterns (9)
  ['Buenas! Te quería comentar algo', 'Igual no puedo mañana por un tema familiar', 'Te confirmo a primera hora o cambiamos cita?'],
  ['Hola Marcos', 'Estoy con la cabeza loca con un tema personal', 'No sé si podré, te aviso mañana cómo va'],
  ['Perdona', 'No estoy seguro 100% de poder mañana', 'Te confirmo en un rato'],
  ['Buenas tardes', 'Me ha surgido un imprevisto familiar', 'Espero estar pero te confirmo o cambiamos'],
  ['Hola, te aviso', 'No sé si podré por temas de trabajo', 'A ver si llego, te confirmo a la tarde'],
  ['Hey perdona', 'Tema personal, igual no llego', 'Te aviso mañana si finalmente puedo'],
  ['Buenas', 'Estoy con un lío en casa', 'A ver cómo va, te confirmo mañana o reagendamos'],
  ['Hola Marcos perdona', 'No estoy seguro si podré por temas familiares', 'Te confirmo en cuanto sepa'],
  ['Te quería avisar', 'Estoy con un tema de salud, no estoy seguro si podré', 'Te aviso a la tarde'],
];

for (let i = 0; i < N1_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N1-${String(i + 1).padStart(3, '0')}`,
    'N1',
    N1_VARIANTS[i],
    'no_action'
  ));
}

// =============================================================================
// N2 — Firm direct cancellations (50 cases)
// Should return cancel_with_followup
// =============================================================================

const N2_VARIANTS = [
  ['Cancela porfa, mañana no puedo'],
  ['No puedo asistir mañana, tengo que cancelar'],
  ['Anula la cita por favor'],
  ['No voy a poder ir mañana'],
  ['Tengo que cancelar, lo siento'],
  ['Imposible ir mañana'],
  ['No llego mañana, lo siento'],
  ['Cancela la llamada'],
  ['No podré asistir, te aviso para cancelar'],
  ['Mañana imposible, cancelo'],
  ['No voy a poder ir, anula porfa'],
  ['Lo siento pero no puedo mañana, cancela'],
  ['Tengo que anular la cita de mañana'],
  ['No asistiré, gracias'],
  ['Cancelo la llamada de mañana'],
  ['No puedo, cancela todo'],
  ['Anula esa llamada, no podré'],
  ['No voy a poder, cancela porfa'],
  ['Tengo que cancelar la llamada de mañana, lo siento'],
  ['Imposible asistir, cancela'],
  ['No llego, anula'],
  ['Cancela la cita por favor, no podré'],
  ['Me surgió algo, cancelo la llamada'],
  ['Estoy malo, cancela la llamada de mañana'],
  ['Lo lamento, cancelo la llamada'],
  ['No puedo ir, dejémoslo'],
  ['Anula, no llego'],
  ['Cancela por favor, no podré asistir'],
  ['No voy a llegar, cancela'],
  ['Tengo que cancelar sí o sí'],
  // Multi-msg variants
  ['Hola Marcos', 'No puedo mañana, cancela porfa'],
  ['Perdona Marcos', 'No voy a poder ir, anula la llamada'],
  ['Buenas', 'Me surgió un compromiso', 'Tengo que cancelar la llamada'],
  ['Hola', 'Cancela la cita mañana, no puedo'],
  ['Perdona', 'Anula la llamada, lo siento'],
  ['Te aviso', 'No podré asistir mañana, cancela'],
  ['Hey', 'Cancelo la llamada, no llego'],
  ['Buenas tardes', 'No puedo mañana', 'Cancela por favor'],
  ['Perdona el aviso', 'Tengo que cancelar la cita'],
  ['Hola Marcos perdona', 'Cancelo la llamada de mañana'],
  // Variantes con motivos
  ['Estoy enfermo, cancela la llamada'],
  ['Tengo que viajar de urgencia, cancela'],
  ['Me ha surgido un funeral, cancela la cita'],
  ['Estoy de resaca, no llego mañana'],
  ['Tengo cita médica imprevista, cancela'],
  ['Me operan mañana, cancela la llamada'],
  ['No me encuentro bien, anula porfa'],
  ['Tengo trabajo a tope, cancelo la llamada'],
  ['Me ha venido el periodo fatal, cancela la cita'],
  ['Estoy con migraña fuerte, cancela porfa'],
];

for (let i = 0; i < N2_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N2-${String(i + 1).padStart(3, '0')}`,
    'N2',
    Array.isArray(N2_VARIANTS[i]) ? N2_VARIANTS[i] : [N2_VARIANTS[i]],
    'cancel_with_followup',
    { expectedDelay: 1, expectedIdsCount: 1 }
  ));
}

// =============================================================================
// N3 — Firm reschedule asks (40 cases) — Laura pattern
// Should return cancel_with_followup
// =============================================================================

const N3_VARIANTS = [
  ['Mañana no me va bien, podemos cambiar el día?'],
  ['Buenas noches, perdona mañana no me va bien la llamada', 'Podemos cambiar el día?'],
  ['No puedo mañana, cambiamos?'],
  ['Mañana imposible, qué huecos tenéis otro día?'],
  ['Tengo que cambiar el día sí o sí'],
  ['No me viene bien mañana, podemos pasarlo a otro día?'],
  ['Mañana no puedo, qué disponibilidad tenéis el jueves?'],
  ['Necesito cambiar el día de la llamada'],
  ['Podemos pasarla a la semana que viene?'],
  ['Me viene mejor cambiar la cita al viernes'],
  ['Mañana no puedo, me pasas a otra fecha?'],
  ['Tengo que mover la llamada, no puedo mañana'],
  ['Mañana imposible para mí, podemos pasarla?'],
  ['Necesito cambiarla al jueves si puede ser'],
  ['No me cuadra mañana, podemos cambiarla?'],
  ['Cambiamos día de la llamada porfa'],
  ['Podemos hacerla otro día? Mañana no puedo'],
  ['Me viene mejor el viernes que mañana'],
  ['Tengo que cambiar día, mañana no me cuadra'],
  ['No puedo mañana, cambia la llamada porfa'],
  // Multi-msg variants
  ['Perdona Marcos', 'Mañana no puedo', 'Podemos cambiarla al jueves?'],
  ['Hola', 'No me viene bien mañana', 'Cambiamos la llamada al viernes?'],
  ['Buenas', 'Me ha surgido algo mañana', 'Podemos pasarla a la semana que viene?'],
  ['Hey perdona', 'No puedo mañana imposible', 'Me pasas a otra fecha?'],
  ['Buenos días', 'No puedo asistir mañana', 'Podemos moverla a otro día?'],
  ['Perdona el aviso', 'Mañana no me cuadra nada', 'Cambiamos día'],
  ['Hola Marcos', 'Tengo que cambiar la cita', 'No puedo el día que tenemos'],
  ['Buenas', 'Me ha cambiado todo', 'Necesito pasar la llamada a otro día'],
  ['Hola', 'No llego mañana', 'Cambiamos día porfa'],
  ['Perdona', 'Imposible mañana', 'Hay hueco el jueves?'],
  // Con motivos
  ['Me ha salido un viaje mañana, podemos cambiar el día?'],
  ['Tengo boda mañana, cambiamos la llamada'],
  ['Reunión mañana imposible, podemos moverla al jueves?'],
  ['Me toca trabajar mañana, cambiamos día?'],
  ['No me cuadra mañana, podemos pasarla a otro día'],
  ['Tengo cita médica mañana, cambiamos día por favor'],
  ['Mañana tengo entrega, no puedo, cambia el día'],
  ['Estoy fuera mañana, podemos cambiarla?'],
  ['Sale viaje de trabajo mañana, cambiamos día'],
  ['Tengo eventos toda la semana, podemos moverla a la siguiente?'],
];

for (let i = 0; i < N3_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N3-${String(i + 1).padStart(3, '0')}`,
    'N3',
    N3_VARIANTS[i],
    'cancel_with_followup',
    { expectedDelay: 1, expectedIdsCount: 1 }
  ));
}

// =============================================================================
// N4 — Conditional objections + soft off-ramp (35 cases) — 65€ pattern
// Should return no_action
// =============================================================================

const N4_VARIANTS = [
  ['Como máximo puedo 65€', 'Si no es posible dímelo', 'Y no hace falta la llamada'],
  ['Si es muy caro mejor no hacemos la call'],
  ['Solo tengo media hora', 'Si necesitáis más mejor no la hacemos'],
  ['Si es solo para venderme algo', 'Prefiero no hacerla'],
  ['Mi pareja no me apoya', 'Si no es flexible mejor lo dejamos'],
  ['Tengo ya entrenador', 'Si no aportáis más que él mejor no'],
  ['Si no me convence en la primera media hora mejor lo dejamos'],
  ['Si está fuera de mi presupuesto no la hacemos'],
  ['Si no podéis adaptaros a mis horarios no perdamos el tiempo'],
  ['Solo busco un plan básico', 'Si lo vuestro es más complejo mejor no'],
  ['Si la llamada es solo para venta dura mejor no'],
  ['Si dura más de 30 minutos mejor no la hacemos'],
  ['Si no encaja con mi estilo de vida prefiero no'],
  ['Si no tenéis flexibilidad de pago mejor no'],
  ['Si no podéis ajustaros a vegetariano mejor lo dejamos'],
  ['Si trabajáis solo con powerlifting prefiero no'],
  ['Si no podéis con mi lesión mejor no perdamos el tiempo'],
  ['Si no aceptáis pago en cuotas mejor lo dejamos'],
  ['Si vuestro método no tiene cardio mejor no'],
  ['Si es solo online sin contacto mejor lo dejo'],
  // Multi-msg
  ['Marcos perdona', 'Tengo dudas sobre el precio', 'Si es muy caro mejor no la hacemos'],
  ['Hola', 'Estoy ajustado de presupuesto', 'Si no me cuadra mejor lo dejamos'],
  ['Perdona el comentario', 'Mi presupuesto es bajo', 'Si os queda alto no perdamos el tiempo'],
  ['Buenas', 'Solo busco algo puntual', 'Si lo vuestro es muy a largo mejor no'],
  ['Hola Marcos', 'Tengo poco tiempo libre', 'Si requiere mucha dedicación mejor no la hago'],
  // Variantes con competidor
  ['Tengo coach actual', 'Si no me ofrecéis algo distinto prefiero no'],
  ['Llevo años con un entrenador', 'Si vuestro enfoque es parecido mejor no'],
  ['Trabajo con otro programa', 'Si no aportáis algo nuevo no merece la pena'],
  // Variantes mixtas
  ['Si no podéis con mis horarios mejor lo dejamos'],
  ['Si vuestro plan es muy estricto mejor no'],
  ['Si necesito ir a gimnasio si o si mejor no'],
  ['Si la inversión supera lo que dije mejor no la hagamos'],
  ['Si el método incluye dieta hipocalórica fuerte mejor no'],
  ['Si tengo que renunciar al alcohol totalmente mejor no'],
  ['Si requiere madrugar mucho prefiero no hacerla'],
];

for (let i = 0; i < N4_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N4-${String(i + 1).padStart(3, '0')}`,
    'N4',
    N4_VARIANTS[i],
    'no_action'
  ));
}

// =============================================================================
// N5 — Same-day hour adjustments (30 cases)
// Should return no_action
// =============================================================================

const N5_VARIANTS = [
  ['Podemos cambiar mañana a las 18 en vez de 16?'],
  ['30 min más tarde si te va bien?'],
  ['Puedo a las 20 mejor mañana?'],
  ['Podemos atrasar 15min?'],
  ['Acomódame mejor a las 19 mañana'],
  ['Puedo mañana más tarde?'],
  ['Mejor vamos un par de horas después mañana'],
  ['A la tarde sí pero a esa hora no, puedes más tarde?'],
  ['Mañana a las 18 mejor que a las 16'],
  ['Puedes media hora más tarde?'],
  ['Tienes algo más tarde mismo día?'],
  ['A las 17 mejor que a las 16?'],
  ['Podemos pasarla a las 19 misma fecha?'],
  ['Puedo a las 20:30 mañana mismo?'],
  ['Mejor a la noche que a la tarde, sigue siendo mañana?'],
  ['Misma fecha pero a las 18 mejor'],
  ['Puedes cambiar la hora a las 17:30 mañana?'],
  ['Podemos hacerla 45 min más tarde mañana?'],
  ['Mismo día pero a las 19?'],
  ['Mejor a las 17 mañana en vez de las 16'],
  // Multi-msg
  ['Hola', 'Mañana sí pero podemos cambiar hora?', 'Mejor a las 19'],
  ['Perdona', 'Misma fecha pero diferente hora?', 'A las 18 me cuadra mejor'],
  ['Buenas', 'Mañana sigue en pie', 'Pero podemos atrasar a las 17?'],
  ['Hola Marcos', 'Sí voy mañana', 'Pero a las 18 mejor que a las 16'],
  ['Perdona', 'Voy mañana', 'Pero mejor por la noche'],
  // Variantes con motivo
  ['Tengo reunión hasta las 17, podemos a las 18 mañana?'],
  ['Trabajo me apretó, podemos atrasar a las 19 mismo día?'],
  ['Tengo clase hasta las 17:30, podemos hacerla mañana más tarde?'],
  ['Voy a estar de viaje volviendo, puedo a las 20 mañana?'],
  ['Estoy con los niños, mejor a las 21 mañana?'],
];

for (let i = 0; i < N5_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N5-${String(i + 1).padStart(3, '0')}`,
    'N5',
    N5_VARIANTS[i],
    'no_action'
  ));
}

// =============================================================================
// N6 — Retrasos with explicit qualifiers (30 cases)
// Should return no_action
// =============================================================================

const N6_VARIANTS = [
  ['Llego tarde mañana, 10 min'],
  ['No podré llegar a tiempo, me retraso 15 min'],
  ['Voy con 20 minutos de retraso mañana'],
  ['Llegaré tarde, unos 15 min'],
  ['Me retraso un poco, llego 10 min tarde'],
  ['Voy a llegar tarde por el tráfico, 15min'],
  ['Puedo entrar 5 min tarde?'],
  ['Llego tarde un poco, lo siento'],
  ['No llegaré puntual, 10 min de retraso'],
  ['Mañana llego 20 min tarde'],
  ['Me he retrasado un poco, llego 15 min tarde'],
  ['Voy con media hora de retraso mañana'],
  ['No llego al inicio, entro a la mitad'],
  ['Salgo tarde del curro, llego 15 min tarde mañana'],
  ['Lo siento llego tarde, 10 minutos'],
  ['Voy a entrar 10 min tarde mañana'],
  ['Me sale algo, llego un poco tarde'],
  ['No podré ser puntual mañana, 15 min'],
  ['Llegaré 10 minutos tarde'],
  ['Estaré 5 min tarde'],
  // Multi-msg
  ['Hola', 'Llego tarde mañana', 'Unos 10 min nada más'],
  ['Perdona', 'Voy a retrasarme un poco', '15 minutos'],
  ['Aviso', 'Llegaré 20 minutos tarde mañana'],
  ['Buenas', 'No llego puntual', 'Llego 10 min tarde'],
  ['Hey', 'Me toca llegar tarde', 'Unos 15 minutos'],
  // Variantes mezcla
  ['Estoy de camino, llego 5 min tarde'],
  ['Sin problema voy, solo llego 10 min tarde'],
  ['Sigo en pie mañana pero llego 15 min tarde'],
  ['Voy a la llamada pero con 20 minutos de retraso'],
  ['Mañana voy pero llego un poco tarde, 10 min'],
];

for (let i = 0; i < N6_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N6-${String(i + 1).padStart(3, '0')}`,
    'N6',
    N6_VARIANTS[i],
    'no_action'
  ));
}

// =============================================================================
// N7 — Asistencia confirmations (25 cases)
// Should return no_action
// =============================================================================

const N7_VARIANTS = [
  ['Sí, mañana ahí estaré'],
  ['Perfecto, allí estoy'],
  ['Confirmado, hablamos mañana'],
  ['Vale, ahí te leo'],
  ['Sí voy, gracias por avisar'],
  ['Sigue en pie mañana?'],
  ['Confírmame que tenemos llamada'],
  ['Genial, ahí estaré sin falta'],
  ['Perfecto, allí estaré'],
  ['Voy mañana fijo'],
  ['Recibido, ahí estoy mañana'],
  ['Allí estaré sin problema'],
  ['Sí sí, hablamos mañana'],
  ['Apuntado y confirmado'],
  ['Ahí estoy a la hora'],
  ['Recibido y confirmado'],
  ['Perfecto, gracias, ahí estaré'],
  ['Sí mañana voy seguro'],
  ['Genial, te veo mañana'],
  ['Voy fijo, lo tengo apuntado'],
  ['Confirmadísimo, ahí estoy'],
  ['Recibido, allí mañana'],
  ['Sí mañana sin falta'],
  ['Perfecto, hablamos mañana entonces'],
  ['Anotado, mañana ahí'],
];

for (let i = 0; i < N7_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N7-${String(i + 1).padStart(3, '0')}`,
    'N7',
    N7_VARIANTS[i],
    'no_action'
  ));
}

// =============================================================================
// N8 — Technical problems with explicit tech terms (30 cases)
// Should return no_action
// =============================================================================

const N8_VARIANTS = [
  ['No me funciona Zoom'],
  ['No puedo entrar al meet, dame otro link?'],
  ['No me carga la cámara'],
  ['No me entra al meet, ayuda'],
  ['Llevo 10 min intentando entrar, no me deja'],
  ['Se me ha colgado el ordenador'],
  ['No me sale el link de la call'],
  ['Zoom me pide actualizar, dame un min'],
  ['No me funciona el micrófono'],
  ['Se me ha caído el wifi, espera'],
  ['No puedo abrir el link de Google Meet'],
  ['El portátil no me arranca, espera'],
  ['Me da error al entrar al meet'],
  ['No puedo conectar la cámara'],
  ['El enlace de la llamada no me funciona'],
  ['Tengo problema con el audio'],
  ['No me carga la sala de Zoom'],
  ['Mi móvil no me deja entrar al meet'],
  ['Estoy intentando entrar pero el link da error'],
  ['Se me cuelga Zoom cada vez que entro'],
  // Multi-msg
  ['Hola', 'No puedo entrar al meet', 'Me da error el enlace'],
  ['Perdona', 'Zoom no me carga', 'Llevo 5 min intentándolo'],
  ['Espera', 'Se me ha colgado el ordenador', 'Reinicio y entro'],
  ['Aviso', 'No me funciona el micrófono', 'Hay otra forma de conectar?'],
  ['Hey', 'No me entra al link', 'Me das otro?'],
  // Variantes
  ['Mi cámara no enciende, dame un min'],
  ['Teams no me deja entrar a la sala'],
  ['No puedo cargar el link de la videollamada'],
  ['El audio no me va, dame un sec'],
  ['Skype me pide actualización, dame 5 min'],
];

for (let i = 0; i < N8_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N8-${String(i + 1).padStart(3, '0')}`,
    'N8',
    N8_VARIANTS[i],
    'no_action'
  ));
}

// =============================================================================
// N9 — Total program rejection (25 cases)
// Should return cancel_no_followup
// =============================================================================

const N9_VARIANTS = [
  ['Ya no me interesa, gracias'],
  ['Voy a tirar con otro entrenador, gracias'],
  ['Ya tengo entrenador, no necesito otro'],
  ['Tengo coach, gracias, no me hace falta'],
  ['Estoy entrenando con alguien, no necesito más'],
  ['Borra mis datos por favor'],
  ['Quítame de tu lista'],
  ['No me contactes más'],
  ['Déjame en paz'],
  ['No me molestes más'],
  ['Paso completamente del tema'],
  ['Paso del tema, gracias'],
  ['No me vale la pena, gracias'],
  ['Cancelo todo contigo, gracias'],
  ['Perdí el interés, mejor lo dejamos'],
  ['Ya no me interesa el programa'],
  ['Voy con otro programa, gracias por todo'],
  ['No quiero seguir con esto, cancela'],
  ['Ya entreno con otra persona, no me hace falta'],
  ['Ya no quiero coach, gracias'],
  ['Mejor déjame, no me interesa'],
  ['No me interesa nada, déjalo'],
  ['Borradme de la lista por favor'],
  ['Stop, no me escribáis más'],
  ['Cancelo todo, déjame en paz'],
];

for (let i = 0; i < N9_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N9-${String(i + 1).padStart(3, '0')}`,
    'N9',
    N9_VARIANTS[i],
    'cancel_no_followup',
    { expectedIdsCount: 1 }
  ));
}

// =============================================================================
// N10 — Cancel partial (25 cases) — multi-cita scenarios
// Should return cancel_partial
// =============================================================================

const N10_VARIANTS = [
  ['Cancela solo la de mañana, la del jueves mantenla'],
  ['La de mañana no puedo, pero la siguiente sí'],
  ['Anula la primera, las otras déjalas'],
  ['Solo cancela mañana, las próximas están bien'],
  ['No puedo mañana pero el viernes sí, anula solo esa'],
  ['Cancela la cita del 20, las demás mantenlas'],
  ['Mañana no puedo, pero el resto déjalas como están'],
  ['Anula solo la de mañana'],
  ['La de mañana cancélala, las próximas no las toques'],
  ['Cancela la primera, las otras 2 las mantengo'],
  ['Solo cancelo la primera, las otras siguen'],
  ['Anula la de mañana, las próximas siguen en pie'],
  ['La del 20 cancélala, las otras quedan'],
  ['Mañana cancela, pero el viernes mantenla'],
  ['Borra solo la de mañana'],
  // Multi-msg
  ['Hola', 'Solo cancela la de mañana', 'Las otras las mantengo'],
  ['Perdona', 'Anula la primera', 'Las próximas siguen en pie'],
  ['Hey', 'Cancela mañana', 'Las demás no las toques'],
  ['Buenas', 'No puedo mañana', 'Pero solo esa, las demás ok'],
  ['Aviso', 'La primera cancela', 'Las otras todas bien'],
  // Variantes
  ['Cancela la cita del miércoles solo'],
  ['Anula solo la primera, gracias'],
  ['Mañana no, las próximas sí'],
  ['Solo me viene mal la de mañana'],
  ['Anula la del miércoles, las demás están bien'],
];

for (let i = 0; i < N10_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N10-${String(i + 1).padStart(3, '0')}`,
    'N10',
    N10_VARIANTS[i],
    'cancel_partial',
    { appointments: apts3, expectedIdsCount: 1 }
  ));
}

// =============================================================================
// N11 — Slang/typos heavy (25 cases) — various intents
// =============================================================================

cases.push(mkCase('N11-001', 'N11', ['no pudo asistir manyana, cnacela porfi'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-002', 'N11', ['tio q stresss, no llego manana, anula plis'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-003', 'N11', ['nshe si podre manyana, tcnfrmo a la mañana'], 'no_action'));
cases.push(mkCase('N11-004', 'N11', ['kpasa, mañna no llego'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-005', 'N11', ['tio cmbiamos dia plis'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-006', 'N11', ['no me sale la kmara'], 'no_action'));
cases.push(mkCase('N11-007', 'N11', ['si voy si voy'], 'no_action'));
cases.push(mkCase('N11-008', 'N11', ['mñn imposble, kncelo'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-009', 'N11', ['cmbiamos pa otra fecha plis'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-010', 'N11', ['stoy con migrañña kncel'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-011', 'N11', ['tngo q xambiar dia plis'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-012', 'N11', ['ai tio yo m bjo'], 'no_action'));
cases.push(mkCase('N11-013', 'N11', ['ya ngo entrenadr grsias paso'], 'cancel_no_followup', { expectedIdsCount: 1 }));
cases.push(mkCase('N11-014', 'N11', ['vle voy fijo'], 'no_action'));
cases.push(mkCase('N11-015', 'N11', ['llego 10 mns tard'], 'no_action'));
cases.push(mkCase('N11-016', 'N11', ['nshe si voy aviso lugo'], 'no_action'));
cases.push(mkCase('N11-017', 'N11', ['mañna no me cuadra cmbio'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-018', 'N11', ['cncela todo dejam en paz'], 'cancel_no_followup', { expectedIdsCount: 1 }));
cases.push(mkCase('N11-019', 'N11', ['xfa kambiamos a otro dia mañna no pdo'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-020', 'N11', ['t aviso mañna no toy seguro'], 'no_action'));
cases.push(mkCase('N11-021', 'N11', ['vmos viendo t cnfirmo'], 'no_action'));
cases.push(mkCase('N11-022', 'N11', ['no llego mñn lo sntoo'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-023', 'N11', ['cncl plis no podr asistir'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-024', 'N11', ['mñn estoy fra del pais cmbiams'], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
cases.push(mkCase('N11-025', 'N11', ['ai amig zoom no me va'], 'no_action'));

// =============================================================================
// N12 — Borderline ambiguous (15 cases) — default no_action
// =============================================================================

const N12_VARIANTS = [
  ['Vale'],
  ['Ok'],
  ['Recibido'],
  ['Mmmm'],
  ['Hmm'],
  ['No sé qué decirte'],
  ['Ya veremos'],
  ['Bueno'],
  ['Vamos a ver'],
  ['Pues no sé'],
  ['Te digo luego'],
  ['Déjame pensarlo'],
  ['No sé qué hacer'],
  ['A ver qué pasa mañana'],
  ['Pues no estoy seguro de nada'],
];

for (let i = 0; i < N12_VARIANTS.length; i++) {
  cases.push(mkCase(
    `N12-${String(i + 1).padStart(3, '0')}`,
    'N12',
    N12_VARIANTS[i],
    'no_action'
  ));
}

// =============================================================================
// N13 — Competitor mention (10 cases) — soft vs firme
// =============================================================================

// Soft → no_action (5)
cases.push(mkCase('N13-001', 'N13', ['Tengo ya un entrenador', 'Si no aportáis más mejor no la hacemos'], 'no_action'));
cases.push(mkCase('N13-002', 'N13', ['Trabajo con otro coach', 'Si no encaja con vuestro método mejor lo dejamos'], 'no_action'));
cases.push(mkCase('N13-003', 'N13', ['Llevo años con un entrenador', 'Si lo vuestro es muy parecido mejor no'], 'no_action'));
cases.push(mkCase('N13-004', 'N13', ['Tengo programa actual', 'Si no me diferenciáis algo mejor no la hagamos'], 'no_action'));
cases.push(mkCase('N13-005', 'N13', ['Estoy con otro entrenador', 'Si no aportáis algo único mejor lo dejamos'], 'no_action'));

// Firme → cancel_no_followup (5)
cases.push(mkCase('N13-006', 'N13', ['Ya tengo entrenador, no necesito otro, gracias'], 'cancel_no_followup', { expectedIdsCount: 1 }));
cases.push(mkCase('N13-007', 'N13', ['Estoy entrenando con alguien, no me hace falta más'], 'cancel_no_followup', { expectedIdsCount: 1 }));
cases.push(mkCase('N13-008', 'N13', ['Voy a tirar con mi entrenador actual, gracias'], 'cancel_no_followup', { expectedIdsCount: 1 }));
cases.push(mkCase('N13-009', 'N13', ['Tengo coach, gracias, paso'], 'cancel_no_followup', { expectedIdsCount: 1 }));
cases.push(mkCase('N13-010', 'N13', ['Ya entreno con otro pro, no me hace falta nada'], 'cancel_no_followup', { expectedIdsCount: 1 }));

// =============================================================================
// Export
// =============================================================================

module.exports = cases;
