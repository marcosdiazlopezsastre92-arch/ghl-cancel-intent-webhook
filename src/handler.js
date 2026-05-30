'use strict';

const {
  getLocationConfig,
  DEFAULT_LOCATION_ID,
  ALLOWED_LOCATIONS,
} = require('./config');
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

// Snap any incoming delay to one of {1, 3, 7}. Even though the prompt
// constrains Claude to those values, we treat the LLM output as untrusted.
//   1 or 2 days  → 1
//   3, 4, 5 days → 3
//   6+ days      → 7
//   missing/0/NaN → 1 (default)
function snapDelay(days) {
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (n <= 2) return 1;
  if (n <= 5) return 3;
  return 7;
}

function mapDelayToOption(days, followupDelayCustomField) {
  const snapped = snapDelay(days);
  return { snapped, label: followupDelayCustomField.options[snapped] || null };
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
  const actionsTaken = [];

  const parsed = parsePayload(body, query);
  const { contactId, locationId, dryRun } = parsed;
  logger.info('cancel-intent received', { contactId, locationId, dryRun });

  if (!contactId) return { status: 400, json: { ok: false, error: 'Missing contactId in payload' } };

  // ── Multi-tenant: pick the config for this location ───────────────────
  // If the payload omits locationId, fall back to DEFAULT_LOCATION_ID (Marcos)
  // for backwards-compat with existing workflows.
  const effectiveLocationId = locationId || DEFAULT_LOCATION_ID;
  const locationConfig = getLocationConfig(effectiveLocationId);
  if (!locationConfig) {
    return {
      status: 400,
      json: {
        ok: false,
        error: 'unknown locationId',
        received: effectiveLocationId,
        allowed: ALLOWED_LOCATIONS,
      },
    };
  }
  if (locationId && !getLocationConfig(locationId)) {
    // Defensive check (covered by the above but kept for clarity).
    return {
      status: 400,
      json: { ok: false, error: 'locationId not configured', received: locationId, allowed: ALLOWED_LOCATIONS },
    };
  }
  const CUSTOM_FIELDS = locationConfig.customFields;
  const TAGS = locationConfig.tags;
  logger.info('routing to location', { locationId: effectiveLocationId, name: locationConfig.name });

  if (!apiKey) {
    return { status: 500, json: { ok: false, error: 'Missing ANTHROPIC_API_KEY env var on server' } };
  }

  const convRes = await findConversationForContact({ authorization, locationId: effectiveLocationId, contactId });
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
    authorization, locationId: effectiveLocationId, contactId,
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
  logger.info('classification', {
    decision,
    bypass: cls.bypass,
    transcription: cls.transcriptionStats || null,
    doubleCheckTriggered: !!(cls.doubleCheckMeta && cls.doubleCheckMeta.triggered),
  });

  // ============== SONNET REVIEW AUDIT TAG ==============
  // If the double-check fired (regardless of final intent or whether Sonnet
  // confirmed/changed Haiku's decision), tag the contact for monitoring.
  // This runs BEFORE the early returns so it applies even when the final
  // intent is no_action (e.g. Sonnet overrode Haiku's cancel decision).
  const sonnetReviewed = !!(cls.doubleCheckMeta && cls.doubleCheckMeta.triggered);
  if (sonnetReviewed) {
    if (dryRun) {
      actionsTaken.push({
        type: 'add-tag',
        tag: TAGS.sonnetReviewed.name,
        reason: 'sonnet-double-check',
        dryRun: true,
      });
    } else {
      try {
        const sonnetTagRes = await addContactTags({
          authorization, contactId,
          tags: [TAGS.sonnetReviewed.name],
        });
        if (sonnetTagRes.ok) {
          actionsTaken.push({
            type: 'add-tag',
            tag: TAGS.sonnetReviewed.name,
            reason: 'sonnet-double-check',
            shape: Object.keys(sonnetTagRes.body || {}).join(','),
          });
        } else {
          warnings.push({
            type: 'failed-to-add-sonnet-reviewed-tag',
            detail: sonnetTagRes.errors,
          });
        }
      } catch (err) {
        warnings.push({
          type: 'failed-to-add-sonnet-reviewed-tag',
          error: err.message,
        });
      }
    }
  }

  if (decision.intent === 'audio_needs_review') {
    warnings.push('audio-detected: last inbound is a voice note and could not be transcribed.');
    return {
      status: 200,
      json: {
        ok: true, decision, bypass: cls.bypass, dryRun,
        foundActiveAppointments: appointments.length,
        actionsTaken, transcription: cls.transcriptionStats || null, warnings,
        doubleCheckMeta: cls.doubleCheckMeta || null,
      },
    };
  }

  if (decision.intent === 'no_action') {
    return {
      status: 200,
      json: {
        ok: true, decision, bypass: cls.bypass, dryRun,
        foundActiveAppointments: appointments.length,
        transcription: cls.transcriptionStats || null,
        actionsTaken,
        doubleCheckMeta: cls.doubleCheckMeta || null,
      },
    };
  }

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

  // 2) Custom fields.
  //
  // GHL BUG WORKAROUND: GHL sometimes keeps firing the automatic reminders
  // ("recuerda tu llamada de mañana") even when the appointment is marked
  // as no-show. To guarantee the lead doesn't receive reminders for a
  // cancelled call, REMOVE_FROM_AUTO is set on BOTH full cancel variants
  // (with_followup and no_followup). The seguimiento workflow keeps working
  // because it triggers on FOLLOWUP_DELAY (a different custom field).
  //
  // cancel_partial does NOT get REMOVE_FROM_AUTO because the lead still has
  // other active calls and those DO need their reminders to fire.
  const fieldsToSet = [];
  if (decision.intent === 'cancel_with_followup') {
    const requestedDelay = decision.followup_delay_days;
    const { snapped, label: optionLabel } = mapDelayToOption(requestedDelay, CUSTOM_FIELDS.FOLLOWUP_DELAY);
    if (requestedDelay !== snapped) {
      logger.warn('followup_delay_days snapped to canonical value', {
        received: requestedDelay, applied: snapped,
      });
      warnings.push({
        type: 'delay-snapped',
        received: requestedDelay,
        applied: snapped,
        note: 'Claude returned a non-canonical delay; code mapped it to the nearest valid option.',
      });
    }
    if (!optionLabel) {
      // Should be impossible (snap always returns a key in options) but guard anyway.
      errors.push({ type: 'unknown-delay-after-snap', received: requestedDelay, snapped });
    } else {
      fieldsToSet.push({
        fieldId: CUSTOM_FIELDS.FOLLOWUP_DELAY.id,
        value: optionLabel,
        label: 'FOLLOWUP_DELAY',
        appliedDelayDays: snapped,
      });
    }
    // Safety net: also set REMOVE_FROM_AUTO so GHL stops sending reminders
    // for the noshow'd call (GHL bug — sometimes ignores noshow status).
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
  // Note: cancel_partial does not set custom fields (no auto-followup, and
  // REMOVE_FROM_AUTO would block reminders for the lead's other active
  // calls). We still add the audit tag below so Marcos can see every action.

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

  // 3) Tags (cancel-related).
  // Two tags with DIFFERENT semantics:
  //   - cancellationNotice ("inv x cancelación avisada"): swap-rate
  //     metric. Only on FULL cancels (with_followup / no_followup) where
  //     the lead is exiting the entire call sequence with warning. NOT on
  //     partial cancels — those leads still have other active calls and
  //     adding them would skew the show-up rate.
  //   - scriptApplied ("script cancel-intent aplicado"): audit filter.
  //     Applied on ALL cancel variants (with_followup, no_followup, partial)
  //     so Marcos can review every action the script took in GHL.
  //
  // Note: sonnetReviewed is handled separately above (runs regardless
  // of intent, even on no_action when Sonnet overrode Haiku).
  const isFullCancel = (decision.intent === 'cancel_with_followup'
                     || decision.intent === 'cancel_no_followup');
  const isAnyCancel = isFullCancel || decision.intent === 'cancel_partial';

  const tagsToAdd = [];
  if (isAnyCancel && targets.length > 0) {
    tagsToAdd.push(TAGS.scriptApplied.name);
    if (isFullCancel) tagsToAdd.push(TAGS.cancellationNotice.name);
  }

  if (tagsToAdd.length > 0) {
    if (dryRun) {
      for (const t of tagsToAdd) {
        actionsTaken.push({ type: 'add-tag', tag: t, dryRun: true });
      }
    } else {
      const tagRes = await addContactTags({
        authorization, contactId, tags: tagsToAdd,
      });
      if (tagRes.ok) {
        for (const t of tagsToAdd) {
          actionsTaken.push({ type: 'add-tag', tag: t, shape: Object.keys(tagRes.body || {}).join(',') });
        }
      } else {
        errors.push({ type: 'add-tags', error: 'all-shapes-failed', tags: tagsToAdd });
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
      doubleCheckMeta: cls.doubleCheckMeta || null,
      locationId: effectiveLocationId,
      locationName: locationConfig.name,
    },
  };
}

module.exports = { handleCancelIntent };
