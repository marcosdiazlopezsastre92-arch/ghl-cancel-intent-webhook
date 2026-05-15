'use strict';

// Hard-coded GHL/LeadConnector context for Marcos's fitness sales subaccount.
const LOCATION_ID = 'Tvq412NEUlGEJHnvW9pa';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSIONS = ['2021-07-28', '2021-04-15', '2023-02-21'];

// Future window (days) when scanning calendar events for the contact's active call.
const FUTURE_WINDOW_DAYS = 365;

// Custom field IDs in the "CLOSER CRM - Lead Hace No Show" group.
const CUSTOM_FIELDS = {
  // CHECKBOX, instructional. Auditoría — marca opcionalmente para señalar que el script ya pasó.
  ALREADY_DONE: {
    id: 'BFAWbPTCnOONyl6om1C2',
    options: { yes: 'Ya lo hice!' },
  },
  // RADIO. Setea el delay del primer seguimiento automático.
  FOLLOWUP_DELAY: {
    id: 'sTNh2qfyefuxHeVwCJCR',
    options: { 1: 'Mañana', 3: 'En 3 días', 7: 'En 7 días' },
  },
  // CHECKBOX. Saca al lead de los recordatorios automáticos. Solo cancelación dura.
  REMOVE_FROM_AUTO: {
    id: 'r7vVLvdariy3DmePUXYR',
    options: { yes: 'Sacar de recordatorios automáticos!' },
  },
};

// Statuses considered already-cancelled (skip when looking for active appt).
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'noshow', 'no_show']);

// Default confidence threshold below which Claude's classification is treated as no_action.
const DEFAULT_CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.80');

// Default Claude model.
const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

// Number of recent messages to send to Claude.
const DEFAULT_MESSAGES_LOOKBACK = parseInt(process.env.MESSAGES_LOOKBACK || '15', 10);

module.exports = {
  LOCATION_ID,
  GHL_API_BASE,
  GHL_API_VERSIONS,
  FUTURE_WINDOW_DAYS,
  CUSTOM_FIELDS,
  CANCELLED_STATUSES,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_MESSAGES_LOOKBACK,
};
