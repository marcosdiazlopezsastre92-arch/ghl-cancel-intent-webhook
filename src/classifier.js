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

const POST_LINK_AMBIGUOUS_THRESHOLD = 0.85;

// Canonical intent values Claude is allowed to return.
// Note: 'audio_needs_review' is set by us internally when the audio bypass
// kicks in, never by Claude.
const VALID_INTENTS = new Set([
  'no_action',
  'cancel_with_followup',
  'cancel_no_followup',
  'cancel_partial',
]);

function lastInboundMessage(messages) {
  const inbound = (messages || []).filter((m) => (m.direction || '').toLowerCase() === 'inbound');
  return inbound.length ? inbound[inbound.length - 1] : null;
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

PRINCIPIO DE LECTURA — MENSAJES CONSECUTIVOS COMO UNIDAD:

En WhatsApp/Instagram/SMS la gente escribe en RÁFAGAS: el mismo pensamiento, condición o
decisión suele venir partido en 2-5 mensajes consecutivos del mismo hablante. NUNCA leas
el último mensaje del lead de forma aislada si hay mensajes previos suyos sin respuesta
del coach entre medias.

ANTES de clasificar, agrupa mentalmente como UNA UNIDAD todos los mensajes consecutivos
del mismo hablante (lead o coach) hasta que el otro responda. Interpreta esa unidad como
si fuera una sola frase, conectada por conjunciones implícitas ("y", "porque", "entonces").

Ejemplo:
- Lead: "como máximo puedo 65€"
- Lead: "si crees que no es posible dímelo"
- Lead: "y no hace falta que hagamos la llamada"
→ Unidad: "Como máximo puedo 65€. Si crees que no es posible dímelo y no hace falta que
hagamos la llamada." Es una objeción condicional de presupuesto con off-ramp suavizado,
no una cancelación firme → no_action.

Sin agrupar, el "no hace falta la llamada" parecería decisión firme. Agrupado, queda claro
que es la consecuencia condicional del "si no es posible".

Aplica este principio a TODO: cancelaciones, retrasos, reagendados, condicionales, problemas
técnicos, ajustes menores de hora, confirmaciones. Lo mismo aplica a los mensajes del coach.

REGLA CRÍTICA #1 — LAS PALABRAS DEL LEAD NUNCA SON PRUEBA DE REAGENDADO:
Si el lead expresa CUALQUIER intención de reagendar/cambiar la llamada — preguntando
("podemos cambiarla?", "podemos pasar al jueves?", "me viene mejor la semana que viene",
"me pasas a otra fecha?"), prometiendo ("lo cambio ahora", "perfecto, reagendo",
"miro y reagendo"), o incluso AFIRMANDO que ya lo hizo ("ya cambié", "ya reagendé",
"mil gracias, reagendo ahora", "ya cambio la cita, gracias", "perfecto, cambio para
mañana") — SIEMPRE devuelve cancel_with_followup, A MENOS QUE en la lista de
"LLAMADAS FUTURAS ACTIVAS" veas explícitamente una cita con el marcador
"CREADA Xmin DESPUÉS del envio del enlace de reagendar".

Solo la presencia física del marcador POST-ENLACE en la lista cuenta como prueba real
de reagendado. Las palabras del lead NUNCA son prueba suficiente.

Razón del sistema: si la cita post-enlace no existe físicamente, no sabemos si el lead
realmente la moverá o se olvidará. Hay que (a) marcar la actual como no-show para que
el coach no espere al lead, Y (b) activar seguimiento por si el lead olvida reagendar.

Esto aplica TANTO si el Coach envió enlace previamente como si no. Es la regla más
importante del clasificador. Solo la cita POST-ENLACE en la lista lo cambia.

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
Si una cita NO tiene ese marcador, trata su fecha de creación como información descriptiva.
LA AUSENCIA del marcador NO SIGNIFICA que el lead haya aceptado el reagendado.

REGLAS POST-ENLACE (cuando el Coach envió el [ENVIÓ ENLACE DE REAGENDAR]):
- Lead aceptó CLARAMENTE después del link ("vale gracias", "perfecto, lo cambio", "dámelo",
  "miro y reagendo", "genial", "vale cuando pueda reagendo") → cancel_with_followup.
- Lead RECHAZÓ el reagendado o reafirma asistencia ("no, mejor lo dejo", "déjalo, sí voy",
  "olvídalo, iré", "al final sí puedo", "sí voy") → no_action.
- Lead respondió ambiguamente o no respondió ("déjame pensarlo", "luego te digo", "vale" sin
  más, silencio total) → no_action (NUNCA asumir aceptación por silencio).
- Lead YA había cancelado claramente ANTES del link y no respondió al link → cancel_with_followup.

EXCEPCIÓN — AJUSTES MENORES DE HORA DEL MISMO DÍA:
Si el lead solo pide ajustar la HORA de la llamada SIN cambiar el día ("podemos a las 18
en vez de 16?", "30 min más tarde si te va bien", "puedo a las 20 mejor?", "a otra hora
del mismo día?", "podemos atrasar 15min?", "acomódame mejor a las 19", "puedo hoy más
tarde", "mejor vamos un par de horas después", "a la tarde sí pero a esa hora no") →
trata como no_action. El coach humano gestionará el ajuste menor sin necesidad de mover
la cita en el sistema.

DIFERENCIAR cuidadosamente:
- "podemos a las 18 hoy en vez de 16?" → no_action (cambio de hora mismo día)
- "podemos hacerla el jueves?" → cancel_with_followup (cambio de día = reschedule)
- "puedes hoy más tarde?" → no_action (mismo día)
- "puedo más tarde de esta semana, hoy no" → cancel_with_followup (otro día)
- "mejor a la noche que a la tarde?" → no_action (mismo día, solo cambia el rato)
- "mejor en 2 días" → cancel_with_followup (otro día)

EXCEPCIÓN — RETRASOS NO SON CANCELACIONES:
Distingue cuidadosamente entre "llegar tarde" (no es cancelación) y "no asistir"
(sí es cancelación). Esta excepción tiene PRIORIDAD sobre la REGLA CRÍTICA #1.

ES RETRASO (no_action) — el coach humano gestiona el retraso. Aplica SOLO si la frase
contiene EXPLÍCITAMENTE alguno de estos cualificadores de retraso:
- la palabra "tarde", "puntual", o "a tiempo"
- un número de minutos ("10 min tarde", "15 minutos", "media hora")
- "al inicio" / "a mitad" / "al final" (refiriéndose a partes de la llamada)

Ejemplos de RETRASO (no_action):
- "no podré llegar a tiempo" (contiene "a tiempo")
- "no llegaré puntual" / "no podré llegar puntual" (contiene "puntual")
- "llego tarde" / "llegaré tarde" / "voy a llegar tarde" (contiene "tarde")
- "me retraso 10 min" / "voy con 15 min de retraso" (contiene número de minutos)
- "me sale algo, llego un poco tarde" (contiene "tarde")
- "no llego al inicio, entro a la mitad" (contiene "al inicio")
- "puedo entrar 5 min tarde?" (contiene "tarde" + minutos)

ES CANCELACIÓN (cancel_with_followup) — el lead no asistirá en absoluto. Aplica cuando
el mensaje NO contiene ninguno de los cualificadores de retraso de arriba:
- "no podré ir" / "no podré asistir" / "no voy a poder"
- "imposible asistir" / "imposible ir"
- "cancela" / "anula" / "tengo que cancelar"
- "no llego" (sola, sin "tarde" / "puntual" / "a tiempo")
- "NO LLEGO HOY" (mayúsculas, énfasis, sin cualificador) → CANCELACIÓN
- "no llego ehh" / "no llego hoy" → CANCELACIÓN
- "no voy a llegar" / "no llegaré" → CANCELACIÓN
- "estoy de resaca, no llego" → CANCELACIÓN (la resaca explica el motivo, "no llego" significa "no voy")
- "no llego a la llamada" / "no llego a la cita" → CANCELACIÓN

REGLA CLAVE: "no llego" por sí sola SIEMPRE es cancelación, A MENOS QUE vaya seguida o
acompañada por uno de los cualificadores explícitos de retraso ("tarde", "puntual",
"a tiempo", número de minutos, "al inicio"/"a mitad"). No infieras retraso si no está
explícitamente escrito.

Si el mensaje mezcla retraso + cancelación clara ("llego tarde y mejor cancela")
→ prevalece la cancelación → cancel_with_followup.

EXCEPCIÓN — CANCELACIONES CONDICIONALES NO SON CANCELACIONES:
Si el lead menciona cancelar pero como CONDICIONAL (no como decisión tomada), trata
como no_action. Mientras la condición no se cumpla, no hay cancelación real — el coach
humano gestiona la negociación.

NO ES CANCELACIÓN (no_action) — son condicionales tipo "si X entonces cancelo":
- "si es muy caro no voy a hacer la call"
- "si está fuera de mi presupuesto cancelo"
- "si no me convence, cancelo"
- "si no me das descuento, no voy"
- "depende del precio si cancelo o no"
- "podría cancelar si X"

La estructura clave es "SI X ENTONCES Y" donde Y es cancelar. Mientras la condición
no se materialice (el lead no diga después "es caro, cancela definitivo"), trata como
no_action — el lead está negociando o preguntando, no cancelando.

SÍ ES CANCELACIÓN (cancel_with_followup) — decisión tomada, sin "si":
- "cancela porfa" (decisión directa)
- "no puedo ir" (afirmación)
- "no asistiré" (decisión tomada)

EXCEPCIÓN — PROBLEMAS TÉCNICOS NO SON CANCELACIONES:
Si el lead reporta problemas técnicos para conectarse a la llamada, trata como no_action.
El coach humano gestiona el soporte técnico.

ESTA REGLA SOLO APLICA cuando el mensaje del lead menciona EXPLÍCITAMENTE al menos uno
de estos elementos tecnológicos:
1. Software de videollamada: Zoom, Meet, Google Meet, Discord, Teams, Skype, FaceTime
2. Hardware: cámara, micrófono, audio, ordenador, móvil, portátil, tablet
3. Acceso a la llamada: "el link", "el enlace", "la sala", "el room", "la URL"
4. Acción de conexión: "entrar" (a la sala/llamada/meet), "conectar", "cargar"

Ejemplos válidos de PROBLEMA TÉCNICO (no_action):
- "no me funciona Zoom" (menciona Zoom)
- "no puedo entrar, dame otro link?" (menciona "entrar" + "link")
- "no me carga la cámara" (menciona cámara)
- "no me entra al meet, ayuda" (menciona meet)
- "llevo 10 min intentando entrar, no me deja" (menciona "entrar")
- "se me ha colgado el ordenador" (menciona ordenador)
- "no me sale el link de la call" (menciona link)
- "Zoom me pide actualizar, dame un min" (menciona Zoom)

CRÍTICO: si "no me sale" / "no me funciona" / "no me entra" NO va acompañado de un término
tecnológico específico de la lista de arriba, NO es problema técnico — es otra cosa.
Ejemplos donde NO aplica esta regla:
- "no me sale hablar hoy" → NO es técnico (es emocional). CANCELACIÓN.
- "no me sale" sola → ambigüedad, NO técnico, evaluar contexto general.
- "no me funciona seguir con esto" → NO es técnico (es rechazo del programa).
- "no me viene bien" → NO es técnico (es ajuste de agenda).

DISTINCIÓN CRÍTICA: cancel_with_followup vs cancel_no_followup

cancel_with_followup es el DEFAULT para CUALQUIER cancelación. Aplica cuando el lead simplemente
no puede/no quiere ESA llamada concreta (por motivo cualquiera: enfermedad, agenda, no le apetece,
se le complica, etc.). Aunque diga cosas como "no quiero tener la llamada", "déjalo", "no me
va bien" — sigue siendo cancel_with_followup. Queremos seguir intentándolo en el seguimiento.

cancel_no_followup SOLO cuando el lead expresa RECHAZO TOTAL DEL PROGRAMA/AGENCIA. Necesitas
señales muy fuertes y explícitas como:
  - "ya no me interesa" / "perdí el interés"
  - "voy a tirar con otro entrenador" / "voy con otro"
  - "borra mis datos" / "quítame de tu lista" / "no me contactes más"
  - "déjame en paz" / "no me molestes más"
  - "paso completamente del tema" / "paso del tema, gracias"
  - "no me vale la pena, gracias"
  - "cancelo todo contigo, gracias" (cuando viene con tono de cierre/despedida)
  - Cualquier rechazo claro del programa entero, no solo de una llamada concreta.

SI HAY DUDA entre with_followup y no_followup → SIEMPRE elige cancel_with_followup. Es preferible
seguirle insistiendo a un lead que está cansado que abandonar a un lead que solo no podía esa
llamada concreta.

DETECCIÓN DE PREGUNTAS DE CONFIRMACIÓN (no son cancelación):
Si el lead PREGUNTA si la llamada sigue en pie ("sigue en pie lo de hoy?", "confírmame que
tenemos llamada"), es CONFIRMACIÓN de interés, no cancelación. no_action.

INTENTS POSIBLES:
- "no_action": conversación normal, confirmación, pregunta, lead reafirmó asistencia, ambigüedad,
  silencio post-link, lead ya reagendó (con marcador post-enlace), ajuste menor de hora
  del mismo día, aviso de retraso CON cualificador explícito, cancelación condicional
  ("si X entonces cancelo"), o problema técnico de conexión CON término tecnológico explícito.
- "cancel_with_followup": el lead pide cancelar TODAS las citas activas (excepto las marcadas
  POST-ENLACE), o pide reagendar a otro día (incluso si dice que ya lo hizo, mientras no haya
  cita post-enlace en la lista) y se le debe poner en seguimiento automático. ES EL DEFAULT
  para cualquier cancelación/reagendado con motivos no agresivos.
- "cancel_no_followup": SOLO para rechazo total del programa con señales muy explícitas.
  Cancela TODAS las pre-enlace, sin seguimiento. Caso raro.
- "cancel_partial": cancelar SOLO algunas citas concretas que el lead especificó, no todas.
  Solo se usa cuando el lead tiene MÚLTIPLES citas activas Y pide cancelar solo una/algunas
  concretas mientras MANTIENE las demás. NO usar cancel_partial para reschedules de una sola
  cita — eso es cancel_with_followup.

REGLAS GENERALES:
- Mejor "no_action" si tienes la más mínima duda sobre si hay cancelación.
- Si está claro que hay cancelación pero dudas entre with_followup y no_followup → with_followup.
- "appointment_ids_to_noshow" debe contener ÚNICAMENTE ids de la lista. Si el lead no especifica
  cuál, asume TODAS las citas activas SIN el marcador POST-ENLACE.

REGLA ESTRICTA SOBRE followup_delay_days:
followup_delay_days SOLO puede tomar uno de estos valores: 1, 3, 7, o null.
NUNCA devuelvas otro número. Aunque el lead diga "recuérdame en 5 días", "vuélveme a llamar
en 2 semanas", "en 10 días", "el viernes" o cualquier otro plazo concreto, debes redondear
SIEMPRE al valor válido más cercano siguiendo esta tabla:
  - Plazo pedido = 1 o 2 días  → 1
  - Plazo pedido = 3, 4 o 5 días → 3
  - Plazo pedido = 6 días o más → 7
  - Sin plazo / null → 1 (default)

Para decidir el delay del seguimiento (cancel_with_followup) cuando el lead NO especifica un
plazo concreto, usa el contexto:
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

  // Guard against non-canonical intent values. Treat as no_action so we never
  // execute partial actions (noshow without setting custom fields/tags).
  if (!VALID_INTENTS.has(parsed.intent)) {
    logger.warn('claude returned non-canonical intent → no_action', {
      intent: parsed.intent,
      parsed,
    });
    return {
      ok: true,
      bypass: 'unknown-intent',
      decision: {
        intent: 'no_action',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        appointment_ids_to_noshow: [],
        followup_delay_days: null,
        reasoning: `Claude returned non-canonical intent "${parsed.intent}". Original: ${parsed.reasoning || ''}`,
      },
      claudeRaw: parsed,
      transcriptionStats,
      rescheduleLinkSent,
      leadAfterLink,
    };
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
  classify, parseClaudeJson, isAudioMessage,
  formatMessagesForPrompt, formatAppointmentsForPrompt, validateAppointmentIds,
};
