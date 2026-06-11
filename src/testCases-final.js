// src/testCases-final.js
//
// Suite FINAL — validación exhaustiva del classifier (~85 cases en 17 categorías).
// Combina cobertura amplia de:
//   - Cancel firmes con variaciones (verbos, modales, formato)
//   - Reagendados firmes
//   - Confirmaciones limpias (validación negativa)
//   - Lead incierto / dudas
//   - Problemas técnicos diversos
//   - Retrasos vs cancelaciones
//   - Condicionales y exploratorias
//   - Ajustes de hora mismo día
//   - Cancel con motivos varios (delay tuning 1/3/7)
//   - Multi-cita y cancel_partial
//   - Cancel_no_followup (rechazo total)
//   - Post-enlace silencio + reaffirm
//   - Ráfagas multi-mensaje
//   - Chequeo temporal (día no solapa con cita)
//   - Edge cases (typos, jerga, palabras ambiguas)

'use strict';

const TODAY = '2026-06-11';
const TOMORROW = '2026-06-12T19:00:00+02:00';
const DAY_AFTER = '2026-06-13T16:00:00+02:00';
const WEEK_LATER = '2026-06-18T16:00:00+02:00';

const APT_TOMORROW = {
  id: 'apt-tomorrow',
  startTime: TOMORROW,
  calendarId: 'cal-1',
  dateAdded: '2026-06-10T10:00:00Z',
};

const APT_DAY_AFTER = {
  id: 'apt-day-after',
  startTime: DAY_AFTER,
  calendarId: 'cal-1',
  dateAdded: '2026-06-10T10:00:00Z',
};

const APT_WEEK_LATER = {
  id: 'apt-week-later',
  startTime: WEEK_LATER,
  calendarId: 'cal-1',
  dateAdded: '2026-06-10T10:00:00Z',
};

const TEST_CASES_FINAL = [
  // ─────────────────────────────────────────────────────────────────────
  // F1 — CANCEL FIRMES CON VERBO DIRECTO (esperado: cancel_with_followup, delay 1)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F1-001', category: 'F1', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'cancela mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F1-002', category: 'F1', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'tengo que cancelar la llamada', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F1-003', category: 'F1', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no puedo mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F1-004', category: 'F1', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'anula la cita por favor', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F1-005', category: 'F1', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no podré asistir mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F1-006', category: 'F1', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'imposible mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F1-007', category: 'F1', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no me va bien mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },

  // ─────────────────────────────────────────────────────────────────────
  // F2 — REAGENDADOS CON MODALES DE NECESIDAD (esperado: cancel_with_followup, delay 1)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F2-001', category: 'F2', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'necesito cambiar el día de la llamada', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F2-002', category: 'F2', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'tengo que mover la cita', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F2-003', category: 'F2', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'voy a tener que reagendar', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F2-004', category: 'F2', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'debo mover la llamada', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F2-005', category: 'F2', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'reagendo la cita a otro día', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F2-006', category: 'F2', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'muévela al lunes mejor', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },

  // ─────────────────────────────────────────────────────────────────────
  // F3 — CONFIRMACIONES LIMPIAS (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F3-001', category: 'F3', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'outbound', body: 'Recuerda nuestra llamada mañana 19:00', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound', body: 'ahí estaré', dateAdded: `${TODAY}T10:05:00Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F3-002', category: 'F3', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'outbound', body: 'Llamada mañana 19:00', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound', body: 'perfecto cuento con ello', dateAdded: `${TODAY}T10:05:00Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F3-003', category: 'F3', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'outbound', body: 'Mañana 19:00 entonces?', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound', body: 'sí sí ahí nos vemos', dateAdded: `${TODAY}T10:05:00Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F3-004', category: 'F3', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'confirmo la llamada de mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F3-005', category: 'F3', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'outbound', body: 'Recordatorio: llamada mañana', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound', body: 'ok genial gracias!', dateAdded: `${TODAY}T10:05:00Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F3-006', category: 'F3', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'outbound', body: 'Te va bien mañana 19:00?', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound', body: 'sí perfecto', dateAdded: `${TODAY}T10:05:00Z` },
    ],
    expectedIntent: 'no_action' },

  // ─────────────────────────────────────────────────────────────────────
  // F4 — LEAD INCIERTO (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F4-001', category: 'F4', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no sé si podré mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F4-002', category: 'F4', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'puede que no llegue', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F4-003', category: 'F4', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'igual no llego, te aviso mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F4-004', category: 'F4', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no estoy seguro de poder asistir', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F4-005', category: 'F4', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'espero estar pero tengo lío', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F4-006', category: 'F4', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'a ver si me da tiempo', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },

  // ─────────────────────────────────────────────────────────────────────
  // F5 — PROBLEMAS TÉCNICOS (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F5-001', category: 'F5', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no me funciona Zoom, no puedo entrar', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F5-002', category: 'F5', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'se cayó el internet, no llego', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F5-003', category: 'F5', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'el link no me funciona, dame otro', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F5-004', category: 'F5', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no me carga la cámara', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F5-005', category: 'F5', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no tengo wifi en casa hoy', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F5-006', category: 'F5', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no me entra el meet, ayuda', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },

  // ─────────────────────────────────────────────────────────────────────
  // F6 — RETRASOS (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F6-001', category: 'F6', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'llego 10 min tarde', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F6-002', category: 'F6', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no podré llegar a tiempo', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F6-003', category: 'F6', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no llego al inicio, entro a los 5 min', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F6-004', category: 'F6', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'media hora tarde te parece?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F6-005', category: 'F6', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'voy con retraso, espera 15 min', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },

  // ─────────────────────────────────────────────────────────────────────
  // F7 — CONDICIONALES Y EXPLORATORIAS (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F7-001', category: 'F7', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'como máximo 80€, si no, mejor no la hacemos', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F7-002', category: 'F7', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'si es solo para venderme déjalo', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F7-003', category: 'F7', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'podemos cambiar al sábado?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F7-004', category: 'F7', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'hay opción del jueves?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F7-005', category: 'F7', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'tendrías hueco la semana que viene?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F7-006', category: 'F7', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'cambiamos día?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },

  // ─────────────────────────────────────────────────────────────────────
  // F8 — AJUSTES HORA MISMO DÍA (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F8-001', category: 'F8', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'podemos a las 20 en vez de 19?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F8-002', category: 'F8', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: '30 min más tarde mañana?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F8-003', category: 'F8', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'puedo a las 21 mejor?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F8-004', category: 'F8', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'a la noche mejor que tarde?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },

  // ─────────────────────────────────────────────────────────────────────
  // F9 — CANCEL CON MOTIVOS VARIOS — DELAY TUNING (esperado: cancel con delay 3 o 7)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F9-001', category: 'F9', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no puedo mañana, estoy de viaje', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 3 },
  { name: 'F9-002', category: 'F9', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'tengo boda mañana, no puedo', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F9-003', category: 'F9', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'esta semana imposible, cambiamos?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 7 },
  { name: 'F9-004', category: 'F9', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'tengo cita médica mañana, anula', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F9-005', category: 'F9', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'estoy de vacaciones esta semana, cancela', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 7 },
  { name: 'F9-006', category: 'F9', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'estoy malo, no puedo mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F9-007', category: 'F9', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'estos días los tengo caóticos, cambiamos?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 3 },

  // ─────────────────────────────────────────────────────────────────────
  // F10 — MULTI-CITA CANCEL_PARTIAL
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F10-001', category: 'F10', appointments: [APT_TOMORROW, APT_DAY_AFTER],
    messages: [{ direction: 'inbound', body: 'cancela solo la de mañana, la del viernes mantenla', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_partial', expectedIdsCount: 1 },
  { name: 'F10-002', category: 'F10', appointments: [APT_TOMORROW, APT_DAY_AFTER, APT_WEEK_LATER],
    messages: [{ direction: 'inbound', body: 'déjame solo la del próximo jueves', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_partial', expectedIdsCount: 2 },
  { name: 'F10-003', category: 'F10', appointments: [APT_TOMORROW, APT_DAY_AFTER],
    messages: [{ direction: 'inbound', body: 'anula la primera, la otra déjala', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_partial', expectedIdsCount: 1 },
  { name: 'F10-004', category: 'F10', appointments: [APT_TOMORROW, APT_DAY_AFTER],
    messages: [{ direction: 'inbound', body: 'mañana no puedo, las próximas mantenlas', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_partial', expectedIdsCount: 1 },

  // ─────────────────────────────────────────────────────────────────────
  // F11 — CANCEL_NO_FOLLOWUP — RECHAZO TOTAL PROGRAMA
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F11-001', category: 'F11', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no me contactes más por favor', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_no_followup' },
  { name: 'F11-002', category: 'F11', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'ya no me interesa, déjame en paz', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_no_followup' },
  { name: 'F11-003', category: 'F11', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'borra mis datos por favor', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_no_followup' },
  { name: 'F11-004', category: 'F11', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'cancelo todo contigo, gracias', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_no_followup' },
  { name: 'F11-005', category: 'F11', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'ya tengo entrenador, no necesito otro, gracias', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_no_followup' },

  // ─────────────────────────────────────────────────────────────────────
  // F12 — POST-ENLACE SILENCIO/AMBIGÜEDAD (esperado: cancel_with_followup)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F12-001', category: 'F12', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'no puedo mañana, cambiamos?', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Te paso enlace: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
    ],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F12-002', category: 'F12', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'imposible mañana, tengo que cancelar', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Vale, aquí enlace: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound', body: 'vale', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F12-003', category: 'F12', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'tengo que cancelar mañana', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Te dejo enlace: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound', body: 'ok luego te digo', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F12-004', category: 'F12', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'no podré ir mañana, podemos reagendar?', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Aquí enlace: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound', body: 'miro luego', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },

  // ─────────────────────────────────────────────────────────────────────
  // F13 — POST-ENLACE REAFFIRM EXPLÍCITO (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F13-001', category: 'F13', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'no puedo mañana, cambiamos?', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Te paso enlace: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound', body: 'ah espera ya me cuadra ahí estaré', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F13-002', category: 'F13', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'imposible mañana, anula', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Aquí enlace: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound', body: 'al final sí puedo, déjalo en pie', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F13-003', category: 'F13', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'tengo que cancelar', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Vale: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound', body: 'no era broma, sigo yendo', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'no_action' },

  // ─────────────────────────────────────────────────────────────────────
  // F14 — RÁFAGAS MULTI-MENSAJE (cancel+reaffirm o cancel+cancel)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F14-001', category: 'F14', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'no puedo mañana', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'bueno al final sí, déjalo', dateAdded: `${TODAY}T11:00:30Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F14-002', category: 'F14', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'tengo que cancelar', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'ah espera ya me cuadra ahí estaré', dateAdded: `${TODAY}T11:00:30Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F14-003', category: 'F14', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'no puedo mañana', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'bueno al final sí', dateAdded: `${TODAY}T11:00:30Z` },
      { direction: 'inbound', body: 'no, paso del todo cancela', dateAdded: `${TODAY}T11:01:00Z` },
    ],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F14-004', category: 'F14', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'inbound', body: 'como máximo 80€', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'si no es posible dímelo', dateAdded: `${TODAY}T11:00:20Z` },
      { direction: 'inbound', body: 'y no hace falta la llamada', dateAdded: `${TODAY}T11:00:40Z` },
    ],
    expectedIntent: 'no_action' },

  // ─────────────────────────────────────────────────────────────────────
  // F15 — CHEQUEO TEMPORAL: día NO solapa con cita (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F15-001', category: 'F15', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'hoy no puedo, mañana cuento contigo', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F15-002', category: 'F15', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'el viernes que viene no podré', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F15-003', category: 'F15', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'el mes que viene tengo lío', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },
  { name: 'F15-004', category: 'F15', appointments: [APT_WEEK_LATER],
    messages: [{ direction: 'inbound', body: 'no puedo mañana', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'no_action' },

  // ─────────────────────────────────────────────────────────────────────
  // F16 — EDGE CASES (typos, jerga, dialectos, palabras ambiguas)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F16-001', category: 'F16', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'kncela porfa, no puedo', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F16-002', category: 'F16', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'outbound', body: 'Recuerda la llamada mañana 19:00', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound', body: 'paso 😅', dateAdded: `${TODAY}T11:00:00Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F16-003', category: 'F16', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'cancela porfis', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F16-004', category: 'F16', appointments: [APT_TOMORROW],
    messages: [
      { direction: 'outbound', body: 'Llamada mañana?', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound', body: 'nada', dateAdded: `${TODAY}T11:00:00Z` },
    ],
    expectedIntent: 'no_action' },
  { name: 'F16-005', category: 'F16', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no puedo mañna, anula', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },

  // ─────────────────────────────────────────────────────────────────────
  // F17 — DESCARTE FIRME + PREGUNTA INFO (esperado: cancel_with_followup)
  // ─────────────────────────────────────────────────────────────────────
  { name: 'F17-001', category: 'F17', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'no puedo mañana, pero mándame info del programa', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F17-002', category: 'F17', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'mañana imposible, antes dime los precios', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
  { name: 'F17-003', category: 'F17', appointments: [APT_TOMORROW],
    messages: [{ direction: 'inbound', body: 'cancela mañana. cuál es vuestra metodología?', dateAdded: `${TODAY}T11:00:00Z` }],
    expectedIntent: 'cancel_with_followup', expectedDelay: 1 },
];

module.exports = TEST_CASES_FINAL;
