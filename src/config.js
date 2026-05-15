'use strict';

const LOCATION_ID = 'Tvq412NEUlGEJHnvW9pa';
const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSIONS = ['2021-07-28', '2021-04-15', '2023-02-21'];
const FUTURE_WINDOW_DAYS = 365;

const CUSTOM_FIELDS = {
  ALREADY_DONE: { id: 'BFAWbPTCnOONyl6om1C2', options: { yes: 'Ya lo hice!' } },
  FOLLOWUP_DELAY: {
    id: 'sTNh2qfyefuxHeVwCJCR',
    options: { 1: 'Mañana', 3: 'En 3 días', 7: 'En 7 días' },
  },
  REMOVE_FROM_AUTO: {
    id: 'r7vVLvdariy3DmePUXYR',
    options: { yes: 'Sacar de recordatorios automáticos!' },
  },
};

// Existing location-level tag (do NOT create a new one).
// Found via GHL find_location_tag tool. id is informational — GHL accepts
// adding by tag NAME via POST /contacts/{id}/tags.
const CANCELLATION_NOTICE_TAG = {
  id: 'e6goR8TWrPCWbtTOAwZn',
  name: 'inv x cancelación avisada',
};

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'noshow', 'no_show']);

const DEFAULT_CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.80');
const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const DEFAULT_MESSAGES_LOOKBACK = parseInt(process.env.MESSAGES_LOOKBACK || '15', 10);

module.exports = {
  LOCATION_ID,
  GHL_API_BASE,
  GHL_API_VERSIONS,
  FUTURE_WINDOW_DAYS,
  CUSTOM_FIELDS,
  CANCELLATION_NOTICE_TAG,
  CANCELLED_STATUSES,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_MESSAGES_LOOKBACK,
};
