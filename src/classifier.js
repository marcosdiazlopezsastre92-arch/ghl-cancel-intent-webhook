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
// Threshold de confianza por debajo del cual cancel_with_followup / cancel_no_followup
// dispara el double-check con Sonnet. Default 0.95 = mismo valor que producción
// (Railway env DOUBLE_CHECK_THRESHOLD). Si la env var no existe por error, el
// sistema sigue funcionando con el threshold real esperado.
const DOUBLE_CHECK_THRESHOLD = parseFloat(process.env.DOUBLE_CHECK_THRESHOLD || '0.95');
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
EXCEPCIONES — precedencia (evalúa en este orden, para en la primera que coincida)
═══════════════════════════════════════════════════════════════════════════════

╔═══════════════════════════════════════════════════════════════════╗
║  ORDEN DE EVALUACIÓN OBLIGATORIO                                  ║
╚═══════════════════════════════════════════════════════════════════╝

Empieza SIEMPRE por estas excepciones (puntos 1-7). SOLO si NINGUNA
aplica, baja a REGLA CRÍTICA #1 (punto 8, descrita más abajo en este
prompt).

CLAVE: una EXCEPCIÓN que aplique BLOQUEA cualquier evaluación de cancel,
aunque las frases del lead parezcan encajar en REGLA CRÍTICA #1. Ejemplo:
"no puedo, no tengo wifi" parece cancel ("no puedo") pero TÉCNICO GANA
porque la EXCEPCIÓN 1 aplica primero.

1. PROBLEMAS TÉCNICOS → no_action
2. RETRASOS (cualificador "tarde"/minutos/"al inicio") → no_action
3. LEAD INCIERTO (duda explícita sobre asistir) → no_action
4. CANCELACIONES CONDICIONALES ("SI X ENTONCES Y") → no_action
5. AJUSTES DE HORA MISMO DÍA → no_action
6. PREGUNTAS EXPLORATORIAS SIN DESCARTE → no_action
7. CASO ESPECIAL ENTRENADOR → no_action (soft) o cancel_no_followup (firme)
8. REGLA CRÍTICA #1 (A, B, C) → cancel_with_followup (con CHEQUEO cancel_partial)
9. Default → no_action

╔═══════════════════════════════════════════════════════════════════╗
║  ATAJO PARA "no llego" — frase de alta frecuencia                 ║
╚═══════════════════════════════════════════════════════════════════╝

Cuando veas "no llego" en el mensaje del lead, decide así en este orden:
1. ¿Hay término técnico en el mismo mensaje (wifi, internet, Zoom, cámara,
   link, etc.)? → no_action (EXCEPCIÓN 1 PROBLEMAS TÉCNICOS).
2. ¿Hay cualificador de retraso ("tarde", minutos concretos, "al inicio",
   "a tiempo")? → no_action (EXCEPCIÓN 2 RETRASOS).
3. Si no hay ni término técnico ni cualificador de retraso → cancel (REGLA
   CRÍTICA #1).

Ejemplos:
- "no llego, no tengo wifi" → técnico → no_action
- "no llego al inicio" → retraso → no_action
- "no llego mañana" → cancel

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

NO APLICA a (estos son AFIRMACIONES FIRMES → cancel, ver REGLA CRÍTICA #1):
- Afirmaciones firmes en 1ª persona singular ("reagendo", "lo cambio", "muevo") → cancel
- Modales de necesidad + verbo de cambio: "necesito cambiar", "necesito mover",
  "tengo que cambiar", "tengo que mover", "debo reagendar", "voy a tener que
  mover/cambiar" → cancel. El lead expresa decisión, no exploración.
- Órdenes ("muévelo", "cámbialo") → cancel
- Cadena de órdenes a días distintos (ver señal (B)) → cancel
- Jerga de ocupación ("estoy a tope", "tengo lío", "estoy hasta arriba",
  "estoy liada/o", "tengo movida", "voy mal de tiempo") + refuerzo (propuesta
  de cambio "cambiamos?", "movemos?", "hay opción?" o imposibilidad explícita
  "no puedo", "no llego", "imposible") → cancel. Va a REGLA CRÍTICA #1 (C)(2),
  no es exploración. Esta excepción 6 NO bloquea ese caso.

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

PRINCIPIO PREVIO — APLICA ANTES QUE TODO LO DEMÁS:
Una cancelación firme del lead ANTES del enlace NO se anula por el silencio
posterior. El enlace es facilitador del reagendado, no condición de la
cancelación. Si el lead canceló claramente antes (con o sin propuesta de día
alternativo) → cancel_with_followup, independientemente de si después aceptó,
rechazó o calló sobre el enlace.

Solo si NO hubo cancelación previa firme, aplica las señales post-enlace:
- Lead acepta CLARAMENTE ("vale gracias", "perfecto, lo cambio", "miro y reagendo",
  "lo hago ahora") → cancel_with_followup.
- Lead RECHAZA o reafirma asistencia ("no, mejor lo dejo", "al final sí puedo")
  → no_action.
- Lead AMBIGUO o silencioso ("déjame pensarlo", "luego te digo", "vale" sin más)
  → no_action. NUNCA asumir aceptación por silencio.

═══════════════════════════════════════════════════════════════════════════════
REGLA CRÍTICA #1 — CANCELAR REQUIERE DECISIÓN FIRME O DESCARTE EXPLÍCITO
═══════════════════════════════════════════════════════════════════════════════

(Esta es el punto 8 de la precedencia. Solo llegas aquí si NINGUNA de las
EXCEPCIONES 1-7 aplica.)

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

(A) AFIRMACIÓN FIRME — lead declara que lo hace / lo hizo / necesita hacerlo:
- "ya cambié" / "ya reagendé" / "perfecto reagendo" / "miro y reagendo"
- "lo cambio ahora" / "lo estoy moviendo"
- "necesito cambiar/mover/reagendar [el día/la cita/la llamada]"
- "tengo que cambiar/mover/reagendar [el día/la cita/la llamada]"
- "debo cambiar/mover" / "voy a tener que mover/cambiar/reagendar"

  Verbos en 1ª persona presente indicativo ("reagendo", "cambio", "muevo",
  "lo paso", "lo dejo para [día]") son AFIRMACIÓN aunque no lleven "ya"
  ni "ahora". NO confundir con condicional ("si reagendo te aviso",
  "voy a ver si lo cambio") → eso es LEAD INCIERTO.

  MODALES DE NECESIDAD ("necesito", "tengo que", "debo", "voy a tener que")
  + verbo de cambio (cambiar, mover, reagendar, pasar) son afirmaciones
  firmes equivalentes a (A). El lead expresa decisión, no exploración.
  Ejemplos:
  - "Necesito cambiar el día de la llamada" → cancel
  - "Tengo que mover la cita" → cancel
  - "Voy a tener que reagendar" → cancel

  EXCEPCIÓN al modal: si el modal va en estructura SUBORDINADA con verbo
  cognitivo que sugiere duda ("Necesito SABER si puedo cambiar", "Tengo que
  VER si me cuadra", "Debo MIRAR la agenda") → eso es exploración o lead
  incierto → no_action. La clave: si el verbo inmediato después del modal
  es uno de cambio (cambiar/mover/reagendar/pasar) cuenta como cancel; si
  es uno cognitivo (saber/ver/mirar/comprobar/preguntar) NO cuenta.

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

  DESCARTE IMPLÍCITO firmemente AFIRMADO:

  CHEQUEO PREVIO — si el lead dice "no sé si", "igual no", "puede que",
  "no creo" antes/después de la situación, NO es descarte → EXCEPCIÓN
  LEAD INCIERTO → no_action.

  DOS CATEGORÍAS de frases de descarte implícito:

  (1) COMPROMISO FÍSICO incompatible (cuentan SOLAS como cancel):
  - "estoy de viaje" / "estoy fuera"
  - "tengo cita médica/boda/funeral/entierro"
  - "estoy malo/enfermo/con fiebre" (sin cualificador de hora puntual)
  - "tengo compromiso/evento familiar"

  (2) JERGA DE OCUPACIÓN (NO cuentan solas — requieren refuerzo):
  - "estoy a tope" / "estoy súper liada/liado" / "estoy hasta arriba"
  - "tengo lío" / "tengo movida"
  - "voy mal de tiempo" / "sin energía/fuerzas"
  - "me sale algo" / "me ha salido reunión/algo"

  Para que una frase de (2) cuente como cancel, el mismo mensaje del
  lead debe contener al menos UNO de estos refuerzos:
  - Propuesta de cambio: "cambiamos?", "movemos?", "hay opción?",
    "podemos pasarla?", "para otro día?"
  - Imposibilidad explícita: "no puedo", "no llego", "imposible",
    "no me da"

  Si una frase de (2) va sola, o va con confirmación de asistencia
  en cualquier orden ("ahí estaré", "te veo a las 17", pregunta de
  detalle práctico como enlace/hora/duración) → no_action.

  IMPORTANTE: cuando una frase de (2) va con refuerzo, cuenta como
  descarte real → aplica REGLA CRÍTICA #1, NO la excepción
  PREGUNTAS EXPLORATORIAS SIN DESCARTE.

  Descartes (1) cuentan IGUAL que descartes explícitos.

  Ejemplos cancel:
  - "no puedo mañana, cambiamos día?"
  - "estoy de viaje mañana, hay opción otro día?"  (1) sola
  - "estoy a tope mañana, cambiamos?"  (2) + refuerzo
  - "tengo lío mañana, no puedo"  (2) + refuerzo

  Ejemplos NO cancel (no_action):
  - "estoy a tope mañana"  (2) sola
  - "tengo lío mañana, te aviso si me retraso"  (2) + confirmación
  - "ahí estaré mañana pero estoy a tope"  (2) + confirmación previa

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

╔═══════════════════════════════════════════════════════════════════╗
║  ALCANCE — LEE ESTO ANTES DE NADA                                 ║
╚═══════════════════════════════════════════════════════════════════╝

Esta política SOLO se aplica si YA has decidido que el intent es
cancel_with_followup (única clase que usa delay; cancel_no_followup y
cancel_partial llevan followup_delay_days: null).

Los ejemplos de motivos que verás abajo (hospital, exámenes, torneo,
proyecto, entrega, mudanza, crisis, baja médica, etc.) NO son señales
nuevas de cancelación. Son referencias para estimar DURACIÓN una vez
ya has decidido que es cancel.

Si el lead menciona alguno de esos motivos pero NO cumple REGLA CRÍTICA
#1 (descarte firme, orden directa, o descarte implícito con refuerzo)
→ el intent sigue siendo no_action y esta política NO se aplica.

Por ejemplo, "estoy con un proyecto esta semana" SOLO es cancel si va
acompañado de un descarte/propuesta/imposibilidad ("no puedo mañana",
"cambiamos?", etc.). Por sí solo es no_action, igual que cualquier otra
mención de ocupación sin refuerzo.

Cadena correcta de decisión:
  1. ¿Aplica una EXCEPCIÓN? → no_action (delay = null).
  2. ¿Cumple REGLA CRÍTICA #1? Si NO → no_action (delay = null).
  3. Si SÍ es cancel_with_followup → AHORA elige delay con reglas de abajo.

═══════════════════════════════════════════════════════════════════════════════

Valores válidos: 1, 3, 7, o null.

─── PRINCIPIO GENERAL ───

El seguimiento debe llegar cuando el lead YA está disponible de nuevo.
Demasiado pronto = lead aún ocupado, se frustra y bloquea.
Demasiado tarde = pierdes momentum y se enfría.

Estima la DURACIÓN APROXIMADA del motivo del lead y mapea:
- ~1 día (motivo se resuelve hoy o mañana)     → 1
- ~2-4 días (corto plazo, varios días)         → 3
- ≥5 días (semana o más)                       → 7

Para estimar la duración usa, en este orden:
  1. Patrones literales tipificados (lista abajo) si encajan claramente.
  2. INFERENCIA con SENTIDO COMÚN cuando el motivo no encaja en patrones
     literales (ver guía abajo). NO te obligues a usar solo los patrones —
     piensa cuánto suele durar lo que el lead describe.
  3. Si NO hay info de duración alguna ("no puedo mañana", "cancela") → 1.

═══════════════════════════════════════════════════════════════════
PATRONES TIPIFICADOS (referencia rápida cuando coincidan literal)
═══════════════════════════════════════════════════════════════════

─── 1 DÍA — motivo puntual del momento o del día ───

- Urgencia inmediata: "se me lió ahora", "ya estoy en marcha",
  "me ha surgido reunión", "me llaman ahora"
- Lío puntual del día: "tengo movida hoy", "estoy hasta arriba hoy",
  "tengo lío" sin más contexto temporal
- Salud SIN duración: "estoy malo", "estoy enfermo", "tengo gripe",
  "estoy resfriado", "no me encuentro bien", "estoy con fiebre"
- Compromiso familiar / evento puntual: "tengo boda", "tengo funeral",
  "tengo cita médica", "evento del colegio", "comunión", "cumpleaños"
- Cancel sin motivo declarado: "no puedo mañana", "cancela", "lo dejamos"

─── 3 DÍAS — motivo de corto plazo (2-4 días) ───

- Viaje SIN duración: "estoy de viaje", "estoy fuera", "me voy de viaje",
  "tengo viaje" (asume fin de semana / 2-3 días por defecto)
- Mención de "varios días" / "unos días":
  "estos días los tengo caóticos", "tengo unos días complicados",
  "los próximos días imposible", "estos días raros"
- Mudanza, obra en casa, reformas (sin duración explícita)
- "Estoy de baja", "estoy con el médico unos días"
- Salud con duración corta especificada: "llevo 2 días con gripe",
  "el médico me ha dado 3 días", "estoy malo hace varios días"

─── 7 DÍAS — una semana o más ───

- "Esta semana imposible" / "no puedo esta semana"
- "Fin de semana fuera" / "todo el finde liado"
- Vacaciones SIN número: "estoy de vacaciones", "me voy de vacaciones",
  "fuera por vacaciones"
- Viaje con duración semanal o más: "estoy fuera 10 días",
  "2 semanas fuera", "viaje de una semana", "estoy fuera todo el mes"
- "Vuelvo el [día que cae 7+ días en el futuro]"
- "La semana que viene también complicado"

═══════════════════════════════════════════════════════════════════
INFERENCIA INTELIGENTE — cuando no encaja en patrones literales
═══════════════════════════════════════════════════════════════════

Si el lead da un motivo que no aparece arriba, piensa con sentido común
cuánto suele durar y elige delay. Ejemplos:

- "tengo a mi madre/padre/familia en el hospital" → ingreso suele ser
  varios días → 3 (o 7 si menciona algo grave como UCI / operación
  fuerte / "puede tardar")
- "se me han juntado exámenes" / "estoy de oposición" / "tengo finales"
  → períodos de estudio duran ~1-2 semanas → 7
- "estoy con un proyecto/entrega/deadline" → 3 si suena puntual, 7 si dice
  "todo este mes" o "las próximas semanas"
- "tengo torneo/competición/partido este finde" → fin de semana → 7
  (mejor esperar a que termine el evento entero)
- "estoy en un curso intensivo/congreso/formación" → suele durar varios
  días → 3 si dura un par de días, 7 si suena a semana entera
- "se me ha muerto un familiar" / duelo cercano → 7 (respeta espacio)
- "estoy con la mudanza/reformas/obra" → suele durar varios días → 3
  (7 si dice "estamos toda la semana")
- "tengo crisis con [pareja/familia/trabajo]" → emocional, suele
  resolverse en pocos días → 3
- "estoy fatal, no puedo con nada" → emocional vago → 1 (suele pasar
  rápido o el lead vuelve por sí mismo)
- "estoy de baja médica" / "el médico me ha mandado reposo" sin duración
  → asume mínimo varios días → 3 (o 7 si dice "no sé cuándo volveré")
- "tengo que viajar por trabajo" → similar a viaje → 3
- "estoy en el extranjero" → suele ser viaje largo → 7
- "me ha salido un curro/trabajo extra" → varios días típico → 3

CLAVE: cuando dudes entre dos delays adyacentes, elige el MÁS LARGO si
el motivo suena serio (familiar, médico, viaje) y el MÁS CORTO si
suena ligero (lío puntual, ocupación pasajera).

─── DEFAULT EN CASOS REALMENTE AMBIGUOS ───

- Lead da motivo pero la duración no se puede inferir ni con sentido
  común → 3 (más prudente que 1 — preferimos esperar un día más a
  que el lead se sienta acosado).
- Lead NO da motivo alguno ("no puedo mañana", "cancela") → 1.

═══════════════════════════════════════════════════════════════════════════════
CRITERIOS PARA confidence
═══════════════════════════════════════════════════════════════════════════════

- 0.95-1.00: señal explícita sin ambigüedad ("cancela mañana" → 0.98).
- 0.85-0.94: señal clara, requiere interpretar contexto multi-mensaje.
- 0.80-0.84: aplicas excepción específica que requiere lectura cuidadosa.
- < 0.80: caso límite. Sistema fuerza no_action si confidence <0.80 para
  intents ≠ no_action.

═══════════════════════════════════════════════════════════════════════════════
Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin texto adicional).
IMPORTANTE: rellena las claves en el ORDEN EXACTO mostrado. El "reasoning" va
PRIMERO para que el razonamiento condicione las decisiones posteriores:
{
  "reasoning": "breve explicación en una frase de tu razonamiento siguiendo la precedencia",
  "intent": "no_action" | "cancel_with_followup" | "cancel_no_followup" | "cancel_partial",
  "confidence": 0.0-1.0,
  "appointment_ids_to_noshow": ["id1", "id2"],
  "followup_delay_days": 1 | 3 | 7 | null
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
  // Solo dispara para intents de cancel con confidence < DOUBLE_CHECK_THRESHOLD.
  // Decisión consciente: NO revisamos no_action. La asimetría de costes lo
  // justifica — un cancel erróneo (FP) tiene coste alto (lead confuso,
  // noshow falso, reparación manual); un cancel perdido (FN) tiene coste
  // bajo (cita activa, lead se presenta o noshow normal). Revisar no_action
  // amplificaría el riesgo en la dirección equivocada.
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
