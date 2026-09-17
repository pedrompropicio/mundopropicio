# ESTADO — MP Audience · Meta

Atualizado: 2026-09-17 · Issues desta frente: #36, #94, #12, #183 · dependência externa: #197 (ticketing-e-receita)

## Em que pé está
- **Sync Meta a funcionar** na conta `act_5094207367314169` (EUR). Insights ao nível de campanha de hora a hora (cron `crm-meta-insights-hourly`, :40). Verificado em Live a 17/09/2026.
- **Ligações Meta (17/09/2026):** Mundo Propício `active`, token até 08/10/2026 · Litto Lins `active` (conta do artista, `connection_scope = 'artist'`, `act_323668247351618`), token até 13/11/2026 · Fortal e Siriguella marcadas `expired` a 17/09/2026 por decisão do Pedro: não estão à venda, o token expirou a 22/08 e continuavam `active`, com o cron a falhar de hora a hora. Reconectar por OAuth quando voltarem à venda.
- **Regra de ROAS fechada — D-ERP81.** Eventos sem compra alimentada pelo pixel (Ticketline, BOL): bruto é o oficial, marginal decide a verba, incremental só em estudo ou teste por cidades, atribuído fica dentro do MP Audience. Evento com pixel e Purchase com `fbc`: o atribuído passa a ser o ROAS oficial desse evento.
- **Relatório de tráfego pago × vendas refeito sobre as fontes certas** (PROC-relatorio-trafego-semanal.md reescrito a 17/09/2026). Primeiro relatório no modelo novo entregue ao gestor de tráfego: Simone Mendes e Raphael Ghanem, 10–16 set, 6 páginas.
- **Diagnóstico P0 em produção** (`crm.campaign_diagnosis_360`, edge function `crm-campaign-diagnosis`, "Diagnóstico & Decisão" no CampaignView), mas **sem uso recente: o último diagnóstico gravado é de 07/07/2026** (65 linhas no total, verificado a 17/09).
- **#36 fechada (17/09/2026) — a ligação Meta já não morre em silêncio.** Helper partilhado `_shared/meta-connection-health.ts` usado pelas cinco edge functions de sync: erro de autenticação (190/OAuthException) marca a ligação `expired` à primeira, erro transitório só conta falhas e marca `error` à 6.ª seguida, sucesso zera o contador e grava `last_validated_at`. No dashboard, o "Live" verde só aparece com ligação `active` e insights com menos de 48h; há banner persistente de ligação em falha e aviso âmbar a 7 dias da expiração do token. Sem DDL, sem mexer em crons. Regra completa em `.lovable/memory/features/mp-audience-connection-health.md`.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
Decidir com o Pedro, por esta ordem: (1) #94 — pôr o cron horário a sincronizar também `adset` (DDL/cron em Live, carece de autorização); (2) #36 — propagar o erro de sync para `ad_platform_connections` e para a UI, antes de o token da Mundo Propício expirar a 08/10/2026; (3) desenhar o teste por cidades do Raphael Ghanem para medir o ROAS incremental (D-ERP81).

## Bloqueios
- **#94 (P1)** — o cron só pede `level = campaign`. A 17/09/2026 os insights de conjunto e de anúncio estavam parados desde 16/09 15:06 UTC (último sync manual), com os de campanha às 16:40 UTC do próprio dia.
- **#36 (P1)** — erros de sync só se escrevem em `crm.meta_sync_state`; `ad_platform_connections` fica `active`. Foi o que aconteceu com Fortal e Siriguella. A #76 está fechada, mas nada marca sozinho uma ligação expirada: a correção de 17/09 foi manual.
- **Elo 4 partido** — o pixel da Ticketline não propaga `fbc` no Purchase. Medido a 17/09: Simone Mendes, 10–16 set, 2.962 inícios de checkout para 77 compras atribuídas. Elos 1–3 provados. Depende da Ticketline (Luísa Rodrigues).
- **#197 (ticketing-e-receita)** — `vw_event_daily_sales` perdeu o histórico de 8 eventos desde a v2.41. Enquanto estiver aberta, esta frente lê vendas só por `get_daily_sales_series`.

## Por confirmar (herdado de 29/08, não reverificado a 17/09)
- As 3 posturas restantes (escalar / cirúrgica / novo desenho) aparecem como "Em breve" na UI, com as edge functions já deployadas.
- Customer Match "Compradores Geral Ticketline Jun2026" (5.933 membros) carregada; Fase 2 pendente.
- Rótulo de última sync "há 20/27 dias": o cabeçalho de `src/pages/crm/Campaigns.tsx` lê `max(last_synced_at)` dos insights e está fresco; as datas batem com `last_synced_at` dos espelhos de estrutura (`meta_campaign_snapshot` 27/08, `meta_ad_snapshot` 21/08), que só avançam quando o objeto muda na Meta ou num sync completo (último a 01/09). Falta identificar o ecrã onde o rótulo foi visto.

## Factos que não se reinvestigam
- Ad account `act_5094207367314169` (EUR). Connection id `3c234235-0ac5-4afc-a06e-259bdea0ae7a`.
- **`ticket_sales` é agregada** — atribuição venda→clique impossível; o caminho é lead→conversão.
- **Vendas por dia: só `get_daily_sales_series`. Ocupação: só `event_zone_capacities` (`released`, zonas da última observação) ou `get_event_capacity_quality()`.** Nunca `ticket_sales ÷ event_ticket_zones.total_capacity` nem `bilheteira_zone_snapshots`. `occupied` inclui convites e reservas, é sempre maior que vendidos. Origem: estado-ticketing-e-receita.md.
- **Investimento por evento liga-se por `linked_event_id`** (Meta: `crm.meta_campaign_snapshot`; Google: `crm.google_campaign`), com `coalesce(parent_event_id, id) = tour`. Não por nome da campanha: o `ILIKE` apanha tours antigas do mesmo artista.
- A campanha Meta da Simone Mendes 2026 é única para Lisboa e Porto e está ligada ao evento-pai: o investimento Meta não se reparte por cidade.
- Raphael Ghanem Tour 2027: Coimbra e Sta M. Feira vendem na BOL; as outras 8 cidades na Ticketline.
- Os crons Meta (`crm-meta-insights-hourly`, `crm-meta-sync-creatives`) só percorrem ligações com `status = 'active'`.
- Fronteira bom/fraco = **60% do ROAS-alvo** (~4,8× num alvo de 8×). "Morta" só quando `projected_baseline_roas ≈ 0`.
- Design P0: **o LLM só escreve linguagem**; o determinístico decide diagnóstico, projeção, classificação e feasibility. Re-runs dão resultado idêntico.
- A edge function de redesign é **estocástica** (Gemini) — uma corrida não generaliza.
- Meta Graph API **não expõe URLs MP4** source para ad assets (política, não permissão).

## Onde ler mais
- `docs/DECISIONS.md` — D-ERP81 (ROAS), D-ERP57 (contas de tráfego do artista)
- `docs/procedimentos/PROC-relatorio-trafego-semanal.md`
- `.lovable/memory/features/audience-unified-paid-dashboard.md`, `elo-publicacao-fase3-ativacao.md`, `mp-audience-*.md`
- `docs/features/crm-meta-publish-flow.md`
