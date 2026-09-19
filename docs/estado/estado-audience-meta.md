# ESTADO — MP Audience · Meta

Atualizado: 2026-09-19 · Issues desta frente: #36, #12, #183 · dependência externa: #197 (ticketing-e-receita)

## Em que pé está
- **Motor único de campanhas — F1 fundações fechada (19/09, D-ERP95).** `crm.meta_publish_plan` aceita agora evento XOR artista+música (`artist_id`, `song_id`, `connection_id`; `event_id` anulável e pela primeira vez com FK verdadeira). Trigger garante que alvo música só usa connection de artista do mesmo artista/empresa. Só schema — comportamento para evento inalterado; o alvo música entra na F2/F3.
- **Sync Meta a funcionar** na conta `act_5094207367314169` (EUR). O cron `crm-meta-insights-hourly` (:40) sincroniza `campaign` e `adset` desde 17/09/2026 18:40 UTC (#94 fechada): gasto por conjunto = gasto por campanha em 14, 15 e 16/09, verificado em Live. O nível `ad` continua só por sync manual.
- **Sync Meta a funcionar** na conta `act_5094207367314169` (EUR). O cron `crm-meta-insights-hourly` (:40) sincroniza `campaign` e `adset` desde 17/09/2026 18:40 UTC (#94 fechada): gasto por conjunto = gasto por campanha em 14, 15 e 16/09, verificado em Live. O nível `ad` continua só por sync manual.
- **Ligações Meta (17/09/2026):** Mundo Propício `active`, token até 08/10/2026 · Litto Lins `active` (conta do artista, `connection_scope = 'artist'`, `act_323668247351618`), token até 13/11/2026 · Fortal e Siriguella marcadas `expired` a 17/09/2026 por decisão do Pedro: não estão à venda, o token expirou a 22/08 e continuavam `active`, com o cron a falhar de hora a hora. Reconectar por OAuth quando voltarem à venda.
- **Regra de ROAS fechada — D-ERP81.** Eventos sem compra alimentada pelo pixel (Ticketline, BOL): bruto é o oficial, marginal decide a verba, incremental só em estudo ou teste por cidades, atribuído fica dentro do MP Audience. Evento com pixel e Purchase com `fbc`: o atribuído passa a ser o ROAS oficial desse evento.
- **Relatório de tráfego pago × vendas refeito sobre as fontes certas** (PROC-relatorio-trafego-semanal.md reescrito a 17/09/2026). Primeiro relatório no modelo novo entregue ao gestor de tráfego: Simone Mendes e Raphael Ghanem, 10–16 set, 6 páginas.
- **Diagnóstico P0 em produção** (`crm.campaign_diagnosis_360`, edge function `crm-campaign-diagnosis`, "Diagnóstico & Decisão" no CampaignView), mas **sem uso recente: o último diagnóstico gravado é de 07/07/2026** (65 linhas no total, verificado a 17/09).
- **Saúde da ligação (#36) em produção no backend desde 17/09/2026 18:06 UTC:** as 5 edge functions de sync Meta escrevem em `crm.ad_platform_connections` (erro de autenticação → `expired` imediato; 6 falhas transitórias seguidas → `error`; sucesso repõe `consecutive_failures` e `last_validated_at`). Caminho de sucesso provado na corrida das 18:40 (Mundo Propício e Litto Lins com `last_validated_at` de 17/09). A parte de ecrã (Live condicionado, banner, aviso de token a 7 dias) está à espera de Publish. Ver `.lovable/memory/features/mp-audience-connection-health.md`.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
(1) Publish do Pedro para a UI da #36 e conferência no dashboard; (2) desenhar o teste por cidades do Raphael Ghanem para medir o ROAS incremental (D-ERP81); (3) observar o caminho de erro da #36 em Live (primeira falha real ou teste controlado) e fechar a issue.

## Bloqueios
- **#36 (P1)** — backend em produção, UI por publicar, caminho de erro ainda não observado em Live. O token da Mundo Propício expira a 08/10/2026.
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

## Actualização 19/09/2026 — F2a do motor único (D-ERP95)
- Migração `20260919105937` em Live: `artist_songs.smart_link_url`, `design_id` do plano Meta só obrigatório no alvo evento, e 9 RPCs `artist_ads_*` (tetos de orçamento, lista/detalhe de planos de música, posts promovíveis, smart link, criar/editar plano). Escrita exige sessão + papel admin/manager/marketing_manager; nenhuma acessível a anon.
- `crm-meta-publish-execute` deployada: `dry_run` (default TRUE, inalterado) passa a ser permitido em qualquer estado do plano e devolve `ok:true`; plano de música devolve `alvo_musica_f2b`. O caminho real de publicação não mudou.
- Por fazer (F2b): publicação do alvo música, post existente, naming, UTMs, lock, activação.

## Actualização 19/09/2026 — F2b do motor único (D-ERP95)

O motor passa a publicar campanhas de música na Meta, com o mesmo código que publica
eventos: um resolvedor único decide se o alvo é um evento ou um artista+música e
devolve a conta de anúncios, a página, o Instagram e os nomes a usar. Para música não
há pixel nem conversões — só notoriedade, tráfego ou visualizações. Publicar exige
sessão com papel de tráfego e um teto de orçamento definido para a conta: sem teto, o
motor recusa. As campanhas nascem sempre em pausa e ficam desde logo ligadas à música
(e trancadas), sem esperar pela varredura diária. Há um novo modo de verificação prévia
que só lê da Meta e devolve uma lista de confirmações (token, conta, moeda, página,
Instagram, publicações promovíveis, teto). A activação de campanhas de música fica para
a fase seguinte. O caminho dos eventos não mudou.

## Actualização 19/09/2026 — F3 do motor único (D-ERP95)

Já é possível ligar (e desligar) campanhas de música pelo sistema, e ligar passou a ser
uma aprovação registada: só um administrador pode ligar, pode deixar uma nota, e fica
guardado quem aprovou, quando e o resultado — inclusive quando corre mal a meio. Pausar
continua ao alcance de quem gere tráfego, porque pausar é sempre seguro. Antes de ligar,
o sistema confirma o teto de gasto diário da conta: sem teto definido não liga, e se o
pedido somado ao que já está a gastar passar do teto também não liga. O teto só pode ser
definido ou retirado por um administrador e todas as mudanças ficam num histórico.
Fechou-se também a porta lateral: mexer directamente numa campanha de artista para a ligar
ou aumentar o orçamento exige administrador e passa pelo mesmo teto quando a campanha foi
criada pelo sistema. As campanhas do gestor de tráfego externo continuam a poder ser
geridas como antes. A verificação prévia passou a avisar quando falta o país.
O caminho dos eventos e das contas da empresa não mudou.
