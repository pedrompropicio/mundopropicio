# Meta Ads — integração

> Integração OAuth com Meta Business para o módulo **MP Audience**: gestão de Custom Audiences, publicação de campanhas, atribuição via Conversions API.

| | |
|---|---|
| **Status** | ⏳ Em construção |
| **Plataforma alvo** | Meta Business (Facebook + Instagram Ads) |
| **Módulo cliente** | MP Audience (CRM/Ads) |
| **Fase atual** | Pré-implementação — schema e plano definidos, secrets pendentes |
| **Última revisão** | 2026-05-12 |

> ⚠️ **Drift de documentação detetado em 2026-05-12.**
> Entre 10 e 12 de maio o módulo MP Audience evoluiu significativamente no remoto
> sem este documento ser atualizado. Verificado por inspeção do repo: a edge function
> `crm-meta-oauth-callback` está implementada (não pendente como diz §3 e §5), e
> existem ~22 edges adicionais no domínio `crm-meta-*` que este documento ainda não
> menciona. O conteúdo arquitetural abaixo (cifragem, fluxo OAuth, riscos, role
> separation) mantém-se válido como **intenção** e referência. **Sessão de
> reconciliação pendente** antes de tratar este ficheiro como fonte de verdade
> operacional.

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
│ - guarda em crm_ad_accounts  │
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

### Tabelas envolvidas
- `crm_ad_accounts` — uma linha por conta Meta conectada ao tenant. Guarda `access_token_encrypted`, `refresh_token_encrypted`, `expires_at`, `meta_ad_account_id`, `currency`, `status` (`active`, `expired`, `revoked`).
- `crm_audiences` — públicos definidos no MP Audience.
- `crm_audience_sync_log` — histórico de syncs para cada audience × ad_account (audit + retry).
- `crm_campaigns` — campanhas criadas/publicadas.
- `crm_attribution_events` — eventos de conversão enviados e atribuídos.

### Edge functions

| Função | Estado | Trigger | Função |
|---|---|---|---|
| `crm-meta-oauth-callback` | ⏳ Pendente | Redirect OAuth do browser | Trocar `code` por tokens, cifrar, guardar. |
| `crm-refresh-ad-tokens` | ⏳ Pendente | Cron a cada 12h | Refrescar tokens próximos de expirar. |
| `crm-sync-audience` | ❌ Futura | Manual ou cron diário | Sincronizar uma audience com Meta Custom Audiences. |
| `crm-publish-campaign` | ❌ Futura | Manual | Publicar campanha (objetivo, criativo, budget). |
| `crm-send-conversion-event` | ❌ Futura | Trigger pós-venda confirmada | Enviar `Purchase` via Conversions API. |
| `crm-fetch-attribution` | ❌ Futura | Cron diário | Puxar métricas e atualizar `crm_attribution_events`. |

### Secrets (no Lovable Cloud UI)

| Secret | Estado | Fonte | Uso |
|---|---|---|---|
| `META_APP_ID` | ⏳ Pendente | Meta for Developers → App → Settings | OAuth e CAPI. |
| `META_APP_SECRET` | ⏳ Pendente | Meta for Developers → App → Settings | OAuth handshake e refresh. |
| `ENCRYPTION_MASTER_KEY` | ⏳ Pendente | Gerar 32 bytes aleatórios, guardar fora do repo | Cifragem AES-GCM at-rest dos tokens em `crm_ad_accounts`. |

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
7. **Cifrar e guardar.** Edge cifra `access_token` com AES-GCM (chave: `ENCRYPTION_MASTER_KEY`, IV aleatório por registo), guarda em `crm_ad_accounts` com `expires_at = now() + 60 days`.
8. **Listar ad accounts.** Edge chama `GET /me/adaccounts` para listar todas as ad accounts a que o utilizador tem acesso. Devolve para o frontend escolher qual associar a esta empresa.
9. **Confirmação.** Frontend mostra "Conectado: Conta XYZ (id: act_123)" e marca `status='active'`.

### Refresh
O cron `crm-refresh-ad-tokens` corre a cada 12h:

1. Seleciona `crm_ad_accounts` com `status='active'` e `expires_at < now() + 7 days`.
2. Para cada uma, decifra `access_token`, chama Meta `oauth/access_token?grant_type=fb_exchange_token`.
3. Cifra o novo token, atualiza `access_token_encrypted`, `expires_at`, `last_refreshed_at`.
4. Em caso de erro (token revogado pelo Meta), marca `status='expired'` e dispara notificação ao utilizador.

---

## 5. Pendentes (ordenados)

| # | Tarefa | Bloqueador? |
|---|---|---|
| 1 | Criar app no Meta for Developers (Business + Advanced Access para `ads_management`) | Sim — sem isto não há `META_APP_ID` |
| 2 | Configurar `META_APP_ID`, `META_APP_SECRET`, `ENCRYPTION_MASTER_KEY` no Lovable Cloud UI | Sim |
| 3 | Implementar `crm-meta-oauth-callback` (Claude Code → push) | Sim |
| 4 | Implementar `crm-refresh-ad-tokens` + cron de 12h | Sim |
| 5 | Teste end-to-end OAuth (conectar, refrescar, revogar, reconectar) | Sim |
| 6 | Implementar UI `/crm/configuracoes/contas-ads` (ligar, escolher ad account, ver estado) | Não — pode ser feito no Lovable em paralelo |
| 7 | Implementar `crm-sync-audience` | Não |
| 8 | Implementar `crm-publish-campaign` | Não |
| 9 | Implementar `crm-send-conversion-event` (CAPI) | Não |
| 10 | Implementar `crm-fetch-attribution` | Não |

> Pixel no deploy: o `crm-meta-strategy-deploy` infere o pixel da campanha-fonte (MVP Meta). Tracker canónico multi-plataforma (Google/TikTok) está em `.lovable/memory/features/multi-platform-tracking-roadmap.md` (tabela `event_trackers`).

---

## 6. Decisões fechadas

### Cifragem de tokens at-rest
Tokens OAuth da Meta **devem** ser cifrados com AES-GCM em `crm_ad_accounts.access_token_encrypted` e `refresh_token_encrypted`. **Não guardar em claro.** A chave é `ENCRYPTION_MASTER_KEY` (32 bytes), guardada apenas no Lovable Cloud secrets, nunca commitada.

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

---

## 10. Referências

- `CLAUDE.md` (raiz) §11 — secrets pendentes e estado das integrações.
- `CLAUDE.md` (raiz) §10 — permissões e roles, incluindo `marketing_manager`.
- `INTEGRATIONS.md` (raiz) — catálogo curto de integrações.
- `lovable-mcp.md` — para inspeção/debug da DB durante implementação.
- `meta-creatives-sync.md` — sub-integração que popula criativos sincronizados via Graph API (consumido pelo fluxo de re-design via `crm-meta-campaign-redesign`).
- [Meta for Developers — Marketing API](https://developers.facebook.com/docs/marketing-apis) — versão Graph API pinada: `v19.0`.
- [Meta Conversions API](https://developers.facebook.com/docs/marketing-api/conversions-api/).
