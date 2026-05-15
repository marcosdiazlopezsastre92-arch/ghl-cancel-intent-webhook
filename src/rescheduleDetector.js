'use strict';

// URLs that the GHL AI sends when offering the lead a way to reagendar.
// Detect any of these in Coach messages — it's a strong signal that the
// conversation has shifted into a rescheduling flow.
const RESCHEDULE_URL_PATTERNS = [
  /api\.leadconnectorhq\.com\/widget\/bookings\/round-normal/i,
  // Add more here if Marcos discovers other reagendar URLs.
];

function messageContainsRescheduleLink(m) {
  if (!m) return false;
  const body = String(m.body || m.message || m.text || '');
  for (const re of RESCHEDULE_URL_PATTERNS) {
    if (re.test(body)) return true;
  }
  // Some Coach messages put the link as an attachment string.
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

// Returns true if any OUTBOUND (Coach) message in the recent window has
// sent the reschedule link.
function hasRecentRescheduleLink(messages, lookback = 15) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const sorted = [...messages].sort((a, b) => {
    const ta = new Date(a.dateAdded || a.dateCreated || a.createdAt || 0).getTime();
    const tb = new Date(b.dateAdded || b.dateCreated || b.createdAt || 0).getTime();
    return ta - tb;
  });
  const recent = sorted.slice(-lookback);
  for (const m of recent) {
    const dir = (m.direction || '').toLowerCase();
    if (dir !== 'outbound') continue;
    if (messageContainsRescheduleLink(m)) return true;
  }
  return false;
}

module.exports = {
  RESCHEDULE_URL_PATTERNS,
  messageContainsRescheduleLink,
  hasRecentRescheduleLink,
};
