'use strict';

// Synthetic test cases for the classifier. Each case has:
//   - name: short label
//   - messages: synthetic conversation, ordered oldest -> newest
//   - appointments: synthetic active future appointments (id + startTime)
//   - expectedIntent: what we want the classifier to decide
//   - expectedDelay (optional): for cancel_with_followup, expected delay days
//
// Helper: synthetic timestamps relative to NOW.
function mkTs(minsAgo) {
  return new Date(Date.now() - minsAgo * 60 * 1000).toISOString();
}

const RESCHEDULE_LINK = 'Aquí tienes el enlace para mover la llamada: https://api.leadconnectorhq.com/widget/bookings/round-normalrqpm6x';

const APT_1 = { id: 'evt_FUTURE_001', startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), calendarName: 'Calendario - VSL' };
const APT_2 = { id: 'evt_FUTURE_002', startTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), calendarName: 'Reagendar llamada' };

module.exports = [
  // ============ GROUP 1: Direct cancellations (no link) ============
  {
    name: 'G1-direct-cancel',
    messages: [
      { direction: 'outbound', body: 'Tienes tu llamada agendada para mañana', dateAdded: mkTs(20) },
      { direction: 'inbound',  body: 'Marcos, no voy a poder ir a la llamada esta semana', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 1,
  },
  {
    name: 'G1-cancel-headache-3d',
    messages: [
      { direction: 'outbound', body: 'Recordatorio de tu llamada', dateAdded: mkTs(60) },
      { direction: 'inbound',  body: 'Tengo bastante dolor de cabeza estos días, no creo que pueda hoy', dateAdded: mkTs(5) },
    ],
    appointments: [APT_1],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 3,
  },
  {
    name: 'G1-cancel-travel-7d',
    messages: [
      { direction: 'inbound', body: 'Hola Marcos, esta semana fatal, estoy de viaje de trabajo hasta el viernes y va a ser imposible', dateAdded: mkTs(3) },
    ],
    appointments: [APT_1],
    expectedIntent: 'cancel_with_followup',
    expectedDelay: 7,
  },
  {
    name: 'G1-hard-cancel-competitor',
    messages: [
      { direction: 'inbound', body: 'Marcos lo he pensado y al final voy a tirar con un entrenador presencial de mi ciudad. Gracias.', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'cancel_no_followup',
  },
  {
    name: 'G1-hard-cancel-not-interested',
    messages: [
      { direction: 'inbound', body: 'Ya no me interesa, quítame de la lista por favor', dateAdded: mkTs(1) },
    ],
    appointments: [APT_1],
    expectedIntent: 'cancel_no_followup',
  },

  // ============ GROUP 2: Benign / no_action (no link) ============
  {
    name: 'G2-confirmation-short',
    messages: [
      { direction: 'outbound', body: 'Recuerda que mañana a las 18h tenemos la llamada', dateAdded: mkTs(20) },
      { direction: 'inbound',  body: 'Vale, perfecto, nos vemos!', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action',
  },
  {
    name: 'G2-question',
    messages: [
      { direction: 'inbound', body: 'Oye Marcos una pregunta, la llamada es por Meet o por Zoom?', dateAdded: mkTs(3) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action',
  },
  {
    name: 'G2-thanks',
    messages: [
      { direction: 'outbound', body: 'Te paso un video previo para que veas cómo trabajamos', dateAdded: mkTs(30) },
      { direction: 'inbound',  body: 'gracias!!', dateAdded: mkTs(1) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action',
  },
  {
    name: 'G2-empty-trigger-no-appts',
    messages: [
      { direction: 'inbound', body: 'Hola q tal', dateAdded: mkTs(1) },
    ],
    appointments: [],
    expectedIntent: 'no_action', // no appointments → no_action by-pass
  },

  // ============ GROUP 3: Reschedule link scenarios (the critical ones) ============
  {
    name: 'G3-link-accept-thanks',
    messages: [
      { direction: 'inbound',  body: 'Marcos no sé si podré asistir hoy', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `Tranqui, ${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'vale gracias!', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'cancel_with_followup',
  },
  {
    name: 'G3-link-accept-explicit',
    messages: [
      { direction: 'inbound',  body: 'Tengo lío esta tarde', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `Vale, ${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'genial, lo cambio ahora mismo, gracias', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'cancel_with_followup',
  },
  {
    name: 'G3-link-REJECT-si-puedo',
    messages: [
      { direction: 'inbound',  body: 'Marcos no sé si podré asistir hoy', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'vale sí puedo asistir', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action', // MARCOS’S CRITICAL CASE
  },
  {
    name: 'G3-link-REJECT-al-final-voy',
    messages: [
      { direction: 'inbound',  body: 'No sé si llego a la llamada', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `Sin problema, ${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'al final sí voy, gracias', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action',
  },
  {
    name: 'G3-link-REJECT-dejalo',
    messages: [
      { direction: 'inbound',  body: 'Va a estar dificil', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'no no, déjalo, iré', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action',
  },
  {
    name: 'G3-link-ambiguous-vale-alone',
    messages: [
      { direction: 'inbound',  body: 'No sé', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'vale', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action', // ambiguous → conservative
  },
  {
    name: 'G3-link-ambiguous-pensar',
    messages: [
      { direction: 'inbound',  body: 'Tengo dudas', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'déjame pensarlo y te digo', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action',
  },

  // ============ GROUP 4: Partial cancellations (2+ appointments) ============
  {
    name: 'G4-cancel-both',
    messages: [
      { direction: 'inbound', body: 'Marcos no puedo ir a las llamadas que tengo agendadas, cancela las dos por favor', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1, APT_2],
    expectedIntent: 'cancel_with_followup',
    expectedIdsCount: 2,
  },
  {
    name: 'G4-cancel-partial-only-one',
    messages: [
      { direction: 'outbound', body: 'Te recuerdo que tienes 2 llamadas agendadas, una el martes y otra el jueves', dateAdded: mkTs(20) },
      { direction: 'inbound',  body: 'Marcos cancela solo la del martes por favor, la del jueves la mantengo', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1, APT_2],
    expectedIntent: 'cancel_partial',
    expectedIdsCount: 1,
  },
  {
    name: 'G4-cancel-unspecified-2-appts',
    messages: [
      { direction: 'inbound', body: 'al final no voy a poder, cancela la llamada', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1, APT_2],
    expectedIntent: 'cancel_with_followup', // unspecified -> all
    expectedIdsCount: 2,
  },

  // ============ GROUP 5: Edge cases ============
  {
    name: 'G5-just-vale-alone-no-link',
    messages: [
      { direction: 'outbound', body: 'Te paso el material que te prometí', dateAdded: mkTs(10) },
      { direction: 'inbound',  body: 'vale', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action', // whitelist short-circuit
  },
  {
    name: 'G5-audio-untranscribable',
    messages: [
      { direction: 'inbound', body: '', attachments: ['https://example.com/voice.mp4'], dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'audio_needs_review',
  },
  {
    name: 'G5-image-only',
    messages: [
      { direction: 'inbound', body: '', attachments: ['https://example.com/photo.jpg'], dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action', // non-audio-media bypass
  },
];
