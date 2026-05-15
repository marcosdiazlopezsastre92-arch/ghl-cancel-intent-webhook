'use strict';

// Smoke tests — mocks fetch globally.
const assert = require('assert');
const { isLastInboundBenign, parseClaudeJson, formatMessagesForPrompt } = require('../src/classifier');
const { parsePayload } = require('../src/payload');

// 1) Whitelist tests
assert.strictEqual(isLastInboundBenign([{ direction: 'inbound', body: 'vale' }]), true, 'vale -> benign');
assert.strictEqual(isLastInboundBenign([{ direction: 'inbound', body: 'genial gracias' }]), true, '"genial gracias" -> benign');
assert.strictEqual(isLastInboundBenign([{ direction: 'inbound', body: 'ok' }]), true);
assert.strictEqual(isLastInboundBenign([{ direction: 'inbound', body: '±uy no puedo ir mejor' }]), false, 'cancellation -> not benign');
assert.strictEqual(isLastInboundBenign([{ direction: 'outbound', body: 'vale' }]), false, 'last must be inbound');
assert.strictEqual(isLastInboundBenign([
  { direction: 'inbound', body: 'no puedo' },
  { direction: 'inbound', body: 'vale' },
]), true, 'last inbound is what counts');

// 2) parseClaudeJson tests
assert.deepStrictEqual(
  parseClaudeJson('{"intent":"no_action","confidence":0.9,"followup_delay_days":null,"reasoning":"x"}'),
  { intent: 'no_action', confidence: 0.9, followup_delay_days: null, reasoning: 'x' }
);
assert.deepStrictEqual(
  parseClaudeJson('```json\n{"intent":"cancel_with_followup","confidence":0.95,"followup_delay_days":3,"reasoning":"r"}\n```'),
  { intent: 'cancel_with_followup', confidence: 0.95, followup_delay_days: 3, reasoning: 'r' }
);
assert.strictEqual(parseClaudeJson('not json'), null);

// 3) parsePayload tests
assert.strictEqual(parsePayload({ contact_id: 'abc' }, {}).contactId, 'abc');
assert.strictEqual(parsePayload({ contact: { id: 'xyz' } }, {}).contactId, 'xyz');
assert.strictEqual(parsePayload({}, { dryRun: 'true' }).dryRun, true);
assert.strictEqual(parsePayload({}, {}).dryRun, false);

// 4) formatMessagesForPrompt sorts by date
const out = formatMessagesForPrompt([
  { direction: 'inbound', body: 'B', dateAdded: '2026-05-15T10:01:00Z' },
  { direction: 'outbound', body: 'A', dateAdded: '2026-05-15T10:00:00Z' },
], 10);
assert.ok(out.indexOf('A') < out.indexOf('B'), 'should sort by dateAdded');
assert.ok(out.includes('Coach: A'));
assert.ok(out.includes('Lead: B'));

console.log('OK — all classifier/payload tests passed');
