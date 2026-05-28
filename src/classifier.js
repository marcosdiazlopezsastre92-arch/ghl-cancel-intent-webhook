'use strict';

const { callClaude } = require('./claudeClient');
const {
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_CLAUDE_FALLBACK_MODEL,
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

const DOUBLE_CHECK_ENABLED = process.env.DOUBLE_CHECK_ENABLED !== 'false';
const DOUBLE_CHECK_THRESHOLD = parseFloat(process.env.DOUBLE_CHECK_THRESHOLD || '0.90');
const DOUBLE_CHECK_MODEL = process.env.DOUBLE_CHECK_MODEL || 'claude-sonnet-4-6';
const DOUBLE_CHECK_INTENTS = new Set([
  'cancel_with_followup',
  'cancel_no_followup',
]);

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
      createdContext = ` | CREADA ${minsAfter}min DESPUÉS del envío del enlace de reagendar (POSIBLEMENTE ES EL RESULTADO DEL REAGENDADO DEL LEAD — NO INCLUIR EN appointment_ids_to_noshow salvo que el lead lo pida explícitamente)`;
    } else if (createdTs) {
      createdContext = ` | creada=${a.dateAdded || a.dateCreated || a.createdAt}`;
    }
    return `${i + 1}. id=${a.id} | inicio=${start} | calendario=${cal}${createdContext}`;
  }).join('\n');
}

const SYSTEM_PROMPT = `Eres un clasificador de intención de cancelación de llamadas para una agencia de coaching de fitness en España.
Lees una conversación de WhatsApp/Instagram/SMS entre el coach y un lead, junto con la lista de
llamadas futuras activas. Decides si el lead pide cancelar/reagendar alguna(s) o ninguna.

PRINCIPIO DE LECTURA — MENSAJES CONSECUTIVOS COMO UNIDAD:

En WhatsApp/Instagram/SMS la gente escribe en RÁFAGAS. Antes de clasificar, agrupa mentalmente
como UNA UNIDAD todos los mensajes consecutivos del mismo hablante hasta que el otro responda.
Interpreta esa unidad como una sola frase conectada por conjunciones implícitas.

Ejemplo: "como máximo 65€" + "si no es posible dímelo" + "y no hace falta la llamada"
→ Unidad: objeción condicional de presupuesto con manera suave de cancelar → no_action.

═══════════════════════════════════════════════════════════════════════════════
REGLA CRÍTICA #1 — CANCELAR REQUIERE DECISIÓN FIRME O DESCARTE EXPLÍCITO
═══════════════════════════════════════════════════════════════════════════════

CHEQUEO TEMPORAL OBLIGATORIO ANTES DE CANCELAR:

El día/momento que el lead descarta DEBE SOLAPAR con el día/hora de alguna
cita en LLAMADAS FUTURAS ACTIVAS. Si NO solapa, el lead habla de OTRO día → no_action.

- "hoy no puedo" + cita es MAÑANA → no_action
- "mañana por la mañana" + cita es MAÑANA POR LA TARDE → no_action
- "el viernes que viene" + cita es ESTE viernes → no_action
- "el otro lunes" + cita es ESTE lunes → no_action
- "el mes que viene" + cita en pocos días → no_action

Si el lead menciona un día SIN especificar "este/el próximo/el otro" y solo hay
UNA cita activa cercana, asume que se refiere a esa cita.

SOLO si el día/momento descartado coincide con una cita activa → aplica señales:

(A) AFIRMACIÓN FIRME — lead declara que lo hace/lo hizo:
- "ya cambié" / "ya reagendé" / "perfecto reagendo" / "miro y reagendo"
- "lo cambio ahora" / "lo estoy moviendo"

  Verbos en 1ª persona presente indicativo ("reagendo", "cambio", "muevo",
  "lo paso", "lo dejo para [día]") son AFIRMACIÓN aunque no lleven "ya"
  ni "ahora". NO confundir con condicional ("si reagendo te aviso",
  "voy a ver si lo cambio") → eso es LEAD INCIERTO.

(B) ORDEN DIRECTA / IMPERATIVA:
- "muévelo al sábado" / "cambia la llamada al jueves"
- "pasa la cita al lunes" / "ponla el viernes mejor"

  CADENA de órdenes/propuestas a días DISTINTOS al actual (aunque el lead
  dude entre ellos) → cancel. Lo que importa: NO quiere ir el día actual.
  - "cambia al jueves / no mejor sábado / mejor el viernes" → cancel
  - "muévela al lunes / ah no al martes / mejor miércoles" → cancel

  REVERSIÓN explícita al final ("ya da igual", "déjalo así", "déjalo en pie")
  → no_action. La cadena se anula.

(C) PREGUNTA O PROPUESTA + DESCARTE del día actual (explícito o implícito):

  DESCARTE EXPLÍCITO:
  - "no puedo el [día]" / "no podré asistir"
  - "no me va bien el [día]" / "no me viene bien"
  - "imposible el [día]" / "es imposible"
  - "tengo que cancelar" / "tengo que mover sí o sí"

  DESCARTE IMPLÍCITO (afirmación firme de situación que impide ir):

  CHEQUEO PREVIO — ¿hay incertidumbre? Si el lead dice "no sé si",
  "igual no", "puede que", "no creo" antes/después de la situación,
  NO es descarte → va a EXCEPCIÓN LEAD INCIERTO → no_action.

  Solo si la situación va AFIRMADA con seguridad, aplica esta lista:
  - "estoy fuera mañana" / "estoy de viaje"
  - "tengo lío mañana" / "tengo movida ese día"
  - "estoy súper liada/liado mañana" / "estoy a tope mañana"
  - "voy mal de tiempo mañana" / "estoy hasta arriba mañana"
  - "sin energía para nada mañana" / "sin fuerzas mañana"
  - "me sale algo mañana" / "me ha salido algo mañana"
  - "tengo cita médica/boda/funeral mañana" / "estoy malo"
  - "me ha salido reunión mañana"

  Descartes implícitos AFIRMADOS cuentan IGUAL que explícitos.

  Ejemplos cancel: "no puedo mañana, cambiamos día?",
  "estoy de viaje mañana, hay opción otro día?",
  "no me va bien mañana, podemos cambiar el día?"

DESCARTE FIRME + PREGUNTA DE INFO PARALELA (sigue siendo cancel):

Si el descarte es firme + el lead añade pregunta independiente sobre el servicio
("dime precios", "cuál es vuestra metodología", "mándame info"), la pregunta NO
anula el descarte → cancel_with_followup. La pregunta es interés paralelo: el
coach responderá la info y el lead reagenda cuando le venga bien.

- "no puedo mañana, pero mándame info" → cancel ✓
- "paso de la llamada de mañana. cuál es vuestra metodología?" → cancel ✓
- "mañana no puedo, pero antes dime si trabajáis con mujeres" → cancel ✓

DIFERENCIA con CONDICIONAL: en condicional la no-asistencia DEPENDE de la
respuesta del coach ("si no trabajáis con veganos cancela"). En descarte+pregunta
la no-asistencia ya está decidida.

CHEQUEO OBLIGATORIO ANTES DE ELEGIR cancel_with_followup — ¿ES cancel_partial?

Si hay 2+ citas activas Y el lead pide mantener algunas explícitamente
("las próximas mantenlas", "las otras déjalas", "la del [día] sí",
"déjame solo la siguiente") → intent = cancel_partial, NO cancel_with_followup.
Ver sección CANCEL_PARTIAL más abajo.

═══════════════════════════════════════════════════════════════════════════════
CITAS POST-ENLACE — qué significa el marcador y cómo actuar
═══════════════════════════════════════════════════════════════════════════════

El Coach puede ser humano o IA. Si ves "Coach [ENVIÓ ENLACE DE REAGENDAR]"
significa que mandó el enlace para mover la cita.

Una cita en LLAMADAS FUTURAS ACTIVAS puede venir con marcador "CREADA Xmin
DESPUÉS del envío del enlace de reagendar". Ese marcador es la ÚNICA señal
fiable de que el lead realmente reagendó.

PRINCIPIO DEFENSIVO: las palabras del lead NO son prueba de reagendado real.
Cuando hay descarte verbal/orden/afirmación, cancela por defensa POR DEFECTO.
Solo el marcador FÍSICO de cita post-enlace cambia el comportamiento sobre la
cita NUEVA (no se marca como noshow). Las citas VIEJAS siempre se cancelan.

CASO CRÍTICO: "ya reagendé" SIN marcador post-enlace en la lista → cancel_with_followup
(lead probablemente NO reagendó realmente; cancelar por defensa).
"ya reagendé" CON marcador post-enlace → cancel_with_followup también, pero la
cita post-enlace NO va a appointment_ids_to_noshow; solo las VIEJAS.

CASOS POST-ENLACE (cuando el Coach envió el enlace):
- Lead acepta CLARAMENTE ("vale gracias", "perfecto, lo cambio", "miro y reagendo",
  "lo hago ahora") → cancel_with_followup.
- Lead RECHAZA o reafirma asistencia ("no, mejor lo dejo", "al final sí puedo")
  → no_action.
- Lead AMBIGUO o silencioso ("déjame pensarlo", "luego te digo", "vale" sin más)
  → no_action. NUNCA asumir aceptación por silencio.
- Lead había cancelado claramente ANTES del enlace y no respondió → cancel_with_followup.

═══════════════════════════════════════════════════════════════════════════════
EXCEPCIONES — precedencia (evalúa en este orden, para en la primera que coincida)
═══════════════════════════════════════════════════════════════════════════════

1. PROBLEMAS TÉCNICOS → no_action
2. RETRASOS (cualificador "tarde"/minutos/"al inicio") → no_action
3. LEAD INCIERTO (duda explícita sobre asistir) → no_action
4. CANCELACIONES CONDICIONALES ("SI X ENTONCES Y") → no_action
5. AJUSTES DE HORA MISMO DÍA → no_action
6. PREGUNTAS EXPLORATORIAS SIN DESCARTE → no_action
7. CASO ESPECIAL ENTRENADOR → no_action (soft) o cancel_no_followup (firme)
8. REGLA CRÍTICA #1 (A, B, C) → cancel_with_followup (con CHEQUEO cancel_partial)
9. Default → no_action

EXCEPCIÓN — PROBLEMAS TÉCNICOS:

Aplica si el lead menciona EXPLÍCITAMENTE un término técnico:
- Software videollamada: Zoom, Meet, Discord, Teams, Skype, FaceTime
- Hardware: cámara, micrófono, audio, ordenador, móvil, portátil, tablet
- Acceso: "el link/enlace", "la sala", "la URL"
- Conexión local: "entrar" (a la sala/llamada), "conectar", "cargar"
- Red/internet: "wifi", "internet", "conexión", "red", "datos móviles",
  "cobertura", "señal"

Ejemplos: "no me funciona Zoom", "no puedo entrar, dame otro link",
"no me carga la cámara", "no tengo wifi", "se ha caído internet".

PRECEDENCIA CRÍTICA: si en el mismo mensaje el lead combina término técnico
explícito + frase de descarte ("no llego, no tengo wifi" / "no puedo, se me
cayó internet"), TÉCNICO GANA → no_action. El "no llego" es consecuencia del
problema técnico, no decisión firme.

NO es técnico si "no me sale/funciona/entra" NO va con término tecnológico:
- "no me sale hablar mañana" → emocional → cancelación
- "no me funciona seguir con esto" → rechazo del programa
- "no me viene bien mañana" → descarte firme del día

EXCEPCIÓN — RETRASOS NO SON CANCELACIONES:

ES RETRASO solo si contiene EXPLÍCITAMENTE:
- "tarde" / "puntual" / "a tiempo"
- Número de minutos ("10 min", "media hora")
- "al inicio" / "a mitad" / "al final"

Ejemplos retraso (no_action): "no podré llegar a tiempo", "llego 10 min tarde",
"no llego al inicio", "puedo entrar 5 min tarde?".

ES CANCELACIÓN si NO contiene esos cualificadores:
- "no podré ir/asistir" / "imposible ir"
- "cancela" / "anula" / "tengo que cancelar"
- "no llego" sola (sin cualificador de retraso)

"No llego" SIN cualificador SIEMPRE es cancelación. Mezcla retraso +
cancelación firme → prevalece cancelación.

EXCEPCIÓN — LEAD INCIERTO:

Si el lead expresa INCERTIDUMBRE clara sobre si podrá asistir → no_action.
Incertidumbre NO es decisión: es duda, no descarte. Preserva la cita y
espera la decisión real.

Señales de incertidumbre:
- "puede que no" / "igual no llego" / "no estoy seguro"
- "no sé si podré" / "no sé si voy a poder" / "no creo que pueda"
- "espero estar pero..." / "a ver si me da tiempo" / "veremos cómo va"

Estas señales bastan para no_action AUNQUE el lead no ofrezca confirmar
explícitamente. Si además ofrece confirmar ("te aviso a la tarde") o da
alternativa con "O" ("te confirmo mañana O cambiamos"), refuerza no_action.

La incertidumbre puede ir acompañada de motivo personal o familiar
(problema familiar, lío en el trabajo, estoy malo, etc.). Lo que activa
la excepción es la INCERTIDUMBRE, no el motivo en sí.

CONTRASTE (cancel — descarte firme SIN incertidumbre):
- "No puedo mañana, cambiamos?" → firme
- "Mañana imposible, qué huecos tenéis?" → firme
- "Tengo que cancelar" → firme
- "Estoy fuera mañana" → afirmación firme, no duda
- "Tengo lío mañana, podemos pasarla?" → afirmación + propuesta, no duda

CLAVE: incertidumbre ≠ descarte. Si lead DUDA, no_action. Si lead AFIRMA
imposibilidad (con o sin motivo), cancel.

EXCEPCIÓN — CANCELACIONES CONDICIONALES:

Estructura "SI X ENTONCES Y" donde Y es forma de NO hacer la llamada.
Mientras la condición no se cumpla, no hay cancelación real → no_action.

VARIANTES DE X: precio, tiempo, formato, circunstancias personales,
expectativa, contenido del servicio.

VARIANTES DE Y (formas SUAVIZADAS): "no hace falta la llamada", "mejor no",
"prefiero no", "mejor lo dejamos", "déjalo".

Ejemplos no_action:
- "como máximo 65€ + si no es posible dímelo + no hace falta la llamada"
- "solo tengo media hora + si necesitáis más, mejor no la hacemos"
- "si no trabajáis con veganos cancela mañana"
- "si es solo para venderme, prefiero no hacerla"

DISTINCIÓN SUAVIZADO vs FIRME:
- SUAVIZADO ("mejor no", "prefiero no", "lo dejamos") = no_action SOLO
  dentro de estructura "si X entonces Y" con objeción.
- FIRME ("cancela", "anula", "no voy", "imposible") = cancel siempre.

"No me va bien [día]" es DESCARTE FIRME del día (NO suavizado). Solo es
suavizado si va dentro de condicional ("si dura mucho, no me va bien").

EXCEPCIÓN A LA EXCEPCIÓN: si tras objeción condicional el lead AÑADE lenguaje
firme ("es caro. cancela definitivamente") → cancel.

EXCEPCIÓN — AJUSTES DE HORA DEL MISMO DÍA:

Si el lead pide ajustar la HORA SIN cambiar el día → no_action. Aplica también
cuando el ajuste se expresa con descarte de la hora actual + propuesta de otra
hora MISMO día.

Variantes que aplican:
- "podemos a las 18 en vez de 16?" / "30 min más tarde?"
- "puedo a las 20 mejor?" / "a la noche en vez de tarde?"
- "mañana no llego al horario que tienes, dame uno por la tarde"
- "no puedo a las 16, podemos a las 18 mismo día?"

CLAVE: descarte de hora + propuesta de otra hora del MISMO día = ajuste, no
cancelación.

DIFERENCIAR:
- "podemos hacerla el jueves?" → PREGUNTAS EXPLORATORIAS
- "más tarde de esta semana, hoy no" → cancel (descarte: "hoy no")
- "mejor en 2 días" → PREGUNTAS EXPLORATORIAS

EXCEPCIÓN — PREGUNTAS EXPLORATORIAS SOBRE CAMBIO SIN DESCARTE:

Lead PREGUNTA o PROPONE cambio sin descartar el día actual → no_action.
Está explorando, no decidiendo.

REQUIERE AMBAS:
(1) Pregunta o propuesta de cambio (puede mencionar día/hora alternativos)
(2) NO menciona descartes del día actual (lista en REGLA CRÍTICA #1 (C))

VERBOS DE EXPLORACIÓN: "sería posible", "habría opción", "tendrías hueco",
"podría ser", "es posible", "hay opción", "hay forma".

VERBOS DE DECISIÓN PROPUESTA (1ª persona plural): "cambiamos", "movemos",
"pasamos". Sin descarte → no_action. Con descarte → cancel.

NO APLICA a:
- Afirmaciones firmes en 1ª persona singular ("reagendo", "lo cambio", "muevo") → cancel
- Órdenes ("muévelo", "cámbialo") → cancel
- Cadena de órdenes a días distintos (ver señal (B)) → cancel

Ejemplos no_action: "Podemos cambiar al sábado?", "Hay opción del jueves?",
"Tendrías hueco el lunes?", "Cambiamos día?".

EXCEPCIÓN — CASO ESPECIAL: LEAD MENCIONA TENER ENTRENADOR:

(a) SOFT — lead negocia, abierto a diferenciar → no_action
   "tengo ya un entrenador + si no aportáis más, mejor no"
   "trabajo con otro coach + si no encaja con vuestro método lo dejamos"

(b) FIRME — rechazo cerrado del programa → cancel_no_followup
   "ya tengo entrenador, no necesito otro, gracias"
   "estoy entrenando con alguien, no me hace falta más"
   "voy a tirar con mi entrenador actual"

CLAVE: condicional "si" → soft. Decisión cerrada sin condicional → firme.
Duda → soft → no_action.

═══════════════════════════════════════════════════════════════════════════════
CANCEL_PARTIAL — CUÁNDO USAR
═══════════════════════════════════════════════════════════════════════════════

Solo si lead tiene 2+ citas activas Y pide cancelar específicamente algunas
(no todas), manteniendo el resto.

SEÑAL DIRECTA — lead dice QUÉ cancelar:
- "Cancela solo la de mañana, la del jueves mantenla"
- "La de mañana no puedo, pero la siguiente sí"
- "Anula la primera, las otras déjalas"
- "Mañana no puedo, las próximas mantenlas como están"

SEÑAL INVERSA — lead dice QUÉ MANTENER (cancelar el resto):
- "déjame solo la del [día]" → cancela TODAS menos la del [día]
- "solo voy a la del [día]" → cancela TODAS menos la del [día]
- "voy a todas menos la del [día]" → cancela SOLO la del [día]
- "quédate solo con la próxima/siguiente" → cancela TODAS menos esa
- "déjame solo la siguiente" → cancela TODAS menos la siguiente

CLAVE en señal inversa: appointment_ids_to_noshow = todas las citas NO
mencionadas en el "solo X".

NO usar cancel_partial:
- 1 cita activa → cancel_with_followup
- Cancela TODAS → cancel_with_followup (o no_followup si rechaza programa)
- Reagendar una sola cita → cancel_with_followup
- "ya reagendé" + cita post-enlace en lista → cancel_with_followup

═══════════════════════════════════════════════════════════════════════════════
INTENTS POSIBLES
═══════════════════════════════════════════════════════════════════════════════

- no_action: conversación normal, confirmación de asistencia, ambigüedad,
  silencio post-enlace, ya reagendó con marcador post-enlace, ajuste hora
  mismo día, retraso con cualificador, condicional, problema técnico, lead
  incierto (duda explícita), pregunta exploratoria sin descarte, día/momento
  descartado que NO coincide con la cita.

- cancel_with_followup: DEFAULT para cancelación/reagendado firme. Lead afirma
  firmemente, da orden directa, o pregunta CON descarte (explícito o implícito).
  Incluye "ya reagendé" sin marcador post-enlace.

- cancel_no_followup: SOLO rechazo total del programa con señales muy
  explícitas: "ya no me interesa", "perdí el interés", "borra mis datos",
  "no me contactes más", "déjame en paz", "paso completamente del tema",
  "no me vale la pena", "cancelo todo contigo, gracias". Para "tengo
  entrenador" → ver CASO ESPECIAL.
  EN DUDA con_followup vs no_followup → SIEMPRE with_followup.

- cancel_partial: cancelar solo algunas citas concretas (ver sección arriba).

═══════════════════════════════════════════════════════════════════════════════
MAPEO INTENT → CAMPOS (nombres EXACTOS en el JSON)
═══════════════════════════════════════════════════════════════════════════════

- no_action            → appointment_ids_to_noshow: [],
                         followup_delay_days: null
- cancel_with_followup → appointment_ids_to_noshow: [todos los ids SIN marcador post-enlace],
                         followup_delay_days: 1 / 3 / 7
- cancel_no_followup   → appointment_ids_to_noshow: [todos los ids SIN marcador post-enlace],
                         followup_delay_days: null
- cancel_partial       → appointment_ids_to_noshow: [solo los que el lead especificó],
                         followup_delay_days: null

REGLAS GENERALES:
- Mejor "no_action" si tienes la más mínima duda.
- appointment_ids_to_noshow contiene ÚNICAMENTE ids de la lista activa.

═══════════════════════════════════════════════════════════════════════════════
POLÍTICA followup_delay_days
═══════════════════════════════════════════════════════════════════════════════

Valores válidos: 1, 3, 7, o null. DEFAULT FUERTE = 1 día.
Distribución esperada: ~95% son 1, ~4% son 3, ~1% es 7.

- 1 día: cancelación sin motivo o motivo puntual (resaca, lío trabajo, reunión,
  malestar, "estoy malo", viaje/ausencia/enfermedad SIN duración especificada,
  "se me complicó"). EN CUALQUIER DUDA SOBRE DURACIÓN → 1.

- 3 días: SOLO si lead indica EXPLÍCITAMENTE impedimento de varios días
  ("gripe llevo 2 días", "fuera hasta el viernes" si hoy es jueves,
  "vuelvo en 3-4 días", "los próximos días imposible").

- 7 días: SOLO si lead indica EXPLÍCITAMENTE ausencia ≥ semana:
  "vacaciones 10 días", "2 semanas fuera", "esta semana imposible",
  "vuelvo el día X" si faltan 7+ días.

═══════════════════════════════════════════════════════════════════════════════
CRITERIOS PARA confidence
═══════════════════════════════════════════════════════════════════════════════

- 0.95-1.00: señal explícita sin ambigüedad ("cancela mañana" → 0.98).
- 0.85-0.94: señal clara, requiere interpretar contexto multi-mensaje.
- 0.80-0.84: aplicas excepción específica que requiere lectura cuidadosa.
- < 0.80: caso límite. Sistema fuerza no_action si confidence <0.80 para
  intents ≠ no_action. Si dudas a este nivel para cancel, devuelve no_action
  directamente con confidence ~0.85.

═══════════════════════════════════════════════════════════════════════════════
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

async function classify({ messages, appointments, apiKey, openaiApiKey, ghlAuthorization, model, fallbackModel, threshold }) {
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

  const effectiveFallback = fallbackModel !== undefined ? fallbackModel : DEFAULT_CLAUDE_FALLBACK_MODEL;
  const claudeRes = await callClaude({
    apiKey,
    model: model || DEFAULT_CLAUDE_MODEL,
    fallbackModel: effectiveFallback || undefined,
    system: SYSTEM_PROMPT,
    userMessage,
  });
  if (!claudeRes.ok) return { ok: false, error: 'claude-call-failed', detail: claudeRes, transcriptionStats };

  if (claudeRes.modelUsed && claudeRes.modelUsed !== (model || DEFAULT_CLAUDE_MODEL)) {
    logger.info('classification served by fallback model', { modelUsed: claudeRes.modelUsed });
  }

  let parsed = parseClaudeJson(claudeRes.text);
  if (!parsed || !parsed.intent) {
    logger.warn('claude unparseable output', { text: (claudeRes.text || '').slice(0, 500) });
    return { ok: false, error: 'claude-parse-failed', rawText: claudeRes.text, transcriptionStats };
  }

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

  let conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  let trustedFromDoubleCheck = false;

  // ============== DOUBLE-CHECK with Sonnet ==============
  let doubleCheckMeta = null;
  if (
    DOUBLE_CHECK_ENABLED &&
    DOUBLE_CHECK_INTENTS.has(parsed.intent) &&
    conf < DOUBLE_CHECK_THRESHOLD
  ) {
    logger.info('triggering double-check with Sonnet', {
      haiku_intent: parsed.intent,
      haiku_confidence: conf,
      threshold: DOUBLE_CHECK_THRESHOLD,
      doubleCheckModel: DOUBLE_CHECK_MODEL,
    });

    const sonnetRes = await callClaude({
      apiKey,
      model: DOUBLE_CHECK_MODEL,
      system: SYSTEM_PROMPT,
      userMessage,
    });

    if (sonnetRes.ok) {
      const sonnetParsed = parseClaudeJson(sonnetRes.text);
      if (sonnetParsed && VALID_INTENTS.has(sonnetParsed.intent)) {
        const sonnetValidation = validateAppointmentIds(
          sonnetParsed.appointment_ids_to_noshow,
          appointments,
        );
        sonnetParsed.appointment_ids_to_noshow = sonnetValidation.accepted;

        const haikuIntent = parsed.intent;
        const haikuConfidence = conf;
        const haikuReasoning = parsed.reasoning || '';
        const sonnetReasoning = sonnetParsed.reasoning || '';
        const changed = haikuIntent !== sonnetParsed.intent;

        logger.info('double-check sonnet result', {
          haiku_intent: haikuIntent,
          haiku_confidence: haikuConfidence,
          haiku_reasoning: haikuReasoning,
          sonnet_intent: sonnetParsed.intent,
          sonnet_confidence: sonnetParsed.confidence,
          sonnet_reasoning: sonnetReasoning,
          changed,
        });

        doubleCheckMeta = {
          triggered: true,
          haikuIntent,
          haikuConfidence,
          haikuReasoning,
          sonnetIntent: sonnetParsed.intent,
          sonnetConfidence: sonnetParsed.confidence,
          sonnetReasoning,
          changed,
        };

        parsed = sonnetParsed;
        conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
        parsed.reasoning = `[Double-check Sonnet from ${haikuIntent}@${haikuConfidence.toFixed(2)}] ${sonnetReasoning}`.trim();
        trustedFromDoubleCheck = true;
      } else {
        logger.warn('double-check sonnet returned invalid/unparseable, keeping haiku', {
          rawText: (sonnetRes.text || '').slice(0, 500),
        });
      }
    } else {
      logger.warn('double-check sonnet call failed, keeping haiku', {
        error: sonnetRes.error || sonnetRes.status,
        body: sonnetRes.body,
      });
    }
  }
  // ============== END DOUBLE-CHECK ==============

  const effectiveThreshold = threshold ?? (leadAfterLink ? POST_LINK_AMBIGUOUS_THRESHOLD : DEFAULT_CONFIDENCE_THRESHOLD);
  if (parsed.intent !== 'no_action' && conf < effectiveThreshold && !trustedFromDoubleCheck) {
    logger.info('classification below threshold → no_action', { confidence: conf, threshold: effectiveThreshold, leadAfterLink });
    return {
      ok: true, bypass: 'low-confidence',
      decision: { intent: 'no_action', confidence: conf, appointment_ids_to_noshow: [],
                  followup_delay_days: null,
                  reasoning: `Below threshold (${conf} < ${effectiveThreshold}). Original: ${parsed.reasoning || ''}` },
      claudeRaw: parsed, transcriptionStats, rescheduleLinkSent, leadAfterLink, doubleCheckMeta,
    };
  }

  if (trustedFromDoubleCheck && conf < effectiveThreshold) {
    logger.warn('trusting sonnet override despite low confidence', {
      sonnet_intent: parsed.intent,
      sonnet_confidence: conf,
      threshold: effectiveThreshold,
    });
  }

  if (parsed.intent !== 'no_action' && parsed.appointment_ids_to_noshow.length === 0) {
    logger.warn('cancel intent but no valid appointment ids → no_action', { parsed });
    return {
      ok: true, bypass: 'no-valid-ids',
      decision: { intent: 'no_action', confidence: conf, appointment_ids_to_noshow: [],
                  followup_delay_days: null,
                  reasoning: `Claude said ${parsed.intent} but listed no valid IDs. Original: ${parsed.reasoning || ''}` },
      claudeRaw: parsed, transcriptionStats, rescheduleLinkSent, leadAfterLink, doubleCheckMeta,
    };
  }

  return { ok: true, decision: parsed, rejectedIds: rejected, transcriptionStats, rescheduleLinkSent, leadAfterLink, doubleCheckMeta };
}

module.exports = {
  classify, parseClaudeJson, isAudioMessage,
  formatMessagesForPrompt, formatAppointmentsForPrompt, validateAppointmentIds,
};
