# Decisões — MP Gestão Eventos / MP Audience

> Registo das decisões de arquitetura/produto e o seu PORQUÊ. Formato ADR leve: cada decisão = o que se decidiu + racional + estado (vigente / substituída).
> Documento vivo, organizado por módulo. Decisões antigas não se apagam — marcam-se "substituída".
> Como funciona o sistema vive em ARCHITECTURE.md; pendências vivem nas GitHub Issues.
> Última atualização: 26/jun/2026.

## Transversal / Infraestrutura

### D1 — Lovable Cloud é permanente (mai/2026)
**Decisão:** A stack assenta em Lovable Cloud (Supabase por baixo); não migrar para Supabase direto nem outra infra.
**Porquê:** Pedro orquestra IA sem escrever código; o Lovable dá o fluxo propor→executar→Publish. Migrar acrescentaria complexidade sem ganho.
**Reavaliar só se:** 500+ promotores ativos ou $5M+ ARR.
**Estado:** vigente.

### D2 — Base única Live (jun/2026)
**Decisão:** Eliminado o ambiente Test; passa a existir só a base Live (sfohvvlqccmmebvjgibx).
**Porquê:** Simplificar operação. DDL do agente passa a aplicar direto em Live; menos drift entre ambientes.
**Consequência:** "Faz Publish" serve para código/edge functions/front; não para objetos SQL de migração.
**Estado:** vigente.

### D3 — Pendências vivem em GitHub Issues (jun/2026)
**Decisão:** A fonte de verdade das pendências é GitHub Issues (repo pedrompropicio/mundopropicio), geridas pela edge function github-issues. Handoffs passam a ser só diário/histórico.
**Porquê:** Os handoffs datados são snapshots que se perdem entre chats/versões. Issues são uma fonte única, viva, rastreável e visível no telemóvel. Ritual: ler no início da sessão, atualizar no fim.
**Estado:** vigente.

### D4 — Documentação viva ARCHITECTURE + DECISIONS (jun/2026)
**Decisão:** O "como funciona" e o "porquê" migram para docs vivos no repo, mantidos no lugar. A memória do Claude vira índice que aponta para eles.
**Porquê:** A memória é resumida e tem limite; os handoffs dispersam-se. Um doc vivo dá durabilidade ao contexto.
**Estado:** vigente (em construção, por partes).

## MP Audience — Arquitetura do motor de diagnóstico (P0)

### D5 — O LLM só escreve/classifica linguagem (P0 principle)
**Decisão:** O LLM nunca decide números, ações ou factos comerciais. Só gera/classifica linguagem.
**Porquê:** Determinismo auditável. Números e decisões têm de ser reproduzíveis e testáveis, não estocásticos.
**Estado:** vigente.

### D6 — Diagnóstico determinístico a montante, redesign estocástico a jusante
**Decisão:** Duas funções separadas: crm-campaign-diagnosis (100% determinística, produz diagnóstico 360 + classe + baseline) corre primeiro; crm-meta-campaign-redesign (LLM) recebe esse output e só gera.
**Porquê:** Separar o que é testável (determinístico) do que é estocástico (LLM). Permite validar a espinha sem gastar chamadas LLM.
**Estado:** vigente.

### D7 — Classificação: fronteira 60%, 4 classes
**Decisão:** Fronteira bom/fraco = 60% do ROAS-alvo (~4.8x num alvo 8x). 4 classes: fraca, em_maturacao, saudavel_subindo, saudavel_caindo. "Morta" só quando projected_baseline_roas ≈ 0.
**Porquê:** Limiar claro e determinístico. Campanha que converte mal é "fraca" (→ redesign), não "morta".
**Estado:** vigente.

### D8 — Fluxo único adaptativo
**Decisão:** Uma só porta de entrada; a classe da campanha molda o output. Não há fluxos paralelos por tipo.
**Porquê:** Simplicidade e consistência.
**Estado:** vigente.

### D9 — Playbook qualitativo em markdown versionado
**Decisão:** O playbook que informa o brief/racional do LLM vive em markdown versionado no repo (docs/playbook-mp.md), injetado no prompt.
**Porquê:** Versionável, auditável, editável sem código. O LLM usa-o para linguagem/racional, não para decidir números.
**Estado:** vigente (injeção pendente — ver issue).

## MP Audience — Operação de campanhas Meta

### D10 — Anúncios apontam ao portal, não à Ticketline direto (jun/2026)
**Decisão:** O link de destino das campanhas é o portal (mundopropicio.com), que depois encaminha para a Ticketline.
**Porquê:** O mesmo pixel está no portal e no Purchase da Ticketline. O portal capta ViewContent corretamente (com content_ids/currency), coisa que a Ticketline não faz bem. Mandar ao portal salva a primeira metade do funil.
**Estado:** vigente.

### D11 — fbclid anexado no momento do clique (jun/2026)
**Decisão:** No portal, o link "Comprar Bilhete" reconstrói o href com o fbclid no instante do clique (handler handleTicketClick), em vez de depender de useEffect pós-mount.
**Porquê:** O href inicial (SSR) nascia "limpo"; cliques rápidos abriam a Ticketline sem fbclid → atribuição cross-domain perdida. Validado ao vivo (fbclid→fbc no pixel da Ticketline).
**Estado:** vigente.

### D12 — Não escalar gasto até a Ticketline incluir o fbc no Purchase
**Decisão:** Manter a verba contida até a Ticketline propagar o fbc para o evento Purchase.
**Porquê:** A Ticketline envia o Purchase (com value/currency/content_ids) mas SEM fbc → match quality ~6/10 → ROAS subavaliado. Escalar sobre métricas erradas seria cego.
**Estado:** vigente (bloqueado por externo — ver issue).

### D13 — Campanhas-piloto sem Advantage+
**Decisão:** Nos pilotos (ex.: Ivete), não aplicar Advantage+ creative nem as recomendações automáticas da Meta.
**Porquê:** Teste limpo com funil curado à mão e target ROAS 8x. A pontuação de oportunidade baixa é deliberada, não um defeito.
**Estado:** vigente.

### D14 — Fonte de verdade de tracking = Events Manager, não Funnel Test 360
**Decisão:** Conclusões sobre disparo de eventos/atribuição assentam no Events Manager do Meta (e browser real), nunca no Funnel Test 360.
**Porquê:** O Funnel 360 corre em headless (Browserless) e dá falsos negativos — quase gerou um email injusto à Ticketline. Não se afirma o que se simula.
**Estado:** vigente.

## MP ERP
> (A preencher. Regra de arquitetura conhecida: linhas de BP e transações ligam-se via event_forecasts.transaction_id; BP é planeamento a nível L2, não L3; TX vinculada a BP deve ter L3 sob o mesmo L2; TX órfãs aceitam qualquer L3.)

## MP CRM
> (A preencher — módulo de clientes/leads/promotores, distinto do Audience. Nota: o schema crm.* na BD é onde vive o Audience, não o módulo CRM.)

## MP Produção
> (A preencher.)

## DR-2026-06-26 — Unificação dos caminhos de campanha (MP Audience)

### Contexto
Inventário read-only revelou: 5+ pontos de entrada de construção/edição; DOIS pipelines paralelos de criar-novo sem ponte (Pista "Strategies": strategy-deploy/deployment-toggle + meta_campaign_strategy_deployments; Pista "Publish": publish-prepare/execute/activate + meta_publish_plan); função de duelo `crm-audience-duel` (Gemini 2.5 Pro + GPT-5) JÁ construída mas órfã (nenhuma UI a chama); fluxos vivos todos Gemini Flash sozinho; conceito de "vencedor" (CREATIVE_WINNER_ROAS_RATIO=0.6) só nos wizards StrategyRedesign/NewDesign, ausente na Montagem Assistida/Estúdio.

### Decisão
1. DUAS FAIXAS: Faixa A = editar campanha existente in-place (budget/pausa via Graph). Faixa B = criar campanha nova (gera → review → publish em pausa).
2. ESPINHA ÚNICA da Faixa B = meta_publish_plan + MetaPublishPanel (prepare → dry-run → "Confirmar e criar no Meta" → activate). Provada live (Ivete). A Pista "Strategies" (strategy-deploy/deployment-toggle) é APOSENTADA: migra-se o útil, deprecia-se o resto.
3. BRIEF DETERMINÍSTICO ÚNICO antes de qualquer LLM: diagnóstico 360 + pacote de vencedores (criativos/textos/audiências/configs/aprendizados) + ativos da campanha-referência (opcional) + caps de verba. Os dois LLMs recebem EXATAMENTE o mesmo brief; nenhum LLM vai buscar factos sozinho.
4. DUELO = ligar a função existente crm-audience-duel à Faixa B. TOGGLE por campanha (default OFF = Gemini Flash; ON = Gemini Pro + GPT-5). Guarda AMBOS os candidatos com duel_id + source_model.
5. ÁRBITRO 100% DETERMINÍSTICO: guard anti-alucinação (todo ativo/ID citado tem de existir no pacote real) + hard rules (cap, feasibility, targeting real) + scorecard objetivo. ESCOLHA é humana. Parecer textual LLM = OPCIONAL (default OFF), descreve mas NUNCA seleciona.
6. CONCEITO DE VENCEDOR sobe dos wizards para o brief partilhado; Montagem Assistida e Estúdio passam a consumi-lo.
7. BUILD-FROM-SCRATCH = generalização do new-design com reference_campaign_id OPCIONAL. NÃO é função nova.
8. FAIXA A ganha dry-run + modal de impacto antes de QUALQUER escrita na Graph API (equiparar ao padrão do MetaPublishPanel). Risco vivo.
9. Princípio P0 mantido: LLM só escreve/classifica linguagem; nunca decide números, ações ou factos comerciais.

### Schema (aditivo, sem destruir)
meta_campaign_strategies += duel_id, source_model, reference_campaign_id.

### Consequências
Deprecar Pista "Strategies" e o schema meta_campaign_strategy_deployments. Absorve issue #8. Toca #11 (limpeza strategies), #17/#18 (UI).

## DR-2026-06-26b — Decisões do brief determinístico único (sub-tarefa 3 de #19)

D1. Definição ÚNICA de "vencedor" = rácio ROAS puro (lógica do redesign):
    winner se creative_roas >= targetBlendedRoas*0.6, com gates spend>=€50 e
    purchases>=3; abaixo dos gates de volume = "inconclusive"; senão "loser".
    A lógica de "score IA primário" da inventory é abandonada para
    classificação de vencedor (fica como metadado, não decide). Alinha com P0
    (classificação 100% determinística).
D2. crm-audience-duel passará a aceitar CampaignBrief como input (mantendo o
    Briefing legacy). [implementação na sub-tarefa 4]
D3. company_id hardcoded no duel passa a vir do brief. [corrigir na
    sub-tarefa 4, quando tocarmos no duel]
D4. buildCampaignBrief devolve o diagnosis_jsonb COMPLETO; cada caller trunca
    ao serializar para o prompt.
D5. targetBlendedRoas é passado pelo caller em caps (não calculado dentro do
    brief).

## DR-2026-06-27 — Duelo produz o schema CANÓNICO (não o esboço simples)

### Contexto
Na sub-tarefa 4 o `crm-audience-duel` foi construído a emitir um schema simples
(`estrategia_geral`, `divisao_orcamento`, `adsets`, `conceitos_criativos`,
`roas_esperado`). Verificou-se que NÃO corresponde ao schema canónico das
estratégias (`phases`, `recommended_campaigns`, `creative_brief`,
`inherited_creatives`, `kpis_global`, `budget_recommendation`, `scaling_rules`,
`automation_metadata`, `risks_and_warnings`, `summary`, `redesign_rationale`)
que o `StrategyView` renderiza e o pipeline de publicação consome.

### Decisão
O duelo passa a produzir o MESMO schema canónico que o gerador single-model
(`crm-meta-campaign-redesign` / `strategy-generate`), alimentado pelo brief
determinístico enriquecido, corrido com 2 modelos.

### Razão
O sentido do duelo é dois estrategas seniores a desenharem campanhas
COMPLETAS e PUBLICÁVEIS sobre os mesmos factos — não um esboço genérico
que qualquer gestor faz à mão. Um candidato do duelo fica indistinguível
de uma estratégia normal exceto por `source_model` / `duel_id`.

### Consequências
- `StrategyView` renderiza candidatos sem adaptação.
- Árbitro determinístico valida campos canónicos (anti-alucinação em
  `recommended_campaigns[].adsets[].targeting_json.custom_audiences[].id`,
  `inherited_creatives[].meta_creative_id`, `ads[].existing_creative_id`).
- Selecionado é publicável: a ponte da sub-tarefa 6 (candidate→strategy
  ativa→publish) fica trivial (basta promover `status='candidate'`→`'selected'`
  e reusar o pipeline `MetaPublishPanel` existente).

### Mantêm-se reaproveitados
Brief determinístico único, enquadramento "evidência não molde", postura
por classe (`source_campaign_class`), robustez Gemini (maxAttempts=3,
backoff, log gateway-empty), persistência `duel_id` / `source_model` em
`crm.meta_campaign_strategies` com `status='candidate'`.

### Muda
Só o bloco de instruções de schema que o LLM é instruído a produzir.

## DR-2026-06-27b — Enriquecimento do CampaignBrief (sub-tarefa 5, A2, Onda 1)
Sequência aprovada (A2): (1) enriquecer o brief; (2) extrair prompt canónico + pós-processamento determinístico do crm-meta-campaign-redesign para _shared/; (3) ligar SÓ o duelo ao módulo (produz 2 candidatos canónicos), redesign fica intacto neste passo (migração do redesign = follow-up rastreado, sub-tarefa 6); (4) UI (comparação StrategyView ×2, árbitro de campos canónicos, escolha→selected, toggle).

Onda 1 do brief (100% derivável da BD, fórmulas EXTRAÍDAS do redesign — não inventar):
- trajectory (string): classifyTrajectory(roas7d, roas28d) do redesign (ratio >=1.5 strong_uptrend; >=1.15 uptrend; >=0.85 stable; >=0.70 downtrend; <0.70 strong_downtrend; insufficient_data se roas28d<=0). Expor também série diária resumida.
- viability {}: extrair de analyzeViability do redesign (gap_severity comfortable/stretch/aggressive/unrealistic; meets_statistical_floor com floor €2000 ou 50 compras; daily_spend_needed; current_projected_*; roasGap). Mesmos inputs/constantes (TICKET_AVG_FALLBACK_EUR=25, STATISTICAL_FLOOR_SPEND_EUR=2000).
- peers enriquecidos: mesma query, +impressions/reach/frequency/clicks/ctr/cpm por peer.
- audience_ranking: ROAS por audiência via custom_audiences do targeting de cada adset (meta_adset_snapshot.targeting) + meta_adset_insights_daily; regra D1 (ratio 0.6 + gates €50/3); label winner/loser/inconclusive. ATRIBUIÇÃO POR CO-PRESENÇA — marcar explicitamente attribution:'co_presence' em cada item e em nota do bloco; não ler como atribuição limpa (overlap real fica para Onda 2/Graph).
- adset_saturation: por adset, 2 janelas (7d vs 8-14d ant.): saturating se frequency_A>frequency_B*1.15 E ctr_A<ctr_B*0.85 E cpm_A>cpm_B*1.15, gate impressions_A>1000. Limiares 1.15/0.85 herdados do redesign.
- creative fatigue: juntar ao winners_packet por criativo; fatigued se roas_7d<roas_prev7*0.85 E frequency_7d>2.0 E spend_7d>€25.
- format_gaps: contar winners por meta_creatives.type (valores reais: video/image/carousel/banner/unknown); types_missing e types_underrepresented.

Onda 2 (Graph, depois): overlap real de audiências (/audience_overlaps) — único sinal que exige Graph.
Princípio mantido: código mede/classifica deterministicamente; LLM lê factos e escreve julgamento/linguagem, nunca inventa números (P0).

## DR-2026-06-27c — Duelo chama o redesign ×2 (revisão do passo 2 do A2)
Revisão de tática (mantém o objetivo da DR-2026-06-27: candidatos canónicos publicáveis). Em vez de extrair prompt+pós-processamento do redesign para _shared/ e ligar só ao duelo (risco de drift: a cópia não seria validável contra o redesign, que continuaria a usar a versão inline), o duelo passa a INVOCAR o crm-meta-campaign-redesign duas vezes (um modelo por chamada) e recebe os 2 planos canónicos da resposta HTTP. Reutiliza o motor provado (anchoring, anti-alucinação, 20 passos de pós-processamento, gates) sem cópia nem drift.

Alterações ADITIVAS e opt-in ao redesign (caminho default 100% inalterado):
- body.model opcional: modelId = body.model?.trim() || AI_MODEL ('google/gemini-2.5-flash'). Usado na chamada ao gateway (L1783) e em generation_model (L1331/L2745).
- body.dry_run opcional: alarga a baliza PAS existente (L2704-2722) — if(PAS || body.dry_run===true) devolve { generated_plan, redesign_rationale, viability_analysis, source } ANTES do INSERT (L2728); mesmo guard no early-abort (L1314). O plano devolvido já passou por todos os pós-processamentos.

Lado do duelo (crm-audience-duel): substitui o gerador de esboço simples por 2 chamadas Promise.all ao redesign (dry_run:true, modelos distintos google/gemini-2.5-pro × openai/gpt-5), reencaminhando o Authorization (Bearer) do utilizador (s2s por SRK não bate — aprendizagem da sub-tarefa 4). Persiste ELE os 2 candidatos em meta_campaign_strategies (status='candidate', duel_id partilhado, source_model, reference_campaign_id, generated_plan=plano canónico). Se uma chamada falhar, persiste só a outra + warning (degenera para single).

ADIAMENTO EXPLÍCITO: nesta entrega os candidatos saem do PROMPT ATUAL do redesign (que já lê o diagnóstico 360). O CampaignBrief v2 enriquecido (Onda 1: trajectory, viability, audience_ranking, adset_saturation, fatigue, format_gaps) + o enquadramento 'evidência não molde' + postura por classe NÃO alimentam ainda os candidatos — isso entra na sub-tarefa 6 (migração do redesign para consumir o brief v2 + extração para _shared/). O brief v2 fica construído e verificado, à espera. Overlap de audiências (Onda 2/Graph) também fica para depois.

Esquema simples do duelo (estrategia_geral/divisao_orcamento/adsets/conceitos_criativos/roas_esperado) é ABANDONADO — substituído pelo schema canónico.

## DR-2026-06-27d — Duelo assíncrono (Opção A): redesign persiste candidato em background
Problema: o GPT-5 grande a correr o pipeline completo do redesign excede o IDLE_TIMEOUT (150s) do gateway ai.gateway.lovable.dev quando chamado de forma síncrona pelo duelo → 504. O limite é da infraestrutura Lovable, não configurável. Validado: Gemini Pro PASSOU e gravou candidato CANÓNICO (phases, recommended_campaigns, creative_brief, summary, gates a funcionar — feasibility='impossible' no caso Simone). Só falta o GPT-5 não depender da janela síncrona.

Decisão (Opção A): o crm-meta-campaign-redesign ganha um modo async_persist. Body novo: { async_persist:true, duel_id, source_model } (+ campaign_id, model). Responde 202 { accepted:true, duel_id, source_model } em <1s; corre o pipeline em EdgeRuntime.waitUntil; no fim faz ELE o INSERT do candidato em crm.meta_campaign_strategies (status='candidate', duel_id, source_model, generated_plan, reference_campaign_id, created_by=user.id capturado ANTES do 202) usando service_role (já tem GRANT SELECT/INSERT/UPDATE da sub-tarefa 4). async_persist é exclusivo de dry_run (ambos→400). Caminho síncrono/dry_run/default 100% inalterado.

Duelo (crm-audience-duel): deixa de fazer Promise.all síncrono e deixa de inserir candidatos. Cria o run em audience_duel_runs (status='running'), dispara 2 fetch ao redesign com async_persist (aguarda só o 202), devolve 202 { run_id, duel_id, status:'running', mode:'canonical' }. A persistência dos candidatos passa para o redesign.

Anti-corrida em audience_duel_runs: cada modelo escreve só as SUAS colunas (gemini_*, gpt_*). Adicionar colunas dedicadas se faltarem: gemini_finished_at, gpt_finished_at, gemini_candidate_id, gpt_candidate_id. O status agregado NÃO é escrito pelos dois — é DERIVADO (a UI/consulta calcula: 2 finished→done/error; 1→partial; 0→running; >5min sem finished e sem candidatos→timeout). Sem locks: colunas disjuntas + estado agregado como função pura.

Timeout: SEM cron watchdog. A UI deriva 'expirado' quando passam >5min sem candidatos nem finished_at. Cron fica como follow-up só se necessário.

Modelos do duelo: google/gemini-2.5-pro × openai/gpt-5 (grande, agora viável via assíncrono). O fix de temperature condicional + retry 502/empty no redesign (DR-2026-06-27c continuação) mantém-se.
