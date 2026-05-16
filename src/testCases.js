'use strict';

// ============================================================
// Test cases for the cancel-intent classifier.
// 23 categories, ~500 cases total. Each case has a `category` field
// so the runner can aggregate pass rates per category.
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

// ============================================================
// Helper functions
// ============================================================

// Lead-only message with optional outbound context just before
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

// Custom message exchange
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

// Post-reschedule-link pattern: lead message → coach link → lead reply
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
// G1 — CONFIRMACIONES SIMPLES (lead confirma asistencia)
// Expected: always no_action
// ============================================================
cases.push(
  leadOnly('G1-CONFIRM', 'G1-001-vale', 'vale', { expected: 'no_action', context: 'Recordatorio: mañana a las 18h tu llamada' }),
  leadOnly('G1-CONFIRM', 'G1-002-ok', 'ok', { expected: 'no_action', context: 'Confirmado para mañana' }),
  leadOnly('G1-CONFIRM', 'G1-003-perfecto', 'perfecto', { expected: 'no_action', context: 'Te recuerdo tu llamada de mañana' }),
  leadOnly('G1-CONFIRM', 'G1-004-genial', 'genial!', { expected: 'no_action', context: 'Confirmada tu llamada' }),
  leadOnly('G1-CONFIRM', 'G1-005-listo', 'listo', { expected: 'no_action', context: 'Quedamos mañana entonces' }),
  leadOnly('G1-CONFIRM', 'G1-006-ahi-estoy', 'ahí estoy!', { expected: 'no_action', context: 'Mañana a las 16h tu llamada' }),
  leadOnly('G1-CONFIRM', 'G1-007-nos-vemos', 'nos vemos mañana entonces', { expected: 'no_action', context: 'Confirmamos para mañana' }),
  leadOnly('G1-CONFIRM', 'G1-008-emoji-thumbs', '👍', { expected: 'no_action', context: 'Recordatorio de tu llamada' }),
  leadOnly('G1-CONFIRM', 'G1-009-emoji-check', '✅', { expected: 'no_action', context: 'Confirmada la cita' }),
  leadOnly('G1-CONFIRM', 'G1-010-emoji-fire', '🔥', { expected: 'no_action', context: 'Te paso el material de preparación' }),
  leadOnly('G1-CONFIRM', 'G1-011-sip', 'sip', { expected: 'no_action', context: 'Mañana hablamos a las 17' }),
  leadOnly('G1-CONFIRM', 'G1-012-si', 'sí', { expected: 'no_action', context: 'Sigue en pie para mañana?' }),
  leadOnly('G1-CONFIRM', 'G1-013-claro', 'claro que sí', { expected: 'no_action', context: 'Confirmamos para mañana' }),
  leadOnly('G1-CONFIRM', 'G1-014-dale', 'dale', { expected: 'no_action', context: 'Te paso el zoom mañana' }),
  leadOnly('G1-CONFIRM', 'G1-015-venga', 'venga, hasta mañana', { expected: 'no_action', context: 'Confirmada la llamada' }),
  leadOnly('G1-CONFIRM', 'G1-016-confirmado', 'confirmado', { expected: 'no_action', context: 'Recordatorio: llamada mañana' }),
  leadOnly('G1-CONFIRM', 'G1-017-anotado', 'anotado, gracias', { expected: 'no_action', context: 'Mañana a las 11h' }),
  leadOnly('G1-CONFIRM', 'G1-018-recibido', 'recibido!', { expected: 'no_action', context: 'Te paso el link de Zoom' }),
  leadOnly('G1-CONFIRM', 'G1-019-largo', 'Gracias por avisar, sí mañana estaré conectado a la hora que dijimos, nos vemos!', { expected: 'no_action', context: 'Recordatorio para mañana 18h' }),
  leadOnly('G1-CONFIRM', 'G1-020-yes', 'yes', { expected: 'no_action', context: 'See you tomorrow!' }),
  leadOnly('G1-CONFIRM', 'G1-021-mil-gracias', 'mil gracias, ahí estaré', { expected: 'no_action', context: 'Confirmada tu cita' }),
  leadOnly('G1-CONFIRM', 'G1-022-arriba', 'arriba esa llamada', { expected: 'no_action', context: 'Mañana lo damos todo' }),
  leadOnly('G1-CONFIRM', 'G1-023-doble-check', '✅✅', { expected: 'no_action', context: 'Confirmamos?' }),
  leadOnly('G1-CONFIRM', 'G1-024-vamos', 'vamos!', { expected: 'no_action', context: 'Recordatorio: mañana hablamos' }),
  leadOnly('G1-CONFIRM', 'G1-025-aqui-andamos', 'aquí andamos', { expected: 'no_action', context: 'Confirmada tu llamada' }),
);

// ============================================================
// G2 — CANCELACIONES CLARAS PRE-LINK (sin reschedule link)
// Expected: cancel_with_followup
// ============================================================
cases.push(
  leadOnly('G2-CANCEL-CLEAR', 'G2-001-no-puedo-manana', 'Marcos, no puedo ir mañana', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-002-no-podre-asistir', 'no podré asistir a la llamada', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-003-se-me-complica', 'se me complica la llamada de mañana', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-004-no-me-viene-bien', 'mañana no me viene bien', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-005-tengo-que-cancelar', 'tengo que cancelar la cita', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-006-no-voy-a-poder', 'al final no voy a poder', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-007-imposible-hoy', 'imposible hoy', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-008-no-puedo-ir', 'Marcos no puedo ir a la llamada', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-009-cancela-porfa', 'cancela la llamada por favor', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-010-no-puedo-hoy', 'hoy no puedo, surgió un imprevisto', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-011-anula', 'anula la llamada por favor', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-012-no-llego-llamada', 'no voy a llegar a la llamada', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-013-me-surgio-algo', 'me surgió algo en el trabajo, no puedo', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-014-no-llamada', 'no podré hacer la llamada hoy', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-015-perdona-cancela', 'perdona Marcos pero cancela', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-016-no-voy-poder', 'no voy a poder tener la llamada', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-017-me-cancelo', 'me cancelo lo de hoy', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-018-no-va-ser-posible', 'no va a ser posible hoy', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-019-cancela-cita', 'cancélame la cita', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-020-imposible-acudir', 'me es imposible acudir', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-021-no-puedo-asistir', 'finalmente no puedo asistir a la llamada', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-022-no-llego', 'al final no llego', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-023-tengo-imprevisto', 'tengo un imprevisto, no puedo conectarme', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-024-no-me-da-tiempo', 'no me va a dar tiempo a la llamada', { expected: 'cancel_with_followup' }),
  leadOnly('G2-CANCEL-CLEAR', 'G2-025-no-me-cuadra', 'no me cuadra la hora, tengo que cancelar', { expected: 'cancel_with_followup' }),
);

// ============================================================
// G3 — CANCELACIONES MÉDICAS
// Expected: cancel_with_followup with delay 3 (puntual) o 7 (serio)
// ============================================================
cases.push(
  leadOnly('G3-MEDICAL', 'G3-001-dolor-cabeza', 'tengo un dolor de cabeza horrible, no puedo hoy', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-002-mareado', 'estoy mareado, no creo que pueda hablar', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-003-resfriado', 'estoy resfriado, mejor lo dejamos para más tarde', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-004-gripe-fuerte', 'tengo gripe fuerte, llevo en cama 3 días', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G3-MEDICAL', 'G3-005-hospital-familiar', 'mi madre está en el hospital, no puedo hoy', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G3-MEDICAL', 'G3-006-urgencia-hijo', 'mi hijo se ha puesto malo, tengo que llevarlo al médico', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-007-cita-medico', 'me sale ahora una cita médica de urgencia', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-008-fiebre', 'tengo 38 de fiebre, no estoy fino', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-009-operacion', 'me operan mañana, voy a estar fuera de juego una semana', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G3-MEDICAL', 'G3-010-covid', 'he dado positivo en covid, me quedo en casa', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G3-MEDICAL', 'G3-011-malestar', 'no me siento bien hoy, mejor otro día', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-012-recuperacion', 'estoy recuperándome de una operación, dame unos días', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G3-MEDICAL', 'G3-013-colico', 'tengo un cólico nefrítico, voy al hospital', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G3-MEDICAL', 'G3-014-migrana', 'me ha entrado una migraña tremenda, no puedo mirar pantallas', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-015-medico-familia', 'tengo a mi padre delicado, no me sale del hospital', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G3-MEDICAL', 'G3-016-ansiedad', 'estoy con un ataque de ansiedad fuerte, no me veo capaz hoy', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-017-medico-pruebas', 'tengo pruebas médicas esta semana, va a ser imposible', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G3-MEDICAL', 'G3-018-vomitos', 'llevo todo el día vomitando, no puedo', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G3-MEDICAL', 'G3-019-baja-medica', 'estoy de baja médica, voy a estar fuera mínimo una semana', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G3-MEDICAL', 'G3-020-dolor-espalda', 'me he hecho daño en la espalda, no puedo ni sentarme', { expected: 'cancel_with_followup', delay: 3 }),
);

// ============================================================
// G4 — VIAJES Y AGENDA CARGADA
// Expected: cancel_with_followup (mayoritariamente delay 7)
// ============================================================
cases.push(
  leadOnly('G4-TRAVEL', 'G4-001-viaje-trabajo', 'estoy de viaje de trabajo toda la semana', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-002-semana-fatal', 'esta semana fatal, imposible', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-003-vuelo', 'tengo un vuelo justo a esa hora', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G4-TRAVEL', 'G4-004-conferencia', 'estoy en una conferencia esta semana, no puedo', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-005-vacaciones', 'me voy de vacaciones, volvemos cuando vuelva', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-006-boda', 'tengo una boda esta semana, va a ser imposible', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-007-mudanza', 'estoy de mudanza todo el fin de semana, hablamos la próxima', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-008-viaje-familiar', 'estoy de viaje familiar, regreso el domingo', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-009-trabajo-intenso', 'esta semana voy a tope con cierre de trimestre, imposible', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-010-evento', 'tengo un evento ese día, no puedo', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G4-TRAVEL', 'G4-011-curso', 'estoy en un curso intensivo toda la semana', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-012-coche-talleer', 'me ha pasado lo del coche y voy a estar liado todo el día', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G4-TRAVEL', 'G4-013-fuera-ciudad', 'estoy fuera de la ciudad, vuelvo el viernes', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-014-cumpleanos', 'es el cumpleaños de mi hija ese día', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G4-TRAVEL', 'G4-015-aeropuerto', 'me pilla en el aeropuerto a esa hora', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G4-TRAVEL', 'G4-016-reunion-jefe', 'me ha entrado una reunión con mi jefe a la misma hora', { expected: 'cancel_with_followup' }),
  leadOnly('G4-TRAVEL', 'G4-017-fin-semana-fuera', 'estoy fuera todo el fin de semana', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-018-trabajo-overtime', 'me toca quedarme hasta tarde currando, imposible', { expected: 'cancel_with_followup' }),
  leadOnly('G4-TRAVEL', 'G4-019-funeral', 'tengo un funeral mañana, no puedo', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G4-TRAVEL', 'G4-020-evento-largo', 'me ha salido un evento largo que dura toda la semana, hablamos la siguiente', { expected: 'cancel_with_followup', delay: 7 }),
);

// ============================================================
// G5 — CANCELACIONES DURAS / RECHAZO DEL PROGRAMA
// Expected: cancel_no_followup
// ============================================================
cases.push(
  leadOnly('G5-HARD-CANCEL', 'G5-001-no-interesa', 'ya no me interesa', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-002-voy-con-otro', 'voy a tirar con otro entrenador', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-003-quitame-lista', 'quítame de la lista por favor', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-004-no-contactes', 'no me contactes más', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-005-dejame-paz', 'déjame en paz', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-006-borra-datos', 'borra mis datos por favor', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-007-perdi-interes', 'la verdad es que perdí el interés', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-008-no-sigamos', 'mejor no sigamos con esto', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-009-otro-coach', 'he decidido irme con otro coach', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-010-no-molestes', 'por favor no me molestes más', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-011-entrenador-ciudad', 'al final voy a tirar con un entrenador presencial de mi ciudad. Gracias.', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-012-no-spam', 'deja de mandarme mensajes', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-013-cambie-opinion', 'he cambiado de opinión, no me interesa el programa', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-014-suscripcion', 'cancela mi suscripción a tus mensajes', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-015-borrame', 'bórrame de tu lista de contactos', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-016-no-quiero-saber', 'no quiero saber nada más, gracias', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-017-paso-completo', 'paso completamente del tema, gracias por entender', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-018-no-interesa-largo', 'mira Marcos te agradezco todo pero al final ya no me interesa, prefiero seguir por mi cuenta', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-019-otra-agencia', 'voy a empezar con otra agencia, gracias', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-020-no-me-llames', 'no me llames más por favor', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-021-stop', 'STOP', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-022-baja', 'date de baja mi número de tu sistema', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-023-no-vale-pena', 'no me vale la pena, gracias', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-024-cancelo-todo', 'cancelo todo contigo, gracias', { expected: 'cancel_no_followup' }),
  leadOnly('G5-HARD-CANCEL', 'G5-025-prefiero-solo', 'prefiero hacerlo solo, no me contactes más', { expected: 'cancel_no_followup' }),
);

// ============================================================
// G6 — PREGUNTAS OPERATIVAS (no cancelación, son preguntas)
// Expected: no_action
// ============================================================
cases.push(
  leadOnly('G6-QUESTIONS', 'G6-001-zoom-meet', 'la llamada es por Zoom o Meet?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-002-hora', 'oye Marcos a qué hora era?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-003-sigue-pie', 'sigue en pie lo de hoy?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-004-confirma', 'confírmame que tenemos llamada hoy porfa', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-005-link', 'me pasas el link de la llamada?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-006-duracion', 'cuánto dura la llamada?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-007-preparar', 'tengo que preparar algo?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-008-mi-numero', 'me puedes llamar al móvil?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-009-alguien-mas', 'vendrá alguien más a la llamada?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-010-grabacion', 'se graba la llamada?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-011-camara', 'la llamada es con cámara?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-012-recordatorio', 'me mandas un recordatorio antes?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-013-zoom-nuevo', 'me has mandado el zoom nuevo?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-014-cuanta-gente', 'cuánta gente hay en el grupo?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-015-mis-datos', 'puedo usar mis datos del año pasado?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-016-precio', 'qué precio tiene el programa?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-017-pago', 'cómo se hace el pago?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-018-duda-formato', 'cuál es el formato de la llamada exactamente?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-019-grupo', 'la llamada es 1 a 1 o en grupo?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-020-quien-llamada', 'con quién voy a hablar exactamente?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-021-pre-llamada', 'hay algo que tenga que mirar antes de la llamada?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-022-cancelar-cuando', 'si tuviera que cancelar, hasta cuándo puedo avisar?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-023-confirmacion', 'recibiste mi confirmación?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-024-faltan-horas', 'cuántas horas faltan para la llamada?', { expected: 'no_action' }),
  leadOnly('G6-QUESTIONS', 'G6-025-dudas-pre', 'tengo unas dudas antes de la llamada, te las pongo aquí o las dejamos para entonces?', { expected: 'no_action' }),
);

// ============================================================
// G7 — CAMBIOS DE HORA DEL MISMO DÍA (NO es cancelación)
// Expected: no_action (lead solo quiere ajustar hora con el coach humano)
// ============================================================
cases.push(
  leadOnly('G7-TIME-TWEAK', 'G7-001-mas-tarde', 'podemos hacerla a las 18 en vez de las 16?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-002-mas-temprano', 'puedo conectarme media hora antes?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-003-otro-rato', 'oye nos vemos un rato más tarde si puedes', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-004-30-min', 'me viene mejor 30 min más tarde si te va bien', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-005-1830', 'podemos a las 18:30 en vez de a las 18?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-006-pum-tarde', 'puedo a las 20 mejor?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-007-ajuste-15min', 'puedo retrasar 15 minutos?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-008-cambiar-hora', 'me pasas a otra hora del mismo día?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-009-quedamos-luego', 'quedamos a las 21 en vez de a las 19', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-010-otro-rato-dia', 'podemos hacer la llamada en otro rato hoy?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-011-no-19-si-20', 'no puedo a las 19 pero sí a las 20', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-012-puedes-1430', 'puedes hoy a las 14:30 en vez de 14?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-013-poco-mas-tarde', 'podemos hacerla un poco más tarde?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-014-temprano-noche', 'mejor a las 20 que a las 17?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-015-cambia-horario', 'cambiamos a la noche en vez de la tarde?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-016-cuarto-hora', 'podemos atrasar 15min?', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-017-tarde-yo-puedo', 'a la tarde sí pero a esa hora no', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-018-momento-flexible', 'puedo a las 16, 17 o 18, lo que mejor te venga', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-019-acomodame', 'acomódame mejor a las 19 si te va bien', { expected: 'no_action' }),
  leadOnly('G7-TIME-TWEAK', 'G7-020-vamos-luego', 'mejor vamos un par de horas después?', { expected: 'no_action' }),
);

// ============================================================
// G8 — POST-LINK ACEPTACIÓN
// Expected: cancel_with_followup (lead acepta el reagendar)
// ============================================================
cases.push(
  postLink('G8-LINK-ACCEPT', 'G8-001-vale-gracias', 'no sé si podré asistir', 'vale gracias!', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-002-lo-cambio', 'tengo lío esta tarde', 'genial, lo cambio ahora mismo, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-003-perfecto', 'va a ser complicado', 'perfecto, ahora reagendo', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-004-dame-el', 'no podré a esa hora', 'dame', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-005-miro-reagendo', 'me complica el día', 'miro y reagendo, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-006-genial-gracias', 'no me viene bien hoy', 'genial gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-007-cuando-pueda', 'no sé si llego', 'vale cuando pueda reagendo', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-008-ya-cambio', 'imposible hoy', 'ya cambio la cita, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-009-mil-gracias', 'no puedo a esa hora', 'mil gracias, reagendo ahora', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-010-le-doy', 'lo dejamos?', 'le doy, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-011-cambiando', 'no podré ir', 'cambiando ahora, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-012-ya-reagende', 'me surge algo', 'ya reagendé, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-013-hecho', 'mejor más tarde', 'hecho, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-014-reagendo-yo', 'no creo que pueda', 'lo reagendo yo, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-015-cambio-fecha', 'esa fecha no me viene', 'cambio la fecha, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-016-mejor-asi', 'no llego', 'mejor así, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-017-bingo', 'no puedo asistir', 'bingo, lo cambio', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-018-genial-cambio', 'mejor reagendamos', 'genial, cambio ahora mismo', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-019-paso-cambio', 'no podré llamarte', 'paso a cambiarla, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-020-okk-cambio', 'no me viene bien', 'okk, cambio ahora', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-021-eso-es', 'lo dejamos para otro día', 'eso es, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-022-perfecto-cambio', 'no puedo hoy', 'perfecto, cambio para mañana', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-023-buscare-hueco', 'imposible esta semana', 'buscaré hueco, gracias', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-024-gracias-cambio', 'no podré', 'gracias, cambio ahora', { expected: 'cancel_with_followup' }),
  postLink('G8-LINK-ACCEPT', 'G8-025-thanks-lo-veo', 'cancelo', 'thanks, lo miro ya', { expected: 'cancel_with_followup' }),
);

// ============================================================
// G9 — POST-LINK RECHAZO (lead reafirma asistencia)
// Expected: no_action
// ============================================================
cases.push(
  postLink('G9-LINK-REJECT', 'G9-001-si-puedo', 'no sé si podré', 'vale sí puedo asistir', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-002-al-final-voy', 'no sé si llego', 'al final sí voy, gracias', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-003-dejalo-ire', 'va estar dificil', 'no no, déjalo, iré', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-004-olvidalo', 'no podré', 'olvídalo, sí voy', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-005-final-asisto', 'no me cuadra', 'al final sí asisto', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-006-tranquilo-voy', 'duda asistir', 'tranquilo, voy', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-007-resuelto', 'igual no llego', 'al final lo resolví, voy', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-008-no-cambies', 'no podré ir', 'no, no cambies nada, sí puedo', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-009-puedo-final', 'no creo que pueda', 'sí puedo al final', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-010-ire-tranquilo', 'no llego', 'iré, tranquilo', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-011-voy-sin-problema', 'no me viene', 'no, voy sin problema', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-012-no-hay-cambios', 'no podré', 'no hay cambios, voy', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-013-asisto-llamada', 'imposible hoy', 'al final sí asisto a la llamada', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-014-mejor-dejalo', 'mejor reagendamos', 'no espera mejor déjalo, sí puedo', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-015-no-hace-falta', 'no podre llamada', 'no hace falta cambiarla, voy', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-016-yo-mantengo', 'no creo que vaya', 'mantengo la cita, gracias', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-017-no-no-voy-yo', 'cancelo', 'no, no, sí voy', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-018-iremos', 'no podemos quedar', 'iremos, no te preocupes', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-019-confirma-voy', 'mejor cancela', 'confirma la cita que sí voy', { expected: 'no_action' }),
  postLink('G9-LINK-REJECT', 'G9-020-todo-sigue', 'no llego', 'no, todo sigue igual, iré', { expected: 'no_action' }),
);

// ============================================================
// G10 — POST-LINK AMBIGUO (silencio o respuesta confusa)
// Expected: no_action (NUNCA asumir aceptación por silencio)
// ============================================================
cases.push(
  postLink('G10-LINK-AMBIG', 'G10-001-vale-solo', 'no sé', 'vale', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-002-ok-solo', 'no sé si llegaré', 'ok', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-003-gracias-solo', 'no podré', 'gracias', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-004-pensarlo', 'tengo dudas', 'déjame pensarlo y te digo', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-005-luego-te-digo', 'no sé', 'luego te digo', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-006-ahora-miro', 'duda', 'ahora miro', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-007-mmm', 'no sé', 'mmm', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-008-okey', 'igual no llego', 'okey', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-009-emoji-pensativo', 'no sé', '🤔', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-010-veo', 'no podré', 'veo', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-011-ya', 'no sé si llego', 'ya', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-012-ok-ya-te-digo', 'va estar dificil', 'ok ya te digo', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-013-ahora-veo', 'igual cancelo', 'ahora veo', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-014-luego-miro', 'no podré', 'luego miro a ver', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-015-mas-tarde', 'mejor reagendar', 'te digo más tarde', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-016-vale-pensare', 'duda asistir', 'vale lo pensaré', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-017-no-se-aun', 'no sé', 'no sé aún', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-018-ya-vere', 'igual no voy', 'ya veré', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-019-ahora-no-puedo-ver', 'no sé si llego', 'ahora no puedo mirarlo', { expected: 'no_action' }),
  postLink('G10-LINK-AMBIG', 'G10-020-luego-decido', 'imposible', 'luego decido', { expected: 'no_action' }),
);

// ============================================================
// G11 — MÚLTIPLES CITAS - CANCEL PARTIAL
// Expected: cancel_partial (lead especifica solo algunas)
// ============================================================
cases.push(
  exchange('G11-PARTIAL', 'G11-001-solo-martes', {
    messages: [
      { direction: 'outbound', body: 'Tienes 2 llamadas, martes y jueves', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'cancela solo la del martes, la del jueves la mantengo', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-002-mantengo-jueves', {
    messages: [
      { direction: 'outbound', body: 'Te recuerdo: martes y jueves', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'la del jueves mantén, cancela la del martes', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-003-primera', {
    messages: [
      { direction: 'outbound', body: 'Llamadas martes y jueves', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'cancela la primera, la segunda voy', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-004-jueves-no-puedo', {
    messages: [
      { direction: 'outbound', body: 'Recuerda tus 2 llamadas (martes y jueves)', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'martes voy pero jueves no podré', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-005-solo-una', {
    messages: [
      { direction: 'outbound', body: '2 llamadas agendadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'anula solo una, la del lunes', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-006-de-3-una', {
    messages: [
      { direction: 'outbound', body: 'Tienes 3 llamadas agendadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'cancela solo la del lunes, las otras voy', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2, APT_3], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-007-de-3-dos', {
    messages: [
      { direction: 'outbound', body: 'Tienes 3 llamadas: lunes, miércoles y viernes', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'cancela la del lunes y la del viernes, la del miércoles sí voy', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2, APT_3], expected: 'cancel_partial', ids: 2,
  }),
  exchange('G11-PARTIAL', 'G11-008-fecha-especifica', {
    messages: [
      { direction: 'outbound', body: 'Llamadas: día 17 y día 19', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'cancela la del 17, la del 19 mantén', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-009-segunda-no', {
    messages: [
      { direction: 'outbound', body: 'Recuerda las 2 llamadas que tienes', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'la segunda no puedo, la primera sí', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-010-otra-vez-mismo', {
    messages: [
      { direction: 'outbound', body: 'Tienes llamada mañana y otra el viernes', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'la de mañana voy, la del viernes cancela', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-011-cualquier-no-todas', {
    messages: [
      { direction: 'outbound', body: '2 llamadas: martes y jueves', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'no puedo el martes, déjame solo la del jueves', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-012-mantengo-una', {
    messages: [
      { direction: 'outbound', body: 'Recuerda tus 2 llamadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'mantengo solo la del jueves, la otra cancela', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-013-anula-mejor', {
    messages: [
      { direction: 'outbound', body: '2 calls programadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'anula mejor la del lunes y voy a la otra', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-014-no-puedo-una-de-2', {
    messages: [
      { direction: 'outbound', body: 'Tienes 2 cositas agendadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'no puedo a una de las 2, la del martes mejor cancela', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-015-cancela-una-mantengo-otra', {
    messages: [
      { direction: 'outbound', body: 'Llamadas: mañana y pasado', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'cancela una y dejo la otra activa, la de pasado', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-016-mantengo-segunda-anula-primera', {
    messages: [
      { direction: 'outbound', body: 'Tu agenda: mañana 16h y jueves 18h', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'mantengo la de jueves, la de mañana anúlala', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-017-cancela-la-segunda', {
    messages: [
      { direction: 'outbound', body: '2 llamadas confirmadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'puedes cancelar la segunda? La primera sí puedo', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-018-quita-solo-una', {
    messages: [
      { direction: 'outbound', body: '2 sesiones programadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'quita solo una, la primera, la segunda sí voy', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-019-conservo-segunda', {
    messages: [
      { direction: 'outbound', body: 'Recordatorio: 2 llamadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'conservo la segunda, cancela la primera', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
  exchange('G11-PARTIAL', 'G11-020-solo-cancelo-1', {
    messages: [
      { direction: 'outbound', body: 'Llamadas: 17 abril y 24 abril', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'solo cancelo la del 17, la del 24 voy', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_partial', ids: 1,
  }),
);

// ============================================================
// G12 — MÚLTIPLES CITAS - CANCEL TODAS
// Expected: cancel_with_followup, todos los IDs
// ============================================================
cases.push(
  exchange('G12-BOTH', 'G12-001-cancela-2', {
    messages: [
      { direction: 'outbound', body: 'Tienes 2 llamadas agendadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'cancela las dos por favor', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', ids: 2,
  }),
  exchange('G12-BOTH', 'G12-002-no-puedo-ninguna', {
    messages: [
      { direction: 'outbound', body: '2 llamadas confirmadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'no puedo a ninguna, esta semana imposible', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', delay: 7, ids: 2,
  }),
  exchange('G12-BOTH', 'G12-003-anula-todas', {
    messages: [
      { direction: 'inbound', body: 'anula todas las llamadas que tengo', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2, APT_3], expected: 'cancel_with_followup', ids: 3,
  }),
  exchange('G12-BOTH', 'G12-004-cancela-todo', {
    messages: [
      { direction: 'inbound', body: 'cancela todo, esta semana imposible', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', delay: 7, ids: 2,
  }),
  exchange('G12-BOTH', 'G12-005-no-llego-ninguna', {
    messages: [
      { direction: 'outbound', body: '2 llamadas programadas', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'no llego a ninguna, perdona', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', ids: 2,
  }),
  exchange('G12-BOTH', 'G12-006-cancela-todas', {
    messages: [
      { direction: 'inbound', body: 'cancela todas mis llamadas por favor', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', ids: 2,
  }),
  exchange('G12-BOTH', 'G12-007-imposible-todo', {
    messages: [
      { direction: 'inbound', body: 'imposible mantener ninguna llamada esta semana', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', delay: 7, ids: 2,
  }),
  exchange('G12-BOTH', 'G12-008-anula-todo', {
    messages: [
      { direction: 'inbound', body: 'anula todo, gracias', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', ids: 2,
  }),
  exchange('G12-BOTH', 'G12-009-cancela-citas', {
    messages: [
      { direction: 'inbound', body: 'tienes que cancelar mis citas, no voy a poder', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2, APT_3], expected: 'cancel_with_followup', ids: 3,
  }),
  exchange('G12-BOTH', 'G12-010-borra-llamadas', {
    messages: [
      { direction: 'inbound', body: 'borra todas mis llamadas activas', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', ids: 2,
  }),
  exchange('G12-BOTH', 'G12-011-no-asisto-nada', {
    messages: [
      { direction: 'inbound', body: 'no voy a asistir a nada esta semana', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', delay: 7, ids: 2,
  }),
  exchange('G12-BOTH', 'G12-012-las-dos-cancelar', {
    messages: [
      { direction: 'inbound', body: 'las dos llamadas las tengo que cancelar', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', ids: 2,
  }),
  exchange('G12-BOTH', 'G12-013-quita-todo', {
    messages: [
      { direction: 'inbound', body: 'quita todo de mi calendario, hablamos otra semana', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', delay: 7, ids: 2,
  }),
  exchange('G12-BOTH', 'G12-014-cancela-3', {
    messages: [
      { direction: 'inbound', body: 'cancela las 3 llamadas porfa, no puedo esta semana', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2, APT_3], expected: 'cancel_with_followup', delay: 7, ids: 3,
  }),
  exchange('G12-BOTH', 'G12-015-no-voy-ninguna', {
    messages: [
      { direction: 'inbound', body: 'no voy a ir a ninguna, cancela todo', dateAdded: mkTs(2) },
    ],
    apts: [APT_1, APT_2], expected: 'cancel_with_followup', ids: 2,
  }),
);

// ============================================================
// G13 — FLIP-FLOP (cambios de opinión en ráfaga)
// Final state determines the expected intent
// ============================================================
cases.push(
  exchange('G13-FLIP-FLOP', 'G13-001-cancel-then-go', {
    messages: [
      { direction: 'inbound', body: 'no creo que pueda', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'ah espera sí, voy', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-002-go-then-cancel', {
    messages: [
      { direction: 'inbound', body: 'ahí estoy', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'no espera, al final no puedo', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G13-FLIP-FLOP', 'G13-003-triple-flip-end-go', {
    messages: [
      { direction: 'inbound', body: 'no puedo', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'sí puedo', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'no, mejor lo dejo', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'no espera, vale, al final voy sí', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-004-triple-flip-end-cancel', {
    messages: [
      { direction: 'inbound', body: 'sí voy', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'ah no, no podré', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'espera sí puedo', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'no, ya definitivo, no puedo, cancela', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G13-FLIP-FLOP', 'G13-005-cancel-go-cancel', {
    messages: [
      { direction: 'inbound', body: 'cancela', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'no espera, sí voy', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'no, mejor cancela definitivo', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G13-FLIP-FLOP', 'G13-006-pensandolo', {
    messages: [
      { direction: 'inbound', body: 'no sé si ir', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'me lo pienso un momento', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'pues nada, voy a ir, ahí estaré', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-007-doble-no-puedo', {
    messages: [
      { direction: 'inbound', body: 'creo que no podré', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'sí, definitivo, no voy a poder', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G13-FLIP-FLOP', 'G13-008-dudoso-final-confirmo', {
    messages: [
      { direction: 'inbound', body: 'me lo pienso', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'no sé', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'al final voy, gracias', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-009-no-no-si', {
    messages: [
      { direction: 'inbound', body: 'no puedo asistir hoy', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'ah espera, sí puedo, voy', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-010-si-no-final', {
    messages: [
      { direction: 'inbound', body: 'voy', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'no espera, no puedo, cancela', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G13-FLIP-FLOP', 'G13-011-confirm-doubt-confirm', {
    messages: [
      { direction: 'inbound', body: 'vale ahí estoy', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'oye no sé si llego', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'no nada, voy, hasta ahora', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-012-final-cancel-firm', {
    messages: [
      { direction: 'inbound', body: 'sí voy', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'no espera', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'me lo pienso', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'finalmente no voy a poder, cancela', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G13-FLIP-FLOP', 'G13-013-flip-with-context', {
    messages: [
      { direction: 'outbound', body: 'Mañana hablamos a las 18h', dateAdded: mkTs(60) },
      { direction: 'inbound', body: 'me sale algo del trabajo, no creo que pueda', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'ah no espera, lo gestiono y puedo, voy', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-014-flip-end-medical', {
    messages: [
      { direction: 'inbound', body: 'voy a ir mañana', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'ay no, me siento mal, mejor cancela', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup', delay: 3,
  }),
  exchange('G13-FLIP-FLOP', 'G13-015-trompeo-mantengo', {
    messages: [
      { direction: 'inbound', body: 'cancela', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'no espera mantén', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'no mejor cancela', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'no no, mantén, voy a ir', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-016-multiple-fija-cancela', {
    messages: [
      { direction: 'inbound', body: 'voy', dateAdded: mkTs(40) },
      { direction: 'inbound', body: 'voy fijo', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'ah no, me ha surgido algo, cancela', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G13-FLIP-FLOP', 'G13-017-cancela-puedo-cancela-puedo', {
    messages: [
      { direction: 'inbound', body: 'no puedo', dateAdded: mkTs(40) },
      { direction: 'inbound', body: 'espera sí puedo', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'no, no puedo', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'sí puedo, definitivo', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G13-FLIP-FLOP', 'G13-018-doble-cancela-firm', {
    messages: [
      { direction: 'inbound', body: 'cancela porfa', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'sí, cancela definitivo, no voy a poder esta semana', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup', delay: 7,
  }),
  exchange('G13-FLIP-FLOP', 'G13-019-medio-flip-no-cambia', {
    messages: [
      { direction: 'inbound', body: 'no puedo hoy', dateAdded: mkTs(40) },
      { direction: 'inbound', body: 'mañana sí puedo no?', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'no espera, no, ni hoy ni mañana, cancela', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G13-FLIP-FLOP', 'G13-020-fluctua-final-confirm', {
    messages: [
      { direction: 'inbound', body: 'no creo que pueda', dateAdded: mkTs(50) },
      { direction: 'inbound', body: 'estoy mirando', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'ya, sí, sí puedo, allí nos vemos', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
);

// ============================================================
// G14 — AUDIOS Y MEDIA
// ============================================================
cases.push(
  exchange('G14-MEDIA', 'G14-001-audio-only', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/voice.mp4'], dateAdded: mkTs(2) }],
    expected: 'audio_needs_review',
  }),
  exchange('G14-MEDIA', 'G14-002-audio-only-ogg', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/audio.ogg'], dateAdded: mkTs(2) }],
    expected: 'audio_needs_review',
  }),
  exchange('G14-MEDIA', 'G14-003-image-only', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/photo.jpg'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-004-image-png', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/screenshot.png'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-005-document', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/doc.pdf'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-006-image-then-text-cancel', {
    messages: [
      { direction: 'inbound', body: '', attachments: ['https://example.com/photo.jpg'], dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'no podré ir a la llamada', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G14-MEDIA', 'G14-007-image-then-confirm', {
    messages: [
      { direction: 'inbound', body: '', attachments: ['https://example.com/photo.jpg'], dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'ahí estaré, gracias', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-008-multiple-images-only', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/1.jpg', 'https://example.com/2.jpg'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-009-pdf-with-text', {
    messages: [{ direction: 'inbound', body: 'no podré, mira el adjunto', attachments: ['https://example.com/doc.pdf'], dateAdded: mkTs(2) }],
    expected: 'cancel_with_followup',
  }),
  exchange('G14-MEDIA', 'G14-010-image-with-text-confirm', {
    messages: [{ direction: 'inbound', body: 'aquí mi info, ahí estaré', attachments: ['https://example.com/info.jpg'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-011-sticker-only', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/sticker.webp'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-012-gif-only', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/gif.gif'], dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-013-mp3-audio', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/audio.mp3'], dateAdded: mkTs(2) }],
    expected: 'audio_needs_review',
  }),
  exchange('G14-MEDIA', 'G14-014-instagram-mp4', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://ig.example.com/voice.mp4'], dateAdded: mkTs(2) }],
    expected: 'audio_needs_review',
  }),
  exchange('G14-MEDIA', 'G14-015-after-audio-then-text-cancel', {
    messages: [
      { direction: 'inbound', body: '', attachments: ['https://example.com/voice.mp4'], dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'no voy a poder ir', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G14-MEDIA', 'G14-016-after-audio-then-text-confirm', {
    messages: [
      { direction: 'inbound', body: '', attachments: ['https://example.com/voice.mp4'], dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'ahí estaré', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-017-multiple-attachments-no-text', {
    messages: [{ direction: 'inbound', body: '', attachments: ['https://example.com/1.jpg', 'https://example.com/voice.mp4'], dateAdded: mkTs(2) }],
    expected: 'audio_needs_review',
  }),
  exchange('G14-MEDIA', 'G14-018-link-only', {
    messages: [{ direction: 'inbound', body: 'https://something.com/link', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-019-emoji-only-positive', {
    messages: [{ direction: 'inbound', body: '😊', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G14-MEDIA', 'G14-020-emoji-only-negative', {
    messages: [{ direction: 'inbound', body: '😢', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
);

// ============================================================
// G15 — COLOQUIAL / TYPOS / JERGA
// Expected: Should still classify correctly
// ============================================================
cases.push(
  leadOnly('G15-COLOQUIAL', 'G15-001-noay-manera', 'mañana noay manera de q vaya', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-002-no-puedoo', 'marcos no puedoo ir tio', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-003-ke-no-puedo', 'ke no puedo ir tioo', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-004-xfaaa', 'xfaa cancelaaa', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-005-porfa-cancelame', 'porfa cancelame', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-006-ya-no', 'ya no', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-007-tio-paso', 'tio paso de esto, gracias', { expected: 'cancel_no_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-008-no-llga', 'no llga', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-009-cncl', 'cncl', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-010-mr-no-puedo', 'mr no puedo', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-011-tas-loco', 'tas loco si crees que voy a esa hora bro', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-012-noo-pueod', 'noo pueod', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-013-na-na', 'na na, dejalo bro', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-014-vsa-cancela', 'vsa, cancela la llamada', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-015-ahi-mismo', 'ahi mismo, vamos', { expected: 'no_action', context: 'Mañana a las 18' }),
  leadOnly('G15-COLOQUIAL', 'G15-016-grcs', 'grcs tio, ahi estoy', { expected: 'no_action', context: 'Recordatorio mañana' }),
  leadOnly('G15-COLOQUIAL', 'G15-017-perfectooo', 'perfectoooo nos vmos manana', { expected: 'no_action', context: 'Confirmamos para mañana' }),
  leadOnly('G15-COLOQUIAL', 'G15-018-cmpadre', 'cmpadre no voy a llegar', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-019-jefee', 'jefee se me complica, mañana imposible', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-020-na-paso', 'na, paso de la llamada', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-021-no-soy-capaz', 'no soy capaz de mantenerla esta vez tio', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-022-llmd', 'cncl la llmd porfa', { expected: 'cancel_with_followup' }),
  leadOnly('G15-COLOQUIAL', 'G15-023-noses', 'noses si llgo', { expected: 'no_action' }),
  leadOnly('G15-COLOQUIAL', 'G15-024-jajaja', 'jajaja vale ahi estoy', { expected: 'no_action', context: 'Confirmamos?' }),
  leadOnly('G15-COLOQUIAL', 'G15-025-x-favorr', 'cncl x favorrr', { expected: 'cancel_with_followup' }),
);

// ============================================================
// G16 — REAGENDADO EXPLÍCITO (pidiendo nueva fecha)
// Expected: cancel_with_followup
// ============================================================
cases.push(
  leadOnly('G16-RESCHEDULE', 'G16-001-cambiar-jueves', 'podemos cambiarla para el jueves?', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-002-mejor-semana-prox', 'me viene mejor la semana que viene', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G16-RESCHEDULE', 'G16-003-pasar-lunes', 'podemos mover la llamada al lunes?', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G16-RESCHEDULE', 'G16-004-3-dias-mejor', 'mejor en 3 días si te va bien', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G16-RESCHEDULE', 'G16-005-viernes-mejor', 'mañana imposible, pasamos al viernes?', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-006-otro-dia', 'lo dejamos para otro día?', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-007-otra-semana', 'podemos hacerla la semana que viene?', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G16-RESCHEDULE', 'G16-008-reagendar', 'me reagendas la llamada por favor?', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-009-mover-fecha', 'puedes mover la fecha de la llamada?', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-010-cambiala-x-dia', 'cámbiamela para el martes que viene', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G16-RESCHEDULE', 'G16-011-bajar-dia-jueves', 'pásala al jueves mejor, mañana imposible', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-012-en-x-dias', 'la podemos hacer en 5 días?', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G16-RESCHEDULE', 'G16-013-quincena', 'mejor en 2 semanas?', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G16-RESCHEDULE', 'G16-014-poscamtienes', 'cuando tengas hueco, reagenda', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-015-corre-fecha', 'corre la fecha al lunes', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G16-RESCHEDULE', 'G16-016-aplaza', 'aplaza la llamada por favor', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-017-puedo-mas-tarde-semana', 'puedo más tarde de esta semana, hoy no', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-018-pasamos-jueves', 'pasamos al jueves, hoy imposible', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-019-otra-fecha', 'me pasas a otra fecha?', { expected: 'cancel_with_followup' }),
  leadOnly('G16-RESCHEDULE', 'G16-020-mover-3-dias', 'mejor en 3 días que hoy', { expected: 'cancel_with_followup', delay: 3 }),
);

// ============================================================
// G17 — MENSAJES MIXTOS (cancelación + pregunta, confirm + pregunta)
// ============================================================
cases.push(
  leadOnly('G17-MIXED', 'G17-001-cancel-cuando', 'no puedo mañana, cuándo podemos quedar?', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-002-confirm-cuanto-dura', 'sí voy, por cierto cuánto dura?', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-003-pregunta-confirma', 'es por Zoom no? Voy a estar listo', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-004-cancel-thanks', 'no podré ir, gracias por todo igualmente', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-005-confirm-link', 'ahí estoy, me pasas el link?', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-006-confirm-pregunta-tema', 'voy, qué tema vamos a ver?', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-007-cancel-disculpa', 'perdóname pero no puedo asistir hoy', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-008-cancel-pide-fecha', 'no puedo hoy, me das una nueva fecha?', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-009-confirm-cambia', 'voy, pero podemos hacerla 30min más tarde?', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-010-cancel-explica', 'no puedo, tengo trabajo, lo dejamos para otra ocasión', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-011-confirm-info', 'ahí estoy, me apunto algunas dudas?', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-012-cancel-pide-info', 'cancela porfa, y dime qué precio tiene el programa', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-013-confirm-mejor-otra-hora', 'voy, pero mejor si fuera más tarde', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-014-cancel-vergüenza', 'perdón, no puedo ir, me sabe mal', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-015-pregunta-cancela', 'me podrías decir el precio? Si es muy caro cancelo la llamada', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-016-cancel-pero-interesado', 'no puedo mañana pero sigo interesado, cuándo podemos?', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-017-confirm-pregunta-larga', 'sí voy mañana. Por cierto tengo varias preguntas sobre el plan que me explicaste, podemos verlas en la call?', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-018-cancel-justifica-largo', 'tengo que cancelar mañana porque me ha entrado una reunión de última hora con un cliente, lo siento mucho, podemos para el viernes?', { expected: 'cancel_with_followup' }),
  leadOnly('G17-MIXED', 'G17-019-confirm-saludo', 'hola Marcos! Sí mañana ahí estaré, un saludo', { expected: 'no_action' }),
  leadOnly('G17-MIXED', 'G17-020-pregunta-detalle', 'oye, llevo el ordenador o con el móvil basta?', { expected: 'no_action' }),
);

// ============================================================
// G18 — EDGE CASES CONFIDENCE (casos límite, ambiguos)
// ============================================================
cases.push(
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-001-veremos', 'veremos a ver si puedo', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-002-igual-no', 'igual no llego a tiempo', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-003-no-aseguro', 'no te aseguro nada', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-004-intento', 'intento estar pero no prometo', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-005-vere-si', 'veré si puedo, te confirmo en un rato', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-006-50-50', '50/50 ahora mismo', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-007-eh-eh', 'eh no sé eh', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-008-creo-que-puedo', 'creo que puedo, ya te confirmo', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-009-igual-luego', 'igual te aviso luego si llego', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-010-quizas', 'quizás llegue, no estoy seguro', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-011-ojala', 'ojalá pueda', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-012-a-ver-si', 'a ver si llego', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-013-segun-vea', 'según vea voy o no', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-014-dificil-pero', 'difícil pero lo intento', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-015-no-aseguro-2', 'mira no te aseguro, hablamos por la mañana', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-016-50-confirm', 'voy a intentarlo, no te prometo nada', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-017-vamos-a-ver', 'vamos a ver cómo voy de tiempo', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-018-no-se-aun', 'no sé aún si voy a poder', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-019-depende-trafico', 'depende del tráfico de salida', { expected: 'no_action' }),
  leadOnly('G18-CONFIDENCE-EDGE', 'G18-020-mira-luego', 'lo miro y luego te digo', { expected: 'no_action' }),
);

// ============================================================
// G19 — REGISTRO FORMAL vs INFORMAL vs JERGA
// ============================================================
cases.push(
  leadOnly('G19-REGISTER', 'G19-001-formal-cancel', 'Estimado Marcos, le ruego me disculpe pero no podré asistir a la cita programada.', { expected: 'cancel_with_followup' }),
  leadOnly('G19-REGISTER', 'G19-002-formal-cancel-largo', 'Buenas tardes, le escribo para comunicarle que no podré asistir a nuestra llamada agendada para mañana debido a un compromiso ineludible. Disculpe las molestias.', { expected: 'cancel_with_followup' }),
  leadOnly('G19-REGISTER', 'G19-003-formal-confirm', 'Estimado, confirmo mi asistencia a la llamada de mañana. Saludos cordiales.', { expected: 'no_action' }),
  leadOnly('G19-REGISTER', 'G19-004-informal-cancel', 'tio cancela porfi', { expected: 'cancel_with_followup' }),
  leadOnly('G19-REGISTER', 'G19-005-informal-confirm', 'ey ahí estoy tronco', { expected: 'no_action', context: 'Mañana hablamos!' }),
  leadOnly('G19-REGISTER', 'G19-006-formal-hard', 'Estimado Marcos, le comunico que no deseo continuar con el programa, le solicito amablemente que me retire de su lista de contactos.', { expected: 'cancel_no_followup' }),
  leadOnly('G19-REGISTER', 'G19-007-informal-hard', 'paso bro, voy con otro coach, ni me sigas escribiendo', { expected: 'cancel_no_followup' }),
  leadOnly('G19-REGISTER', 'G19-008-formal-question', '¿Podría confirmarme si la llamada continúa programada para la hora prevista?', { expected: 'no_action' }),
  leadOnly('G19-REGISTER', 'G19-009-mixto', 'Hola Marcos. Mira tio, no voy a poder, lo dejamos para la próxima semana sí?', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G19-REGISTER', 'G19-010-muy-formal-medical', 'Marcos, ha surgido una urgencia médica familiar. Lamento profundamente comunicarle que no podré asistir a nuestra reunión.', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G19-REGISTER', 'G19-011-jerga-no', 'ke va imposible bro', { expected: 'cancel_with_followup' }),
  leadOnly('G19-REGISTER', 'G19-012-jerga-yes', 'oki ahí toi', { expected: 'no_action', context: 'Llamada en 1h' }),
  leadOnly('G19-REGISTER', 'G19-013-frio', 'No asistiré.', { expected: 'cancel_with_followup' }),
  leadOnly('G19-REGISTER', 'G19-014-corporativo', 'En representación del equipo solicito el reagendado de la llamada prevista', { expected: 'cancel_with_followup' }),
  leadOnly('G19-REGISTER', 'G19-015-cheli', 'Tronco no llego ni de coña, hablamos en otro momento', { expected: 'cancel_with_followup' }),
);

// ============================================================
// G20 — IDIOMAS MEZCLADOS (Spanglish, catalán, jerga regional)
// ============================================================
cases.push(
  leadOnly('G20-LANGUAGE', 'G20-001-english-cancel', 'sorry Marcos, can\'t make it tomorrow', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-002-spanglish', 'sorry tio, no voy a poder hacer la call mañana', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-003-cant-make-it', 'I can\'t make it to the call', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-004-catalan', 'no podré assistir a la trucada', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-005-catalan-2', 'demà no puc Marcos, ho deixem per un altre dia', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-006-portugues', 'desculpa Marcos não vou conseguir ir', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-007-frances', 'désolé je ne pourrai pas venir', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-008-mexicano', 'no la voy a hacer wey, me cae mal mañana', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-009-argentino', 'che boludo no la pueod hacer mañana, está jodido', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-010-spanglish-confirm', 'all good, see you tomorrow Marcos', { expected: 'no_action', context: 'Mañana hablamos a las 18' }),
  leadOnly('G20-LANGUAGE', 'G20-011-mix-no-call', 'no call tomorrow, sorry', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-012-italian', 'scusa Marcos non riesco a venire', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-013-aleman-corto', 'sorry, kann nicht morgen', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-014-andaluz', 'que va Marcos, mañana ni de coña, dejémoslo pa otro día picha', { expected: 'cancel_with_followup' }),
  leadOnly('G20-LANGUAGE', 'G20-015-vasco', 'ezin dut bihar etorri, barkatu', { expected: 'cancel_with_followup' }),
);

// ============================================================
// G21 — DELAY SNAP (lead pide plazo no canónico)
// Expected: cancel_with_followup with delay snapped to 1/3/7
// ============================================================
cases.push(
  leadOnly('G21-DELAY-SNAP', 'G21-001-en-5-dias', 'no puedo, recuérdame en 5 días por favor', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G21-DELAY-SNAP', 'G21-002-en-2-semanas', 'no podré, vuélveme a llamar en 2 semanas', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G21-DELAY-SNAP', 'G21-003-en-10-dias', 'mejor en 10 días, esta semana imposible', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G21-DELAY-SNAP', 'G21-004-en-4-dias', 'cancela, mejor en 4 días', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G21-DELAY-SNAP', 'G21-005-en-6-dias', 'no puedo, recordame en 6 días', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G21-DELAY-SNAP', 'G21-006-en-2-dias', 'no puedo hoy, en 2 días te aviso', { expected: 'cancel_with_followup', delay: 1 }),
  leadOnly('G21-DELAY-SNAP', 'G21-007-en-1-semana', 'no puedo, en 1 semana hablamos', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G21-DELAY-SNAP', 'G21-008-mes', 'no puedo, hablamos en un mes', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G21-DELAY-SNAP', 'G21-009-15-dias', 'cancela, en 15 días vuelve a contactarme', { expected: 'cancel_with_followup', delay: 7 }),
  leadOnly('G21-DELAY-SNAP', 'G21-010-pasado-manana', 'no puedo mañana, en pasado-mañana mejor', { expected: 'cancel_with_followup', delay: 1 }),
  leadOnly('G21-DELAY-SNAP', 'G21-011-viernes-que-viene', 'no puedo, mejor el viernes que viene', { expected: 'cancel_with_followup' }),
  leadOnly('G21-DELAY-SNAP', 'G21-012-en-un-par-dias', 'no puedo, en un par de días te aviso', { expected: 'cancel_with_followup', delay: 1 }),
  leadOnly('G21-DELAY-SNAP', 'G21-013-cuando-sea', 'cancela y cuando puedas reagendamos', { expected: 'cancel_with_followup' }),
  leadOnly('G21-DELAY-SNAP', 'G21-014-3-4-dias', 'mejor en 3 o 4 días', { expected: 'cancel_with_followup', delay: 3 }),
  leadOnly('G21-DELAY-SNAP', 'G21-015-9-dias', 'cancela, en 9 días hablamos', { expected: 'cancel_with_followup', delay: 7 }),
);

// ============================================================
// G22 — EDGE CASES SISTEMA (sin citas, POST-ENLACE, calendario raro)
// ============================================================
cases.push(
  exchange('G22-SYSTEM-EDGE', 'G22-001-no-appts', {
    messages: [{ direction: 'inbound', body: 'Hola q tal', dateAdded: mkTs(2) }],
    apts: [], expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-002-no-appts-cancel-text', {
    messages: [{ direction: 'inbound', body: 'no puedo a la llamada', dateAdded: mkTs(2) }],
    apts: [], expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-003-post-link-thanks', {
    messages: [
      { direction: 'inbound', body: 'pásame para reagendar porfa', dateAdded: mkTs(20) },
      { direction: 'outbound', body: `Claro, ${RESCHEDULE_LINK}`, dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'gracias!', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(10) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-004-post-link-cancel-new', {
    messages: [
      { direction: 'inbound', body: 'reagendar', dateAdded: mkTs(30) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(25) },
      { direction: 'inbound', body: 'gracias!', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'espera, cancela también esa nueva, no creo que pueda esta semana', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(15) }],
    expected: 'cancel_with_followup', delay: 7,
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-005-late-gracias-with-newApt', {
    messages: [
      { direction: 'inbound', body: 'no puedo asistir', dateAdded: mkTs(360) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(355) },
      { direction: 'inbound', body: 'gracias', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(120) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-006-very-old-message', {
    messages: [
      { direction: 'inbound', body: 'no puedo', dateAdded: mkTs(60 * 24 * 2) },
      { direction: 'outbound', body: 'no pasa, hablamos', dateAdded: mkTs(60 * 24 * 2 - 30) },
      { direction: 'inbound', body: 'vale gracias', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-007-empty-body-only-attach', {
    messages: [
      { direction: 'inbound', body: '', attachments: ['https://example.com/photo.jpg'], dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-008-very-long-conversation', {
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
  exchange('G22-SYSTEM-EDGE', 'G22-009-coach-only-recent', {
    messages: [
      { direction: 'inbound', body: 'vale Marcos', dateAdded: mkTs(60) },
      { direction: 'outbound', body: 'Te paso el material adicional', dateAdded: mkTs(30) },
      { direction: 'outbound', body: 'Mira esto también', dateAdded: mkTs(5) },
    ],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-010-emoji-only-no-link', {
    messages: [{ direction: 'inbound', body: '😅', dateAdded: mkTs(2) }],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-011-post-link-explicit-after-new', {
    messages: [
      { direction: 'inbound', body: 'no puedo', dateAdded: mkTs(360) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(355) },
      { direction: 'inbound', body: 'gracias', dateAdded: mkTs(200) },
      { direction: 'inbound', body: 'oye que al final no quiero tener la llamada', dateAdded: mkTs(2) },
    ],
    apts: [{ id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar', dateAdded: mkTs(300) }],
    expected: 'cancel_with_followup', ids: 1,
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-012-mixed-old-and-new-cancel', {
    messages: [
      { direction: 'inbound', body: 'cancela todo lo viejo', dateAdded: mkTs(60 * 24 * 5) },
      { direction: 'inbound', body: 'vale ahí estoy', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-013-coach-recordatorio-confirm', {
    messages: [
      { direction: 'outbound', body: 'Recordatorio: llamada mañana a las 18h', dateAdded: mkTs(60) },
      { direction: 'outbound', body: 'Si tienes algo que comentar antes, dime', dateAdded: mkTs(30) },
      { direction: 'inbound', body: 'todo bien, mañana hablamos', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-014-no-outbound-cancel', {
    messages: [
      { direction: 'inbound', body: 'no podré ir, cancela', dateAdded: mkTs(2) },
    ],
    expected: 'cancel_with_followup',
  }),
  exchange('G22-SYSTEM-EDGE', 'G22-015-only-inbound-thanks', {
    messages: [
      { direction: 'inbound', body: 'gracias por todo', dateAdded: mkTs(2) },
    ],
    expected: 'no_action',
  }),
);

// ============================================================
// G23 — CONFIRMACIONES SUTILES (lead confirma indirectamente)
// Expected: no_action
// ============================================================
cases.push(
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-001-checked', '✓', { expected: 'no_action', context: 'Recordatorio mañana' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-002-recibido', 'recibido', { expected: 'no_action', context: 'Confirmamos llamada mañana?' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-003-anotado', 'anotado', { expected: 'no_action', context: 'Te paso link mañana' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-004-clear', 'clear', { expected: 'no_action', context: 'See you tomorrow' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-005-emoji-pulgar-saludo', '👍🏼', { expected: 'no_action', context: 'Recordatorio llamada mañana' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-006-roger', 'roger that', { expected: 'no_action', context: 'Mañana a las 18h' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-007-allright', 'all right', { expected: 'no_action', context: 'Confirmed for tomorrow' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-008-noted', 'noted', { expected: 'no_action', context: 'See you tomorrow' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-009-emoji-cohete', '🚀', { expected: 'no_action', context: 'Mañana cambiamos cosas' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-010-corazon', '❤️', { expected: 'no_action', context: 'Gracias por tu confianza' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-011-aplauso', '👏', { expected: 'no_action', context: 'Cerrado para mañana' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-012-vamos-emoji', 'vamos 💪', { expected: 'no_action', context: 'Mañana la liamos' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-013-cool', 'cool cool', { expected: 'no_action', context: 'See you tomorrow' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-014-double-tap', '👍👍', { expected: 'no_action', context: 'Recordatorio' }),
  leadOnly('G23-CONFIRM-SUBTLE', 'G23-015-sonrisa', '😊', { expected: 'no_action', context: 'Te paso material' }),
);

// ============================================================
// G24 — KEEP-LEGACY: casos heredados del suite anterior con
// nombres originales para no perder regression coverage
// ============================================================
cases.push(
  {
    category: 'G24-LEGACY', name: 'G24-legacy-renal-colic',
    messages: [
      { direction: 'inbound', body: 'Hola buenas tardes!! He tenido cólico nefriticos! Y mañana voy al hospital. Una amiga uróloga me va a hacer unas pruebas', dateAdded: mkTs(8) },
      { direction: 'inbound', body: 'Perdona por la hora', dateAdded: mkTs(7) },
      { direction: 'inbound', body: 'Lo dejamos para otro di por favor? Gracias', dateAdded: mkTs(6) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup',
  },
  {
    category: 'G24-LEGACY', name: 'G24-legacy-flip-flop-final-yes',
    messages: [
      { direction: 'inbound', body: 'Marcos no creo que pueda hoy', dateAdded: mkTs(20) },
      { direction: 'inbound', body: 'ah espera sí, voy', dateAdded: mkTs(15) },
      { direction: 'inbound', body: 'no, mejor lo dejo, no me apetece', dateAdded: mkTs(10) },
      { direction: 'inbound', body: 'no espera, vale, al final voy sí', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
);

module.exports = cases;
