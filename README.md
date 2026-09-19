# ToqueTin

ToqueTin convierte el teléfono del cliente en un localizador de pedidos. El mismo QR abre seguimiento web, un App Clip con Live Activity en iPhone o la app Android instalada con Live Updates.

## Estructura

- `apps/web`: panel del restaurante, seguimiento público, contratos HTTP y archivos de asociación.
- `apps/ios`: app contenedora mínima, App Clip y extensión de Live Activity.
- `apps/android`: app ligera con App Links y notificación de seguimiento.
- `supabase`: migraciones, RLS y outbox multicanal.
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
