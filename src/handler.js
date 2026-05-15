'use strict';

const { LOCATION_ID, CUSTOM_FIELDS } = require('./config');
const { parsePayload } = require('./payload');
const { classify } = require('./classifier');
const {
  findConversationForContact,
  getConversationMessages,
  getContact,
  updateContact,
  findAllActiveFutureAppointmentsForContact,
  setAppointmentStatus,
} = require('./ghlClient');
const logger = require('./logger');

function mapDelayToOption(days) {
  return CUSTOM_FIELDS.FOLLOWUP_DELAY.options[days] || null;
}

async function setContactCustomField({ authorization, contactId, fieldId, value }) {
  const cur = await getContact({ authorization, contactId });
  if (!cur.ok) return { ok: false, stage: 'get-contact', errors: cur.errors };
  const contact = cur.contact || {};
  const existing = Array.isArray(contact.customFields) ? contact.customFields : [];
  const merged = existing.filter((cf) => (cf.id || cf.field_id) !== fieldId);
  merged.push({ id: fieldId, value });

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

async function handleCancelIntent({ authorization, body, query, apiKey }) {
  const warnings = [];
  const errors = [];

  const parsed = parsePayload(body, query);
  const { contactId, locationId, dryRun } = parsed;
  logger.info('cancel-intent received', { contactId, locationId, dryRun });

  if (!contactId) {
    return { status: 400, json: { ok: false, error: 'Missing contactId in payload' } };
  }
  if (locationId && locationId !== LOCATION_ID) {
    return { status: 400, json: { ok: false, error: 'locationId mismatch', expected: LOCATION_ID, received: locationId } };
  }
  if (!apiKey) {
    return { status: 500, json: { ok: false, error: 'Missing ANTHROPIC_API_KEY env var on server' } };
  }

  // 1) Find the conversation.
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

  // 2) Pull messages.
  const msgsRes = await getConversationMessages({ authorization, conversationId: conversation.id, limit: 30 });
  if (!msgsRes.ok) {
    return { status: 502, json: { ok: false, error: 'Failed to get conversation messages', errors: msgsRes.errors } };
  }
  if (msgsRes.messages.length === 0) {
    return { status: 200, json: { ok: true, decision: { intent: 'no_action', reasoning: 'No messages in conversation' }, warnings: ['empty-conversation'] } };
  }

  // 3) Find ALL active future appointments BEFORE classification — we pass them to Claude.
  const appRes = await findAllActiveFutureAppointmentsForContact({
    authorization, locationId: LOCATION_ID, contactId,
  });
  if (!appRes.ok) {
    return { status: 502, json: { ok: false, error: 'Failed to find appointments', errors: appRes.errors } };
  }
  const appointments = appRes.appointments || [];

  // 4) Classify with Claude (whitelist + threshold + ID validation inside).
  const cls = await classify({ messages: msgsRes.messages, appointments, apiKey });
  if (!cls.ok) {
    return { status: 502, json: { ok: false, error: 'classification-failed', detail: cls } };
  }
  const decision = cls.decision;
  logger.info('classification', { decision, bypass: cls.bypass });

  // 5) Act based on decision.
  if (decision.intent === 'no_action') {
    return {
      status: 200,
      json: {
        ok: true, decision, bypass: cls.bypass, dryRun,
        foundActiveAppointments: appointments.length,
        actionsTaken: [],
      },
    };
  }

  const actionsTaken = [];
  const idsToCancel = decision.appointment_ids_to_noshow || [];
  const targets = appointments.filter((a) => idsToCancel.includes(String(a.id)));

  // 5a) Mark each targeted appointment as no-show.
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

  // 5b) Set the right custom field — only for FULL cancellations (not partial).
  let fieldUpdate = null;
  if (decision.intent === 'cancel_with_followup') {
    const optionLabel = mapDelayToOption(decision.followup_delay_days || 1);
    if (!optionLabel) {
      errors.push({ type: 'unknown-delay', received: decision.followup_delay_days });
    } else {
      fieldUpdate = { fieldId: CUSTOM_FIELDS.FOLLOWUP_DELAY.id, value: optionLabel, label: 'FOLLOWUP_DELAY' };
    }
  } else if (decision.intent === 'cancel_no_followup') {
    fieldUpdate = { fieldId: CUSTOM_FIELDS.REMOVE_FROM_AUTO.id,
      value: CUSTOM_FIELDS.REMOVE_FROM_AUTO.options.yes, label: 'REMOVE_FROM_AUTO' };
  }
  // cancel_partial → NO field update (contact still has other calls).

  if (fieldUpdate) {
    if (dryRun) {
      actionsTaken.push({ type: 'set-custom-field', dryRun: true, ...fieldUpdate });
    } else {
      const cfRes = await setContactCustomField({
        authorization, contactId, fieldId: fieldUpdate.fieldId, value: fieldUpdate.value,
      });
      if (cfRes.ok) {
        actionsTaken.push({ type: 'set-custom-field', shape: cfRes.shape, ...fieldUpdate });
      } else {
        errors.push({ type: 'set-custom-field', error: 'all-shapes-failed', detail: cfRes });
      }
    }
  }

  return {
    status: 200,
    json: {
      ok: errors.length === 0,
      decision,
      bypass: cls.bypass || null,
      conversationId: conversation.id,
      messagesAnalyzed: msgsRes.messages.length,
      foundActiveAppointments: appointments.length,
      appointmentsTargeted: targets.map((a) => ({
        id: a.id, startTime: a.startTime || a.start_time, calendarId: a.calendarId,
      })),
      rejectedClaudeIds: cls.rejectedIds || [],
      actionsTaken, warnings, errors, dryRun,
    },
  };
}

module.exports = { handleCancelIntent };
