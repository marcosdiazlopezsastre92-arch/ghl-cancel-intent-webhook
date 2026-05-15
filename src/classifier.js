'use strict';

const { callClaude } = require('./claudeClient');
const {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_MESSAGES_LOOKBACK,
} = require('./config');
const logger = require('./logger');

// Whitelist: si el ÚLTIMO mensaje inbound se reduce a una de estas frases
// (después de normalizar), saltamos Claude y devolvemos no_action.
const BENIGN_PHRASES = new Set([
  'vale', 'ok', 'okay', 'okey', 'oki', 'k', 'va', 'sip', 'si', 'sí', 'sii', 'siii',
  'genial', 'perfecto', 'perfectamente', 'perfect', 'great',
  'gracias', 'thanks', 'thx',
  'listo', 'lista', 'listoo',
  'nos vemos', 'nos vemos!', 'hasta entonces', 'hasta el martes', 'hasta luego',
  'dale', 'venga', 'va va', 'genial gracias',
  '👍', '🙏', '✅', '🔥',
]);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ ]/g, ' ')
    .replace(/[!\?\.\,;:\s]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Determina si la última entrada del lead es claramente benigna.
function isLastInboundBenign(messages) {
  // messages ordenados de más antiguo a más reciente.
  const inbound = messages.filter((m) => (m.direction || '').toLowerCase() === 'inbound');
  if (inbound.length === 0) return false;
  const last = inbound[inbound.length - 1];
  const norm = normalize(last.body || last.message || last.text || '');
  if (!norm) return true; // empty inbound (sticker, attachment-only) -> benign
  // Si tiene <= 2 palabras y está en la whitelist, benigno.
  const words = norm.split(' ');
  if (words.length > 4) return false;
  return BENIGN_PHRASES.has(norm) || words.every((w) => BENIGN_PHRASES.has(w));
}

function formatMessagesForPrompt(messages, lookback) {
  const sorted = [...messages].sort((a, b) => {
    const ta = new Date(a.dateAdded || a.dateCreated || a.createdAt || 0).getTime();
    const tb = new Date(b.dateAdded || b.dateCreated || b.createdAt || 0).getTime();
    return ta - tb;
  });
  const recent = sorted.slice(-lookback);
  return recent.map((m) => {
    const ts = m.dateAdded || m.dateCreated || m.createdAt || '';
    const dir = (m.direction || '').toLowerCase();
    const speaker = dir === 'inbound' ? 'Lead' : 'Coach';
    const text = String(m.body || m.message || m.text || '').trim();
    return `[${ts}] ${speaker}: ${text}`;
  }).join('\n');
}

const SYSTEM_PROMPT = `Eres un clasificador de intención de cancelación para una agencia de coaching de fitness en España.
Tu trabajo es leer una conversación de WhatsApp/SMS entre el coach y un lead que tiene una llamada de venta
agendada. Decides si en su ÚLTIMO mensaje el lead está pidiendo cancelar/reagendar la llamada, o si es
conversación normal.

REGLAS ESTRICTAS:
- Mejor "no_action" si tienes la más mínima duda. Solo activas cancelación si la persona claramente la pide.
- Confirmaciones cortas como "vale", "ok", "genial", "perfecto", "listo", "nos vemos", "gracias" → SIEMPRE no_action.
- Frases que indican cancelación suave/reagendar: "no puedo ir", "se me complica", "tengo que mover la llamada",
  "esta semana imposible", "no voy a poder asistir" → cancel_with_followup.
- Cancelación dura: "ya no me interesa", "voy con otro entrenador", "no sigamos", "quítame", "borra mis datos" → cancel_no_followup.
- Para el delay del seguimiento automático (si cancel_with_followup):
  * 1 día (default): cancelación sin contexto especial ("hostia, no puedo el martes")
  * 3 días: malestar puntual / problema corto ("tengo dolor de cabeza", "estoy malo")
  * 7 días: enfermedad más seria, viaje toda la semana, agenda muy cargada ("esta semana fatal", "de viaje")

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin texto adicional) con este schema:
{
  "intent": "no_action" | "cancel_with_followup" | "cancel_no_followup",
  "confidence": 0.0-1.0,
  "followup_delay_days": 1 | 3 | 7 | null,
  "reasoning": "breve explicación en una frase"
}`;

function parseClaudeJson(text) {
  if (!text) return null;
  // Strip markdown fences if present.
  let s = String(text).trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  // Find first { and last } to be tolerant.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first < 0 || last < 0 || last <= first) return null;
  const candidate = s.slice(first, last + 1);
  try { return JSON.parse(candidate); } catch { return null; }
}

async function classify({ messages, apiKey, model, threshold }) {
  // 1) Whitelist short-circuit.
  if (isLastInboundBenign(messages)) {
    return {
      ok: true,
      bypass: 'whitelist',
      decision: { intent: 'no_action', confidence: 1.0, followup_delay_days: null, reasoning: 'Whitelisted benign reply' },
    };
  }

  // 2) Build prompt.
  const lookback = DEFAULT_MESSAGES_LOOKBACK;
  const transcript = formatMessagesForPrompt(messages, lookback);
  const userMessage = `CONVERSACIÓN (de más antiguo a más reciente):\n\n${transcript}\n\nDevuelve sólo el JSON.`;

  // 3) Call Claude.
  const claudeRes = await callClaude({
    apiKey,
    model: model || DEFAULT_CLAUDE_MODEL,
    system: SYSTEM_PROMPT,
    userMessage,
  });
  if (!claudeRes.ok) {
    return { ok: false, error: 'claude-call-failed', detail: claudeRes };
  }

  // 4) Parse JSON output.
  const parsed = parseClaudeJson(claudeRes.text);
  if (!parsed || !parsed.intent) {
    logger.warn('claude returned unparseable output', { text: (claudeRes.text || '').slice(0, 500) });
    return { ok: false, error: 'claude-parse-failed', rawText: claudeRes.text };
  }

  // 5) Threshold check — demote to no_action if below.
  const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  const thr = threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  if (parsed.intent !== 'no_action' && conf < thr) {
    logger.info('classification below threshold → no_action', { confidence: conf, threshold: thr });
    return {
      ok: true,
      bypass: 'low-confidence',
      decision: { intent: 'no_action', confidence: conf, followup_delay_days: null,
                  reasoning: `Below threshold (${conf} < ${thr}). Original: ${parsed.reasoning || ''}` },
      claudeRaw: parsed,
    };
  }

  return { ok: true, decision: parsed };
}

module.exports = { classify, isLastInboundBenign, parseClaudeJson, formatMessagesForPrompt };
