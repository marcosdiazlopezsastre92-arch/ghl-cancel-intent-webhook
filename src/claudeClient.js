'use strict';

const logger = require('./logger');

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

// Retry policy for transient Anthropic errors (overload, rate limit, network).
//
// Real-world motivation:
//   - 2026-05-18: lost 8 classifications to 529 overloaded_error. Added
//     4-attempt retry with 1s/2s/4s backoff (~7s total).
//   - 2026-05-19: lost another classification despite the retry — Anthropic
//     was overloaded for >7s straight. Expanded to 5 attempts with
//     1s/3s/6s/12s backoff (~22s total) + fallback model on a different
//     capacity pool.
//
// Total worst case: 22s of backoff waits + 5 calls. Still fits within
// Railway/GHL webhook timeouts (~30s). The fallback model attempt adds
// another retry cycle but typically lands on the first try since the
// fallback pool is rarely overloaded simultaneously.
const MAX_ATTEMPTS = 5;
const BACKOFF_SEQUENCE_MS = [1000, 3000, 6000, 12000]; // waits BEFORE attempts 2..5
const MAX_BACKOFF_MS = 16000;
const RETRY_AFTER_CAP_MS = 60000;

// HTTP statuses that warrant a retry. 429 is included because Anthropic
// rate-limits can recover quickly; we honor the Retry-After header when set.
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

function isTransientStatus(status) {
  return TRANSIENT_HTTP_STATUSES.has(status);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt, retryAfterHeader) {
  // Honor Retry-After header (in seconds) if present and reasonable.
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
    }
  }
  // attempt is 1-indexed; BACKOFF_SEQUENCE_MS[i] is the wait BEFORE attempt i+2
  // (so wait[0] runs between attempt 1 and attempt 2).
  const idx = attempt - 1;
  if (idx >= 0 && idx < BACKOFF_SEQUENCE_MS.length) {
    return BACKOFF_SEQUENCE_MS[idx];
  }
  return MAX_BACKOFF_MS;
}

async function attemptCall({ url, headers, body }) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body });
  } catch (err) {
    return { ok: false, transient: true, networkError: true, error: 'fetch-failed', detail: err.message };
  }

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    return {
      ok: false,
      transient: isTransientStatus(res.status),
      status: res.status,
      body: json,
      retryAfter: res.headers.get('retry-after'),
    };
  }

  return { ok: true, json };
}

/**
 * Calls Claude with retries on transient errors for a single model.
 * Returns { ok: true, text, raw, attemptsUsed, modelUsed } on success,
 * or { ok: false, transient, ... } on failure.
 */
async function callOneModel({ url, headers, makeBody, model, modelLabel }) {
  const body = makeBody(model);
  let lastResult = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await attemptCall({ url, headers, body });

    if (result.ok) {
      if (attempt > 1) {
        logger.info('claude succeeded after retry', { attempt, maxAttempts: MAX_ATTEMPTS, model: modelLabel });
      }
      const content = result.json?.content;
      let outputText = '';
      if (Array.isArray(content)) {
        outputText = content
          .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
          .map((c) => c.text)
          .join('\n');
      }
      return { ok: true, text: outputText, raw: result.json, attemptsUsed: attempt, modelUsed: modelLabel };
    }

    lastResult = result;

    // No more retries: either permanent error or out of attempts.
    if (!result.transient || attempt === MAX_ATTEMPTS) {
      const isTransient = !!result.transient;
      if (result.networkError) {
        logger.error('claude fetch failed (final for this model)', {
          attemptsUsed: attempt,
          model: modelLabel,
          transient: isTransient,
          detail: result.detail,
        });
        return {
          ok: false,
          error: 'fetch-failed',
          detail: result.detail,
          attemptsUsed: attempt,
          transient: isTransient,
          modelUsed: modelLabel,
        };
      }
      logger.warn('claude non-OK (final for this model)', {
        attemptsUsed: attempt,
        model: modelLabel,
        transient: isTransient,
        status: result.status,
        body: result.body,
      });
      return {
        ok: false,
        status: result.status,
        body: result.body,
        attemptsUsed: attempt,
        transient: isTransient,
        modelUsed: modelLabel,
      };
    }

    // Transient error with attempts left: backoff and retry.
    const wait = computeBackoff(attempt, result.retryAfter);
    logger.warn('claude transient error, retrying', {
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      model: modelLabel,
      status: result.status || 'network',
      bodyErrorType: result.body?.error?.type || null,
      retryAfter: result.retryAfter || null,
      waitMs: wait,
    });
    await sleep(wait);
  }

  // Defensive fallback (loop should always return).
  return lastResult || { ok: false, error: 'unknown', transient: false, modelUsed: modelLabel };
}

/**
 * Calls Claude with retries. If `fallbackModel` is provided and the primary
 * model exhausts all retries with a transient error, makes one additional
 * retry cycle against the fallback model. The fallback typically lives in
 * a different capacity pool (e.g. Sonnet when Haiku is overloaded), giving
 * the call a second shot at success when Anthropic is having a localized
 * model-specific overload.
 */
async function callClaude({ apiKey, model, fallbackModel, system, userMessage, maxTokens = 1024 }) {
  const url = `${ANTHROPIC_API_BASE}/v1/messages`;
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const makeBody = (mdl) => JSON.stringify({
    model: mdl,
    max_tokens: maxTokens,
    system: system || undefined,
    messages: [{ role: 'user', content: userMessage }],
  });

  // Primary attempt with the requested model.
  const primary = await callOneModel({ url, headers, makeBody, model, modelLabel: model });
  if (primary.ok) return primary;

  // If primary failed for a non-transient reason (auth, bad request, etc.) or
  // there is no fallback configured, return as-is.
  if (!primary.transient || !fallbackModel || fallbackModel === model) {
    return primary;
  }

  logger.warn('claude primary model exhausted on transient error, trying fallback model', {
    primaryModel: model,
    fallbackModel,
    primaryAttempts: primary.attemptsUsed,
    primaryStatus: primary.status || 'network',
    primaryErrorType: primary.body?.error?.type || null,
  });

  const fallback = await callOneModel({
    url, headers, makeBody, model: fallbackModel, modelLabel: fallbackModel,
  });

  if (fallback.ok) {
    logger.info('claude fallback model succeeded', {
      primaryModel: model,
      fallbackModel,
      fallbackAttempts: fallback.attemptsUsed,
    });
    return fallback;
  }

  // Both primary and fallback failed. Surface the primary failure (that's
  // the model the operator configured) but enrich with fallback context.
  logger.error('claude fallback model also failed', {
    primaryModel: model,
    fallbackModel,
    fallbackAttempts: fallback.attemptsUsed,
    fallbackStatus: fallback.status || 'network',
    fallbackErrorType: fallback.body?.error?.type || null,
  });
  return {
    ...primary,
    fallbackTried: fallbackModel,
    fallbackAttemptsUsed: fallback.attemptsUsed,
    fallbackStatus: fallback.status,
    fallbackBody: fallback.body,
  };
}

module.exports = { callClaude };
