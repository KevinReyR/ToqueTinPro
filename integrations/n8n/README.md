# WhatsApp Business Cloud mediante n8n

n8n es un adaptador de transporte. Supabase conserva el pedido, el canal, los consentimientos, la auditoría y los intentos de entrega. El workflow no debe guardar snapshots de pedidos ni contactos; solo puede conservar `attemptId` como clave técnica de idempotencia durante los reintentos.

## Variables

Configurar en Render y en la función de borde:

- `WHATSAPP_BUSINESS_NUMBER`: número central de ToqueTin en formato internacional, solo dígitos.
- `N8N_WHATSAPP_DELIVERY_WEBHOOK_URL`: webhook de producción del workflow de salida.
- `N8N_WEBHOOK_SECRET`: secreto aleatorio de al menos 32 bytes, idéntico en ToqueTin y n8n.
- `PRIVACY_CONTROLLER_NAME`, `PRIVACY_CONTACT_EMAIL` y `PRIVACY_POLICY_VERSION`.

No copiar credenciales de Meta, tokens de acceso ni el secreto HMAC al navegador. La activación de WhatsApp permanece bloqueada si falta la identificación legal del responsable.

## Workflow 1: mensajes entrantes

1. `WhatsApp Trigger` recibe el mensaje de la aplicación de Meta. No sustituir el webhook de producción al probar; usar el número de prueba dentro de la misma aplicación.
2. Antes de normalizar, el workflow descarta cualquier evento que no contenga `messages[0]`. Los eventos `statuses` (`sent`, `delivered`, `read` o `failed`) no pertenecen al flujo de conversación y no deben invocar el endpoint entrante. El remitente se resuelve con `messages[0].from_user_id` o `contacts[0].user_id` cuando Meta oculta el teléfono, y con `messages[0].from` o `contacts[0].wa_id` cuando lo comparte. Después, un nodo `Code` normaliza exactamente uno de estos eventos:
   - `ACTIVAR ABC123` → `{ "kind": "OPT_IN", "code": "ABC123", "recipientId": "CO...", "businessScopedUserId": "CO..." }`.
   - Respuesta al consentimiento comercial unificado → `{ "kind": "CONSENT", "recipientId": "...", "phoneNumber": "...", "businessScopedUserId": "...", "contextId": "...", "controller": "TOQUETIN", "decision": "GRANTED|DECLINED|REVOKED", "policyVersion": "..." }`.
   - `BAJA`, `SALIR`, `STOP` o `CANCELAR` → `{ "kind": "STOP", "recipientId": "...", "scope": "ALL" }`.

   `phoneNumber` y `businessScopedUserId` son alias opcionales; al menos uno debe existir. `recipientId` usa primero el BSUID para que las respuestas y estados funcionen aunque el usuario no comparta su número. Los identificadores permanecen cifrados y solo sus digests se usan para deduplicar contactos.

3. Otro nodo `Code` genera `timestamp = Math.floor(Date.now()/1000)`, un `eventId` estable derivado del identificador de mensaje de Meta y la firma `sha256=HMAC_SHA256(secret, timestamp + "." + rawBody)`.
4. `HTTP Request` envía el cuerpo sin modificar a `POST https://<dominio>/api/integrations/whatsapp/inbound` con `x-toquetin-timestamp`, `x-toquetin-event-id` y `x-toquetin-signature`.
5. Por cada elemento de `messages` en la respuesta, `WhatsApp Business Cloud` envía texto o botones interactivos. El consentimiento usa los títulos visibles `Sí, acepto` y `Ahora no`; los botones transportan `contextId`, `controller`, decisión y versión de política, nunca el número, token o ID interno del pedido.

La única pregunta comercial identifica conjuntamente a ToqueTin y sus restaurantes aliados. Solo se devuelve cuando el contacto todavía no tiene una decisión registrada; el aviso operativo ya está activo y no depende de esa respuesta.

## Workflow 2: entrega de estados

1. `Webhook` recibe el POST firmado de ToqueTin y valida la firma antes de usar el cuerpo.
2. Comprueba `attemptId` en un Data Table técnico. Si ya está marcado como enviado, devuelve `200` sin volver a llamar a Meta.
3. `WhatsApp Business Cloud` envía `message` al `recipient`. Dentro de la ventana de conversación se usa texto; fuera de ella se usa una plantilla Utility aprobada con restaurante, pedido y estado como parámetros.
4. Guarda únicamente `attemptId` y el identificador devuelto por Meta, y responde `2xx`.
5. Los estados de Meta se normalizan y se envían a `POST /api/integrations/whatsapp/delivery-status` con el mismo esquema HMAC:

```json
{
  "attemptId": 123,
  "providerMessageId": "wamid...",
  "status": "delivered",
  "occurredAt": "2026-09-23T18:30:00.000Z"
}
```

Estados admitidos: `accepted`, `sent`, `delivered`, `read` y `failed`. Los logs del workflow deben excluir `recipient`, mensajes entrantes, códigos de activación y cabeceras de autorización.

## Guía de contenido

- Usar texto nativo de WhatsApp, negritas con `*`, saltos de línea y como máximo un emoji principal por mensaje.
- Identificar siempre `Pedido {número} · {restaurante}`.
- `Preparando` muestra la cuenta regresiva aproximada o «Casi listo».
- `Listo` conserva la mayor prioridad y usa las instrucciones de retiro del restaurante cuando existan.
- `Entregado` cierra con un agradecimiento breve; `Cancelado` muestra el motivo y orientación de ayuda.
- Sanitizar contenido dinámico antes de insertarlo en el marcado de WhatsApp. No enviar imágenes, stickers ni mensajes promocionales dentro del seguimiento operativo.

## Firma en un nodo Code

El cuerpo firmado debe ser exactamente el que enviará `HTTP Request`, sin volver a serializarlo después de calcular la firma:

```javascript
const crypto = require("crypto");
const timestamp = String(Math.floor(Date.now() / 1000));
const rawBody = JSON.stringify($json.payload);
const signature = `sha256=${crypto.createHmac("sha256", $env.N8N_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest("hex")}`;
return [{ json: { rawBody, timestamp, signature, eventId: $json.eventId } }];
```

## Operación y pruebas

- Ejecutar las migraciones `202609230001`, `202609230002`, `202609240001`, `202609240002` y `202609240003` antes de activar workflows.
- Probar código correcto, vencido, repetido y alterado.
- Reenviar el mismo `eventId` y confirmar `409 REPLAY_DETECTED`.
- Reenviar el mismo `attemptId` al workflow de salida y confirmar un solo mensaje de Meta.
- Confirmar que `ESTIMATE_CHANGED` no llega al workflow y que `PREPARING`, `READY`, `DELIVERED` y `CANCELLED` sí llegan.
- Programar `process-deliveries` al menos cada minuto; esa ejecución también anonimiza contactos operativos vencidos sin consentimiento comercial.
