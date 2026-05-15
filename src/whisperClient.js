'use strict';

const logger = require('./logger');

const OPENAI_API_BASE = 'https://api.openai.com';
const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // Whisper limit is 25MB; we leave a margin.

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Downloads the audio file from GHL. Some GHL audio URLs are public; some
// require the PIT token. We try without auth first (faster + works for public),
// then with the GHL Authorization header.
async function downloadAudio({ url, ghlAuthorization }) {
  if (!url || typeof url !== 'string') return { ok: false, error: 'no-url' };

  const attempts = [
    { label: 'no-auth', headers: { 'User-Agent': BROWSER_UA, Accept: '*/*' } },
  ];
  if (ghlAuthorization) {
    attempts.push({
      label: 'with-ghl-auth',
      headers: {
        Authorization: ghlAuthorization,
        'User-Agent': BROWSER_UA,
        Accept: '*/*',
      },
    });
  }

  for (const attempt of attempts) {
    try {
      const res = await fetch(url, { method: 'GET', headers: attempt.headers });
      if (!res.ok) {
        logger.warn('audio download non-OK', { url, attempt: attempt.label, status: res.status });
        continue;
      }
      const lenHeader = parseInt(res.headers.get('content-length') || '0', 10);
      if (lenHeader && lenHeader > MAX_AUDIO_BYTES) {
        return { ok: false, error: 'too-large', bytes: lenHeader };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_AUDIO_BYTES) {
        return { ok: false, error: 'too-large', bytes: buf.length };
      }
      // Try to derive a sensible filename + mime.
      const contentType = res.headers.get('content-type') || 'audio/ogg';
      const ext = guessExtensionFromContentType(contentType) || guessExtensionFromUrl(url) || 'ogg';
      const filename = `audio.${ext}`;
      return { ok: true, buffer: buf, contentType, filename, attempt: attempt.label };
    } catch (err) {
      logger.warn('audio download threw', { url, attempt: attempt.label, error: err.message });
    }
  }
  return { ok: false, error: 'all-attempts-failed' };
}

function guessExtensionFromContentType(ct) {
  if (!ct) return null;
  const c = ct.toLowerCase().split(';')[0].trim();
  const map = {
    'audio/ogg': 'ogg', 'audio/oga': 'oga', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav',
    'audio/x-wav': 'wav', 'audio/flac': 'flac', 'audio/webm': 'webm', 'audio/opus': 'opus',
  };
  return map[c] || null;
}

function guessExtensionFromUrl(url) {
  const m = String(url).match(/\.(ogg|oga|mp3|m4a|wav|aac|opus|flac|webm)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : null;
}

// Sends audio buffer to Whisper. Returns {ok, text} or {ok:false, error}.
async function transcribeAudio({
  apiKey, buffer, filename, contentType,
  model = process.env.WHISPER_MODEL || 'whisper-1',
  language = 'es',
}) {
  if (!apiKey) return { ok: false, error: 'no-openai-api-key' };
  if (!buffer || buffer.length === 0) return { ok: false, error: 'empty-buffer' };

  // Build multipart/form-data using the global FormData/Blob (Node 18+).
  const form = new FormData();
  const blob = new Blob([buffer], { type: contentType || 'audio/ogg' });
  form.append('file', blob, filename || 'audio.ogg');
  form.append('model', model);
  if (language) form.append('language', language);
  // We want plain text back. Whisper supports response_format=text or json.
  form.append('response_format', 'text');

  let res;
  try {
    res = await fetch(`${OPENAI_API_BASE}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    });
  } catch (err) {
    logger.error('whisper fetch threw', { error: err.message });
    return { ok: false, error: 'fetch-failed', detail: err.message };
  }

  const text = await res.text();
  if (!res.ok) {
    logger.warn('whisper non-OK', { status: res.status, body: text.slice(0, 500) });
    return { ok: false, status: res.status, body: text };
  }
  return { ok: true, text: text.trim() };
}

module.exports = { downloadAudio, transcribeAudio, MAX_AUDIO_BYTES };
