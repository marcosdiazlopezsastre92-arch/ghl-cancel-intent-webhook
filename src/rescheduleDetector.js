'use strict';

const RESCHEDULE_URL_PATTERNS = [
  /api\.leadconnectorhq\.com\/widget\/bookings\/round-normal/i,
];

function messageContainsRescheduleLink(m) {
  if (!m) return false;
  const body = String(m.body || m.message || m.text || '');
  for (const re of RESCHEDULE_URL_PATTERNS) {
    if (re.test(body)) return true;
  }
  const atts = m.attachments;
  if (Array.isArray(atts)) {
    for (const a of atts) {
      const s = typeof a === 'string' ? a : (a?.url || a?.link || '');
      for (const re of RESCHEDULE_URL_PATTERNS) {
        if (re.test(s)) return true;
      }
    }
  }
  return false;
}

function tsOf(m) {
  return new Date(m?.dateAdded || m?.dateCreated || m?.createdAt || 0).getTime() || 0;
}

function hasRecentRescheduleLink(messages, lookback = 15) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const sorted = [...messages].sort((a, b) => tsOf(a) - tsOf(b));
  const recent = sorted.slice(-lookback);
  for (const m of recent) {
    const dir = (m.direction || '').toLowerCase();
    if (dir !== 'outbound') continue;
    if (messageContainsRescheduleLink(m)) return true;
  }
  return false;
}

// True only when the last inbound message happened AFTER the most recent
// outbound message that contained a reschedule link. This is the genuinely
// ambiguous case (lead replied to the link). When the lead spoke first and
// the AI sent the link as a response, this returns false — the lead's
// original intent should still count with normal confidence.
function isLeadReplyAfterRescheduleLink(messages, lookback = 15) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const sorted = [...messages].sort((a, b) => tsOf(a) - tsOf(b));
  const recent = sorted.slice(-lookback);

  let lastLinkTs = 0;
  for (const m of recent) {
    if ((m.direction || '').toLowerCase() !== 'outbound') continue;
    if (messageContainsRescheduleLink(m)) {
      const t = tsOf(m);
      if (t > lastLinkTs) lastLinkTs = t;
    }
  }
  if (lastLinkTs === 0) return false;

  let lastInboundTs = 0;
  for (const m of recent) {
    if ((m.direction || '').toLowerCase() !== 'inbound') continue;
    const t = tsOf(m);
    if (t > lastInboundTs) lastInboundTs = t;
  }
  return lastInboundTs > lastLinkTs;
}

module.exports = {
  RESCHEDULE_URL_PATTERNS,
  messageContainsRescheduleLink,
  hasRecentRescheduleLink,
  isLeadReplyAfterRescheduleLink,
};
