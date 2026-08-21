# Meta Ads — integração

> Integração OAuth com Meta Business para o módulo **MP Audience**: gestão de Custom Audiences, publicação de campanhas, atribuição via Conversions API.

| | |
|---|---|
| **Status** | ✅ Em produção (OAuth, sync e publicação) |
| **Plataforma alvo** | Meta Business (Facebook + Instagram Ads) |
| **Módulo cliente** | MP Audience (CRM/Ads) |
| **Fase atual** | Operacional; este doc cobre OAuth/tokens/CAPI |
| **Última revisão** | 2026-08-21 |

> ℹ️ **Âmbito deste documento (reconciliado a 2026-08-21).**
> Este ficheiro cobre o **fluxo OAuth, cifragem e gestão de tokens** da ligação
> ao Meta. Para o **dashboard de tráfego pago** (`/audience/dashboard`), tabelas
> de insights, convenções de unidades e sync de métricas, a fonte de verdade é
> **`docs/features/mp-audience-dashboard.md`**.
>
> Correcções aplicadas nesta revisão: os nomes de tabelas `crm_ad_accounts` /
> `crm_campaigns` **nunca existiram** — o real é o schema `crm` com
> `crm.ad_platform_connections`, `crm.meta_campaign_snapshot` e
> `crm.meta_*_insights_daily`. As edge functions do domínio `crm-meta-*` estão
> em produção há meses (não "pendentes"). Secções mantidas por valor histórico
> estão marcadas como tal.


---

## 1. O que é

Esta integração permite que utilizadores com role `marketing_manager` (ou `admin`/`manager`) liguem uma ou mais **contas de ads Meta** ao tenant, e a partir daí:

1. **Sincronizar Custom Audiences** geradas no MP Audience (segmentações de público baseadas em vendas históricas de bilheteira) com a Meta Ads Manager.
2. **Criar Lookalike Audiences** a partir de seed audiences locais.
3. **Publicar campanhas** com objetivos, criativos e orçamento definidos no MP Audience.
4. **Enviar eventos de conversão via Conversions API (CAPI)** — quando uma venda de bilheteira é confirmada, dispara `Purchase` server-side para a Meta atribuir a campanha.
5. **Ler métricas de atribuição** (gasto, impressões, conversões, ROAS) para reconciliação com vendas reais.

**Porque é importante:** é o primeiro caso onde o MP Audience entrega valor mensurável — antes desta integração, o módulo é só uma UI de segmentação sem efeito no exterior.

---

## 2. Arquitetura geral

```
┌───────────────────┐   1. OAuth   ┌─────────────────────┐
│  Browser do user  │ ───────────▶ │  Meta OAuth Server  │
└─────────┬─────────┘              └──────────┬──────────┘
          │                                   │
          │ 2. Redirect com code              │
          ▼                                   │
┌─────────────────────────────┐               │
│ Edge: crm-meta-oauth-callback│ ◀───────────┘
│ - troca code por access_token│
│ - cifra tokens (AES-GCM)     │
│ - guarda em ad_platform_conn.  │
└─────────┬───────────────────┘
          │
          │ 3. Token cifrado em DB
          ▼
┌─────────────────────────────────┐
│ Cron: crm-refresh-ad-tokens     │
│ - corre a cada 12h              │
│ - refresca tokens próximos de   │
│   expirar (long-lived 60d)      │
└─────────┬───────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│ Edges de uso:                   │
│ - crm-sync-audience             │
│ - crm-publish-campaign          │
│ - crm-send-conversion-event     │
│ - crm-fetch-attribution         │
└─────────────────────────────────┘
```

---

## 3. Componentes

### Tabelas envolvidas (nomes reais, schema `crm`)

- `crm.ad_platform_connections` — uma linha por ligação empresa × plataforma (`platform = 'meta' | 'google'`). Guarda tokens cifrados, `status` (`active`, `expired`, `disconnected`), `selected_ad_account_id`, `selected_ad_account_name`, `selected_ad_account_currency`, `last_validated_at`. **Substitui o `crm_ad_accounts` que este doc descrevia — essa tabela nunca existiu.**
- `crm.meta_campaign_snapshot`, `crm.meta_adset_snapshot`, `crm.meta_ad_snapshot` — metadados das entidades sincronizadas (o antigo `crm_campaigns` deste doc nunca existiu).
- `crm.meta_campaign_insights_daily`, `crm.meta_adset_insights_daily`, `crm.meta_ad_insights_daily` — métricas diárias. Ver `docs/features/mp-audience-dashboard.md` para colunas e unidades.
- `crm.meta_creatives` — criativos sincronizados (inclui `meta_video_id`).
- `crm.meta_campaign_strategies`, `crm.meta_campaign_diagnoses`, `crm.meta_entity_actions_log` — planos de redesenho, diagnósticos e registo de acções.

### Edge functions

| Função | Estado | Trigger | Função |
|---|---|---|---|
| `crm-meta-oauth-callback` | ✅ Produção | Redirect OAuth do browser | Trocar `code` por tokens, cifrar, guardar. |
| `crm-meta-sync-campaigns` | ✅ Produção | Botão manual | Popular `meta_campaign_snapshot`. |
| `crm-meta-sync-adsets` | ✅ Produção | Botão manual | Popular `meta_adset_snapshot`. |
| `crm-meta-sync-ads` | ✅ Produção | Botão manual | Popular `meta_ad_snapshot`. |
| `crm-meta-sync-insights` | ✅ Produção | Botão manual (incremental / histórico) | Métricas diárias dos 3 níveis, incluindo vídeo. |
| `crm-meta-sync-creatives` | ✅ Produção | Cron diário 06:00 UTC | Criativos + `meta_video_id`. |
| `crm-meta-audience-sync` | ✅ Produção | Manual | Sincronizar públicos com Custom Audiences. |
| `crm-meta-publish-execute` | ✅ Produção | Manual | Publicar plano (campanha → adsets → ads). Ver `docs/features/crm-meta-publish-flow.md`. |
| `crm-meta-campaign-redesign` / `crm-meta-campaign-strategy-generate` | ✅ Produção | Manual | Gerar planos de campanha. |
| `crm-refresh-ad-tokens` | ❌ Não implementada | — | Refresh automático de tokens (ver §4; hoje a revalidação é feita nos syncs). |
| `crm-send-conversion-event` | 🕰️ Histórico | — | CAPI de vendas de bilheteira; nunca implementada nesta forma. O CAPI em produção é o do portal (`portal_tick_lead_capture` / `portal_tick_redirect_log`, POST directo ao Graph). |
| `crm-fetch-attribution` | 🕰️ Histórico | — | Substituída pelo `crm-meta-sync-insights`. |


### Secrets (no Lovable Cloud UI)

| Secret | Estado | Fonte | Uso |
|---|---|---|---|
| `META_APP_ID` | ✅ Configurado | Meta for Developers → App → Settings | OAuth e CAPI. |
| `META_APP_SECRET` | ✅ Configurado | Meta for Developers → App → Settings | OAuth handshake e refresh. |
| `ENCRYPTION_MASTER_KEY` | ✅ Configurado | Gerar 32 bytes aleatórios, guardar fora do repo | Cifragem AES-GCM at-rest dos tokens em `crm.ad_platform_connections`. |

**Geração da `ENCRYPTION_MASTER_KEY`:**
```bash
openssl rand -base64 32
```
Guardar em gestor de passwords seguro do owner. **Perda = perda de todos os tokens cifrados** (utilizadores teriam de re-autenticar OAuth, mas sem perda de dados de campanhas/audiences).

### Permissões

| Permissão | Quem | O que permite |
|---|---|---|
| `crm.audience.view` | marketing_manager, manager, admin | Ver dashboards de público. |
| `crm.audience.export` | marketing_manager, manager, admin | Exportar para Custom Audiences Meta. |
| `crm.campaign.create` | marketing_manager, manager, admin | Criar campanhas (draft). |
| `crm.campaign.publish` | manager, admin | Publicar / pausar campanhas (gasto real). |
| `crm.campaign.set_budget` | manager, admin | Definir/alterar orçamentos. |
| `crm.attribution.view` | marketing_manager, manager, admin | Ver atribuição e ROAS. |

`marketing_manager` pode criar campanha em draft, mas só `manager`/`admin` podem publicar — segregação intencional para evitar gasto não autorizado.

---

## 4. Fluxo OAuth (alto nível)

1. **Iniciação.** Utilizador em `/crm/configuracoes/contas-ads` clica "Conectar Meta". Frontend constrói URL OAuth com `client_id=META_APP_ID`, `redirect_uri=https://<edge>/crm-meta-oauth-callback`, `state` assinado (HMAC do `company_id` + nonce + `user_id`), `scope=ads_management,ads_read,business_management`.
2. **Consentimento.** Browser vai ao Meta, utilizador autoriza.
3. **Callback.** Meta redireciona para `crm-meta-oauth-callback?code=...&state=...`.
4. **Validação `state`.** Edge valida assinatura HMAC, extrai `company_id` e `user_id`, confirma que o user pertence a essa company (via `current_company_id()` no JWT do callback).
5. **Troca de code por short-lived token.** Edge faz POST a `https://graph.facebook.com/v19.0/oauth/access_token`.
6. **Upgrade para long-lived token** (60 dias). Outra chamada com `grant_type=fb_exchange_token`.
7. **Cifrar e guardar.** Edge cifra `access_token` com AES-GCM (chave: `ENCRYPTION_MASTER_KEY`, IV aleatório por registo), guarda em `crm.ad_platform_connections` com `expires_at = now() + 60 days`.
8. **Listar ad accounts.** Edge chama `GET /me/adaccounts` para listar todas as ad accounts a que o utilizador tem acesso. Devolve para o frontend escolher qual associar a esta empresa.
9. **Confirmação.** Frontend mostra "Conectado: Conta XYZ (id: act_123)" e marca `status='active'`.

### Refresh
O cron `crm-refresh-ad-tokens` corre a cada 12h:

1. Seleciona `crm.ad_platform_connections` com `status='active'` e `expires_at < now() + 7 days`.
2. Para cada uma, decifra `access_token`, chama Meta `oauth/access_token?grant_type=fb_exchange_token`.
3. Cifra o novo token, atualiza `access_token_encrypted`, `expires_at`, `last_refreshed_at`.
4. Em caso de erro (token revogado pelo Meta), marca `status='expired'` e dispara notificação ao utilizador.

---

## 5. Pendentes (ordenados) — 🕰️ histórico, plano original de mai/2026

> Os pontos 1–3 e 6–8 estão **feitos** (app Meta criada, secrets configurados,
> OAuth e UI de contas em produção, sync de públicos e publicação a funcionar).
> A tabela fica como registo do plano original. Continua realmente em aberto:
> o refresh automático de tokens (`crm-refresh-ad-tokens`, ponto 4) e um cron
> de insights do Meta — hoje os insights dependem do botão "Sincronizar agora"
> no dashboard. O CAPI (pontos 9–10) foi resolvido por outra via: o portal faz
> POST directo ao Graph via `portal_tick_lead_capture` /
> `portal_tick_redirect_log`, e as métricas vêm do `crm-meta-sync-insights`.

| # | Tarefa | Estado |
|---|---|---|
| 1 | Criar app no Meta for Developers (Business + Advanced Access para `ads_management`) | ✅ |
| 2 | Configurar `META_APP_ID`, `META_APP_SECRET`, `ENCRYPTION_MASTER_KEY` no Lovable Cloud UI | ✅ |
| 3 | Implementar `crm-meta-oauth-callback` | ✅ |
| 4 | Implementar `crm-refresh-ad-tokens` + cron de 12h | ⏳ em aberto |
| 5 | Teste end-to-end OAuth (conectar, refrescar, revogar, reconectar) | parcial (sem refresh automático) |
| 6 | UI de contas de ads (ligar, escolher ad account, ver estado) | ✅ |
| 7 | Sync de públicos (`crm-meta-audience-sync`) | ✅ |
| 8 | Publicação de campanhas (`crm-meta-publish-execute`) | ✅ |
| 9 | CAPI de conversões | ✅ por outra via (crons do portal) |
| 10 | Leitura de métricas | ✅ via `crm-meta-sync-insights` |


> Pixel no deploy: o `crm-meta-strategy-deploy` infere o pixel da campanha-fonte (MVP Meta). Tracker canónico multi-plataforma (Google/TikTok) está em `.lovable/memory/features/multi-platform-tracking-roadmap.md` (tabela `event_trackers`).

---

## 6. Decisões fechadas

### Cifragem de tokens at-rest
Tokens OAuth da Meta **devem** ser cifrados com AES-GCM em `crm.ad_platform_connections.access_token_encrypted` e `refresh_token_encrypted`. **Não guardar em claro.** A chave é `ENCRYPTION_MASTER_KEY` (32 bytes), guardada apenas no Lovable Cloud secrets, nunca commitada.

Racional: tokens Meta dão acesso a gasto real em ads. Comprometimento da DB sem cifragem at-rest significaria potencial fraude monetária imediata.

### Long-lived tokens (60 dias)
Sempre fazer upgrade short-lived → long-lived no callback. Tokens short-lived (2h) não servem para uso server-side autónomo.

### Separação `marketing_manager` vs `manager`
`marketing_manager` desenha mas **não publica nem gasta**. Apenas `manager`/`admin` publicam campanhas. Mantém o módulo seguro para entrega a equipas de marketing terceirizadas sem expor o budget.

### Não usar Meta SDK oficial em Deno
A edge function corre em Deno (Supabase). O SDK oficial da Meta é Node-only e não compila em Deno. **Usar `fetch` direto contra `https://graph.facebook.com/v19.0`** — é o padrão recomendado pela própria Meta para CAPI e é mais leve.

---

## 7. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Token revogado pelo Meta sem aviso | Média | Alto (campanhas param) | Cron de refresh deteta `OAuthException`, marca `status='expired'`, dispara notificação no app. |
| Comprometimento de DB com tokens em claro | Baixa | Crítico (fraude monetária) | Cifragem AES-GCM at-rest com chave no Lovable secrets. |
| `state` adulterado em callback (CSRF) | Baixa | Médio (associar conta errada) | HMAC do `state` validado server-side antes de aceitar code. |
| Rate limiting Meta (200 calls/hora por user) | Média | Médio | Implementar backoff exponencial e fila assíncrona para syncs grandes. |
| Conversions API com `event_id` duplicado | Alta (race conditions) | Baixo (Meta dedupe) | Sempre enviar `event_id = transaction_id`, Meta deduplica server-side. |
| Mudança de versão Graph API (depreciação) | Alta a cada 2 anos | Alto | Pinar versão (`v19.0`) em constante única; alerta no `CLAUDE.md` quando próxima das 90 dias antes da depreciação. |

---

## 8. Troubleshooting antecipado

| Sintoma | Provável causa | Resolução |
|---|---|---|
| Callback devolve `error=access_denied` | Utilizador cancelou no Meta | Mostrar UI de "tentar novamente". |
| `OAuthException: code 190` | Token expirado/revogado | Forçar re-autenticação; marcar `status='expired'`. |
| `OAuthException: code 100` | App não tem permissão `ads_management` | Pedir Advanced Access no Meta for Developers. |
| `state` inválido no callback | Sessão expirou ou tentativa CSRF | Bloquear, log em `security_events`. |
| Sync de audience demora >60s | Audience com >1M utilizadores | Quebrar em chunks de 65k (limite Meta), enfileirar. |
| CAPI devolve `event_id` rejeitado | Formato inválido (deve ser string ≤40 chars) | Garantir `event_id = String(transaction_id)`. |

---

## 9. Histórico

- **2026-05-12** — Documento criado em estado "em construção" com plano completo. Implementação ainda não iniciada.
- **2026-08-21** — Reconciliação (Fase 5 do redesenho do dashboard): nomes de tabelas corrigidos para o schema `crm`, edge functions em produção marcadas, §5 e partes do CAPI marcadas como histórico. Dashboard passa a estar documentado em `docs/features/mp-audience-dashboard.md`.

---

## 10. Referências

- `CLAUDE.md` (raiz) §11 — secrets pendentes e estado das integrações.
- `CLAUDE.md` (raiz) §10 — permissões e roles, incluindo `marketing_manager`.
- `INTEGRATIONS.md` (raiz) — catálogo curto de integrações.
- `lovable-mcp.md` — para inspeção/debug da DB durante implementação.
- `../features/mp-audience-dashboard.md` — **fonte de verdade do dashboard** `/audience/dashboard`: tabelas de insights, unidades, sync e armadilhas.
- `meta-creatives-sync.md` — sub-integração que popula criativos sincronizados via Graph API (consumido pelo fluxo de re-design via `crm-meta-campaign-redesign`).
- [Meta for Developers — Marketing API](https://developers.facebook.com/docs/marketing-apis) — versão Graph API pinada: `v19.0`.
- [Meta Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/).
