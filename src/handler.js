'use strict';

const { LOCATION_ID, CUSTOM_FIELDS, CANCELLATION_NOTICE_TAG } = require('./config');
const { parsePayload } = require('./payload');
const { classify } = require('./classifier');
const {
  findConversationForContact,
  getConversationMessages,
  getContact,
  updateContact,
  addContactTags,
  findAllActiveFutureAppointmentsForContact,
  setAppointmentStatus,
} = require('./ghlClient');
const logger = require('./logger');

function mapDelayToOption(days) {
  return CUSTOM_FIELDS.FOLLOWUP_DELAY.options[days] || null;
}

async function setContactCustomFields({ authorization, contactId, fields }) {
  const cur = await getContact({ authorization, contactId });
  if (!cur.ok) return { ok: false, stage: 'get-contact', errors: cur.errors };
  const contact = cur.contact || {};
  const existing = Array.isArray(contact.customFields) ? contact.customFields : [];
  const targetIds = new Set(fields.map((f) => f.id));
  const merged = existing.filter((cf) => !targetIds.has(cf.id || cf.field_id));
  for (const f of fields) merged.push({ id: f.id, value: f.value });

  const shape1 = await updateContact({ authorization, contactId, body: { customFields: merged } });
  if (shape1.ok) return { ok: true, shape: 'customFields[id,value]', response: shape1.response };
  const shape2 = await updateContact({
    authorization, contactId,
    body: { customFields: merged.map((cf) => ({ id: cf.id, field_value: cf.value })) },
  });
  if (shape2.ok) return { ok: true, shape: 'customFields[id,field_value]', response: shape2.response };
  const map = {};
  for (const cf of merged) map[cf.id] = cf.value;
  const shape3 = await updateContact({ authorization, contactId, body: { customField: map } });
  if (shape3.ok) return { ok: true, shape: 'customField{id:value}', response: shape3.response };
  return { ok: false, stage: 'update-contact', errors: [shape1.errors, shape2.errors, shape3.errors] };
}

async function handleCancelIntent({ authorization, body, query, apiKey, openaiApiKey }) {
  const warnings = [];
  const errors = [];

  const parsed = parsePayload(body, query);
  const { contactId, locationId, dryRun } = parsed;
  logger.info('cancel-intent received', { contactId, locationId, dryRun });

  if (!contactId) return { status: 400, json: { ok: false, error: 'Missing contactId in payload' } };
  if (locationId && locationId !== LOCATION_ID) {
    return { status: 400, json: { ok: false, error: 'locationId mismatch', expected: LOCATION_ID, received: locationId } };
  }
  if (!apiKey) {
    return { status: 500, json: { ok: false, error: 'Missing ANTHROPIC_API_KEY env var on server' } };
  }

  const convRes = await findConversationForContact({ authorization, locationId: LOCATION_ID, contactId });
  if (!convRes.ok || convRes.conversations.length === 0) {
    return { status: 200, json: { ok: true, decision: { intent: 'no_action', reasoning: 'No conversation found' }, warnings: ['no-conversation'] } };
  }
  const convs = [...convRes.conversations].sort((a, b) => {
    const ta = new Date(a.lastMessageDate || a.dateUpdated || 0).getTime();
    const tb = new Date(b.lastMessageDate || b.dateUpdated || 0).getTime();
    return tb - ta;
  });
  const conversation = convs[0];

  const msgsRes = await getConversationMessages({ authorization, conversationId: conversation.id, limit: 30 });
  if (!msgsRes.ok) {
    return { status: 502, json: { ok: false, error: 'Failed to get conversation messages', errors: msgsRes.errors } };
  }
  if (msgsRes.messages.length === 0) {
    return { status: 200, json: { ok: true, decision: { intent: 'no_action', reasoning: 'No messages in conversation' }, warnings: ['empty-conversation'] } };
  }

  const appRes = await findAllActiveFutureAppointmentsForContact({
    authorization, locationId: LOCATION_ID, contactId,
  });
  if (!appRes.ok) {
    return { status: 502, json: { ok: false, error: 'Failed to find appointments', errors: appRes.errors } };
  }
  const appointments = appRes.appointments || [];

  const cls = await classify({
    messages: msgsRes.messages, appointments, apiKey, openaiApiKey,
    ghlAuthorization: authorization,
  });
  if (!cls.ok) {
    return { status: 502, json: { ok: false, error: 'classification-failed', detail: cls } };
  }
  const decision = cls.decision;
  logger.info('classification', { decision, bypass: cls.bypass, transcription: cls.transcriptionStats || null });

  if (decision.intent === 'audio_needs_review') {
    warnings.push('audio-detected: last inbound is a voice note and could not be transcribed.');
    return {
      status: 200,
      json: {
        ok: true, decision, bypass: cls.bypass, dryRun,
        foundActiveAppointments: appointments.length,
        actionsTaken: [], transcription: cls.transcriptionStats || null, warnings,
      },
    };
  }

  if (decision.intent === 'no_action') {
    return {
      status: 200,
      json: {
        ok: true, decision, bypass: cls.bypass, dryRun,
        foundActiveAppointments: appointments.length,
        transcription: cls.transcriptionStats || null, actionsTaken: [],
      },
    };
  }

  const actionsTaken = [];
  const idsToCancel = decision.appointment_ids_to_noshow || [];
  const targets = appointments.filter((a) => idsToCancel.includes(String(a.id)));

  // 1) Mark each targeted appointment as no-show.
  for (const appointment of targets) {
    if (dryRun) {
      actionsTaken.push({ type: 'noshow-appointment', appointmentId: appointment.id,
        startTime: appointment.startTime || appointment.start_time, calendarId: appointment.calendarId, dryRun: true });
      continue;
    }
    const setRes = await setAppointmentStatus({ authorization, eventId: appointment.id, status: 'noshow' });
    if (setRes.ok) {
      actionsTaken.push({ type: 'noshow-appointment', appointmentId: appointment.id,
        startTime: appointment.startTime || appointment.start_time, calendarId: appointment.calendarId,
        version: setRes.version, body: setRes.body });
    } else {
      errors.push({ type: 'noshow-appointment', appointmentId: appointment.id, error: 'all-shapes-failed' });
    }
  }

  // 2) Decide custom fields.
  const fieldsToSet = [];
  if (decision.intent === 'cancel_with_followup') {
    const optionLabel = mapDelayToOption(decision.followup_delay_days || 1);
    if (!optionLabel) {
      errors.push({ type: 'unknown-delay', received: decision.followup_delay_days });
    } else {
      fieldsToSet.push({ fieldId: CUSTOM_FIELDS.FOLLOWUP_DELAY.id, value: optionLabel, label: 'FOLLOWUP_DELAY' });
    }
    fieldsToSet.push({
      fieldId: CUSTOM_FIELDS.REMOVE_FROM_AUTO.id,
      value: CUSTOM_FIELDS.REMOVE_FROM_AUTO.options.yes,
      label: 'REMOVE_FROM_AUTO',
    });
  } else if (decision.intent === 'cancel_no_followup') {
    fieldsToSet.push({
      fieldId: CUSTOM_FIELDS.REMOVE_FROM_AUTO.id,
      value: CUSTOM_FIELDS.REMOVE_FROM_AUTO.options.yes,
      label: 'REMOVE_FROM_AUTO',
    });
  }

  if (fieldsToSet.length > 0) {
    if (dryRun) {
      for (const f of fieldsToSet) actionsTaken.push({ type: 'set-custom-field', dryRun: true, ...f });
    } else {
      const cfRes = await setContactCustomFields({
        authorization, contactId,
        fields: fieldsToSet.map((f) => ({ id: f.fieldId, value: f.value })),
      });
      if (cfRes.ok) {
        for (const f of fieldsToSet) actionsTaken.push({ type: 'set-custom-field', shape: cfRes.shape, ...f });
      } else {
        errors.push({ type: 'set-custom-fields', error: 'all-shapes-failed', detail: cfRes });
      }
    }
  }

  // 3) Add the "inv x cancelación avisada" tag for FULL cancellations only.
  // NOT for cancel_partial (lead still has other active calls).
  const shouldAddCancelTag =
    (decision.intent === 'cancel_with_followup' || decision.intent === 'cancel_no_followup')
    && targets.length > 0; // safety: only if we actually noshow'd something

  if (shouldAddCancelTag) {
    if (dryRun) {
      actionsTaken.push({
        type: 'add-tag', tag: CANCELLATION_NOTICE_TAG.name,
        tagId: CANCELLATION_NOTICE_TAG.id, dryRun: true,
      });
    } else {
      const tagRes = await addContactTags({
        authorization, contactId, tags: [CANCELLATION_NOTICE_TAG.name],
      });
      if (tagRes.ok) {
        actionsTaken.push({
          type: 'add-tag', tag: CANCELLATION_NOTICE_TAG.name,
          tagId: CANCELLATION_NOTICE_TAG.id, shape: Object.keys(tagRes.body || {}).join(','),
        });
      } else {
        errors.push({ type: 'add-tag', error: 'all-shapes-failed' });
      }
    }
  }

  return {
    status: 200,
    json: {
      ok: errors.length === 0,
      decision, bypass: cls.bypass || null,
      conversationId: conversation.id,
      messagesAnalyzed: msgsRes.messages.length,
      foundActiveAppointments: appointments.length,
      appointmentsTargeted: targets.map((a) => ({
        id: a.id, startTime: a.startTime || a.start_time, calendarId: a.calendarId,
      })),
      rejectedClaudeIds: cls.rejectedIds || [],
      transcription: cls.transcriptionStats || null,
      actionsTaken, warnings, errors, dryRun,
    },
  };
}

module.exports = { handleCancelIntent };
