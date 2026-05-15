'use strict';

const { GHL_API_BASE, GHL_API_VERSIONS, FUTURE_WINDOW_DAYS, CANCELLED_STATUSES } = require('./config');
const logger = require('./logger');

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function headers(authorization, version) {
  return {
    Authorization: authorization,
    Version: version,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': BROWSER_UA,
  };
}

function msEpoch(d) { return String(d.getTime()); }

async function tryVariants(buildRequest, label) {
  const errors = [];
  for (const version of GHL_API_VERSIONS) {
    try {
      const { url, init } = buildRequest(version);
      const res = await fetch(url, init);
      const text = await res.text();
      let json;
      try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
      if (res.ok) return { ok: true, version, status: res.status, json };
      errors.push({ version, status: res.status, body: json });
      logger.warn(`ghl ${label} non-OK`, { version, status: res.status });
    } catch (err) {
      errors.push({ version, error: err.message });
      logger.warn(`ghl ${label} threw`, { version, error: err.message });
    }
  }
  return { ok: false, errors };
}

// ---- conversations ----------------------------------------------------
async function findConversationForContact({ authorization, locationId, contactId }) {
  const result = await tryVariants((version) => {
    const params = new URLSearchParams({ locationId, contactId });
    return {
      url: `${GHL_API_BASE}/conversations/search?${params}`,
      init: { method: 'GET', headers: headers(authorization, version) },
    };
  }, 'search-conversation');
  if (!result.ok) return { ok: false, errors: result.errors };
  const convs = result.json?.conversations || [];
  return { ok: true, conversations: convs };
}

async function getConversationMessages({ authorization, conversationId, limit = 30 }) {
  const result = await tryVariants((version) => ({
    url: `${GHL_API_BASE}/conversations/${encodeURIComponent(conversationId)}/messages?limit=${limit}`,
    init: { method: 'GET', headers: headers(authorization, version) },
  }), 'get-messages');
  if (!result.ok) return { ok: false, errors: result.errors, messages: [] };
  const msgs = result.json?.messages?.messages
    || result.json?.messages
    || result.json?.data
    || [];
  return { ok: true, messages: Array.isArray(msgs) ? msgs : [] };
}

// ---- contacts ---------------------------------------------------------
async function getContact({ authorization, contactId }) {
  const result = await tryVariants((version) => ({
    url: `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}`,
    init: { method: 'GET', headers: headers(authorization, version) },
  }), 'get-contact');
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, contact: result.json?.contact || result.json };
}

async function updateContact({ authorization, contactId, body }) {
  const result = await tryVariants((version) => ({
    url: `${GHL_API_BASE}/contacts/${encodeURIComponent(contactId)}`,
    init: { method: 'PUT', headers: headers(authorization, version), body: JSON.stringify(body) },
  }), 'update-contact');
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, response: result.json };
}

// ---- calendars / appointments ----------------------------------------
async function listCalendarsForLocation({ authorization, locationId }) {
  const result = await tryVariants((version) => ({
    url: `${GHL_API_BASE}/calendars/?locationId=${encodeURIComponent(locationId)}`,
    init: { method: 'GET', headers: headers(authorization, version) },
  }), 'list-calendars');
  if (!result.ok) return { ok: false, errors: result.errors, calendars: [] };
  const cals = result.json?.calendars || [];
  return { ok: true, calendars: cals };
}

async function listFutureEventsForCalendar({ authorization, locationId, calendarId, startDate, endDate }) {
  const result = await tryVariants((version) => {
    const params = new URLSearchParams({
      locationId, calendarId,
      startTime: msEpoch(startDate),
      endTime: msEpoch(endDate),
    });
    return {
      url: `${GHL_API_BASE}/calendars/events?${params}`,
      init: { method: 'GET', headers: headers(authorization, version) },
    };
  }, `list-events[${calendarId}]`);
  if (!result.ok) return { ok: false, errors: result.errors, events: [] };
  const events = result.json?.events || result.json?.appointments || [];
  return { ok: true, events: Array.isArray(events) ? events : [] };
}

// Returns ALL active future appointments for the contact across all calendars.
// Sorted by startTime ascending (closest first).
async function findAllActiveFutureAppointmentsForContact({ authorization, locationId, contactId }) {
  const calRes = await listCalendarsForLocation({ authorization, locationId });
  if (!calRes.ok) return { ok: false, errors: [{ stage: 'list-calendars', errors: calRes.errors }] };

  const now = new Date();
  const end = new Date(now.getTime() + FUTURE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const allEvents = [];
  const partialErrors = [];

  for (const cal of calRes.calendars) {
    if (cal.isActive === false) continue;
    const evRes = await listFutureEventsForCalendar({
      authorization, locationId, calendarId: cal.id, startDate: now, endDate: end,
    });
    if (!evRes.ok) {
      partialErrors.push({ calendarId: cal.id, errors: evRes.errors });
      continue;
    }
    for (const ev of evRes.events) {
      if (!ev.calendarId) ev.calendarId = cal.id;
      allEvents.push(ev);
    }
  }

  const contactsMatch = (ev) => {
    const cid = ev.contactId || ev.contact_id || ev.contact?.id || ev.contact?._id;
    return cid && String(cid) === String(contactId);
  };
  const isFuture = (ev) => {
    const t = ev.startTime || ev.start_time;
    if (!t) return true;
    const d = new Date(t);
    return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
  };
  const isActive = (ev) => {
    if (ev.deleted === true) return false;
    const status = String(ev.appointmentStatus || ev.status || '').toLowerCase();
    return !CANCELLED_STATUSES.has(status);
  };

  const candidates = allEvents.filter((ev) => contactsMatch(ev) && isFuture(ev) && isActive(ev));
  candidates.sort(
    (a, b) => new Date(a.startTime || a.start_time) - new Date(b.startTime || b.start_time)
  );

  return { ok: true, appointments: candidates, partialErrors };
}

async function setAppointmentStatus({ authorization, eventId, status }) {
  const bodyVariants = [
    { appointmentStatus: status },
    { status },
    { appointmentStatus: status, notifyContact: false },
  ];
  for (const body of bodyVariants) {
    const result = await tryVariants((version) => ({
      url: `${GHL_API_BASE}/calendars/events/appointments/${encodeURIComponent(eventId)}`,
      init: { method: 'PUT', headers: headers(authorization, version), body: JSON.stringify(body) },
    }), `set-appt-status(${Object.keys(body).join(',')})`);
    if (result.ok) return { ok: true, version: result.version, body, response: result.json };
  }
  return { ok: false };
}

module.exports = {
  findConversationForContact,
  getConversationMessages,
  getContact,
  updateContact,
  findAllActiveFutureAppointmentsForContact,
  setAppointmentStatus,
};
