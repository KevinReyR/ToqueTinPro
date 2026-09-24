# Plan técnico — MVP multiplataforma de ToqueTin

## 1. Propósito y restricciones

Este documento define cómo implementar el MVP descrito en `spec.md`. La solución será un monorepo multi-tenant con web universal y clientes de seguimiento ligeros para iOS y Android. Cubrirá el flujo `Crear pedido → Generar QR → Abrir seguimiento → Preparando → Listo → Entregado`, incluyendo cancelación previa a `Listo`, seguimiento visible fuera de la aplicación, trazabilidad y dashboard operativo.

El plan obedece estas reglas:

- Usar Next.js, TypeScript y Supabase/PostgreSQL como núcleo; SwiftUI/ActivityKit y Kotlin/Compose serán adaptadores nativos de seguimiento.
- Mantener la lógica de dominio, autorización y persistencia fuera de los componentes visuales.
- Persistir los pedidos, estados, sesiones de seguimiento, suscripciones y notificaciones relevantes en PostgreSQL.
- Mantener código, tablas, columnas, tipos, logs y contratos en inglés; los textos visibles serán inicialmente en español.
- Aplicar aislamiento por restaurante en la aplicación y mediante Row Level Security (RLS).
- No introducir funciones excluidas por la spec ni microservicios. App Clip, Live Activity y Android ligero quedan expresamente incluidos por RF-14.
- Tratar el aviso visual de `READY` como garantía funcional; sonido, vibración y Web Push serán mejoras progresivas que nunca bloquearán el seguimiento.

**Cobertura:** `[RF-1–RF-14]`.

## 2. Arquitectura y estructura de módulos

### 2.1. Forma general

Se implementará un monolito modular. Next.js compondrá rutas, Server Components, Server Actions y Route Handlers; Supabase proveerá Auth, PostgreSQL, RLS, Realtime y una función de borde para Web Push, APNs y FCM. Los proyectos iOS y Android consumirán contratos públicos limitados al tracking. No habrá un backend independiente adicional.

La dirección permitida de dependencias será:

`Application/UI → Application services → Domain → Data and platform adapters`

Los componentes visuales podrán invocar contratos de aplicación y presentar resultados, pero no decidir transiciones, construir políticas de autorización ni ejecutar consultas de negocio directamente.

### 2.2. Módulos

| Módulo            | Responsabilidad                                                                              | Límites                                                            | RF cubiertos                          |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `application-ui`  | Rutas, layouts, formularios, dashboard, QR y seguimiento mobile-first                        | Sin reglas de transición ni acceso privilegiado a datos            | RF-1–RF-8, RF-10, RF-11, RF-13        |
| `auth-tenancy`    | Sesiones de operador, sesión anónima de tracking, restaurante activo y membresías            | No usa metadata editable del usuario para autorizar                | RF-1, RF-4, RF-5, RF-11, RF-12, RF-13 |
| `orders`          | Creación, estado actual, transiciones, cancelación, estimación e historial                   | Única fuente de reglas del ciclo del pedido                        | RF-1, RF-4, RF-5, RF-9, RF-13         |
| `tracking`        | Token, QR, intercambio por sesión, proyección pública, revocación y expiración               | Nunca acepta `order_number` como credencial ni expone IDs internos | RF-2, RF-3, RF-10, RF-12              |
| `realtime`        | Broadcast privado, autorización de tópicos, reconexión y actualización manual                | Publica una proyección mínima, no filas completas                  | RF-6, RF-7, RF-11, RF-13              |
| `notifications`   | Selector multicanal, Web Push, WhatsApp, suscripciones, consentimientos, outbox y reintentos | Ningún fallo revierte o bloquea un cambio de estado                | RF-7, RF-8, RF-8A                     |
| `native-tracking` | App Clip, Live Activity, App Links y Live Updates Android                                    | Solo representa la proyección pública; no decide transiciones      | RF-6–RF-8, RF-10, RF-12–RF-14         |
| `dashboard`       | Jornada operativa, listados, agrupaciones, totales y promedios                               | No consolida restaurantes distintos                                | RF-11, RF-12                          |
| `persistence`     | Migraciones, constraints, índices, funciones transaccionales, triggers, grants y RLS         | Sin escrituras de negocio parciales desde la UI                    | RF-1–RF-14                            |
| `shared`          | Validación, errores, fechas UTC, zona horaria, normalización y DTO seguros                   | No contiene reglas específicas de presentación                     | RF-1–RF-14                            |

### 2.3. Superficies de aplicación

- **Acceso del operador:** inicio y cierre de sesión con correo y contraseña. Las cuentas y membresías se aprovisionan previamente; no habrá registro público, recuperación de contraseña ni administración de usuarios en el MVP. `[RF-12]`
- **Operación del restaurante:** selección del restaurante activo, dashboard diario, creación de pedidos, presentación del QR, actualización de estimación y acciones de estado. `[RF-1, RF-2, RF-4, RF-5, RF-9, RF-11, RF-13]`
- **Seguimiento público:** intercambio inicial del token, vista sin registro visible, snapshot público, suscripción en tiempo real, reintento manual y activación opcional de avisos. `[RF-2, RF-3, RF-6–RF-8, RF-10, RF-12, RF-13]`
- **Procesamiento asíncrono:** despacho y reintento de Web Push, ActivityKit/APNs, FCM y WhatsApp mediante n8n a partir de una bandeja de salida persistente. Supabase conserva el estado autoritativo. `[RF-7, RF-8, RF-8A, RF-14]`
- **Alertas Android:** las transiciones de estado se enviarán por FCM con prioridad alta y usarán canales de alta importancia separados para alertas generales y `READY`; polling y cambios exclusivos de estimación actualizarán silenciosamente. `[RF-7, RF-8, RF-14]`

## 3. Tipos y reglas de dominio

### 3.1. Tipos cerrados

- `OrderStatus`: `RECEIVED`, `PREPARING`, `READY`, `DELIVERED`, `CANCELLED`.
- `CancellationReasonCode`: `CUSTOMER_REQUEST`, `PRODUCT_UNAVAILABLE`, `ORDER_ERROR`, `OPERATIONAL_ISSUE`, `OTHER`.
- `NotificationStatus`: `PENDING`, `SENT`, `FAILED`, `EXPIRED`.
- `NotificationKind`: `ORDER_READY`.
- `DeliveryChannel`: `WEB_PUSH`, `APNS_LIVE_ACTIVITY`, `FCM_LIVE_UPDATE`, `WHATSAPP`.
- `DeliveryEventKind`: `TRACKING_STARTED`, `STATUS_CHANGED`, `ESTIMATE_CHANGED`, `ORDER_READY`, `ORDER_CLOSED`, `TRACKING_REVOKED`.
- `RestaurantUserRole`: `OPERATOR`.

**Cobertura:** `[RF-4, RF-5, RF-8, RF-12]`.

### 3.2. Matriz de transiciones

| Estado actual | Acciones válidas           | Estado resultante | RF                |
| ------------- | -------------------------- | ----------------- | ----------------- |
| `RECEIVED`    | iniciar preparación        | `PREPARING`       | RF-4              |
| `RECEIVED`    | cancelar con motivo válido | `CANCELLED`       | RF-5              |
| `PREPARING`   | marcar listo               | `READY`           | RF-4, RF-7        |
| `PREPARING`   | cancelar con motivo válido | `CANCELLED`       | RF-5              |
| `READY`       | confirmar entrega          | `DELIVERED`       | RF-4              |
| `DELIVERED`   | ninguna                    | sin cambio        | RF-4, RF-10       |
| `CANCELLED`   | ninguna                    | sin cambio        | RF-4, RF-5, RF-10 |

Una petición que repita exactamente una transición ya aplicada devolverá el estado vigente con una marca de idempotencia y no añadirá otro evento. Un salto, retroceso o transición incompatible devolverá `INVALID_TRANSITION` sin modificar pedido ni historial. Dos acciones concurrentes bloquearán la misma fila; la primera válida se confirma y la segunda se evalúa de nuevo contra el estado ya actualizado.

**Cobertura:** `[RF-4, RF-5, RF-9]`.

### 3.3. Reglas complementarias

- `order_number` se recorta y se normaliza de forma insensible a mayúsculas para comprobar unicidad, conservando por separado el valor visible. `[RF-1]`
- La estimación se representa como un instante futuro `estimated_ready_at`; la entrada manual puede expresarse como minutos, pero se persiste el instante UTC calculado. Solo puede modificarse en `RECEIVED` o `PREPARING`. `[RF-1, RF-13]`
- `OTHER` exige texto no vacío; los cuatro motivos predefinidos no admiten texto sustituto. El cliente recibe una etiqueta española comprensible. `[RF-5]`
- Los hitos `preparing_at`, `ready_at`, `delivered_at` y `cancelled_at` se fijan una sola vez en la transición correspondiente. `[RF-9, RF-11]`
- Un pedido pertenece para siempre al intervalo operativo calculado al crearlo, aunque cambie después la hora de corte. `[RF-1, RF-11]`

## 4. Modelo de datos

### 4.1. Convenciones

- IDs internos: `bigint identity`.
- Referencias a usuarios de Supabase Auth: `uuid`.
- Identificadores públicos: nonce aleatorio de al menos 128 bits.
- Timestamps: `timestamptz` almacenado en UTC.
- Textos variables: `text` con constraints solo donde exista una regla de dominio.
- Todas las claves foráneas tendrán índice.
- No habrá borrado de pedidos ni eventos de historial en el MVP; las relaciones críticas usarán borrado restringido.
- Las tablas expuestas tendrán RLS y grants mínimos. Las tablas con material de Web Push vivirán en un esquema no expuesto.

**Cobertura:** `[RF-1–RF-14]`.

### 4.2. Entidades

#### `organizations`

| Campo        | Tipo conceptual | Regla          |
| ------------ | --------------- | -------------- |
| `id`         | bigint          | PK interna     |
| `name`       | text            | obligatorio    |
| `created_at` | timestamptz     | UTC, inmutable |

Una organización agrupa restaurantes, pero el acceso operativo se concede por restaurante.

**Índices:** PK.

**Cobertura:** `[RF-12]`.

#### `restaurants`

| Campo                         | Tipo conceptual      | Regla                                        |
| ----------------------------- | -------------------- | -------------------------------------------- |
| `id`                          | bigint               | PK interna                                   |
| `organization_id`             | bigint               | FK obligatoria a `organizations`             |
| `name`                        | text                 | obligatorio; visible al cliente              |
| `timezone`                    | text                 | nombre IANA; valor inicial `America/Bogota`  |
| `day_cutoff_time`             | time                 | corte vigente; predeterminado `00:00`        |
| `pending_day_cutoff_time`     | time nullable        | siguiente corte solicitado                   |
| `pending_cutoff_effective_at` | timestamptz nullable | comienzo de la jornada en que entra en vigor |
| `created_at`, `updated_at`    | timestamptz          | UTC                                          |

Al programar un cambio se conserva la jornada actual. Antes de toda operación que dependa del corte, si la fecha efectiva ya llegó, el corte pendiente se promueve de manera atómica. La zona horaria no tendrá interfaz de edición dentro del MVP.

**Índices:** `organization_id`.

**Cobertura:** `[RF-1, RF-3, RF-11, RF-12]`.

#### `restaurant_users`

| Campo           | Tipo conceptual | Regla                             |
| --------------- | --------------- | --------------------------------- |
| `restaurant_id` | bigint          | FK a `restaurants`                |
| `user_id`       | uuid            | FK a `auth.users`                 |
| `role`          | enum/check      | únicamente `OPERATOR`             |
| `is_active`     | boolean         | solo membresías activas autorizan |
| `created_at`    | timestamptz     | UTC                               |

La PK compuesta será `(restaurant_id, user_id)`. El producto no inferirá acceso desde el dominio del correo ni desde metadata editable del usuario.

**Índices:** PK compuesta y `(user_id, restaurant_id)` para políticas RLS.

**Cobertura:** `[RF-1, RF-4, RF-5, RF-11, RF-12, RF-13]`.

#### `orders`

| Campo                                                      | Tipo conceptual                   | Regla                                |
| ---------------------------------------------------------- | --------------------------------- | ------------------------------------ |
| `id`                                                       | bigint                            | PK interna; nunca visible al cliente |
| `restaurant_id`                                            | bigint                            | FK obligatoria                       |
| `operational_day_started_at`                               | timestamptz                       | comienzo UTC persistido              |
| `operational_day_ended_at`                                 | timestamptz                       | final UTC persistido                 |
| `order_number`                                             | text                              | valor visible                        |
| `order_number_normalized`                                  | text                              | usado para unicidad                  |
| `status`                                                   | `OrderStatus`                     | inicialmente `RECEIVED`              |
| `estimated_ready_at`                                       | timestamptz                       | obligatorio y futuro al establecerse |
| `estimate_updated_at`                                      | timestamptz                       | momento de la estimación vigente     |
| `pickup_instructions`                                      | text nullable                     | visible al cliente                   |
| `cancellation_reason_code`                                 | `CancellationReasonCode` nullable | solo en `CANCELLED`                  |
| `cancellation_reason_text`                                 | text nullable                     | obligatorio solo para `OTHER`        |
| `preparing_at`, `ready_at`, `delivered_at`, `cancelled_at` | timestamptz nullable              | hitos inmutables                     |
| `created_by`, `updated_by`                                 | uuid                              | actor operador                       |
| `version`                                                  | bigint                            | control de concurrencia              |
| `created_at`, `updated_at`                                 | timestamptz                       | UTC                                  |

**Constraints:** unicidad `(restaurant_id, operational_day_started_at, order_number_normalized)`; intervalo operativo válido; cancelación coherente; hitos compatibles con el estado. No se concederá `DELETE`.

**Índices:** `(restaurant_id, operational_day_started_at, status, created_at desc)`, `(restaurant_id, ready_at)` y `(restaurant_id, delivered_at)`.

**Cobertura:** `[RF-1, RF-3–RF-5, RF-9, RF-11–RF-13]`.

#### `order_status_history`

| Campo                        | Tipo conceptual        | Regla                                    |
| ---------------------------- | ---------------------- | ---------------------------------------- |
| `id`                         | bigint                 | PK interna                               |
| `order_id`                   | bigint                 | FK obligatoria a `orders`                |
| `restaurant_id`              | bigint                 | duplicado controlado para RLS y métricas |
| `from_status`                | `OrderStatus` nullable | nulo solo en creación                    |
| `to_status`                  | `OrderStatus`          | obligatorio                              |
| `reason_code`, `reason_text` | nullable               | presentes en cancelación                 |
| `changed_by`                 | uuid                   | operador que ejecutó la acción           |
| `occurred_at`                | timestamptz            | UTC, inmutable                           |

Será append-only: `UPDATE` y `DELETE` estarán revocados para roles de aplicación.

**Índices:** `(order_id, occurred_at)`, `(restaurant_id, to_status, occurred_at)`.

**Cobertura:** `[RF-4, RF-5, RF-9, RF-11]`.

#### `tracking_sessions`

| Campo           | Tipo conceptual      | Regla                                                    |
| --------------- | -------------------- | -------------------------------------------------------- |
| `id`            | bigint               | PK interna                                               |
| `order_id`      | bigint               | FK; una sesión vigente por pedido                        |
| `public_nonce`  | uuid/128-bit         | aleatorio, único y no secuencial                         |
| `token_version` | smallint             | selecciona la clave HMAC activa                          |
| `revoked_at`    | timestamptz nullable | revocación inmediata                                     |
| `expires_at`    | timestamptz nullable | nulo mientras el pedido está activo; estado final + 24 h |
| `created_at`    | timestamptz          | UTC                                                      |

El token completo no se almacenará. Se regenerará de forma determinista a partir de versión, nonce y HMAC con una clave solo de servidor.

**Índices:** `order_id` único para la sesión vigente y `public_nonce` único.

**Cobertura:** `[RF-2, RF-3, RF-10, RF-12]`.

#### `tracking_viewers`

| Campo                      | Tipo conceptual      | Regla                                     |
| -------------------------- | -------------------- | ----------------------------------------- |
| `tracking_session_id`      | bigint               | FK a `tracking_sessions`                  |
| `auth_user_id`             | uuid                 | usuario anónimo de Supabase Auth          |
| `topic`                    | text                 | tópico privado derivado del nonce público |
| `granted_at`               | timestamptz          | UTC                                       |
| `expires_at`, `revoked_at` | timestamptz nullable | copiados/actualizados desde la sesión     |

La PK será `(tracking_session_id, auth_user_id)`. La autorización de Realtime exigirá coincidencia de `auth.uid()`, tópico y vigencia.

**Índices:** `(auth_user_id, topic)` y `tracking_session_id`.

**Cobertura:** `[RF-2, RF-3, RF-6, RF-10, RF-12]`.

#### `private.delivery_channels`

Registra el transporte autorizado para una sesión de tracking: `WEB_PUSH`, `APNS_LIVE_ACTIVITY` o `FCM_LIVE_UPDATE`. El token se almacena cifrado con AES-GCM, acompañado solo por un digest SHA-256 para idempotencia, capacidades JSON, vigencia, revocación y última observación. La combinación `(tracking_session_id, channel, token_digest)` será única.

#### `private.customer_contact_identifiers`

Asocia uno o más identificadores cifrados al mismo contacto de WhatsApp. Distingue números E.164 de identificadores empresariales opacos (`BSUID`), mantiene un digest SHA-256 único por identificador y permite que un contacto conserve su consentimiento y sus bajas cuando Meta deje de exponer el número. Los identificadores se anonimizan junto con el contacto cuando expira la finalidad operativa y no existe consentimiento comercial vigente.

#### `private.delivery_outbox`

Conserva un evento por `(order_id, event_kind, order_version)` después del commit. El payload contiene únicamente la proyección pública mínima necesaria para actualizar la superficie del sistema.

#### `private.delivery_attempts`

Asocia cada evento con cada canal vigente y registra estado, intentos, próxima ejecución, latencia y código de error redactado. Los reintentos ocurren al minuto 1 y minuto 5, con máximo tres intentos.

**Cobertura:** `[RF-6–RF-10, RF-12–RF-14]`.

### 4.3. Ejemplo JSON del agregado interno

Este ejemplo documenta datos, no una respuesta pública:

```json
{
  "id": "1842",
  "restaurantId": "17",
  "operationalDay": {
    "startedAt": "2026-08-29T05:00:00Z",
    "endedAt": "2026-08-30T05:00:00Z"
  },
  "orderNumber": "A-127",
  "status": "PREPARING",
  "estimatedReadyAt": "2026-08-29T18:10:00Z",
  "estimateUpdatedAt": "2026-08-29T17:50:00Z",
  "pickupInstructions": "Recoge en el mostrador 2.",
  "cancellationReason": null,
  "timestamps": {
    "createdAt": "2026-08-29T17:50:00Z",
    "preparingAt": "2026-08-29T17:52:00Z",
    "readyAt": null,
    "deliveredAt": null,
    "cancelledAt": null
  },
  "statusHistory": [
    {
      "fromStatus": null,
      "toStatus": "RECEIVED",
      "occurredAt": "2026-08-29T17:50:00Z"
    },
    {
      "fromStatus": "RECEIVED",
      "toStatus": "PREPARING",
      "occurredAt": "2026-08-29T17:52:00Z"
    }
  ]
}
```

**Cobertura:** `[RF-1, RF-4, RF-9, RF-11, RF-13]`.

### 4.4. Ejemplo JSON de la proyección pública

No contiene IDs internos, organización, actores, historial interno ni token:

```json
{
  "restaurantName": "Toque Tin Centro",
  "orderNumber": "A-127",
  "status": "PREPARING",
  "estimatedReadyAt": "2026-08-29T18:10:00Z",
  "estimateUpdatedAt": "2026-08-29T17:50:00Z",
  "pickupInstructions": "Recoge en el mostrador 2.",
  "cancellationReason": null,
  "trackingExpiresAt": null,
  "updatedAt": "2026-08-29T17:52:00Z"
}
```

**Cobertura:** `[RF-2, RF-3, RF-6, RF-10, RF-12, RF-13]`.

## 5. Seguridad, autorización y acceso a datos

### 5.1. Operadores

- Supabase Auth administrará correo, contraseña y cookies SSR.
- El alta será previa al uso; el registro público estará deshabilitado.
- Las páginas protegidas validarán claims firmados, no confiarán en el objeto de sesión sin verificar.
- Toda lectura o mutación de un restaurante exigirá una membresía activa en `restaurant_users`.
- Las políticas distinguirán operadores permanentes de usuarios anónimos mediante el claim `is_anonymous`; `TO authenticated` por sí solo nunca será considerado autorización.

**Cobertura:** `[RF-1, RF-4, RF-5, RF-11–RF-13]`.

### 5.2. Clientes sin registro visible

1. El QR abre una URL cuyo token está en el fragmento `#`; el navegador no envía ese fragmento al servidor ni lo incluye en referrers.
2. La vista dinámica crea o reutiliza una sesión anónima de Supabase Auth sin pedir PII.
3. El cliente envía el token una sola vez al contrato de intercambio.
4. El servidor valida formato, versión y HMAC; busca el nonce; verifica revocación y expiración; concede `tracking_viewers` al `auth.uid()` anónimo.
5. La aplicación elimina el fragmento del historial y continúa en una URL tokenless asociada al nonce público.
6. Los snapshots posteriores exigen tanto sesión anónima como grant vigente; conocer el nonce no basta.

**Cobertura:** `[RF-2, RF-3, RF-10, RF-12]`.

### 5.3. RLS y privilegios

- RLS estará habilitado en toda tabla expuesta.
- `anon` no tendrá acceso directo a tablas de negocio.
- `authenticated` conservará únicamente los grants necesarios; las políticas combinarán identidad, tipo de sesión y membresía.
- Las políticas `UPDATE` incluirán predicados equivalentes de lectura y escritura.
- Las columnas usadas en RLS tendrán índices.
- Las operaciones de pedidos usarán funciones transaccionales con seguridad del invocador, `search_path` fijo y permisos de ejecución explícitos.
- El único uso de seguridad del definidor será una función interna no invocable que inserte la outbox de notificaciones; vivirá en esquema privado, tendrá `search_path` vacío y no aceptará identidad proporcionada por el cliente.
- `service_role`, secretos HMAC y clave privada VAPID existirán solo en servidor o función de borde.
- Los logs redactarán tokens, endpoints, claves push, cookies y credenciales.

**Cobertura:** `[RF-1–RF-14]`.

## 6. Contratos de aplicación

Los nombres siguientes son contratos lógicos. Las operaciones autenticadas se implementarán como Server Actions o servicios llamados desde ellas; el intercambio y snapshot público usarán Route Handlers dinámicos sin caché compartida.

| Contrato                      | Entrada                                                                 | Salida                                        | Errores principales                                                             | RF                              |
| ----------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------- |
| `signInOperator`              | email, password                                                         | sesión y restaurantes autorizados             | `AUTHENTICATION_REQUIRED`, `INVALID_CREDENTIALS`                                | RF-12                           |
| `createOrder`                 | restaurant, visible number, estimated ready time, optional instructions | resumen de operador, QR y URL firmada         | `FORBIDDEN`, `VALIDATION_ERROR`, `DUPLICATE_ORDER_NUMBER`                       | RF-1, RF-2, RF-9, RF-11         |
| `transitionOrder`             | order, expected current status, target status                           | pedido vigente, `idempotent`                  | `FORBIDDEN`, `INVALID_TRANSITION`, `CONFLICT`                                   | RF-4, RF-6, RF-9                |
| `cancelOrder`                 | order, reason code, optional OTHER text                                 | pedido `CANCELLED`                            | `CANCELLATION_REASON_REQUIRED`, `INVALID_TRANSITION`                            | RF-5, RF-9, RF-10               |
| `updateOrderEstimate`         | order, new future estimate                                              | estimación y timestamp actualizados           | `ESTIMATE_LOCKED`, `VALIDATION_ERROR`, `CONFLICT`                               | RF-6, RF-13                     |
| `scheduleOperationalCutoff`   | restaurant, new local cutoff                                            | corte pendiente y vigencia                    | `FORBIDDEN`, `VALIDATION_ERROR`                                                 | RF-11, RF-12                    |
| `exchangeTrackingToken`       | signed token, anonymous session                                         | grant y nonce público                         | `TRACKING_INVALID`, `TRACKING_EXPIRED`, `TRACKING_REVOKED`                      | RF-2, RF-3, RF-10, RF-12        |
| `getPublicTrackingSnapshot`   | anonymous session, public nonce                                         | `PublicTrackingSnapshot`                      | errores de tracking no enumerables                                              | RF-3, RF-6, RF-10, RF-12, RF-13 |
| `revokeTrackingSession`       | operator session, order                                                 | tracking revocado                             | `FORBIDDEN`, `CONFLICT`                                                         | RF-10, RF-12                    |
| `listAlertChannels`           | anonymous session, public nonce                                         | estado de navegador, App y WhatsApp           | `TRACKING_EXPIRED`                                                              | RF-8, RF-10                     |
| `createWhatsAppChallenge`     | anonymous session, public nonce                                         | código opaco, enlace de apertura y expiración | `TRACKING_EXPIRED`, `PRIVACY_CONFIGURATION_REQUIRED`                            | RF-8, RF-8A                     |
| `consumeWhatsAppChallenge`    | evento entrante firmado de n8n con número o BSUID y alias disponibles   | canal activo y mensajes de respuesta          | `CHALLENGE_INVALID`, `CHALLENGE_EXPIRED`, `REPLAY_DETECTED`, `CONTACT_CONFLICT` | RF-8, RF-8A                     |
| `recordContactConsent`        | respuesta firmada de n8n                                                | consentimiento y auditoría                    | `CONSENT_INVALID`, `REPLAY_DETECTED`                                            | RF-8A                           |
| `registerDeliveryChannel`     | sesión de tracking, nonce, plataforma, token y capacidades              | registro público y vigencia                   | `TRACKING_EXPIRED`, `DELIVERY_REGISTRATION_FAILED`                              | RF-8, RF-10, RF-14              |
| `refreshDeliveryChannelToken` | registro y token rotado                                                 | registro actualizado                          | `TRACKING_EXPIRED`, `FORBIDDEN`                                                 | RF-10, RF-14                    |
| `disableDeliveryChannel`      | registro vigente                                                        | canal revocado                                | `FORBIDDEN`, `CONFLICT`                                                         | RF-10, RF-14                    |
| `getDashboardSummary`         | operator session, restaurant, optional journey                          | pedidos agrupados y `DashboardSummary`        | `FORBIDDEN`, `VALIDATION_ERROR`                                                 | RF-11, RF-12                    |

### 6.1. DTO públicos

- `PublicTrackingSnapshot`: restaurante, número visible, estado, `estimatedReadyAt`, `serverTime`, `version`, `activityExpiresAt`, instrucciones, motivo de cancelación visible y momento de última actualización.
- `DashboardSummary`: intervalo operativo, conteos por estado, total creado, total activo, `averagePreparationSeconds: number | null` y `averagePickupSeconds: number | null`.

### 6.2. Catálogo de errores

Los contratos devolverán códigos estables en inglés y la UI los traducirá a español. Accesos inválidos, inexistentes, manipulados, expirados o revocados compartirán una respuesta pública no enumerable. Los errores no incluirán IDs de otros tenants, SQL, claims, tokens ni trazas internas.

**Cobertura:** `[RF-1–RF-14]`.

## 7. Flujo base y flujos alternos

### 7.1. Creación y QR

1. El operador autenticado selecciona un restaurante permitido.
2. `createOrder` promueve un corte pendiente si ya entró en vigor y calcula el intervalo operativo en la zona del restaurante.
3. Normaliza el número y comprueba la restricción única.
4. En una transacción crea `orders` en `RECEIVED`, su primer historial y `tracking_sessions`.
5. Genera el token firmado y el QR fuera de la persistencia, usando el nonce ya confirmado.
6. Si cualquier escritura falla, no queda un pedido parcial ni una sesión huérfana.

**Cobertura:** `[RF-1, RF-2, RF-9, RF-11, RF-12]`.

### 7.2. Apertura del seguimiento

1. El cliente escanea el QR sin registrar datos personales.
2. Se crea/reutiliza la identidad anónima y se intercambia el token una sola vez.
3. Se limpia el token de la URL y se recupera la proyección pública.
4. Se abre un Broadcast privado para el tópico concedido.
5. Si falla la conexión, se conserva el snapshot, se marca como potencialmente desactualizado, se reintenta automáticamente y se muestra actualización manual.
6. Tras reconectar se vuelve a consultar el snapshot antes de retirar la advertencia.

**Cobertura:** `[RF-2, RF-3, RF-6, RF-10, RF-12, RF-13]`.

### 7.3. Transición y difusión

1. La operación bloquea brevemente la fila del pedido y valida operador, tenant, estado esperado y destino.
2. Actualiza estado, versión y timestamp de hito; añade exactamente un historial.
3. Si llega a estado final, fija `expires_at` a 24 horas y sincroniza la vigencia de viewers y asociaciones push.
4. El commit dispara Broadcasts mínimos para el tópico del pedido y el dashboard del restaurante.
5. El cliente aplica el evento y recupera el snapshot si detecta una versión ausente o posterior.

**Cobertura:** `[RF-4–RF-7, RF-9–RF-11, RF-13]`.

### 7.4. Pedido listo y avisos

1. El cambio visual de cada estado ocurre siempre y no depende de permisos.
2. Si el cliente abrió «Recibir avisos del pedido», puede activar navegador y WhatsApp de forma independiente; App permanece «Próximamente» hasta publicar los enlaces.
3. WhatsApp usa un código de un solo uso de diez minutos; n8n normaliza el evento entrante con número, BSUID o ambos, y ToqueTin valida firma HMAC, timestamp y replay antes de activar el canal. Cuando ambos identificadores estén presentes, se asocian al mismo contacto y el BSUID puede utilizarse como destinatario sin revelar el teléfono.
4. Después del commit, un trigger interno crea el evento idempotente de outbox y sus intentos por cada canal vigente. Los ajustes exclusivos de estimación excluyen Web Push y WhatsApp.
5. Un webhook asíncrono invoca la función de borde después del commit.
6. El procesador envía Web Push, ActivityKit/APNs, FCM o entrega a n8n un `attemptId` idempotente para WhatsApp y registra el resultado.
7. Los intentos fallidos se repiten al minuto 1 y minuto 5, con máximo tres intentos totales. Una tarea programada procesa pendientes que no recibieron el webhook inicial.
8. Un fallo definitivo queda auditado y nunca cambia el estado del pedido ni oculta el seguimiento visual.

**Cobertura:** `[RF-7–RF-9, RF-14]`.

### 7.5. Cancelación y entrega

- Cancelar exige `RECEIVED` o `PREPARING` y un motivo válido; `OTHER` exige texto.
- Entregar exige `READY`.
- Ambos estados son finales, de solo lectura y consultables durante 24 horas.
- La revocación manual invalida el tracking de inmediato; no borra pedido, historial ni métricas.

**Cobertura:** `[RF-4, RF-5, RF-9, RF-10]`.

### 7.6. Dashboard y jornada operativa

- La lista incluye pedidos cuyo `operational_day_started_at` corresponde a la jornada seleccionada.
- Total activo equivale a `RECEIVED + PREPARING + READY`.
- Preparación promedia `ready_at - preparing_at` para intervalos cuyo `ready_at` cae dentro de la jornada mostrada.
- Recogida promedia `delivered_at - ready_at` para intervalos cuyo `delivered_at` cae dentro de la jornada mostrada.
- Cancelados e intervalos incompletos se excluyen.
- Sin muestras, el promedio es `null` y la UI muestra «Aún no hay datos».
- Un pedido que cruza el corte permanece en su jornada de creación, pero su intervalo contribuye al promedio de la jornada en que finaliza.
- Un cambio de corte se programa para el siguiente límite y nunca reagrupa la jornada actual o pedidos históricos.

**Cobertura:** `[RF-11, RF-12]`.

## 8. Realtime y recuperación

- Se usará Supabase Realtime Broadcast con canales privados, no Postgres Changes.
- Los tópicos de tracking derivarán del nonce público; los de restaurante usarán un identificador no presentado al cliente.
- Las políticas sobre `realtime.messages` comprobarán viewer vigente o membresía activa. No se crearán ni modificarán objetos internos del esquema `realtime`; solo sus políticas permitidas.
- Los payloads contendrán versión, tipo de cambio y campos públicos estrictamente necesarios. No contendrán tokens, endpoints, actores ni IDs de organización.
- El estado de conexión tendrá `connecting`, `connected`, `stale` y `reconnecting`.
- Al perder conexión, el snapshot visible permanece. La reconexión usa backoff limitado y una acción manual siempre disponible.
- Después de reconectar, una lectura autoritativa corrige eventos perdidos antes de marcar la vista como actualizada.

**Cobertura:** `[RF-6, RF-7, RF-10–RF-13]`.

## 9. Decisiones técnicas y alternativas descartadas

| Decisión                                     | Justificación                                              | Alternativa descartada                                  | Motivo del descarte                                      | RF                      |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- | ----------------------- |
| Monolito modular                             | Menor complejidad operativa y transacciones locales claras | Microservicios                                          | Infraestructura prematura para un único flujo            | RF-1–RF-14              |
| Server Components y servidor por defecto     | Reduce datos y secretos en cliente                         | Aplicación totalmente cliente                           | Mayor superficie de autorización y exposición accidental | RF-1–RF-14              |
| Supabase Auth con cuentas preaprovisionadas  | Satisface operador autorizado sin ampliar onboarding       | Registro público o proveedor social                     | Fuera de alcance y dependencias adicionales              | RF-12                   |
| Sesión anónima invisible                     | Permite Realtime privado sin PII ni registro visible       | Acceso universal con rol `anon`                         | No limita cada cliente a un pedido                       | RF-2, RF-3, RF-6, RF-12 |
| RLS más autorización de servidor             | Defensa en profundidad multi-tenant                        | Filtros solo en aplicación                              | Un error de consulta podría filtrar otro restaurante     | RF-12                   |
| Funciones transaccionales `security invoker` | Estado, historial e hitos quedan atómicos bajo RLS         | Escrituras separadas desde UI                           | Riesgo de estados e historial inconsistentes             | RF-4, RF-5, RF-9        |
| IDs internos bigint y nonce público          | Índices compactos sin exponer secuencias                   | UUID v4 como todas las PK o ID incremental público      | Fragmentación innecesaria o enumeración                  | RF-2, RF-12             |
| Token HMAC versionado en fragmento           | Regenerable, no almacenado en claro y fuera de logs HTTP   | Número de pedido, token en query/path o token en claro  | Predecible, filtrable o innecesariamente sensible        | RF-2, RF-10, RF-12      |
| Broadcast privado                            | Autorización por tópico y mejor escalabilidad              | Postgres Changes o polling principal                    | Menor aislamiento/escalabilidad o peor inmediatez        | RF-6, RF-11, RF-13      |
| Outbox y envío asíncrono                     | Auditabilidad, idempotencia y reintentos                   | Enviar push dentro de la transición                     | Latencia externa y fallos bloquearían el pedido          | RF-7, RF-8              |
| Estado actual más historial append-only      | Lecturas rápidas y trazabilidad completa                   | Solo estado actual o estado derivado siempre de eventos | Pierde auditoría o encarece todas las lecturas           | RF-4, RF-9, RF-11       |
| Jornada persistida en cada pedido            | Cambios de corte no reescriben historia                    | Recalcular con configuración actual                     | Destruye consistencia histórica                          | RF-1, RF-11             |
| UTC más zona IANA                            | Métricas correctas y presentación local                    | Timestamps locales sin zona                             | Ambigüedad y errores al comparar jornadas                | RF-9, RF-11             |

Referencias técnicas vigentes al redactar este plan:

- [Supabase: Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous)
- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase: Creating an SSR client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase changelog: Realtime schema locked down](https://supabase.com/changelog/realtime-schema-locked-down-against-modification)

Las versiones de Supabase CLI y paquetes se verificarán contra la documentación y changelog al iniciar la implementación; las dependencias quedarán fijadas en el lockfile.

## 10. Estrategia de tests

### 10.1. Capas

| Capa          | Herramienta objetivo                     | Responsabilidad                                    |
| ------------- | ---------------------------------------- | -------------------------------------------------- |
| Unitarios     | Vitest                                   | funciones puras, validación, tiempo, token y DTO   |
| Componentes   | Testing Library + Vitest                 | formularios, mensajes, estados visuales y permisos |
| Base de datos | pgTAP mediante entorno local de Supabase | constraints, funciones, grants, RLS y métricas     |
| Integración   | Vitest contra Supabase local             | Auth, contratos, Broadcast, outbox y expiración    |
| E2E           | Playwright                               | recorrido real operador/cliente en navegador       |
| Dispositivo   | matriz manual documentada                | Web Push, vibración, audio y segundo plano reales  |

No se usarán mocks como fuente definitiva en rutas de producción. Los dobles de prueba solo aislarán APIs del navegador o el transporte Web Push; la persistencia crítica se verificará contra PostgreSQL local.

### 10.2. Casos por requisito

| RF    | Pruebas mínimas                                                                                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-1  | creación válida; obligatorios; instrucciones opcionales; número duplicado en misma jornada; mismo número en otra jornada/restaurante; acceso denegado                                          |
| RF-2  | nonce y firma válidos; QR regenerable; token manipulado; número visible no autentica; sesión limitada a un pedido                                                                              |
| RF-3  | snapshot público completo y sin IDs internos; acceso sin PII; error seguro y reintento                                                                                                         |
| RF-4  | todas las transiciones válidas; saltos y retrocesos; estados finales; repetición idempotente; dos acciones concurrentes                                                                        |
| RF-5  | cuatro motivos; `OTHER` con/sin texto; cancelación en estados permitidos y prohibidos; motivo visible                                                                                          |
| RF-6  | Broadcast recibido; eventos perdidos; stale state; reintento automático; actualización manual; recuperación autoritativa                                                                       |
| RF-7  | cambio visual inequívoco; persistencia en `READY`; funcionamiento sin sonido, vibración ni push; accesibilidad sin depender de color                                                           |
| RF-8  | permiso tras acción explícita; aceptación/rechazo; capacidades ausentes; outbox idempotente; éxito, reintentos y fallo definitivo                                                              |
| RF-8A | código válido/vencido/repetido; HMAC y replay; consentimiento comercial unificado solicitado una sola vez; filtrado de estados de Meta; revocación; anonimización; aislamiento por restaurante |
| RF-9  | evento inicial; evento por transición; motivo; timestamps; rechazo sin historial; imposibilidad de actualizar/borrar historial                                                                 |
| RF-10 | lectura final durante 24 h; expiración exacta; revocación inmediata; solo lectura; respuesta no enumerable                                                                                     |
| RF-11 | corte `00:00`; corte personalizado; jornada cruzando medianoche; cambio pendiente; conteos; promedios; cancelados excluidos; promedio `null`                                                   |
| RF-12 | operador multi-restaurante; acceso cruzado bloqueado; usuario anónimo sin permisos operativos; políticas RLS y Broadcast; secretos ausentes del cliente                                        |
| RF-13 | creación con estimación; actualización en `RECEIVED`/`PREPARING`; rechazo en estados posteriores; Broadcast y etiqueta de actualización                                                        |

### 10.3. E2E prioritarios

1. Operador inicia sesión, selecciona restaurante y crea pedido.
2. Se genera el QR y el cliente abre el seguimiento sin registro visible.
3. El operador marca `PREPARING`; el cliente ve el cambio.
4. El operador actualiza la estimación; el cliente ve el nuevo valor señalado como actualizado.
5. El cliente activa avisos y el operador marca `READY`.
6. El cliente recibe el cambio visual y los canales permitidos disponibles.
7. El operador marca `DELIVERED`; historial, hitos y expiración quedan correctos.
8. Flujo alterno de cancelación desde `RECEIVED` y `PREPARING`.
9. Aislamiento con dos restaurantes y operadores diferentes.
10. Pérdida y recuperación de conexión sin borrar el último estado.

### 10.4. Seguridad y concurrencia

- Intentos con token truncado, alterado, de versión desconocida, revocado y expirado.
- Consultas y mutaciones cruzando organizaciones, restaurantes, pedidos y tópicos.
- Usuario anónimo intentando invocar contratos de operador.
- Revisión de que ninguna proyección pública contiene IDs, actores, membresías o tokens.
- Dos transiciones simultáneas sobre el mismo pedido y dos creaciones simultáneas con el mismo número.
- Verificación de que `service_role`, HMAC y VAPID privada no aparecen en bundles, snapshots, logs ni respuestas.
- Asesores de seguridad y rendimiento de Supabase sin hallazgos críticos.

### 10.5. Puertas de calidad

Una entrega solo podrá cerrarse con:

- `pnpm typecheck` exitoso.
- `pnpm lint` exitoso.
- tests unitarios, de componentes, base de datos e integración exitosos.
- E2E del flujo afectado exitosos.
- `pnpm build` exitoso para cambios de rutas, configuración, variables o Server Components.
- revisión manual de secretos, RLS, aislamiento, historial, expiración y experiencia sin registro.

## 11. Secuencia de implementación

### Fase 1 — Fundación

- Inicializar Next.js/TypeScript estricto y configuración local de Supabase.
- Establecer clientes de navegador/servidor, validación compartida, errores e internacionalización preparada.
- Configurar Auth con registro deshabilitado y cuentas preaprovisionadas.

**Salida:** sesión de operador validada y estructura modular comprobable. `[RF-12]`

### Fase 2 — Persistencia y aislamiento

- Crear tipos, tablas, constraints, índices, grants y RLS mediante la migración inicial.
- Añadir funciones transaccionales y pruebas pgTAP de tenant, estados e historial.

**Salida:** dominio persistente y aislado antes de construir UI. `[RF-1, RF-4, RF-5, RF-9, RF-11–RF-14]`

### Fase 3 — Operación del restaurante

- Implementar creación, QR, lista por estado, transiciones, cancelación y estimación.
- Añadir estados vacíos, errores en español e idempotencia visible.

**Salida:** operador completa el ciclo con trazabilidad. `[RF-1, RF-2, RF-4, RF-5, RF-9, RF-13]`

### Fase 4 — Tracking y Realtime

- Implementar token, intercambio anónimo, snapshot público y expiración.
- Configurar Broadcast privado, reconexión y actualización manual.

**Salida:** cliente sigue un único pedido sin registro ni exposición de datos. `[RF-2, RF-3, RF-6, RF-7, RF-10, RF-12, RF-13]`

### Fase 5 — Superficies nativas y avisos

- Implementar consentimiento web, App Clip, Live Activity y app Android ligera.
- Añadir canales cifrados, outbox, función multitransporte, webhook y reintentos.

**Salida:** seguimiento fuera de la app y avisos progresivos auditables sin bloquear el flujo principal. `[RF-7, RF-8, RF-14]`

### Fase 6 — Dashboard y endurecimiento

- Implementar corte vigente/pendiente, listados, conteos y promedios.
- Completar E2E, matriz de dispositivos, asesores, build y revisión de secretos.

**Salida:** operación diaria verificable y todos los criterios de finalización cubiertos. `[RF-1–RF-14]`

## 12. Matriz de trazabilidad final

| RF    | Módulos                                 | Datos                                                                        | Flujo principal                   | Pruebas                                               |
| ----- | --------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| RF-1  | orders, auth-tenancy, dashboard         | restaurants, restaurant_users, orders                                        | creación y jornada                | creación, duplicado, tenant                           |
| RF-2  | tracking, application-ui                | tracking_sessions, orders                                                    | QR e intercambio                  | firma, manipulación, asociación única                 |
| RF-3  | tracking, application-ui                | tracking_viewers, orders, restaurants                                        | snapshot público                  | campos permitidos, sin PII, errores seguros           |
| RF-4  | orders, persistence                     | orders, order_status_history                                                 | transición atómica                | matriz, idempotencia, concurrencia                    |
| RF-5  | orders, tracking                        | orders, order_status_history                                                 | cancelación                       | motivos, `OTHER`, estados prohibidos                  |
| RF-6  | realtime, tracking                      | tracking_viewers, orders                                                     | Broadcast y recuperación          | conexión, stale, reintentos, refetch                  |
| RF-7  | application-ui, realtime, notifications | orders, notifications                                                        | cambio a `READY`                  | visual, accesibilidad, degradación                    |
| RF-8  | notifications                           | delivery_channels, outbox, delivery_attempts                                 | selector multicanal y despacho    | permisos, múltiples canales, idempotencia, reintentos |
| RF-8A | notifications, integrations             | WhatsApp challenges, contacts, restaurant contacts, consents, consent events | activación, consentimiento y baja | caducidad, replay, HMAC, aislamiento, anonimización   |
| RF-9  | orders, persistence                     | order_status_history, orders                                                 | historial por transición          | append-only, timestamps, rechazos                     |
| RF-10 | tracking                                | tracking_sessions, tracking_viewers                                          | terminal, expiración y revocación | 24 h, lectura, no enumeración                         |
| RF-11 | dashboard, auth-tenancy                 | restaurants, orders, history                                                 | jornada y métricas                | cortes, cruces, conteos, promedios                    |
| RF-12 | auth-tenancy, tracking, persistence     | todas las entidades con tenant o viewer                                      | operador y cliente aislados       | RLS, tópicos, acceso cruzado                          |
| RF-13 | orders, realtime, tracking              | orders                                                                       | modificar y difundir estimación   | estados permitidos, rechazo, snapshot                 |

## 13. Supuestos y límites del plan

- La zona horaria inicial será `America/Bogota`; cada restaurante conservará una zona IANA explícita.
- El corte inicial será `00:00` y cualquier operador autorizado podrá programar el siguiente.
- Los pedidos activos no expiran por tiempo; el tracking termina 24 horas después de `DELIVERED` o `CANCELLED`, o inmediatamente al revocarse.
- El historial se conserva indefinidamente en el MVP.
- El seguimiento no exige nombre, correo, teléfono ni otro PII. El identificador de WhatsApp solo se trata cuando el cliente activa voluntariamente ese canal y queda sujeto a cifrado, finalidad y revocación.
- El operador puede volver a presentar el mismo QR vigente porque el token se regenera; revocar el tracking no borra ni reabre el pedido.
- La disponibilidad de Push y superficies nativas depende del dispositivo, permisos y plataforma; el seguimiento web y el cambio visual siguen siendo suficientes para completar el flujo.
- Pagos, menús, carrito, marketplace, fidelización, apps móviles completas con cuentas o historial, POS, hardware avanzado e IA permanecen fuera de alcance.
