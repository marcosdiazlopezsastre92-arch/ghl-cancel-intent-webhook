'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const { handleCancelIntent } = require('./handler');
const { classify } = require('./classifier');
const { LOCATION_ID, DEFAULT_CLAUDE_MODEL, DEFAULT_CONFIDENCE_THRESHOLD } = require('./config');
const logger = require('./logger');
const testCases = require('./testCases');
const testCasesMultimsg = require('./testCases-multimsg');
const testCasesEdge = require('./testCases-edge');
const testCasesV2 = require('./testCases-v2');
const testCasesLite = require('./testCases-lite');
const testCasesV3 = require('./testCases-v3');
const testCasesV4 = require('./testCases-v4');

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
    testSuiteSize: Array.isArray(testCases) ? testCases.length : 0,
    multimsgSuiteSize: Array.isArray(testCasesMultimsg) ? testCasesMultimsg.length : 0,
    edgeSuiteSize: Array.isArray(testCasesEdge) ? testCasesEdge.length : 0,
    v2SuiteSize: Array.isArray(testCasesV2) ? testCasesV2.length : 0,
    liteSuiteSize: Array.isArray(testCasesLite) ? testCasesLite.length : 0,
    v3SuiteSize: Array.isArray(testCasesV3) ? testCasesV3.length : 0,
    v4SuiteSize: Array.isArray(testCasesV4) ? testCasesV4.length : 0,
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

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSuite({ suite, verbose, categoryFilter, limit, offset = 0, delayMs = 0 }) {
  let filtered = suite;
  if (categoryFilter) {
    // EXACT match (was startsWith — caused V1 to also grab V10/V11/V12 etc.
    // when categories share a prefix). Batch scripts pass exact names.
    filtered = filtered.filter((tc) => String(tc.category || '') === categoryFilter);
  }
  // offset first, then limit (lets batch scripts page through a category
  // that would otherwise exceed Railway's 60s proxy timeout).
  if (Number.isFinite(offset) && offset > 0) {
    filtered = filtered.slice(offset);
  }
  if (Number.isFinite(limit) && limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  const startedAt = Date.now();
  const results = [];
  let passed = 0, failed = 0;

  for (let i = 0; i < filtered.length; i++) {
    const tc = filtered[i];
    // Throttle between calls to respect Anthropic rate limits.
    // Skip delay before the very first call.
    if (i > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    const caseStarted = Date.now();
    let cls;
    try {
      cls = await classify({
        messages: tc.messages, appointments: tc.appointments,
        apiKey: process.env.ANTHROPIC_API_KEY,
        openaiApiKey: null, ghlAuthorization: null,
      });
    } catch (err) {
      results.push({
        name: tc.name,
        category: tc.category || 'UNCATEGORIZED',
        error: err.message,
        pass: false,
        elapsedMs: Date.now() - caseStarted,
      });
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
      category: tc.category || 'UNCATEGORIZED',
      lastLeadMessage: tc.messages.filter((m) => m.direction === 'inbound').slice(-1)[0]?.body || '(audio/empty)',
      expected, actual,
      expectedDelay: tc.expectedDelay, actualDelay: cls.decision?.followup_delay_days,
      expectedIdsCount: tc.expectedIdsCount, actualIdsCount: cls.decision?.appointment_ids_to_noshow?.length,
      confidence: cls.decision?.confidence,
      bypass: cls.bypass || null,
      rescheduleLinkSent: cls.rescheduleLinkSent || false,
      reasoning: cls.decision?.reasoning,
      doubleCheckMeta: cls.doubleCheckMeta || null,
      pass,
      elapsedMs: Date.now() - caseStarted,
    });
  }

  const catMap = {};
  for (const r of results) {
    const cat = r.category;
    if (!catMap[cat]) catMap[cat] = { category: cat, total: 0, passed: 0, failed: 0 };
    catMap[cat].total += 1;
    if (r.pass) catMap[cat].passed += 1; else catMap[cat].failed += 1;
  }
  const byCategory = Object.values(catMap)
    .map((c) => ({ ...c, passRate: c.total > 0 ? Math.round((c.passed / c.total) * 100) : 0 }))
    .sort((a, b) => {
      if (b.failed !== a.failed) return b.failed - a.failed;
      return a.category.localeCompare(b.category);
    });

  // Double-check stats: how often the safety net fired and whether Sonnet
  // changed or confirmed Haiku's decision.
  let doubleCheckTriggered = 0;
  let doubleCheckChanged = 0;
  let doubleCheckConfirmed = 0;
  for (const r of results) {
    if (r.doubleCheckMeta && r.doubleCheckMeta.triggered) {
      doubleCheckTriggered += 1;
      if (r.doubleCheckMeta.changed) doubleCheckChanged += 1;
      else doubleCheckConfirmed += 1;
    }
  }

  const failures = results.filter((r) => !r.pass);

  const response = {
    total: filtered.length,
    passed,
    failed,
    passRate: filtered.length > 0 ? Math.round((passed / filtered.length) * 100) : 0,
    elapsedMs: Date.now() - startedAt,
    delayMs,
    timestamp: new Date().toISOString(),
    filter: categoryFilter || null,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    limit: Number.isFinite(limit) ? limit : null,
    byCategory,
    doubleCheck: {
      triggered: doubleCheckTriggered,
      changed: doubleCheckChanged,
      confirmed: doubleCheckConfirmed,
      changeRate: doubleCheckTriggered > 0
        ? Math.round((doubleCheckChanged / doubleCheckTriggered) * 100)
        : 0,
    },
    failures,
  };
  if (verbose) response.cases = results;
  return response;
}

function parseDelayMs(req, defaultMs) {
  const raw = req.query.delayMs;
  if (raw === undefined || raw === null || raw === '') return defaultMs;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return defaultMs;
  return Math.min(n, 10000); // cap at 10s for safety
}

function parseOffset(req) {
  const raw = req.query.offset;
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

app.get('/test/run-suite', requireSecretOnly, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY missing on server' });
  }
  const verbose = String(req.query.verbose || '').toLowerCase() === 'true';
  const categoryFilter = String(req.query.category || '').trim();
  const limit = parseInt(req.query.limit, 10);
  const offset = parseOffset(req);
  const delayMs = parseDelayMs(req, 0);
  const response = await runSuite({ suite: testCases, verbose, categoryFilter, limit, offset, delayMs });
  res.json(response);
});

app.get('/test/run-multimsg', requireSecretOnly, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY missing on server' });
  }
  const verbose = String(req.query.verbose || '').toLowerCase() === 'true';
  const categoryFilter = String(req.query.category || '').trim();
  const limit = parseInt(req.query.limit, 10);
  const offset = parseOffset(req);
  const delayMs = parseDelayMs(req, 0);
  const response = await runSuite({ suite: testCasesMultimsg, verbose, categoryFilter, limit, offset, delayMs });
  res.json(response);
});

// Edge case suite (E1-E10 — 140 cases)
app.get('/test/run-edge', requireSecretOnly, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY missing on server' });
  }
  const verbose = String(req.query.verbose || '').toLowerCase() === 'true';
  const categoryFilter = String(req.query.category || '').trim();
  const limit = parseInt(req.query.limit, 10);
  const offset = parseOffset(req);
  const delayMs = parseDelayMs(req, 0);
  const response = await runSuite({ suite: testCasesEdge, verbose, categoryFilter, limit, offset, delayMs });
  res.json(response);
});

// V2 suite (N1-N13 — 400 cases). Covers NEW exception + regressions.
app.get('/test/run-v2', requireSecretOnly, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY missing on server' });
  }
  const verbose = String(req.query.verbose || '').toLowerCase() === 'true';
  const categoryFilter = String(req.query.category || '').trim();
  const limit = parseInt(req.query.limit, 10);
  const offset = parseOffset(req);
  const delayMs = parseDelayMs(req, 0);
  const response = await runSuite({ suite: testCasesV2, verbose, categoryFilter, limit, offset, delayMs });
  res.json(response);
});

// LITE suite (L1-L13 — 150 balanced cases). 1200ms delay between calls
// by default to respect Anthropic tier 1 rate limit (~50 RPM).
// Estimated runtime: ~5-6 minutes.
app.get('/test/run-lite', requireSecretOnly, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY missing on server' });
  }
  const verbose = String(req.query.verbose || '').toLowerCase() === 'true';
  const categoryFilter = String(req.query.category || '').trim();
  const limit = parseInt(req.query.limit, 10);
  const offset = parseOffset(req);
  const delayMs = parseDelayMs(req, 1200);
  const response = await runSuite({ suite: testCasesLite, verbose, categoryFilter, limit, offset, delayMs });
  res.json(response);
});

// V3 suite (V1-V12 — 200 cases). Validates new exploratory-question rule
// + all regressions. Run by category via the run-v3-suite-lotes.sh script
// to avoid Railway request timeouts.
app.get('/test/run-v3', requireSecretOnly, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY missing on server' });
  }
  const verbose = String(req.query.verbose || '').toLowerCase() === 'true';
  const categoryFilter = String(req.query.category || '').trim();
  const limit = parseInt(req.query.limit, 10);
  const offset = parseOffset(req);
  const delayMs = parseDelayMs(req, 1200);
  const response = await runSuite({ suite: testCasesV3, verbose, categoryFilter, limit, offset, delayMs });
  res.json(response);
});

// V4 suite (T01-T13 — 200 cases). Torture test: contradicciones, sarcasmo,
// dialectos, typos extremos, cancel enterrado, cambios múltiples, emociones
// ambiguas, ambigüedades temporales, post-link complejo.
// Run via run-v4-suite-lotes.sh. Use ?offset=N&limit=M to page through a
// category that would otherwise exceed Railway's 60s proxy timeout.
app.get('/test/run-v4', requireSecretOnly, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY missing on server' });
  }
  const verbose = String(req.query.verbose || '').toLowerCase() === 'true';
  const categoryFilter = String(req.query.category || '').trim();
  const limit = parseInt(req.query.limit, 10);
  const offset = parseOffset(req);
  const delayMs = parseDelayMs(req, 1200);
  const response = await runSuite({ suite: testCasesV4, verbose, categoryFilter, limit, offset, delayMs });
  res.json(response);
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
