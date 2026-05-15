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

// Sets one or more custom fields on a contact in a single PUT, safely
// (preserves all existing customFields). Tries 3 body shapes for compatibility.
async function setContactCustomFields({ authorization, contactId, fields }) {
  // fields = [{ id, value }, ...]
  const cur = await getContact({ authorization, contactId });
  if (!cur.ok) return { ok: false, stage: 'get-contact', errors: cur.errors };
  const contact = cur.contact || {};
  const existing = Array.isArray(contact.customFields) ? contact.customFields : [];

  // Merge: replace existing entries for the same ids, then append the new ones.
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

  // 3) Find ALL active future appointments BEFORE classification.
  const appRes = await findAllActiveFutureAppointmentsForContact({
    authorization, locationId: LOCATION_ID, contactId,
  });
  if (!appRes.ok) {
    return { status: 502, json: { ok: false, error: 'Failed to find appointments', errors: appRes.errors } };
  }
  const appointments = appRes.appointments || [];

  // 4) Classify with Claude.
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

  // 5b) Decide which custom fields to set.
  // Rules:
  //   cancel_with_followup → FOLLOWUP_DELAY + REMOVE_FROM_AUTO (full cancellation, schedule re-engagement, stop reminders)
  //   cancel_no_followup   → REMOVE_FROM_AUTO only (full hard cancellation, no re-engagement)
  //   cancel_partial       → none (contact still has other active calls; do not silence reminders for them)
  const fieldsToSet = [];

  if (decision.intent === 'cancel_with_followup') {
    const optionLabel = mapDelayToOption(decision.followup_delay_days || 1);
    if (!optionLabel) {
      errors.push({ type: 'unknown-delay', received: decision.followup_delay_days });
    } else {
      fieldsToSet.push({
        fieldId: CUSTOM_FIELDS.FOLLOWUP_DELAY.id,
        value: optionLabel,
        label: 'FOLLOWUP_DELAY',
      });
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
  // cancel_partial → fieldsToSet stays empty.

  if (fieldsToSet.length > 0) {
    if (dryRun) {
      for (const f of fieldsToSet) {
        actionsTaken.push({ type: 'set-custom-field', dryRun: true, ...f });
      }
    } else {
      const cfRes = await setContactCustomFields({
        authorization, contactId,
        fields: fieldsToSet.map((f) => ({ id: f.fieldId, value: f.value })),
      });
      if (cfRes.ok) {
        for (const f of fieldsToSet) {
          actionsTaken.push({ type: 'set-custom-field', shape: cfRes.shape, ...f });
        }
      } else {
        errors.push({ type: 'set-custom-fields', error: 'all-shapes-failed', detail: cfRes });
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
