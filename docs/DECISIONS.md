# Decisões — MP Gestão Eventos / MP Audience

> Registo das decisões de arquitetura/produto e o seu PORQUÊ. Formato ADR leve: cada decisão = o que se decidiu + racional + estado (vigente / substituída).
> Documento vivo, organizado por módulo. Decisões antigas não se apagam — marcam-se "substituída".
> Como funciona o sistema vive em ARCHITECTURE.md; pendências vivem nas GitHub Issues.
> Última atualização: 30/ago/2026.

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

### D-ERP1 — O vínculo BP↔transação é N:1, canónico em `transactions.forecast_id` (ago/2026)
**Decisão:** uma linha de BP pode ter N transações. A chave é `transactions.forecast_id`. O campo `event_forecasts.transaction_id` fica como âncora legada, mantida por escrita dupla para não partir o que já lê de lá.
**Substitui:** a regra anterior de vínculo 1:1 por `event_forecasts.transaction_id`.
**Estado:** vigente.

### D-ERP2 — O BP planeia e compara-se ao nível L3 (ago/2026)
**Decisão:** o nível de comparação entre previsto e realizado é o L3, o único selecionável. A rubrica da linha do BP é a fonte de verdade e propaga-se à transação vinculada.
**Substitui:** "BP é planeamento a nível L2, não L3", que deixava passar o erro que mais interessa apanhar — dois L3 irmãos dentro do mesmo L2.
**Ver:** DR-2026-08-22, neste documento.
**Estado:** vigente.

### D-ERP3 — O evento fecha pelo BP, não pelas transações (ago/2026)
**Decisão:** a base do fecho é o BP aprovado (previsto + excedido por rubrica), não o somatório das transações.
**Porquê:** em co-produção as transações só contêm o que a MP desembolsa. Na Anitta há 33 rubricas com zero transações e 959.722,52 € de custo real: fechar pelas transações apagaria o custo dos sócios.
**Estado:** vigente.

### D-ERP4 — O seletor c/IVA↔s/IVA é uma vista; a base contratual é `events.partner_calc_basis` (ago/2026)
**Decisão:** o botão de IVA muda o que se vê, nunca o que um sócio recebe. O acerto com sócios fica ancorado a `events.partner_calc_basis`.
**Porquê:** na Anitta a diferença entre as duas bases são 279.044,23 €. Um clique não pode mover isso.
**Estado:** vigente — implementação por fechar na issue #64.

### D-ERP5 — Não se geram transações em massa a partir do cabeçalho do BP (ago/2026)
**Decisão:** removida a ação "Gerar Transações" do cabeçalho do Business Plan. A edge function `generate-historical-transactions` fica desativada e é removida em passo separado.
**Porquê:** nasceu quando o fecho do evento era por transações; com a D-ERP3 o evento fecha pelo BP e a ação deixou de ter propósito. Acresce que escrevia `amount` com o IVA embutido (o sistema trata `amount` como base s/IVA), perdia `paying_partner_id` e `ordering_partner_id`, gravava apenas a âncora legada em vez de `transactions.forecast_id`, não registava em `transaction_audit_log`, e o contador ignorava os filtros do ecrã.
**Consequência:** a criação em massa continua a existir por secção (`handleBulkCreateTx`), que herda o ordenador, grava a base correta e escreve no audit log.
**Estado:** vigente.

### D-ERP6 — Conta gerencial: `financial_accounts.is_accounting = false` (30/08/2026)
**Decisão:** uma conta financeira pode ser marcada como gerencial; os seus movimentos e documentos não entram nas exportações para a contabilidade (`generate-accountant-zip`). A marca é herdada pela transação e apenas informativa nela — não existe campo equivalente em `transactions`.
**Porquê:** há recursos que nunca transitaram pelas contas da MP em Portugal (ex.: pagamentos feitos no Brasil por um sócio, conta "Pgto Mágicos Acerto Madrid"). O ERP é gerencial; nem tudo é fiscal.
**Estado:** vigente.

### D-ERP7 — Titularidade da conta e do pagamento: a saída pertence à transação-mãe (30/08/2026)
**Decisão:** só a transação-mãe recebe `account_id` e só ela gera linha em `transaction_payments`. Filhas de rateio (`parent_transaction_id`) recebem apenas `paid_amount`, `status` e `payment_date`.
**Porquê:** evitar que a saída conte duas vezes no saldo da conta e na tesouraria.
**Estado:** vigente.

### D-ERP8 — Nenhuma liquidação sem conta (30/08/2026)
**Decisão:** qualquer caminho que ponha `status='paid'` tem de passar por um modal de pagamento que exija `account_id` e crie linha em `transaction_payments`. A soma dos pagamentos nunca excede o valor bruto e o `paid_amount` nunca excede o valor bruto, garantido por trigger (`validate_installments_total`, `trg_validate_paid_amount_not_exceeds_gross`).
**Porquê:** 526 transações foram liquidadas sem conta por escrita direta (1.247.597 €), invisíveis para a tesouraria. O botão "Marcar como Pago" da Lista de Contas a Pagar voltou a ser estritamente visual.
**Estado:** vigente.


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

## DR-2026-06-27d — Duelo assíncrono (Opção A): redesign persiste o candidato em background
Problema: o duelo chamava o redesign ×2 e ficava preso à resposta HTTP; o gateway de IA da Lovable corta a 150s (IDLE_TIMEOUT). O GPT-5 grande, a correr o pipeline completo do redesign, excede isso (504). O Gemini Pro cabe. Não há como aumentar o timeout (limite da infra Lovable).

Decisão: tornar a geração ASSÍNCRONA. O redesign ganha um modo async_persist e passa a inserir ELE o candidato em background; a janela de 150s deixa de bloquear (resposta 202 imediata).

Contrato:
- Request ao redesign: { campaign_id, model, async_persist:true, duel_id, source_model } + Bearer do user. async_persist é exclusivo com dry_run (ambos = 400). duel_id+source_model obrigatórios quando async_persist.
- Redesign: valida auth, captura user.id, devolve 202 { accepted:true, duel_id, source_model } em <1s. Em EdgeRuntime.waitUntil corre o pipeline completo (igual ao dry_run). No fim: sucesso → INSERT em meta_campaign_strategies (status='candidate', duel_id, source_model, generated_plan=plan, reference_campaign_id, created_by=user.id) via SERVICE_ROLE (GRANTs já concedidos na sub-tarefa 4) + UPDATE só das colunas do modelo em audience_duel_runs; falha → UPDATE só de <modelo>_error. Mantém intactos os caminhos default/dry_run.
- Duelo: cria audience_duel_runs (status='running'), dispara 2 fetch async_persist ao redesign (aguarda só o 202), devolve 202 { run_id, duel_id, status:'running', mode:'canonical' }. Deixa de fazer INSERT de candidatos (responsabilidade passa ao redesign).

Anti-corrida (2 redesigns terminam em paralelo): cada modelo escreve só as SUAS colunas em audience_duel_runs (gemini_* / gpt_* — disjuntas; adicionar gemini_finished_at/gpt_finished_at/gemini_candidate_id/gpt_candidate_id se faltarem). O status agregado é DERIVADO (running/partial/done/error) a partir das colunas, nunca escrito pelos dois.

Timeout: SEM cron watchdog. A UI deriva 'expirado' quando passam >5 min sem candidatos nem *_finished_at. Cron fica como follow-up só se necessário.

Modelos do duelo: google/gemini-2.5-pro × openai/gpt-5 (grande, agora viável pela via assíncrona). temperature condicional já tratada (omitida para openai/*). Retry de 502/empty no redesign já aplicado.

## DR-2026-06-27e — From-scratch é função SEPARADA, não ramificação do redesign

**Contexto:** A sub-tarefa 8 (criar campanha do zero usando uma campanha vencedora como referência, ou sem referência nenhuma para evento novo) exige um motor que corra SEM campanha-fonte. O mapeamento read-only do crm-meta-campaign-redesign revelou 9 pontos de acoplamento à campanha-fonte (R1-R9): entrada/validação exige campaign_id; carregamento de meta_campaign_snapshot; diagnóstico 360 hard-fail 422; anchoring/viability vivem do histórico da campanha; gate de feasibility compara baseline vs target; criativos herdados vêm da fonte; custom audiences via connection_id/ad_account_id da fonte; brief v2 exige campaign_id; persistência usa source_campaign_id.

**Decisão:** Criar uma edge function SEPARADA `crm-meta-campaign-from-scratch` em vez de ramificar o redesign com `if (fromScratch)`. Razão: o redesign está construído à volta de "tenho campanha, vou melhorá-la"; o from-scratch é conceptualmente diferente (sem baseline, sem diagnóstico, sem anchoring de campanha morta). Ramificar encheria o motor crítico de condicionais frágeis e arriscaria o redesenho já validado. A função separada reusa HELPERS PUROS partilhados (montagem de prompt, normalização de plano, resolveEffectiveEventDate, buildCampaignBrief em modo ref/blank) mas tem o seu próprio fluxo.

**Três cenários suportados:**
1. From-scratch COM referência (evento novo + campanha vencedora como molde): ancora ao ROAS REAL da campanha de referência (não inventado).
2. From-scratch SEM referência (evento novo sem histórico): SEM âncora; ROAS-alvo é INPUT do Pedro; plano marcado "estrutura de arranque" (não é projeção).
3. Recomeçar o mesmo evento do zero (campanha esgotada): usa a própria campanha como referência. Já tem botão na UI ("Começar do zero"/"Novo desenho").

**Três estados de anchoring (P0 mantido — LLM nunca inventa número):**
- redesign → ancora à própria campanha (histórico real)
- from_scratch_ref → ancora ao ROAS da campanha de referência (histórico real dela)
- from_scratch_blank → sem âncora; ROAS-alvo vem do input do Pedro; confidence cap baixo + statistical floor sobre o BUDGET planeado (não sobre histórico)

**Entrada:** nova opção no menu lateral do MP Audience ("Criar campanha") + formulário único. Evento-alvo: escolher evento existente OU criar à mão (nome/data/local/meta de bilhetes). Referência: opcional, escolhida de uma lista de campanhas boas. Botões dentro da campanha mantêm-se para o cenário 3.

**Helpers a partilhar (extrair para _shared se preciso, sem tocar no comportamento do redesign):** montagem do bloco de prompt comum, normalizePlanInPlace, resolveEffectiveEventDate, buildCampaignBrief (com modo ref-only/blank a adicionar), persistência em meta_campaign_strategies.

**Plano de construção por fases:** (F1) brief v2 ganha modo ref-only/blank sem partir o uso atual; (F2) edge function from-scratch nova com os 3 cenários, reusando helpers; (F3) UI — entrada no menu + formulário; (F4) ligar botões existentes da campanha ao cenário 3. Cada fase verificada por diff/BD antes da seguinte.


## DR-2026-08-21 — Dashboard MP Audience unificado: meta de ROAS por evento, escala partilhada, sem conversão de moeda, "—" em vez de zero

Fecho do redesenho do dashboard `/audience/dashboard` (Fases 0–5). Quatro decisões deste ciclo:

**1. Meta de ROAS deixa de ser constante e passa a `public.events.target_roas`.**
Antes havia um alvo único no código para todas as campanhas. Um festival de 3 dias com bilhete médio alto e um espectáculo de sala não se avaliam pelo mesmo múltiplo: o alvo é do EVENTO, não do módulo. `target_roas` é NULL por omissão e cai no fallback `DEFAULT_TARGET_ROAS` (8×) — 8 era exactamente a constante anterior, logo nenhum evento mudou de leitura com a migração. Editável no card do evento (`TargetRoasEditor.tsx`).

**2. Google e Meta partilham a escala de unidades para poderem ser agregados.**
Dinheiro em cêntimos inteiros nas duas plataformas; `ctr`/`unique_ctr` como fracção nas duas. O Google devolve micros e CTR já em percentagem — a normalização faz-se no `crm-google-sync-campaigns` (`micros / 10000`) e nas queries de leitura (`google-queries.ts`), NUNCA na UI. Porquê: a alternativa era ramificar `aggregate()` por plataforma, e cada função derivada (CPC, CPM, CPA, ticket) passaria a ter dois caminhos. Com a escala normalizada à entrada, a mesma agregação serve as duas e há um único sítio onde a escala pode estar errada. Foi assim que dois bugs de escala (CTR ×100 do Google, `unique_ctr` sobre impressões em vez de alcance) ficaram corrigidos num só ficheiro.

**3. Nunca converter moedas automaticamente.**
Quando as moedas das plataformas ou das contas divergem, o consolidado devolve `null` e a UI mostra cada plataforma na sua moeda. Somar exigiria uma taxa de câmbio, e a taxa certa seria a do dia de cada linha de gasto — não a de hoje. Um total "quase certo" em EUR é pior do que dois totais certos, porque ninguém consegue auditá-lo contra o Ads Manager. Vale a mesma regra do multi-currency do financeiro: só se soma o que está na mesma moeda.

**4. Métricas em falta mostram "—", nunca zero.**
Zero é uma medição ("ninguém clicou"); ausência é outra coisa ("esta plataforma não fornece", "este anúncio é imagem, não tem hook rate", "o pixel não dispara este evento"). Confundir as duas leva a decisões erradas: um anúncio de imagem com "0% de retenção" parece um criativo falhado. Implementação: flags `has*` no `Aggregate` (`hasReach`, `hasUniqueClicks`, `hasViewContent`, `hasAddToCart`, `hasInitiateCheckout`, `hasVideo`) e colunas nullable na BD — as colunas de vídeo gravam NULL, nunca 0, quando o Graph não devolve o campo. A mesma regra na série diária (dias sem dados ficam `null`, o gráfico mostra o buraco) e nos deltas de KPI (sem janela anterior completa, "sem histórico comparável" em vez de uma percentagem inventada).

Documentação: `docs/features/mp-audience-dashboard.md` (fonte de verdade do ecrã); `docs/integrations/meta-ads.md` reconciliado e reduzido ao fluxo OAuth/tokens.

## DR-2026-08-22 — Vínculo BP↔transação: a rubrica da linha do BP manda (L3), com alinhamento em vez de bloqueio

Contexto: existiam dois gatilhos simétricos (`enforce_tx_category_l2_match` / `enforce_forecast_tx_link_l2_match`) que só validavam o **L2** e, quando divergia, **bloqueavam** a gravação. Resultado prático: mover uma linha do BP para outra rubrica L3 deixava a transação vinculada na rubrica antiga (incoerência silenciosa), e mudar a rubrica da transação primeiro dava erro sem explicar o porquê.

**Decisão 1 — Fonte de verdade única: a linha do BP.** Enquanto existe vínculo por FK (`event_forecasts.transaction_id`), a rubrica da linha propaga-se à transação (`sync_tx_category_from_forecast`) e qualquer alteração feita directamente na transação é realinhada de volta (`realign_tx_category_from_forecast`). Alinhar em vez de bloquear porque o utilizador nunca tem duas gravações atómicas à mão: obrigá-lo a acertar as duas pontas na ordem certa é uma armadilha, e o estado incoerente já era o que se queria evitar.

**Decisão 2 — Aperto de L2 para L3.** O BP é comparado ao realizado ao nível L3 (é o único nível seleccionável). Validar só o L2 deixava passar exactamente o erro que interessa apanhar: dois L3 irmãos dentro do mesmo L2.

**Decisão 3 — Anti-recursão explícita.** Os dois gatilhos escrevem na tabela do outro, logo cada um só age em `pg_trigger_depth() = 1`. Linhas de snapshot (`version_id IS NOT NULL`) são ignoradas — não são BP vivo. Realinhamentos automáticos ficam registados em `system_audit_log` (`auto_realign_tx_category`) para o efeito nunca parecer um bug.

**Consequências na UI.** No `TransactionEditModal` a rubrica passa a ser read-only quando há vínculo, com link para a linha do BP e opção de desvincular — sem isto, o realinhamento da BD parecia perda de dados. Nas superfícies que criam vínculos entre rubricas diferentes (`ReconciliacaoBpTx`, botão "Vincular e mudar L3") há confirmação explícita a dizer qual a rubrica de origem e de destino.

**Ressalva conhecida (issue #29).** O vínculo é 1:1 (uma linha, uma transação), pelo que uma linha paga em N documentos só tem FK à primeira; as restantes ficam associadas por rubrica. A coerência aqui só cobre a transação com FK. O modelo N:1 fica para a issue #29 — até lá, a regra "a rubrica da linha manda" aplica-se apenas ao par com FK. **Atualização (ago/2026):** esta ressalva caiu — o vínculo passou a N:1 canónico em `transactions.forecast_id`. Ver D-ERP1, na secção MP ERP.

**Guarda de remoção (issue #59).** No mesmo ciclo: uma transação já reclamada por FK por **outra** linha do BP deixa de contar como realizado desta linha e deixa de bloquear a sua remoção (`claimedByOtherForecast` em `src/lib/bp-tx-matching.ts` e `EventForecast.tsx`). Transações órfãs continuam a ser apanhadas por rubrica.

## D-ERP9 — A base de apuramento da despesa é do SÓCIO, não só do evento

A MP produz em Portugal com artistas brasileiros. Um sócio com sede fora de Portugal não
recupera o IVA português: o custo real dele é o valor c/IVA. Um sócio português recupera:
o custo é a base líquida. O mesmo evento pode ter os dois, pelo que um único
`events.partner_calc_basis` não consegue descrever o contrato de ambos.

`event_partners.expense_includes_iva` passou a ser **anulável**: NULL herda a base do
evento, `true` apura c/IVA, `false` apura s/IVA. Os 8 registos existentes foram convertidos
para NULL — antes estavam todos a `false`, o que em eventos contratados a
`net_result_gross_expenses` produzia a base errada nos relatórios de DRE.

Consequência dura: o seletor de IVA do Fecho deixa de tocar em qualquer valor apurado. Ele
já era declarado vista (D-ERP4), mas alimentava a quota através de
`p.expense_includes_iva || basis.withVat` — um flag que só ligava, nunca desligava. Agora
manda apenas nos totais que se veem e no PDF de resumo; a quota, as "pagas pelo sócio", os
extras e os pools de liquidez seguem contrato.

Quando os sócios de um evento apuram em bases diferentes **não existe um resultado único** e
a soma das quotas não fecha contra um único número. Isto é uma propriedade do contrato, não
um erro de cálculo, e está sinalizado com nota no ecrã e no PDF.

## D-ERP10 — Base de apresentação uniforme no Encontro de Contas (31/08/2026)

**Decisão:** a Mundo Propício segue a base contratual do evento no Encontro de Contas
apresentado aos sócios, mesmo quando essa base é c/IVA e a MP é portuguesa. A posição real
da MP — que é s/IVA porque o IVA português é dedutível — passa a estar reconciliada num
bloco interno do ecrã, não incluído no PDF.

**Porquê:** em eventos com sócios de países diferentes, o documento apresentado aos sócios
mantém uma base uniforme (normalmente c/IVA nas despesas) para evitar discussão entre
sócios. O sócio português sabe que esse apuramento c/IVA existe para apresentação aos sócios
brasileiros. O IVA que entra na base dos sócios é dedutível para a MP, pelo que a posição
real da empresa é superior à quota nominal mostrada no acerto. Hoje essa diferença não
aparecia em lado nenhum.

**Implementação:** o bloco "Posição da Mundo Propício · Interno" no
`PartnerSettlementTab.tsx` mostra:
- resultado do evento a s/IVA;
- menos a quota de cada sócio não-casa na sua base efetiva;
- igual à posição real da MP;
- sublinhado pela quota nominal e pelo "IVA não repassado".

**Restrições:** o bloco só aparece quando existe casa e o evento não ignora despesas
operacionais (`gross_revenue`). O valor mostrado é anterior a acertos de IVA entre a
Mundo Propício e sócios portugueses, que são tratados fora do sistema e arquivados em
Documentos do evento. Não altera quotas, saldos nem o PDF.
