'use strict';

const logger = require('./logger');

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

async function callClaude({ apiKey, model, system, userMessage, maxTokens = 1024 }) {
  const url = `${ANTHROPIC_API_BASE}/v1/messages`;
  const body = {
    model,
    max_tokens: maxTokens,
    system: system || undefined,
    messages: [{ role: 'user', content: userMessage }],
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error('claude fetch threw', { error: err.message });
    return { ok: false, error: 'fetch-failed', detail: err.message };
  }

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

  if (!res.ok) {
    logger.warn('claude non-OK', { status: res.status, body: json });
    return { ok: false, status: res.status, body: json };
  }

  // Pull text out of the standard Anthropic Messages response shape.
  const content = json?.content;
  let outputText = '';
  if (Array.isArray(content)) {
    outputText = content
      .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n');
  }
  return { ok: true, text: outputText, raw: json };
}

module.exports = { callClaude };
