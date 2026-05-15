'use strict';

const { LOCATION_ID, CUSTOM_FIELDS } = require('./config');
const { parsePayload } = require('./payload');
const { classify } = require('./classifier');
const {
  findConversationForContact,
  getConversationMessages,
  getContact,
  updateContact,
  findActiveFutureAppointmentForContact,
  setAppointmentStatus,
} = require('./ghlClient');
const logger = require('./logger');

function mapDelayToOption(days) {
  return CUSTOM_FIELDS.FOLLOWUP_DELAY.options[days] || null;
}

// GHL accepts customFields in a few shapes; we try them in order.
async function setContactCustomField({ authorization, contactId, fieldId, value }) {
  // Get current contact to merge customFields safely.
  const cur = await getContact({ authorization, contactId });
  if (!cur.ok) return { ok: false, stage: 'get-contact', errors: cur.errors };
  const contact = cur.contact || {};
  const existing = Array.isArray(contact.customFields) ? contact.customFields : [];

  // Merge: replace if same id, else append.
  const merged = existing.filter((cf) => (cf.id || cf.field_id) !== fieldId);
  merged.push({ id: fieldId, value });

  // Try shape #1: { customFields: [{id, value}] }
  const shape1 = await updateContact({ authorization, contactId, body: { customFields: merged } });
  if (shape1.ok) return { ok: true, shape: 'customFields[id,value]', response: shape1.response };

  // Try shape #2: same but using field_value
  const shape2 = await updateContact({
    authorization, contactId,
    body: { customFields: merged.map((cf) => ({ id: cf.id, field_value: cf.value })) },
  });
  if (shape2.ok) return { ok: true, shape: 'customFields[id,field_value]', response: shape2.response };

  // Try shape #3: customField (singular) wrapper map
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

  // 1) Find the conversation for this contact.
  const convRes = await findConversationForContact({ authorization, locationId: LOCATION_ID, contactId });
  if (!convRes.ok || convRes.conversations.length === 0) {
    return {
      status: 200,
      json: {
        ok: true, decision: { intent: 'no_action', reasoning: 'No conversation found for contact' },
        warnings: ['no-conversation'],
      },
    };
  }
  // Pick the most recently updated conversation (usually the active one).
  const convs = [...convRes.conversations].sort((a, b) => {
    const ta = new Date(a.lastMessageDate || a.dateUpdated || 0).getTime();
    const tb = new Date(b.lastMessageDate || b.dateUpdated || 0).getTime();
    return tb - ta;
  });
  const conversation = convs[0];

  // 2) Pull recent messages.
  const msgsRes = await getConversationMessages({ authorization, conversationId: conversation.id, limit: 30 });
  if (!msgsRes.ok) {
    return {
      status: 502,
      json: { ok: false, error: 'Failed to get conversation messages', errors: msgsRes.errors },
    };
  }
  if (msgsRes.messages.length === 0) {
    return {
      status: 200,
      json: {
        ok: true, decision: { intent: 'no_action', reasoning: 'No messages in conversation' },
        warnings: ['empty-conversation'],
      },
    };
  }

  // 3) Classify with Claude (with whitelist + threshold).
  const cls = await classify({ messages: msgsRes.messages, apiKey });
  if (!cls.ok) {
    return { status: 502, json: { ok: false, error: 'classification-failed', detail: cls } };
  }
  const decision = cls.decision;
  logger.info('classification', { decision, bypass: cls.bypass });

  // 4) Act based on decision.
  if (decision.intent === 'no_action') {
    return {
      status: 200,
      json: { ok: true, decision, bypass: cls.bypass, dryRun, actionsTaken: [] },
    };
  }

  // For both cancel_* intents we need to find the active future appointment.
  const appRes = await findActiveFutureAppointmentForContact({
    authorization, locationId: LOCATION_ID, contactId,
  });
  if (!appRes.ok) {
    return { status: 502, json: { ok: false, error: 'Failed to find appointment', errors: appRes.errors } };
  }
  if (!appRes.appointment) {
    warnings.push('No active future appointment found for contact');
  }
  const appointment = appRes.appointment;
  const actionsTaken = [];

  // 4a) Mark appointment as no-show.
  if (appointment) {
    if (dryRun) {
      actionsTaken.push({ type: 'noshow-appointment', appointmentId: appointment.id, dryRun: true });
    } else {
      const setRes = await setAppointmentStatus({ authorization, eventId: appointment.id, status: 'noshow' });
      if (setRes.ok) {
        actionsTaken.push({ type: 'noshow-appointment', appointmentId: appointment.id, version: setRes.version, body: setRes.body });
      } else {
        errors.push({ type: 'noshow-appointment', error: 'all-shapes-failed' });
      }
    }
  }

  // 4b) Set the right custom field.
  let fieldUpdate = null;
  if (decision.intent === 'cancel_with_followup') {
    const optionLabel = mapDelayToOption(decision.followup_delay_days || 1);
    if (!optionLabel) {
      errors.push({ type: 'unknown-delay', received: decision.followup_delay_days });
    } else {
      fieldUpdate = { fieldId: CUSTOM_FIELDS.FOLLOWUP_DELAY.id, value: optionLabel, label: 'FOLLOWUP_DELAY' };
    }
  } else if (decision.intent === 'cancel_no_followup') {
    fieldUpdate = {
      fieldId: CUSTOM_FIELDS.REMOVE_FROM_AUTO.id,
      value: CUSTOM_FIELDS.REMOVE_FROM_AUTO.options.yes,
      label: 'REMOVE_FROM_AUTO',
    };
  }

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
      appointment: appointment ? { id: appointment.id, startTime: appointment.startTime, calendarId: appointment.calendarId } : null,
      actionsTaken,
      warnings,
      errors,
      dryRun,
    },
  };
}

module.exports = { handleCancelIntent };
