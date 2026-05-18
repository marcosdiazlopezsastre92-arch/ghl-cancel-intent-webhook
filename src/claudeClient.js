'use strict';

const logger = require('./logger');

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

// Retry policy for transient Anthropic errors (overload, rate limit, network).
//
// Real-world motivation: on 2026-05-18 between 8:10-8:38 AM we lost 8
// classifications to 529 overloaded_error from Anthropic. A single retry
// would have caught most of them since Anthropic typically recovers in
// seconds. With 4 attempts + exponential backoff (1s, 2s, 4s) the max
// total time is ~15s of waits + 4 calls, which fits within GHL's webhook
// timeout (~30-60s).
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1000;
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
  // Exponential backoff: 1s, 2s, 4s, 8s, ...
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
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

async function callClaude({ apiKey, model, system, userMessage, maxTokens = 1024 }) {
  const url = `${ANTHROPIC_API_BASE}/v1/messages`;
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system: system || undefined,
    messages: [{ role: 'user', content: userMessage }],
  });

  let lastResult = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await attemptCall({ url, headers, body });

    if (result.ok) {
      if (attempt > 1) {
        logger.info('claude succeeded after retry', { attempt, maxAttempts: MAX_ATTEMPTS });
      }
      const content = result.json?.content;
      let outputText = '';
      if (Array.isArray(content)) {
        outputText = content
          .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
          .map((c) => c.text)
          .join('\n');
      }
      return { ok: true, text: outputText, raw: result.json };
    }

    lastResult = result;

    // No more retries: either permanent error or out of attempts.
    if (!result.transient || attempt === MAX_ATTEMPTS) {
      if (result.networkError) {
        logger.error('claude fetch failed (final)', { attemptsUsed: attempt, detail: result.detail });
        return { ok: false, error: 'fetch-failed', detail: result.detail, attemptsUsed: attempt };
      }
      logger.warn('claude non-OK (final)', {
        attemptsUsed: attempt,
        status: result.status,
        body: result.body,
      });
      return { ok: false, status: result.status, body: result.body, attemptsUsed: attempt };
    }

    // Transient error with attempts left: backoff and retry.
    const wait = computeBackoff(attempt, result.retryAfter);
    logger.warn('claude transient error, retrying', {
      attempt,
      maxAttempts: MAX_ATTEMPTS,
      status: result.status || 'network',
      bodyErrorType: result.body?.error?.type || null,
      retryAfter: result.retryAfter || null,
      waitMs: wait,
    });
    await sleep(wait);
  }

  // Defensive fallback (loop should always return).
  return lastResult || { ok: false, error: 'unknown' };
}

module.exports = { callClaude };
