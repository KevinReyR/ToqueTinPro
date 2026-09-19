# AGENTS.md — Localizador Digital de Pedidos para Restaurantes

## Proyecto
Plataforma B2B2C para restaurantes y plazoletas de comida que convierte el celular del cliente en un localizador digital de pedidos. En el MVP, el restaurante crea un pedido, genera un QR seguro y temporal, el cliente lo escanea sin registrarse y puede seguir el estado del pedido en tiempo real hasta recibir una alerta cuando esté listo.

La arquitectura objetivo del MVP es un monorepo multi-tenant con Next.js + TypeScript y Supabase (PostgreSQL, Auth y Realtime) como núcleo, un App Clip/Live Activity en SwiftUI + ActivityKit y una app Android ligera opcional en Kotlin + Jetpack Compose. La solución debe priorizar simplicidad operativa, baja fricción para el cliente, seguridad mediante tokens no predecibles y trazabilidad completa de los cambios de estado del pedido.

### Alcance funcional del MVP

El MVP debe cubrir únicamente el flujo principal:

`Crear pedido -> Generar QR -> Cliente abre seguimiento -> Preparando -> Listo -> Entregado`

Componentes incluidos:

- Panel del restaurante.
- Creación y gestión básica de pedidos.
- QR dinámico por pedido.
- Página pública de seguimiento mediante token.
- Actualización del pedido en tiempo real.
- Aviso visual, sonido y vibración cuando el pedido esté listo, cuando el navegador/dispositivo lo permita.
- Notificaciones push cuando sean técnicamente viables en la PWA.
- Historial de estados del pedido.
- Tiempo estimado de preparación definido inicialmente de forma manual.
- Confirmación de entrega.
- Dashboard administrativo básico.
- Arquitectura multi-tenant desde el inicio.
- App Clip de iOS con Live Activity para Lock Screen y Dynamic Island.
- App Android opcional con Live Update en Android 16+ y notificación persistente en versiones compatibles anteriores.
- Seguimiento web universal como fallback sin instalación.

Fuera del alcance inicial:

- Publicidad.
- Marketplace de restaurantes.
- Pagos dentro de la plataforma.
- Menús y carrito de compra.
- Pedidos multi-restaurante.
- Programa de fidelización.
- Aplicaciones móviles completas con cuentas, historial o funcionalidades distintas del seguimiento.
- Hardware NFC dinámico.
- Integraciones POS.
- IA o predicción automática de tiempos.

## Comandos
- Instalar dependencias: `pnpm install`
- Desarrollo: `pnpm dev`
- Build: `pnpm build`
- Ejecutar producción local: `pnpm start`
- Tests: `pnpm test`
- Tests en modo watch: `pnpm test:watch`
- Tests E2E: `pnpm test:e2e`
- Lint: `pnpm lint`
- Formato: `pnpm format`
- Verificar tipos: `pnpm typecheck`

Si alguno de estos scripts todavía no existe en `package.json`, no inventes una implementación silenciosamente. Revisa primero la configuración actual del proyecto y añade el script únicamente si forma parte de la tarea o es necesario para garantizar la calidad del cambio.

## Estilo y convenciones
- TypeScript en modo estricto.
- Código, nombres de variables, funciones, tablas, columnas, enums y commits en inglés.
- Textos visibles al usuario inicialmente en español, preparados para internacionalización futura.
- Componentes React en `PascalCase`.
- Funciones, variables y hooks en `camelCase`.
- Hooks personalizados con prefijo `use`.
- Constantes globales en `UPPER_SNAKE_CASE` cuando corresponda.
- Archivos de componentes en `kebab-case` o siguiendo la convención ya existente en el repositorio; no mezclar convenciones dentro del mismo módulo.
- Evitar `any`; usar tipos explícitos, genéricos o `unknown` con validación.
- Preferir Server Components en Next.js salvo que exista una razón concreta para usar `"use client"`.
- Mantener la lógica de negocio fuera de componentes visuales cuando sea reutilizable o testeable.
- No duplicar lógica de acceso a datos, validación, autorización ni transiciones de estado.
- Usar funciones pequeñas y con una responsabilidad clara.
- Mantener componentes UI enfocados en presentación; la lógica de dominio debe residir en servicios, actions, hooks o módulos dedicados.
- Para validación de payloads y formularios, usar el mecanismo definido por el proyecto; si no existe, preferir Zod.
- Las fechas deben almacenarse en UTC en base de datos y convertirse a la zona horaria correspondiente solo para presentación.
- No almacenar secretos, service-role keys ni credenciales en el cliente.

### Convenciones de dominio

Estados iniciales del pedido:

- `RECEIVED`
- `PREPARING`
- `READY`
- `DELIVERED`
- `CANCELLED`

Toda transición de estado debe:

1. actualizar el estado actual del pedido;
2. registrar un evento en el historial;
3. registrar el timestamp correspondiente cuando aplique;
4. publicar el cambio necesario para los clientes suscritos;
5. respetar las reglas de autorización del tenant y restaurante.

No eliminar el historial de estados para simplificar consultas. La trazabilidad forma parte del producto.

## Modelo de datos base

La implementación puede evolucionar, pero el dominio inicial debe contemplar al menos:

- `organizations`
- `restaurants`
- `restaurant_users`
- `orders`
- `order_status_history`
- `tracking_sessions`
- `devices` o `push_subscriptions`, si se implementan notificaciones push
- `notifications`, si se requiere persistencia de envíos o auditoría

### Reglas para pedidos

- El número visible del pedido (`order_number`) puede ser corto y legible, pero nunca debe utilizarse como credencial de acceso pública.
- La página pública de seguimiento debe resolverse mediante un token aleatorio, no secuencial y suficientemente difícil de adivinar.
- Los tokens de seguimiento deben poder expirar o revocarse.
- No exponer identificadores internos innecesarios al cliente.
- Una sesión de tracking solo debe dar acceso al pedido específico asociado al token.
- Un usuario de restaurante solo puede operar pedidos pertenecientes a restaurantes a los que tenga acceso.

## Seguridad y multi-tenancy

- Implementar aislamiento por tenant desde el inicio.
- Usar Row Level Security de Supabase cuando el acceso sea directo desde el cliente.
- No desactivar RLS como solución rápida a problemas de permisos.
- No utilizar la `service_role` en código que pueda ejecutarse en el navegador.
- Validar autorización también en Server Actions, Route Handlers, Edge Functions o servicios backend.
- Tratar todos los datos provenientes del cliente como no confiables.
- No permitir consultar pedidos mediante IDs incrementales públicos.
- Los tokens de tracking deben viajar preferiblemente en la ruta o contexto definido para seguimiento, evitando registrarlos innecesariamente en logs.
- No registrar datos sensibles, credenciales o tokens completos en logs de producción.

## UX obligatoria del MVP

La experiencia del cliente debe ser mobile-first y no debe exigir:

- registro;
- inicio de sesión;
- correo electrónico;
- teléfono;
- instalación de una aplicación.

El cliente debe poder entender el estado de su pedido en pocos segundos.

La página de seguimiento debe priorizar:

1. restaurante;
2. número visible del pedido;
3. estado actual;
4. tiempo estimado;
5. instrucciones de retiro;
6. aviso destacado cuando el pedido esté listo.

Cuando el estado pase a `READY`, la interfaz debe cambiar de forma claramente perceptible. Si el dispositivo y los permisos lo permiten, ejecutar además sonido, vibración y/o notificación push.

No bloquear la funcionalidad principal si el usuario rechaza permisos de notificación.

## Reglas
- Lee `docs/constitution.md` y la spec activa antes de tocar código, si existen en el repositorio.
- Lee este archivo completo antes de implementar cambios significativos.
- Respeta el alcance del MVP. No añadas funcionalidades de Fase 2 o posteriores salvo petición explícita.
- No introduzcas publicidad, marketplace, pagos, loyalty, NFC avanzado, integración POS ni IA dentro de una tarea del MVP salvo que la tarea lo solicite expresamente. App Clip, Live Activities y el cliente Android ligero sí forman parte del alcance vigente.
- No cambies el stack principal ni añadas frameworks de infraestructura innecesarios sin una razón técnica clara.
- Los clientes iOS y Android son adaptadores de la proyección pública; no deben duplicar reglas de negocio, autorización ni persistencia.
- Un cambio de estado o estimación visible fuera de la app debe originarse en el outbox persistente posterior al commit.
- No introduzcas microservicios para problemas que puedan resolverse adecuadamente dentro de la arquitectura actual.
- No agregues dependencias si la plataforma o una dependencia ya instalada resuelve el problema de forma razonable.
- No modifiques migraciones ya aplicadas. Crea una nueva migración para cambios de esquema.
- No elimines columnas, tablas, RLS policies, funciones o índices existentes sin verificar dependencias.
- No rompas compatibilidad con datos existentes sin una migración explícita.
- No uses datos mock en rutas de producción salvo que estén claramente aislados para desarrollo o testing.
- No escondas errores con `try/catch` vacíos, retornos genéricos o casts de TypeScript.
- No silencies errores de lint, TypeScript o tests para conseguir que el pipeline pase.
- No cambies masivamente archivos no relacionados con la tarea.
- Mantén los cambios pequeños, trazables y enfocados.

## Priorización del producto

Ante varias soluciones técnicamente válidas, prioriza en este orden:

1. Fiabilidad de la notificación de pedido listo.
2. Seguridad y aislamiento entre restaurantes/tenants.
3. Experiencia sin fricción para el cliente.
4. Simplicidad operativa para el restaurante.
5. Trazabilidad y métricas del ciclo del pedido.
6. Rendimiento.
7. Elegancia arquitectónica.

No sacrifiques los primeros cinco puntos para implementar abstracciones prematuras.

## Métricas que la arquitectura debe permitir calcular

Aunque el dashboard inicial sea básico, el modelo de datos debe permitir calcular posteriormente:

- Total de pedidos creados.
- Pedidos entregados y cancelados.
- Tasa de adopción del tracking digital.
- Tiempo `created -> preparing`.
- Tiempo `preparing -> ready`.
- Tiempo `ready -> delivered`.
- Tiempo total `created -> delivered`.
- Pedidos listos aún no reclamados.
- Tiempo promedio de preparación por restaurante.
- Tiempo promedio de recogida después de `READY`.

Evita diseños que destruyan o sobrescriban los timestamps necesarios para estas métricas.

## Testing

Como mínimo, cubrir con tests la lógica crítica relacionada con:

- autorización y aislamiento por tenant;
- generación y validación de tokens de tracking;
- transiciones válidas e inválidas de estado;
- creación del historial de estados;
- acceso público limitado al pedido asociado al token;
- cálculo de duraciones y métricas básicas;
- comportamiento del flujo principal de pedido;
- actualización en tiempo real cuando sea posible probarla de forma estable.

Los tests E2E prioritarios son:

1. restaurante crea un pedido;
2. se genera el tracking;
3. cliente abre el pedido mediante QR/token;
4. restaurante cambia a `PREPARING`;
5. cliente ve el cambio;
6. restaurante cambia a `READY`;
7. cliente ve el estado listo y recibe el aviso disponible;
8. restaurante marca `DELIVERED`;
9. el historial y timestamps quedan registrados correctamente.

## Al terminar cualquier tarea
- Ejecuta `pnpm typecheck`.
- Ejecuta `pnpm lint`.
- Ejecuta los tests relevantes para el cambio.
- Si el cambio toca el flujo principal, ejecuta también los tests E2E relacionados.
- Ejecuta `pnpm build` cuando el cambio pueda afectar compilación, rutas, Server Components, variables de entorno o configuración de Next.js.
- Revisa que no se hayan incluido secretos o variables sensibles en el diff.
- Revisa que las nuevas consultas respeten multi-tenancy y RLS.
- Revisa que los estados del pedido y su historial permanezcan consistentes.
- Revisa que el flujo del cliente siga funcionando sin registro ni instalación de app.
- Resume qué se cambió, qué se validó y cualquier riesgo o deuda técnica que quede pendiente.
