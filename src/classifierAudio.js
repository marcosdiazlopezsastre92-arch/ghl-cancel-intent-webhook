'use strict';

// File-extension and mime-type buckets. Used to decide what to do with
// attachments on inbound messages: transcribe (audio/video), skip (image/doc),
// or unknown (try mime-sniffing later if needed).
const EXT_AUDIO = ['ogg', 'oga', 'mp3', 'm4a', 'mp4a', 'wav', 'aac', 'opus', 'flac', 'amr', 'weba'];
const EXT_VIDEO = ['mp4', 'mov', 'm4v', 'mpeg', 'mpg', '3gp', '3gpp', 'avi', 'mkv', 'webm'];
const EXT_IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'svg', 'tiff', 'tif', 'bmp', 'avif'];
const EXT_DOC = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf', 'odt', 'ods'];

function extOf(url) {
  if (!url || typeof url !== 'string') return '';
  const m = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
  return m ? m[1].toLowerCase() : '';
}

function mimeOf(att) {
  if (!att || typeof att !== 'object') return '';
  return String(att.mimetype || att.mime || att.contentType || att.type || '').toLowerCase();
}

// Returns 'audio' | 'video' | 'image' | 'document' | 'unknown'
function inspectAttachment(att) {
  // String form: just a URL.
  if (typeof att === 'string') {
    const e = extOf(att);
    if (EXT_AUDIO.includes(e)) return 'audio';
    if (EXT_VIDEO.includes(e)) return 'video';
    if (EXT_IMAGE.includes(e)) return 'image';
    if (EXT_DOC.includes(e)) return 'document';
    return 'unknown';
  }
  // Object form: prefer mime, fall back to URL extension.
  const mime = mimeOf(att);
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('application/pdf') || mime.startsWith('application/msword')
      || mime.startsWith('application/vnd.') || mime.startsWith('text/')) return 'document';
  const url = att?.url || att?.link || att?.publicUrl || att?.downloadUrl || '';
  return inspectAttachment(String(url));
}

function collectAttachments(m) {
  if (!m) return [];
  const a = m.attachments;
  if (Array.isArray(a)) return a;
  if (typeof a === 'string' && a) return [a];
  return [];
}

function classifyAttachments(m) {
  const out = { audio: 0, video: 0, image: 0, document: 0, unknown: 0, total: 0 };
  for (const att of collectAttachments(m)) {
    const kind = inspectAttachment(att);
    out[kind] += 1;
    out.total += 1;
  }
  return out;
}

// True when the message looks like a voice/audio note (or a video, which
// Whisper can transcribe by extracting the audio track).
function isAudioMessage(m) {
  if (!m || typeof m !== 'object') return false;
  const mt = String(m.messageType || m.message_type || '').toUpperCase();
  if (mt.includes('VOICE') || mt.includes('AUDIO')) return true;
  const t = String(m.type || '').toUpperCase();
  if (t.includes('VOICE') || t.includes('AUDIO')) return true;
  const c = classifyAttachments(m);
  return (c.audio + c.video) > 0;
}

// True when the message has only non-audio media (image/document).
// Used to short-circuit to no_action without bothering Whisper or Claude.
function isNonAudioMediaOnly(m) {
  const c = classifyAttachments(m);
  if (c.total === 0) return false;
  return (c.audio + c.video) === 0 && (c.image + c.document + c.unknown) > 0;
}

module.exports = {
  isAudioMessage,
  isNonAudioMediaOnly,
  classifyAttachments,
  inspectAttachment,
  collectAttachments,
};
