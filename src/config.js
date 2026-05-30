'use strict';

// ════════════════════════════════════════════════════════════════════════
// MULTI-TENANT CONFIG
// ════════════════════════════════════════════════════════════════════════
//
// Each subaccount (GHL location) lives as an entry in LOCATIONS, keyed by
// its locationId. The handler picks the right config based on the locationId
// that arrives in the webhook payload.
//
// To add a new subaccount: append a new entry to LOCATIONS with its own
// customFields and tags. The handler will route to it automatically.
//
// BACKWARDS COMPAT: if the payload omits locationId, the handler falls back
// to DEFAULT_LOCATION_ID (Marcos's subaccount). This keeps Marcos's existing
// workflows working without any GHL-side changes.
//
// AUTH: each subaccount's PIT (Private Integration Token) is sent in the
// Authorization header of the webhook itself (configured in the GHL
// workflow). The server reads it from the header. As a fallback, the
// GHL_API_TOKEN env var is used (configured for Marcos's PIT historically).

const LOCATIONS = {
  // ─── MARCOS DAZ FITNESS ──────────────────────────────────────────────
  'Tvq412NEUlGEJHnvW9pa': {
    name: 'Marcos Daz Fitness',
    customFields: {
      ALREADY_DONE: { id: 'BFAWbPTCnOONyl6om1C2', options: { yes: 'Ya lo hice!' } },
      FOLLOWUP_DELAY: {
        id: 'sTNh2qfyefuxHeVwCJCR',
        options: { 1: 'Mañana', 3: 'En 3 días', 7: 'En 7 días' },
      },
      REMOVE_FROM_AUTO: {
        id: 'r7vVLvdariy3DmePUXYR',
        options: { yes: 'Sacar de recordatorios automáticos!' },
      },
    },
    tags: {
      cancellationNotice: { id: 'e6goR8TWrPCWbtTOAwZn', name: 'inv x cancelación avisada' },
      scriptApplied: { id: '3NdZ9R2hvIBgADWgGTgV', name: 'script cancel-intent aplicado' },
      sonnetReviewed: { id: 'BR99TFFalPsBf2bfquUk', name: 'intent revisado por sonnet' },
    },
  },

  // ─── Add new subaccounts here ───────────────────────────────────────
  // '<NEW_LOCATION_ID>': {
  //   name: '...',
  //   customFields: { ALREADY_DONE: {...}, FOLLOWUP_DELAY: {...}, REMOVE_FROM_AUTO: {...} },
  //   tags: { cancellationNotice: {...}, scriptApplied: {...}, sonnetReviewed: {...} },
  // },
};

// Default location for backwards-compat. If the payload omits locationId,
// fall back to Marcos. This keeps the existing workflow working unchanged.
const DEFAULT_LOCATION_ID = 'Tvq412NEUlGEJHnvW9pa';

// List of allowed locationIds for validation and /health endpoint.
const ALLOWED_LOCATIONS = Object.keys(LOCATIONS);

/**
 * Get the per-location config block.
 * @param {string|undefined} locationId
 * @returns {object|null} the config for that location, or null if unknown
 */
function getLocationConfig(locationId) {
  if (!locationId) return LOCATIONS[DEFAULT_LOCATION_ID] || null;
  return LOCATIONS[locationId] || null;
}

// Backwards-compat alias for any code that still imports LOCATION_ID.
// Points to the default (Marcos) location.
const LOCATION_ID = DEFAULT_LOCATION_ID;

// ════════════════════════════════════════════════════════════════════════
// LEGACY EXPORTS (backwards-compat for handler.js until it's refactored)
// ════════════════════════════════════════════════════════════════════════
//
// These point to the DEFAULT location (Marcos). Once handler.js is refactored
// to use getLocationConfig() per request, these can be removed.

const _DEFAULT = LOCATIONS[DEFAULT_LOCATION_ID];
const CUSTOM_FIELDS = _DEFAULT.customFields;
const CANCELLATION_NOTICE_TAG = _DEFAULT.tags.cancellationNotice;
const SCRIPT_APPLIED_TAG = _DEFAULT.tags.scriptApplied;
const SONNET_REVIEWED_TAG = _DEFAULT.tags.sonnetReviewed;

// ════════════════════════════════════════════════════════════════════════
// GLOBAL CONSTANTS (not per-location)
// ════════════════════════════════════════════════════════════════════════

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_API_VERSIONS = ['2021-07-28', '2021-04-15', '2023-02-21'];
const FUTURE_WINDOW_DAYS = 365;

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
  // Multi-tenant (new)
  LOCATIONS,
  DEFAULT_LOCATION_ID,
  ALLOWED_LOCATIONS,
  getLocationConfig,
  // Backwards-compat aliases (deprecated; remove after handler refactor)
  LOCATION_ID,
  CUSTOM_FIELDS,
  CANCELLATION_NOTICE_TAG,
  SCRIPT_APPLIED_TAG,
  SONNET_REVIEWED_TAG,
  // Global
  GHL_API_BASE, GHL_API_VERSIONS, FUTURE_WINDOW_DAYS,
  CANCELLED_STATUSES,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_CLAUDE_FALLBACK_MODEL,
  DEFAULT_MESSAGES_LOOKBACK,
};
