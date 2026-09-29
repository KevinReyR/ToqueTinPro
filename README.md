# ToqueTin

ToqueTin convierte el teléfono del cliente en un localizador de pedidos. El mismo QR abre seguimiento web, un App Clip con Live Activity en iPhone o la app Android instalada con Live Updates.

## Estructura

- `apps/web`: panel del restaurante, seguimiento público, contratos HTTP y archivos de asociación.
- `apps/ios`: app contenedora mínima, App Clip y extensión de Live Activity.
- `apps/android`: app ligera con App Links y notificación de seguimiento.
- `supabase`: migraciones, RLS, consentimientos privados y outbox multicanal.
- `integrations/n8n`: contrato y configuración del adaptador de WhatsApp Business Cloud.
- `specs/001-toque-mvp`: especificación y plan técnico vigentes.

## Desarrollo web

```bash
pnpm install
pnpm dev
```

Las rutas `/preview/tracking` y `/preview/dashboard` usan datos aislados de demostración y no participan en producción. Las rutas operativas requieren las variables de `.env.example`.

## Validación

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Los proyectos nativos se compilan en sus toolchains oficiales. Consulta los README dentro de `apps/ios` y `apps/android`.

## Despliegue en Netlify

`netlify.toml` fija Node.js 22 y construye la aplicación Next.js desde la raíz del monorepo. Conecta el repositorio a Netlify, publica desde `main` y configura las variables de `.env.example` en el panel; ningún secreto debe almacenarse en Git.

La instancia de Supabase se prepara con:

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase config push
supabase functions deploy process-deliveries
```

Después de aplicar las migraciones, crea el entorno demo de forma idempotente. La contraseña se recibe solo mediante variables de entorno y nunca se imprime:

```bash
pnpm bootstrap:demo
```

La cuenta predeterminada es `operator.demo@example.com`. Define `DEMO_OPERATOR_PASSWORD`, `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` únicamente en la sesión administrativa donde ejecutes el comando.

## Despliegue alternativo en Render

El archivo `render.yaml` crea el servicio web desde la raíz del monorepo. Después de vincular el Blueprint en Render, configura las variables de Supabase, APNs, FCM, VAPID, privacidad y n8n que correspondan usando `.env.example` como referencia. Los secretos se introducen únicamente en el panel de Render; nunca se guardan en Git. La integración de WhatsApp se activa siguiendo [integrations/n8n/README.md](integrations/n8n/README.md).
