'use strict';

// Shared audio detection helper used both by classifier.js and transcribe.js.
// Lives in its own file to avoid a require cycle.
function isAudioMessage(m) {
  if (!m || typeof m !== 'object') return false;
  const mt = String(m.messageType || m.message_type || '').toUpperCase();
  if (mt.includes('VOICE') || mt.includes('AUDIO')) return true;
  const t = String(m.type || '').toUpperCase();
  if (t.includes('VOICE') || t.includes('AUDIO')) return true;
  const atts = m.attachments;
  if (Array.isArray(atts)) {
    for (const a of atts) {
      const mime = String(a?.mimetype || a?.mime || a?.contentType || a?.type || '').toLowerCase();
      if (mime.startsWith('audio/')) return true;
      const url = String(a?.url || a?.link || '').toLowerCase();
      if (/\.(ogg|oga|mp3|m4a|wav|aac|opus|flac|webm)(\?|$)/.test(url)) return true;
    }
  } else if (typeof atts === 'string') {
    if (/\.(ogg|oga|mp3|m4a|wav|aac|opus|flac|webm)/.test(atts.toLowerCase())) return true;
  }
  return false;
}

module.exports = { isAudioMessage };
