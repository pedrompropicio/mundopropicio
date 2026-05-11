
# Inventário CRM-Meta — estado atual

## 1. Edge functions `crm-meta-*` (15)

**OAuth & ligação**
- `crm-meta-oauth-callback` — redirect handler do OAuth Meta; troca code → token long-lived, regista BMs.
- `crm-meta-fetch-ad-accounts` — `{connection_id}` → lê `/me/adaccounts`, persiste em `ad_platform_connections` + sincroniza `ad_platform_account_links`.
- `crm-meta-fetch-pages` — `{connection_id}` → Pages do user + IG business account associado.
- `crm-meta-pixel-health` — `{connection_id, ad_account_id}` → estado dos pixels da conta (eventos, last fired).

**Sync de dados Meta → DB**
- `crm-meta-sync-campaigns` — `{connection_id, ad_account_id}` → GET `/act_X/campaigns` e UPSERT em `meta_campaign_snapshot`. Faz auto-link a eventos.
- `crm-meta-sync-insights` — `{connection_id, ad_account_id, days_back?}` → GET `/insights` por campanha por dia, UPSERT em `meta_campaign_insights_daily` (omni_purchase, ROAS, CPM, CTR, frequency, etc.).

**Análise / IA (read-only)**
- `crm-meta-campaign-analyze` — `{campaign_id, from?, to?, days_back?}` → lê `meta_campaign_snapshot` + `meta_campaign_insights_daily` da BD e devolve análise IA (não persiste). Já foi corrigido o off-by-one hoje.
- `crm-meta-creative-analyze` — `{creative_id}` → análise IA de imagem (Lovable Gateway) ou vídeo (Gemini direto); persiste em `meta_creatives.analysis_jsonb`.
- `crm-meta-audience-blueprints` — `{connection_id, ad_account_id, min_roas?, days_back?}` → top campanhas por ROAS + summarize de targeting de cada adset (read-only do Meta).
- `crm-meta-audience-coach` — chama `/adsets`, `/insights`, `/search` para sugestões de audiência (read-only).
- `crm-meta-interest-search` — `{query}` → wrapper Graph `/search` (interesses) + `reachestimate`.
- `crm-meta-list-custom-audiences` — `{ad_account_id}` → custom audiences da conta.

**Geração / deploy de estratégias**
- `crm-meta-campaign-strategy-generate` — gera plano completo via Lovable AI (Gemini 2.5 Flash) e persiste em `meta_campaign_strategies` com `status='generated'`.
- `crm-meta-strategy-deploy` — `{strategy_id}` → cria Campaigns + AdSets + AdCreatives + Ads no Meta via Marketing API, **tudo PAUSED**. Persiste em `meta_campaign_strategy_deployments`.
- `crm-meta-deployment-toggle` — `{deployment_id, target_status}` → muda estado (ACTIVE/PAUSED) de tudo o que foi deployado, com toggle_log.

## 2. Tabelas do schema `crm` (Live)

| Tabela | Cols | Pol | Foco |
|---|---|---|---|
| `ad_manager_audit_log` (+ partições 2026_05/06/07) | 11 | 2 | (auditoria — fora de scope) |
| `ad_platform_connections` | 21 | 4 | OAuth tokens cifrados, ad accounts disponíveis |
| `ad_platform_account_links` | 11 | 2 | Liga connection ↔ ad_account, primary/enabled |
| `meta_campaign_snapshot` | 23 | 4 | **Campanhas sincronizadas** |
| `meta_campaign_insights_daily` | 31 | 4 | **Insights diários por campanha** |
| `meta_campaign_strategies` | 27 | 4 | Estratégias geradas pela IA |
| `meta_campaign_strategy_deployments` | 19 | 4 | Resultado do deploy ao Meta |
| `meta_creatives` | 27 | 5 | Criativos (imagem/vídeo) + análise IA |
| `meta_strategy_creatives` | 8 | 5 | Bridge strategy ↔ creative |
| `oauth_states`, `role_budget_limits` | — | — | (fora de scope) |

**Colunas relevantes:**

- `meta_campaign_snapshot`: `external_campaign_id`, `name`, `status`, `effective_status`, `objective`, `daily_budget_cents`, `lifetime_budget_cents`, `budget_remaining_cents`, `start_time`, `stop_time`, `buying_type`, `bid_strategy`, `linked_event_id`, `currency`, `raw` (jsonb completo), `last_synced_at`.
- `meta_campaign_insights_daily`: `external_campaign_id`, `date_start`/`date_stop`, `impressions`, `reach`, `frequency`, `clicks`, `unique_clicks`, `spend_cents`, `cpc/cpm/cpp_cents`, `ctr`, `unique_ctr`, `purchases_count`, `purchases_value_cents`, `leads_count`, `add_to_cart_count`, `initiate_checkout_count`, `view_content_count`, `roas`, `actions/action_values/raw` (jsonb).
- `meta_campaign_strategies`: ~27 colunas — input do utilizador, `generated_plan` (jsonb), `status` (`generated`/...), `connection_id`, `ad_account_id`, `company_id`.
- `meta_campaign_strategy_deployments`: liga strategy ↔ IDs reais criados no Meta, `current_status`, `toggle_log`.

**Não existe** tabela para adsets nem ads sincronizados (snapshot é só ao nível campanha).

## 3. Já lemos campanhas Meta?

Sim — várias funções batem na Marketing API:

- **Listar campanhas de um ad_account:** `crm-meta-sync-campaigns` (persistente, `meta_campaign_snapshot`) e `crm-meta-pixel-health`/`crm-meta-campaign-strategy-generate` (efémero, só leitura).
- **Listar adsets de uma campanha:** sim, mas só **em memória** dentro de `crm-meta-audience-blueprints`, `crm-meta-audience-coach` e `crm-meta-campaign-strategy-generate`. **Não persiste em DB.**
- **Listar ads de um adset:** **não existe**. Só são criados via `crm-meta-strategy-deploy`. Não há sync.
- **Insights:** `crm-meta-sync-insights` puxa **só ao nível campanha** (não adset, não ad), com `time_increment=1`, métricas completas (CPM, CPA via purchases, CTR, ROAS, frequency, impressions, reach, leads, ATC, IC, VC). Persiste em `meta_campaign_insights_daily`.
- **Cron:** não verifiquei agendamento, mas `last_synced_at` sugere que o sync corre on-demand (botão "Sincronizar" no dashboard).

## 4. Frontend (`src/pages/crm/`)

| Página | Rota | Acção |
|---|---|---|
| `Connections.tsx` | `/audience/connections` | Conectar Meta (OAuth), gerir ad accounts |
| `AdAccounts.tsx`, `Pixels.tsx`, `Setup.tsx` | setup | Configuração read+write de connection settings |
| `Campaigns.tsx` | `/audience/dashboard` | **Read-only**: tabela de campanhas + insights + botão "Analisar com IA" → chama `crm-meta-campaign-analyze` (Sheet com resultado, sem persistir) |
| `Insights.tsx` | `/audience/insights` | Read-only de métricas |
| `Strategies.tsx` + `StrategyNew.tsx` + `StrategyView.tsx` + `StrategyPrint.tsx` | `/audience/strategies` | **Write**: criar estratégia do zero, ver plano gerado, imprimir |
| `Creatives.tsx` + `CreativeNew.tsx` + `CreativeView.tsx` | `/audience/creatives` | **Write**: upload de criativos, análise IA |
| `AudiencePrint.tsx` | print | Export PDF de audience coach |

Pausar/ativar campanhas existentes só está disponível via `crm-meta-deployment-toggle` (e só para campanhas criadas pelo nosso deploy, não para campanhas legacy do Ads Manager).

## 5. Estratégias — fluxo end-to-end?

**Sim, está completo:**

1. Utilizador preenche brief em `StrategyNew.tsx` (objetivo, evento, budget, etc.).
2. Frontend chama `crm-meta-campaign-strategy-generate` → IA gera plano completo, persiste em `meta_campaign_strategies` (`status='generated'`, `generated_plan` jsonb com campaigns/adsets/ads/creatives).
3. `StrategyView.tsx` mostra o plano e tem CTA "Deploy" → chama `crm-meta-strategy-deploy` → cria tudo no Meta em PAUSED, regista em `meta_campaign_strategy_deployments`.
4. `crm-meta-deployment-toggle` permite ativar/pausar tudo o que foi deployado.

## Gaps vs Nível 1 (diagnóstico) e Nível 2 (re-design)

**Nível 1 — diagnóstico de campanha existente**
- ✅ Já existe `crm-meta-campaign-analyze` que devolve análise + issues + sugestões para uma campanha.
- ❌ Análise hoje é **só ao nível campanha**: não consulta adsets nem ads individuais, nem os respectivos insights. Para um relatório sério ("este adset está a sangrar dinheiro", "este ad tem CTR 3x abaixo do irmão") falta sincronizar e analisar adsets/ads.
- ❌ Não há tabelas `meta_adset_snapshot` / `meta_ad_snapshot` / insights por adset ou ad. Sem isto, breakdown granular é impossível sem ir ao Meta em runtime.
- ❌ A análise IA não é persistida — cada clique re-gera (pode ser intencional, mas perde-se histórico de issues e da evolução).
- ⚠️ Análise não cruza com criativos: `meta_creatives.analysis_jsonb` existe mas não é usado dentro de `crm-meta-campaign-analyze`.

**Nível 2 — re-design (gerar variante optimizada PAUSED a partir de campanha existente)**
- ❌ Não existe nenhuma função `crm-meta-campaign-redesign` (ou similar). `crm-meta-campaign-strategy-generate` parte sempre de um brief novo, não de uma campanha real existente como input.
- ❌ Não há ponte "campanha existente + insights → strategy". Para re-design seria preciso: (a) ler campanha + adsets + ads + insights + creatives da DB, (b) passar isso à IA como contexto, (c) gerar nova `meta_campaign_strategies` row com `source_campaign_id`, (d) reutilizar `crm-meta-strategy-deploy` (que já cria tudo PAUSED — bom).
- ❌ `meta_campaign_strategies` não tem coluna `source_campaign_id` nem `parent_strategy_id` para versionar re-designs.
- ❌ UI: não há entry-point em `Campaigns.tsx` para "Re-desenhar esta campanha" (só existe "Analisar com IA").

**Sumário acionável**
1. Para Nível 1 robusto: criar `crm-meta-sync-adsets` + `crm-meta-sync-ads` + tabelas `meta_adset_snapshot`/`meta_ad_snapshot` + insights granulares; estender `crm-meta-campaign-analyze` para consumir esse detalhe e cruzar com `meta_creatives.analysis_jsonb`.
2. Para Nível 2: adicionar coluna `source_campaign_id` em `meta_campaign_strategies` + nova edge function `crm-meta-campaign-redesign` (lê snapshot + insights + creatives → IA → cria strategy) + botão na UI; reutilizar `crm-meta-strategy-deploy` tal como está.

---

**Próximo passo sugerido:** confirmares qual destes dois níveis queres atacar primeiro (ou ambos em paralelo), e eu desenho um plano de implementação detalhado para esse scope.
