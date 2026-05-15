# ghl-cancel-intent-webhook

Webhook que clasifica con **Claude Haiku** si un lead que escribe en una conversación
de GHL está pidiendo cancelar/reagendar la llamada agendada. Cuando lo detecta:

1. Marca la cita futura activa como **no-show** (estado de la cita).
2. Setea uno de los custom fields del grupo **"CLOSER CRM - Lead Hace No Show"** del
   contacto, lo que dispara los workflows de seguimiento que ya tienes en GHL.

## Decisiones que toma la IA

| Intent | Acción |
|---|---|
| `no_action` | Nada — conversación normal, confirmación, etc. |
| `cancel_with_followup` (1/3/7 días) | No-show + custom field #2 = `"Mañana"` / `"En 3 días"` / `"En 7 días"` |
| `cancel_no_followup` | No-show + custom field #3 = `"Sacar de recordatorios automáticos!"` |

## Seguridad anti-falsos-positivos

- **Whitelist de mensajes benignos** ("vale", "ok", "genial", "nos vemos"...) → no llama a Claude, devuelve `no_action`.
- **Threshold de confianza** (default 0.80). Si Claude no está seguro, no actúa.
- **Modo `dryRun`** que simula sin escribir nada en GHL.
- **GET-merge-PUT** sobre el contacto: solo se modifican los custom fields target, el resto se preserva.

## Endpoints

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/health` | JSON con info del servicio. |
| `GET` | `/` | Página HTML de estado. |
| `POST` | `/webhook/ghl/cancel-intent` | Endpoint principal. |

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GHL_API_TOKEN` | sí (modo A) | Tu PIT token. NO lo subas al repo — ponlo como Variable en Railway. |
| `ANTHROPIC_API_KEY` | sí | Tu API key de Anthropic (`sk-ant-...`). |
| `WEBHOOK_SECRET` | recomendado | Cadena aleatoria para proteger el endpoint. |
| `CLAUDE_MODEL` | no | Default: `claude-haiku-4-5-20251001`. |
| `CONFIDENCE_THRESHOLD` | no | Default: `0.80`. |
| `MESSAGES_LOOKBACK` | no | Número de mensajes recientes a analizar. Default: `15`. |
| `PORT` | no | Default Railway. |

## Despliegue en Railway

1. New Project → Deploy from GitHub repo → selecciona este repo.
2. Settings → Variables → añade las 4 variables (PIT, ANTHROPIC, SECRET, opcionalmente otras).
3. Settings → Networking → Generate Domain (puerto 5000).
4. Verifica `https://<TU-URL>/health` devuelve JSON ok.

## Workflow en GHL

1. **Trigger**: "Customer Replied" + filtro por tag o pipeline stage que indique
   "llamada cualificada activa" (ej: tag `Qualified calls/leads` o stage equivalente).
2. **Action**: Webhook (gratuita) → URL Railway:
   ```
   https://<TU-URL>/webhook/ghl/cancel-intent?secret=TU_SECRETO
   ```
3. Body por defecto de GHL está bien (manda `contact_id`, `location_id`, etc.)
4. Para probar primero con `dryRun=true` en la query.

## Probar en local

```bash
cp .env.example .env
# Editar .env con tus valores
npm install
npm run dev
```

Servidor en `http://localhost:5000`.

```bash
npm test  # tests con fetch mockeado
```

## Estructura

```
src/
├── server.js          # Express app + auth middleware
├── handler.js         # Orquestación principal
├── ghlClient.js       # Cliente GHL (conversations, contacts, appointments)
├── claudeClient.js    # Cliente Anthropic Messages API
├── classifier.js      # Whitelist + prompt + parser de respuesta
├── config.js          # IDs, opciones, constantes
├── payload.js         # Parser tolerante de webhooks GHL
├── logger.js          # Logger JSON con redacción de tokens
└── status.html        # Página HTML de estado
```

## Notas de diseño

- **Whitelist primero**: ahorra ~$0.001 + latencia + falsos positivos para mensajes obvios.
- **Claude responde JSON estricto** — se parsea con tolerancia a markdown (```json...```).
- **Custom fields update tolerante**: GHL acepta varias shapes; se prueban en orden.
- **No-show rotativo de body shapes**: igual que el reagenda webhook, varias variantes.
- **Logger redacta** `authorization`, `x-api-key`, `bearer`, `pit-`, `sk-ant-`.
