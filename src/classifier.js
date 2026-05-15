'use strict';

const { callClaude } = require('./claudeClient');
const {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_MESSAGES_LOOKBACK,
} = require('./config');
const logger = require('./logger');
const { isAudioMessage, isNonAudioMediaOnly, classifyAttachments } = require('./classifierAudio');
const { transcribeAudiosInPlace } = require('./transcribe');
const {
  messageContainsRescheduleLink,
  hasRecentRescheduleLink,
  isLeadReplyAfterRescheduleLink,
} = require('./rescheduleDetector');

// Lowered from 0.90 -> 0.85 because Claude was too easily demoted on
// genuinely clear acceptances after a link.
const POST_LINK_AMBIGUOUS_THRESHOLD = 0.85;

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

function lastInboundMessage(messages) {
  const inbound = (messages || []).filter((m) => (m.direction || '').toLowerCase() === 'inbound');
  return inbound.length ? inbound[inbound.length - 1] : null;
}

function isLastInboundBenign(messages) {
  const last = lastInboundMessage(messages);
  if (!last) return false;
  if (isAudioMessage(last) && !String(last.body || '').trim()) return false;
  if (isNonAudioMediaOnly(last) && !String(last.body || '').trim()) return false;
  if (isLeadReplyAfterRescheduleLink(messages, DEFAULT_MESSAGES_LOOKBACK)) return false;
  const norm = normalize(last.body || last.message || last.text || '');
  if (!norm) return true;
  const words = norm.split(' ');
  if (words.length > 4) return false;
  return BENIGN_PHRASES.has(norm) || words.every((w) => BENIGN_PHRASES.has(w));
}

function tsOf(o) {
  if (!o) return 0;
  const s = o.dateAdded || o.dateCreated || o.createdAt || o;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function mostRecentLinkTimestamp(messages) {
  let latest = 0;
  for (const m of messages || []) {
    if ((m.direction || '').toLowerCase() !== 'outbound') continue;
    if (!messageContainsRescheduleLink(m)) continue;
    const t = tsOf(m);
    if (t > latest) latest = t;
  }
  return latest;
}

function formatMessagesForPrompt(messages, lookback) {
  const sorted = [...messages].sort((a, b) => tsOf(a) - tsOf(b));
  const recent = sorted.slice(-lookback);
  return recent.map((m) => {
    const ts = m.dateAdded || m.dateCreated || m.createdAt || '';
    const dir = (m.direction || '').toLowerCase();
    let speaker = dir === 'inbound' ? 'Lead' : 'Coach';
    if (dir === 'outbound' && messageContainsRescheduleLink(m)) {
      speaker = 'Coach [ENVIÓ ENLACE DE REAGENDAR]';
    }
    let text = String(m.body || m.message || m.text || '').trim();
    if (!text && isAudioMessage(m)) text = '[mensaje de voz — sin transcribir]';
    if (!text && isNonAudioMediaOnly(m)) text = '[envió imagen/documento — sin texto]';
    return `[${ts}] ${speaker}: ${text}`;
  }).join('\n');
}

function formatAppointmentsForPrompt(appointments, messages) {
  if (!appointments || appointments.length === 0) {
    return '(El contacto no tiene citas futuras activas.)';
  }
  const linkTs = mostRecentLinkTimestamp(messages || []);
  return appointments.map((a, i) => {
    const start = a.startTime || a.start_time || '?';
    const cal = a.calendarName || a.calendarId || '?';
    let createdContext = '';
    const createdTs = tsOf(a);
    if (createdTs && linkTs && createdTs > linkTs) {
      const minsAfter = Math.round((createdTs - linkTs) / 60000);
      createdContext = ` | CREADA ${minsAfter}min DESPUÉS del envio del enlace de reagendar (POSIBLEMENTE ES EL RESULTADO DEL REAGENDADO DEL LEAD — NO INCLUIR EN appointment_ids_to_noshow salvo que el lead lo pida explicitamente)`;
    } else if (createdTs) {
      createdContext = ` | creada=${a.dateAdded || a.dateCreated || a.createdAt}`;
    }
    return `${i + 1}. id=${a.id} | inicio=${start} | calendario=${cal}${createdContext}`;
  }).join('\n');
}

const SYSTEM_PROMPT = `Eres un clasificador de intención de cancelación de llamadas para una agencia de coaching de fitness en España.
Lees una conversación de WhatsApp/Instagram/SMS entre el coach y un lead, junto con la lista de
llamadas futuras activas que tiene ese lead. Decides si en el contexto reciente de la conversación
el lead está pidiendo (implícita o explícitamente) cancelar/reagendar alguna(s) o ninguna llamada.

CONTEXTO DEL "COACH":
Las respuestas del Coach pueden ser de un humano O de una IA automatizada. Cuando la IA detecta
señales de cancelación/duda, suele responder enviando el ENLACE DE REAGENDAR. Si en el historial
ves un mensaje del Coach prefijado con [ENVIÓ ENLACE DE REAGENDAR], significa que el coach mandó
el enlace para mover la cita.

REGLA SOBRE CITAS MARCADAS COMO POST-ENLACE:
En la lista de "LLAMADAS FUTURAS ACTIVAS", una cita PUEDE venir marcada con el texto literal
"CREADA Xmin DESPUÉS del envio del enlace de reagendar". SOLO en ese caso (cuando el marcador
está explícitamente presente en la lista que te paso) debes asumir que esa cita es resultado
del reagendado del lead y NO incluirla en appointment_ids_to_noshow, salvo que el lead pida
explícitamente cancelarla DESPUÉS de haberla creado (ej: "ah espera, cancela también esa nueva").
Si una cita NO tiene ese marcador, trata su fecha de creación como información meramente
descriptiva — NO infieras que es post-enlace por su nombre de calendario o por el contexto.

LA AUSENCIA del marcador NO SIGNIFICA que el lead haya aceptado el reagendado. Significa que el
lead todavía no ha clicado el enlace (o no lo hará). Por eso, silencio/ambigüedad sigue siendo
no_action en cualquier caso.

REGLAS POST-ENLACE (cuando el Coach envió el [ENVIÓ ENLACE DE REAGENDAR]):
- Lead aceptó CLARAMENTE después del link ("vale gracias", "perfecto, lo cambio", "dámelo",
  "miro y reagendo", "genial", "vale cuando pueda reagendo") → cancel_with_followup
  (independientemente de si hay cita post-enlace creada o no).
- Lead RECHAZÓ el reagendado o reafirma asistencia ("no, mejor lo dejo", "déjalo, sí voy",
  "olvídalo, iré", "al final sí puedo", "sí voy") → no_action.
- Lead respondió ambiguamente o no respondió ("déjame pensarlo", "luego te digo", "vale" sin
  más, silencio total) → no_action (conservador, NUNCA asumir aceptación por silencio).
- Lead YA había cancelado claramente ANTES del link (ej: "no podré asistir" → link → silencio)
  → cancel_with_followup (la cancelación inicial sigue vigente).

EJEMPLOS CRÍTICOS POST-ENLACE (lee el mensaje COMPLETO del lead):
  Lead: "no sé si podré asistir"
  Coach [ENVIÓ ENLACE DE REAGENDAR]: "vale, aquí tienes el enlace"
  Lead: "vale, gracias"            → cancel_with_followup
  Lead: "vale, lo cambio ahora"    → cancel_with_followup
  Lead: "vale cuando pueda reagendo" → cancel_with_followup
  Lead: "vale, sí puedo asistir"   → no_action (¡RECHAZÓ!)
  Lead: "al final sí voy, gracias" → no_action (¡RECHAZÓ!)
  Lead: "no no, déjalo, iré"        → no_action
  Lead: "vale" (solo)              → no_action (ambiguo)
  Lead: "déjame pensarlo"          → no_action
  (sin respuesta posterior del lead)  → no_action (silencio = no aceptación)

EJEMPLO con cancelación CLARA antes del link:
  Lead: "Marcos no podré asistir a la llamada"
  Coach [ENVIÓ ENLACE DE REAGENDAR]: "vale, aquí tienes el enlace"
  (sin respuesta posterior) → cancel_with_followup

EJEMPLO con cita marcada post-enlace:
  Lead: "se me complica, pásame para reagendar"
  Coach [ENVIÓ ENLACE DE REAGENDAR]: "aquí tienes"
  Lead: "gracias"
  LLAMADAS FUTURAS ACTIVAS: 1 cita CREADA 4min DESPUÉS del envio del enlace (marcador presente)
  → no_action (lead ya reagendó, no hay nada que hacer)

IMPORTANTE: cualquier afirmación del lead POSTERIOR al link de que VA a asistir ("sí puedo",
"al final voy", "déjalo", "olvídalo", "iré", "sí voy") SIEMPRE gana sobre un "vale" inicial.

INTENTS POSIBLES:
- "no_action": conversación normal, confirmación, pregunta, lead reafirmó asistencia, ambigüedad,
  silencio post-link, o lead ya reagendó vía enlace (con marcador post-enlace presente). NADA.
- "cancel_with_followup": cancelar TODAS las citas activas (excepto las marcadas POST-ENLACE) y
  poner en seguimiento automático.
- "cancel_no_followup": cancelación DURA ("ya no me interesa", "voy con otro entrenador",
  "borra mis datos"). Cancelar TODAS las pre-enlace, sin seguimiento.
- "cancel_partial": cancelar SOLO algunas citas concretas que el lead especificó, no todas.
  No se pone en seguimiento porque aún tiene otras llamadas pendientes.

REGLAS GENERALES:
- Mejor "no_action" si tienes la más mínima duda.
- "appointment_ids_to_noshow" debe contener ÚNICAMENTE ids de la lista que te paso. Si el lead
  no especifica cuál, asume TODAS las citas activas SIN el marcador POST-ENLACE.
- Si solo hay 1 cita y dice "cancelélalo" sin especificar → cancel_with_followup con esa cita.
- Si hay 2+ citas (ninguna marcada post-enlace) y dice "cancela las dos" o no especifica →
  cancel_with_followup con TODAS.
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

async function classify({ messages, appointments, apiKey, openaiApiKey, ghlAuthorization, model, threshold }) {
  let transcriptionStats = null;
  if (openaiApiKey) {
    try {
      transcriptionStats = await transcribeAudiosInPlace({ messages, openaiApiKey, ghlAuthorization });
      logger.info('whisper transcription pass', transcriptionStats);
    } catch (err) {
      logger.warn('whisper transcription threw', { error: err.message });
    }
  }

  const last = lastInboundMessage(messages);
  const rescheduleLinkSent = hasRecentRescheduleLink(messages, DEFAULT_MESSAGES_LOOKBACK);
  const leadAfterLink = isLeadReplyAfterRescheduleLink(messages, DEFAULT_MESSAGES_LOOKBACK);
  if (rescheduleLinkSent) logger.info('reschedule link context', { rescheduleLinkSent, leadAfterLink });

  if (last && isNonAudioMediaOnly(last) && !String(last.body || '').trim()) {
    const cls = classifyAttachments(last);
    return {
      ok: true, bypass: 'non-audio-media',
      decision: { intent: 'no_action', confidence: 1.0, appointment_ids_to_noshow: [],
                  followup_delay_days: null, reasoning: 'Last inbound is media (image/document) with no text.' },
      transcriptionStats, attachmentBreakdown: cls, rescheduleLinkSent, leadAfterLink,
    };
  }

  if (last && isAudioMessage(last) && !String(last.body || '').trim()) {
    return {
      ok: true, bypass: 'audio-detected',
      decision: { intent: 'audio_needs_review', confidence: 1.0,
                  appointment_ids_to_noshow: [], followup_delay_days: null,
                  reasoning: openaiApiKey
                    ? 'Voice/video note and Whisper transcription failed.'
                    : 'Voice note. Configure OPENAI_API_KEY to auto-transcribe.' },
      transcriptionStats, rescheduleLinkSent, leadAfterLink,
    };
  }

  if (!appointments || appointments.length === 0) {
    return {
      ok: true, bypass: 'no-appointments',
      decision: { intent: 'no_action', confidence: 1.0, appointment_ids_to_noshow: [],
                  followup_delay_days: null, reasoning: 'Contact has no active future appointments' },
      transcriptionStats, rescheduleLinkSent, leadAfterLink,
    };
  }

  if (isLastInboundBenign(messages)) {
    return {
      ok: true, bypass: 'whitelist',
      decision: { intent: 'no_action', confidence: 1.0, appointment_ids_to_noshow: [],
                  followup_delay_days: null, reasoning: 'Whitelisted benign reply' },
      transcriptionStats, rescheduleLinkSent, leadAfterLink,
    };
  }

  const lookback = DEFAULT_MESSAGES_LOOKBACK;
  const transcript = formatMessagesForPrompt(messages, lookback);
  const aptsBlock = formatAppointmentsForPrompt(appointments, messages);
  const userMessage =
    `LLAMADAS FUTURAS ACTIVAS DEL LEAD:\n${aptsBlock}\n\n` +
    `CONVERSACIÓN (de más antiguo a más reciente):\n\n${transcript}\n\n` +
    `Devuelve sólo el JSON especificado.`;

  const claudeRes = await callClaude({
    apiKey, model: model || DEFAULT_CLAUDE_MODEL,
    system: SYSTEM_PROMPT, userMessage,
  });
  if (!claudeRes.ok) return { ok: false, error: 'claude-call-failed', detail: claudeRes, transcriptionStats };

  const parsed = parseClaudeJson(claudeRes.text);
  if (!parsed || !parsed.intent) {
    logger.warn('claude unparseable output', { text: (claudeRes.text || '').slice(0, 500) });
    return { ok: false, error: 'claude-parse-failed', rawText: claudeRes.text, transcriptionStats };
  }

  const { accepted, rejected } = validateAppointmentIds(parsed.appointment_ids_to_noshow, appointments);
  parsed.appointment_ids_to_noshow = accepted;
  if (rejected.length > 0) logger.warn('claude returned invalid appointment ids', { rejected });

  const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  const effectiveThreshold = threshold ?? (leadAfterLink ? POST_LINK_AMBIGUOUS_THRESHOLD : DEFAULT_CONFIDENCE_THRESHOLD);
  if (parsed.intent !== 'no_action' && conf < effectiveThreshold) {
    logger.info('classification below threshold → no_action', { confidence: conf, threshold: effectiveThreshold, leadAfterLink });
    return {
      ok: true, bypass: 'low-confidence',
      decision: { intent: 'no_action', confidence: conf, appointment_ids_to_noshow: [],
                  followup_delay_days: null,
                  reasoning: `Below threshold (${conf} < ${effectiveThreshold}). Original: ${parsed.reasoning || ''}` },
      claudeRaw: parsed, transcriptionStats, rescheduleLinkSent, leadAfterLink,
    };
  }

  if (parsed.intent !== 'no_action' && parsed.appointment_ids_to_noshow.length === 0) {
    logger.warn('cancel intent but no valid appointment ids → no_action', { parsed });
    return {
      ok: true, bypass: 'no-valid-ids',
      decision: { intent: 'no_action', confidence: conf, appointment_ids_to_noshow: [],
                  followup_delay_days: null,
                  reasoning: `Claude said ${parsed.intent} but listed no valid IDs. Original: ${parsed.reasoning || ''}` },
      claudeRaw: parsed, transcriptionStats, rescheduleLinkSent, leadAfterLink,
    };
  }

  return { ok: true, decision: parsed, rejectedIds: rejected, transcriptionStats, rescheduleLinkSent, leadAfterLink };
}

module.exports = {
  classify, isLastInboundBenign, parseClaudeJson, isAudioMessage,
  formatMessagesForPrompt, formatAppointmentsForPrompt, validateAppointmentIds,
};
