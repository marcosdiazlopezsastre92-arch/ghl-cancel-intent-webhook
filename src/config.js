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

// Existing tag for the swap-rate metric: lead que avisó la cancelación.
// Added on full cancels (cancel_with_followup, cancel_no_followup).
const CANCELLATION_NOTICE_TAG = {
  id: 'e6goR8TWrPCWbtTOAwZn',
  name: 'inv x cancelación avisada',
};

// Monitoring tag created via the ghl-ext MCP. Added on full cancels so Marcos
// can filter in GHL all contacts the script touched.
const SCRIPT_APPLIED_TAG = {
  id: '3NdZ9R2hvIBgADWgGTgV',
  name: 'script cancel-intent aplicado',
};

const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'noshow', 'no_show']);

const DEFAULT_CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.80');
const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

// Fallback model used when the primary model (Haiku) exhausts retries on a
// transient error (typically 529 overloaded_error). Sonnet lives in a
// separate capacity pool, so it usually has availability when Haiku is hot.
// Set to empty string to disable the fallback entirely.
const DEFAULT_CLAUDE_FALLBACK_MODEL = process.env.CLAUDE_FALLBACK_MODEL !== undefined
  ? process.env.CLAUDE_FALLBACK_MODEL
  : 'claude-sonnet-4-6';

const DEFAULT_MESSAGES_LOOKBACK = parseInt(process.env.MESSAGES_LOOKBACK || '15', 10);

module.exports = {
  LOCATION_ID, GHL_API_BASE, GHL_API_VERSIONS, FUTURE_WINDOW_DAYS,
  CUSTOM_FIELDS,
  CANCELLATION_NOTICE_TAG, SCRIPT_APPLIED_TAG,
  CANCELLED_STATUSES,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_CLAUDE_FALLBACK_MODEL,
  DEFAULT_MESSAGES_LOOKBACK,
};
