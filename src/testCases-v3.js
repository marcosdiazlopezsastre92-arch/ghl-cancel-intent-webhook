'use strict';

// =============================================================================
// TEST CASES V3 — 200 new diverse cases for current prompt validation
//
// Designed to validate latest prompt changes (commit b17ab70):
//   - Tabla de precedencia entre excepciones
//   - Descartes implícitos (estoy fuera, tengo lío, etc.)
//   - Nuevos términos técnicos (wifi, internet, cobertura)
//   - Preguntas exploratorias sin descarte
//   - "Ya reagendé" + post-link cita
//
// Categories:
//   V1 (30) — Preguntas exploratorias SIN descarte
//   V2 (30) — Decisión + descarte explícito
//   V3 (20) — Descartes implícitos
//   V4 (20) — Afirmaciones firmes y órdenes
//   V5 (15) — Lead incierto + ofrece confirmar
//   V6 (15) — Ajustes hora mismo día
//   V7 (15) — Retrasos con cualificador
//   V8 (15) — Problemas técnicos (incluye wifi/internet)
//   V9 (10) — Rechazo total programa
//   V10 (10) — Cancel partial (multi-cita)
//   V11 (10) — Confirmaciones simples
//   V12 (10) — Casos ambiguos/borderline
//   TOTAL: 200
// =============================================================================

const APT_ID = 'TEST_APT_1';
const APT_ID_2 = 'TEST_APT_2';
const APT_ID_3 = 'TEST_APT_3';
const CAL = 'CAL_A';

const APT_FUTURE_1 = '2026-05-21T16:00:00+02:00';
const APT_FUTURE_2 = '2026-05-22T17:00:00+02:00';
const APT_FUTURE_3 = '2026-05-23T18:00:00+02:00';

const TS_COACH = '2026-05-19T20:00:00Z';
const TS_LEAD_BASE = '2026-05-20T10:00:00Z';

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
// V1 — Preguntas exploratorias SIN descarte (30 cases) → no_action
// =============================================================================
const V1 = [
  ['Podemos cambiar la llamada al jueves?'],
  ['Hay opción del sábado a las 17?'],
  ['Tendrías hueco el lunes que viene?'],
  ['Sería posible pasarla a otro día?'],
  ['Podría ser para el viernes a las 19?'],
  ['Habría disponibilidad el martes?'],
  ['Hay forma de cambiarla al miércoles?'],
  ['Tienes algún hueco el jueves por la tarde?'],
  ['Mejor el sábado, no?'],
  ['Y si lo movemos al jueves?'],
  ['Cambiamos al lunes?'],
  ['Pasamos al viernes mejor?'],
  ['Movemos al sábado?'],
  ['Es posible cambiar el día?'],
  ['Podemos hacerla el jueves a las 11?'],
  ['Posibilidad para el sábado a las 16?'],
  ['Buenas Marcos, podemos cambiar el día?'],
  ['Hola, hay opción para el sábado?'],
  ['Crees que podríamos pasarla al lunes?'],
  ['Podría hacerse el miércoles que viene?'],
  // Multi-msg
  ['Hola Marcos', 'Podemos cambiar la llamada al sábado?'],
  ['Buenas tardes', 'Hay opción del jueves por la tarde?'],
  ['Hola', 'Tendrías hueco el lunes mejor?'],
  ['Perdona', 'Sería posible pasarla a otro día?'],
  ['Buenas', 'Podría ser para el viernes?'],
  // Con día y hora propuestos
  ['Podemos cambiar la llamada al sábado a las 10?'],
  ['Hay opción del jueves a las 18?'],
  ['Tendrías hueco el martes a las 15?'],
  ['Podemos pasarla al viernes a las 16:30?'],
  ['Habría opción el domingo a las 12?'],
];
for (let i = 0; i < V1.length; i++) {
  cases.push(mkCase(`V1-${String(i + 1).padStart(3, '0')}`, 'V1', V1[i], 'no_action'));
}

// =============================================================================
// V2 — Decisión/pregunta + DESCARTE EXPLÍCITO (30 cases) → cancel_with_followup
// =============================================================================
const V2 = [
  ['No puedo mañana, cambiamos día?'],
  ['Mañana imposible, podemos cambiar?'],
  ['No me va bien mañana, hay otro día?'],
  ['No me viene bien mañana, pasamos al jueves?'],
  ['Imposible el viernes, qué huecos hay?'],
  ['Es imposible asistir mañana, cambiamos día?'],
  ['Tengo que cancelar mañana, podemos mover?'],
  ['Tengo que mover sí o sí, qué día tenéis?'],
  ['No podré asistir mañana, cambiamos al jueves?'],
  ['No me va bien el viernes, hay otro hueco?'],
  ['No puedo mañana, ponme el sábado'],
  ['Mañana no me cuadra, podemos cambiar?'],
  ['No me viene bien la llamada de mañana, hay opción otro día?'],
  ['Mañana no puedo, qué huecos tenéis para la próxima semana?'],
  ['Imposible mañana, qué disponibilidad tenéis?'],
  ['No me va nada bien mañana, podemos pasarla?'],
  ['Mañana imposible para mí, cambiamos día porfa?'],
  ['No puedo el viernes, qué hueco hay el lunes?'],
  ['Tengo que cancelar la de mañana, hay opción para otro día?'],
  ['No puedo asistir mañana, podemos cambiarlo al jueves?'],
  // Multi-msg
  ['Hola Marcos', 'No puedo mañana', 'Cambiamos día?'],
  ['Buenas noches', 'Mañana no me va bien', 'Podemos cambiar?'],
  ['Perdona', 'Imposible mañana', 'Qué huecos hay?'],
  ['Hola', 'No me viene bien mañana', 'Podemos pasarla al jueves?'],
  ['Buenas', 'Tengo que cancelar mañana', 'Hay otro hueco?'],
  // Variantes naturales
  ['Marcos no puedo mañana al final, cambiamos día?'],
  ['Perdona pero mañana no me va bien, hay otro día?'],
  ['No me cuadra mañana, podemos pasarla por favor?'],
  ['Mañana me ha surgido algo importante, no puedo, cambiamos?'],
  ['Imposible asistir mañana, qué hueco tenéis pronto?'],
];
for (let i = 0; i < V2.length; i++) {
  cases.push(mkCase(`V2-${String(i + 1).padStart(3, '0')}`, 'V2', V2[i], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
}

// =============================================================================
// V3 — Descartes implícitos (20 cases) → cancel_with_followup
// =============================================================================
const V3 = [
  ['Estoy fuera mañana, hay opción otro día?'],
  ['Estoy de viaje, podemos cambiar?'],
  ['Tengo lío mañana, podemos pasarla?'],
  ['Tengo movida ese día, cambiamos?'],
  ['Voy mal de tiempo mañana, hay otro día?'],
  ['Estoy hasta arriba mañana, podemos mover?'],
  ['Tengo cita médica mañana, qué huecos hay?'],
  ['Tengo boda mañana, cambiamos día?'],
  ['Estoy malo, podemos pasar la llamada?'],
  ['Me ha salido reunión mañana, podemos cambiar?'],
  ['Tengo funeral mañana, hay opción otro día?'],
  ['Me toca viaje mañana imprevisto, podemos pasarla?'],
  // Multi-msg
  ['Hola Marcos', 'Estoy fuera mañana sin cobertura', 'Cambiamos?'],
  ['Perdona', 'Me han metido reunión mañana', 'Hay opción otro día?'],
  ['Buenas', 'Estoy con un lío en casa', 'Podemos pasar la llamada?'],
  ['Hola', 'Estoy malo, no me encuentro bien', 'Podemos cambiarla?'],
  ['Hola Marcos', 'Tengo cita médica imprevista mañana', 'Cambiamos día?'],
  // Variantes regionales
  ['Tengo movida en el trabajo mañana, cambiamos día?'],
  ['Estoy a tope mañana, podemos pasar la llamada?'],
  ['Me ha salido un imprevisto familiar mañana, hay otro hueco?'],
];
for (let i = 0; i < V3.length; i++) {
  cases.push(mkCase(`V3-${String(i + 1).padStart(3, '0')}`, 'V3', V3[i], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
}

// =============================================================================
// V4 — Afirmaciones firmes y órdenes (20 cases) → cancel_with_followup
// =============================================================================
const V4 = [
  ['Cancela porfa, mañana no puedo'],
  ['Anula la cita por favor'],
  ['No voy a poder ir mañana'],
  ['Imposible ir mañana'],
  ['Tengo que cancelar la llamada de mañana'],
  ['Muévelo al sábado'],
  ['Cambia la llamada al jueves'],
  ['Pasa la cita al lunes'],
  ['Ponla el viernes mejor'],
  ['Ya reagendé al jueves'],
  ['Lo cambio ahora al viernes'],
  ['Perfecto reagendo'],
  ['Miro y reagendo'],
  ['Mil gracias, ya cambio la cita'],
  ['Lo estoy moviendo'],
  // Multi-msg
  ['Hola Marcos', 'Cancela mañana porfa'],
  ['Perdona', 'No puedo mañana, anula la cita'],
  ['Buenas', 'Muévelo al sábado por favor'],
  ['Hola', 'Ya reagendé al viernes, gracias!'],
  ['Hola Marcos', 'Cambia la llamada al lunes'],
];
for (let i = 0; i < V4.length; i++) {
  cases.push(mkCase(`V4-${String(i + 1).padStart(3, '0')}`, 'V4', V4[i], 'cancel_with_followup', { expectedDelay: 1, expectedIdsCount: 1 }));
}

// =============================================================================
// V5 — Lead incierto + ofrece confirmar (15 cases) → no_action
// =============================================================================
const V5 = [
  ['Espero estar pero puede que no, te confirmo mañana o cambiamos'],
  ['Mi padre está en el hospital, igual no llego, te confirmo por la mañana'],
  ['A ver si me da tiempo, sino te aviso y reagendamos'],
  ['Probablemente sí pero te confirmo en un rato'],
  ['Tengo lío con el trabajo, no estoy seguro, te aviso a la tarde'],
  ['Intento ir pero igual no puedo, te confirmo más tarde'],
  ['Veremos cómo va, te aviso luego'],
  ['No estoy seguro si podré, te confirmo a primera hora'],
  ['Espero llegar pero por si acaso te aviso por la mañana'],
  ['A ver si llego, sino te paso el enlace'],
  // Multi-msg
  ['Hola Marcos', 'Igual no puedo mañana', 'Te confirmo por la mañana'],
  ['Perdona', 'Espero estar pero no seguro', 'Te aviso a la tarde'],
  ['Buenas', 'Tengo un imprevisto familiar', 'A ver si llego, te aviso'],
  ['Hola', 'No estoy seguro 100% mañana', 'Te confirmo en un par de horas'],
  ['Hola Marcos perdona', 'Igual no llego', 'Te confirmo en un rato o cambiamos'],
];
for (let i = 0; i < V5.length; i++) {
  cases.push(mkCase(`V5-${String(i + 1).padStart(3, '0')}`, 'V5', V5[i], 'no_action'));
}

// =============================================================================
// V6 — Ajustes hora mismo día (15 cases) → no_action
// =============================================================================
const V6 = [
  ['Podemos cambiar mañana a las 18 en vez de las 16?'],
  ['30 min más tarde si te va bien?'],
  ['Puedo a las 20 mejor mañana?'],
  ['Podemos atrasar 15 min mañana?'],
  ['Acomódame mejor a las 19'],
  ['Puedo mañana más tarde?'],
  ['Mejor a las 17 que a las 16 mañana?'],
  ['A las 18 en vez de las 16, mismo día?'],
  ['Misma fecha pero a las 19 mejor'],
  ['Mañana a las 18:30 puedes?'],
  // Multi-msg
  ['Hola', 'Mañana sí pero podemos cambiar hora?', 'A las 19 mejor'],
  ['Perdona', 'Misma fecha pero diferente hora?', 'A las 18 me cuadra'],
  // Variantes
  ['Tengo reunión hasta las 17, podemos a las 18 mañana?'],
  ['Trabajo me apretó, podemos atrasar a las 19 misma fecha?'],
  ['Mejor por la noche que por la tarde, sigue siendo mañana?'],
];
for (let i = 0; i < V6.length; i++) {
  cases.push(mkCase(`V6-${String(i + 1).padStart(3, '0')}`, 'V6', V6[i], 'no_action'));
}

// =============================================================================
// V7 — Retrasos con cualificador (15 cases) → no_action
// =============================================================================
const V7 = [
  ['Llego tarde mañana, 10 min'],
  ['No podré llegar a tiempo, me retraso 15 min'],
  ['Voy con 20 minutos de retraso mañana'],
  ['Llegaré tarde, unos 15 min'],
  ['Voy a llegar tarde por el tráfico, 15 min'],
  ['Puedo entrar 5 min tarde?'],
  ['No llego al inicio, entro a la mitad'],
  ['Me retraso 10 min'],
  ['No llegaré puntual, 10 min'],
  ['Llego 20 min tarde mañana'],
  // Multi-msg
  ['Hola', 'Llego tarde mañana', '10 min nada más'],
  ['Perdona', 'Voy a retrasarme', '15 minutos máximo'],
  // Variantes
  ['Estoy de camino, llego 5 min tarde'],
  ['Sigo en pie pero llego 15 min tarde mañana'],
  ['Voy mañana pero entro 10 min tarde, lo siento'],
];
for (let i = 0; i < V7.length; i++) {
  cases.push(mkCase(`V7-${String(i + 1).padStart(3, '0')}`, 'V7', V7[i], 'no_action'));
}

// =============================================================================
// V8 — Problemas técnicos (15 cases) → no_action
// Incluye nuevos términos: wifi, internet, cobertura, señal
// =============================================================================
const V8 = [
  ['No me funciona Zoom'],
  ['No puedo entrar al meet, dame otro link?'],
  ['No me carga la cámara'],
  ['Se me ha colgado el ordenador'],
  ['No me sale el link de la call'],
  // Nuevos términos red/internet
  ['No tengo wifi'],
  ['Se me ha caído internet'],
  ['No tengo cobertura ahora mismo'],
  ['Se me ha ido la señal'],
  ['Mi router está mal, no tengo red'],
  ['Me he quedado sin datos móviles'],
  // Multi-msg
  ['Hola', 'No puedo entrar al meet', 'Me da error el enlace'],
  ['Perdona', 'No tengo wifi de repente', 'Se me ha caído internet'],
  ['Espera', 'No tengo cobertura buena', 'Espera que cambio de sitio'],
  ['Aviso', 'Mi micrófono no funciona', 'Espera que reinicio'],
];
for (let i = 0; i < V8.length; i++) {
  cases.push(mkCase(`V8-${String(i + 1).padStart(3, '0')}`, 'V8', V8[i], 'no_action'));
}

// =============================================================================
// V9 — Rechazo total programa (10 cases) → cancel_no_followup
// =============================================================================
const V9 = [
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
for (let i = 0; i < V9.length; i++) {
  cases.push(mkCase(`V9-${String(i + 1).padStart(3, '0')}`, 'V9', V9[i], 'cancel_no_followup', { expectedIdsCount: 1 }));
}

// =============================================================================
// V10 — Cancel partial multi-cita (10 cases) → cancel_partial
// =============================================================================
const V10 = [
  ['Cancela solo la de mañana, la del jueves mantenla'],
  ['La de mañana no puedo, pero la siguiente sí'],
  ['Anula la primera, las otras déjalas'],
  ['Solo cancela mañana, las próximas están bien'],
  ['No puedo mañana pero el viernes sí, anula solo esa'],
  ['Mañana no puedo, las próximas mantenlas como están'],
  ['La de mañana cancélala, las otras no las toques'],
  // Multi-msg
  ['Hola', 'Solo cancela la de mañana', 'Las otras las mantengo'],
  ['Perdona', 'Anula la primera', 'Las próximas siguen en pie'],
  ['Hola Marcos', 'La del miércoles no puedo', 'Mantén la del viernes igual'],
];
for (let i = 0; i < V10.length; i++) {
  cases.push(mkCase(`V10-${String(i + 1).padStart(3, '0')}`, 'V10', V10[i], 'cancel_partial', { appointments: apts3, expectedIdsCount: 1 }));
}

// =============================================================================
// V11 — Confirmaciones simples (10 cases) → no_action
// =============================================================================
const V11 = [
  ['Sí, mañana ahí estaré'],
  ['Perfecto, allí estoy'],
  ['Confirmado, hablamos mañana'],
  ['Vale, ahí te leo'],
  ['Sí voy, gracias por avisar'],
  ['Sigue en pie mañana?'],
  ['Genial, ahí estaré sin falta'],
  ['Voy mañana fijo'],
  ['Recibido, ahí estoy'],
  ['Allí estaré, gracias por el recordatorio'],
];
for (let i = 0; i < V11.length; i++) {
  cases.push(mkCase(`V11-${String(i + 1).padStart(3, '0')}`, 'V11', V11[i], 'no_action'));
}

// =============================================================================
// V12 — Casos ambiguos / borderline (10 cases) → no_action por defecto
// =============================================================================
const V12 = [
  ['Vale'],
  ['Ok'],
  ['Mmmm'],
  ['Déjame pensarlo'],
  ['A ver qué pasa mañana'],
  ['Bueno'],
  ['Vamos a ver'],
  ['No sé qué decirte'],
  ['Pues no sé'],
  ['Te digo luego'],
];
for (let i = 0; i < V12.length; i++) {
  cases.push(mkCase(`V12-${String(i + 1).padStart(3, '0')}`, 'V12', V12[i], 'no_action'));
}

module.exports = cases;
