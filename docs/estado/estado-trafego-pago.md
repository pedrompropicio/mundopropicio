# ESTADO — 8 · Tráfego Pago

## Estado e alcance da evidência

Estado único da frente 8, consolidado na #319 (Lote #473). Reúne os dois estados anteriores completos quanto à informação técnica útil; ambos tinham cabeçalho de 19/09/2026, mas continham adendas até 26/09 (Meta) e 13/10 (Google). As datas, estados de ligações, tokens, syncs, contagens e alegações de produção abaixo são **evidência histórica datada, não reverificada nesta consolidação**. Não comprovam acesso, cron, publicação ou deploy atuais. Implementação descrita, publicação registada e comprovação datada são coisas distintas; “deployada” não prova que o ecrã foi publicado.

## A trabalhar agora

Preparação documental da #319 para revisão manual do 0 · Cowork (ChatGPT). Os dois estados declaravam “Nada em execução”; isso não comprova a ausência de trabalho atual nas Issues. Nenhum anúncio, integração, dado, cron ou configuração é alterado por esta preparação.

## Próximo passo e bloqueios

- Rever esta consolidação e os checks locais antes de integrar; sem merge automático. A base local é `8494d581cec6e08a46b43e65332c281b12cb23c1`; o despacho indica CI [41393242181](https://github.com/pedrompropicio/mundopropicio/actions/runs/41393242181) com sucesso, sem reconsulta nesta execução local.
- Manter como pendentes herdados #36 (UI/publicação e prova do caminho de erro), teste incremental por cidades (D-ERP81), #197 (dependência do 3) e Customer Match/Fase 2. Os detalhes e as datas constam nas secções de plataforma; não se fecha nenhuma destas Issues por documentação.
- #62, #69, #70, Elo 4/fbc e filas/conversões continuam referenciados para explicar o impacto em campanhas; tracking, atribuição e envios pertencem ao 9, sem transferência de pendências. Desbloqueio account-side do 403 e valor por lead estavam atribuídos ao Pedro.
- [QUADRO, secção 8](../QUADRO.md#8--tráfego-pago): continua **pendente** confirmar que nenhum público do Coala está partilhado com contas ou campanhas da MP e reportar ao jurídico. Esta execução não verifica a ausência de cruzamento.

## Fronteira e invariantes

- [D-ERP278/279](../DECISIONS.md#d-erp279--responsabilidades-do-8-tráfego-pago-e-do-9-crm-portal-e-leads-15102026): Ads, campanhas, segmentação, públicos, criativos, orçamento, métricas de investimento e investimento × vendas de Meta, Google Ads e TikTok são do 8. O 8 define necessidades de medição e valida o impacto nas campanhas. Contactos, leads, tracking/Pixel/CAPI, consentimento, atribuição, qualidade dos eventos e filas/funções de envio são do 9. Os portais tratam o tracking do próprio site; a infraestrutura de envio é do 9. O plano Portal MP/Ghanem fica no 9. Publicação, ativação e alteração de campanhas/orçamentos exigem autorização expressa do Pedro; Publish/crons ficam com o 0 conforme as decisões aplicáveis.
- [D-ERP335](../DECISIONS.md#d-erp335--dados-do-coala-cloudscape-responsável-mp-subcontratante-segunda-caixa-eventos-da-mp-preparada-e-adiada-28102026): Cloudscape é responsável pelos dados do Coala; MP é subcontratante, sem responsabilidade conjunta. Públicos do Coala (listas, lookalikes, retargeting de leads/compradores) só em campanhas Coala na conta Cloudscape. Sem novo consentimento, não usar esses dados para comunicações, públicos/lookalikes ou cruzamentos para fins de outros eventos da MP. Comunicações identificam Coala/Cloudscape. Não usar caixa conjunta Coala+MP. A segunda caixa opcional, desmarcada, só para novas inscrições, foi preparada e adiada, não aplicada na edição 2027; exige acordo de partilha, aprovação escrita dos sócios e política atualizada; não reaproveita a lista atual. O acordo de subcontratação continua a cargo do jurídico.
- Não se alteram regras de menores nem decisões fiscais. Aplicam-se as decisões de origem, incluindo D-ERP312/314 e D-ERP31/248/290 em [DECISIONS](../DECISIONS.md).

## Contradições e comprovação pendente

- Google: a fonte declara sync manual e cron rejeitado, mas a adenda de vídeo menciona cron 242 de 3h e propõe outro cron. Não há prova de resolução nesse estado: manter a distinção de escopos e confirmar a decisão/catálogo antes de afirmar a cadência atual ou criar qualquer cron.
- Meta: F1/F2a apresentam F2b/F3 como futuras; as adendas de 19/09 registam depois implementação F2b/F3. Preserva-se a sequência, sem tratar o “por fazer” de F2a como prova de falta atual nem inferir publicação da UI.
- O registo Meta de 17/09 diz nível `ad` só manual; [INDEX](../INDEX.md) descreve posteriormente insights nos três níveis e outros jobs. Não se escolhe uma cadência atual sem comprovação datada.
- A depreciação do smart link em 26/09 regista leitores backend por corrigir; o INDEX descreve `song_links` como fonte única. Falta prova de resolução dos leitores remanescentes: não declarar a migração concluída.
- O título “a funcionar” nos registos abaixo descreve apenas a observação original. Validades de tokens (incluindo 08/10 já passado), datas de última sync e diagnósticos não são revalidados aqui.

## Meta — registo técnico herdado

Issues da fonte: #36, #12, #183; dependência externa #197 (3 · Ticketing e Receita). Tudo nesta secção conserva o alcance temporal do registo original.

### Implementação e evidência registadas
- **Várias contas Meta por artista (24/09, D-ERP143).** Uma ligação por conta de anúncios, token partilhado e propagado no OAuth. Litto: CA 1 [conta Meta identificada na fonte original] (leitura, gestor externo) + conta [MP] [conta Meta identificada na fonte original] (EUR) a acrescentar pelo Pedro via `artist-ads-meta-add-account`; teto definido pelo Pedro.
- **Ligação Meta de empresa vê contas de todos os BMs (23/09, #250).** `crm-meta-fetch-ad-accounts` deixou de filtrar pelo BM guardado e pagina; escolher a conta grava o BM dessa conta em `external_business_id`. Função deployada; ecrã à espera de Publish. Ligações existentes (Mundo Propício, Litto Lins) intactas.
- **Proposta de plano por LLM no alvo música (19/09, D-ERP98).** `artist-ads-strategy-generate` propõe campanha/conjuntos/anúncios para uma música a partir do snapshot da música, do último relatório de lançamento, das publicações promovíveis e do histórico de tráfego de 30 dias. Corre com a sessão do utilizador, valida por `artist_ads_plan_validate` e grava por `artist_ads_plan_create` — o plano nasce em `rascunho` e nada vai para a Meta. Sem DDL: a justificação fica em `plano.resumo`.
- **Motor único de campanhas — F1 fundações fechada (19/09, D-ERP95).** `crm.meta_publish_plan` aceita agora evento XOR artista+música (`artist_id`, `song_id`, `connection_id`; `event_id` anulável e pela primeira vez com FK verdadeira). Trigger garante que alvo música só usa connection de artista do mesmo artista/empresa. Só schema — comportamento para evento inalterado; o alvo música entra na F2/F3.
- **Sync Meta a funcionar** na conta `[conta Meta identificada na fonte original]` (EUR). O cron `crm-meta-insights-hourly` (:40) sincroniza `campaign` e `adset` desde 17/09/2026 18:40 UTC (#94 fechada): gasto por conjunto = gasto por campanha em 14, 15 e 16/09, verificado em Live. O nível `ad` continua só por sync manual.
- **Ligações Meta (17/09/2026):** Mundo Propício `active`, token até 08/10/2026 · Litto Lins `active` (conta do artista, `connection_scope = 'artist'`, `[conta Meta identificada na fonte original]`), token até 13/11/2026 · Fortal e Siriguella marcadas `expired` a 17/09/2026 por decisão do Pedro: não estão à venda, o token expirou a 22/08 e continuavam `active`, com o cron a falhar de hora a hora. Reconectar por OAuth quando voltarem à venda.
- **Regra de ROAS fechada — D-ERP81.** Eventos sem compra alimentada pelo pixel (Ticketline, BOL): bruto é o oficial, marginal decide a verba, incremental só em estudo ou teste por cidades, atribuído fica dentro do MP Audience. Evento com pixel e Purchase com `fbc`: o atribuído passa a ser o ROAS oficial desse evento.
- **Relatório de tráfego pago × vendas refeito sobre as fontes certas** (PROC-relatorio-trafego-semanal.md reescrito a 17/09/2026). Primeiro relatório no modelo novo entregue ao gestor de tráfego: Simone Mendes e Raphael Ghanem, 10–16 set, 6 páginas.
- **Diagnóstico P0 em produção** (`crm.campaign_diagnosis_360`, edge function `crm-campaign-diagnosis`, "Diagnóstico & Decisão" no CampaignView), mas **sem uso recente: o último diagnóstico gravado é de 07/07/2026** (65 linhas no total, verificado a 17/09).
- **Saúde da ligação (#36) em produção no backend desde 17/09/2026 18:06 UTC:** as 5 edge functions de sync Meta escrevem em `crm.ad_platform_connections` (erro de autenticação → `expired` imediato; 6 falhas transitórias seguidas → `error`; sucesso repõe `consecutive_failures` e `last_validated_at`). Caminho de sucesso provado na corrida das 18:40 (Mundo Propício e Litto Lins com `last_validated_at` de 17/09). A parte de ecrã (Live condicionado, banner, aviso de token a 7 dias) está à espera de Publish. Ver `.lovable/memory/features/mp-audience-connection-health.md`.

### Trabalho declarado na fonte
Nada em execução.

### Próximos passos herdados
(1) Publish do Pedro para a UI da #36 e conferência no dashboard; (2) desenhar o teste por cidades do Raphael Ghanem para medir o ROAS incremental (D-ERP81); (3) observar o caminho de erro da #36 em Live (primeira falha real ou teste controlado) e fechar a issue.

### Bloqueios registados
- **#36 (P1)** — backend em produção, UI por publicar, caminho de erro ainda não observado em Live. O token da Mundo Propício expira a 08/10/2026.
- **Elo 4 partido** — o pixel da Ticketline não propaga `fbc` no Purchase. Medido a 17/09: Simone Mendes, 10–16 set, 2.962 inícios de checkout para 77 compras atribuídas. Elos 1–3 provados. Depende da Ticketline (Luísa Rodrigues).
- **#197 (ticketing-e-receita)** — `vw_event_daily_sales` perdeu o histórico de 8 eventos desde a v2.41. Enquanto estiver aberta, esta frente lê vendas só por `get_daily_sales_series`.

### Por confirmar (herdado de 29/08, não reverificado a 17/09)
- As 3 posturas restantes (escalar / cirúrgica / novo desenho) aparecem como "Em breve" na UI, com as edge functions já deployadas.
- Customer Match "Compradores Geral Ticketline Jun2026" (5.933 membros) carregada; Fase 2 pendente.
- Rótulo de última sync "há 20/27 dias": o cabeçalho de `src/pages/crm/Campaigns.tsx` lê `max(last_synced_at)` dos insights e está fresco; as datas batem com `last_synced_at` dos espelhos de estrutura (`meta_campaign_snapshot` 27/08, `meta_ad_snapshot` 21/08), que só avançam quando o objeto muda na Meta ou num sync completo (último a 01/09). Falta identificar o ecrã onde o rótulo foi visto.

### Regras e contexto técnico herdados
- Conta Meta em EUR e ligação correspondente: identificadores na fonte original (ver proveniência abaixo).
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

### Referências herdadas
- `docs/DECISIONS.md` — D-ERP81 (ROAS), D-ERP57 (contas de tráfego do artista)
- `docs/procedimentos/PROC-relatorio-trafego-semanal.md`
- `.lovable/memory/features/audience-unified-paid-dashboard.md`, `elo-publicacao-fase3-ativacao.md`, `mp-audience-*.md`
- `docs/features/crm-meta-publish-flow.md`

### Actualização 19/09/2026 — F2a do motor único (D-ERP95)
- Migração `20260919105937` em Live: `artist_songs.smart_link_url`, `design_id` do plano Meta só obrigatório no alvo evento, e 9 RPCs `artist_ads_*` (tetos de orçamento, lista/detalhe de planos de música, posts promovíveis, smart link, criar/editar plano). Escrita exige sessão + papel admin/manager/marketing_manager; nenhuma acessível a anon.
- `crm-meta-publish-execute` deployada: `dry_run` (default TRUE, inalterado) passa a ser permitido em qualquer estado do plano e devolve `ok:true`; plano de música devolve `alvo_musica_f2b`. O caminho real de publicação não mudou.
- Por fazer (F2b): publicação do alvo música, post existente, naming, UTMs, lock, activação.

### Actualização 19/09/2026 — F2b do motor único (D-ERP95)

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

### Actualização 19/09/2026 — F3 do motor único (D-ERP95)

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

### Actualização 19/09/2026 — proposta de plano por LLM (D-ERP98)

Função nova `artist-ads-strategy-generate` (`verify_jwt = true`). Entrada
`{ artist_id, song_id, connection_id, orcamento_diario?, objetivo?, notas? }`,
saída `{ plan_id, plano, resumo }`.

- Cliente com a chave pública + `Authorization` do chamador. Sem sessão → 401
  `sessao_invalida`. Nunca service_role: `artist_ads_plan_create` usa `auth.uid()`.
- Não toca em `crm.*`. Tráfego só por RPCs `artist_ads_*`; comparáveis só pela RPC
  `song_benchmark_aligned`.
- Coletor do snapshot extraído para `_shared/artist-song-snapshot.ts`, partilhado com
  `artist-song-report` (comportamento do relatório inalterado).
- Fase 1 sem Graph API: sem decifrar token, sem `/search` de interesses, sem custom
  audiences. O histórico que já está na base chega.
- Normalização determinística depois do LLM: objectivo, geografia, número de conjuntos,
  `post_ref` promovível, orçamento contra `available_daily` e datas.
- Erros: 401 `sessao_invalida` · 403 `sem_permissao` · 422 `sem_teto` /
  `sem_publicacoes_promoviveis` / `plano_invalido` · 429 `rate_limited` ·
  402 `credits_exhausted` · 502 `ai_invalid_json`.
- Sem migração, sem alteração de RPCs, sem front, sem Publish. Não foi gerado nenhum plano
  real (o piloto Litto Lins tem `smart_link_url` a null → TRAFFIC indisponível por desenho).

### Adenda 2026-09-26 — Depreciação de artist_songs.smart_link_url
- Fonte única de smart links passa a ser `public.song_links` (RPCs `artist_song_link_list` / `artist_song_link_upsert`). O front (c5fbb3d2) já não lê nem escreve a coluna antiga.
- Coluna `artist_songs.smart_link_url` marcada DEPRECATED via COMMENT ON COLUMN: mantida só para histórico, não escrever mais aqui. Não foi apagada nem feito drop.
- `artist_ads_song_set_smart_link` continua a existir mas deixou de ser executável por authenticated/anon (REVOKE); só service_role.
- Usos remanescentes conhecidos (só leitura, backend, não corrigidos — aguardam decisão do Pedro): `crm-meta-publish-execute` (lê a coluna para comparar link de destino do plano) e `artist-ads-strategy-generate` (fallback quando a música não tem smart link MP em song_links — D-ERP141).

## Google Ads — registo técnico herdado

Issues da fonte: #62, #69, #70. Tudo nesta secção conserva o alcance temporal do registo original.

### Implementação e evidência registadas
Dashboard funcional com campanha real "[NEW] Ivete Clareou - Cascais 2026" (DEMAND_GEN, ENABLED). Sync **manual por botão** — cron rejeitado por decisão do Pedro. Arquitetura: **tudo Ads → MP Audience; tudo Lead/CRM → MP CRM**.

**Motor único de campanhas — F1 fundações (19/09, D-ERP95):** `crm.google_publish_plan` aceita evento XOR artista+música; nasceu `crm.ads_entity_actions_log` (log de acções Google/TikTok, que não existia) com vista unificada `crm.v_ads_entity_actions_log`. Só schema — comportamento inalterado; alvo música na F2/F3, com prioridade a Demand Gen com vídeo do canal YouTube.

### Trabalho declarado na fonte
Nada em execução. #62 (10/10, D-ERP230): casamento clique↔lead corrigido no enqueue (90 dias, gclid primeiro), valor enviado só quando >0, Customer Match com recuo de 24h e alerta no painel; desbloqueio do 403 e valor por lead são do Pedro.

### Próximos passos herdados
**#62 (P1)** — leads do CRM não alimentam o Google Ads: cadeia de atribuição partida em 3 pontos. É o bloqueador do eixo lead→conversão.

### Bloqueios registados
- **Customer Match sem elegibilidade** — conta Google identificada na fonte original dá `403 PERMISSION_DENIED` para escrita. Gate **account-side**, não código.
- **#69** — drift em `crm-google-click-ingest`.
- **#70** — o portal grava 2 linhas de `google_click`.

### Regras e contexto técnico herdados
- Conta Google, MCC e service account: identificadores na fonte original (ver proveniência abaixo).
- `GOOGLE_SA_KEY_JSON` e `GOOGLE_ADS_DEVELOPER_TOKEN` no Vault. Coluna `login_customer_id` em `crm.ad_platform_connections`.
- **Google Ads API v24** — `campaign.start_date`/`end_date` e `pageSize` removidos. v17 e v20 obsoletas.

### Referências herdadas
- `docs/handoffs/` — estado-google-ads-2026-08-28, google-data-manager-api-migracao-2026-08-29

### Métricas de vídeo (20/09/2026)
`crm-google-video-metrics-sync` escreve em colunas próprias —
`google_campaign_insights_daily.video_metrics`, `google_campaign.settings` e `.reach`.
Antes escrevia em `raw`/`metrics` e o cron 242 (3h) apagava tudo. `artist_ads_daily` e
`artist_ads_campaigns` lêem `coalesce(video_metrics->>'video_views', raw->>'video_views')`.
Cron por criar em Live: `crm-google-video-metrics-3h`, `'20 */3 * * *'`, `{"days":7}`.

### Enqueue de conversões de lead (13/10/2026, D-ERP260)
O enqueue parte dos leads da janela de 90 dias, sem corte por volume de cliques; se o limite de 20.000 leads for atingido, a resposta diz `limit_reached:true`. A 13/10 enfileirou 16 (todos por identificador) e havia 78 já enviados. Ficam fora, por regra: 14 leads duplicados do mesmo gclid, 10 cliques sem consentimento e 1 lead sem clique.

## TikTok — apenas o comprovado nas fontes do repositório

[D-ERP248 / #306](../DECISIONS.md#d-erp248-11102026--306-mp-audience-preparado-para-tiktok-ads-por-evento-newgang-2027) e a [memória do dashboard](../../.lovable/memory/features/audience-unified-paid-dashboard.md) registam preparação para Ads por evento em 11/10/2026:

- Conta partilhada MP/Carreira, separação por campanha, sem segunda ligação ativa para o mesmo advertiser. `crm.tiktok_campaign` tem `linked_event_id`, `linked_event_locked` e CHECK evento XOR música; `shared_company_ids` delimita partilha. Sync não põe música numa campanha já ligada a evento.
- Auto-link `tiktok_auto_link_events_for_connection`: todos os tokens distintos do evento, sem cidades/palavras genéricas; empate não liga. Ligação manual por `tiktok_set_campaign_event`, listagem `tiktok_linkable_campaigns`, com papéis/empresa verificados. Vistas `*_carreira` excluem eventos, preservando o isolamento das funções de Carreira.
- Dashboard lê `crm.tiktok_insights_daily` em `adgroup`, só campanhas ligadas a eventos da empresa; cêntimos, sem conversão de moedas. Compras, alcance, frequência e cliques únicos ficam NULL/“—”, nunca zero. TikTok é acompanhamento; ações e drill-down continuam só Meta.
- A decisão regista pipeline de Faturas Ads existente para TikTok, PDF como verdade e casamento por ID de campanha; as regras fiscais e de aplicação ficam na D-ERP248, sem alteração aqui.
- Em 11/10 a fonte registava zero campanhas TikTok com evento e sete com música; isso não prova inventário ou saúde atual. Pixel TikTok no portal e criação do pixel Newgang estavam fora dessa decisão e não são declarados implementados aqui.

## Fontes e proveniência

- [QUADRO](../QUADRO.md), [CHATS](../CHATS.md), [INDEX](../INDEX.md) e [DECISIONS](../DECISIONS.md), em especial D-ERP278/279/335, são as fontes de ownership e pedidos; o histórico não substitui o estado vivo.
- Os estados originais completos são recuperáveis no Git na base `8494d581cec6e08a46b43e65332c281b12cb23c1`, caminhos `docs/estado/estado-audience-meta.md` e `docs/estado/estado-audience-google.md`. Identificadores de contas/ligações e email técnico desnecessários não foram recopiados; a referência à fonte preserva a localização. Os caminhos vivos antigos passam a ponteiros.
- [Saúde Meta](../../.lovable/memory/features/mp-audience-connection-health.md), [dashboard unificado](../../.lovable/memory/features/audience-unified-paid-dashboard.md), [Full Sync/criativos](../../.lovable/memory/features/mp-audience-full-sync-creatives.md), [fluxo de publicação](../features/crm-meta-publish-flow.md) e [relatório semanal](../procedimentos/PROC-relatorio-trafego-semanal.md).
- As referências herdadas a handoffs Google são arquivo, para proveniência apenas, não prova de estado atual. Os nomes originais são mantidos acima; a pesquisa local não encontrou ficheiros correspondentes em `docs/handoffs/`.
