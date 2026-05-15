'use strict';

// Tolerant payload parser. GHL workflow webhooks send fields in many shapes:
// - Customary outbound payload: contact.id, contact.email, etc.
// - Free "Webhook" action: just a few fields, sometimes inside customData.
// - Custom Webhook: whatever JSON you wrote in the workflow.

function pick(obj, paths) {
  for (const p of paths) {
    const parts = p.split('.');
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur && typeof cur === 'object' && part in cur) {
        cur = cur[part];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return undefined;
}

function parsePayload(body, query) {
  const sources = [body || {}, body?.customData || {}, body?.data || {}, body?.payload || {}, body?.trigger_data || {}];
  const merged = Object.assign({}, ...sources);

  const contactId = pick(merged, [
    'contactId', 'contact_id', 'contact.id', 'contact._id',
  ]);
  const locationId = pick(merged, [
    'locationId', 'location_id', 'location.id',
  ]);
  const dryRun = (() => {
    const fromQuery = (query && (query.dryRun || query.dry_run)) || null;
    const fromBody = pick(merged, ['dryRun', 'dry_run']);
    const v = fromQuery ?? fromBody;
    return v === true || v === 'true' || v === '1';
  })();

  return { contactId, locationId, dryRun };
}

module.exports = { parsePayload };
