# ghl-cancel-intent-webhook
Webhook que clasifica con Claude Haiku la intención de cancelar/reagendar de los leads en conversaciones de GHL. Si detecta cancelación, marca la cita como no-show y setea el custom field "CLOSER CRM - Lead Hace No Show" para disparar el workflow de seguimiento adecuado (1d / 3d / 7d).
