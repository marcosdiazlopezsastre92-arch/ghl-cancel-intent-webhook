'use strict';

const { downloadAudio, transcribeAudio } = require('./whisperClient');
const { isAudioMessage, classifyAttachments, collectAttachments, inspectAttachment } = require('./classifierAudio');
const logger = require('./logger');

// Returns the URL of the first attachment that looks like audio/video.
function firstTranscribableAttachmentUrl(m) {
  for (const att of collectAttachments(m)) {
    const kind = inspectAttachment(att);
    if (kind !== 'audio' && kind !== 'video') continue;
    if (typeof att === 'string') return att;
    return att?.url || att?.link || att?.publicUrl || att?.downloadUrl || null;
  }
  return null;
}

// Transcribes every inbound audio/video in `messages` IN-PLACE: writes the text
// into m.body so downstream code (classifier, prompt formatter) sees real content.
// Returns { transcribed, failed, skipped } counts.
async function transcribeAudiosInPlace({ messages, openaiApiKey, ghlAuthorization }) {
  const counts = { transcribed: 0, failed: 0, skipped: 0 };
  if (!openaiApiKey) {
    counts.skipped = messages.filter((m) => isAudioMessage(m)
      && (m.direction || '').toLowerCase() === 'inbound').length;
    return counts;
  }
  for (const m of messages) {
    if ((m.direction || '').toLowerCase() !== 'inbound') continue;
    if (!isAudioMessage(m)) continue;
    const existing = String(m.body || m.message || m.text || '').trim();
    if (existing) { counts.skipped += 1; continue; }

    const url = firstTranscribableAttachmentUrl(m);
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
    m.body = `[AUDIO TRANSCRITO] ${tx.text}`;
    counts.transcribed += 1;
    logger.info('whisper transcribed', { messageId: m.id || m._id || null, chars: tx.text.length });
  }
  return counts;
}

module.exports = { transcribeAudiosInPlace, firstTranscribableAttachmentUrl };
