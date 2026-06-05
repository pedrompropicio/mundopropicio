# Screens — Referência

Mapa conciso de páginas adicionadas na Fase 1 das notificações WhatsApp.

## `/admin/notifications`

**Acesso:** `admin` ou `platform_admin`.
**Componente:** `src/pages/admin/Notifications.tsx`.

### Tabs

1. **Templates** — lista templates do catálogo Meta (`notification_templates`) com nome, idioma, `status` (approved/pending/rejected/...) e `param_count`.
2. **Fila / Histórico** — últimas linhas de `notification_queue` com status (queued/sending/sent/delivered/read/failed) e contador de retries.
3. **Opt-in** — lista utilizadores com `notification_optin` activo (telefone E.164, data opt-in/opt-out).

## `/perfil`

**Acesso:** qualquer utilizador autenticado.
**Componente:** `src/pages/UserSettings.tsx`.

Permite ao utilizador:
- Registar/editar telefone WhatsApp em formato E.164 (validação `^\+[1-9]\d{6,14}$`).
- Activar/desactivar opt-in para receber notificações operacionais.

Link no sidebar: "Preferências" (ícone `Bell`).
