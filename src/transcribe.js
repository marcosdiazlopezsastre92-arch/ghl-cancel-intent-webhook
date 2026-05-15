'use strict';

const { downloadAudio, transcribeAudio } = require('./whisperClient');
const { isAudioMessage } = require('./classifierAudio');
const logger = require('./logger');

function extractAudioUrl(m) {
  const atts = m && m.attachments;
  if (Array.isArray(atts)) {
    for (const a of atts) {
      if (!a) continue;
      const url = a.url || a.link || a.publicUrl || a.downloadUrl;
      const mime = String(a.mimetype || a.mime || a.contentType || a.type || '').toLowerCase();
      if (url && (mime.startsWith('audio/') || /\.(ogg|oga|mp3|m4a|wav|aac|opus|flac|webm)(\?|$)/i.test(url))) {
        return url;
      }
    }
  } else if (typeof atts === 'string' && /\.(ogg|oga|mp3|m4a|wav|aac|opus|flac|webm)/i.test(atts)) {
    return atts;
  }
  return null;
}

// Transcribes every inbound audio in `messages` IN-PLACE: writes the text into
// m.body so downstream code (classifier, prompt formatter) sees real content.
// Returns { transcribed, failed, skipped } counts.
async function transcribeAudiosInPlace({ messages, openaiApiKey, ghlAuthorization }) {
  const counts = { transcribed: 0, failed: 0, skipped: 0 };
  if (!openaiApiKey) {
    counts.skipped = messages.filter((m) => isAudioMessage(m) && (m.direction || '').toLowerCase() === 'inbound').length;
    return counts;
  }
  for (const m of messages) {
    if ((m.direction || '').toLowerCase() !== 'inbound') continue;
    if (!isAudioMessage(m)) continue;
    // If body is already non-empty, assume someone (or GHL) transcribed it already.
    const existing = String(m.body || m.message || m.text || '').trim();
    if (existing) { counts.skipped += 1; continue; }

    const url = extractAudioUrl(m);
    if (!url) { counts.failed += 1; continue; }

    const dl = await downloadAudio({ url, ghlAuthorization });
    if (!dl.ok) {
      logger.warn('audio download failed', { url, error: dl.error });
      counts.failed += 1;
      continue;
    }
    const tx = await transcribeAudio({
      apiKey: openaiApiKey,
      buffer: dl.buffer,
      filename: dl.filename,
      contentType: dl.contentType,
    });
    if (!tx.ok || !tx.text) {
      logger.warn('whisper transcription failed', { error: tx.error || 'empty', status: tx.status });
      counts.failed += 1;
      continue;
    }
    // Mutate the message: prefix with [AUDIO TRANSCRIBED] for clarity in logs/prompt.
    m.body = `[AUDIO TRANSCRITO] ${tx.text}`;
    counts.transcribed += 1;
    logger.info('whisper transcribed', { messageId: m.id || m._id || null, chars: tx.text.length });
  }
  return counts;
}

module.exports = { transcribeAudiosInPlace, extractAudioUrl };
