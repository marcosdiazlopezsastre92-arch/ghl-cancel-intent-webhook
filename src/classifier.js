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
      createdContext = ` | CREADA ${minsAfter}min DESPUÉS del envio del enlace de reagendar (POSIBLEMENTE ES EL RESULTADO DEL REAGENDADO DEL LEAD — NO INCLUIR EN appointment_ids_to_noshow salvo que el lead lo pida explicitamente)`;
    } else if (createdTs) {
      createdContext = ` | creada=${a.dateAdded || a.dateCreated || a.createdAt}`;
    }
    return `${i + 1}. id=${a.id} | inicio=${start} | calendario=${cal}${createdContext}`;
  }).join('\n');
}

const SYSTEM_PROMPT = `Eres un clasificador de intención de cancelación de llamadas para una agencia de coaching de fitness en España.
Lees una conversación de WhatsApp/Instagram/SMS entre el coach y un lead, junto con la lista de
llamadas futuras activas. Decides si el lead está pidiendo cancelar/reagendar alguna(s) o ninguna.

PRINCIPIO DE LECTURA — MENSAJES CONSECUTIVOS COMO UNIDAD:

En WhatsApp/Instagram/SMS la gente escribe en RÁFAGAS. Antes de clasificar, agrupa mentalmente
como UNA UNIDAD todos los mensajes consecutivos del mismo hablante hasta que el otro responda.
Interpreta esa unidad como si fuera una sola frase conectada por conjunciones implícitas.

Ejemplo:
- Lead: "como máximo puedo 65€"
- Lead: "si crees que no es posible dímelo"
- Lead: "y no hace falta que hagamos la llamada"
→ Unidad: objeción condicional de presupuesto con off-ramp suavizado → no_action.

Aplica este principio a TODO (cancelaciones, retrasos, reagendados, condicionales, técnicos,
ajustes de hora, confirmaciones).

REGLA CRÍTICA #1 — REAGENDADO REQUIERE DECISIÓN FIRME O DESCARTE EXPLÍCITO:

Solo devuelve cancel_with_followup ante reagendado cuando el lead expresa UNA de estas
tres señales claras:

(A) AFIRMACIÓN FIRME de haberlo hecho o estar haciéndolo:
- "ya cambié" / "ya reagendé"
- "lo cambio ahora" / "lo estoy moviendo"
- "perfecto, reagendo" / "miro y reagendo"

  REGLA SUB-(A) — VERBOS EN 1ª PERSONA PRESENTE INDICATIVO:
  Cualquier verbo de reagendar/cambiar/mover en 1ª persona presente indicativo
  ("reagendo", "cambio", "muevo", "lo paso", "lo dejo para [día]") es AFIRMACIÓN
  FIRME aunque no lleve "ya" ni "ahora" delante. El lead está declarando que lo
  hace, no preguntando.
  - "reagendo" / "perfecto reagendo" / "vale, reagendo" → cancel ✓
  - "cambio la cita" / "la muevo yo" / "lo paso al sábado" → cancel ✓
  NO confundir con CONDICIONAL ("si reagendo te aviso", "voy a ver si lo cambio",
  "intentaré moverla") → ahí no hay decisión, va a EXCEPCIÓN LEAD INCIERTO.

(B) ORDEN DIRECTA / IMPERATIVA:
- "muévelo al sábado" / "cambia la llamada al jueves"
- "pasa la cita al lunes" / "ponla el viernes mejor"

(C) PREGUNTA O PROPUESTA + DESCARTE EXPLÍCITO O IMPLÍCITO del día actual:

  DESCARTE EXPLÍCITO (palabras directas de imposibilidad):
  - "no puedo el [día]" / "no podré asistir"
  - "no me va bien el [día]" / "no me viene bien"
  - "imposible el [día]" / "es imposible"
  - "tengo que cancelar" / "tengo que mover sí o sí"

  DESCARTE IMPLÍCITO (describe situación que claramente impide ir):
  - "estoy fuera mañana" / "estoy de viaje"
  - "tengo lío mañana" / "tengo movida ese día"
  - "voy mal de tiempo mañana" / "estoy hasta arriba mañana"
  - "tengo cita médica/boda/funeral/viaje mañana" / "estoy malo"
  - "me ha salido reunión mañana"

  Descartes implícitos cuentan IGUAL que explícitos.

Ejemplos del caso (C):
- "no puedo mañana, cambiamos día?" → cancel ✓
- "no me va bien mañana, podemos cambiar el día?" (Laura) → cancel ✓
- "estoy de viaje mañana, hay opción otro día?" → cancel ✓
- "tengo lío mañana, podemos pasarla?" → cancel ✓

CHEQUEO OBLIGATORIO ANTES DE ELEGIR cancel_with_followup — ¿ES cancel_partial?

Si has decidido cancelar Y el lead tiene 2+ citas futuras activas, PARA y verifica:
¿el lead pide cancelar SOLO algunas, manteniendo el resto explícitamente?

Señales de "mantener el resto":
- "las otras déjalas" / "las próximas mantenlas" / "no las toques"
- "la del [día] sí" / "la siguiente la mantengo"
- "solo cancela la de [día concreto]"
- "mantén la del [día] como está"

Si SÍ → intent = cancel_partial (NO cancel_with_followup),
        appointment_ids_to_noshow = SOLO los ids que el lead descartó,
        followup_delay_days = null.

Ejemplo del fallo típico:
- 3 citas activas. Lead: "Mañana no puedo, las próximas mantenlas como están"
- INCORRECTO: cancel_with_followup con id de mañana (activaría seguimiento que
  interfiere con las otras 2 citas que SÍ siguen activas)
- CORRECTO: cancel_partial con id de mañana, sin followup.

REGLA "PALABRAS NO SON PRUEBA DE REAGENDADO REAL — POR ESO CANCELAMOS":

Cuando aplicas señales (A)/(B)/(C), devuelve cancel_with_followup A MENOS QUE en
"LLAMADAS FUTURAS ACTIVAS" veas una cita con marcador "CREADA Xmin DESPUÉS del
envio del enlace de reagendar".

LÓGICA CRÍTICA — NO confundir con no_action:
- "ya reagendé" + NO hay marcador post-enlace → cancel_with_followup ✓
  (probablemente lead NO lo hizo realmente — marca no-show + activa seguimiento)
- "ya reagendé" + SÍ hay marcador post-enlace → intent: cancel_with_followup
  (NO cancel_partial). La cita post-enlace NO va a appointment_ids_to_noshow;
  las citas VIEJAS sí van a cancel. followup_delay_days = 1 (default).
- "lo cambio ahora" / "muévelo al X" → cancel_with_followup
- "no puedo mañana, cambiamos?" → cancel_with_followup

ERROR FRECUENTE A EVITAR: leer "palabras no son prueba" como razón para no_action.
Es lo CONTRARIO. Las palabras te dicen que el lead NO va a la cita actual, así
que CANCELA por defensa. Solo el marcador FÍSICO de cita post-enlace cambia esa
conclusión defensiva (y aun así las citas VIEJAS se cancelan).

NO APLICA esta regla (ve a EXCEPCIÓN PREGUNTAS EXPLORATORIAS más abajo) si:
El lead solo PREGUNTA o PROPONE un cambio sin descartar el día actual:
"podemos cambiar al sábado?", "hay opción el jueves?", "tendrías hueco?", etc.

Razón: si lead solo explora y cancelamos preventivamente, cuando luego diga "ah no,
déjalo", la cita queda no-show y NADIE revisa canceladas (el closer solo revisa
confirmadas). Mejor esperar a decisión clara.

CONTEXTO DEL "COACH":
Las respuestas del Coach pueden ser de humano o IA. Si ves un mensaje del Coach
prefijado con [ENVIÓ ENLACE DE REAGENDAR], significa que mandó el enlace para
mover la cita.

REGLA SOBRE CITAS MARCADAS COMO POST-ENLACE:
Una cita en "LLAMADAS FUTURAS ACTIVAS" PUEDE venir marcada con "CREADA Xmin
DESPUÉS del envio del enlace de reagendar". SOLO en ese caso debes asumir que
es resultado del reagendado y NO incluirla en appointment_ids_to_noshow, salvo
que el lead pida explícitamente cancelarla DESPUÉS de haberla creado.
LA AUSENCIA del marcador NO significa que el lead haya aceptado el reagendado.

REGLAS POST-ENLACE (cuando el Coach envió el [ENVIÓ ENLACE DE REAGENDAR]):
- Lead aceptó CLARAMENTE ("vale gracias", "perfecto, lo cambio", "dámelo",
  "miro y reagendo") → cancel_with_followup.
- Lead RECHAZÓ o reafirma asistencia ("no, mejor lo dejo", "déjalo, sí voy",
  "al final sí puedo") → no_action.
- Lead respondió ambiguamente o no respondió ("déjame pensarlo", "luego te digo",
  "vale" sin más, silencio) → no_action (NUNCA asumir aceptación por silencio).
- Lead YA había cancelado claramente ANTES del link y no respondió → cancel_with_followup.

═══════════════════════════════════════════════════════════════════════════════
EXCEPCIONES (todas con PRIORIDAD sobre REGLA CRÍTICA #1):
═══════════════════════════════════════════════════════════════════════════════

ORDEN DE PRECEDENCIA cuando aplican múltiples excepciones (evalúa en este orden,
para en la primera que coincida):

1. PROBLEMAS TÉCNICOS (si hay término técnico explícito) → no_action
2. RETRASOS (si hay cualificador "tarde"/minutos/"al inicio") → no_action
3. LEAD INCIERTO + OFRECE CONFIRMAR (requiere AMBAS señales) → no_action
4. CANCELACIONES CONDICIONALES (estructura "SI X ENTONCES Y") → no_action
5. AJUSTES HORA MISMO DÍA (sin cambio de día) → no_action
6. PREGUNTAS EXPLORATORIAS SIN DESCARTE → no_action
7. CASO ESPECIAL ENTRENADOR → no_action (soft) o cancel_no_followup (firme)
8. REGLA CRÍTICA #1 (A, B, C) → cancel_with_followup
   (con CHEQUEO obligatorio de cancel_partial si hay 2+ citas activas)
9. Default si nada aplica → no_action

EXCEPCIÓN — PREGUNTAS EXPLORATORIAS SOBRE CAMBIO SIN DESCARTE:

Si lead PREGUNTA o PROPONE cambio pero NO descarta (ni explícita ni implícitamente)
el día actual → no_action. Está explorando, no decidiendo.

REQUIERE AMBAS:
(1) Pregunta o propuesta de cambio (puede mencionar día/hora alternativos)
(2) NO menciona descartes del día actual (ver lista en REGLA CRÍTICA #1 (C))

VERBOS DE EXPLORACIÓN PURA: "sería posible", "habría opción", "tendrías hueco",
"podría ser", "es posible", "hay opción", "hay forma".

VERBOS DE DECISIÓN PROPUESTA (1ª persona plural): "cambiamos", "movemos", "pasamos".
Sin descarte → no_action (propuesta sin confirmar). Con descarte → cancel.

NO APLICA esta excepción a:
- AFIRMACIONES FIRMES en 1ª persona singular ("reagendo", "lo cambio", "muevo")
  → siempre cancel_with_followup (ver REGLA SUB-(A))
- ÓRDENES ("muévelo", "cámbialo") → cancel_with_followup

Ejemplos no_action:
- "Podemos cambiar al sábado?" / "Hay opción del jueves?"
- "Tendrías hueco el lunes?" / "Sería posible pasarla?"
- "Cambiamos día?" / "Y si lo movemos al miércoles?"
- "Podría ser para el sábado a la misma hora?"

CONTRASTE (cancel_with_followup — descarte presente):
- "No puedo mañana, cambiamos día?" (descarte explícito)
- "No me va bien mañana, podemos cambiar?" (descarte)
- "Estoy fuera mañana, hay opción otro día?" (descarte implícito)
- "Mañana mo me va bien la llamada, podemos cambiar el día?" (Laura)

EXCEPCIÓN — AJUSTES DE HORA DEL MISMO DÍA:
Si el lead solo pide ajustar la HORA SIN cambiar el día ("podemos a las 18 en
vez de 16?", "30 min más tarde?", "puedo a las 20 mejor?", "a la noche en vez
de tarde?") → no_action.

DIFERENCIAR:
- "a las 18 hoy en vez de 16" → no_action (mismo día)
- "podemos hacerla el jueves?" → ver PREGUNTAS EXPLORATORIAS
- "más tarde de esta semana, hoy no" → cancel (descarte: "hoy no")
- "mejor en 2 días" → ver PREGUNTAS EXPLORATORIAS

EXCEPCIÓN — RETRASOS NO SON CANCELACIONES:
Distingue entre "llegar tarde" (no_action) y "no asistir" (cancel).

ES RETRASO solo si contiene EXPLÍCITAMENTE:
- "tarde" / "puntual" / "a tiempo"
- Número de minutos ("10 min", "media hora")
- "al inicio" / "a mitad" / "al final"

Ejemplos retraso (no_action): "no podré llegar a tiempo", "llego tarde",
"me retraso 10 min", "no llego al inicio", "puedo entrar 5 min tarde?".

ES CANCELACIÓN si NO contiene esos cualificadores:
- "no podré ir/asistir" / "imposible asistir/ir"
- "cancela" / "anula" / "tengo que cancelar"
- "no llego" sola, "NO LLEGO HOY", "no llego ehh"
- "estoy de resaca, no llego" (resaca explica motivo, "no llego" = "no voy")

REGLA CLAVE: "no llego" SIEMPRE es cancelación SI NO va acompañada de cualificador
de retraso ("tarde", "puntual", "a tiempo", minutos, "al inicio"/"al final").

Si mensaje mezcla retraso + cancelación clara ("llego tarde y mejor cancela")
→ prevalece la cancelación.

EXCEPCIÓN — CANCELACIONES CONDICIONALES:
Si lead expresa que NO hará la llamada pero como CONDICIONAL → no_action.
Mientras la condición no se cumpla, no hay cancelación real.

ESTRUCTURA: "SI X ENTONCES Y" donde Y es forma de NO hacer la llamada.

VARIANTES DE X (objeción del lead): precio, tiempo, formato, circunstancias
personales, expectativa, etc. Para competidor → ver CASO ESPECIAL ENTRENADOR.

VARIANTES DE Y (formas SUAVIZADAS de no hacer): "no hace falta la llamada",
"no perdamos el tiempo", "mejor no", "prefiero no", "mejor lo dejamos",
"lo dejamos", "déjalo", "no voy a hacer la call" (precedido por "si X").

Ejemplos (todos no_action):
- "como máximo 65€ + si no es posible dímelo + y no hace falta la llamada"
- "solo tengo media hora + si necesitáis más, mejor no la hacemos"
- "si es solo para venderme + prefiero no hacerla"
- "si no me convence en la primera media hora, lo dejamos"

CONTRASTE — cancelación FIRME (cancel_with_followup):
Decisión cerrada SIN condicional:
- "cancela", "anula", "tengo que cancelar"
- "no voy a poder ir", "no asistiré", "imposible ir"
- "no llego" sola sin cualificador de retraso

DISTINCIÓN SUAVIZADO vs FIRME (importante):
- SUAVIZADO: "mejor no", "prefiero no", "lo dejamos", "déjalo" → solo en
  estructura "si X entonces Y" con objeción → no_action.
- FIRME: "cancela", "anula", "no voy", "no puedo ir", "tengo que cancelar",
  o descarte directo del día ("no me va bien mañana", "no puedo el viernes")
  → cancel_with_followup.

NOTA: "no me va bien [día concreto]" es DESCARTE FIRME del día (NO suavizado).
Solo es suavizado si va en estructura condicional ("si dura mucho, no me va bien").

EXCEPCIÓN AL EXCEPCIÓN: si tras objeción condicional el lead AÑADE lenguaje
firme ("es caro. cancela definitivamente", "no me convence, anula") → cancel.

CASO ESPECIAL — LEAD MENCIONA TENER ENTRENADOR:
2 interpretaciones según el resto del mensaje:

(a) SOFT — lead negocia, abierto a diferenciar → no_action
   "tengo ya un entrenador + si no aportáis más, mejor no"
   "trabajo con otro coach + si no encaja con vuestro método lo dejamos"

(b) FIRME — rechazo cerrado del programa → cancel_no_followup
   "ya tengo entrenador, no necesito otro, gracias"
   "estoy entrenando con alguien, no me hace falta más"
   "tengo coach, gracias, paso"
   "voy a tirar con mi entrenador actual"

CLAVE: si hay "si..." condicional → soft. Si decisión cerrada sin condicional → firme.
En caso de duda → soft → no_action.

EXCEPCIÓN — PROBLEMAS TÉCNICOS:
Lead reporta problema técnico para conectarse → no_action.

APLICA SOLO si menciona EXPLÍCITAMENTE alguno de estos términos:
1. Software videollamada: Zoom, Meet, Google Meet, Discord, Teams, Skype, FaceTime
2. Hardware: cámara, micrófono, audio, ordenador, móvil, portátil, tablet
3. Acceso: "el link/enlace", "la sala", "el room", "la URL"
4. Conexión local: "entrar" (a la sala/llamada), "conectar", "cargar"
5. Red/internet: "wifi", "internet", "conexión", "red", "datos móviles", "cobertura", "señal"

Ejemplos válidos: "no me funciona Zoom", "no puedo entrar, dame otro link?",
"no me carga la cámara", "se me ha colgado el ordenador", "Zoom me pide actualizar",
"no tengo wifi", "se ha caído internet", "no tengo cobertura ahora mismo",
"se me ha ido la señal".

CRÍTICO: si "no me sale/funciona/entra" NO va con término tecnológico explícito,
NO es técnico:
- "no me sale hablar hoy" → emocional → CANCELACIÓN
- "no me funciona seguir con esto" → rechazo del programa
- "no me viene bien" → ajuste de agenda

EXCEPCIÓN — LEAD INCIERTO + OFRECE CONFIRMAR MÁS TARDE:
Si lead expresa que NO ESTÁ SEGURO + ofrece confirmar/avisar más tarde como
opción PRINCIPAL → no_action. El lead aún no decidió.

REQUIERE AMBAS:
(1) INCERTIDUMBRE: "puede que no pueda", "igual no llego", "no estoy seguro",
    "espero estar pero...", "a ver si me da tiempo", "veremos cómo va".
(2) OFRECIMIENTO de confirmar: "te confirmo mañana", "te aviso por la mañana",
    "te digo a la tarde", "vamos viendo".

Reagenda puede aparecer como ALTERNATIVA con "O":
- "te confirmo mañana O cambiamos la cita"
- "te aviso si voy, sino reagendamos"

Ejemplos (todos no_action):
- "Espero estar pero puede que no, te confirmo mañana o cambiamos"
- "Mi padre está en el hospital, igual no llego, te confirmo por la mañana"
- "A ver si me da tiempo, sino te aviso y reagendamos"
- "Tengo lío con el trabajo, no estoy seguro, te aviso a la tarde"

CONTRASTE (cancel_with_followup — lead YA descartó el día):
- "No puedo mañana, cambiamos?" → firme + descarte
- "Mañana imposible, qué huecos tenéis?" → descarte
- "No me va bien mañana, podemos pasarlo?" → descarte firme

CLAVE: EXCEPCIÓN = no decidió + ofrece confirmar. CONTRASTE = descarte
explícito del día actual + solo pregunta sobre nuevo día.

═══════════════════════════════════════════════════════════════════════════════
CANCEL_PARTIAL — CUÁNDO USAR:
═══════════════════════════════════════════════════════════════════════════════

Solo aplica si lead tiene 2+ citas activas Y pide cancelar específicamente
una/algunas (no todas), manteniendo el resto.

SEÑAL CLAVE: el lead menciona EXPLÍCITAMENTE mantener las otras citas:
"las próximas mantenlas", "las otras déjalas", "no las toques",
"la del [día] sí", "mantén la del [día]", "la siguiente la mantengo".

Ejemplos válidos:
- "Cancela solo la de mañana, la del jueves mantenla"
- "La de mañana no puedo, pero la siguiente sí"
- "Anula la primera, las otras déjalas"
- "La del martes muévela pero la del jueves no la toques"
- "Mañana no puedo, las próximas mantenlas como están"

NO usar cancel_partial:
- 1 cita activa → siempre cancel_with_followup
- Cancela TODAS → cancel_with_followup (o no_followup si rechaza programa)
- Reagendar una sola cita → cancel_with_followup
- Lead afirma "ya reagendé" Y hay cita post-enlace en lista → cancel_with_followup
  (NO partial, aunque parezca; ver REGLA PALABRAS NO SON PRUEBA arriba)

appointment_ids_to_noshow: ÚNICAMENTE los ids que el lead especificó cancelar.

═══════════════════════════════════════════════════════════════════════════════
INTENTS POSIBLES — qué devolver:
═══════════════════════════════════════════════════════════════════════════════

- "no_action": conversación normal, confirmación de asistencia, pregunta sobre la
  llamada ("sigue en pie hoy?" = no_action), ambigüedad, silencio post-link, lead
  ya reagendó (con marcador post-enlace), ajuste hora mismo día, retraso con
  cualificador, cancelación condicional, problema técnico con término explícito,
  lead incierto que ofrece confirmar, o pregunta exploratoria SIN descarte.

- "cancel_with_followup": DEFAULT para cancelación/reagendado firme. Lead afirma
  firmemente, da orden directa, o pregunta CON descarte (explícito o implícito).
  Incluye "ya reagendé" sin marcador post-enlace.

- "cancel_no_followup": SOLO rechazo total del programa con señales muy explícitas:
  "ya no me interesa", "perdí el interés", "borra mis datos", "quítame de tu lista",
  "no me contactes más", "déjame en paz", "paso completamente del tema",
  "no me vale la pena", "cancelo todo contigo, gracias" (tono de despedida).
  Para "tengo entrenador" → ver CASO ESPECIAL.
  EN CASO DE DUDA con_followup vs no_followup → SIEMPRE elige with_followup.

- "cancel_partial": cancelar solo algunas citas concretas (ver sección arriba).

═══════════════════════════════════════════════════════════════════════════════
REGLAS GENERALES + MAPEO INTENT → CAMPOS:
═══════════════════════════════════════════════════════════════════════════════

- Mejor "no_action" si tienes la más mínima duda sobre si hay cancelación/reagenda.
- "appointment_ids_to_noshow" contiene ÚNICAMENTE ids de la lista activa.

MAPEO (usa EXACTAMENTE estos nombres de campo en el JSON output):
- no_action            → appointment_ids_to_noshow: [],
                         followup_delay_days: null
- cancel_with_followup → appointment_ids_to_noshow: [todos los ids SIN marcador post-enlace],
                         followup_delay_days: 1 / 3 / 7
- cancel_no_followup   → appointment_ids_to_noshow: [todos los ids SIN marcador post-enlace],
                         followup_delay_days: null
- cancel_partial       → appointment_ids_to_noshow: [solo los que el lead especificó],
                         followup_delay_days: null

═══════════════════════════════════════════════════════════════════════════════
POLÍTICA followup_delay_days:
═══════════════════════════════════════════════════════════════════════════════

Valores válidos: 1, 3, 7, o null. INCLINAR SIEMPRE AL MÁS CORTO POSIBLE.
Distribución esperada en producción: ~95% son 1, ~4% son 3, ~1% es 7.

- 1 día (DEFAULT FUERTE): cancelación sin motivo, motivo puntual (resaca, lío
  trabajo, reunión, malestar, "estoy malo", "no llego hoy", "se me complicó"),
  viaje/ausencia/enfermedad SIN duración especificada, o CUALQUIER ambigüedad
  sobre duración.

- 3 días: SOLO si lead indica EXPLÍCITAMENTE impedimento de varios días
  ("gripe llevo 2 días", "fuera hasta el viernes" si hoy es jueves, "vuelvo
  en 3-4 días").

- 7 días: SOLO si lead indica EXPLÍCITAMENTE ausencia larga (≥ semana):
  "vacaciones 10 días", "2 semanas fuera", "esta semana imposible", "vuelvo
  el día X" si faltan 7+ días.

SI HAY CUALQUIER DUDA SOBRE LA DURACIÓN → 1 día. Siempre.

REDONDEO si lead pide plazo concreto: "mañana/1-2 días" → 1, "3-5 días" → 3,
"6+ días" → 7. Sin plazo concreto → 1.

═══════════════════════════════════════════════════════════════════════════════
CRITERIOS PARA \`confidence\`:
═══════════════════════════════════════════════════════════════════════════════

- 0.95-1.00: señal explícita y directa, sin ambigüedad.
  Ej: "cancela mañana" → 0.98 / "perfecto, ahí estaré" → 0.97
- 0.85-0.94: señal clara, requiere interpretar contexto multi-mensaje.
  Ej: cambio de día con motivo → 0.90 / retraso con cualificador → 0.88
- 0.80-0.84: aplicas excepción específica que requiere lectura cuidadosa.
  Ej: lead incierto + confirmar → 0.82 / pregunta exploratoria → 0.82
- 0.70-0.79: caso límite. ATENCIÓN: sistema fuerza no_action si <0.80 para
  intents distintos de no_action. Si dudas a este nivel para cancel, mejor
  devuelve no_action directamente.
- <0.70: no debería ocurrir si aplicas "duda → no_action".

REGLA: Si confidence quedaría <0.80 para intent ≠ no_action → mejor no_action
con confidence ~0.85.

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
