'use strict';

function mkTs(minsAgo) {
  return new Date(Date.now() - minsAgo * 60 * 1000).toISOString();
}
function mkFutureTs(daysAhead) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
}

const RESCHEDULE_LINK = 'Aquí tienes el enlace para mover la llamada: https://api.leadconnectorhq.com/widget/bookings/round-normalrqpm6x';

const APT_1 = { id: 'evt_FUTURE_001', startTime: mkFutureTs(1), calendarName: 'Calendario - VSL', dateAdded: mkTs(60 * 24 * 5) };
const APT_2 = { id: 'evt_FUTURE_002', startTime: mkFutureTs(3), calendarName: 'LM', dateAdded: mkTs(60 * 24 * 3) };

module.exports = [
  { name: 'G1-direct-cancel',
    messages: [
      { direction: 'outbound', body: 'Tienes tu llamada agendada para mañana', dateAdded: mkTs(20) },
      { direction: 'inbound',  body: 'Marcos, no voy a poder ir a la llamada esta semana', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup', expectedDelay: 1,
  },
  { name: 'G1-cancel-headache-3d',
    messages: [
      { direction: 'outbound', body: 'Recordatorio de tu llamada', dateAdded: mkTs(60) },
      { direction: 'inbound',  body: 'Tengo bastante dolor de cabeza estos días, no creo que pueda hoy', dateAdded: mkTs(5) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup', expectedDelay: 3,
  },
  { name: 'G1-cancel-travel-7d',
    messages: [
      { direction: 'inbound', body: 'Hola Marcos, esta semana fatal, estoy de viaje de trabajo hasta el viernes y va a ser imposible', dateAdded: mkTs(3) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup', expectedDelay: 7,
  },
  { name: 'G1-hard-cancel-competitor',
    messages: [
      { direction: 'inbound', body: 'Marcos lo he pensado y al final voy a tirar con un entrenador presencial de mi ciudad. Gracias.', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_no_followup',
  },
  { name: 'G1-hard-cancel-not-interested',
    messages: [
      { direction: 'inbound', body: 'Ya no me interesa, quítame de la lista por favor', dateAdded: mkTs(1) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_no_followup',
  },
  { name: 'G1-real-medical-renal-colic',
    messages: [
      { direction: 'inbound',  body: 'Hola buenas tardes!! He tenido cólico nefriticos! Y mañana voy al hospital. Una amiga uróloga me va a hacer unas pruebas', dateAdded: mkTs(8) },
      { direction: 'inbound',  body: 'Perdona por la hora', dateAdded: mkTs(7) },
      { direction: 'inbound',  body: 'Lo dejamos para otro di por favor? Gracias', dateAdded: mkTs(6) },
    ],
    appointments: [APT_1],
    expectedIntent: 'cancel_with_followup',
  },

  { name: 'G2-confirmation-short',
    messages: [
      { direction: 'outbound', body: 'Recuerda que mañana a las 18h tenemos la llamada', dateAdded: mkTs(20) },
      { direction: 'inbound',  body: 'Vale, perfecto, nos vemos!', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G2-question',
    messages: [
      { direction: 'inbound', body: 'Oye Marcos una pregunta, la llamada es por Meet o por Zoom?', dateAdded: mkTs(3) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G2-thanks',
    messages: [
      { direction: 'outbound', body: 'Te paso un video previo para que veas cómo trabajamos', dateAdded: mkTs(30) },
      { direction: 'inbound',  body: 'gracias!!', dateAdded: mkTs(1) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G2-empty-trigger-no-appts',
    messages: [
      { direction: 'inbound', body: 'Hola q tal', dateAdded: mkTs(1) },
    ],
    appointments: [], expectedIntent: 'no_action',
  },

  { name: 'G3-link-accept-thanks',
    messages: [
      { direction: 'inbound',  body: 'Marcos no sé si podré asistir hoy', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `Tranqui, ${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'vale gracias!', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup',
  },
  { name: 'G3-link-accept-explicit',
    messages: [
      { direction: 'inbound',  body: 'Tengo lío esta tarde', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `Vale, ${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'genial, lo cambio ahora mismo, gracias', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup',
  },
  { name: 'G3-link-REJECT-si-puedo',
    messages: [
      { direction: 'inbound',  body: 'Marcos no sé si podré asistir hoy', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'vale sí puedo asistir', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G3-link-REJECT-al-final-voy',
    messages: [
      { direction: 'inbound',  body: 'No sé si llego a la llamada', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `Sin problema, ${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'al final sí voy, gracias', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G3-link-REJECT-dejalo',
    messages: [
      { direction: 'inbound',  body: 'Va a estar dificil', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'no no, déjalo, iré', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G3-link-ambiguous-vale-alone',
    messages: [
      { direction: 'inbound',  body: 'No sé', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'vale', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G3-link-ambiguous-pensar',
    messages: [
      { direction: 'inbound',  body: 'Tengo dudas', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'déjame pensarlo y te digo', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },

  { name: 'G3-clear-cancel-then-link-silence',
    messages: [
      { direction: 'inbound',  body: 'Marcos no podré asistir a la llamada', dateAdded: mkTs(10) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(8) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup', expectedDelay: 1,
  },
  { name: 'G3-clear-cancel-then-link-then-yes-i-go',
    messages: [
      { direction: 'inbound',  body: 'Marcos no podré asistir a la llamada', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'al final sí voy, perdón', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G3-no-se-then-link-silence',
    messages: [
      { direction: 'inbound',  body: 'no sé si podré asistir', dateAdded: mkTs(10) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(8) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G3-no-se-then-link-then-reagendo',
    messages: [
      { direction: 'inbound',  body: 'no sé si podré asistir', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'vale cuando pueda reagendo', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'cancel_with_followup',
  },

  { name: 'G3-rescheduled-then-thanks',
    messages: [
      { direction: 'inbound',  body: 'se me complica asistir, pásame para reagendar porfa', dateAdded: mkTs(15) },
      { direction: 'outbound', body: `Claro, ${RESCHEDULE_LINK}`, dateAdded: mkTs(12) },
      { direction: 'inbound',  body: 'gracias!', dateAdded: mkTs(2) },
    ],
    appointments: [
      { id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar llamada', dateAdded: mkTs(8) },
    ],
    expectedIntent: 'no_action',
  },
  { name: 'G3-rescheduled-then-cancel-it',
    messages: [
      { direction: 'inbound',  body: 'se me complica, pásame para reagendar', dateAdded: mkTs(20) },
      { direction: 'outbound', body: `Aquí: ${RESCHEDULE_LINK}`, dateAdded: mkTs(18) },
      { direction: 'inbound',  body: 'gracias!', dateAdded: mkTs(13) },
      { direction: 'inbound',  body: 'ah espera mira mejor cancela también esta nueva, no creo que pueda esta semana', dateAdded: mkTs(2) },
    ],
    appointments: [
      { id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar llamada', dateAdded: mkTs(15) },
    ],
    expectedIntent: 'cancel_with_followup',
  },
  { name: 'G3-rescheduled-then-dejalo',
    messages: [
      { direction: 'inbound',  body: 'se me complica, pásame para reagendar', dateAdded: mkTs(20) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(18) },
      { direction: 'inbound',  body: 'gracias!', dateAdded: mkTs(13) },
      { direction: 'inbound',  body: 'ah no espera al final puedo, déjalo', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1],
    expectedIntent: 'no_action',
  },

  { name: 'G3-cancel-then-link-then-late-gracias',
    messages: [
      { direction: 'inbound',  body: 'no puedo asistir', dateAdded: mkTs(210) },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(205) },
      { direction: 'inbound',  body: 'gracias', dateAdded: mkTs(2) },
    ],
    appointments: [
      { id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar llamada', dateAdded: mkTs(120) },
    ],
    expectedIntent: 'no_action',
  },

  // ===== NEW: hours after rescheduling, lead explicitly cancels the new call =====
  { name: 'G3-cancel-then-link-then-late-explicit-cancel',
    messages: [
      { direction: 'inbound',  body: 'no puedo asistir', dateAdded: mkTs(360) /* 6h ago */ },
      { direction: 'outbound', body: `${RESCHEDULE_LINK}`, dateAdded: mkTs(355) },
      { direction: 'inbound',  body: 'gracias', dateAdded: mkTs(180) /* 3h ago */ },
      { direction: 'inbound',  body: 'oye que al final no quiero tener la llamada', dateAdded: mkTs(2) },
    ],
    appointments: [
      // Only the NEW rescheduled call is active. Lead is now asking to cancel IT.
      { id: 'evt_NEW_RESCHEDULED', startTime: mkFutureTs(2), calendarName: 'Reagendar llamada', dateAdded: mkTs(300) /* created 5h ago, AFTER link */ },
    ],
    expectedIntent: 'cancel_with_followup', // explicit cancel of post-link call
    expectedIdsCount: 1,
  },

  { name: 'G4-cancel-both',
    messages: [
      { direction: 'inbound', body: 'Marcos no puedo ir a las llamadas que tengo agendadas, cancela las dos por favor', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1, APT_2], expectedIntent: 'cancel_with_followup', expectedIdsCount: 2,
  },
  { name: 'G4-cancel-partial-only-one',
    messages: [
      { direction: 'outbound', body: 'Te recuerdo que tienes 2 llamadas agendadas, una el martes y otra el jueves', dateAdded: mkTs(20) },
      { direction: 'inbound',  body: 'Marcos cancela solo la del martes por favor, la del jueves la mantengo', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1, APT_2], expectedIntent: 'cancel_partial', expectedIdsCount: 1,
  },
  { name: 'G4-cancel-unspecified-2-appts',
    messages: [
      { direction: 'inbound', body: 'al final no voy a poder, cancela la llamada', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1, APT_2], expectedIntent: 'cancel_with_followup', expectedIdsCount: 2,
  },

  { name: 'G5-just-vale-alone-no-link',
    messages: [
      { direction: 'outbound', body: 'Te paso el material que te prometí', dateAdded: mkTs(10) },
      { direction: 'inbound',  body: 'vale', dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
  { name: 'G5-audio-untranscribable',
    messages: [
      { direction: 'inbound', body: '', attachments: ['https://example.com/voice.mp4'], dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'audio_needs_review',
  },
  { name: 'G5-image-only',
    messages: [
      { direction: 'inbound', body: '', attachments: ['https://example.com/photo.jpg'], dateAdded: mkTs(2) },
    ],
    appointments: [APT_1], expectedIntent: 'no_action',
  },
];
