'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const { handleCancelIntent } = require('./handler');
const { classify } = require('./classifier');
const { LOCATION_ID, DEFAULT_CLAUDE_MODEL, DEFAULT_CONFIDENCE_THRESHOLD } = require('./config');
const logger = require('./logger');
const testCases = require('./testCases');

const app = express();
app.use(express.json({ limit: '512kb' }));
app.disable('x-powered-by');

function resolveAuthorization(req) {
  const fromHeader = req.get('authorization') || req.get('Authorization');
  if (fromHeader) return fromHeader;
  const fromEnv = process.env.GHL_API_TOKEN;
  if (fromEnv && fromEnv.trim()) {
    const v = fromEnv.trim();
    return /^bearer\s+/i.test(v) ? v : `Bearer ${v}`;
  }
  return null;
}

function resolveProvidedSecret(req) {
  return (
    req.get('x-webhook-secret') ||
    (req.query && (req.query.secret || req.query.webhookSecret)) ||
    (req.body && (req.body.secret || req.body.webhookSecret)) ||
    null
  );
}

function requireAuth(req, res, next) {
  const requiredSecret = process.env.WEBHOOK_SECRET;
  if (requiredSecret) {
    const provided = resolveProvidedSecret(req);
    if (provided !== requiredSecret) {
      return res.status(401).json({ ok: false, error: 'Invalid or missing webhook secret' });
    }
  }
  const authorization = resolveAuthorization(req);
  if (!authorization) {
    return res.status(401).json({
      ok: false,
      error: 'Missing GHL token. Set GHL_API_TOKEN env var on the server, or send Authorization: Bearer <token>.',
    });
  }
  req.ghlAuthorization = authorization;
  next();
}

function requireSecretOnly(req, res, next) {
  const requiredSecret = process.env.WEBHOOK_SECRET;
  if (requiredSecret) {
    const provided = resolveProvidedSecret(req);
    if (provided !== requiredSecret) {
      return res.status(401).json({ ok: false, error: 'Invalid or missing webhook secret' });
    }
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true, service: 'ghl-cancel-intent-webhook', locationId: LOCATION_ID,
    claudeModel: DEFAULT_CLAUDE_MODEL, confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
    requiresWebhookSecret: Boolean(process.env.WEBHOOK_SECRET),
    serverTokenConfigured: Boolean(process.env.GHL_API_TOKEN),
    anthropicKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    openaiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'status.html'), 'utf8');
  res.set('Content-Type', 'text/html; charset=utf-8').send(
    html.replace(/{{LOCATION_ID}}/g, LOCATION_ID)
        .replace(/{{MODEL}}/g, DEFAULT_CLAUDE_MODEL)
        .replace(/{{THRESHOLD}}/g, String(DEFAULT_CONFIDENCE_THRESHOLD))
        .replace(/{{HAS_KEY}}/g, process.env.ANTHROPIC_API_KEY ? 'yes' : 'NO (set ANTHROPIC_API_KEY)')
  );
});

app.post('/webhook/ghl/cancel-intent', requireAuth, async (req, res) => {
  try {
    const result = await handleCancelIntent({
      authorization: req.ghlAuthorization, body: req.body || {}, query: req.query || {},
      apiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
    });
    res.status(result.status).json(result.json);
  } catch (err) {
    logger.error('handler threw', { error: err.message, stack: err.stack });
    res.status(500).json({ ok: false, error: 'Internal error', message: err.message });
  }
});

// ===================== TEST ENDPOINTS =====================
// Run a single ad-hoc case through the classifier (no GHL calls).
app.post('/test/classify', requireSecretOnly, async (req, res) => {
  try {
    const { messages = [], appointments = [] } = req.body || {};
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY missing on server' });
    }
    const result = await classify({
      messages, appointments,
      apiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: null,
      ghlAuthorization: null,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, stack: err.stack });
  }
});

// Run the entire hardcoded test suite (real Claude calls).
app.get('/test/run-suite', requireSecretOnly, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY missing on server' });
  }
  const results = [];
  let passed = 0, failed = 0;

  for (const tc of testCases) {
    let cls;
    try {
      cls = await classify({
        messages: tc.messages, appointments: tc.appointments,
        apiKey: process.env.ANTHROPIC_API_KEY,
        openaiApiKey: null, ghlAuthorization: null,
      });
    } catch (err) {
      results.push({ name: tc.name, error: err.message, pass: false });
      failed += 1;
      continue;
    }
    const actual = cls?.decision?.intent || 'ERROR';
    const expected = tc.expectedIntent;
    const intentOk = actual === expected;
    let delayOk = true, idsOk = true;
    if (tc.expectedDelay !== undefined) {
      delayOk = (cls.decision?.followup_delay_days === tc.expectedDelay);
    }
    if (tc.expectedIdsCount !== undefined) {
      idsOk = (cls.decision?.appointment_ids_to_noshow?.length === tc.expectedIdsCount);
    }
    const pass = intentOk && delayOk && idsOk;
    if (pass) passed += 1; else failed += 1;
    results.push({
      name: tc.name,
      lastLeadMessage: tc.messages.filter(m => m.direction === 'inbound').slice(-1)[0]?.body || '(audio/empty)',
      expected, actual,
      expectedDelay: tc.expectedDelay, actualDelay: cls.decision?.followup_delay_days,
      expectedIdsCount: tc.expectedIdsCount, actualIdsCount: cls.decision?.appointment_ids_to_noshow?.length,
      confidence: cls.decision?.confidence,
      bypass: cls.bypass || null,
      rescheduleLinkSent: cls.rescheduleLinkSent || false,
      reasoning: cls.decision?.reasoning,
      pass,
    });
  }

  res.json({
    total: testCases.length, passed, failed,
    passRate: testCases.length > 0 ? Math.round((passed / testCases.length) * 100) : 0,
    timestamp: new Date().toISOString(),
    cases: results,
  });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found', path: req.path });
});

const PORT = parseInt(process.env.PORT, 10) || 5000;
const server = app.listen(PORT, () => {
  logger.info('ghl-cancel-intent-webhook listening', { port: PORT });
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    logger.info('shutting down', { signal: sig });
    server.close(() => process.exit(0));
  });
}

module.exports = app;
