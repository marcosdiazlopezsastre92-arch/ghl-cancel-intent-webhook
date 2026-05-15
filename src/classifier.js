'use strict';

const { callClaude } = require('./claudeClient');
const {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_MESSAGES_LOOKBACK,
} = require('./config');
const logger = require('./logger');

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

function isLastInboundBenign(messages) {
  const inbound = messages.filter((m) => (m.direction || '').toLowerCase() === 'inbound');
  if (inbound.length === 0) return false;
  const last = inbound[inbound.length - 1];
  const norm = normalize(last.body || last.message || last.text || '');
  if (!norm) return true;
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

function formatAppointmentsForPrompt(appointments) {
  if (!appointments || appointments.length === 0) {
    return '(El contacto no tiene citas futuras activas. Esto es raro — probablemente no_action.)';
  }
  return appointments.map((a, i) => {
    const start = a.startTime || a.start_time || '?';
    const cal = a.calendarName || a.calendarId || '?';
    return `${i + 1}. id=${a.id} | inicio=${start} | calendario=${cal}`;
  }).join('\n');
}

const SYSTEM_PROMPT = `Eres un clasificador de intención de cancelación de llamadas para una agencia de coaching de fitness en España.
Lees una conversación de WhatsApp/SMS entre el coach y un lead, junto con la lista de
llamadas futuras activas que tiene ese lead. Decides si en su ÚLTIMO mensaje está pidiendo
cancelar/reagendar alguna(s) o ninguna llamada.

INTENTS POSIBLES:
- "no_action": conversación normal, confirmación, pregunta. NO TOCAR NADA.
- "cancel_with_followup": el lead pide cancelar TODAS sus llamadas futuras y se le debe poner
  en seguimiento automático para que la IA reagende.
- "cancel_no_followup": cancelación DURA ("ya no me interesa", "voy con otro entrenador",
  "borra mis datos"). Cancela TODAS las llamadas y NO seguimiento.
- "cancel_partial": el lead pide cancelar SOLO ALGUNAS llamadas concretas, no todas.
  No se pone en seguimiento porque aún tiene otras llamadas pendientes.

REGLAS:
- Mejor "no_action" si tienes la más mínima duda.
- Confirmaciones cortas ("vale", "ok", "genial", "perfecto", "listo") → SIEMPRE no_action.
- "appointment_ids_to_noshow" debe contener ÚNICAMENTE ids de la lista que te paso. Si el lead
  no especifica cuál, asume TODAS (cancel_with_followup o cancel_no_followup).
- Si solo hay 1 cita y dice "cancelélalo" sin especificar → cancel_with_followup con esa cita.
- Si hay 2+ citas y dice "cancel ambas" o no especifica → cancel_with_followup con TODAS.
- Si hay 2+ y dice "cancel solo la del martes" → cancel_partial con SOLO esa.
- Para el delay del seguimiento (cancel_with_followup):
  * 1 día (default): cancelación sin contexto especial
  * 3 días: malestar puntual ("dolor de cabeza", "estoy malo")
  * 7 días: enfermedad seria, viaje, agenda muy cargada ("esta semana fatal", "de viaje")

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin texto adicional):
{
  "intent": "no_action" | "cancel_with_followup" | "cancel_no_followup" | "cancel_partial",
  "confidence": 0.0-1.0,
  "appointment_ids_to_noshow": ["id1", "id2"],
  "followup_delay_days": 1 | 3 | 7 | null,
  "reasoning": "breve explicación en una frase"
}`;

function parseClaudeJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) s = fenceMatch[1].trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first < 0 || last < 0 || last <= first) return null;
  const candidate = s.slice(first, last + 1);
  try { return JSON.parse(candidate); } catch { return null; }
}

// Validates and sanitizes the IDs Claude returned: only keeps ones that match
// the active appointments list. Prevents Claude from hallucinating IDs.
function validateAppointmentIds(claudeIds, activeAppointments) {
  const validIds = new Set(activeAppointments.map((a) => String(a.id)));
  const arr = Array.isArray(claudeIds) ? claudeIds : [];
  const accepted = [];
  const rejected = [];
  for (const id of arr) {
    if (validIds.has(String(id))) accepted.push(String(id));
    else rejected.push(String(id));
  }
  return { accepted, rejected };
}

async function classify({ messages, appointments, apiKey, model, threshold }) {
  // 1) If no active appointments, no point in classifying — skip Claude.
  if (!appointments || appointments.length === 0) {
    return {
      ok: true,
      bypass: 'no-appointments',
      decision: { intent: 'no_action', confidence: 1.0, appointment_ids_to_noshow: [],
                  followup_delay_days: null, reasoning: 'Contact has no active future appointments' },
    };
  }

  // 2) Whitelist short-circuit.
  if (isLastInboundBenign(messages)) {
    return {
      ok: true,
      bypass: 'whitelist',
      decision: { intent: 'no_action', confidence: 1.0, appointment_ids_to_noshow: [],
                  followup_delay_days: null, reasoning: 'Whitelisted benign reply' },
    };
  }

  // 3) Build prompt.
  const lookback = DEFAULT_MESSAGES_LOOKBACK;
  const transcript = formatMessagesForPrompt(messages, lookback);
  const aptsBlock = formatAppointmentsForPrompt(appointments);
  const userMessage =
    `LLAMADAS FUTURAS ACTIVAS DEL LEAD:\n${aptsBlock}\n\n` +
    `CONVERSACIÓN (de más antiguo a más reciente):\n\n${transcript}\n\n` +
    `Devuelve sólo el JSON especificado, con appointment_ids_to_noshow como subconjunto de los ids listados arriba.`;

  // 4) Call Claude.
  const claudeRes = await callClaude({
    apiKey,
    model: model || DEFAULT_CLAUDE_MODEL,
    system: SYSTEM_PROMPT,
    userMessage,
  });
  if (!claudeRes.ok) return { ok: false, error: 'claude-call-failed', detail: claudeRes };

  const parsed = parseClaudeJson(claudeRes.text);
  if (!parsed || !parsed.intent) {
    logger.warn('claude unparseable output', { text: (claudeRes.text || '').slice(0, 500) });
    return { ok: false, error: 'claude-parse-failed', rawText: claudeRes.text };
  }

  // 5) Validate appointment IDs against the actual list.
  const { accepted, rejected } = validateAppointmentIds(parsed.appointment_ids_to_noshow, appointments);
  parsed.appointment_ids_to_noshow = accepted;
  if (rejected.length > 0) {
    logger.warn('claude returned invalid appointment ids — rejected', { rejected });
  }

  // 6) Threshold check.
  const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  const thr = threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  if (parsed.intent !== 'no_action' && conf < thr) {
    logger.info('classification below threshold → no_action', { confidence: conf, threshold: thr });
    return {
      ok: true,
      bypass: 'low-confidence',
      decision: { intent: 'no_action', confidence: conf, appointment_ids_to_noshow: [],
                  followup_delay_days: null,
                  reasoning: `Below threshold (${conf} < ${thr}). Original: ${parsed.reasoning || ''}` },
      claudeRaw: parsed,
    };
  }

  // 7) Sanity: if intent is cancel_* but no IDs survived validation, demote to no_action.
  if (parsed.intent !== 'no_action' && parsed.appointment_ids_to_noshow.length === 0) {
    logger.warn('cancel intent but no valid appointment ids → demoting to no_action', { parsed });
    return {
      ok: true,
      bypass: 'no-valid-ids',
      decision: { intent: 'no_action', confidence: conf, appointment_ids_to_noshow: [],
                  followup_delay_days: null,
                  reasoning: `Claude said ${parsed.intent} but listed no valid IDs. Original: ${parsed.reasoning || ''}` },
      claudeRaw: parsed,
    };
  }

  return { ok: true, decision: parsed, rejectedIds: rejected };
}

module.exports = {
  classify, isLastInboundBenign, parseClaudeJson,
  formatMessagesForPrompt, formatAppointmentsForPrompt, validateAppointmentIds,
};
