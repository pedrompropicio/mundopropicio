---
name: MP Audience — saúde da ligação Meta
description: Regras de propagação de erro de sync Meta para crm.ad_platform_connections e sinais na UI do /audience (issue #36)
type: feature
---

# Saúde da ligação Meta (issue #36)

Antes desta regra o erro de sync só se escrevia em `crm.meta_sync_state.last_error`
e a ligação ficava `active` para sempre — o cron falhava de hora a hora em
silêncio (foi o caso de Fortal e Siriguella, corrigido à mão a 17/09/2026).

Helper único: `supabase/functions/_shared/meta-connection-health.ts`
(`classifyMetaFailure`, `reportMetaSyncFailure`, `reportMetaSyncSuccess`).
Usado pelas cinco edge functions de sync: `crm-meta-sync-campaigns`,
`-adsets`, `-ads`, `-insights`, `-creatives`. Escreve com service_role
(as funções correm com anon + JWT do utilizador e o RLS bloquearia o write).
Nunca lança: uma falha a registar saúde não pode derrubar o sync.

## Regras

- **(a) Erro de autenticação** (OAuthException, código 190, subcódigos de sessão
  invalidada/expirada): `status = 'expired'`, `last_error` = mensagem real da
  Meta, `consecutive_failures + 1`. À primeira ocorrência, sem tolerância.
- **(b) Erro transitório** (rate limit 4/17/32/613, 5xx, timeout): só
  `consecutive_failures + 1` e `last_error`. **Ao atingir 6 falhas seguidas**,
  `status = 'error'` (só se estivesse `active`).
- **(c) Sucesso**: `consecutive_failures = 0`, `last_error = null`,
  `last_validated_at = now()`. `'error'` volta a `'active'`. **Nunca** promove
  `expired`, `revoked` nem `disconnected` — isso só na reconexão OAuth.
- **(d) Reconexão OAuth**: `crm.upsert_meta_connection` e
  `crm.upsert_artist_meta_connection` já repõem `active` / 0 / null.

Sem DDL: usa apenas colunas existentes (`status`, `consecutive_failures`,
`last_error`, `last_validated_at`, `expires_at`). O CHECK de `status` aceita
`active, expired, revoked, error, disconnected, pending_selection, pending_link`
— **não existe `needs_reauth`**. Os crons continuam a percorrer só `active`,
pelo que uma ligação marcada `expired` deixa de ser tentada.

Ligações de empresa e de artista (`connection_scope = 'artist'`) seguem a mesma
regra, sem excepção.

## UI (`src/pages/crm/Campaigns.tsx`, hook `useMetaConnectionHealth`)

- Indicador verde **"Live" só com `status = 'active'` E insights Meta com menos
  de 48h**; caso contrário mostra "Dados parados" ou "Ligação com problema".
- **Banner persistente, não dispensável**, quando a ligação não está `active`
  ou tem `last_error`: "Ligação Meta &lt;estado&gt; — dados parados desde &lt;data do
  último sync com sucesso&gt;." + botão Reconectar → `/audience/connections`.
  A mensagem de `last_error` só aparece a admin/platform_admin.
- Aviso âmbar quando faltarem **7 dias ou menos** para `expires_at`, calculado
  no cliente (sem cron).
- Só tokens semânticos (`success`, `warning`, `destructive`) — nunca cores
  directas como `text-emerald-500`.
