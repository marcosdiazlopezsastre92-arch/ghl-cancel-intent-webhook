// src/testCases-rector.js
//
// Regression suite que valida el realineamiento filosófico del classifier
// aplicado el 2026-06-11:
//   - PRINCIPIO RECTOR (asimetría de costes)
//   - REGLA DE PALABRA SUELTA AMBIGUA (caso PASO)
//   - PRINCIPIO DE REAFIRMACIÓN (lo más reciente explícito manda)
//   - POST-ENLACE PRINCIPIO PREVIO + EXCEPCIÓN AL PRINCIPIO
//
// 7 categorías (29 casos):
//   R1 — Palabras ambiguas sueltas (esperado: no_action)
//   R2 — Reafirmación dentro de ráfaga única (esperado: no_action)
//   R3 — Reafirmación post-enlace (esperado: no_action)
//   R4 — Verbos inequívocos vs palabras ambiguas (esperado: mixto)
//   R5 — Confirmaciones limpias (esperado: no_action, validación negativa)
//   R6 — Cancel + ambigüedad/silencio posterior (esperado: cancel)
//   R7 — Cadenas cancel→reaffirm→cancel (esperado: última explícita gana)

'use strict';

const FUTURE_APT_DATE = '2026-06-12T19:00:00+02:00';
const TODAY = '2026-06-11';

const APT = {
  id: 'apt-rector-001',
  startTime: FUTURE_APT_DATE,
  calendarId: 'cal-rector-1',
  dateAdded: '2026-06-10T10:00:00Z',
};

const TEST_CASES_RECTOR = [
  // ─────────────────────────────────────────────────────────────────────
  // R1 — PALABRAS AMBIGUAS SUELTAS (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────

  {
    name: 'R1-001',
    category: 'R1',
    description: 'PASO con emojis tras confirmación reciente (caso real chica IG)',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Recuerda nuestra llamada mañana a las 19:00 💪🏻', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'Vale, perfecto ahí estaré', dateAdded: `${TODAY}T10:05:00Z` },
      { direction: 'outbound', body: 'Genial!', dateAdded: `${TODAY}T10:06:00Z` },
      { direction: 'inbound',  body: 'Paso 😅😅', dateAdded: `${TODAY}T15:30:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R1-002',
    category: 'R1',
    description: 'PASO solo sin contexto previo',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Hola! tenemos la llamada mañana', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'paso', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R1-003',
    category: 'R1',
    description: 'Nada solo',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Te recuerdo la llamada mañana a las 19:00', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'nada', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R1-004',
    category: 'R1',
    description: 'No solo sin verbo de descarte',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Llamada mañana 19:00 vale?', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'no', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R1-005',
    category: 'R1',
    description: 'Uf solo',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Llamada mañana 19:00', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'uf', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R1-006',
    category: 'R1',
    description: 'Solo emoji de risa',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Llamada mañana 19:00', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: '😅', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R1-007',
    category: 'R1',
    description: 'PASO de respuesta a story (palabra clave campaña)',
    appointments: [APT],
    messages: [
      { direction: 'inbound',  body: 'PASO', dateAdded: `${TODAY}T11:00:00Z` },
    ],
    expectedIntent: 'no_action',
  },

  // ─────────────────────────────────────────────────────────────────────
  // R2 — REAFIRMACIÓN DENTRO DE RÁFAGA ÚNICA (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────

  {
    name: 'R2-001',
    category: 'R2',
    description: 'Cancel + reafirm explícita en misma ráfaga',
    appointments: [APT],
    messages: [
      { direction: 'inbound', body: 'no puedo mañana', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'bueno al final sí', dateAdded: `${TODAY}T11:00:30Z` },
      { direction: 'inbound', body: 'déjalo', dateAdded: `${TODAY}T11:01:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R2-002',
    category: 'R2',
    description: 'Cancel firme + ahí estaré (reafirm)',
    appointments: [APT],
    messages: [
      { direction: 'inbound', body: 'tengo que cancelar', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'ah espera, ya me cuadra ahí estaré', dateAdded: `${TODAY}T11:01:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R2-003',
    category: 'R2',
    description: 'Paso de la llamada + reafirm explícita',
    appointments: [APT],
    messages: [
      { direction: 'inbound', body: 'paso de la llamada', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'no espera, al final voy', dateAdded: `${TODAY}T11:00:45Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R2-004',
    category: 'R2',
    description: 'Cancel + reafirm con "sigo yendo"',
    appointments: [APT],
    messages: [
      { direction: 'inbound', body: 'cancela mañana', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'no, era broma, sigo yendo', dateAdded: `${TODAY}T11:00:30Z` },
    ],
    expectedIntent: 'no_action',
  },

  // ─────────────────────────────────────────────────────────────────────
  // R3 — REAFIRMACIÓN POST-ENLACE (esperado: no_action)
  // ─────────────────────────────────────────────────────────────────────

  {
    name: 'R3-001',
    category: 'R3',
    description: 'Cancel → coach envía enlace → reafirm explícita',
    appointments: [APT],
    messages: [
      { direction: 'inbound',  body: 'no puedo mañana cambiamos?', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Claro, te dejo enlace para que reagendes: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound',  body: 'ah espera ya me cuadra, ahí estaré', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R3-002',
    category: 'R3',
    description: 'Cancel → enlace → "al final sí puedo"',
    appointments: [APT],
    messages: [
      { direction: 'inbound',  body: 'imposible mañana, tengo que cancelar', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Vale te paso enlace para reagendar: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound',  body: 'al final sí puedo', dateAdded: `${TODAY}T09:30:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R3-003',
    category: 'R3',
    description: 'Cancel → enlace → "ya me cuadra"',
    appointments: [APT],
    messages: [
      { direction: 'inbound',  body: 'no podré mañana, cambia el día porfa', dateAdded: `${TODAY}T08:00:00Z` },
      { direction: 'outbound', body: 'Aquí tienes: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T08:02:00Z` },
      { direction: 'inbound',  body: 'ah espera ya me cuadra a la 19 déjalo en pie', dateAdded: `${TODAY}T08:15:00Z` },
    ],
    expectedIntent: 'no_action',
  },

  // ─────────────────────────────────────────────────────────────────────
  // R4 — VERBOS INEQUÍVOCOS vs PALABRAS AMBIGUAS (esperados diferenciados)
  // ─────────────────────────────────────────────────────────────────────

  {
    name: 'R4-001',
    category: 'R4',
    description: 'Verbo inequívoco solo: cancelo',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Recuerda la llamada mañana', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'cancelo', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
  {
    name: 'R4-002',
    category: 'R4',
    description: 'Verbo inequívoco solo: anula',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Recuerda la llamada mañana', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'anula', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
  {
    name: 'R4-003',
    category: 'R4',
    description: 'Verbo inequívoco: imposible mañana',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Llamada mañana 19:00', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'imposible mañana', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
  {
    name: 'R4-004',
    category: 'R4',
    description: 'No puedo (verbo de descarte explícito)',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Llamada mañana 19:00', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'no puedo mañana', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
  {
    name: 'R4-005',
    category: 'R4',
    description: 'Palabra ambigua sin verbo: "no" solo',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Quedamos para mañana?', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'no', dateAdded: `${TODAY}T10:30:00Z` },
    ],
    expectedIntent: 'no_action',
  },

  // ─────────────────────────────────────────────────────────────────────
  // R5 — CONFIRMACIONES LIMPIAS (esperado: no_action, validación negativa)
  // ─────────────────────────────────────────────────────────────────────

  {
    name: 'R5-001',
    category: 'R5',
    description: 'Confirmación clásica: ahí estoy',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Te recuerdo la llamada mañana 19:00', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'ahí estoy', dateAdded: `${TODAY}T10:05:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R5-002',
    category: 'R5',
    description: 'Confirmación: perfecto ahí estaré',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Mañana 19:00 entonces?', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'perfecto, ahí estaré', dateAdded: `${TODAY}T10:05:00Z` },
    ],
    expectedIntent: 'no_action',
  },
  {
    name: 'R5-003',
    category: 'R5',
    description: 'Confirmación + comentario casual',
    appointments: [APT],
    messages: [
      { direction: 'outbound', body: 'Llamada mañana?', dateAdded: `${TODAY}T10:00:00Z` },
      { direction: 'inbound',  body: 'sí sí cuento contigo, gracias!', dateAdded: `${TODAY}T10:05:00Z` },
    ],
    expectedIntent: 'no_action',
  },

  // ─────────────────────────────────────────────────────────────────────
  // R6 — CANCEL + AMBIGÜEDAD/SILENCIO POSTERIOR (esperado: cancel)
  // ─────────────────────────────────────────────────────────────────────

  {
    name: 'R6-001',
    category: 'R6',
    description: 'Cancel → enlace → silencio (no se anula la cancelación)',
    appointments: [APT],
    messages: [
      { direction: 'inbound',  body: 'no puedo mañana cambiamos?', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Te paso enlace: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
  {
    name: 'R6-002',
    category: 'R6',
    description: 'Cancel → enlace → "vale" solo (NO cuenta como reafirm)',
    appointments: [APT],
    messages: [
      { direction: 'inbound',  body: 'imposible mañana, anula', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Te paso enlace: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound',  body: 'vale', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
  {
    name: 'R6-003',
    category: 'R6',
    description: 'Cancel → "ok miro" (ambiguo, NO es reafirm)',
    appointments: [APT],
    messages: [
      { direction: 'inbound',  body: 'no podré mañana, cambia día', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Te paso enlace: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound',  body: 'ok miro luego', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
  {
    name: 'R6-004',
    category: 'R6',
    description: 'Cancel firme + "luego te digo" (ambiguo)',
    appointments: [APT],
    messages: [
      { direction: 'inbound',  body: 'tengo que cancelar mañana', dateAdded: `${TODAY}T09:00:00Z` },
      { direction: 'outbound', body: 'Vale, te dejo enlace para mover: https://api.leadconnectorhq.com/widget/bookings/round-normal', dateAdded: `${TODAY}T09:05:00Z` },
      { direction: 'inbound',  body: 'luego te digo', dateAdded: `${TODAY}T09:10:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },

  // ─────────────────────────────────────────────────────────────────────
  // R7 — CADENAS cancel→reaffirm→cancel (esperado: última explícita gana)
  // ─────────────────────────────────────────────────────────────────────

  {
    name: 'R7-001',
    category: 'R7',
    description: 'Cancel → reaffirm → cancel firme final',
    appointments: [APT],
    messages: [
      { direction: 'inbound', body: 'no puedo mañana', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'bueno al final sí', dateAdded: `${TODAY}T11:00:30Z` },
      { direction: 'inbound', body: 'ah no, paso del todo, cancela', dateAdded: `${TODAY}T11:01:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
  {
    name: 'R7-002',
    category: 'R7',
    description: 'Cancel → reaffirm → cancel con "mejor no"',
    appointments: [APT],
    messages: [
      { direction: 'inbound', body: 'tengo que cancelar', dateAdded: `${TODAY}T11:00:00Z` },
      { direction: 'inbound', body: 'espera, ahí estaré', dateAdded: `${TODAY}T11:00:30Z` },
      { direction: 'inbound', body: 'no, mejor lo dejamos, no puedo', dateAdded: `${TODAY}T11:01:00Z` },
    ],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
];

module.exports = TEST_CASES_RECTOR;
