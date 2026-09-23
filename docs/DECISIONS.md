# Decisões — MP Gestão Eventos / MP Audience

> Registo das decisões de arquitetura/produto e o seu PORQUÊ. Formato ADR leve: cada decisão = o que se decidiu + racional + estado (vigente / substituída).
> Documento vivo, organizado por módulo. Decisões antigas não se apagam — marcam-se "substituída".
> Como funciona o sistema vive em ARCHITECTURE.md; pendências vivem nas GitHub Issues.
> Última atualização: 18/set/2026.

## Transversal / Infraestrutura

### D1 — Lovable Cloud é permanente (mai/2026)
**Decisão:** A stack assenta em Lovable Cloud (Supabase por baixo); não migrar para Supabase direto nem outra infra.
**Porquê:** Pedro orquestra IA sem escrever código; o Lovable dá o fluxo propor→executar→Publish. Migrar acrescentaria complexidade sem ganho.
**Reavaliar só se:** 500+ promotores ativos ou $5M+ ARR.
**Estado:** vigente.

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

## D-ERP15 — Saldo de bilheteira: fonte única, e a transferência quinzenal não se rateia (08/09/2026)
**Decisão:** `computeTicketOfficeBalance` em `src/lib/ticket-office-balance.ts` é a única fórmula do saldo de uma bilheteira, no total e por evento. Conta como saída tanto as despesas como as transferências, o que faz o saldo fechar em zero depois de um fecho totalmente registado.
**Nota de correção (08/09):** neste sistema **não existem transações de tipo `transfer`** — o `transactions_type_check` só aceita `income` e `expense`. Uma transferência entre contas é um **par**: `expense` na conta de origem e `income` na de destino, ambas na rubrica `10.3 Transferências Internas`, ligadas apenas pela descrição. É o que o `TransferFormModal` faz. O tipo `transfer` continua previsto na fórmula do saldo por robustez, mas nunca ocorre.
**Porquê:** existiam três fórmulas divergentes e nenhuma contava as transferências; o saldo subia depois de um fecho em vez de descer. O relatório usava ainda `paid_amount || amount`, fazendo uma despesa aprovada e não paga contar pelo valor inteiro.
**Regra de negócio associada:** a transferência quinzenal da bilheteira cobre vários eventos e é arredondada. Não se rateia por estimativa — entra sem evento, e a alocação por evento nasce no fecho, a partir do apuramento da bilheteira. O adiantamento só nasce quando se sabe o evento.
**Estado:** vigente. A vista analítica do relatório ainda não reconcilia por evento (issue #128).


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

## D-ERP11 — Insert sob service_role passa `company_id` explícito da linha, nunca depende de `current_company_id()` (01/09/2026)

**Decisão:** qualquer insert feito por edge function sob `service_role` passa `company_id` explicitamente, e o valor vem da linha de negócio a que o registo diz respeito (ex.: `transaction.company_id` para uma linha de auditoria dessa transação), nunca do perfil de quem está a chamar nem de `current_company_id()`. O trigger mantém-se duro, como última linha de defesa. Escritas secundárias não-bloqueantes (auditoria, logs, propagação) capturam e registam o erro — nunca o engolem.

**Contexto:** `set_company_id_on_insert()` levanta excepção quando o insert omite `company_id` e não há contexto de utilizador. Sob `service_role` isso é sempre. Onde o erro era capturado e engolido, a escrita desaparecia em silêncio — quatro meses de auditoria de transações perdidos (894 edições e 1.209 aprovações sem rasto), e o restore de `ticket_sales` impossível.

**Consequência:** a linha de auditoria pertence sempre à mesma empresa do registo que descreve, mesmo quando o utilizador tem acesso a várias. Não se cria variante "soft" da função nem se relaxa nenhum NOT NULL.

**Alternativas rejeitadas:** tornar `set_company_id_on_insert` soft em todo o lado — abriria buraco de isolamento multi-tenant, cuidado já registado na #53 e na #86.

**Estado:** vigente.

**Referências:** #86, #96, `claude/auditoria-company-id-service-role-2026-09-01.md`.

## D-ERP12 — Fonte única do saldo de conta financeira (07/09/2026)
**Decisão:** `computeAccountBalance` em `src/lib/account-balance.ts` é a única fórmula do saldo de uma conta: `initial_balance + Σ(income ? +paid_amount : −paid_amount) + ajustes de retenção/crédito`. Devolve `null` quando `skip_balance_check = true`, e o interface mostra "Sem controlo de saldo" — uma conta sem controlo de saldo não exibe saldo em lado nenhum.
**Porquê:** Existiam sete cálculos independentes do mesmo saldo, com regras divergentes, e dois deles omitiam os ajustes de retenção. Uma conta configurada como sem controlo de saldo mostrava um número que ninguém validava.
**Não filtra `reversed_at` nem `status`:** a RPC `reverse_transaction` põe `paid_amount = 0` nos estornos `cash_refund`, e nos estornos `supplier_credit` o dinheiro saiu mesmo da conta. `paid_amount` já distingue os dois casos.
**Exceção deliberada:** os ecrãs de sessão de camarim/cartão continuam a mostrar o saldo da sessão, que é coisa diferente do saldo da conta.
**Estado:** vigente. Aplicado em cinco consumidores; o export do extrato, o Fluxo de Caixa, a Projeção de Tesouraria e `get_event_cash_position` ainda não seguem a regra (issue #90).

## D-ERP13 — Conta-espelho de sócio: o aporte em espécie é derivado, não digitado (07/09/2026)
**Decisão:** Numa conta marcada `mirror_partner_aporte`, cada despesa paga gera automaticamente um aporte de igual valor para o sócio de `partner_id`, por trigger. O aporte sincroniza com o `paid_amount` da despesa.
**Porquê:** O aporte em espécie não é uma decisão, é uma identidade — o sócio pagou, logo aportou. Escrito à mão, nasce certo e envelhece: o aporte de Madrid foi lançado a 31/08 e sete despesas entradas a 01/09 nunca lhe foram somadas, deixando a conta a −5.947,63 sem que nada avisasse.
**Âmbito:** só despesas, só contas com a flag. O espelho segue a transação e o seu `paid_amount`, nunca a linha de BP nem `transaction_payments`.
**Estado:** vigente. Aplicado a uma conta. Falta o painel que mostre quanto o sócio ainda tem a devolver.

## D-ERP14 — Despesa com pagador sócio: o custo é do evento, a fatura é do sócio (07/09/2026)
**Decisão:** Quando uma linha de BP tem `paying_partner_id`, a MP não recebe a fatura do fornecedor. O documento fiscal da MP é a fatura do sócio, a lastrear reembolso mais lucro. Essas linhas não geram transações com fatura no ERP.
**Porquê:** Lançá-las contaria o custo duas vezes quando a refaturação chegar. A linha do BP é a verdade de gestão; a fatura do sócio é a verdade fiscal; reconciliam pelo total.
**Consequência:** o "realizado" dessas rubricas nunca é preenchido por transações — chega de uma vez. Relevante para a frente `bp-x-resultado`.
**Estado:** vigente. Confirmado para a EIN na Anitta.



## 2026-09-02/03 — O BP como base real de custos e de receita (D1–D17)

- **DR-2026-09-02-D1 — A linha de BP é obrigatória, por caso.** Rubrica com uma linha: FK automática. Rubrica com várias: obriga a escolher. Rubrica sem linha: oferece criar a linha NA APROVAÇÃO, não no lançamento — quem lança pagamentos pode não ser quem gere o BP, e travar no lançamento em dia de evento faz com que não se registe. A órfã deixa de existir em evento com BP; nunca esteve fora da apuração, estava fora da ATRIBUIÇÃO (ordenador/pagador).
- **DR-2026-09-02-D2 (revista 03/09) — Excesso: aprovar implica elevar a linha, sempre e em todos os actos de aprovação.** Não trava no lançamento. Na aprovação — Transações, reembolsos, camarim, cachê fixo, e cartões quando passarem ao modelo do camarim — se o realizado da linha ultrapassa a verba, a linha é elevada no mesmo acto, com observação obrigatória e a permissão `raise_budget`; sem a permissão fica pendente e escala. Não existe "assumir o excesso" nem normalização posterior: a linha nunca fica abaixo do realizado e o BP é o norte; o excedido deixa de existir como estado do BP e vive só em `amount` versus `baseline_amount` (D3) e na curva (D4). A análise faz-se sobre a SOMA por linha, nunca despesa a despesa: reembolsos por par evento × rubrica, camarim por sessão, lote de transações por linha. Cachê variável: a linha é do módulo e ele actualiza-a sozinho. Eleva-se a LINHA, não a L3. Sem limite em euros. A pergunta vem pré-respondida ao cêntimo; várias linhas no mesmo acto, uma observação. O histórico já excedido normaliza-se na próxima aprovação de cada linha, não por fora.
- **DR-2026-09-02-D3 — Previsto original ao lado da verba corrente.** `baseline_amount` fixo, `amount` móvel. O fecho usa o corrente; a curva de erro usa o original. Sem isto, a elevação obrigatória do D2 apagaria o erro de previsão.
 - **DR-2026-09-02-D4 — A curva de evolução é por L3, sobre o audit log.** Não por linha: em 2,5 meses houve 602 criações e 490 exclusões de linha, e uma curva por linha faz buraco a cada exclusão. Versão congelada responde "de onde saímos"; o audit log responde "por onde passámos".
   - **Adenda 2026-09-07 (construído):** RPC `public.event_bp_evolution(_event_id, _from, _to)` (STABLE SECURITY DEFINER, `view_bp`/acesso ao evento) reconstrói o previsto de despesa por L3 **retroactivamente a partir do estado actual**, desfazendo `system_audit_log` sempre desde `current_date`; origem = Σ `baseline_amount` (D3); **sem série antes de 2026-06-17**. Marcos: versões congeladas (`active`/`superseded`) e `annotated_change` (observação em `forecast_audit_log`) — não há marca própria de elevação de verba (`raise_forecast_budget` só escreve observação). UI: sub-separador "Evolução" no BP, só leitura.

- **DR-2026-09-02-D5 — Versões congeladas continuam voluntárias.** Congelar é decisão de gestão; o sistema não obriga em marco nenhum.
- **DR-2026-09-02-D6 — Modo do evento: com BP ou sem BP, declarado à nascença.** Default por empresa, override por evento. As empresas BR do grupo quase nunca fazem BP e o sistema não deve decretar essa mudança cultural. ARMADILHA: `operacao_mode` é outra coisa (fases do Hub de Produção).
- **DR-2026-09-02-D7 — Permissões são configuração, não código.** O modelo de override por utilizador e por empresa JÁ EXISTIA (user_permissions + has_permission_in) e estava em uso com 83 overrides; o que faltava era as RPCs usarem-no em vez de has_role. Sem limites em euros.
- **DR-2026-09-02-D8 — A regra vive no servidor, não nos modais.** As transações nascem em oito caminhos; três nunca escrevem linha. Pôr a regra no formulário significa implementá-la oito vezes e reabrir o buraco ao nono modal. Excepções declaradas: filha de rateio e parcela herdam do pai.
- **DR-2026-09-02-D9 — O BP de receita fica dentro da aba Business Plan.** Sub-separadores Despesas | Receitas. Não há aba nova: o menu do evento já tem onze abas e a receita já vive em cinco delas. Se a receita sai do BP, o BP deixa de ser o plano do evento.
- **DR-2026-09-02-D10 — Modelo do BP de receita.** Híbrido por natureza da fonte: rubrica com módulo → linha sintética não persistida; sem módulo → linha manual (Merchandising, Camarotes, Outros). Patrocínios: linha real, nasce só em FECHADO, pelo botão — arrastar um card no Kanban nunca escreve no BP, e espelhar o funil no BP produziria leitura injusta do desempenho comercial. Planeamento por VERBA DE SEGMENTO consumida pelos fechados: previsto corrente = máx(estimativa − Σ fechados, 0). Encerramento da captação é acto datado com motivo. O fecho conta sempre só o fechado, sem opção.
- **DR-2026-09-02-D11 — IVA: o BP guarda base, mas prevê-se pelo desembolso.** O confronto BP vs realizado é sempre em base líquida; a taxa da linha é expectativa, não restrição; uma transação por taxa; linha de natureza mista (hotel com taxa turística, camarim) prevê-se pelo DESEMBOLSO e a base é derivada; o apuramento de IVA nunca lê a linha do BP.
- **DR-2026-09-02-D12 — Caminhos que aprovam transações com `service_role` têm de replicar as verificações do trigger.** O trigger `enforce_transaction_approval_permission` isenta `auth.uid() IS NULL` para não partir crons e escritas legítimas por `service_role`. Logo, qualquer edge function que aprove com `service_role` fica fora da trava e tem de verificar ela própria a permissão `approve_transactions` e a obrigatoriedade de linha de BP. Aplicado a `approve-transaction`. Regra geral para futuras edge functions que mudem status de transações.
- **DR-2026-09-03-D13 — A trava da linha de BP morde no nascimento, não no pagamento.** O trigger só via `'approved'`, e há caminhos inteiros que nascem `'paid'` e nunca lá passavam: cartões pré-pagos, camarim, e as transações consolidadas em geral. A verificação de linha passa a correr no `INSERT` que nasce `'approved'` ou `'paid'`, e no `UPDATE` que transita para `'approved'` — mas NÃO no `UPDATE` que transita para `'paid'`, porque 462 transações antigas estão aprovadas sem linha e bloquear o pagamento delas seria mexer para trás no meio de um fecho. A verificação de permissão continua exclusiva da transição para `'approved'`: pagar é outro acto.
- **DR-2026-09-03-D14 — Uma regra de servidor só pode morder onde o ecrã sabe oferecer o remédio.** Ao estender a trava ao `INSERT` partimos o modal de cachê, que criava despesa já aprovada sem linha e não tinha diálogo nenhum para propor. A regra e o remédio andam juntos: cada superfície que cria despesa de evento ganhou o `LinkBpLineDialog` (que passou a ter modo `pickOnly`, para a transação que ainda não nasceu) antes de a trava passar a cobri-la.
- **DR-2026-09-03-D15 — Cachê: variável é do módulo, fixo é despesa normal; a retenção sai do fluxo do cachê.** No cachê variável a linha de BP é criada e garantida pelo módulo, ligada ao `cache_config`, e a transação nasce vinculada — as N partes de um split na mesma linha. No cachê fixo não há linha automática: segue o fluxo de qualquer despesa, com a linha escolhida ou criada pelo utilizador. **Revisto em 03/09:** a retenção sai por completo do fluxo do cachê. A retenção **não é custo** — é parte do cachê do artista entregue ao Estado em nome dele, logo nunca despesa do evento, nunca linha de BP e nunca transação de despesa. Não é gerada, não é descontada no pagamento e não é sequer exibida (nem no modal, nem no acerto, nem no modelo de cálculo). Os únicos descontos que incidem sobre o cálculo automático são os do modelo configurado: `percentage`/faixas, `cache_revenue_basis`, `cache_deduction_basis` e `fixed_deduction_percentage`. As colunas `withholding_applicable`/`withholding_rate` ficam inertes na BD (3 registos a `true`), sem UI para as ligar.
- **DR-2026-09-03-D16 — Uma sessão de camarim, uma linha de BP.** A rubrica é sempre 2.6.04, logo a escolha é da sessão e não do grupo de consolidação: todas as transações de despesa da sessão nascem na mesma linha (N:1). As pernas do acerto de adiantamento são transferência interna 10.3 sem evento e não levam linha. Sessão que abranja mais do que um evento com BP é recusada até haver escolha de linha por evento.
- **DR-2026-09-03-D17 — O cartão pré-pago passa ao modelo do camarim.** As despesas do cartão deixam de ser transações à peça: são ITENS durante a sessão (`card_session_items`) e só viram transações na integração (fecho), consolidadas por **evento × rubrica × IVA**. Cada par evento × rubrica de um evento `with_bp` exige linha de BP (D1+D8) e a D2 aplica-se à SOMA do grupo, com os raises aplicados antes de qualquer transação. Itens **sem evento** (rubricas 10.x, estrutura) consolidam por rubrica × IVA e ficam fora do BP por completo — sem linha, sem gate, sem `forecast_id`. Portador obrigatório na abertura; N documentos por item (`card_item_documents`, bucket `card-documents`, refs `card://`); dossier, resumo de integração (`integration_summary`/`integration_transaction_ids`) e bloqueio pós-fecho como no camarim. A **conciliação de saldo mantém-se exactamente como estava** (ajuste sem categoria, sem evento, IVA 0, `exclude_from_result`). Sessões antigas e as 44 transações já criadas não se tocam; a função nova tolera transações directas antigas carimbadas com `card_session_id`, contando-as como gasto já integrado na conciliação.

- **DR-2026-09-03-D19 — O evento não fecha com sessão aberta.** A passagem a `completed` é recusada pela base de dados enquanto houver sessão de camarim por integrar ou sessão de cartão aberta ligada ao evento — é custo que ainda vai cair no evento depois de fechado. Despesas pendentes não bloqueiam: são aviso com confirmação, porque em eventos controlados por planilha (Coala 2026) o sistema é espelho e o responsável fecha com conhecimento. Uma função, `event_close_blockers`, serve o trigger e o ecrã.
- **DR-2026-09-03-D18 — Alocação obrigatória das transações antigas no fecho do cartão.** No fecho da sessão de cartão, as transações directas anteriores ao modelo de itens que tenham evento e rubrica são sempre alocadas à linha do par evento × rubrica — ou a uma linha criada na L3 se não houver — e entram no cálculo do excesso como "a alocar". Sem opção de as deixar soltas.
- **DR-2026-09-03-D20 — Duas cargas de bilheteira.** A carga inicial é a capacidade das zonas registada no planeamento e fica fixa: é o denominador da ocupação que diz se o evento correu como se planeou. A carga corrente é o que está de facto à venda na bilheteira — o último retrato diário de `event_zone_capacities`, capturado da Ticketline (`occupation.xlsx`) e do BOL — e muda ao longo da venda. A projecção do Simulador nasce da carga corrente e nunca fica acima dela. Os lotes do ERP são patamares de preço, não carga. A ocupação apresenta-se contra as duas cargas: 84% de uma carga reduzida não é o mesmo que 36% da carga planeada.


- **DR-2026-09-03-D21 — BP de receita, ronda 1: sub-separadores + linhas sintéticas com três colunas.** A aba Business Plan ganha os sub-separadores Despesas | Receitas (D9), com os cards de resumo sempre visíveis; o antigo `<select>` de tipo desaparece. As rubricas com módulo passam a linha SINTÉTICA (não persistida) com três colunas de valor: **previsto original** (fixado uma única vez em `events.ticketing_baseline_net` / `ab_baseline_net`), **previsto corrente** (ao vivo) e **real** (ao vivo). Bilheteira (1.1.01): original = carga inicial (`Σ event_ticket_zones.total_capacity`) × preço médio de planeamento dos lotes com `quantity>0`, `price>0`, `sync_generated=false`, ponderado e líquido (fallback ao preço médio real); corrente = receita de bilhetes do Simulador (`event_simulator_inputs` + `computeScenarioRevenue`, cenário forecast); real = `ticket_sales` linha a linha (D11), líquido pelo IVA do lote; IVA **efectivo por lote**, nunca 6% fixo. A&B (1.1.03): corrente = cenário A&B, real = `useEventABRealized`. Metadados na linha: cargas inicial e corrente com data (D20), vendidos e percentagens. Os totais e o estado vazio contam sintéticas + reais + manuais — cai o fallback antigo que somava só as persistidas, origem dos totais a zero e do "Sem receitas previstas" com linha visível. Patrocínios continuam linhas reais 1.2.*, e `syncSponsorToBP` recusa cards que não estejam em `closed`. O PDF do BP inclui a linha sintética com as mesmas fontes. Verba por segmento e encerramento da captação (parte do D10) ficam para a ronda 2.

- **DR-2026-09-03-D21 (adenda) — Fórmula fechada do previsto original da bilheteira.** A carga inicial das zonas é **capacidade**, não previsão de venda (na Ivete, carga × preço daria ~1,55 M€, irreal). O previsto original passa a ser: `previsto original (s/IVA) = min(carga inicial, Σ quantidade dos lotes de planeamento) × preço médio líquido ponderado dos lotes de planeamento`, com "lotes de planeamento" = `quantity > 0`, `price > 0`, `sync_generated = false` e preço médio `Σ(qty × price / (1 + iva)) / Σ qty`. Com Σ lotes ≤ carga inicial, o previsto original é simplesmente a receita líquida dos lotes de planeamento (Ivete: ARENA 2.100 × 70 + OPEN BAR 900 × 110, líquidos de 6% = 232.075,47 €). **Sem lotes de planeamento não há previsto original**: `null`, o ecrã mostra "—" e o `events.ticketing_baseline_net` nunca é gravado (nem 0, nem null). Cai o fallback anterior ao preço médio real × carga inicial, que inflacionava eventos antigos só com lotes sincronizados. Previsto corrente (Simulador sobre carga corrente) e real ficam intocados.

- **DR-2026-09-03-D21 (adenda 2) — Previsto corrente = cenário Forecast do Simulador ao vivo, nunca fallback estático.** O previsto corrente da bilheteira (1.1.01) deixa de sair de `computeScenarioRevenue(..., "forecast")` sem solver — esse fallback é `real líquido + projected_qty × TM` sobre `event_simulator_inputs` possivelmente parados (na Ivete, inputs de 2026-06-10 devolviam 1.570.023,87 €, com carga antiga de 20.000 e 3.027/1.083 vendidos). Passa a ser calculado ao vivo pelo helper partilhado `src/lib/event-simulator-forecast-live.ts` (`computeLiveTicketForecast`): vendas reais lidas agora de `ticket_sales` por zona, capacidade do solver = **carga corrente** (`zone_capacity_snapshot`, D20, com fallback à carga inicial), lotes/vendidos reais, data do evento (`event_dates` ou `events.date`) e os mesmos `forecast_final_accel`/`forecast_final_window_days` da página, seguidos de `solveForecast` + `computeScenarioRevenue(..., qtyByKey, revenueByKey)`. A página do Simulador e `useCitySimulator` passam a usar o mesmo helper para a capacidade, garantindo paridade. Sem config do Simulador **e** sem retrato de carga corrente → `currentNet = null` ("—"); nunca acima da carga corrente. Layout: as linhas de receita têm apenas três colunas de valor (previsto original · previsto corrente · real, todas s/IVA), com IVA (€) e total c/IVA em tooltip, e o meta numa única linha discreta por baixo do nome; o PDF segue as mesmas três medidas.

- **DR-2026-09-05-D22 — Patrocínios: verba por segmento, encerramento datado e sintética de receita.** O planeamento de patrocínios deixa de ser a soma dos cards: passa a ser VERBA POR SEGMENTO (`sponsorship_segments` + `event_sponsorship_targets`, `baseline_amount` fixado na criação e nunca reescrito). O BP de receita mostra UMA linha sintética 1.2.01 com previsto original (Σ verbas), previsto corrente (fechados + verba ainda não captada, enquanto a captação estiver aberta) e real (Σ cards fechados não-permuta), com sub-linhas por segmento. Encerrar a captação é acto datado (`events.sponsorship_closed_at`): a partir daí o corrente conta só o fechado e a verba não captada aparece como desvio. Reversível.
  Compatibilidade: **sem verbas definidas nada muda** — a sintética não aparece e as linhas 1.2.01 persistidas continuam a contar como hoje. Com verbas, as linhas 1.2.01 geradas por cards fechados são excluídas das listas e dos totais para não haver dupla contagem (a sintética já as representa). Nada é reescrito em cards, linhas de BP ou transações existentes.
  Correcções de robustez no mesmo acto: card meio-vinculado (só TX ou só linha) nunca gera de novo — devolve `half_linked` e o botão fica travado com aviso; a linha criada pelo pipeline nasce com `formalidade = 'fechado'`, coerente com o estado do card.

- **DR-2026-09-06-D23 — `working_draft` fica.** O estado `working_draft` de `bp_versions` é a sandbox editável de cenário (`create_scenario_draft` → edição das linhas em `event_forecasts.version_id` → `promote_scenario_to_active` ou `discard_scenario_draft`). Não é resíduo: é o único mecanismo para trabalhar um cenário sem tocar no BP oficial. A spec `.lovable/specs/bp-versions-spec.md` §14/§26 estava desactualizada (descrevia cenários como snapshots draft imutáveis) e passa a documentar o ciclo real. Versões congeladas continuam voluntárias (D5). Estado na Live a 06/09: 124 versões, 1 `working_draft` (Coala PT 2026 v51 "Câmara de Cascais", 20/05, 355 linhas em sandbox, evento encerrado, inerte).

## DR-2026-09-06 — Atribuição campanha→evento passa a configuração explícita por família de eventos

**Decisão:** A atribuição campanha→evento para efeitos contabilísticos deixa de depender do matcher de tokens e passa a ser configuração explícita por família de eventos.

**Contexto:** `crm.auto_link_meta_campaigns_to_events` liga por tokens de 4+ letras do nome do evento, exigindo dois acertos. Mediu-se que as 23 campanhas do Anitta que ligaram fizeram-no porque o nome continha uma data com "2026", não por semântica; seis campanhas "[REDESIGN] Ensaios da Anitta" ficaram órfãs por não terem ano no nome; e eventos cujo nome é apenas uma cidade, como "RG - Santa Maria da Feira", atraíam campanhas de outros artistas.

**Decisão tomada:** Duas colunas em `public.events` — `ads_allocation_level` (`'tour'` | `'cidade'` | `'externo'`) e `ads_match_aliases` `text[]` — e a função `public.resolve_ads_event`, que identifica a família entre os eventos com venda aberta no período da fatura, aplica o nível configurado, e resolve a cidade a partir de `public.cities` via `events.city_id`, nunca a partir do nome do evento. Cidade e ano nunca ligam sozinhos.

**Consequências:** Os dois auto-linkers continuam intactos a servir o dashboard do MP Audience — aproximação aceitável para leitura de gestão, não para contabilidade. O valor `'externo'` impede atribuições a eventos cujo tráfego é de terceiros (Deive Leonardo, agência Nonstop). A confirmação pela contabilidade tranca o vínculo, e a partir daí nenhuma regra automática lhe toca.

**Estado:** vigente.

## DR-2026-09-06-D24 — SSoT da receita do evento e base "Previsto + excedido" na receita

**Decisão:** A receita de um evento (ou Master + Splits) passa a ter uma única implementação, `src/lib/event-revenue-basis.ts` (`computeEventRevenueBasis` + hook `useEventRevenueBasis`), que devolve três bases:

- **`real`** — bilheteira de `ticket_sales` linha a linha (D11: `total_value` quando existe, IVA do lote, sem arredondar por bloco) + transações `type='income'` pelo filtro canónico do Fecho (`isValidFechoTransaction`: `status ∈ {approved, paid}`, `!is_transitory`, `!exclude_from_result`, `reversed_at IS NULL`, `!is_hidden`). Anti-duplicação por **prefixo** de rubrica `1.1.01` (`isBilheteiraCategoryCode`) quando há `ticket_sales` — a regra do Fecho é a canónica, por rubrica e nunca por heurística sobre a descrição. **`partially_paid` sai** da receita: o card contava-o, o Fecho não.
- **`currentForecast`** — bilheteira via `computeLiveTicketForecast` (D21 adenda 2); A&B via cenário forecast do módulo A&B (injectado pelo hook, porque vive em `useEventABScenarios`); patrocínios via `computeSponsorshipSynthetic` (previsto corrente com verbas, fechados sem verbas, D22); outras receitas = linhas de BP `type='income'` da versão activa não representadas por sintéticas. `null` por componente quando não há base.
- **`committed`** ("Previsto + excedido") — por componente `max(real, currentForecast ?? real)`: o previsto nunca fica abaixo do já realizado e, sem previsão, cai para o real. Espelha a regra do custo (`computeOutsideBpExcess`).

Devolve também a decomposição por bucket (Bilheteira / A&B / Patrocínio / Outros), em par `{net, gross}` no realizado, para o Fecho e o card manterem detalhe e o seletor c/IVA na vista. Previsto é sempre s/IVA.

**Consumidores** (cálculo local apagado): `useEventFinancialCardData` (Realizado = `real`, Previsto + excedido = `committed`, Forecast = `currentForecast`), `EventFecho`, `EventDetail` (bilheteira via `fetchTicketSalesRevenue`) e `computeTicketSynthetic` (real da bilheteira). Custo e Fecho de despesas ficam intocados.

**Verificação (06/09, Live):** Ivete Clareou 2026 — real 501.415,16 € s/IVA = bilheteira 465.238,21 € + patrocínios 36.176,95 € (10.976,95 em 1.2.01 + 25.200,00 em 1.2.02), idêntico ao cêntimo antes e depois no card e no Fecho. Anitta - EDA 2026 — real 2.527.352,94 € s/IVA = bilheteira 2.286.981,13 € + A&B 130.112,00 € + patrocínios 21.813,01 € + outros 88.446,80 €, idêntico antes e depois. Nenhum dos dois tinha transações `partially_paid` nem transações de receita em `1.1.01`, pelo que a mudança de critério não altera nenhum evento existente.

**Estado:** vigente.

## DR-2026-09-07 — Uma guarda que não conseguiu correr nunca conta como guarda que passou

**Contexto:** A reversão de uma fatura Ads apaga transações. As guardas que a impedem consultam sete tabelas. Na primeira implementação, o `error` devolvido pelo Supabase era descartado em todas: se uma query falhasse — coluna errada, RLS, o que fosse — `data` vinha `null`, o ciclo não corria e a guarda passava como se estivesse tudo limpo. Uma das colunas estava mesmo errada (`note_id` em vez de `reimbursement_note_id`). A guarda mais perigosa era a de `accountant_transaction_reviews`, cuja FK é CASCADE: uma falha silenciosa ali apagaria a conferência do contabilista sem deixar rasto.

**Decisão:** Em qualquer operação destrutiva, uma consulta de guarda que devolva erro aborta a operação com 500 e mensagem que nomeia a guarda. Nunca se trata ausência de resultados indistinguível de falha de consulta como ausência de impedimentos.

**Consequência:** Aplica-se a toda a `ads-invoice-apply` e é o padrão a seguir em qualquer código futuro que apague ou reverta dados.

**Estado:** vigente.

## D-ERP16 — Taxa de conveniência não é receita de bilheteira (08/09/2026)

**Contexto:** No H&K Madrid, o painel da Onebox mostra *Facturación* (18.815,75 €) e *Recargo promotor* (1.882,46 €) em separado, e um *Total ingresos* que é a soma. A leitura inicial foi registar o Total ingresos como bruto da bilheteira, o que dava um líquido correto por acaso — porque ambas as parcelas levam 10% de IVA dentro — mas inflacionava a receita em ~1.317 €, que são do El Corte Inglés e nunca passam pela MP.

**Decisão:** `ticket_sales.total_value` guarda **exclusivamente o preço do bilhete** (a *Facturación*, com o IVA da praça dentro). A taxa de conveniência cobrada ao público **não entra na bilheteira**: a parte que reverte para a MP entra como receita autónoma na rubrica **1.3.04 Revenue Share**, no fecho e pelo valor apurado, nunca por percentagem estimada sobre um snapshot de vendas. A comissão do recinto sobre a bilheteira segue a mesma regra e entra em **4.3.01**.

**Razão:** A receita do evento é calculada de `ticket_sales` (DR-2026-09-06-D24), não de linhas de BP. Meter no `total_value` dinheiro que pertence a terceiros contamina a base de receita de todos os ecrãs a jusante — card financeiro, Fecho e cachê variável — sem deixar rasto.

**Consequência:** Vale para qualquer bilheteira com fee ao público separado do preço, não só a Onebox. O IVA aplica-se por praça (PT 6%, ES 10%) e o default da coluna `event_ticket_lots.iva_rate` é 6, o que obriga a passar 10 explicitamente em Espanha.

**Estado:** vigente.

## D-ERP17 — Fatura só se agrupa sozinha quando o documento é o mesmo (08/09/2026)

**Contexto:** A 08/09/2026 apareceram três talões da BP Estoril lançados com o mesmo nº
`FS 270072003/167876`, dois dos quais eram o **mesmo talão duplicado** e um era um documento
diferente. O auto-agrupamento por fornecedor + nº de fatura juntou-os num único
`invoice_group_id`, o que os tornaria uma transferência única e propagaria eliminações e
liquidações entre documentos sem relação. A correção do incidente foi manual.

**Decisão:**
1. O agrupamento **automático** por fornecedor + nº de fatura só acontece quando as linhas
   **partilham o documento anexo** (mesmo `transaction_documents.file_url`) ou quando
   **nenhuma tem documento**. Documentos diferentes nunca agrupam sozinhos: aparece um
   diálogo e exige-se confirmação humana explícita — inclusive no botão manual
   "Agrupar fatura", que passa a pedir uma segunda confirmação.
2. O **número impresso no documento manda** sobre o campo preenchido à mão: quando o OCR lê
   um número diferente, substitui o `invoice_ref` e avisa.
3. Existe **auditoria por OCR dos grupos já existentes** (`audit-invoice-groups` + painel
   `/admin/auditoria-grupos-fatura`) que só **desagrupa**, nunca junta, e cuja aplicação está
   presa à corrida mostrada no ecrã.
4. O aviso de duplicado por fornecedor + nº de fatura só dispara quando o **valor também
   coincide**. Nº igual com valor diferente é a fatura legítima repartida por várias linhas
   de BP.

**Razão:** O nº de fatura é digitado à mão e repete-se por erro; o ficheiro anexo é a única
prova de que duas linhas são o mesmo documento. Juntar por engano é destrutivo (pagamento
único, propagação de eliminação); não juntar é apenas inconveniente.

**Consequência:** Grupos legados não são mexidos automaticamente — passam pela auditoria.
Ver `.lovable/memory/features/invoice-groups.md`.

**Estado:** vigente.

## D-ERP18 — Trocar a versão do BP nunca pode apagar o vínculo das transações (08/09/2026)

**Contexto:** a FK `transactions.forecast_id` é `ON DELETE SET NULL` e as funções que trocam a versão do BP apagam as linhas vivas antes de as repor. O vínculo era destruído sem erro e sem rasto.

**Decisão:** qualquer função que apague linhas vivas de `event_forecasts` tem de capturar os vínculos antes do `DELETE` e repô-los depois, com o resultado registado no audit. A reposição liga por id ou por rubrica + descrição, e **nunca adivinha** quando há mais do que uma candidata — o que não puder ser reposto fica contado como `unmatched`, visível, nunca silencioso.

**Razão:** é a mesma regra da DR-2026-09-07 — uma guarda que não consegue correr não conta como guarda que passou. Um vínculo apagado em silêncio tira a transação da linha de BP e do realizado sem que ninguém saiba.

**Consequência:** vale para as três funções actuais e para qualquer futura. A trava passa a contar `transactions.forecast_id` e não `event_forecasts.transaction_id`, que é só a âncora.

**Estado:** vigente.

## Nomenclatura das versões de BP (08/09/2026)

Contexto: o termo "Versão Ativa" fazia dois trabalhos diferentes no UI — a etiqueta do snapshot congelado e o oposto de "cenário sandbox". Existiam três mapeamentos state→label independentes e divergentes (STATE_META no BPVersionsHistoryModal, labelOf no BPVersionsCompareModal, e um Badge hardcoded no BPVersionCard), pelo que mudar um não propagava.

Decisão — vocabulário único, a usar em todo o novo código:

| Conceito | Termo no UI | Verdade técnica |
|---|---|---|
| Linhas vivas do BP, editáveis | **BP em produção** | `event_forecasts.version_id IS NULL` |
| Fotografia oficial mais recente | **Última Congelada** | `bp_versions.state = 'active'` |
| Fotografia oficial anterior | **Histórico** | `state = 'superseded'` |
| Snapshot guardado sem promover | **Rascunho** | `state = 'draft'` |
| Sandbox nomeado, isolado | **Cenário** | `state = 'working_draft'` |
| Fora de circulação | **Arquivada** | `state = 'archived'` |

"Ativa" está proibido como texto de UI: sugere "em vigor / editável", quando o que a etiqueta marca é apenas "última versão congelada". Promover um cenário diz-se "promover a versão congelada", nunca "promover a Ativa".

Os literais de estado em BD ('active', 'superseded', ...) NÃO mudam — a decisão é exclusivamente de camada de apresentação. Alterá-los partiria RPCs, RLS e o Portal do Sócio.

Termo técnico `superseded` nunca é exposto ao utilizador.

## Fiabilidade da lotação (09/09/2026)

Contexto: o BI de Vendas precisa de ocupação, e a lotação por zona (`event_ticket_zones.total_capacity`) está preenchida de forma desigual — muita dela nasceu do import, não da sala.

Decisão — a lotação de um grupo de eventos (`coalesce(parent_event_id, id)`, `management_type = 'own'`) só é utilizável quando as três condições se verificam:

1. nenhuma zona tem `total_capacity` nulo;
2. nenhuma zona tem vendido acima da lotação;
3. **não** todas as zonas têm lotação exatamente igual ao vendido.

A terceira condição é a que se erra com facilidade. Uma zona esgotada tem **legitimamente** lotação igual ao vendido — não é erro nenhum. Só se torna sinal de preenchimento automático pelo import quando acontece em **todas** as zonas do grupo, porque a probabilidade de um tour inteiro esgotar zona a zona ao bilhete é nula.

Decisão complementar, sem excepções: **onde a lotação não é fiável, não se apresenta ocupação nem se estima**. Mostra-se um traço. A razão é prática — um número inventado de ocupação acaba num PDF que vai para um sócio ou para um artista, e a partir daí passa a ser tratado como facto. Vale mais o traço.

A 09/09/2026, de 12 tours só 4 passam: Madrid, Ivete, Maiara e Maraisa, e Plenitude. A limpeza dos restantes é trabalho de dados, não de código.

## BI de Vendas separado dos Relatórios (09/09/2026)

Contexto: existiam ~30 relatórios em `/relatorios` e a tentação era acrescentar lá mais um. Não é a mesma coisa.

Decisão — o BI de Vendas tem **entrada própria na barra lateral** e vive em `/vendas`, `/vendas/:groupId` e `/vendas/:groupId/:eventId`, fora de `/relatorios`.

O critério da separação é a pergunta a que cada um responde. **Um relatório responde a "dá-me esta lista"**: abre vazio, exige filtros, produz um extracto para conferir ou exportar. **O BI responde a "o que está a acontecer"**: abre já preenchido, ordenado por quem precisa de atenção, sem o utilizador escolher nada. Misturar os dois na mesma gaveta obriga a quem quer o segundo a comportar-se como quem quer o primeiro.

Nota: os ~30 relatórios existentes **ficam para auditoria à parte** — há relatórios sem sentido e com informação partida desde a criação. Essa revisão não bloqueia o BI nem se faz de arrasto.

## D-ERP19 — O adiantamento abate-se numa secção só, nunca em duas (09/09/2026)

Contexto: no fecho da Ticketline da Anitta EDA 2026, os 11 adiantamentos (1.103.500,00 €) apareciam ao mesmo tempo na secção "Adiantamentos já recebidos" (onde são abatidos automaticamente) e na lista de "Despesas pagas pela bilheteira (c/IVA)" como deduções marcáveis. A causa: um adiantamento é, na prática, uma despesa `paid` na conta da própria bilheteira — exactamente o critério que a lista de deduções usava. Marcar um deles subtraía o valor duas vezes ao líquido a transferir, sem qualquer aviso.

Decisão — **cada abatimento tem um e um só sítio no fecho.** As transações referidas por `event_ticket_office_advances.transaction_id` (do evento e da bilheteira em causa) são **sempre** excluídas da lista de deduções, independentemente do estado do adiantamento. Única excepção: se a transação já estiver ligada a este fecho por `settlement_id` — caso de edição de um fecho antigo — mantém-se visível, para não alterar retroactivamente um fecho já confirmado.

Decisão — **a lista de deduções passa a distinguir factos de candidatos.** Grupo "Pagas por esta bilheteira" (despesas já `paid` na conta desta bilheteira: dinheiro que saiu mesmo) primeiro; grupo "Em aberto neste evento — marca só se foram pagas pela bilheteira" (pending/approved, de qualquer conta) depois. O cálculo não muda: o total de deduções continua a ser a soma do que estiver marcado, venha do grupo que vier. A separação é de leitura — juntar as duas naturezas na mesma lista sem cabeçalho convida a marcar coisas que a bilheteira nunca pagou.

## D-ERP20 — Fecho de bilheteira: dinheiro ao cêntimo, rateio só pelo Master, "em aberto" recolhido (2026-09-09)

Contexto: o fecho da Ticketline da Anitta EDA 2026 (settlement `ed7b4b3c…`, bruto 2.424.200,00 · deduções 1.320.700,00 · 11 adiantamentos · líquido 0,00) correu bem, mas deixou três arestas na lista de "Despesas pagas pela bilheteira" e uma no arredondamento.

Decisão — **o dinheiro escrito pelo fecho nunca tem mais de duas casas decimais.** O bruto c/IVA de cada dedução (o valor que vai a `paid_amount`), o total de deduções e o líquido calculado passam por `roundCents` (SSoT em `src/lib/iva.ts`). O `computeSettlement` mantém-se intacto: o arredondamento é aplicado nas entradas e na saída, não dentro da fórmula.

Decisão — **um rateio abate-se uma vez, pelo Master.** Os filhos de rateio nunca recebem `account_id` nem são pagáveis, logo marcá-los era uma opção falsa. Quando o Master de um filho deste evento está na própria lista, o filho sai. Se o Master não estiver elegível, o filho fica — nunca se esconde uma despesa sem alternativa visível.

Decisão — **o Master diz quanto é deste evento.** Cada Master de rateio mostra `fatura completa <total c/IVA> · parte deste evento <soma c/IVA dos filhos deste evento>` (ex.: META PLATFORMS, fatura completa 14.050,41 € · parte da Anitta 3.902,85 €). O valor marcável continua a ser o do Master: o fecho liquida a fatura inteira, e mostrar só o total esconderia que a maior parte pertence a outros eventos.

Decisão — **"Em aberto neste evento" começa recolhido e tem pesquisa.** O grupo "Pagas por esta bilheteira" (factos) continua aberto; o grupo dos candidatos abre por clique no cabeçalho, que mostra a contagem, e ganha pesquisa por descrição ou fornecedor. Abre-se automaticamente e não pode ser fechado sobre uma dedução marcada — nenhuma dedução marcada fica escondida.

## DR-2026-09-09-D25 — Apuramentos múltiplos por evento (fechos bilaterais, MP residual)

> **Nota de terminologia (Pedro, 13/09/2026).** O termo visível ao utilizador é **"Fechamento"** (fechamento do evento, fechamentos filhos), não "apuramento". Nos textos abaixo lê-se "apuramento" como sinónimo histórico. O modelo técnico mantém-se `settlement` (tabelas, colunas, funções, ficheiros). "Fecho" continua a designar a peça do fecho do evento (Encontro de Contas) e o fecho de bilheteira.

Decidida pelo Pedro a 09/09/2026. Deriva de `claude/varios-fechos-por-evento-possibilidade-2026-09-03.md` e `claude/apuramentos-multiplos-decisoes-2026-09-09.md` no projecto Claude. O padrão cobre 100% dos casos conhecidos em Portugal e no Brasil (Pedro, 09/09).

**Um evento tem N apuramentos.** Todos os eventos existentes ficam com exactamente 1 — a raiz, que apanha tudo o que não está marcado. Cascata e fechos exclusivos coexistem: um apuramento pode receber X% do resultado de um pai, calculado na base indicada, e um pai pode ter vários filhos sobre a mesma quota (fechos bilaterais irmãos).

**Participantes por apuramento**, com % de lucro, % de perda e base de IVA por participante. A Mundo Propício é **participante explícita** — deixa de ser "a diferença para 100%" injectada por `src/lib/house-partner.ts`. Não existe entidade "grupo": grupo = participantes do apuramento.

**Cada sócio é pago por exactamente um apuramento** (`settles`). Nos outros pode aparecer como quota nominal (`nominal`), só para calcular a parte de terceiros. Zero ou dois `settles` para o mesmo sócio é erro de configuração, recusado na hora.

**A MP é a residual.** Fica com a sua quota em cada fecho mais as diferenças nominal−real dos outros sócios. É isso que torna a Conferência 2 calculável.

**Perímetro por linha.** Receitas **e** despesas de BP e de transações podem ser marcadas com um apuramento; sem marca pertencem à raiz. Activos exclusivos entram no ERP como receita marcada com o seu apuramento — fora do resultado da raiz, dentro do seu. `exclude_from_result` deixa de ser o mecanismo para isto.

**Ajustes de base** (ex.: devolver o IVA dedutível das despesas do pai) são **regras calculadas**, nunca valores lançados à mão.

**Operações de terceiro** (bares, food, bengaleiro, merchandising, estacionamento) passam a entidade genérica com resultado próprio e uma forma de participação por apuramento: % do bruto | quota do resultado completo | per capita | fee. O A&B actual é o primeiro caso.

**Encontro de Contas e PDF por apuramento, estanques.** Cada sócio vê só os apuramentos em que participa; nenhum documento revela a existência dos outros.

**Fecho selado (#82) é por apuramento**, com versão do BP congelada.

**Invariante.** C1 = Σ pago a cada sócio no seu apuramento `settles` + residual da MP = receitas − despesas do evento (na base de cada um) + activos exclusivos. C2 = residual da MP = quota declarada da MP + Σ (nominal − real) dos outros + exclusivos que só a ela cabem. Recalculadas a cada alteração; um ajuste que as quebre é recusado.

**Caso de referência — Anitta EDA 2026, v4 de 08/09.** Nível 1: EDA 70% / locais 30% (⅓ nominal cada), base c/IVA. Nível 2: com a Carvalheira, 20% dos 30%, base c/IVA, com despesas exclusivas. Nível 3: com a EIN, 30% s/IVA com receitas e despesas exclusivas, ⅓ cada assumindo a Carvalheira a ⅓. A diferença entre o ⅓ nominal e os 20% reais da Carvalheira (23.887,34 € sobre 597.183,45 €) fica inteira com a MP.

**Estado:** decidida, por implementar (épica #146).

**Adenda — (a) construída em 2026-09-12.** Fundação aplicada: tabelas `event_settlements` (raiz única por evento, `parent_share_pct` + `parent_share_basis`, campos de selo) e `event_settlement_participants` (`house`/`partner`, `settles`/`nominal`, % lucro/perda, base de IVA, `can_order`/`can_pay`, `visible_in_docs`), com RLS no padrão de `event_partners` e trigger de integridade (um `settles` por sócio por evento; `house` só na raiz). Migração de dados só por INSERT: 7 raízes "Fecho do evento", 9 participantes espelhados de `event_partners` + 7 `house` (Σ % lucro = 100 em cada raiz). Espelho **temporário** por trigger AFTER INSERT/UPDATE/DELETE em `event_partners` (`event_settlement_sync_root`), com `event_partner_id` em CASCADE para o espelho não ficar órfão ao apagar um sócio; sai na sub-tarefa (e). UI: painel só-leitura "Apuramentos" na aba Sócios. Nenhum cálculo consome ainda estas tabelas — card, Fecho, Encontro de Contas, Portal e `house-partner.ts` continuam em `event_partners`.

## D-ERP21 — A trava da linha de BP aplica-se às transações que CONSOMEM verba (09/09/2026)

O gate de `enforce_transaction_approval_permission` passou a isentar `is_transitory`, `exclude_from_result`, `reversed_at` e `is_hidden` — o mesmo predicado que o frontend já usava em `countsAsBudgetCommitment` e em `hasResultBlockingFlags`. O que não consome linha não pode ser obrigado a ter linha. Caso canónico: o Extra do Sócio é custo do SÓCIO, nunca do evento, e estava a ser obrigado a passar pelo BP na criação. Não reabre o D1: a órfã continua a não existir para os custos do evento. `src/lib/bp-line-required.ts` foi sincronizado com a mesma isenção no mesmo dia.

## D-ERP22 — Reverter um Extra do Sócio exige linha de BP apenas quando já não há aprovação pela frente (09/09/2026)

Reverter é dizer "afinal o custo é do evento", logo aplica-se o D1. Mas só se trava a reversão quando a transação está `approved` ou `paid`: nesse estado não volta a passar pelo circuito de aprovação e ficaria despesa paga sem linha para sempre. Em `pending` não se trava — a aprovação pede a linha, e travar aqui seria pedir duas vezes. O remédio é o `LinkBpLineDialog` em modo `pickOnly`, e o `forecast_id` grava-se no mesmo update que desliga `is_transitory`.

## D-ERP23 — Extras do Sócio: duas naturezas, uma fonte, e o manual nunca converte IVA (09/09/2026)

`partner_advance_expenses` (a empresa pagou algo que é custo do sócio) e `event_partner_extras` (o sócio deve algo sem desembolso da empresa) são ambas legítimas e ambas abatem ao acerto; nenhuma é custo do evento. Passam por uma fonte única, `src/lib/partner-extras.ts`, lida pelo painel da aba Sócios, pelo Fecho do Evento e pelo Encontro de Contas — antes cada ecrã lia só metade e o saldo do mesmo sócio divergia entre os dois ecrãs de fecho. Os valores mostram-se na base do sócio (`event_partners.expense_includes_iva`, a null herda de `events.partner_calc_basis`): origem transação segue c/IVA quando aplicável; o extra manual não tem taxa nem documento — é um valor, não uma fatura — e entra sempre pelo valor escrito.

**Adenda (18/09/2026, #181):** um documento pertence à **fatura**, não à linha: anexar
propaga a todas as linhas do grupo, no ecrã e na API — um objeto no bucket, N linhas em
`transaction_documents` com o mesmo `file_url`. Remover um documento partilhado remove as N
linhas e o objeto só quando ninguém mais lhe aponta. Sem grupo, o ecrã propõe agrupar as
linhas do mesmo fornecedor com nº de fatura exactamente igual e só propaga depois de
confirmação humana. Desagrupar não apaga documentos.

## D-ERP24 — A fatura reparte-se, não se duplica (09/09/2026)

Quando só parte de uma fatura é Extra do Sócio, a principal passa a valer `total − X` e a irmã transitória vale X, com o mesmo `invoice_group_id`. Antes a principal ficava pelo total e os mesmos euros contavam duas vezes: no custo do evento e no débito ao sócio. `amount` e `paid_amount` são eixos independentes — o primeiro manda no custo e no BP, o segundo no saldo da conta, e `paid_amount` não é derivado de `transaction_payments`. A liquidação de grupo já reparte sozinha, por propagação às irmãs. Recusa-se a repartição quando há linhas em `transaction_payments` ou pagamento parcial, por não haver forma não-arbitrária de dividir o que já foi pago.

## D-ERP25 — O saldo inicial de uma conta tem data: antes do corte é história (09/09/2026)

`financial_accounts.initial_balance` é o saldo da conta ao FECHO de `initial_balance_date`. Movimentos com data efetiva (`COALESCE(payment_date, date)`) igual ou anterior ao corte já estão dentro desse valor e por isso deixam de somar; só o que vem depois conta. Sem data de corte (`NULL`) nada muda — o saldo inicial é um valor sem tempo e soma-se a tudo, e era exactamente isso que impedia pôr o saldo do banco numa conta com histórico já lançado: dava dupla contagem.

A regra vive na fonte única `computeAccountBalance` (D-ERP12) e propaga-se a todos os consumidores: módulo Contas, Extrato, Projeção de Tesouraria, sessões de cartão e `get_event_cash_position`. A implantação faz-se num modal por conta, só para admin, que mostra lado a lado o saldo calculado hoje e o que passará a ser calculado, e grava quem implantou e quando em `system_audit_log`. Nenhum valor é implantado pelo sistema.

Corolário do mesmo dia: onde a conta tem `skip_balance_check`, o saldo não é número — mostra-se "não controlado" e nunca zero nem negativo, incluindo no export do Extrato e na Projeção de Tesouraria, e `get_event_cash_position` deixa essas contas fora. E um estorno libertado para nova liquidação volta a `Aguardando` (não a "A pagar"): tem de ser aprovado outra vez. Quando é pago de novo, `reversed_at` e `reversal_kind` limpam-se — `reversal_reason` e a auditoria ficam — senão o custo desaparecia do BP e dos agregados do sócio, que filtram `reversed_at IS NULL`.

**Alcance fechado a 09/09 (segunda passagem).** O corte vale em TODAS as linhas do Extrato, não só na abertura: as anteriores ao corte já estão dentro do `initial_balance` e não voltam a somar, e a abertura funciona sem Data Início. As linhas do Extrato passaram a usar `paid_amount`, como a fonte única — com `amount` o relatório divergia do módulo Contas. Quando a conta tem `initial_balance_date`, os três sítios (ecrã, Excel, PDF) mostram "Saldo implantado a <data>: <valor>". `CardSessions.tsx` deixou de calcular à mão e usa `computeAccountBalance` com `buildAccountCutoffs`, mostrando "Não controlado" quando aplicável. `get_event_cash_position_invariant` passou a filtrar `skip_balance_check` e a data de corte, como o lado esquerdo já fazia — sem isso comparava universos diferentes e dava `is_balanced` falso por construção. A limpeza de `reversed_at`/`reversal_kind` na re-liquidação existe agora nos três caminhos de pagamento, incluindo o modal de parcela individual.

## D-ERP26 — Três fronteiras do Extra do Sócio e do rateio (09/09/2026)

Três regras que se apuraram no mesmo dia e que se explicam melhor juntas.

**(a) A isenção de BP segue a transitória, não a fatura.** Um Extra do Sócio total é transitório por inteiro e não consome verba — não leva linha de BP. Num extra PARCIAL a transação principal NÃO é transitória: é despesa do evento como qualquer outra e leva categoria e linha do BP; só a irmã é isenta. No ecrã, o painel do BP recolhe no extra total e reabre assim que o campo de parte tem valor válido.

**(b) A parte do sócio não entra no rateio.** Numa fatura que cobre vários eventos e inclui parte do sócio, lançam-se duas transações do mesmo documento: o valor dos eventos rateado pelos eventos, e a parte do sócio como transação própria no evento dele, com Extra do Sócio total. Partilham fornecedor e nº de fatura e ficam no mesmo `invoice_group_id`; a soma do grupo continua a ser o total da fatura (D-ERP17). O toggle 🧳 fica desactivado com rateio activo. **Converter uma FILHA de rateio em Extra do Sócio foi avaliado e recusado**: os sócios não se herdam do Master no modal de edição (0 de 22 subeventos da Live têm sócios próprios, pelo que o bloco nem aparece), a mãe passaria a divergir da soma das filhas sem que nada o verifique, a irmã do parcial nasceria sem `parent_transaction_id` e sairia da árvore do rateio, e o BP do Master continuaria a consumir verba com a perna já convertida.

**(c) `parent_transaction_id` tem dois significados, e só `split_percentage` os separa.** Filha de RATEIO (com `split_percentage`) reparte o CUSTO por eventos — o dinheiro sai uma vez, na mãe, e a filha nunca tem conta nem linha em `transaction_payments`; medido na Live: 137 filhas de rateio, zero com conta. PARCELA (sem `split_percentage`) é um PAGAMENTO real, na sua data e da sua conta — 12 na Live, e as que foram pagas têm conta e razão próprios. A propagação da liquidação desce às filhas de rateio e **nunca** toca em parcelas: liquidar o pai não faz sair o dinheiro das parcelas seguintes. Confundir os dois é o erro fácil deste modelo.

## D-ERP27 — Na página de Contas há três dinheiros diferentes, e só um é caixa (09/09/2026)

O cartão SALDO TOTAL somava tudo com a fórmula bancária e dava −1.994.414,66 €, um número que não significa nada: as bilheteiras entravam a −3.657.013,07 € (Ticketline) e −59.352,72 € (BOL) porque a receita de bilhetes vive em `ticket_sales` e não em `transactions` — a conta só via as saídas —, e a "Acerto EIN · Anitta EDA 2026" entrava a +905.000,00 € quando é um valor a receber, não caixa.

**SALDO TOTAL é caixa, e só caixa:** contas de tipo `bank`, `cash` e `prepaid_card`, e apenas as que têm controlo de saldo. As que ficam de fora por `skip_balance_check` são nomeadas em texto pequeno debaixo do valor (hoje Conta Pagamento Brasil e Eventos Históricos), para ninguém as supor contadas.

**Retido em bilheteiras é cartão próprio.** As contas `ticket_office` deixam de usar `computeAccountBalance` na coluna Saldo Atual e passam pela fonte única `computeTicketOfficeBalance` (D-ERP15), com vendas, transações, adiantamentos e eventos atribuídos buscados como no ecrã de Bilheteiras. É dinheiro que existe mas ainda não está na conta bancária: nunca soma ao caixa.

**Acertos em curso é cartão próprio.** As contas `other` (Acerto EIN, Pgto Mágicos Acerto Madrid, Pagamento Diretoria) são valores a receber ou a pagar, não caixa. Ficam fora do SALDO TOTAL e mantêm-se na tabela como estão.

Corolário: a data de corte do saldo inicial (D-ERP25) passa a sair em pt-PT na coluna Saldo Inicial, via `formatDatePT`.

**Estado:** vigente.

## D-ERP28 — O extrato do banco é um facto externo; a conciliação só liga (09/09/2026)

Contexto: o Santander Totta foi implantado com corte a 31/08/2026 e saldo 122.363,05 €. O sistema calculava 407.199,12 € e o banco, a 09/09, estava em 439.403,92 €. A diferença de 32.204,80 € eram movimentos de setembro por lançar, e não havia como a ver: não existia importação de extrato — nem tabela, nem parser, nem ecrã.

Decisão — **o extrato tem tabela própria e é lido, não interpretado.** `bank_statements` e `bank_statement_lines` guardam o que o banco declara, incluindo a linha original em `raw`. A identidade de uma linha (`line_hash`) é conta + data de movimento + data-valor + descrição normalizada + valor + **saldo após o movimento**. O saldo entra de propósito: é o único campo que distingue dois movimentos iguais no mesmo dia. Reimportar o mesmo ficheiro não cria uma única linha nova.

Decisão — **um ficheiro que não fecha não entra.** O saldo de cada linha tem de ser o saldo da anterior mais o movimento; se partir, a importação é recusada e diz-se em que linha. Contra o sistema a validação é mais fraca de propósito: se o saldo de abertura do extrato não bater com o `initial_balance` implantado (D-ERP25), importa-se **e avisa-se em destaque** — o erro está no corte ou no saldo implantado, não no ficheiro do banco.

Decisão — **a conciliação NUNCA altera transações.** Não liquida, não muda status, não escreve `paid_amount`. Só liga. Corre em camadas e pára na primeira que casa: lote SEPA, valor exato (`paid_amount` da mesma conta, ±5 dias na data efetiva) e descrição por semelhança (Dice ≥ 0,8, com o valor ao cêntimo). O que não casa fica `unmatched` e explica-se à mão, ou marca-se ignorada com nota obrigatória — e uma linha ignorada deixa de explicar qualquer transação.

Decisão — **o lote SEPA casa por total + data, não pelo `msg_id` inteiro (09/09/2026, correção).** O `msg_id` guardado (`PAGAMENTOS-MP-11082026-12080959`) não viaja inteiro na descrição do banco. As linhas reais do Santander são três e partilham um código de referência do banco: `LOTE TRF CRED SEPA+ -PAGAMENTOS-MP-310820-D485O347`, a sua `COMISSÃO` e o seu `IMP.SELO`, este último já com a data completa `31082026`. Por isso: casa-se pelo total **e** pela data presente na descrição, aceitando `DDMMAA` e `DDMMAAAA`; só se continuar ambíguo se usa o total isolado; com mais de um candidato não casa nenhum e fica por explicar. O código de referência (`D485O347`) é guardado em `bank_statement_lines.bank_ref` e serve **só** para mostrar agrupadas as três linhas do mesmo acontecimento — não lança nada.

Decisão — **o confronto é sistema × banco, não ficheiro × ficheiro (09/09/2026, correção).** O primeiro resumo comparava abertura + movimentos com o saldo declarado, tudo vindo do mesmo ficheiro; como o parser só aceita extratos coerentes, a diferença era sempre zero. O ecrã mostra agora o saldo do SISTEMA à data de fim do extrato (`computeAccountBalance`, com data de corte e ajustes de caixa, D-ERP12/D-ERP25), o saldo DECLARADO pelo banco, a diferença em destaque enquanto não for zero, e a decomposição dessa diferença nas suas duas causas: soma das linhas do banco por explicar e soma das transações sem movimento no banco.

Decisão — **reimportar não cria extrato fantasma (09/09/2026, correção).** Antes de inserir procura-se um extrato da mesma conta, mesmo período, com as mesmas impressões digitais de linha; se existir reutiliza-se e diz-se quantas linhas já existiam e quantas são novas. Se depois do upsert nenhuma linha ficou ligada ao extrato novo, ele é apagado. O ficheiro original fica arquivado no cofre privado `bank-statements`, isolado por empresa, e o caminho vai para `file_url`: o extrato é um facto externo e tem de poder ser reaberto.

Decisão — **os dois lados do desencontro têm o mesmo peso.** Ao lado das linhas do banco por explicar mostra-se, com o mesmo destaque, a lista de transações marcadas como pagas na conta, no período do extrato, sem qualquer movimento no banco. É a classe de erro dos Bombeiros: 1.328,45 € dados como pagos a 11/08 que nunca saíram, porque a linha caiu do ficheiro SEPA por não ter fornecedor. Um extrato conciliado a 100% do lado do banco pode continuar a esconder dinheiro que o sistema jura ter pago.

Decisão — **uma transação explica uma linha, e só uma (09/09/2026, correção).** As camadas passaram a correr como passagens sobre todas as linhas — primeiro todos os lotes SEPA, depois o valor exato, depois a descrição — partilhando o registo do que já foi consumido, incluindo todas as transações que entram por um lote através do `transaction_ids`. Caso que obrigou a isto: a transferência de −3.000,00 € para Pedro Coelho de Araújo casou por valor com a transação «Influencers», que o lote SEPA da mesma importação já tinha explicado.

Decisão — **lote SEPA gerado a dobrar não é ambiguidade (09/09/2026, correção).** Quando os candidatos empatados pertencem todos à MESMA lista de pagamento, são o mesmo lote gerado duas vezes (dois `msg_id` a um minuto de distância) e casam como um só, somando as transações de todas as exportações irmãs; só se recusa quando os candidatos são de listas diferentes. A linha conciliada diz quantas exportações teve, para se perceber que houve dupla geração.

Decisão — **a retenção na fonte é explicação, não divergência (09/09/2026, correção).** Num lote, o total do banco é o líquido e o do sistema é o bruto; a diferença é a retenção. Mostra-se na linha conciliada (bruto do sistema e retenção apurada) mas **não** entra na decomposição da diferença: o saldo do sistema já sai líquido, porque `fetchAccountCashAdjustments` desconta a retenção ao caixa. Medido no extrato de 31/08–09/09: retenção 207,00 € no lote de 08/09, e a diferença de 32.204,80 € fecha exatamente com as duas parcelas reais — 26.084,80 € de linhas por explicar e 6.120,00 € da SUPERSOUNDS sem movimento no banco.

Decisão — **voltar a conciliar não obriga a reimportar (09/09/2026).** Uma ação no ecrã corre outra vez as camadas sobre as linhas já importadas, sem apagar nada: só toca nas `unmatched` e nas casadas automaticamente (`auto:`), preserva as conciliações manuais — cujas transações continuam consumidas — as ignoradas e as anteriores ao corte.

Nada foi reimplementado: o lote SEPA usa o histórico `payment_list_sepa_exports` e o saldo vem sempre de `computeAccountBalance`. A semelhança usa `src/lib/string-similarity.ts`, casa única **no frontend** — a edge function `generate-historical-transactions` mantém cópia própria, com normalização diferente, e não foi unificada; quem mexer numa tem de ir ver a outra. A permissão `manage_bank_reconciliation` é atribuível no ecrã de Utilizadores e é ela (além de admin/gestor) que as policies de escrita testam. Todas as consultas do ecrã paginam: o PostgREST corta em 1000 linhas em silêncio e sem paginar a lista inversa enche-se de falsos positivos. O lançamento automático das linhas sem contrapartida é lote seguinte e não foi feito.

**Estado:** vigente.

## D-ERP29 — A linha do banco pode dar origem a um lançamento, sempre com confirmação humana (09/09/2026)

Contexto: das 57 linhas do primeiro extrato do Santander Totta, 36 ficaram por explicar (26.084,80 €) e nenhuma tinha transação no sistema — 33 não tinham sequer candidata em conta nenhuma. Conciliar não bastava: o lançamento faltava de facto.

Decisão — **a linha por explicar pode gerar a transação, mas só depois de as camadas de conciliação falharem (D-ERP28) e SEMPRE com confirmação humana.** Nada é criado automaticamente, nem quando uma regra casa: a regra PROPÕE o preenchimento (fornecedor, rubrica, IVA, evento, descrição, ação) e a pessoa CONFIRMA. As regras vivem em `public.bank_line_rules` (padrão de texto sobre a descrição normalizada, `contains` / `starts_with` / `regex`, direção, faixa de valor, ação `create_expense` / `create_income` / `create_transfer`), com a RLS do módulo financeiro e contador de utilizações.

Decisão — **o valor e a data vêm do banco e não se editam.** A transação nasce `paid`, na conta do extrato, com `payment_date` igual à data-valor e `paid_amount` igual ao valor bruto do movimento; `amount` é o líquido, como em todo o sistema. A linha fica ligada por `created_transaction_id` e conciliada (`matched_by = created:<email>`).

Decisão — **várias linhas podem dar UM lançamento pela soma.** As dezasseis linhas `EST-0002TPA-...` de 07/09 somam 27.241,87 € e são liquidações do terminal do bar do Ivete Clareou: lançam-se como uma receita em 1.1.03 F&B, com nota a dizer que a repartição bar/alimentação e as taxas do adquirente ficam por apurar no fecho do A&B. O valor lançado é o líquido que entrou no banco — a taxa não se inventa. Todas as linhas selecionadas ficam ligadas à mesma transação.

Decisão — **a regra aprende-se depois do primeiro lançamento à mão.** O padrão vem pré-preenchido a partir da descrição normalizada, sem a parte variável (o número ou o código de referência no fim), e a pessoa ajusta antes de gravar. As taxas bancárias — comissão de gestão 15,80 €, imposto de selo 0,63 €, e as comissões e impostos de selo dos lotes SEPA — vão para 10.6.01 Taxas e Encargos Bancários, sem evento: é o caso mais simples e o melhor para validar as regras.

**Adenda (18/09/2026):** o importador **recusa** ficheiro que não é da conta: só contas `type = 'bank'` recebem extrato (no seletor e na gravação), e uma abertura do ficheiro a mais de **1.000 €** e **10%** do último saldo conhecido da conta recusa a gravação, sem botão de forçar. A referência e a sua origem mostram-se sempre no resumo antes de gravar. Complementa a invariante `linha_conciliada_sem_transacao`.

**Adenda (22/09/2026) — a referência da trava 2 passa a ser o saldo à véspera de `period_from`.** A referência era o `closing_balance` do extrato mais recente da conta, e isso dava falso positivo com **períodos sobrepostos**: com o extrato 16/09→16/09 já importado (fecho 593.427,98 €), o ficheiro Santander 16/09→18/09 (abertura 482.158,14 €) era recusado com "este ficheiro não é desta conta" por 111.269,84 € — exatamente os movimentos de 16/09 (+112.000 −500 −230,16), que o fecho do extrato anterior já contava. A abertura de um ficheiro é o saldo no INÍCIO do primeiro dia, não o fecho do último extrato conhecido. A referência passa a ser apurada em cascata: (1) `balance_after` da última linha da conta com `booking_date < period_from`; (2) `closing_balance` do extrato mais recente com `period_to < period_from`; (3) `account_true_balances_asof` à véspera; (4) saldo implantado da conta. A regra de recusa (> 1.000 € **e** > 10%) e a trava 1 ficam intocadas; a mensagem continua a dizer o valor da referência, a sua origem e a data. No caso real a referência passa a 482.158,14 € (saldo ao fim de 15/09) e o ficheiro passa; o mesmo ficheiro na conta do cartão 0663 continua recusado por 480.886,90 €.

Nada foi reimplementado: a transferência usa o mesmo mecanismo do par do `TransferFormModal` (rubrica 10.3, saída e entrada) e as camadas de conciliação ficaram intocadas. Liquidação, listas de pagamento e Recorrentes não são tocados.

**Estado:** vigente.

## D-ERP30 — O débito por limiar do Google Ads é entrega de dinheiro, não custo (09/09/2026)

Contexto: os débitos diretos "Google Ireland L" de setembro (500, 500, 500 e 76,29 €) são cobranças por limiar: o Google debita quando o consumo acumulado atinge 500 €. Nunca correspondem a um mês nem a um evento.

Decisão — **estes débitos não são despesa de evento.** O custo de ads por evento vem de outro circuito, a camada de faturas de plataformas; lançá-los como despesa contaria o custo duas vezes. Trata-se cada débito como entrega de dinheiro ao Google: a regra gera o **par de transferência** — saída do Santander, entrada na conta financeira "Google Ads — conta corrente" (tipo `other`) — com a rubrica 10.3 Transferências Internas, pelo mecanismo já existente. O saldo dessa conta passa a ser o crédito que está no Google por consumir.

A geração das despesas por evento a partir das faturas de ads é outra frente e não foi construída.

**Estado:** vigente.

---

## D-ERP31 — A fatura em PDF é a fonte de verdade das faturas de ads; os ajustes descem ao evento (09/09/2026)

Contexto: assumiu-se, ao construir o `propose_google`, que a fatura do Google não trazia detalhe por campanha e que se podia reconstruí-la a partir do espelho da API. Traz. E o espelho não reporta os créditos promocionais: nos três meses medidos, o ERP somava 2.586,93 € e as faturas reais somam 2.273,03 € — 300,00 € de crédito promocional mais 13,90 € de desvios de mídia.

Decisão 1 — **a fatura é o PDF.** O espelho da API serve para acompanhar campanhas, nunca para lançar custo. O `parse_google` lê o PDF (número, período real, mídia por campanha, atividade inválida, créditos promocionais, taxas regulatórias) e recusa gravar se a soma das linhas não fechar o total ao cêntimo. O `propose_google`, que constrói a partir do espelho, fica marcado como legado.

Decisão 2 — **os ajustes não ficam a pairar sobre a fatura: descem ao evento.** Regra igual para Meta e Google:
- ajuste que identifica a campanha de origem (típico da "Atividade inválida") desce inteiro ao evento dessa campanha;
- ajuste anónimo (créditos promocionais, cupões, taxas regulatórias) é rateado à proporção da mídia de cada evento *na mesma fatura*, com o cêntimo residual na filha de maior valor;
- os ajustes não geram transações próprias — somam-se às filhas, e o comprovativo de veiculação do evento mostra a parcela rateada em linha própria;
- a geração é recusada se a soma das filhas mais o que está marcado como fora do sistema não der exatamente o total da fatura.

Decisão 3 — **importar uma fatura tem três fases, sempre.** Escolher plataforma e ficheiro; ler e mostrar o que o parser encontrou sem gravar nada (`dry_run`); gravar a proposta só depois da confirmação humana. O PDF fica arquivado no bucket privado `ads-invoices`, em caminho isolado por empresa.

Nota de infraestrutura: o `InvoiceService.ListInvoices` da Google Ads API v24 não é via para esta conta — o billing setup `8418160932` está aprovado mas em pagamentos automáticos, e a API devolve `BILLING_SETUP_NOT_ON_MONTHLY_INVOICING`. Não há `pdf_url` a puxar; o PDF entra à mão.

**Adenda (18/09/2026, #125) — "linha sem evento" é um critério só, e vive na base.** A definição é `public.ads_invoice_line_is_pending(ads_invoice_line)`: não é ajuste, não está marcada como fora do sistema, e não tem evento **ou** tem `match_source='none'` (união dos dois critérios que coexistiam — a lista escondia as linhas com evento e resolução falhada, que o detalhe e o `checkReady` já contavam). As contagens de linhas de fatura Ads vêm da RPC `public.ads_invoice_pending_counts(uuid[])`, agregada no servidor por fatura pedida — o ecrã nunca descarrega `ads_invoice_line` inteira e a barreira dos 1.000 do PostgREST deixa de existir aqui. **Ninguém reimplementa o critério no cliente nem em TypeScript:** lista, detalhe e `ads-invoice-apply → checkReady` consomem a mesma função.

**Estado:** vigente.

---

## D-ERP32 — Rateio de day-offs de turnê: encontro de contas gerencial (10/09/2026)

> **Parcialmente substituído pelo D-ERP69 (16/09/2026):** os pontos 2, 3 e 4 (despesa inteira com `exclude_from_result` contra conta de acerto, e passagem às rubricas só no acerto final) deixaram de valer. Mantêm-se os pontos 1 e 5.

**Rateio de day-offs de turnê — encontro de contas gerencial**

Contexto: numa turnê europeia, os custos de dias sem show (hotel e outros) são partilhados com as cidades de outros promotores. A parte da MP só se conhece no acerto final. Algumas faturas estão em nome da MP, outras em nome de terceiros. A questão fiscal resolve-se fora do circuito: no momento do movimento financeiro emite-se ou recebe-se fatura.

Decisão:

1. A previsão vive numa linha de BP "Rateio day-offs". Em turnê com Master, a linha nasce no **Master** e espelha-se proporcionalmente nas cidades. Em evento de **data única**, nasce no próprio evento. O mecanismo é o mesmo; muda só a morada da linha.
2. As transações do circuito de rateio lançam-se com `exclude_from_result = true`. Movimentam conta, não entram no resultado do evento e não consomem verba do BP. Encontram-se pelo card "Fora do resultado" da capa do evento e pelo chip "Fora do Resultado" nas Transações.
3. A liquidação faz-se por uma **conta de acerto** dedicada, com `is_accounting = false` e `skip_balance_check = true`. O saldo dessa conta é a posição do encontro de contas, não caixa contabilística. O precedente é D-ERP30 (conta corrente Google Ads) — **não** o Acerto de Madrid, que é o caso inverso (dinheiro de terceiros a pagar custo nosso, com espelhos de aporte automáticos).
4. No acerto final, conhecida a nossa parte por rubrica, os valores passam às linhas de BP respectivas e a linha "Rateio day-offs" é ajustada ao que sobrar dela, ou a zero. Não pode ficar verba por usar: o BP começa como planeamento e acaba como realizado.
5. O histórico previsto×realizado não se perde nesse ajuste — vive nas versões congeladas do BP e no `forecast_audit_log`.

Consequência conhecida e aceite: **nada no sistema obriga o ponto 4**. `event_close_blockers` não testa verba por usar (os blockers `hard` são sessões de camarim por integrar e sessões de cartões abertas; o `soft` são despesas pendentes) e `raise_forecast_budget` só sobe linhas, nunca desce. Não é automatizável: como faturas de um evento chegam depois de ele acontecer, `realizado < previsto` não distingue verba a mais de fatura por chegar. Por isso a resposta é o painel "Verba por usar" no Fecho — mostra e regista a revisão, não julga.

**Estado:** vigente.

---

## D-ERP33 — Uma transação pode explicar várias linhas do extrato — mas só quando nasce de um lançamento (10/09/2026)

**Uma transação pode explicar várias linhas do extrato — mas só quando nasce de um lançamento**

O índice `uq_bank_line_matched_txn` em `bank_statement_lines` impunha uma transação por linha. Foi criado por uma razão certa: impedir que uma transação seja usada para explicar uma linha que já estava explicada por outra via — o caso real da transação "Influencers" a casar com uma transferência já coberta por um lote SEPA, escondendo-a.

Só que o botão "Lançar pela soma" cria, por desenho, **uma** transação a partir de N linhas selecionadas. O índice apanhava também esse caso legítimo. Consequência medida a 10/09: em toda a vida do ecrã só houve dois lançamentos a partir do banco, **ambos de uma linha só** — o lançamento pela soma com várias linhas nunca tinha funcionado, e falhava com `duplicate key value violates unique constraint "uq_bank_line_matched_txn"`.

Decisão: o índice passa a parcial.

```sql
CREATE UNIQUE INDEX uq_bank_line_matched_txn
ON public.bank_statement_lines (matched_transaction_id)
WHERE matched_transaction_id IS NOT NULL
  AND created_transaction_id IS NULL;
```

A garantia de um-para-um mantém-se onde protege — nas linhas conciliadas pelas camadas automáticas, que é onde nasce o erro de uma transação roubar a linha de outra. Cai nas linhas que nasceram de um lançamento humano, onde a relação de N para um é a intenção.

Consequência conhecida: o modal de lançamento insere a transação e só depois liga as linhas, sem rollback. Uma falha no segundo passo deixa transação órfã no banco — foi o que aconteceu a 10/09 com a liquidação TPA ZigPay, corrigida por UPDATE manual. Fica em issue própria.

**Estado:** vigente.

---

## D-ERP34 — Contas e movimentos confidenciais, e o saldo validado no servidor (11/09/2026)

**Problema.** A conta corrente de um sócio não pode ser vista pela editora nem pela gestora. O acesso por utilizador (`financial_account_access`) só restringia a editora — a policy de leitura das contas dava à `manager` acesso a tudo. E as transações não tinham filtro nenhum por conta: `transactions_select_privileged_roles` deixa admin, manager, editor, viewer e accountant lerem tudo. `is_hidden` é máscara de UI, não é segurança.

**Decisão.**

1. `financial_accounts.is_restricted` — a conta e tudo o que lá se passa ficam invisíveis a quem não tiver a permissão.
2. `transactions.is_confidential` — esconde uma transação individual mesmo numa conta visível. É o que resolve a perna do Santander numa transferência para conta restrita.
3. Permissão nova `view_confidential`, atribuída a **admin e accountant**. A contabilidade vê tudo.
4. `can_see_confidential(uuid)` (STABLE, SECURITY DEFINER) e policy **RESTRICTIVE** `transactions_confidential_guard` em SELECT, `TO authenticated` — o service_role não é afectado, logo crons e edge functions continuam a ver tudo. A policy de leitura das contas foi reescrita: a `manager` deixa de ver contas com `is_restricted`.
5. Trigger `trg_force_confidential_restricted_account` (BEFORE INSERT OR UPDATE em `transactions`): conta restrita força `is_confidential = true`. Só liga o flag, nunca o desliga. Existe porque o automatismo do frontend falhou na primeira utilização real, a 10/09 — o ecrã corria com bundle antigo depois de um Publish.

**Consequência que obrigou a mais trabalho.** As travas de saldo calculavam o saldo **no cliente**, a partir das transações que o utilizador consegue ler. Com saídas confidenciais escondidas, o saldo calculado fica **acima** do real e a trava deixaria passar pagamentos que descobrem a conta. Por isso:

6. `account_has_balance_for(_account_id, _amount) → boolean` — SECURITY DEFINER, vê todas as transações, devolve **só suficiente/insuficiente**. Nunca o valor: senão quem não pode ver o saldo obtinha-o pela API.
7. `account_true_balance(_account_id) → numeric` — devolve o valor apenas a platform_admin, admin, ou a quem tenha `view_balances` numa conta com `balance_visible_to_all = true`. Caso contrário NULL.
8. `TransactionPaymentModal`, `TransferFormModal` e `BatchPaymentModal` passam a decidir pela função do servidor. A mensagem para quem não pode ver o saldo é `Saldo insuficiente na conta.`, sem valor.

**Limitação conhecida e aceite.** A fórmula canónica do saldo soma `paid_amount` de **todas** as transações da conta, sem filtrar status, estornadas ou escondidas. As funções novas espelham-na exactamente. Mudar a definição de saldo é outra conversa, e não se faz de repente.

**Fica por fazer, com furo assumido:** cartões, bilheteiras, lista de Contas e relatórios continuam a calcular saldo no cliente e a mostrá-lo sem verificar `view_balances` nem `balance_visible_to_all`.

**Estado:** vigente.

---

## D-ERP35 — A conta de liquidação: bancos na lista de pagamento, aviso fora dela, e conciliação entre contas (11/09/2026)

**Caso real, 03–04/09/2026.** Um seguro de 48,40 € foi criado pela editora com duas faturas anexas e linha de BP, aprovado pela gestora, subiu na lista "Pagamentos 03/09/2026" e foi liquidado contra a conta **Cartão Santander Pré-Pago 0663**. O extrato mostra **transferência SEPA emitida da conta Santander Totta** para a MDS-Corretor de Seguros. Efeito: saldo do cartão 48,40 € abaixo do real, saldo do Santander 48,40 € acima, a linha do extrato ficou "por explicar" porque as camadas de conciliação só procuram candidatas dentro da conta do extrato — e a 11/09 criou-se uma transação duplicada por cima dela.

**Decisão.**

1. Na liquidação a partir de **lista de pagamento**, o seletor de conta oferece **apenas contas de tipo `bank`**. Um cartão pré-pago carrega-se; não paga faturas a fornecedores. Se a conta escolhida deixar de ser elegível, a selecção limpa-se em vez de ficar em silêncio.
2. **Fora da lista**, cartão pré-pago com método `transfer` ou `direct_debit` dá **aviso, não bloqueio**. Existem 15 compras reais feitas com este cartão entre abril e maio, todas gravadas com método `transfer`; bloquear partiria o trabalho da equipa.
3. A conciliação passa a sugerir candidatas de **outras contas** na **ligação manual**, marcadas "conta divergente — <conta>", ordenadas depois das candidatas da conta do extrato, e exigindo uma confirmação explícita antes de ligar.
4. As camadas **automáticas** (lote SEPA, valor exacto, descrição) **continuam restritas à conta do extrato**. Casar automaticamente entre contas esconderia o erro de conta em vez de o mostrar — que é precisamente o sinal que queremos ver.

Dados corrigidos a 11/09: a transação original passou para a conta Santander Totta com data-valor 04/09, a linha do extrato foi religada a ela, e a duplicada foi eliminada.

**Estado:** vigente.

---

## D-ERP36 — Saldo a uma data, validado no servidor (11/09/2026)

**Problema.** A policy RESTRICTIVE `transactions_confidential_guard` (D-ERP34) esconde as transações confidenciais na query, mas as somas feitas no cliente não compensam essa ausência. Quem não tem `view_confidential` via, na **Conciliação Bancária** e na **Projeção de Tesouraria**, um saldo de conta **acima** do verdadeiro — e o triângulo da Conciliação publicava a diferença ao cêntimo (no Santander, exactamente 16.000,00 €). O papel `manager` tem `view_balances`, `manage_accounts`, `view_reports` e `manage_bank_reconciliation` e **não** tem `view_confidential`: 3 utilizadores. Era por aí que a informação escapava.

**Porque a função existente não servia.** `account_true_balance(uuid)` devolve o saldo de **hoje**. A Conciliação precisa do saldo **a uma data** (a última linha do extrato): no Santander a função actual devolve 413.667,55 €, e o ecrã tem de mostrar 439.403,92 € a 09/09, porque há 19 transações posteriores a 09/09 nessa conta. Trocar uma pela outra rebentaria a conciliação.

**Decisão.**

1. `public._account_true_balance_asof_raw(_account_id uuid, _as_of date DEFAULT NULL)` — SECURITY DEFINER, **interna**, sem `EXECUTE` para `authenticated` (mesmo padrão de `_account_true_balance_raw`). Espelha a fórmula canónica com corte em `initial_balance_date` e limite superior em `COALESCE(payment_date, date) <= _as_of`; inclui os ajustes de caixa de `transaction_payments`.
2. `public.account_true_balances_asof(_account_ids uuid[], _as_of date DEFAULT NULL) → (account_id, balance)` — leitura em lote, SECURITY DEFINER, `EXECUTE` a `authenticated` e `service_role`. Replica o **mesmo portão de permissão** de `account_true_balance`: valor só a `platform_admin`, role `admin`, ou a quem tenha `view_balances` numa conta com `balance_visible_to_all = true`; nos restantes casos `NULL`. Conta com `skip_balance_check` devolve sempre `NULL`.
3. `account_true_balance(uuid)` e `account_has_balance_for(uuid, numeric)` **não foram tocadas** — os modais de pagamento, transferência e lote continuam iguais.
4. **Conciliação** (`src/pages/BankReconciliation.tsx`): o saldo do sistema vem da função nova, à data `period_to` do extrato (a mesma que o ecrã já mostrava). Quando o valor vem `NULL` por falta de permissão, esconde-se o **triângulo inteiro** — saldo do sistema, saldo declarado, diferença e as quatro caixas de decomposição — e fica apenas uma linha discreta a dizer que não há permissão. Esconder só o número não chega: é a diferença que denuncia o valor escondido.
5. **Projeção de Tesouraria** (`src/components/ReportTreasuryProjection.tsx`): uma única chamada com `_as_of = NULL`. Contas cujo saldo venha `NULL` ficam **fora** da projeção, com aviso nominal — nunca contribuem zero, porque um total errado que parece certo é pior do que um total incompleto e assumido.

**Validado a 11/09/2026.** `_account_true_balance_asof_raw('594befaa-…', '2026-09-09') = 439403.92`, igual ao `closing_balance` do extrato: diferença 0,00 €, 52 linhas conciliadas, 0 por explicar, 5 pré-corte.

**Fase 2 (12/09/2026) — o Dashboard passou a mostrar saldo, e só a partir do servidor.**
`src/pages/Index.tsx` ganhou dois cartões, via `src/components/DashboardBalanceCards.tsx`,
que consomem o **mesmo** `useAccountBalanceCards` da página de Contas (uma verdade só, sem
queries nem somas duplicadas): **Saldo em caixa** (`bank`, `cash`, `prepaid_card`, com os
nomes das contas excluídas por `skip_balance_check` por baixo) e **Retido em bilheteiras**
(`ticket_office`, pela fórmula própria da D-ERP15). Os dois **nunca se somam** — o retido
em bilheteira não é caixa da empresa (D-ERP27). O cartão de "Acertos em curso" fica só na
página de Contas. Duas chamadas em lote, uma por grupo de contas; nenhuma transação é
carregada para isto.

**Regra da página de entrada: ausência explícita, nunca zero.** A rota `/` não tem guarda
de permissão e continua a não ter — o portão é por dado, não por página. Se nenhuma conta
do grupo devolver valor, **o cartão não aparece**; e se nenhum dos dois grupos devolver
valor, não aparece nenhum e o resto do Dashboard funciona igual. Escolheu-se desaparecer
em vez de escrever "sem permissão" porque a página de entrada não é o lugar para explicar
permissões — mas as contas individuais que ficam de fora continuam nomeadas, e
"não controlado" (`skip_balance_check`) continua distinto de "sem permissão".

**Fica por fazer (fase 3).** O Extrato, os cartões pré-pagos e o `CartaoEquipa` continuam a somar saldo no cliente e a mostrá-lo sem verificar `view_balances` nem `balance_visible_to_all`. A limitação da D-ERP34 mantém-se: a fórmula não filtra status, estornadas nem escondidas.

**Estado:** vigente.

---

## D-ERP37 — Funções SECURITY DEFINER fechadas por omissão (11/09/2026)

**Problema.** O schema `public` é exposto pelo PostgREST, logo qualquer função lá criada é chamável por RPC. Neste projeto **todas as 128 funções `SECURITY DEFINER` não-trigger** do `public` tinham `EXECUTE` para `anon` **e** `authenticated` — ou seja, chamáveis sem conta nenhuma, com a chave pública que vai no bundle do frontend. Entre elas escrita de segredos no vault, automatismos de cron e leitura de papéis de qualquer utilizador. Já antes desta decisão tinham sido fechadas quatro: `_account_true_balance_raw`, `_account_true_balance_asof_raw`, `get_vault_secret` e `get_app_secret` (esta devolvia segredos em texto limpo a `anon`).

**Armadilha, e o que se verificou aqui.** Em Postgres toda a função nasce com `EXECUTE` para `PUBLIC`, e `anon`/`authenticated` herdam de `PUBLIC` — nesse caso um `REVOKE ... FROM anon, authenticated` **não fecha nada**. Neste projeto a ACL é o caso simétrico: as funções não têm entrada `PUBLIC`, têm grants **nominais** (`anon=X`, `authenticated=X`), provavelmente por privilégios por omissão do schema. Resultado prático: **é preciso revogar as duas coisas** — `FROM PUBLIC` e `FROM anon, authenticated` — e confirmar sempre com `has_function_privilege('anon'|'authenticated', …)`, nunca pela ACL em bruto. `service_role` tem de continuar `true`.

**Fechadas hoje: 24.** Segredos/tokens: `create_vault_secret`, `update_vault_secret`, `upsert_vault_secret`, `crm_upsert_meta_connection`, `crm_consume_oauth_state`. Automatismos e batches: `crm_write_audit_log`, `crm_auto_link_meta_campaigns_to_events`, `process_lead_captures_batch`, `process_leads_capi_batch`, `process_redirect_logs_batch`, `portal_tick_lead_capture`, `portal_tick_redirect_log`, `coala_send_early_bird_batch`, `run_operacao_sla_escalator`, `set_coala_match_source`, `resolve_ads_event`. Internas/guardas: `enqueue_whatsapp_notification`, `get_or_create_generic_camarim_supplier`, `bp_tx_link_allowed`, `validate_tx_category_l2_match`. Informação: `get_user_role`, `has_partner_access`, `has_role_in`, `has_company_feature`.

**Ficam abertas por desenho — RLS (15).** `can_manage_cards`, `can_manage_event_operacao_full`, `can_manage_operacao_etapa`, `can_see_confidential`, `can_view_event_operacao`, `current_company_id`, `has_permission`, `has_permission_in`, `has_role`, `is_platform_admin`, `is_public_portal_company`, `row_belongs_to_current_company`, `storage_path_belongs_to_current_company`, `user_has_event_access`, `user_supplier_id`. Lista reconfirmada em `pg_policy` (`polqual` + `polwithcheck`): revogá-las parava a leitura de dados na plataforma inteira. **Se uma função aparecer numa política, a política ganha.**

**Ficam abertas porque o frontend as chama (dívida: precisam de portão interno, não de revoke).** `account_has_balance_for`, `account_true_balance`, `account_true_balances_asof`, `event_budget_mode` (abertas por desenho), e ainda `reverse_transaction`, `create_bp_snapshot`, `promote_scenario_to_active`, `revert_to_bp_version`, `archive_bp_version`, `unarchive_bp_version`, `discard_bp_version_draft`, `mark_forecasts_fechado_auto`, `expire_supplier_credits`, `get_user_max_daily_budget_eur`, `ads_event_windows`, `zone_capacity_snapshot`, `event_close_blockers`. O cliente corre como `authenticated`: fechá-las partia o ecrã. Cada uma tem de validar por dentro o papel/permissão de quem chama.

**Dúvida deixada em aberto.** `coala_unsub_token(p_email text)` não foi revogada: gera um token a partir de um email e serve fluxos de unsubscribe, que têm de funcionar sem login. Tem 2 chamadores dentro da base, mas o portal público vive noutro repositório e não é auditável daqui. O mesmo caveat vale para qualquer função que o portal anónimo chame directamente.

**Depois deste trabalho:** 68 das 128 funções `SECURITY DEFINER` não-trigger continuam com `EXECUTE` para `anon` (82 para `authenticated`). Nenhuma perdeu `service_role`.

**Regra para o futuro.** Toda a função `SECURITY DEFINER` nova no `public` leva, **na mesma migração que a cria**, `REVOKE EXECUTE ... FROM PUBLIC;` **e** `REVOKE EXECUTE ... FROM anon, authenticated;` e só depois `GRANT EXECUTE` aos papéis que dela precisam. Escrita também em `docs/INDEX.md` e em `DATABASE.md`.

**Fecho da decisão (11/09/2026) — as duas últimas funções sem verificação interna.** Restavam exactamente duas funções `SECURITY DEFINER` abertas a `anon` que não verificavam nada por dentro e que o frontend chama (logo não se fechavam por `REVOKE`): `event_budget_mode` e `account_has_balance_for`. Ambas passaram a ter portão de empresa no corpo, no molde da D-ERP38 (`v_uid := auth.uid()`, isenção comentada para `v_uid IS NULL` — service_role, crons, edge functions — e excepção para `platform_admin`). **Os comportamentos são deliberadamente diferentes:**

- `event_budget_mode(_event_id)` — **falha alto: `RAISE EXCEPTION` com `ERRCODE = '42501'`** quando o evento é de outra empresa. É chamada de dentro do trigger `enforce_transaction_approval_permission`, que corre no contexto do utilizador e compara o resultado com `= 'with_bp'`. Se devolvesse `NULL` (ou um valor por omissão) fora da empresa, essa comparação passava a dar falso **em silêncio** e a trava de linha de BP deixava de ser aplicada — trocava-se uma fuga de informação por um buraco contabilístico, que é pior. Passou de `LANGUAGE sql` a `plpgsql` para poder levantar a excepção; assinatura e valor devolvido inalterados. Evento inexistente continua a devolver `NULL`.
- `account_has_balance_for(_account_id, _amount)` — **falha fechado: devolve `false`**, sem excepção. É a trava de saldo da D-ERP34 e devolve só booleano para não revelar o saldo; o problema era que qualquer autenticado podia perguntar sobre uma conta de **outra empresa** e, repetindo a pergunta com valores diferentes, descobrir o saldo ao cêntimo por bissecção. Aqui `false` é o lado seguro: bloqueia o pagamento e não parte nada. `skip_balance_check` e o resto da lógica ficaram intactos; `account_true_balance` e `account_true_balances_asof` não foram tocadas.

**Verificação.** As duas contêm `auth.uid` e `current_company_id`, mantêm `EXECUTE` para `service_role`, e **nenhuma aparece em `pg_policy`** (`polqual` + `polwithcheck`) — condição obrigatória, porque uma excepção dentro de função usada em RLS partia a leitura de dados.

**Número final.** Continuam **67 das 128** funções `SECURITY DEFINER` não-trigger com `EXECUTE` para `anon`. Divisão: as **15 usadas em RLS** (não se revogam, a política ganha); as **~17 chamadas pelo frontend** listadas acima, agora todas com portão interno (D-ERP38 + este fecho) em vez de `REVOKE`; `coala_unsub_token`, deixada aberta por servir unsubscribe sem login; e o restante são funções de leitura/helpers já protegidas por `row_belongs_to_current_company` ou sem informação sensível. Não há, nesta data, nenhuma função `SECURITY DEFINER` não-trigger aberta a `anon` **sem** verificação interna nem protecção por RLS.

**Estado:** vigente (fechada).

---


## D-ERP38 — Portão de permissão e isolamento de empresa nas funções de BP (11/09/2026)

**Problema.** Seis funções `SECURITY DEFINER` das versões e cenários do BP recebiam **`_performed_by`/`_created_by` como parâmetro** em vez de lerem `auth.uid()`, e nenhuma verificava papel, permissão ou empresa. Os `RAISE EXCEPTION` que tinham eram validação de negócio, não portão de acesso. Consequência: qualquer utilizador autenticado, de qualquer empresa, promovia um cenário a BP activo de qualquer evento — e **assinava a operação com o id de quem quisesse**, ficando a auditoria `bp_version_audit_log` a apontar para outra pessoa. Verificado em catálogo: nenhuma das seis continha `has_role`, `has_permission` nem `auth.uid`.

**Decisão — o portão, igual nas doze funções tratadas.**

1. `v_uid uuid := auth.uid();` no topo do corpo, antes de qualquer leitura ou escrita.
2. **Isenção deliberada:** `v_uid IS NULL` passa sem verificar. É o mesmo padrão de `enforce_transaction_approval_permission` — `service_role`, crons, edge functions e syncs não têm identidade de utilizador e não podem ser bloqueados. Está comentada no código de cada função, precisamente para ninguém a "corrigir" mais tarde.
3. Com utilizador, exige-se `is_platform_admin(v_uid) OR has_role(v_uid,'admin') OR has_permission(v_uid,'manage_bp')`. A permissão `manage_bp` está atribuída a **admin e manager** (confirmado em `role_permissions`). Falha → `RAISE EXCEPTION 'Sem permissão para gerir o Business Plan deste evento.' USING ERRCODE = '42501'`.
4. **Isolamento de empresa.** O `company_id` do alvo (resolvido a partir do `_event_id`, ou de `bp_versions → events` quando o parâmetro é `_version_id`) tem de ser igual a `current_company_id()`. É isto que impede um utilizador da Coala de mexer no BP da MP. Excepção explícita: `platform_admin`, que opera transversalmente e cujo `current_company_id()` é apenas a empresa activa no momento — bloqueá-lo pela empresa activa partia a operação de suporte.
5. **Autoria não forjável.** Com utilizador, o parâmetro recebido é ignorado e substituído por `auth.uid()`; com `auth.uid()` NULL (service_role) usa-se o parâmetro, como antes. As **assinaturas não mudaram** — as chamadas do frontend continuam iguais e não se tocou em código de frontend.

**Funções com portão de permissão + empresa:** `promote_scenario_to_active`, `revert_to_bp_version`, `create_bp_snapshot`, `archive_bp_version`, `unarchive_bp_version`, `discard_bp_version_draft`, `mark_forecasts_fechado_auto` (valida que **todos** os ids em `_ids` são da empresa do chamador).

**Só permissão, sem alvo:** `expire_supplier_credits` — rotina de manutenção que normalmente corre por cron como service_role.

**Só verificação de empresa, sem exigência de permissão** (são leituras que o ecrã usa e não se quis partir nada): `event_close_blockers` (devolve NULL fora da empresa), `ads_event_windows` (devolve vazio), `get_user_max_daily_budget_eur` (devolve NULL salvo se o alvo é o próprio utilizador ou membro da mesma empresa).

**Deixada de fora, por já estar protegida:** `zone_capacity_snapshot` — já abria com `row_belongs_to_current_company(e.company_id)` e devolvia vazio fora da empresa. Não foi tocada.

**Verificação.** As onze funções alteradas passam a conter `auth.uid` e uma das três verificações; nenhuma perdeu o `EXECUTE` de `service_role`; e **nenhuma das doze aparece em `pg_policy`** — condição obrigatória, porque acrescentar `RAISE EXCEPTION` a uma função usada em RLS partiria a leitura de dados.

**Nota para não repetir alarme.** A `reverse_transaction` foi investigada neste trabalho e **já estava protegida**: o gate de admin está na versão de 5 argumentos (a única chamada pelo frontend) e a de 4 é apenas um invólucro. Não voltar a levantar o mesmo caso.

**Regra futura (extensão da D-ERP37).** Função nova em `public` que escreve: nunca receber o autor por parâmetro — ler `auth.uid()`. Verificar permissão e `current_company_id()` no topo do corpo. Isentar `auth.uid() IS NULL` para service_role/crons, e comentar a isenção.

**Estado:** vigente.

## D-ERP39 — Contas dos artistas (captação de dados) ≠ contas de anúncios (tráfego) (11/09/2026)

**Decisão.** São dois circuitos separados, com apps, credenciais, tabelas e funções próprias, e
os tokens de um lado nunca servem o outro.

**Captação de dados dos artistas.** Tabela `artist_channel_connections`; app Meta **dedicada à
carreira artística**, com segredos próprios `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`; scopes
**só de leitura** (`instagram_business_basic`, `instagram_business_manage_insights`) — nunca
publicar, nunca mensagens, nunca anúncios. Usada apenas pelas funções `artist-*`.

**Gestão de tráfego (Ads).** Continua em `ad_platform_connections` e nas funções `crm-*` /
Audience, com `META_APP_ID` / `META_APP_SECRET`. Anúncios de artistas geridos pela empresa
passam **sempre** por aqui — conta de anúncios do artista partilhada com o Business Manager da
empresa — e **nunca** pelas ligações de dados dos artistas.

**Regra de código.** Nenhuma função `artist-*` lê `ad_platform_connections` nem usa
`META_APP_*`; nenhuma função `crm-*` lê `artist_channel_connections`. Excepção declarada: as
funções `artist-meta-oauth-*` (Facebook Login) usam `META_APP_*` e ficam **de reserva,
inactivas na app** — não se apagam, porque o caminho por Página continua a ser o alternativo
para contas sem Instagram Login.

**Caminho activo.** Ligação **directa pelo Instagram** (Instagram API with Instagram Login):
`artist-instagram-oauth-start` → `artist-instagram-oauth-callback` → token de utilizador de
longa duração (~60 dias) renovado por `artist-token-refresh`. Detalhe em
`docs/ARCHITECTURE.md` e `DATABASE.md` §18.

**Estado:** vigente.

## D-ERP40 — Identidade de fornecedor é o IBAN normalizado, não o nome (12/09/2026)

**Decisão.** O que identifica um fornecedor é o IBAN normalizado, não o nome.

- O nome é instável (espaços, acentos, abreviaturas) e falhou como chave única na importação de 29/04/2026: `suppliers_company_name_unique` não apanha um espaço a mais no fim.
- A unicidade passa a ser garantida por índices únicos parciais sobre `(company_id, iban|iban_2|iban_3)` para fornecedores **ativos**. Os desativados mantêm o IBAN para o histórico.
- Toda a normalização de IBAN na aplicação passa por `normalizeIban` de `src/lib/iban.ts`. Não criar normalizações locais.
- Importações em massa de fornecedores têm de reconciliar pelo IBAN normalizado **antes** de inserir. Se a importação não trouxer NIF nem IBAN, não há chave fiável e os registos têm de ser revistos à mão.
- Fornecedores duplicados resolvem-se por **fusão**: repontar transações e mapeamentos para o registo com mais histórico, desativar o outro com nota em `notes`, nunca apagar.

**Estado:** vigente.

## D-ERP41 — O anexo de um movimento do banco pertence ao movimento, não às transações — e nunca é visível ao sócio (12/09/2026)

**Decisão.** O documento de uma linha do extrato vive na linha, não numa transação.

- Um crédito único do banco pode cobrir N transações de eventos diferentes. Caso real: FT 11.1/101 da Ticketline, **135.986,96 €**, com a parcela dos 4% no evento *Anitta EDA 2026* e a do 1% fora dele. A fatura não pertence a nenhuma transação isolada: vive em `bank_line_documents`, pendurada na linha do extrato.
- Para chegar ao contabilista, o upload cria **réplicas** em `transaction_documents` — uma por transação ligada, das três origens (`matched_transaction_id`, `created_transaction_id`, tabela-ponte `bank_line_transactions`), com `file_url` prefixado `bank://` e o mesmo ficheiro no storage. Estrutura sem réplica é **invisível à contabilidade**: foi o erro cometido na primeira versão.
- As réplicas entram **SEMPRE** com `partner_visible = false`. A política `transaction_documents_select_partner` dá acesso por acesso ao evento, e a réplica dos 4% está num evento com sócios — sem a trava, a fatura ficava exposta.
- **Dois eixos independentes, que não se confundem:** `is_accounting` decide se o documento vai para o contabilista (acesso por **PAPEL** — admin, manager, accountant); `partner_visible` decide se o sócio vê (acesso por **EVENTO**). Um não substitui o outro.
- Uma linha do banco conciliada manualmente contra N transações exige que a soma dos `paid_amount` bata com o valor da linha a **±0,01**. Não existe conciliação parcial.
- Os lançamentos (`created_transaction_id`) **não** entram na tabela-ponte: são a cardinalidade inversa (N linhas → 1 transação) e violariam o `unique (transaction_id)`.

**Estado:** vigente.

---

## D-ERP42 — Os anexos seguem a confidencialidade da transação (12/09/2026)

**O buraco que a D-ERP34 deixou.** A D-ERP34 protegeu a **transação** confidencial com a policy RESTRICTIVE `transactions_confidential_guard`, mas o **comprovativo** ficou de fora: `transaction_documents` continuava legível por admin, platform_admin, manager, editor, viewer e accountant. Quem não podia ver a transação via, ainda assim, a fatura, o recibo e o comprovativo de transferência que a descrevem ao cêntimo — incluindo os movimentos de conta restrita, que é precisamente o caso que a D-ERP34 existe para tapar.

**Decisão.** Policy **RESTRICTIVE** nova `transaction_documents_confidential_guard`, a espelhar exactamente a `transactions_confidential_guard`: um documento anexado a uma transação **confidencial** (`transactions.is_confidential`) ou a uma transação em **conta restrita** (`financial_accounts.is_restricted`) só é legível por quem tem `view_confidential`. Aplica-se `TO authenticated`, logo o `service_role` — crons, edge functions, exportações — não é afectado.

**Dois eixos independentes, que continuam a não se confundir** (ver D-ERP41): `is_accounting` decide se o documento vai para o contabilista (acesso por **PAPEL**); `partner_visible` decide se o sócio vê (acesso por **EVENTO**). A confidencialidade é um **terceiro** eixo, herdado da transação e não gravado no documento — não há coluna nova.

**Teste em Live (12/09/2026).** Fingindo o papel `manager`: `can_see_confidential` a `false` e **zero** anexos de transações confidenciais visíveis. Com `service_role`, os **1.371** anexos continuam todos visíveis.

**Estado:** vigente.

---

## D-ERP43 — Compensação não toca em saldo (12/09/2026)

**Decisão.** Uma transação com `payment_method = 'compensation'` **nunca tem conta**.

**O trigger.** `trg_force_no_account_on_compensation`, `BEFORE INSERT OR UPDATE` em `transactions`: se o método for `compensation`, `account_id` é forçado a **NULL**. Não rejeita — **corrige**. Compensação com conta não é uma intenção legítima que valha a pena preservar para o utilizador decidir; é sempre erro.

**Porquê.** A fórmula do saldo de conta soma os movimentos por `t.account_id`. Compensação é **encontro de contas**: não há movimento de dinheiro, não há linha no extrato, não há nada a somar. Uma compensação apontada a uma conta inflaciona essa conta com dinheiro que nunca lá entrou — e o erro é silencioso, porque cada transação isolada parece correcta.

**Caso real.** Quatro transações do Coala Festival apontadas ao Banco Santander Totta: A&B Bebidas **95.195,75** · Superbock **3.252,03** · Cortesias Marco Caldeira **2.520,00** · Adega Almeirim **2.500,00** — total **103.467,78 €**. Só não corromperam o saldo por acidente: a data de pagamento é **07/07/2026**, anterior à data de corte do saldo implantado (31/08/2026, D-ERP25). Foram limpas. Depois da limpeza, o saldo do Santander a 09/09 continua **439.403,92 €** e não existe **nenhuma** transação de compensação com conta na base.

**Consequências no ecrã.** No modal de pagamento, escolher "Compensação" **esconde o bloco da conta** — o ecrã não pede o que vai ser ignorado — as travas de saldo (`account_has_balance_for`) não correm, e nenhuma linha de `transaction_payments` leva `account_id`.

**Estado:** vigente.

## D-ERP44 — Domínio fechado de `payment_method` (12/09/2026)

**Decisão.** `payment_method` tem exactamente cinco valores, garantidos em três camadas: fonte única no cliente, espelho no servidor, CHECK na base.

- **Cliente.** `src/lib/payment-methods.ts` é a única casa dos valores, dos rótulos em pt-PT, dos ícones e dos helpers (`isPaymentMethod`, `paymentMethodLabel`, `paymentMethodOptions` com `includeStatePayment` / `includeCompensation`). Antes a lista estava repetida em **quatro** ficheiros e um deles divergia — faltava-lhe `state_payment`.
- **Servidor.** A edge function `update-transaction` valida `payment_method` contra a mesma lista, duplicada com comentário a apontar para a fonte e um teste que compara as duas. Antes aceitava **qualquer string** do corpo do pedido.
- **Base.** CHECK em `transactions.payment_method` e `transaction_payments.payment_method`: só NULL ou um de `transfer`, `service_payment`, `direct_debit`, `state_payment`, `compensation`. Confirmado antes de aplicar que os dados existentes cumprem.

**A dependência que justifica o CHECK.** O trigger da D-ERP43 compara a string **exactamente** com `'compensation'`. Sem CHECK, qualquer grafia nova — `Compensation`, `compensação`, `compensacao` — passa e **desarma o trigger em silêncio**: a transação fica com conta e o saldo mente. O CHECK não é redundância de tipo; é a condição de existência da D-ERP43.

**Regra futura.** Não acrescentar valores ao domínio sem alterar, na mesma tarefa, as três camadas. Método novo que não seja movimento de caixa exige rever o trigger, não só a lista.

**Estado:** vigente.

## D-ERP45 — Chave de operação separada da referência de pagamento (12/09/2026)

**O problema.** A coluna `transactions.payment_reference` estava a servir **dois conceitos incompatíveis**:

1. **Referência de pagamento** — MB, AT, Segurança Social. Só faz sentido fora de `transfer`, é obrigatória em `service_payment` e `state_payment`, e o ecrã **limpa-a** quando o método passa a `transfer` (`TransactionFormModal.tsx:950`, `TransactionEditModal.tsx:2117`) e não a grava em `transfer` (`TransactionFormModal.tsx:1310,1352,1495,1645`; `TransactionEditModal.tsx:500`; `TransactionPaymentModal.tsx:385,451,584,598`).
2. **Chave de operação** — agrupa as transações de um mesmo fecho (acerto de bares, de food, camarim, cartão, revenue share). Tem de sobreviver a tudo, incluindo a liquidação por transferência.

Resultado: as chaves de operação eram **apagadas em silêncio** no momento em que a transação era paga por transferência. Caso concreto: o grupo `ACERTO-FOOD-IVETE-2026` tinha seis repasses `pending` com método `transfer` que perderiam a chave à primeira liquidação.

**Decisão.** Coluna nova `transactions.operation_key text`, com índice parcial `idx_transactions_company_operation_key (company_id, operation_key) WHERE operation_key IS NOT NULL`. A chave de operação **nunca** é limpa: não por mudança de método, não por mudança de estado, não por liquidação. `payment_reference` mantém-se exactamente como estava — referência MB/AT, com as regras que já tinha.

**Migração dos valores existentes** (37 linhas, padrão `^[A-Z0-9]+(-[A-Z0-9]+)+$`): `ACERTO-FOOD-IVETE-2026` 14 · `ACERTO-SSH-COALA-2026` 9 · `ACERTO-BARES-ANITTA-2026` 7 · `CAMARIM-9D81140A` 4 · `ACERTO-FOOD-ANITTA-2026` 1 · `APOIO-CASINO-IVETE-2026` 1 · `REVSHARE-TICKETLINE-ANITTA-2026` 1. Texto movido de uma coluna para a outra; nenhum valor monetário alterado.

**Quem escreve a chave.** `close-camarim-session` (prefixo `CAMARIM-`) e `close-card-session` (prefixo `CARTAO-`) passam a escrever em `operation_key` e deixam de escrever em `payment_reference`. `renegotiate_transaction_installments` copia `operation_key` para as parcelas novas — a chave sobrevive a uma renegociação. `update-transaction` aceita o campo nas duas allowlists (inclusive em transações pagas).

**Quem lê a chave.** `useEventABRealized` filtra por `operation_key ILIKE '%ACERTO%BAR%'`. No ecrã de Transações: badge discreto na listagem quando existe, filtro dedicado no painel com as chaves distintas da empresa, painel com o total do grupo (receitas, despesas, saldo) e pesquisa livre a apanhá-la.

**Edição.** Campo "Chave de operação" no modal de edição, sempre visível e **independente do método de pagamento**, com aviso visual quando não segue a convenção `PREFIXO-…` em maiúsculas. Não é obrigatória.

**Gestão ao nível da chave** (12/09/2026). Renomear e apagar um grupo mexem em N transações de uma vez, por isso não vivem num campo de formulário: vivem no painel de filtros de Transações (`OperationKeyManager`, ao lado do filtro por chave), na lista das chaves da empresa com a contagem de cada uma.

- **Permissão:** só `admin` / `platform_admin`. Quem não for vê a lista e o filtro, sem acções.
- **Renomear:** valida o nome novo contra o padrão da D-ERP46 e mostra a contagem antes de executar.
- **Fundir:** se o nome novo já existir, a acção deixa de ser renomear e é dito com essas palavras — mostra as duas contagens ("junta 4 linhas a um grupo que já tem 14, ficando 18") e exige uma **segunda confirmação**, separada da primeira. Uma fusão nunca acontece com a confirmação de uma renomeação simples.
- **Apagar:** põe `operation_key = NULL` no grupo. **Nenhuma transação é apagada** — a confirmação di-lo por palavras, porque "apagar chave" lê-se mal.
- **Trava nos prefixos gerados por código:** `CAMARIM-` e `CARTAO-` não podem ser renomeados nem apagados por esta via. São derivados do id da sessão: mudar o nome parte a ligação e o fecho seguinte gera a original, ficando dois grupos onde havia um. O motivo está à vista na lista, não num tooltip.
- **Atomicidade e auditoria:** as duas acções são RPCs `SECURITY DEFINER` — `rename_operation_key(_old_key, _new_key)` e `clear_operation_key(_key)` — em vez de N updates do cliente: uma renomeação de 14 linhas a meio não pode deixar metade do grupo com o nome velho. Portão de admin por dentro, `current_company_id()` a limitar o alcance, isenção para `auth.uid() IS NULL` (service_role), `REVOKE EXECUTE ... FROM PUBLIC, anon` (D-ERP37). Cada operação escreve uma linha por transação afectada em `transaction_audit_log` (`field_name` "Chave de operação (renomear grupo)" ou "(apagar grupo)", valor velho, valor novo, utilizador) **antes** do update, na mesma transação.

**O total do grupo é sempre do grupo inteiro** (12/09/2026). A barra de totais no topo de Transações somava apenas as linhas visíveis: com o filtro "Em Aberto" ligado, o `ACERTO-FOOD-IVETE-2026` mostrava 12 linhas e saldo −10.061,11 € quando o grupo tem 14 linhas e +16.865,33 € — e a lista de gestão, no mesmo ecrã, dizia 14. Um número de verificação que muda com os filtros não verifica nada. Passa a vir de consulta própria (`useOperationKeyTotals`), filtrada só por `operation_key` (empresa garantida pela RLS) e paginada com `fetchAllPaged` com desempate por `id` — nunca calculada a partir das linhas já carregadas na página, que estão filtradas e podem estar truncadas nos 1.000 registos do PostgREST. O subconjunto filtrado mantém-se, mas em segunda linha e rotulado ("das quais N visíveis com os filtros actuais").

**Estado:** vigente.


## D-ERP46 — Chave de operação é domínio fechado, não texto livre (12/09/2026)

**O problema.** A D-ERP45 deixou a `operation_key` como texto livre com aviso visual. Numa chave de **agrupamento** o erro de escrita é silencioso: `ACERTO FOOD IVETE 2026` ou `acerto-food-ivete-2026` não falha, cria um grupo novo de uma linha e o total do fecho deixa de bater sem ninguém dar por isso. Avisar não chega — a chave só serve se for igual em todas as linhas do fecho.

**Decisão.** A entrada passa a ser **escolha entre as chaves que já existem**, com criação de chave nova só quando o texto cumpre o padrão:

- `src/lib/operation-key.ts` é a casa única: `OPERATION_KEY_PATTERN`, `isValidOperationKey`, `normalizeOperationKeyInput` (maiúsculas, acentos fora, espaços/underscores → hífen, caracteres inválidos caem, hífens repetidos colapsam) e `operationKeyRejectionReason`.
- `OperationKeySelector` (usado no `TransactionEditModal`) lista as chaves distintas da empresa com o número de transações de cada uma, normaliza o que se escreve, **desactiva** a criação quando o texto não dá chave válida e mostra o motivo, e sugere a chave parecida (Dice ≥ 0,6) para travar a criação de variantes do mesmo fecho.
- CHECK `transactions_operation_key_check` na base de dados: `operation_key IS NULL OR operation_key ~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'`. Aplicado depois de confirmar em Live que as 37 linhas com chave cumprem o padrão.
- `update-transaction` valida o campo contra o mesmo padrão (400) e converte `""` em NULL. O padrão está duplicado na função (`OPERATION_KEY_RE`) porque `src/` não é publicado com as edge functions; `src/test/operation-key-domain.test.ts` compara os dois.

**Três camadas, um padrão.** Ecrã (recusa e normaliza), edge function (400) e base de dados (CHECK). Alterar o padrão exige alterar as três na mesma tarefa.

**Não muda.** `payment_reference`, saldos, conciliação, métodos de pagamento, trigger `trg_force_no_account_on_compensation` e valores de transações: intactos.

**Estado:** vigente.

## D-ERP51 — Saldo de bilheteira no servidor, e a composição dos três dinheiros num só sítio (12/09/2026)

**Decisão.** A fórmula da bilheteira (D-ERP15) passa a existir também em SQL, em
`public._ticket_office_balance_raw(uuid)` (interna, fechada) e
`public.ticket_office_balances(uuid[])` (com portão), arredondada a 2 casas **apenas no
total** — `computeTicketOfficeBalance` não arredonda nenhuma parcela, pelo que arredondar
por parcela divergiria do cliente. A fórmula **não converge** com a
bancária: continua a ser vendas de `ticket_sales` + movimentos `approved|paid` com
`reversed_at IS NULL` e `is_hidden` falso, sempre por `paid_amount`, menos adiantamentos
sem transação e sem fecho. O portão é o mesmo de `account_true_balances_asof`:
admin/platform_admin, ou `view_balances` **e** `balance_visible_to_all`; `NULL` nos
restantes casos e sempre que `skip_balance_check` está ligado. D-ERP37 aplicada às duas.

**Composição dos três dinheiros (D-ERP27) sai do componente** para
`src/hooks/useAccountBalanceCards.ts`: caixa, retido em bilheteiras e acertos em curso,
cada conta com saldo **ou** ausência, e as duas ausências separadas —
`"uncontrolled"` (sem controlo de saldo) e `"no_permission"`. Nunca zero em vez de
ausência (D-ERP36). A página de Contas deixou de somar no cliente.

**Duas correcções numéricas que vêm de graça.** (a) A página lia `ticket_sales` em bruto
e o PostgREST corta em 1.000 linhas: a Ticketline tem 2.840 vendas e o valor estava
truncado. (b) A página restringia as vendas às zonas de eventos **atribuídos** a alguma
bilheteira; o ECI aparecia a 0,00 € tendo 29.903,25 € de vendas. A fonte única
(`get_ticket_office_sales`, D-ERP15) nunca fez essa restrição — o servidor segue a fonte
única.

**Efeito de permissões, aceite.** O `canSeeBalance` do cliente era
`isAdmin || balance_visible_to_all` e ignorava `view_balances`. O servidor é mais
restritivo: só três contas activas têm `balance_visible_to_all` (Cartão Santander Pre-Pago - 0663,
Cartão Santander Pre-pago - 8363 e o Banco Santander Totta da segunda empresa). Quem não é
admin/platform_admin passa a ver saldo **apenas** nessas três, e só se tiver `view_balances`;
nas restantes 18 lê "Sem permissão". Papéis afectados: manager, editor, viewer,
accountant, producer, partner — antes viam as três (por `balance_visible_to_all`) e agora
continuam a ver as mesmas três se tiverem `view_balances`, e nenhuma se não tiverem.
Não se contorna.

**Fica para depois.** Fase 2: Dashboard a consumir o hook. Fase 3: Extrato e cartões
pré-pagos, que têm risco de regressão numérica próprio.

**Estado:** vigente.

## D-ERP47 — Comparáveis por artista: referências são artistas de primeira classe (12/09/2026)

**Contexto.** Cada artista do elenco precisa de comparar as suas curvas com artistas de
referência. As referências não são "dados soltos de uma API": têm de ter séries diárias na
mesma tabela, com o mesmo isolamento por empresa, para as curvas serem comparáveis.

**Decisão.**

1. Não existe tabela paralela de referências. Um comparável é uma linha em `public.artists`
   com `roster_type = 'referencia'` e `managed = false`, com canal `aggregator` a guardar o
   UUID Soundcharts, exactamente como os artistas do elenco. As métricas caem em
   `artist_metrics_daily` pelo mesmo `soundcharts-sync`.
2. `public.artist_comparables` liga artista → comparável, com `position` 1..5. Três travas
   independentes: `unique (artist_id, position)`, `unique (artist_id, comparable_artist_id)`,
   `check (artist_id <> comparable_artist_id)`, mais o trigger
   `enforce_artist_comparables_limit` que recusa o 6.º. O limite é do servidor, não do ecrã.
3. Remover um comparável apaga só a ligação. O artista de referência e o seu histórico ficam
   — pode estar a servir outro artista do elenco e as séries já foram pagas em quota.
4. **Base 100 tem de ser a primeira data COMUM.** A view `v_artist_metric_indexed` indexa cada
   série pelo seu próprio primeiro ponto, o que é errado para comparar N artistas com datas de
   arranque diferentes. Para isso existe `artist_metric_indexed_common(uuid[], platform,
   metric, start, end)`: escolhe a primeira data em que todos têm leitura e indexa aí. Se não
   houver data comum, `indexed` é NULL — nunca se inventa base.
5. `v_artist_momentum` dá variações a 7/30/90 dias e um `momentum_index` = 0,5·d7 + 0,3·d30 +
   0,2·d90, **só** quando existem as três janelas; falta uma, o índice é NULL. Ausência nunca
   é zero (mesma regra da D-ERP36).
6. **Cadência separada por `roster_type`.** `soundcharts-sync` aceita
   `body.roster_type ('elenco' | 'referencia' | omitido = todos)`. O elenco corre diariamente
   (`carreira-soundcharts-sync-diario`, 09:10 UTC); as referências correm ao domingo
   (`carreira-soundcharts-sync-referencias-semanal`, 09:30 UTC). A quota da Soundcharts é
   pequena e uma referência não precisa de leitura diária.
7. **Quota é medida, não estimada.** O valor real fica sempre em `sync_runs.api_calls`.
   `artist-comparable-manage` devolve apenas uma estimativa (≈5 blocos de 90 dias × 4
   plataformas ≈ 20 chamadas) para o ecrã poder avisar antes de gastar.

**Consequência.** Um artista de referência aparece em `artists`. Qualquer listagem de elenco
tem de filtrar `roster_type = 'elenco'`, sob pena de mostrar referências como se fossem
artistas geridos.

## D-ERP48 — Transferência do fecho de bilheteira é um par 10.3 criado na base de dados (12/09/2026)

**Decisão.** Uma transferência entre contas é sempre um par `expense` + `income` na
rubrica `10.3 Transferências Internas`. Não existe nem pode existir transação de
tipo `transfer` (`transactions_type_check` só aceita `income` e `expense`).
A transferência do fecho de bilheteira é criada **exclusivamente** por
`public.create_settlement_transfer(p_settlement_id, p_from_account_id, p_to_account_id, p_amount, p_date, p_credited)`
(migração `20260912193941`) — nenhum ecrã, edge function ou script a insere à mão.
A função é SECURITY DEFINER, `search_path = public`, portão `admin` / `platform_admin` /
permissão `manage_accounts`, empresa do fecho validada contra `current_company_id()`,
EXECUTE revogado a PUBLIC e a `anon`. Recusa valor ≤ 0, contas iguais e fecho que já
tenha `transfer_transaction_id`. As duas pernas levam
`operation_key = 'TRF-FECHO-' || upper(left(replace(settlement_id,'-',''),8))`,
`iva_rate = 0`, `payment_method = 'transfer'`, `exclude_from_result = true`.
As duas pernas e a atualização do fecho acontecem **numa só transação de base de
dados**: ou existe tudo, ou não existe nada.
Só a função preenche `transfer_transaction_id`, `net_transferred` e
`transfer_account_id` — estes campos **só existem depois de a transferência
existir**; quando o utilizador escolhe "Não transferir agora" o fecho grava
`net_transferred = 0` e `transfer_account_id = NULL`, e nunca declara um destino
que não usou.

**Porquê.** O wizard inseria `type: 'transfer'` com `target_account_id` e
`expected_date` (colunas inexistentes) e engolia o erro — o fecho declarava durante
meses uma transferência que não existia em lado nenhum (issue #132). O erro nunca
volta a ser engolido: se a função falhar, o fecho volta a `draft` e o utilizador vê a
mensagem.

**Consequências.** O estorno apaga as duas pernas pela `operation_key`. A lista de
fechos marca `confirmed` com `net_transferred = 0` como "líquido ainda retido na
bilheteira". Nos ecrãs de bilheteira o indicador "Transferido" e a coluna
"Transferências" do relatório de auditoria passam a somar despesas na rubrica `10.3`,
separadas das restantes despesas — a reconciliação
(vendas + income) − despesas − transferências − adiantamentos = saldo mantém-se
(BOL 140.765,00 €; Ticketline 275.792,63 €). A fórmula do saldo (D-ERP15,
`src/lib/ticket-office-balance.ts`, `_ticket_office_balance_raw`) não mudou.

## D-ERP49 — A obra (música) é a entidade de análise de lançamentos (12/09/2026)

**Contexto.** `artist_releases` nasceu para os uploads na Sua Música: uma linha por
plataforma. Isso não serve para acompanhar um lançamento, porque a mesma obra vive
em Spotify, YouTube, Deezer, Shazam, TikTok, Reels, Shorts e SoundCloud ao mesmo
tempo.

**Decisão.**
- `artist_songs` é a **obra** e a entidade de análise de lançamentos (com
  `is_launch` + `launch_started_at` para o modo lançamento).
- `artist_releases` continua a ser **upload por plataforma** e liga-se à obra por
  `song_id` (nullable, `ON DELETE SET NULL`) — não se apaga nem se reescreve.
- **Soundcharts é a fonte** de streams/views/vídeos/playlists da obra
  (`artist_song_metrics_daily`, `artist_song_playlists`). Métrica que a Soundcharts
  não devolva **não se grava** e a plataforma que devolve 403/404 fica em `notes`,
  sem contar como erro.
- **O Spotify não expõe plays por playlist.** O efeito das playlists lê-se por
  *seguidores × posição × data de entrada* contra a curva de streams —
  `v_song_playlists_current` ordena por seguidores exactamente para isso. Qualquer
  número que apareça como "plays vindos da playlist" é invenção.
- Identificadores por plataforma vivem em `artist_song_identifiers`; leitura em
  `v_song_metric_latest` e `v_song_growth` (1d/7d/30d, NULL quando a série não
  cobre a janela).

## D-ERP50 — ver D-ERP48

Fundida na **D-ERP48**, que é a entrada única e completa sobre a transferência do
fecho de bilheteira. Esta entrada fica só para não partir links já escritos.

## D-ERP52 — Shorts/Reels/TikTok pela Soundcharts: o que a API dá e o que não dá (12/09/2026)

**Contexto.** `artist-shorts-sync` traz os vídeos curtos do artista por plataforma
(`artist_content` + `artist_content_metrics_daily`, `source = 'aggregator'`).
Confirmado contra a API real neste dia.

**Decisão / factos que não se reinvestigam.**
- A resposta por vídeo é `{ identifier, title (vem SEMPRE vazio), description,
  createdAt, externalUrl, latestAudience: { date, views, likes, comments } }`.
  Na ausência de `title`, o título mostrado é o início da `description`.
- **Não existe** `shares`, thumbnail, duração, autor **nem a música associada**.
  Por isso `artist_content.song_id` fica NULL: "que Reels usam esta música" **não
  é respondível** por esta via. Não inventar ligação por semelhança de texto.
- A data da métrica é `latestAudience.date`, **não** a data de hoje. Gravar hoje
  num valor de outro dia falseia a série.
- O **TikTok não é um código de plataforma válido neste endpoint** (HTTP 400).
  Testados e recusados: `tiktok`, `tik-tok`, `tiktok_video`, `tt`, `douyin`.
  Fica em `notes`, com `0` vídeos, e **não conta como erro**.
- Dedup contra o Instagram oficial (`source = 'platform_api'`) é por permalink
  **normalizado** (sem barra final nem query): o Graph grava `.../reel/XXX/` e a
  Soundcharts `.../reel/XXX`. Sem normalizar, o mesmo Reel entrava duas vezes.
- `caption_excerpt` tem CHECK de 200 caracteres — cortar na origem.
- Cadência: cron `carreira-shorts-sync-diario`, 09:50 UTC, depois do de músicas.

**Verificação (Litto Lins, 12/09/2026).** 200 vídeos YouTube + 200 Instagram,
1.600 linhas, 5 chamadas, TikTok 0 em `notes`, 0 duplicados de permalink contra
os 25 Reels oficiais, 1.200 métricas.

## D-ERP53 — Ligação vídeo→música é estimada até confirmação (12/09/2026)

A Soundcharts não devolve a música associada a Shorts/Reels. A ligação
`artist_content.song_id` passa a ter estado explícito em
`artist_content.song_link_status` (`none` | `estimated` | `confirmed` |
`rejected`) e motivo em `song_link_reason`.

**Decisão:** a ligação vídeo→música é ESTIMADA por menção textual (título ou
hashtag do título base na descrição/legenda) até confirmação manual ou até
existir fonte oficial (TikTok Display API). Nunca se apresenta uma estimativa
como confirmada.

- Motor: `artist_content_link_songs(p_artist_id, p_dry_run)` — normaliza com
  `unaccent`+`lower`, corta sufixos `(...)`, `[...]` e ` - ...`, testa também
  `#tituloseespacos`; liga só com UMA música a bater; entre versões do mesmo
  título base desempata por `is_launch` e `release_date` mais antiga; empate
  real devolve "ambíguo" sem escrever.
- Escrita manual: `artist_content_set_song(p_content_id, p_song_id, p_status)`,
  só admin/manager/marketing_manager/platform_admin, com registo em
  `system_audit_log`.
- `artist-shorts-sync` e `artist-instagram-sync` chamam o motor no fim de cada
  corrida real e reportam `estimated_song_links`.
- `v_content_latest` e `v_artist_content_ranking` expõem `song_link_status`;
  `v_song_content` separa `videos_confirmed`/`videos_estimated` e os totais
  de views/likes por estado.

Adenda (13/09/2026) — a sincronização NUNCA sobrescreve a ligação. O
`artist-shorts-sync` escrevia `song_id: null` no upsert e apagava as ligações
existentes (13/09 09:50 perdeu 3 ligações do Litto, que ficaram com `song_id`
NULL e `song_link_status = 'estimated'`). Passou a separar linhas novas (única
via onde escreve `song_id`/`song_link_status`/`song_link_reason`) de linhas já
existentes (só conteúdo e métricas); o `artist-tiktok-sync` nunca inclui essas
colunas. Coerência garantida na base: trigger
`trg_artist_content_normalize_song_link` (BEFORE INSERT/UPDATE) põe o estado a
`none` quando `song_id` fica NULL, e o CHECK
`artist_content_song_link_coherent` proíbe `estimated`/`confirmed` sem música.
`artist_content_link_songs` passou a considerar também linhas com `song_id` NULL
em estado `estimated` (auto-reparação). Prova: sync do Litto com
`dry_run=false` manteve as 15 ligações da música `74c40d7b` e 0 linhas
incoerentes.


## D-ERP54 — Relatório de lançamento é gerado por LLM só a partir do snapshot da base (12/09/2026)

O relatório de lançamento de uma música (`artist-song-report`) é gerado por LLM
(`google/gemini-2.5-flash`, temperature 0.2, saída forçada por tool) a partir de
um snapshot montado inteiramente pela base: streams por plataforma,
playlists, vídeos ligados à música, audiência e demografia do artista e
comparáveis. Números fora do snapshot são PROIBIDOS: o prompt obriga a citar em
cada recomendação o número que a justifica e a responder "sem dados" quando o
dado não existe. O snapshot enviado fica gravado em `input_snapshot`, para o
relatório ser auditável linha a linha.

O relatório é HISTÓRICO: cada geração é uma linha nova em
`public.artist_song_reports` (nunca se reescreve uma anterior); erros também
ficam gravados, com `status = 'error'`. A vista `v_song_report_latest` dá o
último relatório `ok` por música. Máximo de 1 geração automática por música por
dia (o pedido manual não é travado). Cron `carreira-song-report-diario`, 10:00
UTC, percorre `artist_songs` com `is_launch = true` e
`tracking_status = 'ativo'`.

Nota de numeração: o pedido pedia D-ERP53, número já ocupado pela decisão da
ligação vídeo→música; esta decisão ficou em D-ERP54.

**Adenda 2026-09-19 (correção da guarda de frequência).**
A guarda "1 geração automática por música por dia" usava uma janela deslizante de 24h (`Date.now() - 86_400_000`). Como o relatório é gravado ~20 s depois de o cron disparar (10:00:00 UTC), no dia seguinte o cron chegava ~23h59m40s depois do anterior, ainda dentro da janela, e devolvia `skipped`. O cron disparou a 14, 15, 16, 17 e 18/09 mas só gravou relatório a 16 e 18/09.
**Regra nova:** a guarda usa o dia de calendário UTC (desde `today 00:00:00Z`) e conta só relatórios com `status = 'ok'`. Relatórios em erro não bloqueiam nova tentativa no mesmo dia. O skip passou a logar o `id` e `generated_at` do relatório que o causou.

**Adenda 2026-09-19 (formato de números, frescura e regeneração por alteração de dados).**

*Snapshot.* Contagens e ritmos por dia saem do snapshot já como INTEIROS
(`daily_gain`, `ganho_no_periodo`, `media_diaria_ultimos_7`,
`media_diaria_7_anteriores`, `melhor_dia.ganho`, `media_views_*`,
`delta_views_7d`, `delta_desde_lancamento`, `delta_30d_antes_do_lancamento` e, no
`benchmark_alinhado`, `spotify_streams_por_dia_a_esta_idade` e
`tiktok_ugc_por_dia`). Só percentuais e índices (`delta_7d_pct`, `delta_30d_pct`,
`indice`) mantêm 1 casa decimal. Novo bloco `snapshot.frescura` =
`{ gerado_em, ugc_tiktok_data, ugc_dias_de_atraso, s4a_snapshot,
s4a_dias_de_atraso, benchmark_ugc_data_mais_antiga, benchmark_ugc_dias_de_atraso }`
— as quatro primeiras da própria música (linha `is_self` do benchmark e
`spotify_for_artists.snapshot`), as duas últimas da data de UGC mais antiga entre os
comparáveis com UGC; `atraso = periodo.fim − data` em dias inteiros, `null` sem dado.

*Prompt.* A regra 1 passa a permitir um único arredondamento, o da regra 13. Novas
regras de FORMATO (13 contagens e ritmos sempre inteiros; 14 formato pt-BR — ponto só
como milhar, vírgula só em percentuais com 1 casa, proibido abreviar; 15 campos
numéricos da ferramenta em número puro inteiro) e de FRESCURA (16 todo número de
registo manual é citado com a data do dado; 17 o ritmo por dia é o do snapshot, é
proibido recalcular ou chamar acumulado de "por dia"; 18 atrasos — UGC > 2 dias e
S4A > 8 dias entram em `sinais_de_alerta` e travam leitura de tendência; UGC dos
comparáveis > 2 dias obriga a dizer a data e a não concluir ultrapassagens por margens
pequenas).

*Regeneração por alteração de dados.* `public.artist_songs.report_stale_at` marca o
relatório como desactualizado; `public.artist_song_reports.trigger_source`
(`cron|manual|data_change`) guarda a origem. `artist_song_metric_set_manual` e
`artist_song_playlist_streams_set` põem a marca **só** com valor novo ou diferente
(regravações idênticas não marcam), via `public.artist_song_mark_report_stale`: na
própria música se `is_launch`, e — quando a música é `is_reference` — em todos os
lançamentos cujo benchmark a inclui (`artist_comparables` do artista do lançamento →
artista da música de referência). Assinaturas, retornos e privilégios das duas RPCs
inalterados (D-ERP94: anon sem EXECUTE).

`artist-song-report` aceita `trigger_source:'data_change'` + `stale_at` **só** de
service_role (de utilizador é ignorado e fica `manual`). Para `data_change`: não se
aplica a guarda de 1/dia do cron; teto próprio de **6 TENTATIVAS por música por dia
UTC** (conta `ok` e `error`, para uma falha repetida do LLM não gerar custo sem fim),
ao 7.º pedido devolve `200 { skipped:true, reason:'data_change_daily_cap' }` com
`console.log`; no fim de uma geração `ok` limpa a marca só se ninguém a mexeu
entretanto (`WHERE id = song_id AND report_stale_at = stale_at`) — se entrou dado novo
durante a geração a marca fica. Regenerar nunca substitui: grava linha nova.
O cron `carreira-song-report-diario` (10:00 UTC, job 101) e a sua guarda por dia de
calendário ficam como estão.

*Cron novo (criado em Live pelo Pedro, não por migração):* `carreira-song-report-stale`,
`*/15 * * * *`, para cada música `is_launch` e `tracking_status='ativo'` com
`report_stale_at < now() - interval '10 minutes'` (debounce: a recolha de segunda grava
~100 linhas seguidas) e `report_stale_at >` `generated_at` do último relatório `ok` (ou
sem relatório), chama `artist-song-report` com
`{ song_id, trigger_source:'data_change', stale_at }`.

## D-ERP55 — O saldo do extrato é calculado sobre a ordem que se vê, não sobre a ordem plana (12/09/2026)


**Contexto.** O extrato tem de ser conferível linha a linha contra o extrato do
banco. Ao consolidar, as filhas de um grupo são puxadas para junto do cabeçalho e
as linhas soltas que estavam intercaladas passam a ser desenhadas numa posição
diferente daquela em que o seu saldo plano foi calculado. Herdar o saldo plano
fazia uma SAÍDA aparecer a aumentar o saldo — caso real: a Passagem aérea de
882,32 € desenhada entre o cabeçalho do lote SEPA e o da TicketLine.

**Decisão.** Com a consolidação ligada, o saldo mostrado é RECALCULADO sobre a
ordem consolidada, a partir do saldo de abertura. As unidades (transação solta ou
grupo) ordenam-se pela data da UNIDADE — a do banco quando existe, porque é o
banco que manda na conferência. As filhas NÃO mostram saldo: um saldo intra-grupo
não corresponde a posição nenhuma no banco. A linha dos ajustes de caixa fica
sempre em último, seja qual for a sua data.

**Invariante.** O `lines` plano continua a ser a fonte ÚNICA do saldo final, dos
totais e das duas exportações, que são sempre planas. O saldo da última unidade
tem de ser igual ao saldo final — uma soma não depende da ordem das parcelas — e
há um teste em `src/lib/__tests__/statement-grouping.test.ts` que o verifica. Se
divergir, há uma transação em duas unidades ou em nenhuma: corrige-se isso, não
se compensa.

## D-ERP56 — TikTok oficial é a fonte primária dos vídeos do próprio artista (12/09/2026)

**Contexto.** Os vídeos curtos vinham só da Soundcharts (`artist-shorts-sync`), que
não expõe TikTok (D-ERP52): sem música associada, sem título e sem o vídeo do
próprio artista. A app própria "Social Music Carreira" no TikTok for Developers
(Display API + Login Kit) dá acesso directo à conta do artista, com autorização
dele.

**Decisão.** O TikTok oficial passa a ser a fonte PRIMÁRIA dos vídeos do próprio
artista: `artist-tiktok-sync` escreve `artist_content` e
`artist_content_metrics_daily` com `source = 'platform_api'`, e o perfil
(followers/following/likes/video_count) em `artist_metrics_daily`. A Soundcharts
fica para YouTube/Reels e para os comparáveis. Cron
`carreira-tiktok-sync-diario` às 09:55 UTC, no máximo 200 vídeos por corrida
(páginas de 20 até `has_more = false`).

**Como.** Mesmo padrão do Instagram directo: `artist-tiktok-oauth-start` (JWT,
cria o state com `provider = 'tiktok'`), `artist-tiktok-oauth-callback` (sem JWT,
autorizado pelo state de uso único, confirma que `username` = handle do canal e
devolve `connection=error&reason=conta_diferente` se não bater), tokens cifrados
via `artist_upsert_channel_connection`. Credenciais próprias
`TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` — nunca credenciais de anúncios,
nunca `ad_platform_connections`.

**Tokens.** O access token dura 24 h e o refresh token 365 dias, ambos cifrados
(`refresh_token_encrypted`, `refresh_expires_at`). `artist-token-refresh` renova
quando falta menos de 6 h; a própria `artist-tiktok-sync` renova antes de ler. Se
a renovação falhar, a ligação fica `expired` e o canal `auth_status = 'expired'`
— é preciso religar. `artist-connection-disconnect` chama `/v2/oauth/revoke/`
antes de apagar; a falha da revogação não impede o desligar.

**Adenda (12/09/2026) — sync inicial completo por parâmetro.** `artist-tiktok-sync`
aceita `max_videos` (default 200, máximo duro 2000) e `since` (data ISO: a paginação
do `video/list` para quando uma página só traz vídeos anteriores a `since`). O cron
diário `carreira-tiktok-sync-diario` mantém-se sem parâmetros, logo em 200 vídeos;
os parâmetros usados ficam registados em `sync_runs.details.params`. Primeira corrida
histórica do Litto Lins (`since=2026-01-01`, `max_videos=2000`): 14 chamadas à API,
237 vídeos, mais antigo 2026-01-01T01:43:47Z.

Nota de numeração: o pedido pedia D-ERP55, número já ocupado pela decisão do saldo
do extrato; esta decisão ficou em D-ERP56.

**Adenda (19/09/2026) — cursor de retoma e rate limit não silencioso.** Ensaio em
dry_run em Live (perfil com 1.315 vídeos): com `max_videos=2000` a corrida leu 959
vídeos e parou com `rate_limit_exceeded` do TikTok; como a paginação recomeçava
sempre no topo e o rate limit era uma nota silenciosa (sync_run fechava `success`),
o catálogo completo nunca fechava. Novas regras em `artist-tiktok-sync`:

- Novo parâmetro opcional `cursor` (número, cursor da Display API video/list): a
  paginação começa aí em vez do topo. Só é aceite com `artist_id` ou
  `connection_id` (uma ligação por corrida); com cursor e mais de uma ligação → 400.
- Cada artista na resposta devolve sempre `next_cursor` (último cursor válido, ou
  null no fim) e `has_more`; `params` passa a incluir `cursor`.
- `rate_limit_exceeded` deixa de ser silencioso: repete a MESMA página até 2 vezes
  (espera 20 s, depois 40 s), sem ultrapassar 110 s de invocação; persistindo, pára,
  grava o parcial, devolve `next_cursor`/`has_more=true` e regista o erro em
  `errors` → sync_run fecha `partial` (nunca `success`). A ligação NÃO passa a
  `error` por rate limit — fica `active`.
- Corridas grandes (`max_videos > 200` ou `cursor` presente) fazem pausa de 400 ms
  entre páginas. O cron diário (200 vídeos, sem cursor) fica byte a byte igual.
- Sync inicial de um perfil grande em várias corridas: chamar com
  `max_videos=2000`; se a resposta vier com `has_more=true`, chamar de novo com
  `cursor=<next_cursor>` até `has_more=false`.



**Adenda a DR-2026-09-09-D25 — (b) construída em 2026-09-12:** `event_settlement_id`
(NULL) em `event_forecasts` e `transactions`, com índices parciais e triggers de
coerência (mesmo evento; apuramento selado não aceita marcações; transação sem
evento — mãe de rateio — não pode ter apuramento; apuramento com linhas não se
apaga). Selector "Apuramento" só visível em eventos com 2+ apuramentos e bloco
"Perímetro" no painel da aba Sócios. **Zero linhas marcadas** e nenhum cálculo
consome a coluna. Armadilha registada: `transactions.settlement_id` é o fecho de
bilheteira (`ticket_office_settlements`), não o apuramento.

**Adenda a DR-2026-09-09-D25 — (c) motor construído em 2026-09-12:** motor PURO
`src/lib/event-settlement-engine.ts` (+ totais partilhados
`src/lib/event-settlement-inputs.ts`, hook `useEventSettlementEngine`), ligado ao
painel "Apuramentos" em modo **só leitura**. Fórmulas: perímetro da raiz = total do
evento − linhas marcadas; quota do filho = `parent_share_pct` × resultado do pai na
`parent_share_basis` (irmãos não se subtraem); resultado do nó em duas bases
(R_s s/IVA, R_c c/IVA) = quota + receitas − despesas da base; parte do participante
= % × resultado na base do participante (casa sempre s/IVA, D-ERP10; % de perda
quando o resultado é negativo); residual da MP = resultado s/IVA do evento − Σ partes
`settles`, decomposto em declarada + IVA dedutível + nominal−real + resto.
Conferências: **C1** Σ partes pagas + residual = resultado do evento; **C2** resto = 0
(≠ 0 é erro de configuração das percentagens). Prova conta-a-conta contra o Encontro
de Contas em modo "por contrato de cada sócio": **0,00 € de diferença** em 13
participantes / 6 eventos legíveis pela sessão MP (a 7.ª raiz é do tenant Coala e a
RLS esconde-a — correcto). Anitta nível 1, quota de 70%: referência da v4
418.028,42 € vs BP vivo 417.293,42 € na base "previsto + excedido · despesas c/IVA"
(desvio 735,00 €) e 1.357.819,77 € na base "realizado" — o painel mostra o critério
em uso. Nenhum ecrã existente mudou; o Encontro de Contas continua a ser a fonte.

**Adenda a DR-2026-09-09-D25 — (d) operações de terceiros construídas em
2026-09-13:** tabelas novas `event_third_party_operations` (kind ab_bebidas ·
ab_alimentos · bengaleiro · merchandising · estacionamento · outro; `source`
`ab_module` ou `manual`) e `event_operation_participations` (participação de um
apuramento numa operação, nos modos `gross_pct`, `result_share`, `per_capita`,
`fee`), ambas **vazias** na aplicação. O módulo **A&B é lido, nunca duplicado**:
nas operações `ab_module` o bruto e o resultado do operador vêm ao vivo de
`computeTotals` (cenário real) e os campos de montante são obrigatoriamente NULL
por CHECK. Regra do **activo adicional**: a raiz não ganha valor novo (a sua
participação já está representada na receita do perímetro); o filho ganha
`participação do filho − participação já lançada nos apuramentos ascendentes`,
que entra como receita exclusiva do nó. Caso de referência (Anitta): raiz
`gross_pct` 35 % sobre bruto 287.138,58 € = 100.498,50 €; nível 3 `result_share`
100 % sobre resultado do operador 194.468,13 € ⇒ activo adicional **93.969,63 €**.
**C1** passa a incluir os activos adicionais no lado do dinheiro; **C2** mantém-se.
Edição mínima no painel gated por `manage_bp` (criar operação manual, "Ligar ao
A&B", definir participação). Paridade da (c) repetida: **0,00 €** de diferença em
13 participantes / 6 eventos legíveis; `max(updated_at)` das cinco tabelas
anteriores inalterado. Nenhum ecrã existente mudou.

**Adenda a DR-2026-09-09-D25 — (e) construída em 2026-09-13:** `event_partners`
passou a **derivada**: a verdade dos sócios é `event_settlement_participants`
(trigger `trg_esp_sync_event_partners` → `event_partners_sync_from_settlements(uuid)`,
SECURITY DEFINER com EXECUTE só a `service_role`; espelho antigo
`trg_event_partners_mirror_*` e `event_settlement_sync_root` removidos; FK
`event_partner_id` → `ON DELETE SET NULL`). `event_partners` continua a existir
só para pagador/ordenador (`paying_partner_id`, `ordering_partner_id`,
`check_partner_total_percentage`, `prevent_event_partner_role_disable_if_used`).
Prova: 9 linhas antes / 9 depois, diferença simétrica 0
(`event_partners_mirror_inversion_proof`), e prova por parte nos eventos legíveis
com **0 linhas de diferença** entre o modelo antigo (event_partners + casa
injectada) e o novo (participantes `settles`).

RLS estanque: `is_settlement_staff`, `user_settlement_ids`,
`user_settlement_visible_ids` (CTE recursiva de ascendentes) e
`settlement_local_partners_pct` (100 − Σ `profit_pct` dos que acertam ali);
EXECUTE revogado a `anon`. `get_partner_event_shares` reescrita: staff vê todas
as partes do evento a partir dos participantes; o sócio vê **apenas a sua** e o
resto colapsa em **"Sócios locais"** (100 − a sua %), sem revelar quem são.

Casa injectada **eliminada do código**: `src/lib/house-partner.ts` apagado e
substituído por `src/lib/settlement-participants.ts`
(`fetchSettlementParticipants`, `fetchAllSettlementParticipants`,
`fetchEventSettlements`, `toSettlementParticipant`, `localPartnersPct`,
`residualHousePct`, `HOUSE_PARTNER_NAME`). Consumidores migrados:
`PartnerSettlementTab`, `partner-settlement-report`, `ReportPartnerSettlement`,
`PartnerCapitalPanel`, `useEventSettlementEngine`, `EventPartnersTab`,
`export-partner-statement`. A aba Sócios passou a **editar apuramentos**
(gated por `manage_bp`; casa read-only, recalculada). O Encontro de Contas ganhou
**selector de apuramento** (só com 2+ apuramentos) e o PDF de fecho imprime o
apuramento em uso. Paridade ao cêntimo mantida; 34 testes verdes; sem Publish.

**Adenda a DR-2026-09-09-D25 — (e2) construída em 2026-09-13:** o Encontro de
Contas passou a **calcular pelo apuramento seleccionado** (raiz = evento menos
linhas marcadas com outros apuramentos; filho = linhas marcadas + quota do pai +
activos adicionais), o filho mostra a origem da quota e nunca os participantes do
pai, e o PDF leva o nome do apuramento no ficheiro e no cabeçalho. A aba Sócios
ganhou `EventSettlementsManager` (criar, renomear, reordenar, apagar filhos,
gated por `manage_bp`; a casa só existe na raiz). A quota da casa passou a
descontar **todos** os sócios da raiz, `settles` e `nominal` — se absorvesse a
parte nominal, o motor contava-a duas vezes (declarada + `nominalGap`) e a
conferência C2 deixava de fechar. Documentos estanques com `partnerDocRows` e
`visibleSettlementIdsForParticipant`. Paridade repetida: 0,00 € em 13
participantes / 6 eventos.

## DR-2026-09-13-D57 — O critério de custo é do evento, gravado em `events`

**Decisão.** O critério de custo deixa de ser preferência de ecrã: vive em
`events.cost_expense_source` ('realized' | 'committed', **default 'committed'**)
e `events.cost_include_overhead` (boolean, **default true**). É lido pelo card da
capa, pelo Fecho, pelo Encontro de Contas, pelo painel Apuramentos, pelos PDFs e
pelo Portal do Sócio — o mesmo número em qualquer computador e para qualquer
pessoa. Escrita gated por `manage_bp` (ou admin/manager), com erro em toast.

**Porquê.** O critério vivia no `localStorage` de cada browser: duas pessoas (ou
a mesma pessoa noutro computador) viam custos diferentes para o mesmo evento, e
um PDF de fecho podia sair com um critério que ninguém mais reproduzia. Um total
que depende de um clique local produz erro de fecho por esquecimento.

**`withVat` é derivado, não é escolha.** Vem de `events.partner_calc_basis` (o
critério contratual gravado). Deixou de haver toggle de IVA no card de custos e
no selector do Fecho — muda-se na ficha do evento. O card de **receitas** mantém
a sua preferência local de IVA (não é matéria de fecho).

**Backfill.** Todos os eventos existentes ficaram em `committed` + `true` pelo
DEFAULT, **incluindo a Anitta**: é exactamente o critério da planilha v23/v4
(previsto + excedido, com overhead, despesa c/IVA). Nenhum caso especial. O
resultado 597.183,45 dessa planilha não se reproduz hoje por faltarem os níveis
2/3, os activos exclusivos e ajustes de IVA — peça posterior, com autorização.

## 2026-09-13 — Selo do fechamento é a única via de alteração do selo
Decisão: os campos do selo em `event_settlements` só mudam pelas RPCs
`seal_event_settlement` / `unseal_event_settlement`; qualquer UPDATE directo é
recusado por trigger. Selar exige as duas conferências a 0,00 €; reabrir exige motivo
e fica registado em `system_audit_log`. O desvio entre valor selado e valor ao vivo é
informação interna — nunca aparece em documentos de sócio.

**Adenda (f) — espelho de sócios e quota opcional.**
1. O espelho `event_partners` passa a derivar de **qualquer** fechamento do evento: há
   linha para cada sócio participante em qualquer nível, com os valores do participante
   que **liquida** (`settles`) e, se não existir, os do **nominal** (fechamento raiz
   primeiro, depois o mais antigo). O sócio só sai do espelho quando deixa de constar de
   todos os fechamentos; se houver lançamentos a referenciá-lo, a remoção é recusada com
   mensagem legível. Motivo: a regra antiga (só `settles`) apagava sócios legítimos e
   rebentava as chaves `paying_partner_id`/`ordering_partner_id` — caso Anitta.
2. A **quota do fechamento acima é opcional**: vazio grava 0% e o fechamento vive só das
   suas próprias receitas e despesas marcadas. A **base** da quota continua obrigatória,
   com default «resultado com despesas c/IVA».

**Adenda (g1) a DR-2026-09-09-D25 — construída em 2026-09-13.**
1. **A casa pode ser participante de qualquer fechamento** (uma por fechamento) e
   não apenas da raiz. Na raiz a casa pode ficar em **Nominal**: aí não é quota da
   MP, é o pool que desce para os fechamentos abaixo. A % da casa da raiz continua
   calculada (100 − Σ sócios) só quando ela liquida; nos filhos é definida à mão.
2. **Parte declarada da MP** = soma das partes da casa em todos os fechamentos onde
   ela liquida. Casa nominal nunca conta como declarada.
3. **Nova regra por fechamento: "devolve o IVA dedutível do fechamento acima"**
   (`event_settlements.returns_parent_deductible_vat`). Serve os fechos em que
   aqueles sócios recuperam o IVA que o fechamento acima suportou como custo. Só um
   fechamento por nível acima pode ter a regra (o IVA não se devolve duas vezes) e a
   raiz nunca a pode ter — garantido por índice único parcial + CHECK e validado
   também no motor. O IVA devolvido sai da base dos participantes do pai, pelo que o
   termo "IVA dedutível" do residual da MP fica a 0 quando a regra está activa.
4. **Nominal gap** define-se como a soma de (parte nominal − parte real) dos sócios
   que liquidam noutro fechamento do mesmo evento. Um nominal sem liquidação em
   nenhum fechamento passa a ser **erro de configuração explícito** em vez de uma
   conferência C2 falhada sem explicação (era o caso do teste dos Mágicos, −968,18).

**Adenda (g2) a DR-2026-09-09-D25 — construída em 2026-09-13.** A Anitta EDA 2026
passou a ser o caso de referência a três níveis em Live (raiz + "Fechamento Rafael
Lobo" + "Fechamento MP + EIN", os dois filhos irmãos da raiz). Três decisões ficam
fechadas: (1) **o trigger `check_partner_percentage_trigger` foi removido** de
`event_partners` — com fechamentos em árvore o espelho soma legitimamente mais de
100% (70 + 50 + 20 = 140) e a soma ≤ 100% deixou de ser invariante do sistema;
(2) **as receitas exclusivas de um fechamento são transações do próprio evento
marcadas com `event_settlement_id`**, e não transações fora do evento — a raiz
calcula-se por "totais − marcadas", pelo que marcá-las não altera o resultado da
raiz nem a parte de nenhum sócio da raiz; isto **revoga a nota de 25/08/2026** que
as mandava manter fora do evento; (3) o filho com
`returns_parent_deductible_vat` recebe o IVA dedutível do **perímetro da raiz**
(todo o IVA dedutível das despesas do evento), como faz a planilha v23. Prova em
Live: ANITTA 417.293,42 antes e depois (ao cêntimo), Rafael Lobo 35.768,01
(= 20% × 30% × 596.133,45), nível 3 547.906,69, EIN = casa = 273.953,35, C1 e C2 a
0,00. A prova apanhou um bug de paridade — o Encontro de Contas mostrava a nota do
IVA devolvido sem o somar à receita do nó — corrigido em `PartnerSettlementTab`.

**Adenda (g3) a DR-2026-09-09-D25 — construída em 2026-09-13.**
**O resultado do evento é o PERÍMETRO DA RAIZ.** Em qualquer ecrã ou documento, o
resultado do evento = totais do evento **menos** as linhas (transações e linhas de
BP) marcadas com um fechamento que **não** é a raiz. Essas linhas são exclusivas
desse fechamento e nunca entram em receita, custo, lucro, margem, card, Resumo,
Fecho, DRE de evento nem Portal do Sócio. Linhas marcadas com a própria raiz
contam normalmente.

SSoT: `src/lib/settlement-perimeter.ts` (`isOutsideRootPerimeter` /
`keepRootPerimeter` / `pickOutsideRootPerimeter`) + hook
`src/hooks/useEventRootSettlements`. Aplicada em `event-revenue-basis`,
`useEventFinancialCardData`, `EventFecho`, `ResultsAnalysis`, `ReportDRE`,
`EventDetail` e — no servidor — na RPC `get_partner_event_tx_aggregates`
(SECURITY DEFINER, search_path e grants inalterados; filtro
`event_settlement_id IS NULL OR pertence a um fechamento raiz`).

**DRE Empresarial e DRE Brasil ficam como estão** (vistas de EMPRESA, não de
evento): o dinheiro dos exclusivos continua a ser da empresa e por isso mantém-se
nessas vistas. O corte do perímetro é só de EVENTO.

**Critério do card (D57):** o eixo "Realizado" vs "Previsto + excedido" vive na BD
(`events.cost_expense_source`) para os DOIS cards (receitas e custos). O modo
"Automático (pela fase do evento)" foi REMOVIDO — era um resto anterior à D57 e
fazia o card de receitas escolher o modo pela fase do evento a partir do
`localStorage` de cada browser, pelo que dois utilizadores viam números
diferentes. O `localStorage` guarda apenas a escolha exploratória "Forecast"
(que não existe na BD). Enquanto a query do evento não chega, o card mostra "—"
e não propaga valor ao card Lucro.

Prova em Live: só a Anitta EDA 2026 tem linhas fora do perímetro (3 TX de receita,
72.250,52 s/IVA, "Fechamento MP + EIN"); 0 linhas de BP em toda a base. Os
restantes 55 eventos dão receita/custo/lucro idênticos antes e depois.

**Adenda (g3+) — o Lucro nunca usa receita prevista.** O card Lucro e a margem
usam sempre a RECEITA REAL do perímetro da raiz (`realValue` em
`useEventFinancialCardData`), mesmo quando o card de receitas está em "Previsto +
excedido"; o card de receitas continua a mostrar o valor do critério, com nota
discreta "real: X" quando os dois divergem. Assim o Lucro do evento é igual ao
resultado do fechamento raiz no Encontro de Contas. Prova Live (13/09/2026):
Anitta 2.527.352,94 − 1.931.219,49 = 596.133,45 no card e no Encontro de Contas;
Plenitude −21.124,92; FestVybbe −47.186,80; H&K Madrid −525.628,84; Ivete
−308.812,62; Mágicos H&K −30.233,91 — todos iguais a receita real − despesas
c/IVA do motor. Coala Festival PT 2026 pertence a outro tenant e não é visível na
sessão MP (não verificado por ecrã).

**Adenda (g4) — base por fechamento e documento do sócio.** A base de cálculo é
do FECHAMENTO, não do participante: raiz = `events.partner_calc_basis`, filho =
`parent_share_basis`; todos os participantes do nó, casa incluída, usam essa
base. Cai a regra "casa sempre s/IVA" (D-ERP10 deixa de se aplicar a
fechamentos) e o `expense_includes_iva` por participante (coluna mantida, já não
lida pelo motor e escondida na UI). O residual da MP absorve a diferença de IVA
("IVA dedutível não devolvido"); C1 e C2 continuam a fechar.

O documento de sócio (PDF+XLSX) passa a ser a PRESTAÇÃO DE CONTAS: "Resumo do
Fecho" (1 O ACORDO · 2 AS RECEITAS DO EVENTO s/IVA · 3 AS DESPESAS DO EVENTO
c/IVA · 4 O RESULTADO · 5 A PARTE DE <SÓCIO>) + "Detalhamento" (A receitas linha
a linha, B despesas família → rubrica → linhas com IVA e nº de anexos, nota do
art. 18.º CIVA). É ESTANQUE também no export da equipa: só o destinatário
aparece pelo nome, os restantes colapsam em "Sócios locais — NN%" (ou "Mundo
Propício — NN%" quando é o único outro participante); nunca "nível",
"fechamento acima/abaixo" nem "bases diferentes". Língua por
`suppliers.doc_locale` ('pt-PT' | 'pt-BR'). Ficheiros
`Prestacao_de_Contas_<evento>_<sócio>.pdf/.xlsx`. O relatório completo interno de
gestão (sem sócio) fica exactamente como estava.

**Adenda (g4) 13/09 — secção 5 e linha final do Encontro de Contas.** A secção
"5 A PARTE DE <SÓCIO>" tem estrutura obrigatória:

1. `<sócio> — NN% do resultado` = parte no fechamento
2. `Sócios locais — MM%` (ou `Mundo Propício — MM%`) por subtracção
3. `+ Despesas do evento pagas por <sócio>` — o "Pagas (+)" do Encontro de
   Contas, financiamento a devolver ao sócio
4. `- Extras` e `- Já adiantado a <sócio>` (extras + adiantamentos da conta de
   acerto, como hoje)
5. `= BASE A TRANSFERIR A <sócio>` (ou "A RECEBER DE", se negativa)
6. `+ IVA 23% sobre o repasse` — SÓ quando
   `event_settlement_participants.transfer_with_vat = true` (boolean NOT NULL
   default false, editável na aba Sócios com o rótulo "Repasse facturado com IVA
   (23%)"); o IVA incide sobre a base apenas quando positiva
7. `= TOTAL A TRANSFERIR A <sócio>`

A taxa é a constante normal de IVA PT (`TRANSFER_IVA_RATE = 23` em
`partner-statement-doc.ts`, via `calcIvaAmount`). O mesmo cálculo aparece na
linha final de cada sócio no Encontro de Contas (base · IVA · total). Prova:
EVERYTHINGISNEW com `transfer_with_vat` ligado — base 264.273,90 (273.953,35 +
18.420,55 − 3.100,00 − 25.000,00), IVA 60.783,00, total 325.056,90 (sem escrita
na BD).

### Adenda (g4·2) — desembolso efectivo do sócio e contas de acerto (13/09/2026)

Precisão do Pedro à secção 5 e à linha final do Encontro de Contas:

- **"+ Despesas do evento pagas por \<sócio\>"** = (a) transações de despesa
  pagas pelo sócio (como hoje) **+ (b) linhas de BP com `paying_partner_id` =
  sócio e **sem** transação ligada** (D-ERP14: o fornecedor factura em nome do
  sócio, que refactura à MP; essas linhas nunca viram transações). As linhas de
  BP são valorizadas no critério do evento e **na base do fechamento** (c/IVA na
  raiz da Anitta). Sem dupla contagem: linha de BP com transação conta pela
  transação. É o "desembolso efectivo do sócio" da planilha.
- **"− Já adiantado a \<sócio\>"** = extras/adiantamentos como antes **+ as
  entradas nas contas de acerto do sócio** (`financial_accounts.partner_id` =
  sócio, ex. "Acerto EIN · Anitta EDA 2026"), filtradas pelo `event_id` das
  transações. É dinheiro do evento que já está com o sócio.
- **"= BASE A TRANSFERIR"** = parte + desembolso − adiantado; `+ IVA 23%` quando
  `transfer_with_vat`; `= TOTAL`.

SSoT do cálculo: `src/lib/partner-disbursement.ts` (`collectBpPaidLines`,
`sumLineAmounts`, `collectSettlementAccountEntries`, `partnerDisbursement`,
`partnerAdvancedTotal`), com testes em
`src/lib/__tests__/partner-disbursement.test.ts`.

Prova ao vivo (só leitura, Anitta EDA 2026, EVERYTHINGISNEW): parte 273.953,35 +
desembolso 1.305.957,51 (118 linhas de BP c/IVA, 0 transações) − 905.000,00
(conta de acerto) = **base 674.910,86**; IVA 23% **155.229,50**; total
**830.140,36**.

Cobre a issue #133 ("Encontro de Contas não lê as contas de acerto") no lado da
equipa. O Portal do Sócio mantém o desembolso só por transações — as linhas de
BP e as contas de acerto não são legíveis pelo sócio com a RLS actual.

### Adenda (g5) — desembolso, receitas em poder do sócio e Portal (13/09/2026)

Modelo definitivo do financiamento do sócio, decidido pelo Pedro:

- **Desembolso do sócio** = (a) transações em `partner_paid_expenses` + (b)
  **todas** as linhas de BP aprovadas (`version_id IS NULL`) com
  `paying_partner_id` = sócio, **incluindo as que têm transação ligada** (ex.
  open bar 64.029,84). Só se exclui a linha cuja transação ligada já esteja em
  `partner_paid_expenses` do mesmo sócio. Valorização **s/IVA por defeito**;
  c/IVA apenas quando `suppliers.doc_locale = 'pt-BR'`. Isto substitui a regra da
  adenda (g4·2), que excluía as linhas com transação.
- **Ajustes ao desembolso** — lançamentos manuais por sócio × evento, com sinal e
  descrição obrigatória, em `event_partner_extras` com
  `kind = 'disbursement_adjustment'` (CHECK `('extra','disbursement_adjustment')`).
  `kind = 'extra'` mantém o comportamento anterior (abate ao acerto).
- **Receitas em poder do sócio** (abatem ao financiamento, itemizadas):
  (i) entradas nas contas de acerto do sócio; (ii) receitas do evento cuja
  `account_id` é conta com `partner_id` = sócio; (iii) operações de terceiros com
  `event_third_party_operations.held_by_supplier_id` = sócio (selector
  "Resultado ficou com" no painel de operações de terceiros).
- **Linha final do sócio** — parte · + desembolso · ± ajustes · − receitas em
  poder · − extras/adiantamentos · = BASE A TRANSFERIR · + IVA 23% se
  `transfer_with_vat` · = TOTAL. **Financiamento a devolver** = desembolso ±
  ajustes − receitas em poder.
- **Demonstrativo do fechamento que devolve o IVA** — linha "IVA dedutível
  recuperado — devolvido pelo fechamento acima" antes do resultado.
- **Export de conferência** — "Desembolso de \<sócio\> (Excel)"
  (`src/lib/export-partner-disbursement.ts`): transações, linhas de BP com marca
  "tem transação", ajustes e receitas em poder, linha a linha.
- **Painel de capital** — bloco "Posição de caixa por sócio" = aportes −
  devoluções + despesas do evento pagas pelo sócio, já dentro do perímetro da
  raiz (g3).
- **Portal do Sócio** — RPC SECURITY DEFINER
  `get_partner_settlement_summary(_event_id, _settlement_id, _partner_share, _transfer_with_vat)`:
  resolve o sócio por `profiles.linked_supplier_id`, devolve zero linhas se ele
  não participar no fechamento, inclui eventos filho por `parent_event_id` e é
  estanque quanto aos restantes sócios. Levanta a limitação da (g4·2).

DDL (sem DML): `event_partner_extras.kind`, `event_third_party_operations.held_by_supplier_id`
e a RPC acima. `github-issues` ganhou `action: "get"` e paginação na `list`
(`page`, `state`, `has_more`).

Prova ao vivo (Anitta EDA 2026 · EVERYTHINGISNEW): desembolso de BP 124 linhas ·
1.170.562,18; parte 273.953,35 + desembolso 1.305.957,51 − adiantado 905.000,00 =
**base 674.910,86 · IVA 155.229,50 · total 830.140,36**. C1/C2 a 0,00.

Fecha a issue #133 e cobre a #126 no âmbito do evento.

### Adenda (g7) — receitas recebidas por encontro de contas em nome de um sócio (13/09/2026)

Compensação não pode ter conta (D-ERP43), por isso o (g5) não conseguia ver o
dinheiro que ficou com um sócio quando foi ele a fazer o encontro de contas com
o terceiro. Marca-se na transação: `transactions.held_by_supplier_id`, válido só
em receitas com `payment_method = 'compensation'`, com o mesmo conceito que já
existia em `event_third_party_operations.held_by_supplier_id`. Ao marcar, a
transação fica paga na data da transação — receita em poder de um sócio nunca
fica em "A receber". `get_partner_settlement_summary` soma-a no bloco (C); não
há dupla contagem com as contas de acerto porque a compensação não tem conta.

Regra de escrita registada aqui: descrições de transações e de linhas de BP são
texto de negócio (o que o sócio ou o contabilista devem ler) e nunca levam notas
de implementação, referências a fechamentos, "exclusivo" ou "planilha vNN".

DDL aplicada em 13/09/2026 (5 blocos): coluna `held_by_supplier_id` + índice
parcial; CHECK `transactions_held_by_only_compensation_income`; bloco (C) da
`get_partner_settlement_summary`; trigger `trg_enforce_held_revenue_is_paid`
(BEFORE INSERT OR UPDATE OF `held_by_supplier_id`, `status`); e bloco 5 —
`enforce_tx_paid_requires_account` passa a isentar `payment_method =
'compensation'`, porque a compensação nunca tem conta por desenho
(`force_no_account_on_compensation`) e a receita com "Recebido por" nasce paga.
Sem essa isenção, criar a receita já marcada falharia no INSERT.

Sem DML: a marcação do caso real (A&B Food, Anitta EDA 2026) é feita no ecrã.

## Adenda (g9a) — políticas RLS abertas são proibidas (13/09/2026)

Decisão: nenhuma tabela do schema `public` pode ter uma política PERMISSIVE com
qual genérico (`auth.uid() IS NOT NULL`, `true`, `is_authenticated()`). O padrão
único é: **`<tabela>_select_privileged_roles`** (staff, por papel) **+ política
estanque de sócio** quando o sócio precisa de ler (`has_role(...,'partner')` com
`user_has_event_access` ou equivalente), sempre com o RESTRICTIVE
`company_isolation_*` por cima.

O predicado de staff é `public.has_staff_role(uuid)` (STABLE, SECURITY DEFINER,
`search_path public`): um único EXISTS em `user_roles` com os papéis admin,
platform_admin, manager, editor, viewer, accountant, producer, field_producer,
content_manager, marketing_manager — nunca `user` nem `partner` — com o mesmo
escopo de empresa de `has_role`.

Em 13/09/2026 as 51 políticas legacy (50 SELECT + 1 INSERT) foram substituídas
por este padrão, com prova antes/depois na mesma transação. O papel `user` deixa
de dar acesso a dados: quem é staff tem de ter papel de staff.

## Adenda (g9b) — identidade do sócio e visibilidade dos fechamentos (13/09/2026)

1. **Identidade canónica do sócio** é `public.user_supplier_id(uuid)`:
   `profiles.linked_supplier_id` com recurso ao email como alternativa. Nenhum
   código novo pode ler `linked_supplier_id` directamente para decidir acesso.
   Os campos `partner_id` / `paying_partner_id` apontam para `event_partners(id)`
   e nunca podem ser comparados com um `suppliers.id`: usar
   `user_event_partner_ids(user, event_ids[])`.
2. **A visibilidade nunca sobe.** Um sócio vê o seu nó e os descendentes; jamais
   os ascendentes ou nós irmãos.
3. **Fechamento visível = onde o sócio acerta contas (`mode='settles'`).** A
   presença nominal num nó acima é contabilística, não é uma vista. Qualquer
   escolha de "fechamento do Portal" por `position` ou por `parent_id` está
   errada — usar `get_partner_visible_settlements`.
4. **Staff do fecho** é `has_staff_role`: o papel `user` não dá acesso a nada.

## Adenda (g9c) — nominal nunca dá vista; casa implícita é a casa (13/09/2026)

1. **Presença nominal não é visibilidade.** `user_settlement_ids` só devolve nós
   com `mode = 'settles'`. Um sócio inscrito nominalmente num nó acima (para
   efeito contabilístico) não passa a ver esse nó, nem os seus dados, nem as
   operações de terceiros a ele associadas. Qualquer função de perímetro nova tem
   de repetir este filtro.
2. **Casa implícita = Mundo Propício.** Nas quotas mostradas ao sócio, quando no
   seu nó não existe outro participante não-casa, a percentagem restante é da
   casa e mostra-se com o nome da casa — mesmo que não haja linha `house` no nó
   (regra do motor: casa = 100 − Σ participantes). "Sócios locais" só aparece
   quando existem, de facto, outros sócios no mesmo nó.
3. **Documento do sócio não usa vocabulário interno.** Nunca "fechamento",
   "fecho", "IVA dedutível da casa" nem "custos internos MP": a lista
   `FORBIDDEN_DOC_TERMS` é a fonte de verdade e está coberta por teste.
4. **Cache por identidade.** Trocar de utilizador ou sair limpa a cache de
   queries; toda a chave do Portal é prefixada pelo `user.id`.

## D-ERP57 — Contas de tráfego por artista: autorizadas pelo artista, geridas pela empresa (13/09/2026)

A Social Music gere campanhas EM NOME do artista, nas contas de anúncios DELE
(Meta Ads do Business Manager do artista, Google Ads e TikTok Ads do artista).
A ligação passa a poder ser POR ARTISTA: `crm.ad_platform_connections` ganhou
`artist_id` e `connection_scope IN ('company','artist')`. A linha continua a
pertencer à empresa gestora — as policies por `company_id` mantêm-se e são a
única fronteira de acesso.

Regras:

1. **Quem autoriza é o artista, quem gere é a empresa.** Mesmo padrão do
   Instagram directo: `artist-ads-meta-oauth-start` (papéis admin,
   platform_admin, manager, marketing_manager) devolve o `authorize_url`, que é
   aberto pelo próprio artista; `crm.oauth_states` ganhou `artist_id` +
   `return_url` (TTL 24h) e o `return_url` só passa pela allowlist de
   `isAllowedReturnUrl`. O callback é público e devolve
   `?connection=ok|error&scope=ads&platform=meta`.
2. **Mesmo app, mesmos scopes, mesmo cofre.** Nada de app Meta nova: os scopes
   são os da ligação Meta do CRM (`ads_read`, `ads_management`,
   `business_management`, `pages_show_list`, `pages_read_engagement`,
   `public_profile`) e o token é cifrado pelo mesmo mecanismo
   (`crm.upsert_artist_meta_connection`, `pgp_sym_encrypt` com
   `ENCRYPTION_MASTER_KEY`). Isto não se confunde com a captação de dados dos
   artistas (`artist_channel_connections`, só leitura, D-ERP39).
3. **Uma conta = uma escolha explícita.** Se `/me/adaccounts` devolve mais que
   uma conta, a ligação nasce `pending_selection` e só fica `active` depois de
   `artist-ads-select-account`; com uma só conta nasce `active` já com
   `selected_ad_account_*`. `artist-ads-disconnect` marca `revoked` +
   `disconnected_at` e apaga o token.
4. **Google e TikTok entram sem OAuth.** A RPC
   `artist_ads_register_external(p_artist_id, p_platform, p_external_id, p_name)`
   grava a linha com `status = 'pending_link'` e sem token: Google com o Customer
   ID, TikTok com o Advertiser ID. O Google passa a `active` quando
   `crm-google-sync-campaigns` (que agora também lê `pending_link`) alcança a
   conta com o `login_customer_id` do MCC; o TikTok fica `pending_link` até a
   Marketing API ser aprovada. Primeiro caso: Litto Lins, Google `8841388615`,
   empresa Social Artists.
5. **Unicidade dupla.** Caiu a `UNIQUE (company_id, platform)`: agora há um
   índice único parcial para as ligações de empresa (`artist_id IS NULL`) e outro
   para as de artista (`company_id, artist_id, platform`). Quem fizer `ON
   CONFLICT` nesta tabela tem de indicar o predicado do índice.
6. **MP Audience lista as duas.** O ecrã de conexões mostra as ligações da
   empresa e as dos artistas geridos, estas com a etiqueta "Artista: <nome>". O
   comportamento das ligações `company` não muda.

## D25 adenda (g13, 13/09/2026) — cascata no documento do sócio

O documento de um sócio cujo acordo apura sobre parte do resultado do evento
mostra a conta **desde o evento inteiro**: receitas e despesas são sempre as do
perímetro da raiz (a mesma fonte do card do evento e do Encontro de Contas), e o
resultado desce em cascata deduzindo as partes dos sócios dos acordos ACIMA,
identificados pelo nome e pela percentagem (nominal quando o participante é
nominal, real quando acerta). Regra de visibilidade: **acima pelo nome; ao lado e
abaixo nunca**; os sócios do mesmo acordo continuam colapsados. Mantém-se a
proibição das palavras que descrevem a estrutura dos acordos.

## D25 adenda (g14, 13/09/2026) — IVA não recuperável fica fora da devolução

Semântica corrigida em 13/09/2026: a flag `event_forecasts.vat_non_recoverable`
marca IVA **realmente pago** e **legalmente não dedutível** em PT (viaturas,
refeições, entretenimento). Esse IVA sai da base dos sócios de cima (como
sempre), **não é devolvido a ninguém** e é **custo real**: abate ao resultado
s/IVA que serve de âncora à C1. NÃO fica no residual da casa como valor retido.
Na "Posição da Mundo Propício" é linha informativa de custo. Nunca aparece em
documento de sócio (lá só existe "IVA dedutível recuperado", já líquido).

**IVA negocial sem fatura NÃO se marca — é ativo da sociedade** e divide-se pela
regra normal de devolução do IVA (caso das linhas de open bar da Anitta, que
ficam sem marcação).

## D-ERP50/D-ERP58 adenda (13/09/2026) — chamadas internas entre edge functions

Causa real do 403 `{"error":"Forbidden"}` nas chamadas internas
(`artist-comparable-manage add` → `soundcharts-sync`, `artist-song-manage add` →
`song-soundcharts-sync`): a `SUPABASE_SERVICE_ROLE_KEY` do runtime **já não é um
JWT** — é uma secret key nova (`sb_secret_…`, 41 chars, 1 segmento). As funções
`authorize()` só aceitavam service_role lendo o claim `role` de um JWT, logo
caíam em `auth.getUser()` → "invalid token" → 403. O gateway nunca foi o
problema (os crons via `net.http_post` continuam a funcionar porque usam o JWT
legacy do Vault).

Correcções:
- `_shared/soundcharts.ts` → `authorize()` compara o Bearer com a service key do
  runtime (comparação de tempo constante) **antes** de tentar ler o JWT; mantém
  o caminho JWT service_role e o caminho utilizador.
- `soundcharts-sync` e `suamusica-sync` tinham `authorize()` local duplicada;
  passam a delegar na partilhada (papéis admin/platform_admin).
- Novo `_shared/internal-call.ts` → `invokeInternal(fn, body, {timeoutMs})`:
  `Authorization` + `apikey` com a service key do runtime, timeout, corpo do erro
  preservado. Usado em `artist-comparable-manage`, `artist-song-manage` e
  `soundcharts-reference-songs`.
- Regra: uma função **nunca** reencaminha o `Authorization` do caller para
  chamadas internas (o `soundcharts-reference-songs` fazia-o e podia passar um
  JWT de utilizador ao `song-soundcharts-sync`).

Teste real (13/09/2026, service role, Litto Lins): `remove` + `add` de Nuzio
Medeiros (reutilizou o artista de referência existente, `created_reference_artist:false`),
`history_sync.ok = true`, 1.317 linhas escritas, **20 chamadas Soundcharts**.
Posições repostas: 1 Léo Foguete, 2 Jonas Esticado, 3 Eric Land, 4 Henry Freitas,
5 Nuzio Medeiros.

## D25 adenda g13-b — a linha do IVA nunca se esconde num documento em cascata (13/09/2026)

O PDF da EIN (Anitta) mostrava a cascata a fechar em "Parte da sociedade 20%
119.226,69 + exclusivas + operações = 547.906,69" e a seguir o aviso "a conta não
fecha (diferença 262.459,85 €)": a regra da g10 (apresentação s/IVA em nós que
devolvem o IVA dedutível) escondia a linha "+ IVA dedutível recuperado", que a
cascata precisa porque parte da base da RAIZ (despesas c/IVA).

Regra definitiva:
- Documento **em cascata**: base = base da raiz (c/IVA na Anitta); secção 3
  "As despesas do evento (despesas c/IVA)" com Valor s/IVA, IVA e Total c/IVA;
  secção 4 "O resultado" (sem "s/IVA"), a começar em "Resultado do evento
  (despesas c/IVA)"; deduz os sócios acima pelo nome; chega à parte da
  sociedade; e soma explicitamente "+ IVA dedutível recuperado" (só o
  recuperável, g14), exclusivas, operações de terceiros e devoluções.
- A g10 continua válida para o **rótulo de base efectiva** do participante no
  ecrã e para documentos **sem cascata** (fechamento raiz).
- O aviso vermelho mantém-se como mecanismo: desaparece por a conta fechar,
  nunca por ser removido.

Implementação: `partner-statement-doc.ts` (`hasCascade` desliga a regra g10 na
base, no filtro do extra do IVA e nos rótulos) e `export-partner-statement-doc.ts`
(títulos das secções 3 e 4 e linha de partida). Teste: EIN fecha ao cêntimo
(596.133,45 − 417.293,42 − 59.613,35 = 119.226,69; + 262.459,85 + 72.250,52 +
93.969,63 = 547.906,69), Rafael Lobo 178.840,04, Anitta inalterada. Sem DDL/DML.

## D25 adenda (g10/g11/g12, 13/09/2026) — base efectiva, receitas em poder e detalhe

Registo retroactivo das três alterações publicadas hoje que não tinham adenda
própria:

- **(g10) Base EFECTIVA de despesa é só rótulo.** Um fechamento com
  `returns_parent_deductible_vat = true` apura de facto sobre despesas s/IVA, por
  isso ele e os seus participantes apresentam-se "Despesas s/IVA" /
  "Resultado s/IVA" e a linha do IVA dedutível não aparece. Fonte única:
  `src/lib/settlement-basis.ts`. **O cálculo não muda.** Excepção definitiva:
  documentos em cascata (ver adenda g13-b).
- **(g11) Receitas em poder do sócio carregavam 0** por o `select` pedir
  `account_type` numa tabela cuja coluna é `type`. Regra: qualquer leitura de
  contas financeiras usa `type`; nenhuma soma de sócio pode ficar a 0 sem erro
  visível.
- **(g12) Detalhe do desembolso é apresentação, nunca outra aritmética.**
  `PartnerDisbursementDetail` mostra os MESMOS dados do export de conferência
  (linhas do BP por rubrica de Nível 2, transacções pagas pelo sócio, ajustes com
  sinal, receitas em poder, extras) e a conta por extenso. Quando o detalhe não
  bate com o resumo imprime aviso vermelho com a diferença — nunca ajusta valores
  para fechar.

## Regra de trabalho — "apresenta DDL" nunca é aplicar a migração (13/09/2026)

Quando o pedido diz "apresenta DDL e pára", o entregável é o **ficheiro de
migração pendente** em `supabase/migrations/`, mais a explicação. Não se usa a
ferramenta de migração nem se corre DDL/DML em Test ou Live sem autorização
explícita nesse pedido. O Publish é sempre decisão do Pedro.

## D-ERP59 — Benchmark alinhado por idade e avaliação relativa no relatório LLM (13/09/2026)

**Contexto.** O relatório de lançamento (D-ERP54) classificava métricas em
absoluto: o UGC TikTok da "Roupa de Solteira" (Litto Lins) aparecia como fraco
com 3.700 publicações, quando à mesma idade — 11 dias, 336/dia — é o melhor
ritmo do grupo (Henry Freitas 18.300 em 108 dias = 169/dia, Jonas 458/107d,
Eric Land 208/86d, Léo Foguete 204/31d, Nuzio 35/30d).

**Decisão.** Comparar sempre à MESMA IDADE. A vista
`public.v_song_benchmark_aligned` (security_invoker, RLS filtra por empresa)
cruza cada música do elenco (`is_launch`) com as músicas de referência
(`is_reference`, D-ERP58) dos artistas em `artist_comparables` e devolve, para
N = dias desde o lançamento da música do elenco: `spotify_streams_dia_n`
(último ponto com `metric_date <= release_date + N - 1`, `source <> 'manual'`),
`spotify_streams_por_dia_n`, `spotify_streams_hoje`, `tiktok_ugc_latest` com
data e fonte, `tiktok_ugc_por_dia` e `instagram_reels_latest`. A própria música
entra como linha com `is_self = true`. A função
`song_benchmark_aligned(p_song_id uuid)` (SQL, STABLE, SECURITY INVOKER,
EXECUTE só a `authenticated` e `service_role`) acrescenta posição e total por
métrica, contando apenas linhas com dados.

**Regras no prompt do `artist-song-report`.** (a) É proibido qualificar uma
métrica em absoluto — só relativamente aos comparáveis à mesma idade e ao ritmo
por dia, citando o número de referência e a posição ("4.º de 11 em streams ao
dia 11"); (b) o mecanismo de um comparável com UGC acima do som oficial só se
refere se estiver escrito em `artist_songs.notes` dessa música — o caso do Henry
Freitas ("som original" com 18.300 vs som oficial ~580) ficou gravado ali, nunca
no prompt; (c) sugestões derivam do que os comparáveis melhores fizeram, com os
números deles; (d) sem comparável com dados, a resposta é "sem referência" e não
se avalia. A saída estruturada ganhou `benchmark` (array artista/música/idade/
valor/posição) e `avaliacao_relativa` por métrica (spotify, tiktok_ugc,
videos_artista, playlists) com posição, total e frase curta.

**Prova.** Relatório da "Roupa de Solteira" regenerado: spotify 4.º de 11,
tiktok_ugc 1.º de 6, videos_artista e playlists "sem referência".

**Adenda 2026-09-19 (`tiktok_ugc_por_dia` pela idade NA DATA DO DADO).**
Defeito confirmado em Live: `v_song_benchmark_aligned` calculava
`tiktok_ugc_por_dia = tiktok_ugc_latest / (CURRENT_DATE - release_date)`, ou seja pela
idade de HOJE. Como o UGC é registo manual, o ritmo caía sozinho em cada dia sem
registo novo — Litto Lins com 7.320 (registo de 18/09) dava 430,59 em vez de 457,50, e
comparáveis com registo de 13/09 apareciam subestimados entre 5 % e 17 %.
**Regra nova:** `tiktok_ugc_por_dia = tiktok_ugc_latest / GREATEST(tiktok_ugc_date -
release_date, 1)`, `NULL` sem dado. Nunca pela idade de hoje. A vista foi substituída
por `CREATE OR REPLACE VIEW` (mesmas colunas, nomes e ordem, grants intactos);
`song_benchmark_aligned(uuid)` já lê a coluna da vista, pelo que o rank
`rank_tiktok_ugc_por_dia` fica coerente sem alteração.
**Prova (19/09, música `74c40d7b-357b-4311-acbe-eb9bfa7ba7c7`):** `tiktok_ugc_latest`
7.320, `tiktok_ugc_date` 18/09, `release_date` 02/09, idade na data 16 dias,
`tiktok_ugc_por_dia` 457,50 = 7.320 ÷ 16. Ranking por dia: Litto 457,50 · Henry Freitas
169,44 · Léo Foguete 6,58 · Jonas Esticado 4,28 · Eric Land 2,42 · Nuzio Medeiros 1,17.

### D25 — adenda g16 (2026-09-13): a ligação utilizador ↔ sócio é de UI

A ligação entre um utilizador do Portal e o sócio (`profiles.linked_supplier_id`)
deixa de se fazer por SQL: faz-se no seletor "Sócio" do cartão de acesso de
parceiro, e a ficha do fornecedor lista os utilizadores ligados. Sem esta ligação
o Portal não devolve fechamento nenhum (é ela que ancora `user_supplier_id`).
Pendente: policy UPDATE em `profiles` para admin/manager da empresa (migração
escrita, não aplicada).

### D25 — adenda g17 (2026-09-13): um só gerador da prestação de contas

O Portal do Sócio deixou de calcular o fecho no browser (calculava com o que a
RLS lhe deixava ver e dava números que não eram os do fecho). O cálculo passou a
viver no pacote partilhado `supabase/functions/_shared/settlement/`, usado pelo
ERP e pela edge function `partner-statement` (service_role, `verify_jwt = true`),
que valida o utilizador, resolve o sócio por `user_supplier_id`, exige acesso ao
evento e participação `mode = 'settles'`, e devolve o input do documento, o bloco
"O seu fechamento" e os números do fecho para os cards. Nada de sócio ou de
fechamento vem do cliente. Acesso registado em `system_audit_log`.

### D25 — adenda g17-d (2026-09-13): regra única de arredondamento ao cêntimo

`roundCents` (pacote partilhado `_shared/settlement/iva.ts`) passa a normalizar o
ruído binário antes de arredondar (`toPrecision(15)` + notação exponencial,
half-away-from-zero, simétrico). Motivo: a parte da ANITTA aparecia no Portal e
no Encontro de Contas da raiz como 417.293,41 quando o motor e o relatório
interno davam 417.293,42 (596.133,45 × 70% = 417293.4149999999 em binário).
Corrigido na origem, não na apresentação. `Math.round(x*100)/100`, `toFixed` e
truncatura ficam proibidos em valores do fecho. Números de referência
mantidos: RAFAEL LOBO 35.768,01 · EIN 273.953,35 · base a transferir 230.990,35.

## D-ERP60 — Numa linha de fatura, só o que é do documento se propaga às irmãs (14/09/2026)

**Contexto.** Editar uma linha de uma nota de reembolso alterava todas as linhas do
grupo-fatura. A edge function `update-transaction` propagava onze campos às irmãs.

**Decisão.** Os campos de uma linha têm três naturezas — **documento** (fornecedor, data,
vencimento), **linha** (valor, IVA, descrição, `specification`, rubrica, evento,
`is_transitory`, `exclude_from_result`, `invoice_ref`) e **pagamento** (conta, método,
entidade, referência). Só os do DOCUMENTO se propagam. Os do pagamento têm máquina própria
e nunca entram na propagação.

**Consequência.** `invoiceSharedFields = ["supplier_id","date","due_date"]`. Acrescentar um
campo a esta lista é uma decisão, não uma conveniência: exige justificar que o campo
pertence ao documento e não à linha.

## D-ERP61 — Agrupar faturas é um ato explícito, nunca um efeito de gravar (14/09/2026)

**Contexto.** A gravação de uma transação chamava o agrupamento automático e criava grupos
que ninguém pediu, contornando a trava de documento partilhado da D-ERP17.

**Decisão.** O agrupamento só acontece por clique do utilizador. A gravação nunca escreve
`invoice_group_id`. A revalidação depois de anexar um documento pode REAGIR (propor
desagrupar), nunca PREVENIR nem agrupar.

**Consequência.** A comparação de `invoice_ref` é igualdade exata e não se torna mais
tolerante — o caso das portagens (lançamentos distintos com valores e números quase iguais)
é o que a fixa.

## D-ERP62 — O verificador de invariantes alerta por desvio da referência, não por número diferente de zero (14/09/2026)

**Contexto.** Verificações espalhadas e uma função `check_system_invariants()` que já
existia. Dívida herdada com contagem conhecida (1.026 transações pagas sem linha de
pagamento, 35 pares de FK duplicada) faria barulho todos os dias e ensinaria a ignorar o
alerta.

**Decisão.** Cada invariante tem uma REFERÊNCIA aceite explicitamente por
`accept_invariant_reference(name, value, note)`, com autor e hora. O alerta dispara quando a
contagem se AFASTA da referência. Zero é a referência da maioria, não a regra.

**Consequência.** Aceitar uma referência acima de zero é assumir dívida por escrito, com
nota. Uma verificação candidata que produza falsos positivos é eliminada antes de entrar,
nunca aceite com referência alta para calar.

## D-ERP56 — Fix C: RLS auth.uid() → (SELECT auth.uid()) (2026-09-14)

`auth.uid()` dentro de políticas RLS é VOLATILE — o Postgres reavalia a função por cada linha verificada, causando 177M+ seq_scans em `user_roles` (53 linhas) por sessão. `(SELECT auth.uid())` é uma stable subquery: o Postgres avalia uma vez (InitPlan) e reutiliza. Conversão aplicada em 567 políticas do schema `public` via migration rastreada `20260914223900_rls_wrap_auth_uid_in_select.sql`. O Postgres normaliza o resultado para `( SELECT auth.uid() AS uid)` — queries de verificação devem usar `LIKE '%( SELECT auth.uid()%'`.

## D-ERP63 — N representantes por sócio (2026-09-14)

Um sócio é uma empresa com N pessoas de gestão: a relação utilizador ↔ sócio é **N→1**.
Ligar uma pessoa nunca desliga outra. Desligar age sobre o **utilizador**, não sobre o sócio.
A escrita é exclusivamente pelas RPC `set_partner_portal_user` / `unset_partner_portal_user`,
com auditoria em `system_audit_log` (`entity_type='partner_portal_link'`). Fundamento: a UI
fazia `UPDATE profiles` directo e a única política de UPDATE é `id = auth.uid()` — apanhava
0 linhas, sem erro, e mostrava sucesso.

## D-ERP64 — O Portal nunca calcula o fecho (2026-09-14)

Os cartões e o bloco do sócio vêm do `partner-statement`. Quando o servidor não responde, o
Portal **diz o motivo e não mostra números** — nunca calcula uma alternativa. Estados:
`ok`, `unavailable` (403, motivo legítimo), `error` (falha técnica, registada com
`console.error` prefixado `[partner-statement]`).

## D-ERP65 — Acesso a um evento exige participação do sócio (2026-09-14)

`partner_event_access` sozinho não basta: o sócio que a conta representa tem de estar em
`event_partners` do evento (ou do pai). Imposto nas RPC do portal, reflectido na lista e na
página do evento. Fundamento: a política de RLS `event_partners_select_partner` já continha
esta regra; faltava a interface obedecer-lhe.

## D-ERP66 — Base de apuramento do portal = configuração do sócio (2026-09-14)

A base do Portal segue `partnerUsesGrossExpenses` (D-ERP9): a regra própria do sócio manda e,
na ausência dela, vale o contrato do evento. **Nunca modo fixo** — o portal estava em modo
Brasil fixo em seis sítios.

## D-ERP67 — Streams por playlist vêm do Spotify for Artists por recolha assistida (2026-09-14)

O S4A não tem API. A tabela "Playlists" de cada música do elenco (top 100 por streams a 28 dias)
é recolhida à mão na sessão do artista e gravada em `artist_song_playlist_streams`
(`UNIQUE (song_id, snapshot_date, period_days, playlist_name)`, `source = 's4a_manual'`),
sempre pela RPC `artist_song_playlist_streams_set` (SECURITY DEFINER, papel
admin/platform_admin/manager/marketing_manager, empresa da música, auditoria).
Os totais da música ficam como métricas manuais `s4a_*` em `artist_song_metrics_daily`.
A vista `v_song_playlist_streams_latest` dá a última snapshot com totais (Spotify vs utilizador,
top 10) e, quando o nome coincide, junta os dados públicos da Soundcharts por
`lower(trim(playlist_name))` — não é chave, aceita-se sem match.

**Regra de leitura:** o S4A é a fonte oficial de streams; a Soundcharts é a contagem pública
desfasada. Quando ambas existirem, avalia-se pelo S4A e menciona-se a diferença. Só o elenco
tem S4A — as músicas de referência não — logo é proibido comparar S4A com Soundcharts.

Nota de numeração: o número D-ERP60 estava já usado (faturas), pelo que esta decisão ficou D-ERP67.

## D-ERP68 — Tráfego por artista lê-se por RPC pública sobre o schema crm (15/09/2026)

O schema `crm` não é exposto à API. O painel da Gestão Artística lê os dados de tráfego
das contas do artista (D-ERP57, `connection_scope = 'artist'`) por quatro funções em
`public`, todas SECURITY DEFINER com guarda de empresa
(`artist_ads_assert_access`: artista da empresa do utilizador, `platform_admin`, ou
chamada de servidor sem sessão; o `anon` não tem GRANT):

- `artist_ads_campaigns(artist_id, include_removed default false)` — campanhas Google e
  Meta com conta, moeda, estado, orçamento diário, gasto 7d/30d, impressões, cliques,
  visualizações, resultados, CPC e CPV a 30 dias, `linked_song_id` e `linked_event_id`.
  Campanhas REMOVED/DELETED/ARCHIVED ficam de fora por defeito.
- `artist_ads_daily(artist_id, days default 90)` — série diária a partir de
  `*_insights_daily`.
- `artist_ads_alerts(artist_id)` — `conta_sem_entrega`, `token_a_expirar`,
  `ligacao_com_erro`, `pagamento_pendente` (Meta `account_status` 2 ou 3; no Google não
  há campo de faturação na resposta, logo omite-se).
- `artist_ads_link_song(platform, campaign_id, song_id)` — papéis admin, platform_admin,
  manager, marketing_manager.

Ligação campanha↔música: `crm.google_campaign.linked_song_id` e
`crm.meta_campaign_snapshot.linked_song_id` (FK `artist_songs`, ON DELETE SET NULL).
`artist_ads_autolink_songs(artist_id)` liga só onde está NULL, quando o nome da campanha
contém o título-base da música normalizado (sem acentos, ≥ 8 caracteres); empates
resolvem-se pelo título-base mais longo e depois pela música mais antiga.

Nunca se inventam valores: sem `*_insights_daily` o gasto e as métricas saem a zero.

---

## D-ERP69 — Custo partilhado com terceiros: a conta corrente do circuito é a única porta entre o circuito e o resultado (16/09/2026)

**Contexto:** A MP paga com frequência uma fatura em que só parte do custo é dela; o resto é de terceiros — outras cidades ou promotores de uma turnê, coprodutores — que depois devolvem a sua parte. Até aqui a despesa inteira lançava-se contra uma "conta de acerto" com `exclude_from_result` (D-ERP32, pontos 2 a 4). Essa convenção estava errada por duas razões medidas: a despesa e o recebimento empurravam o saldo da conta **no mesmo sentido**, pelo que o saldo não era posição nenhuma; e a despesa total do circuito aparecia como custo da MP quando só a quota da MP o é — obrigando a adiar o reconhecimento do custo até ao acerto final.

**Decisão — seis regras:**

1. **A fatura entra uma só vez, pelo total.** Grupo de fatura, lista de pagamento e ficheiro SEPA mantêm-se intactos. O rateio com terceiros nunca se resolve no fluxo de pagamento.
2. **Cada linha declara de quem é o custo.** A parte da MP é custo da MP: entra no resultado, consome verba do BP, na rubrica dela. A parte de terceiros não é custo: é **adiantamento por conta de terceiros**.
3. **A parte de terceiros gera automaticamente uma contrapartida na conta corrente do circuito.** Pagámos por eles, logo devem-nos: o saldo sobe.
4. **Quando o terceiro devolve**, o dinheiro entra no banco contra essa conta corrente e o saldo desce (par de transferência 10.3, como já se faz hoje).
5. **O saldo da conta corrente é a posição líquida com o circuito:** positivo, terceiros devem-nos; negativo, temos dinheiro deles por aplicar. No fim é zero.
6. **A quota da MP pode ser desconhecida no momento do pagamento.** Lança-se o que se sabe: quota conhecida → parte a custo e resto a adiantamento; quota estimada → lança-se a estimativa e ajusta-se no acerto; quota desconhecida → custo da MP é zero e o pagamento inteiro fica como adiantamento. Quando a verdade chega, faz-se um lançamento por rubrica **pago pela conta corrente do circuito**, agora dentro do resultado, que baixa o saldo e sobe o custo ao mesmo tempo.

**Regra que dá solidez ao conjunto:** a conta corrente do circuito é a **única** porta entre o circuito e o resultado.

**Como está montado:** `financial_accounts.is_circuit_account`; `transactions.shared_cost_account_id` (+ `shared_cost_counterparty_id` opcional); rubricas 10.12 "Rateio com Terceiros" / 10.12.01 "Adiantamento por Conta de Terceiros" (deliberadamente **fora** da família 10.1.*, onde `force_transitory_for_capital_branch` forçaria `is_transitory`); ponte 1:1 `shared_cost_mirror`; triggers `force_exclude_from_result_for_shared_cost()` e `sync_shared_cost_mirror()`. Detalhe técnico em `.lovable/memory/features/custo-partilhado-terceiros.md`.

**Substitui os pontos 2, 3 e 4 do D-ERP32.** A previsão em linha de BP (ponto 1) e o histórico previsto×realizado (ponto 5) do D-ERP32 continuam vigentes.

**Estado:** vigente. Base de dados feita a 16/09/2026; UI ainda por fazer.

## D-ERP70 — Agregação de empresa conta a MÃE do rateio; agregação de evento conta as FILHAS (16/09/2026)

**Contexto:** O rateio multi-evento cria uma transação-**mãe** (`event_id` NULL, tem `account_id`, é ela que move o saldo) e N transações-**filhas** (`event_id` preenchido, `account_id` NULL, `parent_transaction_id` a apontar para a mãe). A mãe é a fatura inteira; as filhas são a decomposição dela por evento. Medido em Live a 16/09/2026: 59 mães somam 199.971,29 € e 157 filhas somam 198.796,70 €.

**O defeito:** nenhum código do sistema filtrava `parent_transaction_id`. A protecção era sempre acidental — ou o relatório filtrava por `event_id` (e a mãe, sem evento, caía fora) ou filtrava por conta (e as filhas, sem conta, caíam fora). Onde não havia nem uma nem outra, mãe **e** filhas somavam as duas e a despesa aparecia ao dobro: ~200 mil euros, todos de 2026.

**Decisão — uma regra só:**

1. Agregação ao nível da **EMPRESA** conta a **mãe** e exclui as **filhas**.
2. Agregação ao nível do **EVENTO** conta as **filhas**; a mãe cai fora sozinha porque a query filtra por `event_id`. Nada a mudar nesses sítios.
3. Filha de rateio identifica-se **pela própria linha**: `parent_transaction_id IS NOT NULL` **E** `installment_group_id IS NULL`.
4. O predicado vive **uma vez**, em `src/lib/rateio-children.ts` (`isRateioChild` / `excludeRateioChildren`). Não se escreve à mão em componente nenhum — se viver em oito sítios, volta a divergir.

**Porque é que `installment_group_id` entra no predicado:** distingue filha de rateio de **parcela de pagamento**. Nas parcelas a "mãe" é a 1.ª prestação e não carrega o total (medido em Live, 11 grupos: mãe + parcelas = total da obrigação). Somam-se todas — excluir parcelas apagaria dinheiro verdadeiro.

**Detecção:** invariante `rateio_filhas_nao_somam_a_mae` (soma das filhas = valor da mãe, tolerância 0,05 €, severidade `error`, referência 0).

**Onde se aplica** (oito sítios corrigidos) e onde NÃO se aplica: ver `.lovable/memory/features/rateio-mae-filhas-agregacao.md`.

**Estado:** vigente.

---

## D-ERP71 — O documento pertence à fatura; a ingestão por API é a confirmação humana do agrupamento (16/09/2026)

**Contexto:** Faturas de fornecedores externas (Meta Ireland, hospedagens, etc.) chegam frequentemente como um PDF que cobre várias rubricas de BP — e portanto várias transações. Até 14/09/2026 a regra de agrupamento automático só juntava linhas que **já partilhassem o documento anexo**, o que quase nunca acontecia: o documento costumava estar anexado a uma única transação, e as irmãs nasciam sem ele. O resultado era N uploads do mesmo PDF ou, pior, grupos de fatura que não fechavam com o documento real. A alternativa de partilhar por `supplier_id` + `invoice_ref` sem confirmação humana já tinha dado problema (caso das portagens: vários lançamentos de ida e volta com valores iguais e números parecidos, mas despesas diferentes).

**Decisão:**

1. **O documento pertence ao grupo de fatura (`invoice_group_id`), não a uma transação individual.** Quando várias transações partilham a mesma fatura, o ficheiro anexa-se ao grupo e replica-se para todas as irmãs pelo mesmo `file_url`.
2. **Sem grupo formal, o agrupamento só acontece por ação explícita.** A edge function `ingest-transaction-document` (autenticada exclusivamente por `SUPABASE_SERVICE_ROLE_KEY`) aceita `supplier_id` + `invoice_ref` sem `invoice_group_id` e cria o grupo — a chamada é a confirmação humana de que aquelas linhas são a mesma fatura. Inclui proformas; a igualdade de `invoice_ref` continua **exata**.
3. **Um ficheiro no storage, N registos em `transaction_documents`.** O objecto é único no bucket `transaction-documents`; cada transação do grupo leva um registo com o mesmo `file_url`. Repetições da mesma chamada são idempotentes por nome + tamanho (`created 0, reused N`).
4. **A origem pode ser URL pública do Drive ou `conteudo_base64`.** Drive não é corredor: links privados devolvem página de login, e o upload de ficheiros passa pelo contexto do agente (MCP), não por um canal directo. A função valida magic bytes (PDF/JPEG/PNG) e recusa tamanho acima de 20 MB.
5. **O alvo é transação, grupo de fatura ou fornecedor+referência.** A função resolve o alvo e, em caso de falha após criar o objecto, limpa os órfãos.

**Alternativas rejeitadas:**

- Partilhar documento por `supplier_id` + `invoice_ref` sem confirmação humana — agruparia às escondidas e repetiria o incidente das portagens.
- Usar o Google Drive como corredor de ficheiros — links privados exigem partilha manual; o upload real passa pelo contexto do agente, não por um endpoint público do sistema.

**Consequência:** A allowlist de rede da organização passou a incluir o domínio `sfohvvlqccmmebvjgibx.supabase.co` para que o contentor das sessões interativas do Claude possa chamar edge functions directamente por HTTPS. Tarefas agendadas continuam a usar `net.http_post` até se confirmar que o contentor de execução agendada também alcança o mesmo domínio.

**Estado:** vigente.

---

## D-ERP72 — O rateio reparte por EVENTOS; um Master é um destino como outro qualquer (16/09/2026)

**Contexto:** Num evento de várias cidades há um **Master** e sub-eventos. A verba de um custo que serve a tour inteira vive numa **linha de BP do Master**, e a repartição pelas cidades é **virtual** — leitura de relatório, nunca linhas nem transações gravadas (D-ERP2, `master-split-rateio-source-of-truth`). Isso funciona e não se toca. O que estava errado era o formulário de transações: escolher um Master `multi_day` com filhos **ligava sozinho** o rateio multi-evento e **apagava** o evento escolhido, transformando a despesa numa mãe sem evento e N filhas nas cidades — o oposto do desenho.

**Decisão — três regras:**

1. **R1 — o rateio multi-evento reparte por EVENTOS, e cada perna leva a linha de BP do seu evento.** Um Master é um destino como outro qualquer: a perna que lhe toca leva a **linha de BP do Master**. Exemplo real: uma campanha publicitária que divulgou três eventos, um deles uma tour, reparte-se em **três pernas** — duas em linhas de BP de eventos simples e **uma na linha de BP do Master**. **Faseada** (fase 2): hoje o painel de rateio não tem onde escolher linha de BP por perna.
2. **R2 — escolher um Master nunca o rebenta nas suas cidades.** É uma escolha de evento normal: `event_id` fica com o Master, a tabela de previsões mostra as linhas do BP do Master, a exigência de linha de BP aplica-se como em qualquer evento `with_bp`, e o campo "parte de terceiros" do custo partilhado fica disponível. O rateio multi-evento continua a existir e a funcionar quando o utilizador o liga **de propósito** pelo painel; com ele ligado, um Master escolhido como destino é **uma perna só**, nunca as cidades. **IMPLEMENTADA a 16/09/2026** (`src/components/TransactionFormModal.tsx`, `onValueChange` do selector de evento).
3. **R3 — nenhuma perna de rateio entra sem linha de BP.** A isenção da trava passa a valer **só para parcelas de pagamento** (`installment_group_id IS NOT NULL`), o mesmo critério que distingue parcela de filha de rateio no D-ERP70. **POR FAZER** — depende da fase 2: aplicá-la antes trancava todos os rateios existentes.

**Fundamento:** o **BP é quem define os custos de um evento até ao fecho**. A transação pode não usar toda a verba da linha, mas **não excede sem ajuste** e **não existe sem linha** (D1 + D8).

**Caso que motivou (04/08/2026):** fatura de tráfego **113-XP de 6.888,00 €** da tour do Deive, lançada por Délia Braga pelo **rateio automático do Master** — nasceu uma **mãe sem evento** e **duas filhas de 3.444,00 €** em Braga e Lisboa, **nenhuma com linha de BP**. Paga a 10/08 pela conta espelho "Pgto Mágicos Acerto Madrid", o que gerou o aporte automático de 6.888,00 € em Madrid (correcto — é o desenho da conta espelho). A linha **3.2.01 do Master** continua a marcar **6.880,00 € de verba livre em quatro dos cinco ecrãs**; só o "Previsão vs Real" do Master vê os 6.888 e mostra **8,00 € de excedido**.

**Medido em Live a 16/09/2026:** 159 filhas de rateio — **85 com linha de BP** e **74 sem linha mas com evento (126.232,99 €)**; **53 rateios** com pernas em cidades de Masters.

**Guarda que já existia, e a pergunta que fica em aberto:** ao ratear pela rubrica **3.2.01** entre sub-eventos do Master, o formulário **recusa hoje** com _"Categoria bloqueada para rateio — esta categoria já existe no BP do Deive Leonardo. A transação deve ser criada directamente no evento master, que fará o rateio automático para os sub-eventos."_ Ou seja: **já existe uma guarda contra exactamente o erro de 04/08**. **Pergunta aberta, não investigada:** por que razão não travou na altura — ou a guarda é **posterior** a 04/08, ou tem uma **condição que aquele lançamento não cumpria** (por exemplo, o caminho do rateio automático do Master não passar pela mesma validação do rateio ligado à mão). Quem voltar a este tema começa por aqui.

**Efeito colateral bom:** o diálogo _"Este valor será rateado igualmente por N datas nos relatórios DRE e BP"_ passou a **descrever literalmente o que acontece**. Antes descrevia proração **virtual** em relatório enquanto o código criava **filhas físicas** — exactamente o tipo de desalinhamento entre texto e comportamento que gera confusão meses depois. O diálogo mantém-se no mesmo sítio (gate `isParentMultiDay`, agora sobre o `event_id` do próprio Master) e o texto não precisou de mudar.

**Consequência imediata:** cai o limite conhecido nº 1 do desdobramento de custo partilhado (D-ERP69) — no Master já se desdobra uma fatura em perna MP + perna de terceiros. Verificado em Live a 16/09: 100,00 € base a 23 % com 40 % de terceiros → **60,00 + 40,00** no mesmo `invoice_group_id`, ambas com `event_id` do Master, a da MP com o `forecast_id` da linha 3.2.01 e a de terceiros com `shared_cost_account_id` + `exclude_from_result = true`. O rateio ligado à mão continua a nascer como antes (mãe sem evento + filhas por evento).

**Estado:** R2 vigente; R1 e R3 faseadas.

---

## D-ERP73 — Cada perna de rateio leva a linha de BP do seu evento; a G1 passa a aviso (16/09/2026)

**Contexto:** A R1 do D-ERP72 exige que cada perna de um rateio multi-evento leve a **linha de BP do seu próprio evento**. Até 16/09/2026 o painel de rateio só escolhia eventos e percentagens: a linha de BP era **uma só** para a transação inteira e descia à filha apenas quando por acaso pertencia ao evento dela. Por essa fenda entraram **74 pernas sem linha de BP (126.232,99 €)**, 16 delas desde 01/08/2026 — a dívida estava a crescer.

**Decisão:**

1. **A linha de BP escolhe-se por perna.** Cada linha do painel de rateio tem um selector "Linha do BP" com as linhas **daquele evento** na rubrica escolhida, mostrando verba e disponível de cada uma. Sem candidata, fica em branco com o aviso _"sem linha nesta rubrica — resolve-se na aprovação"_.
2. **A perna sem linha nasce `pending`; a linha cria-se na aprovação, não no lançamento (D1).** O painel de rateio **não** cria linhas de BP; quem aprova resolve no diálogo "Criar, vincular e aprovar" que já existe. Pode-se lançar sem linha; não se pode aprovar sem linha.
3. **A mãe do rateio nunca leva linha de BP.** É agregado: não consome verba. A verba é consumida pelas filhas, cada uma na sua linha. Antes a mãe levava a linha selecionada, o que fazia a mesma verba parecer consumida duas vezes.
4. **A medição de verba passa a ser por LINHA quando a perna tem linha escolhida** — o mesmo critério da trava numa transação simples. Sem linha escolhida, mantém-se a medição por rubrica (L3).
5. **A guarda G1 deixa de bloquear e passa a aviso.** Dizia _"Categoria bloqueada para rateio — já existe no BP do Master"_. Está errada como bloqueio: confunde **"a rubrica existe no BP do Master"** com **"esta despesa é do Master"**, que são coisas diferentes. **Prova em Live, no próprio Deive:** a rubrica **2.2.02 Hospedagem** tem **cinco linhas em três eventos** — Master "Rateio dayoffs" 2.000,00; Braga "Hotel - Artista e Equipe (alojamento)" 1.040,09 e "Hotel - taxa municipal turística" 24,00; Lisboa "Hospedagem - Deive Leonardo e Equipe (alojamento)" 406,89 e "Hospedagem - taxa turística" 60,00. Todas em uso e todas certas: o que é do circuito vive no Master, o que cada cidade dormiu vive na cidade. A 2.2.03 repete o padrão. Agora o formulário **informa** que existe linha no Master na mesma rubrica e **deixa seguir**.
6. **Cai a isenção `splitAutoConfigured`.** Era ela que deixava passar por cima da G1 — e é a resposta à pergunta que o D-ERP72 deixou aberta: a guarda existe desde **11/04/2026**, mas o **rateio automático do Master** marcava a configuração como automática e ficava isento. Foi por aí que entrou a fatura **113-XP** a 04/08/2026. A pergunta está **fechada**.
7. **O diálogo de desambiguação a partir de um sub-evento mantém-se, mas muda de resposta.** A pergunta é útil ("esta rubrica só existe no BP do Master — isto é um custo da tour?"); o que estava errado era rebentar em rateio pelas cidades. Passa a oferecer **"Custo da tour — lançar no Master"**: transação única no Master, na linha do Master, com a repartição pelas cidades **virtual** no relatório. A opção "Exclusivo deste evento" mantém-se.

**O que NÃO entra nesta decisão:** a **R3** (fechar a isenção da trava para as filhas de rateio) continua por fazer — a trava ainda isenta por `parent_transaction_id`. Só depois de as **74 pernas antigas** estarem tratadas, senão rebenta dados existentes. As 74 pernas são trabalho de dados à parte; medido: vêm **todas do painel/diálogo de rateio**, nenhuma do `ads-invoice-apply` (que já escolhe linha por evento).

**Verificado em Live a 16/09/2026** (tudo apagado no fim, pelos ids anotados; pernas sem linha de volta a 74 exactamente):

- **Rateio por dois eventos simples**, rubrica 2.2.03, 100,00 € — mãe sem `event_id` e **sem `forecast_id`**; filhas de 50,00 cada uma com o `forecast_id` da **sua** linha (Ivete "Verba - Extras" BP 1.000; Plenitude "Transfers Equipe Plenitude" BP 500), ambas `approved`.
- **Rateio com o Master como destino** (Master "Deive Leonardo" + Ivete), rubrica 3.2.01 — perna do Master com `event_id` do Master e `forecast_id` da linha "Trafego Pago"; **nenhuma filha em Braga ou Lisboa**.
- **Rateio na 2.2.02 por Master + Braga + Lisboa** — G1 **não bloqueia** (só avisa) e cada selector ofereceu as linhas do seu evento: Master → "Rateio dayoffs"; Braga → as duas de Braga; Lisboa → as duas de Lisboa. As pernas de Braga e Lisboa nasceram `pending` porque essas linhas estão esgotadas (disponível 0,00) — coerente com a medição por linha.
- **Diálogo a partir de Braga** — oferece "Custo da tour — lançar no Master (Deive Leonardo)" e, ao aceitar, o evento passa a ser o Master **sem rateio activo**.

**Ficheiros:** `src/components/TransactionSplitConfig.tsx` (campo `forecast_id` em `SplitEntry`, selector por perna, verba/disponível por linha), `src/components/TransactionFormModal.tsx` (query das linhas por evento, `splitBPInfoByEvent.lines`, `splitEntryBudget`, `forecast_id` da filha vindo da perna, mãe sem `forecast_id`, `splitCategoryMasterNotice`, `confirmMasterFromDisambiguation`).

**Estado:** vigente. R3 por fazer.

## D-ERP74 — Taxas de transferência identificadas pela referência são custo do evento da transferência-mãe (16/09/2026)

**Contexto:** Uma transferência internacional emitida no Santander chega ao extrato em várias linhas: a `TRF.CRÉD.N.SEPA+EMITIDA <ref>` (o pagamento, que concilia com a transação do sistema) e depois `TRF.CRÉD.N.SEPA+(DESP.SHA) <ref>`, `DESPESAS SWIFT <ref>`, `IMP.S/VALOR ACRESCENTADO <ref>` e `IMP.DE SELO <ref>`. Estas últimas ficavam `unmatched` sem qualquer pista de a que pagamento pertenciam, e quem lançava tinha de descobrir o evento à mão. Caso real de 15/09/2026: ref. `001803486960041656` (mãe: Comissão Durex 750,00 €, Anitta EDA 2026, com linha de BP) e `001803486960041657` (mãe: Per diems Equipa EDA 1.806,25 €, Anitta EDA 2026, **sem** linha de BP).

**Decisão:**

1. **A referência é o elo.** As linhas de taxa agrupam-se pela referência numérica no fim da descrição e ligam-se à linha-mãe `TRF.CRÉD.N.SEPA+EMITIDA <ref>` já conciliada na **mesma conta**.
2. **A taxa é custo do evento da mãe.** `event_id` e `forecast_id` **herdam-se da transação-mãe** — a taxa existe porque aquele pagamento existiu. Rubrica **10.6.01**, `is_transitory` false.
3. **Lotes SEPA e comissões de gestão continuam sem evento (D-ERP30).** Não há mãe única: um lote paga N faturas de N eventos e a comissão de gestão é da conta, não de um evento.
4. **Duas pernas, por causa do IVA.** SWIFT + IVA numa transação (`amount` = valor do SWIFT, `iva_rate` 23, `paid_amount` = soma); DESP.SHA + imposto de selo noutra (`amount` = soma, `iva_rate` 0). Não se mistura base tributável com o que não a tem.
5. **Linha de BP na mesma regra do resto (D1+D8).** Mãe com evento `with_bp` e sem `forecast_id` → o modal exige a escolha antes de gravar.
6. **Nada de regra em `bank_line_rules`.** O padrão do texto é sempre o mesmo mas o evento muda a cada transferência: uma regra reutilizaria o evento errado.
7. **Nada órfão (#154).** Cada perna é inserida e ligada às suas linhas em sequência compensada: se a ligação falhar, a transação é apagada; se a segunda perna falhar, a primeira é revertida.
8. **A regra continua a propor, a pessoa confirma (D-ERP29).** O botão "Lançar taxas (N linhas)" abre o formulário preenchido; nada é criado sem clique. Em paralelo, a lista de linhas por explicar passa a mostrar `Regra: <nome> → <ação legível>` quando uma regra ativa casa — informação, não automatismo.

**Ficheiros:** `src/lib/bank-statement/transfer-fees.ts` (novo: `classifyFeeLine`, `extractMotherRef`, `buildFeeGroups`, `buildFeeLegs`), `src/lib/bank-statement/rules.ts` (`describeRuleAction`), `src/components/bank/BankLineLaunchModal.tsx` (`feePlan`, `insertAndLinkLines`, `revertLeg`, `confirmFees`), `src/pages/BankReconciliation.tsx` (proposta da regra por linha, grupos de taxa, botão "Lançar taxas").

**Estado:** vigente. Não corrido em Live — sem dados criados.

## D-ERP75 — `system_audit_log` é a única tabela sem obrigação de `company_id` (16/09/2026)

**Contexto:** O trigger `set_company_id_on_insert` (`trg_set_company_id`, presente em 88 tabelas) resolve `company_id` a partir de `auth.uid()`. Sob `service_role` o `auth.uid()` é NULL, pelo que o trigger aborta o insert. A `check-login-rate` grava eventos de segurança (`entity_type='security'`: tentativas de login, alertas por IP) e corre sob `service_role`, num momento em que **não existe contexto de empresa** — o email pode nem pertencer a nenhum utilizador. Resultado medido a 16/09/2026: **0 linhas de segurança em 7.864** na `system_audit_log`. Inventário: `docs/estado/inventario-86-service-role-inserts.md` (#86).

**Decisão (opção B):**

1. `public.system_audit_log.company_id` passa a **nullable**. O `DEFAULT current_company_id()` mantém-se — utilizadores autenticados continuam a preencher a coluna normalmente.
2. `trg_set_company_id` é **removido desta tabela**. É a única das 88 sem o trigger, **por desenho**.
3. Linhas com `company_id IS NULL` só são visíveis a **platform_admin**: a política de leitura passa a `(admin OR manager) AND (company_id IS NOT NULL OR is_platform_admin())`.
4. Exceção **restrita a esta tabela**. As outras 87 tabelas com `trg_set_company_id` não mudam.

**Alternativa rejeitada (opção A):** resolver o `company_id` pelo perfil do email alvo. Perdia exatamente os casos que interessam — tentativas com emails desconhecidos ou de utilizadores de várias empresas, que é onde vive o ataque.

**Consequência:** a regra "insert sob `service_role` leva `company_id` explícito no payload" continua válida para todas as tabelas, com esta **única exceção documentada**. `supabase/functions/check-login-rate/index.ts` não precisa de alteração.

**Migração:** `20260916_system_audit_log_company_id_nullable.sql`, aplicada e verificada em Live (`is_nullable=YES`, 0 triggers `trg_set_company_id`, política nova ativa).

**Estado:** vigente.

## D-ERP76 — Há dois modelos de rateio, e o critério que os separa (16/09/2026)

**Contexto:** existiam dois padrões a coexistir sem nome, o que gerou correcções contraditórias — o que era certo num modelo parecia erro no outro.

**Decisão — os dois modelos têm nome e critério:**

- **Modelo A — rateio multi-evento.** Mãe **SEM evento**, **filhas reais** uma por evento, cada filha com a **linha de BP do SEU evento**. Usa-se quando a despesa é repartida por **eventos diferentes**, ou por sub-eventos do mesmo Master em partes **DESIGUAIS**.
- **Modelo B — Master/sub-evento.** Mãe **NO evento Master**, com a **linha de BP do Master**, **SEM filhas reais**; os sub-eventos vêem a despesa por **proração virtual ÷N**. Usa-se quando o rateio é entre **sub-eventos do mesmo Master** e em partes **IGUAIS**.

**Conversão A → B é lossless quando a repartição já é ÷N:** apagam-se as filhas e move-se a mãe para o Master. Verificado a 16/09: a soma Master + cidades manteve-se ao cêntimo (SM 94.370,54 → 94.370,53 — o cêntimo de diferença era um erro real: duas filhas de 583,50 contra uma mãe de 1.166,99; Deive 11.403,64 inalterado) e o custo visto por cada cidade após a proração ficou idêntico.

**Consequência:** a trava isenta as filhas do modelo A por `parent_transaction_id IS NOT NULL`. É essa isenção que deixou entrar pernas sem linha de BP.

**Estado:** vigente.

## D-ERP77 — Parcelas herdam a linha de BP da primeira prestação (16/09/2026)

**Contexto:** numa fatura parcelada só a 1.ª prestação leva `forecast_id`; as seguintes penduram-se nela por `parent_transaction_id` e a trava isenta-as. O resultado do evento está certo (todas têm `event_id`), mas a **linha de BP fica truncada** e mostra folga que não existe.

**Decisão:** toda a parcela **herda o `forecast_id` da mãe**.

**Medição (Ivete):** 8 parcelas, **61.428,59 €**; ao vincular, **sete linhas fecharam com folga 0,00** — o previsto tinha sido orçamentado pelo total da fatura. Duas excepções: **Palácio do Estoril** precisou de elevação de **188,00 €** (7.260,00 → 7.448,00) e **Hotel Londres** ficou com folga de **1.040,40**, que era exactamente uma despesa solta da **PATRIHOTEL** — ao vincular, a linha fechou a zero.

**Estado:** vigente.

## D-ERP78 — Faturas avulsas preservam a moeda de origem sem criar movimento financeiro (17/09/2026)

**Contexto:** as faturas avulsas são documentos contabilísticos pagos com recursos próprios e podem chegar por scanner ou API, incluindo moedas estrangeiras.

**Decisão:** `total_amount` e `iva_amount` guardam sempre o contravalor em EUR; `currency`, `original_amount`, `fx_rate` e `fx_rate_source` preservam a origem. A API é idempotente por empresa+NIF+número e segue a mesma regra absoluta do ecrã: nunca toca em `transactions`, `event_forecasts`, `payment_lists`, `financial_accounts` nem reembolsos. `paid_by_partner_id` identifica quem pagou; a posição do sócio pedida em #193 é apenas relatório de leitura.

**Estado:** vigente.

## D-ERP79 — O Manual de Orientação vive em `docs/manual` e responde só com o que lá está (17/09/2026)

**Contexto:** o manual era um array escrito à mão em `src/lib/help-manual.ts`, só mudava com Publish, cobria o ERP clássico e já descrevia ecrãs inexistentes (`/aprovacoes-pendentes`, "Custo Isolado / Vincular ao Master"); a pesquisa com IA mandava o índice inteiro no prompt, sem embeddings nem citação.

**Decisão:**

(a) **Fonte = artigos em `docs/manual/*.md`**, um por capítulo, com um bloco ````ajuda` por secção (`id`, `tooltip`, `ecras`, `perfis`, `fontes`, `termos`) e diagramas SVG em `docs/manual/img/` referenciados no artigo.

(b) **O conteúdo vai para a base** (`help_articles`, `help_sections`, `help_chunks`) pelo botão Administração → **Sincronizar manual** (edge function `manual-sync`; conteúdo global, sem `company_id`, por desenho).

(c) **Pesquisa híbrida** (`pgvector` com `google/gemini-embedding-2` + full-text português com `unaccent` + trigram, RRF) em `help_search_chunks`; o LLM só responde com base nos pedaços, cita a secção e nunca dá números; sem acerto lexical e com cosseno abaixo do limiar não chama o LLM e responde "não encontrei".

(d) **Todas as perguntas ficam em `help_questions`** (com `max_cosine` e `lexical_hits`) e as não respondidas / baixa confiança formam a fila Administração → **Lacunas do manual**.

(e) **Tooltips com anchor** mostram o texto do bloco ````ajuda` e "Saber mais" abre o painel lateral na secção; o painel abre por cima de qualquer modal.

(f) **O campo `termos`** guarda o vocabulário da equipa (ex.: "dayoff") e é indexado mas invisível no artigo.

(g) **Fontes internas** (D-ERP…, PROC-…, ficheiros de memória) só visíveis a admin / `platform_admin`.

(h) **O manual só descreve o que o ecrã faz hoje** — o decidido mas por implementar fica fora ou em aviso ⚠️.

**Alternativas rejeitadas:** manter o manual em código (desatualiza sem aviso); copiar conteúdo para a base à mão; ler o repositório pelo GitHub (PAT expira); capturas de ecrã em vez de diagramas (desatualizam a cada layout).

**Consequência:** capítulos ainda só no manual antigo não são pesquisáveis pela IA até serem migrados; uma alteração a `docs/manual` só chega aos utilizadores com **Publish + Sincronizar manual**.

**Primeiro capítulo:** `docs/manual/rateios.md` — 7 secções, 6 diagramas, testado em Live a 17/09 com "rateio dayoff", "rateio day off", "hotel da folga com o promotor de outra cidade" (citam `rateios.terceiros`), "tráfego pago de uma turnê igual pelas cidades" (cita `rateios.master`) e "como exporto o SAF-T?" (não encontrado).

## D-ERP80 — A transitória diz porquê (17/09/2026)

**Contexto:** `transactions.is_transitory` era um booleano sem motivo. O motivo é conhecido no momento em que se marca e era deitado fora: a invariante do Extra do Sócio tinha de adivinhar pela descrição, e a rubrica não serve (diz que despesa é, não porque é transitória).

**Decisão:** `transactions.transitory_reason` com lista fechada de sete motivos — `partner_advance`, `repasse`, `caucao`, `emprestimo_socio`, `carga_cartao`, `aporte_socio`, `entrada_a_repassar`. Toda a transitória tem de ter motivo (`transactions_transitory_reason_required`, validada em Live). Os caminhos automáticos gravam-no sozinhos (ramo do capital 10.1.*, par da carga de cartão 10.3, lançamento a partir do banco, conversão em Extra do Sócio); o interruptor manual dos modais mostra um selector obrigatório sem "Extra do Sócio", que só nasce pela conversão própria. Quando deixa de ser transitória, o motivo limpa-se.

**Alternativas rejeitadas:** inferir pela rubrica (a rubrica é a natureza da despesa, não o motivo da transitoriedade); manter a adivinhação pela descrição (frágil e silenciosa); campo de texto livre (não se agrupa nem se vigia).

**Consequência:** a invariante `transitoria_partner_advance_sem_linha` (error, referência 0) passa a ser exacta. Backfill de 17/09: 41 transitórias, 286.443,12 €, zero sem motivo.

**Testado em Live a 17/09/2026** com dados isolados `[TESTE-TRANSITORIA]`, apagados no fim (base de volta a 41 transitórias e 286.443,12 €): interruptor manual recusa gravar sem motivo e limpa-o ao desligar; lançamento a partir do banco grava `entrada_a_repassar`/`repasse`; conversão em Extra do Sócio (total e parcial) grava `partner_advance` com linha em `partner_advance_expenses`; a invariante acusou 1 com o defeito forçado e voltou a 0; carga de cartão (duas pernas), 10.1.01 e 10.1.04 recebem o motivo sozinhos. Nenhuma correção de código foi necessária.

**Detalhe:** `.lovable/memory/features/transitory-reason.md`.

**Adenda 22/09/2026 — no ramo 10.1 o motivo é derivado, não aceite do ecrã.** O trigger `force_transitory_for_capital_branch()` só preenchia `transitory_reason` quando vinha NULL, pelo que um ecrã que já mandasse motivo gravava-o errado: o modal "Lançar movimento do banco" manda `entrada_a_repassar`/`repasse` e um aporte de 150.000 € em 10.1.01 nasceu como `entrada_a_repassar` (transação `438c16ea-82a0-4109-846d-212e133de112`, corrigida à mão). Passa a sobrepor-se sempre: `10.1.04` → `emprestimo_socio`, restantes `10.1.*` → `aporte_socio`, em INSERT e sempre que a rubrica mude. Fora do ramo 10.1 nada muda. No cliente, o `BankLineLaunchModal` deixa de enviar motivo quando a rubrica é do ramo 10.1 e mostra a "Transitória" marcada e bloqueada.


**Estado:** vigente.

## D-ERP81 — Regra de ROAS para eventos sem compra alimentada pelo pixel (17/09/2026)

**Âmbito:** eventos em que a compra NÃO chega à plataforma de anúncios pelo pixel. Hoje é tudo o que vende na Ticketline (o pixel não devolve o `fbc` no Purchase — Elo 4 partido) e tudo o que vende na BOL (onde o pixel não existe). **Quando o evento tem ligação com pixel e o Purchase chega com `fbc` (ou equivalente da plataforma), o ROAS atribuído passa a ser o ROAS oficial desse evento** — é ele que entra nos KPIs e nos relatórios, e o bruto/marginal deixam de ser a regra para esse evento. A D-ERP81 é a regra de recurso só para os eventos em que isso não acontece. A passagem faz-se por evento, no momento em que se prove que o Purchase chega com o identificador do clique (Elo 4 fechado para essa bilheteira).

**ROAS bruto = receita real de bilheteira ÷ investimento (Meta + Google) no mesmo período.** É o ROAS oficial e o único que entra nos relatórios de tráfego pago × vendas — KPIs, tabela diária, tabela por cidade. Cidade sem investimento leva traço. Mede eficiência global, inclui venda orgânica e **não é prova de causa**.

**ROAS marginal = variação da receita ÷ variação do investimento** entre dois períodos iguais e consecutivos da mesma cidade/evento. É o cálculo para decidir mexer na verba. Só se lê quando o investimento variou pelo menos 30% e com duas semanas de leitura — uma semana contra outra tem ruído. Exemplo medido a 17/09/2026 (10–16 set vs 03–09 set, Raphael Ghanem): Porto +891,68 € de verba para +305 € de receita = 0,34×; Sta M. Feira +347,44 € para +620 € = 1,78×.

**ROAS incremental = (receita do período − base orgânica) ÷ investimento.** Só em estudo pontual ou teste por cidades (desligar a verba em uma ou duas cidades em rotação e comparar com as restantes). Leva sempre escritos a janela e a base de comparação. **Nunca entra no relatório semanal.**

**ROAS atribuído da plataforma:** nestes eventos fica só dentro do MP Audience, para comparar campanhas, conjuntos e criativos entre si e alimentar o diagnóstico. Nunca se apresenta como retorno. Se aparecer num relatório, vai em tabela à parte, rotulado "atribuído, subestimado".

**Nunca dois ROAS diferentes na mesma tabela nem no mesmo gráfico.**

**Motivo:** no relatório anterior coexistiam 1,88× (atribuído), 4,3× (bruto) e 7,80× (incremental) para o mesmo artista no mesmo documento.

**Estado:** vigente.

## D-ERP82 — O backup é uma pasta por corrida, com um ficheiro por tabela, e a lista de tabelas é derivada, nunca escrita à mão (18/09/2026)

**Contexto:** a 17/09/2026 apurou-se em Live que o backup diário estava a falhar em silêncio — dias só com o ficheiro global, a mundo-propicio sem backup desde 15/09 e a coala-portugal desde 11/09. A função fazia o global e depois o ciclo de todas as empresas na mesma execução, excedia memória e tempo, e a guarda de idempotência olhava para o storage e para o ficheiro global, que era escrito primeiro: qualquer segunda tentativa no mesmo dia saía sem fazer nada. O cron chamava por `net.http_post` com timeout de 5 s e a resposta nunca era lida. Ao mesmo tempo, a cobertura era de 75 tabelas escritas à mão, num universo de 220 em `public` e 49 em `crm`.

**Decisão:**

1. **Uma invocação da `database-backup` = um alvo.** O cron dispara N chamadas, uma por empresa ativa e uma global. Cada uma é uma instância própria, com o seu próprio tempo e memória.
2. **A prova de que uma corrida aconteceu é uma linha em `public.backup_runs`, não um ficheiro no bucket.** É por ela que se faz a idempotência, por empresa e por dia, e é dela que vive o invariante `backup_empresa_em_falta`, severidade `error`, referência 0.
3. **O formato é uma pasta por corrida:** `<slug>/<timestamp>/<tabela>.json` mais um `manifest.json` com contagens, versão 4. Tabelas grandes ficam em `<tabela>.partN.json` e o manifesto declara o número de partes. Tabelas do schema `crm` ficam como `crm.<tabela>.json` e são restauradas com `admin.schema("crm")`. O leitor exige todas as partes e compara as linhas lidas com o manifesto: parte em falta ou contagem que não bate é erro, nunca aviso.
4. **A lista de tabelas é derivada de `information_schema` em cada corrida:** tem `company_id`, vai para o backup da empresa; não tem, vai para o global. Uma tabela nova entra no backup no dia em que nasce. O que fica de fora vive em `public.backup_excluded_tables`, com motivo escrito, aparece no manifesto de cada corrida e é vigiado pelo invariante `backup_tabelas_excluidas`, referência 1.

**Consequência medida em Live a 18/09/2026:** por empresa, de 70 tabelas para 226. A mundo-propicio passou de 108.443 para 206.080 linhas, e de 39,57 MB para 171,61 MB.

**Esta decisão não resolve:** os ficheiros de storage continuam a ser apenas listados, nunca copiados (#202); o restauro completo continua a apagar antes de inserir, sem transação nem retrocesso (#203); e os backups continuam a viver dentro do projeto que protegem.

**Estado:** vigente.

A 18/09 o backup global passou a incluir `infra.json` e `identities.json`. A estrutura da base continua a vir das migrações do repositório; segredos e hashes de palavra-passe nunca entram num ficheiro de backup, por decisão.



### D2 — Base única Live (jun/2026)
**Decisão:** Eliminado o ambiente Test; passa a existir só a base Live (sfohvvlqccmmebvjgibx).
**Porquê:** Simplificar operação. DDL do agente passa a aplicar direto em Live; menos drift entre ambientes.
**Consequência:** "Faz Publish" serve para código/edge functions/front; não para objetos SQL de migração.
**Estado:** vigente.

## D-ERP83 — IVA dos cards da capa é vista, não critério (adenda D57; substitui D24 no ponto do IVA) (18/09/2026)

**Decisão:** Um só seletor c/IVA · s/IVA por página, aplicado a Receitas, Custos e Lucro, guardado por utilizador. O critério contratual (`events.partner_calc_basis`) continua a mandar no Fecho, Encontro de Contas, Apuramentos, PDFs e Portal do Sócio; a capa assinala quando a vista difere dele. `committed` e previsto corrente existem nas duas bases, bucket a bucket, com `max(real, previsto ?? real)` em cada base; o previsto ganha bruto pelo IVA da própria origem.

**Porquê:** no mesmo evento há sócios com IVA e sócios sem IVA — a capa não pode ficar presa a um formato único; e com c/IVA ligado o card mostrava custos brutos contra receita líquida (Simone Mendes, 17/09/2026: 300.014,15 € nos dois toggles). Issue #207.

**Estado:** vigente.



### D3 — Pendências vivem em GitHub Issues (jun/2026)
**Decisão:** A fonte de verdade das pendências é GitHub Issues (repo pedrompropicio/mundopropicio), geridas pela edge function github-issues. Handoffs passam a ser só diário/histórico.
**Porquê:** Os handoffs datados são snapshots que se perdem entre chats/versões. Issues são uma fonte única, viva, rastreável e visível no telemóvel. Ritual: ler no início da sessão, atualizar no fim.
**Estado:** vigente.

### D4 — Documentação viva ARCHITECTURE + DECISIONS (jun/2026)
**Decisão:** O "como funciona" e o "porquê" migram para docs vivos no repo, mantidos no lugar. A memória do Claude vira índice que aponta para eles.
**Porquê:** A memória é resumida e tem limite; os handoffs dispersam-se. Um doc vivo dá durabilidade ao contexto.
**Estado:** vigente (em construção, por partes).

## D-ERP87 — Fatura agrupada liquida-se em lote, nunca por propagação implícita (18/09/2026)

**Decisão:** Uma fatura agrupada liquida-se pelo `BatchPaymentModal` com todas as linhas em aberto, nunca por propagação implícita a partir de uma linha. O modal individual mostra as irmãs em aberto e oferece "Liquidar a fatura completa"; o lote avisa quando a seleção não cobre a fatura. A propagação às filhas de rateio mantém-se.

**Porquê:** a propagação escondia a saída total da trava de saldo e do utilizador, forçava retenção e crédito a zero nas irmãs e não verificava erros de escrita. Issue #147.

**Estado:** vigente.

## D-ERP84 — Fluxo de Caixa lê a fonte única de saldo (18/09/2026)

**Decisão:** O Fluxo de Caixa deixa de ser relatório de movimentos com aviso e passa a ler a fonte única de saldo (`computeAccountBalance` + `buildAccountCutoffs`, D-ERP12/D-ERP25): só transações liquidadas, por `paid_amount`, data efetiva `COALESCE(payment_date, date)`, estornadas (`reversed_at IS NOT NULL`) fora, saldo inicial com a data de corte respeitada e contas `skip_balance_check` fora do saldo (nunca zero nem negativo). Mostra Saldo de abertura, os ajustes de caixa do período em linha própria e o Saldo acumulado real. Em paralelo, todo o caminho que repõe `paid` numa transação existente limpa o carimbo de estorno (`reversed_at`, `reversal_kind`), mantém `reversal_reason` e deixa a entrada "Estorno" na auditoria.

**Porquê:** o acumulado do relatório não era saldo de nada (somava aprovadas por `amount`/`date`, ignorava corte e estornos) e havia caminhos de liquidação — despesas pagas pelo sócio e fecho de bilheteira — que punham `paid` sem apagar o carimbo, tirando o custo do BP e dos agregados do sócio. Issue #149.

**Estado:** vigente. Nota: o número D-ERP81 estava duplicado no ficheiro (ROAS e fatura agrupada); resolvido a 18/09 — a fatura agrupada passou a D-ERP87.

---

## D-ERP85 — Lançar a partir do banco é uma RPC transacional, sem SECURITY DEFINER (18/09/2026)

**Decisão:** O lançamento a partir de linhas do extrato passa a ser uma só operação de base de dados — `public.launch_from_bank_lines(p_items jsonb) RETURNS uuid[]`, plpgsql, **sem `SECURITY DEFINER`** (corre com as permissões de quem chama, a RLS continua a valer, e o `company_id` vem sempre das linhas do extrato, nunca do pedido). Transações e linhas do banco nascem no mesmo commit: qualquer erro reverte tudo. Uma linha que já esteja conciliada (`status <> 'unmatched'` ou com `matched_transaction_id`/`created_transaction_id`) é recusada com o id — guarda contra o duplo clique. O `BankLineLaunchModal` deixa de inserir em `transactions`: foram removidos o `insertAndLinkLines` e o `revertLeg`.

**Porquê:** o caminho principal inseria primeiro (uma transação, duas no par de transferência) e só depois ligava as linhas, sem retrocesso — falha na ligação ou na segunda perna deixava transação(ões) órfã(s), **pagas, a mexer no saldo**; foi o que aconteceu ao TPA ZigPay de 10/09/2026 (27.241,87 €). E **compensação no cliente (apagar se falhar) não substitui atomicidade**: se o `delete` também falhar, a órfã fica. Quem via o toast de erro assumia que nada tinha sido criado e voltava a clicar. Issue #154.

**Fora da RPC, de propósito:** a ligação da transferência-mãe à linha de BP (`update-transaction`, Peça C do D-ERP74), guardar a regra e incrementar `hits`. Se falharem, o que já está lançado fica — e o aviso diz o que resta fazer à mão.

**Estado:** vigente. Nota de numeração: o D-ERP81 duplicado foi resolvido a 18/09 (ver nota do D-ERP84); D-ERP85 estava livre.

---

## D-ERP86 — `paid_amount`, estado de pagamento e data de pagamento derivam de `transaction_payments` (18/09/2026)

**Decisão:** `transactions.paid_amount`, o estado de pagamento (`paid`/`approved`) e `payment_date` passam a ser **derivados no servidor** a partir das linhas de `transaction_payments` (trigger `sync_paid_amount_from_payments`, que deixou de exigir cronograma de parcelas). O cliente só escreve **linhas**; na transação continua a escrever apenas o que não é derivado: `account_id`, `payment_method`, `payment_entity`, `payment_reference`, `invoice_ref` e a limpeza de `reversed_at`/`reversal_kind`.

**Regra:** soma das linhas `paid` ≤ 0,01 € → `paid_amount = 0`, estado volta a `approved` (não `pending` — uma transação aprovada que perde o pagamento continua aprovada, que é o estado exigido pelos seletores das listas de pagamento) e `payment_date` a nulo. Soma ≥ bruto − 0,05 € → `paid_amount = soma`, estado `paid`, `payment_date` = data mais recente. Entre os dois → `paid_amount = soma`, estado `approved` (parcial; não existe `partially_paid`). Bruto = `amount * (1 + iva_rate/100)`.

**Moeda estrangeira:** o fecho pode dar-se com soma diferente do bruto em EUR (variação cambial). Nova coluna `transaction_payments.closes_transaction` (boolean, default false): a linha que fecha a dívida marca-a a true e o servidor põe o estado a `paid` mesmo sem atingir o bruto.

**Isentas (o servidor não toca nelas):** filhas de rateio (`parent_transaction_id` + `split_percentage` — o dinheiro sai na mãe), linhas de nota de reembolso (`is_reimbursement`) e despesas pagas pelo sócio (existe linha em `partner_paid_expenses`). Nestas, a escrita directa mantém-se.

**Porquê:** a escrita directa pelo cliente deixou **624 transações pagas sem qualquer linha de pagamento** (medido a 30/08/2026), com o valor pago e a soma das parcelas a divergirem sem ninguém notar. Issue #91.

**Como se verifica:** invariante `paid_amount_sem_linhas` (erro, global, referência 1 — a única divergente legada é `31497cab-8123-4a5b-8ee3-0e13db8508c9`, "Aluguel espaço") e a prova `supabase/tests/paid_amount_derivado.sql`.

**Estado:** vigente.

**Adenda (18/09/2026, #127) — moeda nas linhas de pagamento:** `transaction_payments.amount` é **sempre EUR**; a moeda de origem passa a ficar na própria linha, com a MESMA convenção de `transactions` e `standalone_invoices` — `currency` (default `'EUR'`, NOT NULL), `original_amount`, `fx_rate`, `fx_rate_source`. CHECK `transaction_payments_fx_required`: `currency = 'EUR' OR (original_amount IS NOT NULL AND fx_rate IS NOT NULL)`. Os modais de pagamento (individual e em lote) gravam o valor liquidado na moeda de origem e o câmbio usado (`dia (manual)` quando o utilizador introduz a taxa do dia, senão `original da transação`); a auditoria "Câmbio do dia" mantém-se. Backfill das 3 linhas legadas em BRL com o câmbio original da transação. Verificação: invariante `pagamento_moeda_sem_cambio` (erro, global, referência 0).

## D-ERP88 — O câmbio da fatura resolve-se no servidor, pela data da fatura (adenda D-ERP78) (18/09/2026)

**Decisão:** o câmbio de uma fatura avulsa em moeda estrangeira resolve-se **no servidor pela data da fatura** (câmbio de referência do BCE via Frankfurter; se nessa data não houver fixing, o último dia útil anterior). O chamador só envia `fx_rate` quando quer **impor** um valor — e nesse caso ganha o valor explícito, com `total_amount` obrigatório e a validação de ±0,01 €.

**Consequências:** em moeda ≠ EUR sem `fx_rate`, `invoice_date` é obrigatória; `fx_rate_source` leva a data efectivamente usada (`BCE (frankfurter.app) AAAA-MM-DD`); `total_amount` é calculado (um valor enviado é ignorado). A resolução corre antes de qualquer download/upload — falha do BCE devolve 502 sem gravar linha nem objeto. Helper único: `supabase/functions/_shared/fx-rate.ts` (`getEcbRate`), usado também pelo `fetch-fx-rate`, que passa a aceitar `date` e a devolver `date_used`. GBP suportado. Issue #195.

**Estado:** vigente.

## D-ERP89 — O restauro completo carrega para uma área de sombra, valida, e troca numa única transação (18/09/2026)

**Contexto (#203, apurado em Live a 17-18/09/2026):** a `database-restore` apagava tudo e só depois inseria, em lotes de 500 com `break` no primeiro erro, sem transação e sem retrocesso — um restauro falhado destruía mais do que repunha. Pior: inseria `transactions` antes de `event_forecasts`, e como 637 transações têm `forecast_id` e 262 linhas de BP têm `transaction_id`, o restauro completo **falhava garantidamente**. Nunca tinha sido executado. A protecção de colunas (`fetchLiveColumns`) corria **depois** dos DELETEs, e numa tabela já vazia não aprendia coluna nenhuma. Os triggers ficavam ligados, sob `service_role`.

**Decisão:**

1. **Área de carga `restore_shadow`.** Uma sombra por tabela, criada com `LIKE ... INCLUDING DEFAULTS` (colunas de HOJE, sem constraints, sem triggers, sem índices). As colunas que já não existem são removidas **ali**, contra `information_schema` da sombra — nunca por amostra de linha — e são devolvidas no resultado.
2. **Validação antes de tocar em produção, toda por SQL** (`restore_shadow_validate`): contagem de cada sombra igual ao manifesto; todos os valores não nulos de cada FK com pai existente (na sombra do pai, ou na tabela de produção quando o pai está fora do backup); e `company_id` diferente do da empresa restaurada é **erro**, nunca filtro silencioso. Falha = relatório, sombras deixadas de pé para inspecção, produção intacta.
3. **A troca é uma função que É a transação** (`restore_apply_from_shadow`, SECURITY DEFINER, só `service_role`): `SET CONSTRAINTS ALL DEFERRED` → ordem topológica derivada de `pg_constraint` (nunca uma lista à mão) → `DISABLE TRIGGER USER` → `DELETE` por ordem inversa (por `company_id`, nunca `TRUNCATE`) → `INSERT` por ordem topológica com lista de colunas explícita → `SET CONSTRAINTS ALL IMMEDIATE` → `ENABLE TRIGGER USER`.
4. **As cinco chaves dos dois ciclos são `DEFERRABLE INITIALLY IMMEDIATE`** (`transactions`↔`event_forecasts` e `transactions`↔`ticket_office_settlements`): o comportamento normal não muda, só permitem o adiamento dentro da transação de restauro.
5. **Toda a corrida de restauro deixa linha em `backup_runs`**, com `scope` `restore` ou `restore_test`.

**Factos de plataforma que a implementação teve de respeitar (não se reinvestigam):** o papel `postgres` não é superuser — `set_config('session_replication_role','replica')` dá permission denied; o que funciona é `ALTER TABLE ... DISABLE/ENABLE TRIGGER USER`. O `pg_safeupdate` está activo, e por isso **todo** `DELETE` dentro destas funções leva `WHERE` (mesmo o da tabela temporária). E o Postgres **não deixa** religar triggers com eventos de trigger adiados pendentes (`55006`): a verificação das FKs vem obrigatoriamente **antes** do `ENABLE TRIGGER USER` — foi o ensaio de retrocesso que o apanhou.

**Ensaio (parte da decisão, não opcional):** backup fresco da siriguella (226 tabelas, 2.736 linhas), fotografia por tabela (contagem + `md5` das linhas), restauro por cima dela própria, segunda fotografia: **zero diferenças** em 227 tabelas / 2.736 linhas. Retrocesso provado com uma sombra corrompida (transação com `forecast_id` inexistente): erro `23503` em `SET CONSTRAINTS ALL IMMEDIATE`, produção idêntica e os 24 triggers de `transactions` religados.

**Não resolve:** os ficheiros de storage continuam a não ser copiados (#202).

**Adenda (18/09/2026) — `selective-restore` e `surgical-restore` no mesmo caminho.** A `surgical-restore` passa a ser só invólucro (reencaminha para `selective-restore` com `scope: 'events'`). O âmbito de um evento é **derivado do grafo real**, nunca de listas à mão: parte das linhas `events`, desce por FKs e identifica cada linha pela **chave primária real** lida do catálogo (entram tabelas cuja PK não é `id`, como `event_marketing`, `event_portal_endorsements`, `event_simulator_config`). Distinguem-se **ligações de pertença** (coluna `<pai>_id`, seguem-se) de **ligações de referência** (não se seguem — `event_simulator_config.sales_curve_prior_event_id` arrastava dados de outros eventos). E o restauro por linhas **actualiza no lugar** (`ON CONFLICT (pk) DO UPDATE`) em vez de apagar: `transactions.event_id` e `events.parent_event_id` são `ON DELETE CASCADE`, pelo que apagar a linha `events` de um evento-mãe arrastava sub-eventos e tudo abaixo. Na validação, em `p_scope='rows'` o pai pode estar na sombra **ou** em produção, porque um evento tem referências legítimas para fora dele. Ensaio: Deive Leonardo (evento-mãe, 2 sub-eventos), 17 tabelas / 60 linhas, 80 FKs, fotografia antes = depois, retrocesso `23514` sem alterar nada, e `scope: 'tables'` numa tabela da siriguella com `md5` igual.

**Estado:** vigente.


---

## D-ERP90 — Campanhas sincronizam por cron; connection de artista liga a MÚSICAS, nunca a eventos (adenda D-ERP57/D-ERP68) (19/09/2026)

**Causa (verificada em Live a 18/09/2026):** `crm.meta_campaign_snapshot` e `crm.google_campaign` só eram gravadas quando alguém abria o MP Audience — nem `crm-meta-sync-campaigns` nem `crm-google-sync-campaigns` tinham tarefa agendada. A connection de tráfego do Litto (`e5d12c36-cd0f-412a-a1c0-22ddbb2a336e`, `connection_scope='artist'`) tinha **0 linhas** de campanhas. Um painel que só tem dados quando é visitado não é um painel.

**Decisão 1 — os dois syncs de campanhas correm por cron**, no padrão do job 93 (`net.http_post` com `Authorization: Bearer <vault 'email_queue_service_role_key'>`). Ambas as funções aceitam a chave de serviço (provado: Meta 200 com `synced_count` 126; Google 200 `invoked_by: service_role`, 42 campanhas).

| job | jobname | schedule (UTC) | corpo |
| --- | --- | --- | --- |
| 241 | `crm-meta-campaigns-hourly` | `25 * * * *` | uma chamada por connection meta `active` com `selected_ad_account_id`, `mode: incremental` |
| 242 | `crm-google-sync-campaigns-3h` | `10 */3 * * *` | uma chamada sem `connection_id`, `mode: incremental`, `days_back: 7` |

**Porquê estes horários:** a Meta corre ao **minuto 25** para os metadados das campanhas estarem gravados antes dos insights do job 93 (minuto 40) — uma campanha nova deve poder ligar-se ao evento/música antes de ter gasto um cêntimo. O Google corre **de 3 em 3 horas** porque cada conta custa **duas** consultas GAQL (metadados + insights diários) e as métricas do Google Ads consolidam com atraso: sincronizar de hora a hora gastaria quota para reler os mesmos números.

**Decisão 2 — uma connection de artista liga campanhas a MÚSICAS, nunca a eventos.** No fim do sync, as duas funções chamavam o auto-link a eventos (`crm_auto_link_meta_campaigns_to_events` / `crm_auto_link_google_campaigns_to_events`) com o `company_id` da connection, mesmo quando a connection era de artista — o que é errado por construção: as campanhas são do artista e o seu vínculo é `linked_song_id`. Passa a haver um desvio explícito por `connection_scope`:

- `connection_scope='company'` → comportamento inalterado (auto-link a eventos, `auto_linked_count`).
- `connection_scope='artist'` → **não** se chama o auto-link a eventos; chama-se `public.artist_ads_autolink_songs_internal(artist_id)` e devolve-se `songs_linked_count` (Meta) / `songs_linked` (Google).

**Decisão 3 — a regra de correspondência vive uma vez.** O corpo de `public.artist_ads_autolink_songs` foi extraído para `crm.artist_ads_autolink_songs_core(p_artist_id, p_company_id)` (SECURITY INVOKER, sem verificação de acesso, `EXECUTE` revogado a PUBLIC), com a regra **exactamente** como estava: título-base normalizado com ≥ 8 caracteres contido no nome normalizado da campanha, só linhas com `linked_song_id IS NULL`, desempate pelo título mais longo e depois pela música mais antiga, só connections `connection_scope='artist'` desse artista.

- `public.artist_ads_autolink_songs(p_artist_id)` — assinatura e retorno inalterados (a app Gestão Artística usa-a): `artist_ads_assert_access` e depois o núcleo.
- `public.artist_ads_autolink_songs_internal(p_artist_id)` — SECURITY DEFINER, `search_path` fixo, resolve o `company_id` pelo artista e chama o núcleo. Não tem `auth.uid()` porque o chamador é um cron. Privilégios: `anon` false, `authenticated` false, `service_role` **true**.

**Regras que se mantêm:** as funções `crm-*` nunca leem `artist_channel_connections` e as `artist-*` nunca leem `ad_platform_connections` (aqui lê-se `ad_platform_connections` dentro de `crm-*`, o que é permitido); nenhuma chamada interna reencaminha o `Authorization` do caller — a Meta cria um cliente `service_role` próprio para a RPC interna; nenhum `EXCEPTION WHEN OTHERS` mudo (o auto-link é best-effort mas registra no console).

**Migração:** `20260919014632_722936fc-62f6-417e-841f-b846fa3e7017.sql`, aplicada e verificada em Live.

**Estado:** vigente.

---

## D-ERP91 — Tráfego por artista chega ao nível ANÚNCIO; a moeda é a da conta, nunca assumida (adenda D-ERP68/D-ERP90) (19/09/2026)

**Causa (verificada em Live a 19/09/2026):** o painel de tráfego por artista parava na campanha. Os
espelhos de conjuntos e anúncios existiam (`crm.meta_adset_snapshot`, `crm.meta_ad_snapshot`) mas só
se enchiam por chamada à mão — e `crm-meta-sync-ads` guardava do criativo apenas `raw.creative.id`,
pelo que não havia miniatura nem link para ver o anúncio. Em paralelo, `public.artist_ads_campaigns`
devolvia `currency` NULL nas campanhas Google: lia `ad_platform_connections.selected_ad_account_currency`,
que fica vazia nas contas registadas por ID (`artist_ads_register_external`), ainda que
`crm.google_campaign_insights_daily.currency` já viesse preenchida.

**Decisão 1 — os crons cobrem os três níveis.** O job 241 `crm-meta-campaigns-hourly` (`25 * * * *`)
passou a chamar, por connection meta `active` com conta escolhida, `crm-meta-sync-campaigns` +
`crm-meta-sync-adsets` + `crm-meta-sync-ads` em `mode: incremental`; o job 93
`crm-meta-insights-hourly` (`40 * * * *`) passou a pedir `levels` `campaign`, `adset` e `ad`. Ambos
cobrem `connection_scope` `company` e `artist`. Provado em Live: 34 conjuntos, 111 anúncios (7 activos
nas 2 campanhas activas) e insights dos três níveis desde 2026-08-20 a somar o mesmo gasto.

**Decisão 2 — criativo expandido em `raw`, sem colunas novas.** `crm-meta-sync-ads` pede
`creative{id,name,thumbnail_url,image_url,video_id,effective_object_story_id,effective_instagram_media_id,instagram_permalink_url,object_type}`
e guarda tudo em `raw.creative`. `crm.meta_creatives` é a biblioteca de criativos do MP Audience e
**não** serve para isto. `thumbnail_url` da Meta **expira** — é refrescado a cada sync, nunca se
guarda como se fosse estável. Para `connection_scope='company'` nada muda além de um `raw` mais rico.

**Decisão 3 — a moeda é a da conta e nunca se assume.** `crm-google-sync-campaigns` lê
`customer.currency_code` (já vinha nas duas consultas GAQL) e grava-a em
`crm.ad_platform_connections.selected_ad_account_currency` quando está NULL ou diferente. Se a API não
disser a moeda, não se escreve nada — proibido assumir BRL ou EUR. E no ramo Google de
`artist_ads_campaigns` a moeda passou a ser `coalesce(selected_ad_account_currency, moeda mais recente
de google_campaign_insights_daily dessa campanha/connection)`; assinatura e colunas inalteradas.

**Decisão 4 — nova RPC `public.artist_ads_ads(p_artist_id uuid, p_campaign_id text default null)`**,
no mesmo modelo de segurança de `artist_ads_campaigns` (`artist_ads_assert_access`, só connections
`connection_scope='artist'` desse artista e da empresa do guard, SECURITY DEFINER com
`search_path = public, crm`, os mesmos privilégios: `anon` true, `authenticated` true, `service_role`
true — iguais aos de `artist_ads_campaigns`). Uma linha por anúncio Meta: `platform`, `connection_id`,
`currency`, `campaign_id`, `campaign_name`, `adset_id`, `adset_name`, `ad_id`, `ad_name`, `status`
(`effective_status`), `creative_id`, `thumbnail_url`, `permalink`, e para 7 d e 30 d `spend`,
`impressions`, `clicks`, `ctr`, `cpc`, `video_3s_views`, `thruplays`, `cost_per_thruplay`; mais
`linked_song_id` herdado da campanha e `last_synced_at`. `permalink` = `instagram_permalink_url`; se
não houver, deriva-se de `effective_object_story_id` (`<pagina>_<post>` →
`facebook.com/<pagina>/posts/<post>`); senão NULL. Divisões por zero → NULL. Janela igual à das
campanhas (`current_date - 6` / `- 29`). Por omissão exclui anúncios `DELETED`/`ARCHIVED`. O Google
**não tem nível anúncio** na base: a RPC devolve só Meta, com a coluna `platform` pronta para o futuro.

**Migração:** `20260919035335_397ec815-41a2-4613-b450-6084a2b3b9d7.sql`, aplicada e
verificada em Live: 111 anúncios para o artista do Litto, moeda BRL; `thumbnail_url` e `permalink` a
NULL enquanto não corre um sync já com o criativo expandido.

**Fora de âmbito:** câmbio/conversão de moeda, front, Publish.

**Estado:** vigente.

---

## D-ERP92 — O câmbio para a moeda de referência do artista resolve-se AO DIA, a partir de uma tabela diária do BCE (adenda D-ERP88/D-ERP91) (19/09/2026)

**Causa (Live, 19/09/2026):** o Litto tem contas de anúncios em **BRL** (Meta e Google) e em **EUR**
(TikTok Ads, ainda sem dados). As RPCs `artist_ads_*` devolvem o gasto na moeda da conta — correcto,
mas impossível de somar. Não havia onde ir buscar o câmbio dentro do SQL: o câmbio do D-ERP88 é
resolvido por HTTP dentro da edge function e **uma função SQL não pode chamar HTTP**.

**Decisão 1 — uma só fonte de câmbio no ERP: o BCE.** A mesma do D-ERP88 (`getEcbRate`, Frankfurter,
em `supabase/functions/_shared/fx-rate.ts`). Com data **não há fallback**; sem taxa não se converte
(NULL). Nunca se inventa um câmbio.

**Decisão 2 — tabela `public.fx_rates_daily` com uma linha por DIA DE CALENDÁRIO e moeda**
(`rate_date`, `currency`, `rate_to_eur`, `source`, `date_used`, `fetched_at`; PK `(rate_date, currency)`).
Nos dias sem fixing (fins de semana, feriados) grava-se a taxa do último dia de fixing anterior e
`date_used` diz qual foi — é isso que permite que o join por data nas RPCs seja uma **igualdade**, sem
`lateral` nem `order by ... limit 1` em cada linha. EUR não se grava: a taxa 1 é implícita em
`fx_convert`. RLS ligada; leitura para `authenticated`, escrita só `service_role`, `anon` **sem
qualquer privilégio** (os privilégios por omissão do schema `public` dão tudo a `anon`/`authenticated`
em cada tabela nova — tiveram de ser revogados explicitamente).

**Decisão 3 — `public.fx_convert(p_amount, p_from, p_to, p_date)`**, STABLE, SECURITY INVOKER:
`p_from = p_to` → devolve o valor; EUR tem taxa 1; senão
`p_amount * rate_to_eur(p_from, dia) / rate_to_eur(p_to, dia)`. Falta qualquer das taxas nesse dia →
**NULL**. Não arredonda lá dentro (quem apresenta é que arredonda).

**Decisão 4 — conversão AO DIA, nunca um total a uma taxa única.** Cada linha diária de gasto
converte-se à taxa do seu dia e só depois se soma. Um total convertido a uma taxa única é um número
errado que parece certo.

**Decisão 5 — moeda de referência efectiva = `coalesce(artists.reporting_currency, companies.currency)`.**
`artists.reporting_currency` é novo, opcional, com CHECK nas moedas suportadas pelo helper
(`BRL`, `USD`, `GBP`, `EUR`). A coluna da moeda da empresa é `public.companies.currency` (existia;
MP = `EUR`, empresa do Litto = `BRL`).

**Decisão 6 — as RPCs continuam a devolver o valor na moeda da conta E passam a devolver o
equivalente na moeda de referência.** Colunas acrescentadas **no fim** (nada removido nem reordenado,
a app Gestão Artística já consome as existentes):

| RPC | colunas novas |
| --- | --- |
| `artist_ads_campaigns` | `ref_currency`, `spend_7d_ref`, `spend_30d_ref`, `fx_missing_days` |
| `artist_ads_ads` | `ref_currency`, `spend_7d_ref`, `spend_30d_ref`, `fx_missing_days` |
| `artist_ads_daily` | `ref_currency`, `spend_ref`, `fx_missing_days` |

`fx_missing_days` = dias com gasto > 0 **sem taxa** (janela de 30 d nas duas primeiras; na série diária
é 0/1 por linha). Existe porque `sum()` ignora NULLs: sem este contador um total incompleto apareceria
como se fosse completo. Mudar o tipo de retorno obrigou a `DROP` + `CREATE` das três funções; os
privilégios foram repostos e confirmados iguais aos de antes (`anon`, `authenticated`, `service_role`
todos `true`).

**Decisão 7 — quem enche a tabela é a edge function `fx-rates-sync`** (só `service_role`, via
`authorize` partilhada): corpo `{ since?, until?, currencies? }`, por omissão os últimos 7 dias até
hoje e `BRL`, `USD`, `GBP`. Usa `getEcbSeries` (nova em `_shared/fx-rate.ts`, série temporal do
Frankfurter) — **um** pedido por moeda em vez de um por dia, recuando 10 dias na consulta para haver
sempre um fixing anterior a `since`. Registo em `sync_runs`. Falha do upstream → `sync_run` `error` e
resposta **502**, nunca linhas inventadas.

**Cron (criado em Live, fora desta migração):** `fx-rates-daily`, `10 0,16 * * *`, corpo `{}` (últimos
7 dias — a repetição corrige revisões de fixing sem custo). Os crons não propagam Test→Live via Publish.

**Migração:** `20260919041318` (+ a revogação de privilégios logo a seguir), aplicada e verificada em
Live: `fx_convert(100,'BRL','BRL',hoje) = 100`, `fx_convert(100,'BRL','EUR',hoje) = NULL` (tabela ainda
vazia — o backfill desde 2026-08-01 corre à parte), e `artist_ads_ads` do Litto com 111 linhas,
`ref_currency = BRL`, `spend_30d = spend_30d_ref = 945,06`, `fx_missing_days = 0` (conta e referência
na mesma moeda → identidade, sem depender de taxas).

**Fora de âmbito:** faturas (o D-ERP88 fica como está), front, Publish.

**Estado:** vigente.

---

## D-ERP93 — Estados herdados do pai no sync, nível anúncio a partir dos insights, trinco nas ligações campanha→música (adenda D-ERP90/D-ERP91) (19/09/2026)

**Causa 1 (Live, 19/09/2026):** na connection Meta do Litto, `crm.meta_ad_insights_daily`
somava **R$ 3.421,67 em 17 anúncios** nos últimos 30 dias e `public.artist_ads_ads` devolvia
**R$ 945,06 em 7**. Faltavam 10 anúncios / R$ 2.476,61 das campanhas `120245189593110358` e
`120245208782130358`, ambas PAUSED: tinham insights mas **não estavam em
`crm.meta_ad_snapshot`**. `crm-meta-sync-ads` e `crm-meta-sync-adsets` filtravam
`effective_status IN ('ACTIVE','PAUSED')` — e um anúncio/conjunto cujo **pai** foi pausado não
fica PAUSED, fica com o estado **herdado**: `CAMPAIGN_PAUSED` (campanha pausada) ou
`ADSET_PAUSED` (conjunto pausado, só existe ao nível anúncio). Afectava também as connections
de empresa.

**Decisão 1 — o filtro de estado inclui os estados herdados.** `crm-meta-sync-ads`:
`ACTIVE, PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED`. `crm-meta-sync-adsets`:
`ACTIVE, PAUSED, CAMPAIGN_PAUSED`. **Não** se alarga a `DELETED`/`ARCHIVED`. O filtro
`campaign.effective_status IN ('ACTIVE','PAUSED')` que as duas funções já aplicavam fica como
está (uma campanha pausada tem `effective_status = PAUSED`, logo entra). Resto do
comportamento inalterado.

**Causa 2 — a leitura por anúncio dependia do snapshot.** Mesmo com o filtro corrigido,
`artist_ads_ads` partia de `crm.meta_ad_snapshot`: qualquer anúncio com gasto cuja ficha ainda
não chegou ficava invisível e o total por anúncio deixava de bater com o total por campanha.

**Decisão 2 — `public.artist_ads_ads` passa a partir da UNIÃO** de todos os anúncios com
insights na janela de 30 d (connections de artista) **com** os anúncios do snapshot. Sem ficha,
`ad_name`/`adset_name`/`campaign_name` vêm dos insights (o valor mais recente) e
`status`/`creative_id`/`thumbnail_url`/`permalink` ficam **NULL** — é o sinal de "ficha ainda não
sincronizada", não um erro. `DELETED`/`ARCHIVED` só se excluem quando **não** têm gasto na
janela: um anúncio arquivado que gastou dinheiro continua a ser um custo real. Assinatura, ordem
e nomes das colunas inalterados (incluindo `ref_currency`, `spend_*_ref` e `fx_missing_days` do
D-ERP92); privilégios confirmados iguais antes e depois (`anon`, `authenticated`,
`service_role` = true).

**Invariante:** para cada campanha, `sum(spend_30d)` de `artist_ads_ads` = `spend_30d` dessa
campanha em `artist_ads_campaigns`. Verificado em Live nas 4 campanhas com gasto do Litto:
2.270,48 / 693,85 / 251,21 / 206,13, **diferença 0,00** em todas; total 3.421,67 em 17 anúncios,
8 deles ainda sem ficha (aparecem, com estado NULL).

**Causa 3 — ligações a músicas não se podiam desfazer.** `public.artist_ads_link_song` exigia
`p_song_id`, logo não havia como **desligar** (a 19/09 uma campanha teve de ser desligada por
UPDATE directo). E não havia trinco: `crm.meta_campaign_snapshot` e `crm.google_campaign` só
tinham `linked_event_locked`, para eventos. Quem desligasse à mão uma campanha cujo nome contém
o título da música via `crm.artist_ads_autolink_songs_core` ligá-la outra vez na corrida
seguinte do cron.

**Decisão 3 — trinco `linked_song_locked` (boolean NOT NULL DEFAULT false)** nas duas tabelas,
a par do que já existia para eventos. **Qualquer decisão humana fecha o trinco**: `link_song`
passa a pôr `linked_song_locked = true`, e a nova
`public.artist_ads_unlink_song(p_platform, p_campaign_id, p_artist_id)` põe
`linked_song_id = NULL` **e** o trinco a true. A `unlink` tem as mesmas regras de papel da
`link` (platform_admin, admin, manager, marketing_manager), passa pelo
`artist_ads_assert_access`, só toca em campanhas de connections `connection_scope='artist'`
desse artista e da empresa dele, devolve o número de linhas e tem os mesmos grants.
`artist_ads_autolink_songs_core` passa a exigir `linked_song_id IS NULL AND NOT
linked_song_locked`; a regra de correspondência título↔campanha fica inalterada. Os upserts dos
syncs (Meta e Google) **não escrevem** `linked_song_id` nem `linked_song_locked` — confirmado nas
listas de colunas.

**Dados:** a campanha Meta `120245670746070358` da connection `e5d12c36…` ficou com o trinco
fechado (foi a desligada à mão a 19/09). Nenhuma outra ligação foi tocada.

**Migração:** `20260919041600_b9ff5a67-814d-41cc-b032-bdccfe6709bc.sql`, aplicada e verificada em
Live.

**Fora de âmbito:** crons, câmbio, front, Publish.

**Estado:** vigente.

---

## D-ERP94 — Privilégio é a protecção das RPCs de tráfego por artista (19/09/2026)

**Causa.** `public.artist_ads_assert_access` devolve a empresa quando `auth.uid() IS NULL`,
**de propósito** — é o que permite aos crons (service_role, sem sessão) chamar as leituras e
o auto-link. Como toda a função nova em `public` nasce com `EXECUTE` para `PUBLIC`/`anon`,
qualquer visitante com a chave pública e o uuid de um artista conseguia ler
`artist_ads_campaigns`/`_daily`/`_ads`/`_alerts`, chamar `artist_ads_autolink_songs`, e
`link_song`/`unlink_song` saltavam a verificação de papéis sem sessão. As migrações do
D-ERP92 e D-ERP93 tinham ainda `GRANT EXECUTE ... TO anon` explícito.

**Decisão.** A protecção destas funções é o **privilégio, não o corpo**:
`REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated, service_role`
nas oito funções `artist_ads_*` (`assert_access`, `campaigns`, `daily`, `ads`, `alerts`,
`autolink_songs`, `link_song`, `unlink_song`). Nenhum corpo foi alterado.

**Regra que fica:** toda a função `artist_*` SECURITY DEFINER leva `REVOKE` de PUBLIC e
`anon` **na mesma migração que a cria ou recria**; ao fazer DROP+CREATE nunca se repõe
grant a `anon`.

**Migração:** `20260919042614_a1d9fa51-30bd-42e3-b228-a3cb85e2c84a.sql`, idempotente
(repete os REVOKE já feitos à mão em Live a 19/09), aplicada e verificada em Live:
anon false / authenticated true / service_role true nas oito.

**Levantamento das restantes SECURITY DEFINER `artist_*`/`song_*`/`soundcharts_*` com
EXECUTE para anon:** só `artist_song_playlist_streams_set` — escreve, exige sessão no corpo
(`auth.uid() IS NULL` → 42501) e papel, e não aparece em nenhuma policy de RLS. Ficou por
decidir, a cruzar com o front "Gestão Artística" (páginas públicas `/kit/:slug` podem
depender dela).

**Estado:** vigente.

## D-ERP95 — O motor de construção e publicação de campanhas é ÚNICO, com dois alvos: evento OU artista+música — F1 fundações (19/09/2026)

**Decisão (aprovada pelo Pedro a 19/09/2026).** O motor de campanhas, hoje ancorado em
eventos, passa a ser ÚNICO e a aceitar dois alvos: **evento** (como hoje, comportamento
inalterado byte a byte) e **artista+música** (`crm.ad_platform_connections` com
`connection_scope='artist'`, `artist_id`; música em `public.artist_songs`).

**Modelo.** Colunas explícitas `artist_id` + `song_id` anuláveis, `event_id` anulável,
FKs verdadeiras. CHECK "exactamente um alvo" em `crm.meta_publish_plan` e
`crm.google_publish_plan`; CHECK "no máximo um alvo" em `crm.meta_campaign_strategies`
(existem 9 estratégias antigas sem evento). `meta_publish_plan.event_id` ganhou pela
primeira vez FK verdadeira para `public.events` (CASCADE) — antes era NOT NULL solto.
`meta_publish_plan` tem ainda `connection_id` (RESTRICT). O alvo música só aceita
connection `connection_scope='artist'` do mesmo artista e da mesma empresa, garantido
pela função `crm.assert_song_target_coherent()` + trigger nas três tabelas.

**Regras do motor (fases seguintes).** Campanhas nascem SEMPRE PAUSED (confirmado por
leitura: `crm-meta-strategy-deploy` L612-623/L780/L925/L1015, `crm-meta-publish-execute`,
`crm-google-publish-execute`) e a activação é passo separado: para alvo música, publicar
exige papel de tráfego/admin da Social Artists e activar só admin/platform_admin (F2/F3).
Visibilidade no MP Audience: sem excepção à fronteira por `company_id` — quem precisa de
ver recebe papel na Social Artists. Tetos de orçamento por conta na moeda da conta:
nova `crm.artist_ads_budget_caps` (nasce vazia) e **SEM TETO O MOTOR RECUSA
publicar/activar** (fechado por omissão). Resolvedor único `_shared/campaign-target.ts`
na F2, com prova por hash do payload dry_run de planos de evento antes/depois. Smart link
por música + UTMs gerados pelo motor entram na F2 (só alvo música). LLM fora das fases
iniciais do alvo música. Google: prioridade a Demand Gen com vídeo do canal YouTube;
Pesquisa só se sair de graça. Lock anti-corrida da Meta é só código
(`meta_publish_plan.publish_started_at` já existe) — F2.

**Log de acções Google/TikTok.** Nova `crm.ads_entity_actions_log` (mesma forma de
`crm.meta_entity_actions_log`, com `platform` CHECK google/tiktok e `approved_by`) e
vista unificada `crm.v_ads_entity_actions_log` (security_invoker) = Meta ∪ nova tabela.
Até aqui o Google não tinha log de acções.

**Lacunas registadas, NÃO alteradas nesta frente (eventos):** funções de publicação sem
verificação de papel; `crm-meta-deployment-toggle` activa campanha+adsets+ads só com
sessão, sem papel nem teto; o motor não gera UTMs para evento; Google sem log de acções
até esta F1.

**Pendência fechada (D-ERP94):** na mesma migração, `REVOKE EXECUTE FROM PUBLIC, anon` +
`GRANT` a `authenticated`/`service_role` em `public.artist_song_playlist_streams_set`
— já feito à mão em Live com autorização do Pedro; repetido de forma idempotente para o
repositório reflectir Live.

**F1 é só schema.** Nenhuma edge function, nenhum ecrã, nenhum comportamento alterado.

**Migração:** `20260919045342_122ab0b2-4020-4ec4-be11-8a23234f7dff.sql`, aplicada em
Live sem nenhum ajuste ao SQL aprovado.

**Estado:** vigente (F1 concluída; F2/F3 por fazer).

### Adenda F2a — alvo música: schema de suporte, RPCs e dry-run de prova (19/09/2026)

Migração `20260919105937_495e2856-8019-46a4-b5f7-00d44d419ccf.sql`, aplicada em Live.

**Schema.** `public.artist_songs.smart_link_url text NULL` com CHECK `^https://`.
`crm.meta_publish_plan.design_id` deixa de ser NOT NULL, com CHECK
`meta_publish_plan_event_needs_design (event_id IS NULL OR design_id IS NOT NULL)`:
o plano de EVENTO continua a exigir desenho criativo, só o de música pode não ter.

**RPCs novas em `public`** (todas SECURITY DEFINER, `search_path` fixo, começam por
`public.artist_ads_assert_access(p_artist_id)` e só tocam connections
`connection_scope='artist'` desse artista na empresa devolvida pelo guard).
Leitura: `artist_ads_budget_cap_get`, `artist_ads_plan_list`, `artist_ads_plan_get`,
`artist_ads_promotable_posts`. Escrita (além do guard exigem SESSÃO — `auth.uid() IS NULL`
→ 42501 — e papel `admin|platform_admin|manager|marketing_manager` na empresa do artista,
via novo `public.artist_ads_assert_write(company_id)`; o `service_role` não escreve por
estas RPCs porque não tem `auth.uid()`): `artist_ads_song_set_smart_link`,
`artist_ads_plan_create`, `artist_ads_plan_update` (só `rascunho`/`falhado`).
Auxiliar de validação partilhada: `artist_ads_plan_validate(jsonb, text)`.
Regra D-ERP94 aplicada na mesma migração: `REVOKE EXECUTE FROM PUBLIC, anon` +
`GRANT` a `authenticated, service_role` nas nove funções (verificado em Live:
anon false / authenticated true / service_role true).

**Objectivo do plano de música** ∈ `AWARENESS | TRAFFIC | ENGAGEMENT`. Conversões NÃO
são aceites para alvo música (não há compra de bilhete nem pixel de evento).
`link_destino` = o do plano ou, em falta, `artist_songs.smart_link_url`; com objectivo
`TRAFFIC` é obrigatório e tem de ser `https://`. Moeda = moeda da conta da connection.

**Posts promovíveis.** `artist_ads_promotable_posts` junta duas fontes sem duplicados
(preferindo `ad_history`): (1) `crm.meta_ad_snapshot.raw->'creative'` das connections de
artista — `effective_object_story_id` (kind `object_story`) ou
`effective_instagram_media_id` (kind `instagram_media`), com permalink, miniatura, nome do
último anúncio que o usou e gasto 30 d de `crm.meta_ad_insights_daily`; (2)
`public.artist_content` do artista em `instagram`. **`artist_content.external_id`:** com
`source='platform_api'` guarda o **media id numérico do Instagram Graph** (17-18 dígitos,
ex. `17880197463687409`) — utilizável pela Marketing API; com `source='aggregator'` guarda
o **shortcode** (ex. `DZyDpTNxxvs`), que NÃO é utilizável. Daí `meta_ready = (source =
'platform_api' AND external_id ~ '^[0-9]{10,}$')`. Em Live: 29 linhas `platform_api`,
331 `aggregator`.

**Dry-run em `crm-meta-publish-execute`.** O parâmetro `dry_run` já existia com
**default TRUE** (salvaguarda P0 anterior) e default TRUE foi MANTIDO — mudá-lo para
FALSE alteraria o comportamento actual, o que esta fase proíbe. O dry-run continua a não
chamar a Graph API, a não escrever em nenhuma tabela e a não mudar estado, e usa as
MESMAS funções de construção do caminho real (`buildAdsetPayload`, `buildAdPayloads`,
`buildSingleAssetCreative`, `buildMultiPlacementCreative`) — não há lógica duplicada.
Alterações desta fase, todas fora do caminho de escrita: (a) o plano passa a ser lido
também com `artist_id, song_id, connection_id`; (b) plano com `song_id` devolve 200
`{ ok:false, error:'alvo_musica_f2b' }` sem fazer nada; (c) as guardas de estado
(`ja_publicado`, `estado_invalido`) passam a correr só quando `dry_run` é false — o
dry-run é permitido em QUALQUER estado, incluindo `publicado`, por ser leitura pura e
servir de prova por hash; (d) a resposta do dry-run ganha `ok:true` e `estado_plano`.
Nenhuma linha do caminho de publicação real mudou. Função deployada.

**Fora de âmbito da F2a:** resolvedor de alvo, naming, UTMs, publicação de post existente,
lock anti-corrida, activação, Google, TikTok, front.

### Adenda F2b — publicação do alvo música na Meta (19/09/2026)

**Resolvedor único.** `supabase/functions/_shared/campaign-target.ts` — `resolveTarget(admin, planRow, extra)`
devolve `{ ok, target }` ou a resposta de erro. `kind:'event'` é uma EXTRACÇÃO literal
dos antigos passos 2 / 2b / 3 / 4 do `crm-meta-publish-execute` (mesmas queries a
`crm.ad_platform_account_links`, `crm.ad_platform_connections`, `crm_get_meta_decrypted_token`
e `public.events`, mesma ordem, mesmos erros: `ad_account_query_failed`,
`no_active_meta_connection`, `connection_query_failed`, `sem_pagina_facebook`,
`decrypt_failed`, incluindo o fallback explícito a `public.events` e os logs
`EVENT_DEBUG`). O antigo passo 2c (`sem_link_destino`) continua a correr no MESMO
ponto, via hook `onAccountResolved`. `kind:'song'`: conta/token/Página/Instagram vêm
de `planRow.connection_id` (`connection_scope='artist'`, `status='active'`,
`selected_ad_account_id` obrigatório); sem pixel; `page_id` da ligação ou derivado do
prefixo de `effective_object_story_id` mais frequente em `crm.meta_ad_snapshot` e
gravado na ligação; `instagram_user_id` da ligação ou resolvido pela Graph API
(`instagram_business_account` da Página → `instagram_accounts` da conta) e gravado —
escritas na ligação só em preflight ou publicação real, NUNCA em dry_run.

**Autorização (só música).** dry_run e preflight: sessão de utilizador OU service_role.
Publicação real: SESSÃO obrigatória + `public.artist_ads_assert_write(company_id)`
chamada com o cliente do utilizador (admin | platform_admin | manager | marketing_manager).
`service_role` NUNCA publica alvo música (`service_role_nao_publica_musica`, 403).

**Teto fechado por omissão.** `crm.artist_ads_budget_caps` pela ligação. Sem linha →
422 `sem_teto`. Moeda diferente → 422 `moeda_do_teto_diferente`. Diário do plano =
soma dos adsets (lifetime ÷ dias da janela) + diário já comprometido pelos outros
planos de música publicados/activos da mesma ligação. Acima → 422 `acima_do_teto`
com `{ teto, pedido, ja_comprometido, moeda }`. Em dry_run o resultado vai em
`avisos`/`teto` sem bloquear; em preflight e publicação real bloqueia.

**Objectivos sem pixel** (Graph API v18.0, ODAX; Ad Set `destination_type`):
`AWARENESS` → `OUTCOME_AWARENESS` + `REACH` + `IMPRESSIONS` (sem destination_type);
`TRAFFIC` → `OUTCOME_TRAFFIC` + `LINK_CLICKS` + `IMPRESSIONS` + `destination_type=WEBSITE`;
`ENGAGEMENT` → `OUTCOME_ENGAGEMENT` + `THRUPLAY` + `IMPRESSIONS` + `destination_type=ON_VIDEO`
(ON_VIDEO aceita ThruPlay e, ao contrário de ON_POST, não exige `promoted_object`).
Nunca há `promoted_object` de pixel. Qualquer outro objectivo em plano de música →
422 `objetivo_invalido`.

**Naming (só música).** Campanha `[MP] [<TÍTULO-BASE EM MAIÚSCULAS>] [<Alcance|Tráfego|Visualizações>] AAAA-MM-DD`
(título-base por `public.artist_song_base_title`). Conjuntos e anúncios: prefixo
`[MP] ` + o nome que a função já gerava. O naming de evento fica literal.

**UTMs (só música, só com link).** `url_tags` do criativo =
`utm_source=meta&utm_medium=paid&utm_campaign=<slug da campanha>&utm_content=<slug do anúncio>`.
O `link_destino` não é reescrito.

**Post existente.** Anúncio com `existing_post { post_ref, kind }`. `object_story` →
`creative { object_story_id }`; `instagram_media` → `creative { source_instagram_media_id, instagram_user_id }`
(CTA com link só em TRAFFIC; caso contrário aviso `cta_nao_aplicada_em_post_existente`).
`post_ref` que não conste de `public.artist_ads_promotable_posts` do artista com
`meta_ready=true` → 422 `post_nao_promovivel`. Anúncios com `creative_ids` continuam
a usar a biblioteca (exigem `page_id`).

**Estado.** Tudo continua a nascer `PAUSED`, nos dois alvos.

**Lock anti-corrida (só música).** Padrão do `crm-google-publish-execute`: estado
`a_publicar` com `publish_started_at` há menos de 5 min → 409 `ja_em_publicacao`;
antes da 1.ª escrita marca `a_publicar` + `publish_started_at`. Retoma por ids
persistidos, como hoje.

**Ligação à música na criação.** Logo após criar a campanha, upsert em
`crm.meta_campaign_snapshot` com a chave de conflito do sync
(`connection_id,external_campaign_id`) gravando `linked_song_id = plan.song_id` e
`linked_song_locked = true` — a campanha aparece em `public.artist_ads_campaigns`
ligada e trancada sem esperar pelo cron (o sync nunca escreve estas colunas).

**Log.** Criação de campanha, conjuntos e anúncios do alvo música registada em
`crm.meta_entity_actions_log` (`action='create'`, `new_status='PAUSED'`, `performed_by`).
A migração desta fase acrescentou `'create'` ao CHECK de `action`.

**Preflight (`preflight:true`).** Só GETs à Graph API, nada escrito na Meta nem no
plano; devolve `{ ok, preflight:true, checks:[{check, ok, detail}] }`: token válido
com `ads_management`, conta activa e com a moeda do plano, Página acessível, conta de
Instagram resolvida, cada `existing_post` existente e promovível, teto. Disponível
para música e para evento.

**Activação.** `crm-meta-publish-activate` com plano de música → 200
`{ ok:false, error:'alvo_musica_f3' }` sem fazer nada. Evento inalterado.

**Migração (20260919160000):** janela de gasto de `artist_ads_promotable_posts`
alinhada em `date_start >= current_date - 29` (com REVOKE PUBLIC/anon + GRANT
authenticated/service_role, regra D-ERP94); `'create'` no CHECK de
`crm.meta_entity_actions_log.action`; `selected_page_id='385669081539715'` na ligação
`e5d12c36-cd0f-412a-a1c0-22ddbb2a336e` (só se NULL).

**LACUNAS DE EVENTOS registadas, deliberadamente não alteradas:** publicar não
verifica papel; não há lock anti-corrida; o motor não gera UTMs para evento.

**Critério de aceitação:** o dry_run do plano de evento
`93529702-76c7-491f-95dd-040ed7fcee25` tem de continuar a devolver
`md5(payloads::jsonb::text) = 0e2801d625781a22a1e4bb33fb0a0f6d`.

**Fora de âmbito da F2b:** activação (F3), Google, TikTok, front, crons.

### Adenda F2b — correcção: geografia obrigatória no alvo música e UTMs só com destino (19/09/2026)

**Problema (Live, 19/09/2026).** Um `dry_run` de um plano de música sem segmentação saiu com
o targeting por omissão do alvo evento: `geo_locations.countries = ["PT"]`, 18–65. Num alvo
música isso gastaria no país errado em silêncio (o piloto é um artista brasileiro com conta
em BRL). Segundo: o criativo levava `url_tags` com UTMs mesmo sem `link_destino`.

**Regra.** O alvo música **não tem geografia por omissão**: sem país o motor recusa.
Campos do contrato: `publico_sugerido.geo` (países), `publico_sugerido.idade_min`,
`publico_sugerido.idade_max`. Idade em falta continua 18–65 (não era o problema).

- `crm-meta-publish-execute`, `kind:'song'`: publicação real e `preflight` →
  `422 { ok:false, error:'sem_geografia', adset:[…] }`; `dry_run` devolve o payload **sem**
  `geo_locations` (não inventa país) e acrescenta o aviso `sem_geografia`.
- `public.artist_ads_plan_validate`: exige `publico_sugerido.geo` não vazio em cada adset —
  "conjunto N: indica pelo menos um país em publico_sugerido.geo (ex.: [\"BR\"])".
  Assinatura inalterada; `REVOKE PUBLIC/anon` + `GRANT authenticated, service_role` (D-ERP94)
  repostos na mesma migração. Verificado em Live: anon false / authenticated true /
  service_role true.
- `url_tags` só é enviado quando há destino efectivo (`urlTagsFor(nome, link)`).

**Caminho de evento intocado:** o default `["PT"]` e a ordem das chaves do targeting mantêm-se;
o `semGeo` só pode ser verdadeiro quando `isSong`. Prova por hash do `dry_run` do plano
`93529702-76c7-491f-95dd-040ed7fcee25` (`0e2801d625781a22a1e4bb33fb0a0f6d`) feita pelo Pedro.

### Adenda F3 — activação do alvo música: aprovação registada, tetos e porta lateral (19/09/2026)

**Activação = aprovação.** Em `crm-meta-publish-activate`, plano com `song_id`:
exige SESSÃO de utilizador (o service_role nunca activa nem pausa música);
`acao='ativar'` só admin/platform_admin (`public.artist_ads_assert_cap_admin`),
`acao='pausar'` também manager/marketing_manager (`public.artist_ads_assert_write`);
sem papel → `403 { error:'sem_permissao' }`. Aceita `approval_note` (texto opcional).
Quem activa fica registado como aprovador: `activated_by` + uma linha em
`crm.meta_entity_actions_log` (action `activate`/`pause`, prev/new status,
`performed_by` = `approved_by` = utilizador, `approval_note` em `updates_jsonb`).
Falha parcial também vai ao log com `success=false`. No fim actualiza o `status` e
`effective_status` em `crm.meta_campaign_snapshot` **sem tocar** em `linked_song_id`
nem `linked_song_locked`. Ligação e token vêm de `plan.connection_id`
(`connection_scope='artist'`, `status='active'`) — nunca de `ad_platform_account_links`.
Sequência de flips, idempotência por `meta_status` e tratamento de erro: inalterados.

**Teto partilhado.** `supabase/functions/_shared/artist-ads-teto.ts`
(`dailyFromAdsets`, `committedDaily`, `checkTetoDaily`, `checkTetoPlano`) é a fonte
única usada pela publicação, pela activação (só em `ativar`; `pausar` não verifica) e
pelo `crm-meta-entity-action`. Fechado por omissão: sem linha em
`crm.artist_ads_budget_caps` → `422 sem_teto`; diário do plano + diário dos outros
planos de música publicado/ativo da mesma connection > `daily_cap` → `422 acima_do_teto`
com `{ teto, pedido, ja_comprometido, moeda }`.

**Porta lateral fechada (só `connection_scope='artist'`).** Em `crm-meta-entity-action`:
`activate` ou aumento de orçamento (diário ou vitalício) exige admin/platform_admin;
pausar e reduzir aceitam também manager/marketing_manager. Se a entidade pertencer a
uma campanha de um plano de música do motor (`crm.meta_publish_plan.meta_campaign_id`
com `song_id`), activar ou aumentar passa pelo MESMO teto. Campanhas que não são do
motor (gestor de tráfego externo) não contam para o teto nem são bloqueadas por ele —
só a regra de papel. `approved_by` gravado no log nas acções de activação/aumento.
Para `connection_scope='company'` nada muda.

**Preflight fiel.** `crm-meta-publish-execute` ganhou o check `geografia` (cada adset
com `publico_sugerido.geo` não vazio) na lista de checks do alvo música — antes um
preflight de plano sem país não o assinalava porque a recusa está atrás de `!dryRun`
e o `preflight` herda `dry_run=TRUE`.

**Migração (Live).** `crm.meta_entity_actions_log.approved_by`;
`crm.v_ads_entity_actions_log` recriada com `security_invoker=true` a expor
`approved_by` da Meta (REVOKE PUBLIC/anon, GRANT SELECT authenticated/service_role);
`crm.artist_ads_budget_caps_history` + trigger `crm.log_artist_ads_budget_cap`
(`set|update|remove`, RLS: SELECT authenticated por `current_company_id()`, escrita só
service_role/trigger); `crm.artist_ads_plan_daily(jsonb,timestamptz,timestamptz)`;
RPCs `public.artist_ads_budget_cap_set(uuid,numeric,text)` e
`public.artist_ads_budget_cap_remove(uuid)` (só admin/platform_admin — manager e
marketing_manager NÃO definem tetos; moeda = `selected_ad_account_currency`, erro legível
se NULL; `daily_cap > 0`; upsert por `connection_id`); `public.artist_ads_budget_cap_get`
passa a devolver `committed_daily` e `available_daily` no fim. Todas com REVOKE
PUBLIC/anon + GRANT authenticated, service_role (D-ERP94). Baixar um teto abaixo do
comprometido é permitido: não pausa nada, só impede novas activações.

**CHECK de `action`** em `crm.meta_entity_actions_log` (valores actuais, não alterado):
`create`, `pause`, `activate`, `update_budget`, `update_name`, `update_end_time` —
`activate` e `pause` já existiam. LACUNA PRÉ-EXISTENTE REGISTADA, não alterada: o
`crm-meta-entity-action` grava `update_roas_floor`, que o CHECK não aceita.

**LACUNAS DE EVENTOS (registadas, não alteradas):** activação de planos de evento sem
verificação de papel e sem teto; `crm-meta-entity-action` em connections de empresa sem
papel nem teto (só o cap por utilizador em EUR); o motor não gera UTMs para evento;
publicação de evento sem lock anti-corrida.

## D-ERP96 — `cron.job_run_details` tem retenção de 7 dias, purgada por cron em Live e vigiada por invariante (19/09/2026)

**Contexto.** A 19/09/2026 às 13:44 UTC a base ficou indisponível (HTTP 522, sem FATAL no
PostgreSQL): `cron.job_run_details` tinha 3.549 MB / ~3,06 M linhas nunca purgadas e o
pg_cron varre-a inteira a cada arranque, esgotando a instância Small.

**Decisão.**
1. **Retenção de 7 dias** em `cron.job_run_details`, feita pelo cron
   `cron-purge-run-details` em Live (jobid 262, `15 3 * * *`). Crons não vão para o
   repositório: o objecto vive só em Live e entra no `infra.json` do backup global.
2. **Vigiada por invariante:** `cron_run_details_sem_purga` (warn, global, referência 0)
   conta as execuções com `end_time` há mais de 8 dias. Se a purga morrer, a contagem sobe
   e o alerta por desvio dispara.
3. **Consulta:** nunca consultar `cron.job_run_details` sem intervalo de `runid` (a PK) —
   qualquer outro filtro faz seq scan sobre a tabela inteira
   (`.lovable/memory/constraints/cron-job-run-details.md`).
4. **Instância Medium mantida.** Large só com métricas de CPU a justificar, não por
   precaução.
5. **Base única mantida.** Não se separa a base por módulo: o incidente foi uma tabela de
   sistema sem purga, não falta de isolamento.

`net._http_response` (121 MB / 397 linhas, 0 tuplos mortos) fica como está — são corpos de
resposta grandes e o pg_net limpa-os ao fim de 6 h.

## D-ERP97 — Funções `SECURITY DEFINER` fechadas a `anon` por omissão em `public` e `crm` (19/09/2026)

**Contexto.** 114 funções `SECURITY DEFINER` em `public` e 6 em `crm` tinham `EXECUTE`
para `anon`. O inventário completo das chamadas (ERP: 317 `.rpc`, 137 nomes distintos;
portais MP e Coala: zero RPCs) provou que nenhuma é chamada sem sessão. As únicas que
têm de continuar executáveis por `anon` são os helpers usados dentro de políticas de RLS.

**Decisão.**
1. **Revogação dinâmica, sem listas à mão:** a migração percorre as `SECURITY DEFINER` de
   `public` e `crm` cujo nome não aparece em nenhuma política (`pg_policies.qual` /
   `with_check`) e faz `REVOKE EXECUTE ... FROM PUBLIC` e `FROM anon`. `authenticated` e
   `service_role` não são tocados. 105 funções revogadas.
2. **Privilégios por omissão:** `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA
   public|crm REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC`. Função nova nasce fechada a
   anónimos; quem precisar de `anon` — só helpers de RLS — faz `GRANT` explícito na própria
   migração (extensão da D-ERP37).
3. **Guarda na própria migração:** conta as `SECURITY DEFINER` de `public`+`crm`
   executáveis por `anon` e `RAISE EXCEPTION` se passar de 15.
4. **Vigiado por invariante:** `secdef_abertas_a_anon` (warn, global, referência 15), com
   as 15 nomeadas nas notas. Alerta por desvio.

**Prova (19/09/2026).** Antes: 114 em `public` (15 de RLS) + 6 em `crm`. Depois: 15, todas
de RLS (`can_manage_cards`, `can_manage_event_operacao_full`, `can_manage_operacao_etapa`,
`can_see_confidential`, `can_view_event_operacao`, `current_company_id`, `has_permission`,
`has_permission_in`, `has_role`, `is_platform_admin`, `is_public_portal_company`,
`row_belongs_to_current_company`, `storage_path_belongs_to_current_company`,
`user_has_event_access`, `user_supplier_id`); `crm` a zero. Invariante 15/15, conforme.
Teste de fumo com a chave pública: `events_public`, `portal_settings_public` e
`blog_posts_public` 200; inserção em `lead_capture` 201 (linha de teste apagada). O linter
desceu de 319 para 220 avisos.


## D-ERP98 — Geração do plano de tráfego por LLM no alvo MÚSICA (`artist-ads-strategy-generate`)
Data: 19/09/2026 · Frente: audience-meta (módulo Carreira Artística) · Estado: aplicado

**Contexto.** Com a F1/F2/F3 do motor único (D-ERP95) o alvo música já valida, publica e
activa. Faltava a peça de cima: propor o plano. A camada de tráfego do artista é fronteira
fechada — funções `artist-*` não leem `crm.*`.

**Decisão.**
1. Função nova `artist-ads-strategy-generate` (fase 1, sem Graph API). Contrato
   `POST { artist_id, song_id, connection_id, orcamento_diario?, objetivo?, notas? }` →
   `{ plan_id, plano, resumo }`. O plano nasce sempre em `rascunho`; a função nunca publica
   nem activa.
2. **Sessão do chamador, nunca service_role:** cliente com a chave pública + o
   `Authorization` do pedido, porque `artist_ads_plan_create` usa `auth.uid()` em
   `created_by` e valida o papel por `artist_ads_assert_write`. Sem header → 401.
3. **Fronteira:** zero leituras directas a `crm.*`. Tráfego só por RPCs `artist_ads_*`
   (`promotable_posts`, `budget_cap_get`, `campaigns`, `daily`, `ads`, `plan_validate`,
   `plan_create`); comparáveis só pela RPC `song_benchmark_aligned` (nunca a vista).
4. **Coletor partilhado:** o `buildSnapshot` do `artist-song-report` saiu para
   `supabase/functions/_shared/artist-song-snapshot.ts` e as duas funções importam-no.
   Comportamento do relatório inalterado.
5. **LLM:** Lovable AI (`google/gemini-2.5-flash`, temperature 0.3), 429 com um retry,
   402 → `credits_exhausted`, JSON inválido → 502 `ai_invalid_json`.
6. **Normalização determinística depois do LLM** (a saída do modelo não é de confiança):
   objectivo dentro de AWARENESS/TRAFFIC/ENGAGEMENT (fora → AWARENESS + aviso); TRAFFIC só
   com smart link https; `publico_sugerido.geo` nunca vazia (→ `["BR"]`); máximo 3 conjuntos,
   um anúncio por conjunto; `post_ref` obrigatoriamente de `artist_ads_promotable_posts` com
   `meta_ready=true` (nunca inventado); soma dos orçamentos ≤ `available_daily` com corte
   proporcional; mínimo 100 cents/dia por conjunto; `end_time` obriga `start_time` e
   `end_time > start_time`.
7. **Sem DDL:** a justificação vive dentro do próprio plano, em `plano.resumo`
   (`origem`, `modelo`, `gerado_em`, `tokens`, `entradas_usadas`, `justificacao`,
   `hipoteses`, `avisos`), que `artist_ads_plan_create` grava em
   `crm.meta_publish_plan.resumo`. Não se criou tabela de log.

**Erros.** 401 `sessao_invalida` · 403 `sem_permissao` · 422 `sem_teto` /
`sem_publicacoes_promoviveis` / `plano_invalido` · 429 `rate_limited` ·
402 `credits_exhausted` · 502 `ai_invalid_json`.

**Âmbito.** Sem migração, sem alteração de RPCs, sem front, sem Publish. Funções deployadas:
`artist-ads-strategy-generate` (nova, `verify_jwt = true`) e `artist-song-report` (só o
import do coletor).

## D-ERP99 — A edição de campanhas Meta já publicadas (alvo MÚSICA) vive numa função própria de PLANO (19/09/2026)

**Decisão.** A edição ao nível do plano fica em `crm-meta-publish-update`, função nova, e
**não** numa extensão de `crm-meta-entity-action`.

**Motivo.** `crm-meta-entity-action` é a acção de baixo nível por objecto (id externo) e não
conhece o plano: não resolve `crm.meta_publish_plan`, não calcula diff, não redistribui
orçamento pelos conjuntos nem mantém o plano em sincronia. A edição precisa exactamente
disso — resolver o plano, calcular o diff por objecto, re-verificar o teto da ligação de
artista e reescrever o plano com o que a Meta aceitou. Prefixo `crm-*` porque fala com a
Graph API e com `crm.ad_platform_connections`, como as outras duas funções de publicação.

**Âmbito.** Só planos com alvo música (`artist_id` + `song_id`) e `estado` em
`publicado|ativo|pausado`. Plano de evento → 422 `alvo_nao_suportado`: **o caminho de eventos
fica absolutamente inalterado**. Graph API v18.0, a mesma de `crm-meta-publish-execute:31` e
`crm-meta-publish-activate:19`. `dry_run` por omissão TRUE — o diff antes/depois por objecto
sai sem um único pedido de escrita à Meta.

**Altera.** Campanha: `name`, e `daily_budget`/`lifetime_budget` só com orçamento ao nível da
campanha (CBO). Conjunto: `name`, `daily_budget`/`lifetime_budget`, `end_time`, `start_time`
só enquanto não arrancou (se arrancou → aviso `start_time_ignorado`) e `targeting` (geo e
idades), sempre partindo do targeting actual lido por GET e mudando só as chaves pedidas.
Anúncio: só `name`.

**Fora de âmbito (422 legível, sem tentar).** `objetivo`/`buying_type` → `exige_campanha_nova`;
trocar diário↔vitalício num conjunto já a entregar → `exige_campanha_nova`; trocar
publicação/criativo → `nao_suportado_ainda` (fase 2, depende da importação dos criativos do
gestor externo para `crm.meta_creatives`); activar/pausar → `usar_publish_activate`. Esta
função **nunca** muda estado de entrega.

**Papéis.** Cliente anon com o JWT do chamador; `service_role` recusado (403
`service_role_nao_edita`). Orçamento, troca de modo ou alongar a janela de um vitalício →
`artist_ads_assert_cap_admin`; nome, datas, geografia e idades → `artist_ads_assert_write`.

**Teto.** Re-verificado a cada alteração de gasto: linha de `artist_ads_budget_cap_get` da
ligação do plano; pedido diário novo (vitalício ÷ dias da janela) + comprometido dos **outros**
planos da mesma ligação (`committedDaily`, excluindo este) ≤ `daily_cap`. Senão 422
`acima_do_teto` com pedido, comprometido e disponível.

**Plano em sincronia.** Depois do aceite da Meta grava `adsets` (jsonb), `start_time`,
`end_time`, `orcamento_total_cents` e `updated_at`; o `estado` mantém-se. Falha parcial →
grava só o que passou e devolve o resto em `resultado[]`.

**Log — sem DDL.** Uma linha por objecto alterado em `crm.meta_campaign_changes` (tabela já
existente), `change_type` em `name|budget|targeting|schedule|other`, `applied_by_user_id`
sempre do JWT, `triggered_by` do corpo com omissão `user_manual`, inserção best-effort.

**Âmbito técnico.** Sem DDL, sem migração, sem Publish/deploy. `crm-meta-publish-execute`,
`crm-meta-publish-activate` e `crm-meta-entity-action` ficaram intactos; o único código
partilhado reaproveitado é `_shared/artist-ads-teto.ts` (`committedDaily`).

## D-ERP100 — Plano de tráfego da música cita desempenho pago real e geografia só por país (19/09/2026)

Auditoria do plano `36c65cb9-c1e5-4f38-8e1b-f2d73d56b945` (gerado pela v1 de
`artist-ads-strategy-generate`, commit aaa7173) mostrou quatro defeitos. A v2 corrige-os na
própria edge function, **sem DDL e sem migração**.

**1. Desempenho pago é a fonte primária.** O snapshot passa a levar `desempenho_pago`:
agregação por campanha dos 90 dias de `public.artist_ads_daily(artist, 90)` (gasto,
impressões, cliques, video_views, dias com gasto, primeiro/último dia), filtrada às campanhas
da ligação pedida por `artist_ads_campaigns` (a RPC do diário não traz `connection_id`), mais
os anúncios com gasto por `artist_ads_ads` (ThruPlays, visualizações de 3s, CTR, CPC, custo por
ThruPlay em 7d/30d, `creative_id` e permalink da publicação de origem), o período coberto
(min/max dia) e o `last_synced_at` mais recente. Só somas do que as RPCs devolvem — nada
recalculado. O que a base não tem fica em `dados_em_falta` e em `avisos`: alcance e CPM não
existem nas RPCs; ThruPlays/3s/CTR/custo por ThruPlay só existem em 7d/30d; `crm.meta_ad_insights_daily`
não tem breakdown por região, idade ou género. Continua válida a fronteira do módulo: nenhuma
leitura directa de `crm.*`.

**2. Cada escolha cita fonte, número e data.** Regras 9–12 do prompt do sistema. Sem histórico
pago para uma região ou público, o texto tem de dizer "sem histórico pago nesta região" em vez
de inferir. `public.artist_audience_demographics` (só Instagram orgânico) passa a **fonte
secundária**, identificada como tal no snapshot e no texto. Não existe segunda fonte de
geografia (não há ouvintes por cidade/país do Spotify).

**3. Justificação coerente com o orçamento final.** A normalização determinística, depois do
corte proporcional, apaga qualquer entrada de justificação que fale de orçamento com números e
escreve uma entrada nova com a soma final dos conjuntos, o valor por conjunto, o teto, o
comprometido e o disponível.

**4. Geografia só ISO-2.** `publico_sugerido.geo` só aceita códigos de país com duas letras
(omissão `["BR"]`). Cidade ou estado em texto livre é descartado com aviso
`geo_cidade_descartada`; conjunto sem geografia válida cai para `["BR"]`. Motivo: a publicação
e `crm-meta-publish-update` tratam cada entrada como país (`upper()` →
`targeting.geo_locations.countries`), pelo que "Natal, Rio Grande do Norte" viraria um país
inválido. Caminho definitivo até o motor resolver cidade→chave de localização pelo `/search` da
Graph API.

**Saída.** `p_plan.resumo` ganha `fontes` — lista de `{fonte, periodo, ultima_atualizacao}` —
mantendo `origem`, `modelo`, `gerado_em`, `tokens`, `entradas_usadas`, `justificacao`,
`hipoteses` e `avisos`. Contrato inalterado; o plano continua a nascer em `rascunho` e a função
nunca publica nem activa. `crm-meta-publish-execute`, `crm-meta-publish-activate`,
`crm-meta-entity-action`, `crm-meta-publish-update` e o caminho de eventos ficaram intactos.

## D-ERP101 — Geografia por ESTADO (região Meta) no plano de tráfego da música (19/09/2026)

**Decisão.** O plano de música passa a poder estreitar a geografia por estado:
`publico_sugerido.geo_regions = [{nome, key}]`, além de `publico_sugerido.geo`
(países ISO-2), que continua a ser o mínimo obrigatório. Cidades ficam fora
desta versão.

**Quem resolve a chave.** Só a própria `artist-ads-strategy-generate`. O LLM
propõe apenas NOMES de estado em `publico_sugerido.estados`; a função resolve
cada nome por `GET /search?type=adgeolocation&location_types=['region']&q=<nome>&country_code=<país>`
com o token de aplicação (`META_APP_ID|META_APP_SECRET`) — a fronteira do módulo
mantém-se: nenhuma leitura de `crm.ad_platform_connections`. Estado que não
resolva NÃO entra e deixa `geo_regiao_nao_resolvida: … "<nome>"` em
`resumo.avisos`. Sem credenciais de aplicação: nenhum estado entra e fica
`geo_regions_nao_resolvidas`.

**Publicação.** `crm-meta-publish-execute` e `crm-meta-publish-update` enviam
`targeting.geo_locations.regions = [{key}]` mantendo sempre
`geo_locations.countries`. Na edição, as regiões são substituídas em bloco.

**Prompt (artista regional).** Geografia ordenada por CONCENTRAÇÃO (quota da base
por estado), nunca por valor absoluto de cidade; metrópoles fora da região-base
só com evidência de desempenho pago ou de streaming e nunca na 1.ª campanha; o
plano diz "artista regional: base RN/Nordeste" quando os dados o mostrarem;
estreitar idades obriga a citar a distribuição etária real com a data do dado.

**Sem DDL.** `artist_ads_plan_validate` ignora chaves extra em
`publico_sugerido` — `geo_regions` passa sem alteração à RPC.

### Adenda D-ERP101 (v3) — três fontes novas no snapshot da estratégia (19/09/2026)

**Ficheiro.** Só `supabase/functions/artist-ads-strategy-generate/index.ts`.
Zero DDL: a RPC e a vista já existem em Live.

**Fontes novas.**
1. `historico_pago.breakdowns` — RPC `public.artist_ads_breakdowns(p_days=90,
   p_platform='meta', p_breakdown=…)` para `region`, `age`, `gender`,
   `publisher_platform` e `country`. Por linha, o motor deriva CTR
   (cliques/impressões), CPC (gasto/cliques) e CPM (gasto/impressões×1000) e
   guarda o top 10 por impressões de cada dimensão mais a **mediana** da
   dimensão (CTR/CPC/CPM), usada como limiar de evidência.
2. `audiencia.por_estado` — vista `public.v_artist_audience_by_state`, último
   `snapshot_date` por `audience_type` de Instagram: top 10 estados com
   `quota_pct` e soma de quota por `regiao`.
3. `audiencia.por_tipo` — `public.artist_audience_demographics` por
   `audience_type` (`followers`, `engaged`, `reached` quando existirem), com
   `age` e `gender` e quota calculada por dimensão.

**Prompt.** Regras 17–20 novas (as 1–16 mantêm-se): geografia decide-se
PRIMEIRO pelo pago por região e só depois pela concentração orgânica, citando
sempre as duas com números e datas; um estado só entra com quota orgânica ≥ 5 %
OU desempenho pago melhor que a mediana da dimensão `region`, dizendo qual das
duas; idades usam a audiência ENVOLVIDA quando existir (senão `reached`, senão
seguidores), com percentagens citadas; divergência pago vs orgânico vai a
`resumo.avisos`. A regra 10 deixou de dizer que não há corte pago por
região/idade/género — passou a apontar para `historico_pago.breakdowns`.

**Transparência.** `resumo.fontes` lista as três fontes com linhas, período e a
data do dado mais recente, e marca `vazia: true` quando não vêm linhas;
`resumo.avisos` recebe uma linha por fonte vazia e por tipo de audiência em
falta.

## D-ERP102 — F5 TikTok em SANDBOX (motor único, plataforma `tiktok`)

**Ficheiros.** `supabase/functions/_shared/tiktok-ads.ts` (camada TikTok
partilhada), `supabase/functions/crm-tiktok-publish-execute/index.ts` e
`supabase/functions/crm-tiktok-publish-activate/index.ts`, ambas com
`verify_jwt = true` em `supabase/config.toml`. Zero DDL, zero migração, zero
`CREATE OR REPLACE`. Nada nas funções `artist-*` foi tocado — a fronteira
mantém-se: só as `crm-*` leem `crm.ad_platform_connections`.

**Host.** Sempre `TIKTOK_API_HOST` (sandbox:
`https://sandbox-ads.tiktok.com/open_api/v1.3/`). Nunca há escolha de host por
condicional no código; sem a variável definida as funções recusam com
`sem_tiktok_api_host`.

**Autenticação.** Token (`access_token_encrypted` decifrado por
`crm_get_meta_decrypted_token`) + `advertiser_id` (`selected_ad_account_id`),
sem OAuth. Em falta → `sem_advertiser_id` / `sem_token_tiktok` /
`token_tiktok_indecifravel`, nunca excepção genérica. Na ligação piloto
(`947ee0c7…`, `pending_link`) faltam ambos: o dry-run continua e devolve
payloads + hash; a publicação real recusa.

**Regras herdadas do Meta.** Sessão obrigatória para publicar/activar
(`service_role` recusado); `artist_ads_assert_write` para escrever e pausar,
`artist_ads_assert_cap_admin` para activar; teto re-verificado em
`public.artist_ads_budget_cap_get` na linha `platform='tiktok'` da ligação, na
moeda da conta, fechado por omissão (`sem_teto`); naming
`[MP] [MÚSICA] [Objectivo] AAAA-MM-DD` e prefixo `[MP] ` nos conjuntos/anúncios;
ligação campanha→música trancada no espelho (`linked_song_locked = true`, nunca
desligada); plano nasce em `rascunho` e só passa a `publicado` depois de o
TikTok confirmar; lock anti-corrida `a_publicar`; registo em
`crm.ads_entity_actions_log` com `platform='tiktok'`.

**Prova por hash.** O Meta nunca implementou hash de payloads. Aqui o dry-run
devolve `payloads_sha256` (SHA-256 do JSON de campanha+adgroups+ads) para se
comparar o que foi revisto com o que é publicado.

**Criação sempre em pausa.** `operation_status: "DISABLE"` na campanha, nos
adgroups e nos anúncios. Activar/pausar é acto separado: ativar bottom-up
(ads → adgroups → campanha), pausar top-down, via
`{campaign,adgroup,ad}/status/update/` com `ENABLE`/`DISABLE`.

**Geografia e criativo.** Geografia obrigatória na mesma forma do plano
(`publico_sugerido.geo` ISO-2 e, quando existir, `publico_sugerido.geo_regions`),
resolvida em `location_ids` por `GET tool/region/`; sem resolução a publicação
recusa. Criativo = vídeo do próprio artista (`ad_format: SINGLE_VIDEO`,
`anuncio.tiktok_video_id`), sem imagem estática. SPARK ADS fica identificado no
código como o caminho a usar quando a ligação tiver identity `BC_AUTH_TT`
(`identity_type: BC_AUTH_TT` + `tiktok_item_id`) — nesta versão não é exercitado.

## D-ERP103 — Breakdowns de tráfego pago para artistas (19/09/2026)

**Decisão.** `crm-meta-sync-insights` passa a ter um modo opt-in
`{"breakdowns": true, "days": 30, "connection_id"?: uuid}` que alimenta
`crm.ads_insights_breakdown_daily` (já existente em Live) para as ligações de
ARTISTA Meta (`connection_scope='artist'`, `platform='meta'`, `status='active'`,
com `selected_ad_account_id`).

**Porque no mesmo ficheiro.** Reaproveita token (`crm_get_meta_decrypted_token`),
versão da Graph (`v18.0`), paginação e tratamento de erro já provados. Sem
`breakdowns` no corpo, o caminho é byte a byte o de hoje: o desvio é a primeira
instrução após o parse do corpo e devolve antes de qualquer lógica existente.

**Chamadas.** Nível `campaign`, `time_increment=1`, uma chamada por grupo:
(a) `region`, (b) `age,gender`, (c) `publisher_platform`, (d) `country`. A Graph
não aceita juntar grupos geográficos com demográficos na mesma chamada, por isso
são pedidos separados. De `age,gender` grava-se `breakdown='age_gender'` com
`breakdown_value='faixa|genero'` e derivam-se, por soma, as linhas `age` e
`gender` (`raw.derived_from='age_gender'`, para não parecerem resposta da API).

**Resiliência.** Um grupo recusado (combinação inválida, rate limit, upsert
falhado) fica em `notes` e os restantes continuam; nunca aborta a corrida.

**Registo.** Cada corrida em `public.sync_runs` via `_shared/sync-run.ts` com
`function_name='crm-meta-sync-insights:breakdowns'`, `api_calls`, `rows_written`
e `details.notes`. `spend` em cêntimos, `currency` da conta, `raw` com a linha
original, `last_synced_at=now()`, upsert pela chave única da tabela.

**Cron.** `carreira-meta-breakdowns-diario` às 10:20 UTC com
`{"breakdowns":true,"days":3}`, padrão dos restantes crons carreira-* (vault
`email_queue_service_role_key`). Aplicado manualmente em Live — crons não
propagam via Publish.

---

## D-ERP104 — Breakdowns de tráfego pago Google para artistas (2026-09-19)

**Decisão.** `crm-google-sync-campaigns` (a função que alimenta
`crm.google_campaign_insights_daily`) ganha um modo **opt-in**
`{"breakdowns": true, "days": 30, "connection_id"?: uuid}` que escreve em
`crm.ads_insights_breakdown_daily` com `platform='google'`, `level='campaign'`
— mesma tabela e chave única do D-ERP103 (Meta).

**Âmbito.** Só ligações `crm.ad_platform_connections` com `platform='google'`,
`connection_scope='artist'` e `status='active'` (hoje só a do Litto). O caminho
normal (sem `breakdowns` no corpo) fica **byte a byte** igual: o ramo sai antes
de qualquer lógica existente, logo depois do parse do corpo.

**Consultas.** Uma GAQL por grupo, sempre segmentada por `segments.date`
(versão da API: a já usada na função, `v24`):
- `region` — `FROM geographic_view`, `segments.geo_target_region`, com
  `geographic_view.location_type = 'LOCATION_OF_PRESENCE'`
- `country` — `FROM geographic_view`, `segments.geo_target_country`
- `age` — `FROM age_range_view`, `ad_group_criterion.age_range.type`
- `gender` — `FROM gender_view`, `ad_group_criterion.gender.type`
- `device` — `FROM campaign`, `segments.device`

Métricas: `impressions`, `clicks`, `cost_micros` (→ `spend_cents`, micros/10.000),
`video_views` (→ `video_thruplays`), `conversions`. As linhas vêm ao nível de ad
group nos recursos de demografia — somam-se por campanha × dia × valor.

**Nomes de geografia.** `segments.geo_target_region/country` devolvem
`geoTargetConstants/<id>`; resolvem-se a nome com uma consulta
`FROM geo_target_constant WHERE id IN (...)` em lotes de 200. Se a resolução
falhar, fica o ID como `breakdown_value` e a falha vai para `notes` — nunca
trava o breakdown.

**Resiliência.** Recurso/campo não aceite pela versão da API, rate limit ou
upsert falhado ficam em `notes` e os restantes grupos continuam.

**Registo.** `public.sync_runs` via `_shared/sync-run.ts`,
`function_name='crm-google-sync-campaigns:breakdowns'`.

**Cron.** `carreira-google-breakdowns-diario` às 10:25 UTC com
`{"breakdowns":true,"days":3}`, padrão carreira-* (vault
`email_queue_service_role_key`). Aplicado manualmente em Live.

### Adenda D-ERP104 (2026-09-19) — GAQL corrigidas contra v24 (testadas na conta real)

Primeira corrida real deu 400 INVALID_ARGUMENT nos 5 grupos. Testado grupo a
grupo contra o customer 8841388615 (MCC 974-322-1780), v24:

- `metrics.video_views` NÃO existe em v24 (`UNRECOGNIZED_FIELD`) — era a causa
  comum das 5 falhas. Removida; `video_thruplays` fica 0 nos breakdowns Google.
- `customer.currency_code` não é selecionável a partir de `geographic_view`/
  `age_range_view`/`gender_view` — moeda passa a vir de uma consulta própria
  (`SELECT customer.currency_code FROM customer`), uma por ligação.
- `segments.geo_target_country` é incompatível com `geographic_view` — país vem
  de `geographic_view.country_criterion_id`.
- `campaign.name`, `metrics.conversions` e `segments.device` (FROM campaign) são
  aceites; `geographic_view.location_type = 'LOCATION_OF_PRESENCE'` mantido.
- Notes passam de 300 para 2000 caracteres e incluem `errorCode`, `trigger` e
  `location` (fieldPathElements) via `describeGoogleAdsError`.

Corrida validada (days=90, ligação 9256e4eb): rows_written=1688 —
region 951, country 50, age 350, gender 150, device 187; notes vazias.

## D-ERP105 — Snapshot único de dados do artista (2026-09-19)

Novo coletor `supabase/functions/_shared/artist-data-snapshot.ts` com
`buildArtistDataSnapshot({ userClient, artistId, songId?, connectionId?, dias })`.
Junta num só sítio, com fonte e data por bloco: música (artist_songs +
artist_song_metrics_daily + playlists, via o coletor `artist-song-snapshot.ts`),
canais e conteúdo (artist_content + artist_content_metrics_daily), audiência
orgânica (v_artist_audience_by_state por tipo + artist_audience_demographics
age/gender por tipo), histórico pago (artist_ads_campaigns/daily/ads +
artist_ads_breakdowns para **meta E google**, 90 dias, com CTR/CPC/CPM e
medianas por dimensão), comparáveis (song_benchmark_aligned), último relatório
(v_song_report_latest), teto (artist_ads_budget_cap_get) e publicações/criativos
anunciáveis (artist_ads_promotable_posts / artist_ads_creatives, por plataforma).
Fronteira mantida: só `public.*`.

Normalização de geografia obrigatória: nomes de região chegam diferentes por
fonte — Google "State of Pernambuco"/"Ceara", Meta "Pernambuco"/"São Paulo
(state)", Instagram "Cidade, Estado". Todos são resolvidos a UF por
`public.br_estados` (comparação sem acentos, sem prefixo "State of", sem sufixo
"(state)", com fallback à última parte antes da vírgula e à sigla), guardando
`uf`, `nome_original` e `fonte`. `geografia.por_uf` é a tabela única com
pago por plataforma (impressões/cliques/gasto + CTR/CPC/CPM) e quota orgânica —
base da regra de concentração regional. O que não resolve fica em
`geografia.nao_resolvidos` e em avisos.

`artist-ads-strategy-generate` deixa de ter coletor próprio (blocos 2 a 6d
substituídos) e passa a ler do snapshot único; nenhum bloco anterior se perdeu e
entram três novos no prompt: `geografia_por_uf`, `canais` e
`criativos_anunciaveis` (regra 21). `resumo.fontes` passa a ser `dados.fontes`
(bloco, fonte, período, data mais recente, linhas, vazia). A justificação de
orçamento continua a ser reescrita depois da normalização.

`artist-song-report` usa `buildSongSnapshotComFontes`, que devolve exactamente o
mesmo snapshot de sempre + `fontes`. Formato do relatório inalterado.

## D-ERP106 — Importação de criativos do gestor externo (2026-09-19)

Nova edge function `artist-ads-creative-import`
`{ artist_id, connection_id, creative_ids: text[] }` (`verify_jwt = true`), sem
DDL. Os `creative_ids` são `meta_creative_id` da Meta — os que
`artist_ads_creatives` devolve com `importado=false`. Papel de tráfego decidido
por `artist_ads_assert_write(company_id)` na sessão do chamador (service_role é
recusado por não ter `auth.uid()`).

Para cada id lê `crm.meta_ad_snapshot.raw->'creative'` (name, thumbnail_url,
object_type, effective_object_story_id, instagram_permalink_url) do anúncio mais
recente e cria, se não existir, uma linha em `crm.meta_creatives` com
`meta_creative_id` preenchido e **sem** `meta_image_hash`/`meta_video_id` — é
esse o caso em que `crm-meta-publish-execute` reutiliza o criativo inteiro
(`object_story_spec` não é remontado; devolve o aviso
`copy_e_link_nao_aplicados`). `company_id` é o do artista, `type` é mapeado para
o CHECK da tabela e `analysis_jsonb` guarda
`{origin:'meta_ad_snapshot', connection_id, external_ad_id, external_ref,
imported_at, imported_by, …}`. Idempotente pela UNIQUE
`(company_id, meta_creative_id)`; devolve
`[{creative_id, meta_creatives_id, ja_existia}]`.

Auditado em `crm-meta-publish-execute`: a Página/Instagram do criativo
reutilizado **não era validada**. Acrescentado ao preflight o check
`criativo_owner_<uuid>`, que lê
`object_story_spec{page_id,instagram_actor_id}` do criativo e o compara com
`selected_page_id`/`selected_instagram_id` da ligação — falha quando a
identidade difere, avisa (ok) quando o criativo não a expõe ou não é legível.

## D-ERP107 — Estratégia LLM para TikTok em `artist-ads-strategy-generate`

O gerador de planos de tráfego do alvo MÚSICA passa a servir TikTok, mantendo o
caminho Meta byte a byte.

- **Plataforma detectada pela ligação** (`artist_ads_connections(p_artist_id)` →
  `platform`). `google` → 422 `plataforma_nao_suportada`; ligação inexistente →
  422 `ligacao_nao_encontrada`.
- **Snapshot** (`buildArtistDataSnapshot`) continua a ler histórico pago de
  **Meta + Google** (é o único que existe); `plataformaCriativos = plataforma`.
  No ramo TikTok entra o aviso `sem histórico pago TikTok`.
- **Publicações**: `artist_ads_promotable_posts(p_artist_id, plataforma)`. Para
  TikTok são vídeos (`post_kind='tiktok_video'`, `post_ref` = id do vídeo,
  `meta_ready = external_id IS NOT NULL`); ordenados com os ligados à música
  primeiro e cortados a `MAX_VIDEOS_TIKTOK = 40`.
- **Prompt**: `SYSTEM_PROMPT_TIKTOK` próprio (objetivos `REACH|VIDEO_VIEWS|TRAFFIC`,
  sem headline/corpo/cta/existing_post, `anuncios: [{ tiktok_video_id }]`). As
  regras 9–21 (fontes, concentração regional, evidência pago/orgânico, idades)
  mantêm-se.
- **Normalização**: objetivo de omissão `VIDEO_VIEWS`; mínimo **2000 cents/dia**
  por conjunto (× dias com janela); `geo` ISO-2 obrigatória; `geo_regions` fica
  **lista de nomes de estado** (os `location_ids` são resolvidos por
  `crm-tiktok-publish-execute`, sem tocar na Meta); um anúncio por conjunto, com
  `tiktok_video_id` só da lista de promovíveis (nunca inventado).
- **Gravação**: `artist_ads_plan_create(..., p_platform: plataforma)`.
- **LIMITAÇÃO CONHECIDA (DDL POR AUTORIZAR)**:
  `public.artist_ads_plan_validate` é IMMUTABLE e só aceita objetivo
  `AWARENESS|TRAFFIC|ENGAGEMENT`; `artist_ads_plan_create` **chama-a por dentro**.
  Logo, um plano TikTok com `REACH`/`VIDEO_VIEWS` é recusado na gravação. A RPC
  **não foi alterada**: a função devolve 422
  `rpc_objetivo_tiktok_nao_aceite` com a mensagem explícita. Planos TikTok com
  objetivo `TRAFFIC` gravam hoje sem qualquer alteração de base.
- `resumo.entradas_usadas` ganha `plataforma` e `videos_promoviveis`
  (`{total, ligados_a_musica}`); `resumo.fontes` inalterado.

### D-ERP107 (adenda) — análise dos vídeos TikTok e estratégias ousadas

Bloco novo `analise_videos_tiktok` em
`supabase/functions/_shared/tiktok-video-analysis.ts` (`analisarVideosTiktok`),
usado SÓ quando a plataforma do plano é `tiktok`. Lê apenas
`public.artist_content` (platform='tiktok', content_type='video', 180 dias) e
`public.artist_content_metrics_daily` (views/likes/comments/shares), com a
sessão do chamador.

Por vídeo: id TikTok, permalink, data, duração, legenda, som
(`sound_name`/`sound_external_id`), `song_id` + `ligado_a_musica`, métricas do
último snapshot, crescimento 7d e 30d (diferença entre snapshots), taxa de
interação, partilhas/views, views/dia e dias desde a publicação. Devolve top 15
por views, top 10 por interação, top 10 por crescimento 7d, os vídeos da música
piloto e padrões (duração média do top vs resto, sons e palavras/hooks mais
frequentes no top), com fonte, período e data.

`artist_content` **não guarda métricas correntes** — sem séries em
`artist_content_metrics_daily` o bloco sai vazio e deixa aviso explícito; nunca
se estima.

Prompt TikTok ganhou as regras 23–28: mandato de ousadia ancorada em número com
data, escolha do criativo pela análise dos vídeos, Spark Ads (vídeo orgânico
existente), apostas obrigatoriamente diferentes entre conjuntos (incluindo
concentrar a verba num vencedor) e **gatilho de 72 h numérico por conjunto**.
Formato: `anuncios: [{ tiktok_video_id, porque }]`, `adsets[].aposta`,
`resumo.hipoteses[].gatilho_72h`.

Normalização: `geo_regions` validada contra `public.br_estados` com comparação
sem acentos (devolve o nome oficial; estado inexistente sai com
`geo_regiao_nao_resolvida`; `br_estados` indisponível → nomes passam como vêm,
com aviso). `resumo.entradas_usadas` ganha `videos_analisados`,
`videos_ligados_a_musica` e `series_diarias_tiktok`; `resumo.fontes` ganha o
bloco `analise_videos_tiktok`.

## D-ERP108 — Publicação de campanhas de VÍDEO no YouTube (Google Ads API)

Fase F4 do motor único de campanhas. Espelho exacto do TikTok (D-ERP107) para o Google.

**Nomes novos, não reutilizados.** `crm-google-publish-execute` / `crm-google-publish-activate`
JÁ EXISTEM e publicam campanhas de PESQUISA (SEARCH_STANDARD, keywords, adGroupCriteria).
Reutilizar esses nomes destruía o publisher de Search → criadas
`crm-google-video-publish-execute` e `crm-google-video-publish-activate`.

- API: `v24` (`_shared/google-ads.ts`, `GOOGLE_ADS_API_VERSION`). Auth igual ao sync
  (service account `GOOGLE_SA_KEY_JSON`, developer token, `login-customer-id` do MCC).
- Campanha `advertising_channel_type=VIDEO`, criada sempre em `PAUSED`; activação só na
  `-activate` (bottom-up a activar, top-down a pausar), com `artist_ads_assert_cap_admin`.
- Tipo de grupo: `VIDEO_RESPONSIVE` + `videoResponsiveAd` nos dois objectivos —
  `VIDEO_VIEWS` com `targetCpv`, `REACH` com `targetCpm`.
- `TRAFFIC` NÃO é suportado em VIDEO neste módulo → 422 `objetivo_nao_suportado_google`.
- Orçamento: `campaign_budget.amount_micros = orcamento_cents * 10000`, mínimo 500 cents/dia
  por conjunto, moeda da conta. Teto re-verificado em `artist_ads_budget_cap_get`.
- Vídeo: `youtubeVideoAsset.youtubeVideoId` = `anuncios[].youtube_video_id` (post_ref da
  galeria). Vídeo privado/não elegível → `video_nao_elegivel`.
- Público: país por `COUNTRY_GEO_TARGETS`, estados resolvidos por nome com
  `GeoTargetConstantService.suggest` (locale pt, targetType State), idades por `ageRange`,
  língua pt.
- Resource names em `crm.meta_publish_plan.external_campaign_id` + `resumo.publicacao_google`
  (`budget_resource`, `campaign_resource`, `customer_id`, `api`); log em
  `crm.ads_entity_actions_log` (platform='google'); dry-run devolve payloads + `payloads_sha256`.
- Erros novos: `developer_token_sem_acesso_basico`, `video_nao_elegivel`,
  `conta_google_invalida`, `sem_token_google`, `objetivo_nao_suportado_google`,
  `ligacao_nao_google`, `google_rejeitou`.
- `artist-ads-strategy-generate` ganhou ramo YouTube: análise dos vídeos via
  `_shared/tiktok-video-analysis.ts` generalizado (`platform: 'youtube'`, content_type
  video|short), `SYSTEM_PROMPT_GOOGLE` (REACH|VIDEO_VIEWS, `anuncios[].youtube_video_id`,
  `geo_regions` por nome de estado validado em `br_estados`), mínimo 500 cents/dia,
  `entradas_usadas.plataforma` e bloco `analise_videos_youtube` em `resumo.fontes`.
  A validação passa outra vez SEMPRE por `artist_ads_plan_validate` (a DDL já aceita
  REACH|VIDEO_VIEWS); o desvio local do TikTok foi removido.
- Fronteira mantida: `crm-*` lê `crm.ad_platform_connections`, `artist-*` nunca.

### D-ERP109 — Métricas de vídeo do Google Ads nas contas de ARTISTA (set/2026)
**Decisão:** função nova `crm-google-video-metrics-sync`, isolada do `crm-google-sync-campaigns`
(caminho de eventos intacto) e sem qualquer DDL — só escreve em colunas `jsonb` já existentes.
- **Nomes CONFIRMADOS em runtime** pelo `GoogleAdsFieldService` (sem cláusula `FROM`, que essa
  service não aceita) antes de qualquer pedido. Em **v24**:
  `metrics.video_views` **NÃO existe** → chama-se `metrics.video_trueview_views`;
  `metrics.average_cpv` → `metrics.trueview_average_cpv`;
  `metrics.video_view_rate` → `metrics.video_trueview_view_rate`;
  existem `metrics.video_quartile_p25/p50/p75/p100_rate`, `metrics.engagements`,
  `metrics.unique_users`, `metrics.average_impression_frequency_per_user`.
- **Normalização nossa:** `raw->'metrics'` guarda os nomes da API, e `raw.video_views`
  (chave de topo, inteiro) é sempre escrita — é essa que `public.artist_ads_daily` lê.
  `raw.video_views_field` diz de que métrica veio.
- Configuração da campanha em `crm.google_campaign.raw.config` (canal/sub-canal, frequency caps,
  video ad inventory control, start/end, critérios LOCATION +/- com nome canónico resolvido pelo
  `geo_target_constant`, LANGUAGE, idades, géneros, dispositivos com bid modifier).
- Alcance/frequência em `crm.google_campaign.metrics.alcance`, dois blocos (`ultimos_7_dias`,
  `ultimos_30_dias`) com período e `recolhido_em` — estas métricas não segmentam por dia.
- `crm.google_ad_group` sincronizado para campanhas `advertising_channel_type='VIDEO'`
  (o `type` do grupo é o que diz o formato: bumper, in-stream não ignorável, etc.).
- Âmbito: ligações `platform='google'` com `connection_scope='artist'`. Corrida registada em
  `sync_runs` (`crm-google-video-metrics-sync`); `{"probe_only":true}` só confirma nomes.
**Adenda (2026-09-20) — colunas próprias, o cron de 3h já não apaga nada.**
Causa: o cron 242 (`crm-google-sync-campaigns-3h`, `10 */3 * * *`) faz upsert das mesmas
linhas de `crm.google_campaign_insights_daily` e substitui `raw` e `metrics` por inteiro,
por cima do que esta função escrevia. Só `crm.google_ad_group` sobrevivia (tabela à parte).
Regra passa a ser: **cada escritor é dono das suas colunas; nunca dois syncs a escrever o
mesmo jsonb** (o upsert do supabase-js só escreve as colunas do payload, logo colunas
novas ficam protegidas por construção).
Colunas novas: `crm.google_campaign_insights_daily.video_metrics`,
`crm.google_campaign.settings` (antigo `raw.config`) e `crm.google_campaign.reach`
(antigo `metrics.alcance`).
`video_metrics` = `{ video_views, campo_visualizacoes, view_rate, quartil_p25/p50/p75/p100,
cpv_medio_micros, engagements, api_version, recolhido_em }` — só as métricas confirmadas
pelo `GoogleAdsFieldService`; ausentes ficam de fora, nunca a zero inventado.
Em linhas que já existem só se escreve `video_metrics` (UPDATE por
`connection_id + external_campaign_id + date_start`); a linha completa só é inserida quando
não existir. `crm-google-sync-campaigns` **não foi alterada** (serve também os eventos) e não
inclui `video_metrics`, `settings` nem `reach` em nenhum payload.
`public.artist_ads_daily` e `public.artist_ads_campaigns` passaram a ler
`coalesce(i.video_metrics->>'video_views', i.raw->>'video_views')`.
Cron desta função (criado em Live pelo Pedro): `crm-google-video-metrics-3h`,
`'20 */3 * * *'`, corpo `{"days":7}` — dez minutos depois do job 242.

**Estado:** vigente.

## D-ERP110 — Demografia envolvida/alcançada do Instagram (timeframes e notas)
Data: 2026-09-20. Sem DDL, sem OAuth, sem mudança de host.

`artist-instagram-sync` (Graph v25.0, graph.instagram.com, nó `me`):
- `engaged_audience_demographics`: timeframe `this_week` e, se vier vazio, `this_month` uma vez.
  Nunca mais `last_14_days/last_30_days/last_90_days/prev_month` (retirados na v20.0).
- `reached_audience_demographics`: pedida com `this_week`; se a API recusar a métrica,
  nota única e não se repete por breakdown (helper `metricUnsupported`).
- `sync_runs.details.artists[].demographics_raw`: um corpo cru por métrica, truncado a
  1000 caracteres, sem token (`rawSample`).
- Notas distinguem: "sem dados (breakdown sem results; causa por confirmar)",
  "métrica não suportada nesta versão da API" e "erro".
- `follower_demographics` intocada.

Prova (corrida real 2026-09-20 00:11 UTC, 304 linhas): as duas métricas respondem 200 —
`total_value.breakdowns[0]` vem com `dimension_keys` mas SEM `results`. O corpo cru prova
o breakdown vazio, NÃO prova a causa; o mínimo de 100 interações é hipótese documentada
pela Meta, a confirmar com a evidência recolhida (ver adenda).

### Adenda (2026-09-20) — insights de conta e evidência da demografia
- Achado A: `views`, `accounts_engaged`, `total_interactions` e `profile_links_taps` NUNCA
  foram gravadas — pedidas com `period=day` sem `metric_type`, a v25.0 responde 200 com
  `data` vazia. Passam a ser pedidas com `metric_type=total_value` (`reach` fica intocada,
  para não alterar a série existente).
- Fim do silêncio: resposta ok sem `values` nem `total_value` gera a nota
  "insight &lt;métrica&gt; sem valores na resposta (pedido: period=day, metric_type=…)".
  Métrica sem valor continua a não ser gravada.
- Demografia: por cada timeframe tentado que veio vazio, UMA chamada a
  `total_interactions` (`metric_type=total_value`) na janela equivalente (this_week → 7
  dias, this_month → 30 dias), máx. 1 por timeframe por ligação; o valor entra na nota
  ("total_interactions na janela de N dias: X" ou "…não obtido (motivo)"). A função não
  tira a conclusão.
- `reached_audience_demographics` É aceite na v25.0; apenas não consta da página de
  referência consultada. Comentário no código corrigido.
- `artist_metrics_daily` não tem CHECK sobre o nome da métrica (só sobre `platform`), logo
  as quatro métricas novas gravam sem DDL.

## D-ERP111 — Nível ANÚNCIO das campanhas de vídeo do Google Ads (set/2026)

Âmbito: só `supabase/functions/crm-google-video-metrics-sync`. Sem DDL (o schema de
`crm.google_ad` e o CHECK de `breakdown='none'`/`level='ad'` foram aplicados em Live
pelo Pedro). Nada de Meta, eventos, `crm-google-sync-campaigns` ou publicadores.

Nomes CONFIRMADOS em runtime pelo GoogleAdsFieldService (v24), nada assumido da
documentação: `ad_group_ad.ad.{id,name,type,resource_name,final_urls}`,
`ad_group_ad.{status,resource_name}`, `ad_group_ad.ad.video_ad.video.asset`,
`ad_group_ad.ad.video_responsive_ad.videos`, `asset.youtube_video_asset.{youtube_video_id,
youtube_video_title}`, `ad_group_ad_asset_view.{field_type,ad_group_ad}`.

Vídeo do YouTube: `ad_group_ad_asset_view` com `field_type='YOUTUBE_VIDEO'` devolve
ZERO linhas nesta conta (fica nota explícita). A via que funciona é o recurso de asset
referido pelo próprio anúncio (`video_ad.video.asset` / `video_responsive_ad.videos`)
resolvido contra `FROM asset WHERE asset.type='YOUTUBE_VIDEO'`. 67 de 69 anúncios
ficaram com `youtube_video_id` + `youtube_video_title`.

Propriedade de colunas (regra de 20/09: cada escritor é dono das suas colunas):
- `crm.google_ad` — tabela exclusiva desta função, upsert por
  `(connection_id, external_ad_id)`.
- `crm.ads_insights_breakdown_daily` com `platform='google'`, `level='ad'`,
  `breakdown='none'`, `breakdown_value='none'` — linhas exclusivas desta função;
  `level='campaign'` e `platform='meta'` nunca são tocadas.
  `spend_cents` = `costMicros/10000`; métricas de vídeo (visualizações, quartis, CPV,
  engagements) dentro de `raw.video_metrics`; `video_thruplays` = visualizações.

Prova (ligação 9256e4eb, customer 884-138-8615, `days=30`): 69 anúncios / 67 com vídeo;
6 dias com entrega; `spend_cents` do nível anúncio igual ao da campanha em 5 dos 6 dias
(19/09 difere 4.796 cêntimos porque a linha de campanha desse dia foi escrita numa
corrida anterior do sync dono dessa coluna e não é reescrita aqui);
`ads_insights_breakdown_daily` passou de 1688 google/campaign + 3570 meta/campaign para
os mesmos valores + 6 linhas google/ad.

## D-ERP112 — FÃS (Instagram) ≠ OUVINTES (Spotify) na geografia orgânica (20/09/2026)

`public.artist_audience_demographics` passou a ter duas audiências orgânicas por estado:
`platform='instagram'` (fãs: followers/engaged/reached) e `platform='spotify'`
(`audience_type='listeners'`). O snapshot `_shared/artist-data-snapshot.ts` deixa de
filtrar a Instagram: `audiencia.por_estado` e `audiencia.por_tipo` passam a ter chave
`"<platform>.<audience_type>"`, com atalhos `audiencia.fas` e `audiencia.ouvintes`
(null quando a fonte não existe), e `fontes[]` separa as entradas por plataforma com a
data de cada uma.

`agregarGeoPorUf` classifica o orgânico por um conjunto de fontes (`FONTES_ORGANICAS =
instagram, spotify`) e guarda-o POR FONTE — antes tudo o que não era "instagram" caía na
coluna de gasto. A tabela por UF expõe `quota_fas_pct` (Instagram) e `quota_ouvintes_pct`
(Spotify); `quota_organica_pct` mantém o valor do Instagram por compatibilidade. Em
`artist-ads-strategy-generate`, o OBJETIVO decide o peso: streams/plays → ouvintes;
comunidade/alcance local/shows → fãs; a justificação cita qual usou, com número e data, e
assinala a discordância (Litto: RN 46,4 % dos seguidores contra 2,6 % dos ouvintes).

## D-ERP113 — Receita do fechamento: por bucket, o real substitui o BP; sem real, o BP alimenta (#226)

Por bucket de receita (bilheteira / A&B / patrocínio / outros, pelo código da rubrica), o
REAL substitui o BP; sem real nesse bucket, as linhas de BP de receita aprovadas
(`type='income'`, `status='approved'`, `version_id IS NULL`, sem `is_transitory`,
`exclude_from_result`, `is_overhead`) alimentam-no. Nunca `max(real, previsto)`, nunca soma.
Real de bilheteira = `ticket_sales` (com a anti-duplicação 1.1.01 já existente); real dos
outros buckets = transações income válidas (`isValidFechoTransaction`).

Substitui a leitura absoluta do D24 ("o fecho nunca usa receita prevista") — o BP só entra
onde não há real, nunca por cima dele. Núcleo único:
`supabase/functions/_shared/settlement/settlement-revenue.ts` (`computeSettlementRevenue`),
reexportado em `src/lib/settlement-revenue.ts`.

Perímetro (D25 g3): a linha de BP de receita com `event_settlement_id` que alimentou um
bucket sem real entra nas `markedLines` como `kind: "bp", type: "income"` — só nesse caso.

Regressão que motivou: FestVybbe 2026 (evento histórico só com BP) mostrava receita 0,00 € e
resultado −359.011,85 €, quando o correcto é receita s/IVA 318.102,83 € e −40.909,02 €.

## D-ERP114 — Depois do evento, as sintéticas de bilheteira e A&B são o real (#227) (20/09/2026)

Adenda ao D21 e ao D24. O previsto corrente de bilheteira (`computeLiveTicketForecast`)
e o de A&B (cenário forecast do módulo A&B) só valem ATÉ à data do evento. Depois dela,
o "Previsto + excedido" colapsa para o realizado nesses dois buckets: um previsto acima
das vendas reais num evento já realizado não é "excedido", é uma previsão que não se
cumpriu, e não pode figurar como receita na capa nem no Lucro.

"Realizado" = `events.status = 'completed'` OU a última data do evento já passou
(a própria `events.date`; num Master, a maior data entre o Master e os sub-eventos;
comparação por dia, em data local). Helper puro `isEventRealized` em
`src/lib/event-realized.ts`; flag `eventRealized` em `computeRevenueBasisFromRows`
(anula `ticketForecast` e `abForecastNet` antes de decidir as sintéticas) e em
`computeEventRevenueBasis` (que a calcula quando não lhe é dada, e nesse caso nem corre
o simulador). As sintéticas do separador Business Plan (1.1.01 e 1.1.03) seguem a mesma
regra no previsto CORRENTE; o previsto ORIGINAL (`ticketing_baseline_net`,
`ab_baseline_net`) não muda.

Patrocínios ficam fora (D22 já trata o encerramento por `sponsorship_closed_at`) e os
eventos importados só com BP não mudam: sem sintética, as linhas de BP continuam a
alimentar o bucket (#220/#225). A grelha `/eventos` não precisa da flag (já não corre o
simulador) — é por isso que a capa passou a bater com a grelha nos eventos realizados.

## D-ERP115 — Retenção de identificadores de tráfego: 180 dias, anonimizar (nunca apagar) — #75 (20/09/2026)

Eventos de tráfego pago com mais de 180 dias perdem os identificadores técnicos, sem
perder a linha: `public.leads` com `kind = 'redirect_click'` → `ip_inet`, `user_agent`,
`fbc`, `fbp`, `mp_click_id` a NULL; `crm.google_click` → `gclid`, `gbraid`, `wbraid`,
`user_agent` a NULL (a tabela não tem `ip_inet`). Datas, evento, UTMs, país e região
ficam intactos — a analítica histórica não muda.

Motor: `public.anonymize_traffic_events(_days integer default 180)` (SECURITY DEFINER,
só `service_role`, sem `EXCEPTION WHEN OTHERS`, devolve as duas contagens) + cron diário
`traffic-events-anonymize` às 03:40 UTC. Primeira execução real deu (0, 0) — nenhuma
linha tinha ainda 180 dias.

## D-ERP116 — Métricas de conta do Instagram: um valor por DIA FECHADO (21/09/2026)

As quatro métricas de conta pedidas com `metric_type=total_value` — `views`,
`accounts_engaged`, `total_interactions`, `profile_links_taps` — eram pedidas com a
janela `since=ontem, until=hoje`. A Graph API inclui os dois extremos, por isso cada
`metric_date` guardava o total de ~2 dias e crescia durante o dia seguinte (prova:
`views` de 2026-09-19 tinha 78.515 às 00:45 UTC de 20/09 e 99.562 depois do cron das
09:20 UTC do mesmo dia). Os valores não eram somáveis nem comparáveis entre dias.

Passam a ser pedidas UMA VEZ POR MÉTRICA E POR DIA, com a janela do próprio dia
(`since = until = dia`), e gravadas com `metric_date = dia`. Só dias já fechados
(`hoje - 1`, `hoje - 2`, …), número configurável no corpo (`dias_metricas`, omissão 3,
mínimo 1, máximo 30). Nunca se grava um valor cuja janela inclua hoje, e nunca se
regressa à janela de 2 dias como recurso: erro ou resposta sem valores → nada gravado
e nota em `notes` com o dia, a janela e a mensagem da API. Cada valor gravado aparece
em `insights_por_dia` do resumo por ligação, com `{ metrica, dia, since, until, valor }`.
O laço novo conta para `INVOKE_BUDGET_MS`; esgotado o tempo, para e deixa nota com os
dias em falta.

`reach` fica como estava (`period=day`, sem `metric_type`, série diária real com
`end_time`), para não alterar a série existente.

Nada se apaga: os valores gravados antes de hoje com a janela de 2 dias ficam
corrigidos à medida que os dias forem recolhidos outra vez (o upsert tem chave
`artist_id,platform,metric,metric_date,source`), e por omissão cada corrida recolhe
os 3 últimos dias fechados.

## D-ERP117 — Demografia de audiência: a coluna `unit` manda, contagens e percentagens nunca se somam (21/09/2026)

`public.artist_audience_demographics` passou a ter `unit text not null default 'count'`
com CHECK (`count`|`pct`). O TikTok entrega quotas já em percentagem (18 linhas com
`unit='pct'` no snapshot de 2026-09-20, `followers` e `reached`, dimensões
gender/age/country) ao lado das contagens do Instagram e do Spotify. Somar 54 (pct) com
25.000 (count) dá um número sem sentido.

Snapshot (`supabase/functions/_shared/artist-data-snapshot.ts`, bloco «3) AUDIÊNCIA
ORGÂNICA»): o `select` e cada linha de `linhas_demografia` trazem `unit`; em `porDim` o
total é calculado SÓ sobre as linhas `unit='count'` (quota = valor / total das
contagens), e as linhas `unit='pct'` são a própria quota (`quota_pct = valor`,
`valor: null`); cada entrada leva o seu `unit`. Valores de `unit` diferentes nunca se
somam — nem dentro da dimensão, nem entre dimensões. Cada grupo de `por_tipo`
(`"<platform>.<audience_type>"`) traz `unidades` com os `unit` presentes e, quando traz
os dois, entra um aviso em `avisos` com plataforma, tipo e dimensões. O `_fonte` do
bloco `audiencia` diz que a demografia traz contagens e percentagens lado a lado,
distinguidas por `unit`, e que não se somam.

Prompts (`artist-ads-strategy-generate`, nos três blocos de regras, e
`artist-song-report`) ganharam a MESMA regra, com as mesmas palavras: os números de
audiência vêm com `unit`; `pct` é já uma quota da plataforma e nunca se soma nem se
compara com `count`; ao citar um número de audiência tem de se dizer a plataforma, o
tipo de audiência, a data do snapshot e, quando for percentagem, que é percentagem.
O snapshot do relatório de lançamento (`artist-song-snapshot.ts`) também passa `unit`
(e a plataforma) em cada entrada da demografia.

`public.v_artist_audience_by_state` não foi tocada (só usa `dimension='city'`, sempre
contagens). Sem DDL, sem migrações, sem alterações em `crm.*` nem em vistas; só campos
novos — nenhum formato existente mudou.

## D-ERP118 — Sonda de leitura ao «Get local streaming audience» da Soundcharts (21/09/2026)

A edge function `soundcharts-sync` ganhou um modo de diagnóstico activado por
`sonda: true` no corpo do pedido (exige `artist_id`). Faz UMA chamada GET a
`/api/v2/artist/{uuid}/streaming/spotify` (o uuid vem de `artist_channels`
platform='aggregator', como no fluxo normal) e devolve apenas: URL pedido (sem
credenciais), código HTTP, mensagem de erro se houver e, em 200, a contagem de
itens e as primeiras chaves do primeiro item.

É um caminho à parte que sai ANTES de `startSyncRun`: nunca grava em
`artist_audience_demographics`, `artist_metrics_daily` nem `sync_runs`, e o
comportamento normal da função fica intacto.

Serve para saber se o plano Soundcharts actual inclui o endpoint «Get local
streaming audience» (a referência documenta 403 "This endpoint is not included
in your current plan") — a geografia de ouvintes do Spotify (top 50 cidades,
«Where people listen») depende dele, e a decisão de upgrade (uma compra) depende
deste código de resposta.

## D-ERP119 — Falhas Soundcharts deixam rasto e o HTTP 429 trava a corrida (21/09/2026)

Todas as chamadas passam a conservar no erro o código HTTP e o início da mensagem
da Soundcharts. Uma corrida que termine com erro grava sempre esse conteúdo em
`sync_runs.error_text` e nas notas/detalhes da resposta; deixa de existir falha
Soundcharts sem causa legível.

O HTTP 429 é terminal para a corrida: não se pede o artista, música, plataforma ou
página seguinte. O que já foi apurado pode ser gravado, a execução termina com
`quota Soundcharts esgotada (429)`, a mensagem da API e a quantidade de itens que
ficou por tratar. O travão reduz desperdício depois de esgotar a quota mensal; não
altera crons nem a cadência, que continuam a depender de decisão operacional.

## D-ERP120 — Top 5 da demografia por plataforma × unit, ordenado por quota (21/09/2026)

O bloco `demografia` do snapshot do relatório de lançamento
(`_shared/artist-song-snapshot.ts`) deixou de misturar plataformas e unidades na
mesma lista. O corte nos 5 primeiros faz-se AGORA por grupo plataforma × `unit`,
ordenado por quota e nunca pelo valor bruto:

- linhas `unit='count'`: `quota_pct = valor / total das contagens do grupo`;
- linhas `unit='pct'`: a quota é o próprio valor e `valor` sai `null`.

Nada se soma nem se compara entre plataformas nem entre unidades.

Forma do bloco depois da alteração (chaves antigas mantidas; novas acrescentadas):

```text
demografia: {
  snapshot: string,                        // snapshot_date mais recente
  top_cidades: DemoEntrada[],              // top 5 da plataforma com mais linhas
  top_cidades_plataforma: string | null,   // qual é essa plataforma
  top_faixas_etarias: DemoEntrada[],       // idem
  top_faixas_etarias_plataforma: string | null,
  top_cidades_por_plataforma: [{ platform, unit, entradas: DemoEntrada[] }],
  top_faixas_etarias_por_plataforma: [{ platform, unit, entradas: DemoEntrada[] }],
}
DemoEntrada: { chave, platform, unit, valor: number|null, quota_pct: number }
```

Sem DDL, sem migrações, sem tocar em `crm.*`. Motivo: desde 20/09/2026 há linhas
`unit='pct'` do TikTok (age/gender/country) ao lado das contagens do Instagram e
do Spotify; o corte por valor bruto deitava fora as percentagens e misturava
plataformas na mesma lista.

## D-ERP121 — A captação do Madrid corre no servidor; o Chrome fica como recurso morto (21/09/2026)

As vendas do **H&K Madrid** (`bf9ce2d8-754e-4485-8427-e2d486c39919`) passam a ser captadas
pela edge function **`fetch-onebox-dashboard`**, com login próprio no painel Superset da
Onebox (secrets `ONEBOX_DASH_USER` / `ONEBOX_DASH_PASSWORD`), cron **`onebox-sync-hourly`**
(jobid 349, `35 * * * *`, 24 horas por dia). O modelo anterior — duas tarefas agendadas a
ler o painel com a sessão do Chrome do Pedro, uma para captar e outra só para manter a
sessão viva — fica documentado como **recurso morto, não como fonte**.

Motivo: a sessão do browser expira sozinha em poucas horas e prende os dados ao portátil
do Pedro. Na manhã de 21/09 falhou cinco vezes (01:09, 10:09, 11:08, 12:09, 13:09), todas
com "sessão da Superset expirada, 401 em `/api/v1/me/`", deixando os números parados desde
a meia-noite. Provou-se que uma edge function se autentica sozinha: `GET /login/` com
`csrf_token`, `POST /login/` → 302, `/api/v1/me/` → 200, `/api/v1/dashboard/43` → 200, sem
bloqueio por IP — ao contrário de `tickets.oneboxtds.com` (403 a servidores) e da Fever
(401 a servidores). Deixa de ser preciso esperar por acesso de API da GTS.

Desenho: descoberta dinâmica dos gráficos do dashboard 43 (slice 180 "Ventas por Sesion"
para grelha e série; slices 186 e 1723 para o resumo), **conferência tripla obrigatória**
(grelha = série = resumo, ao cêntimo) como trava de escrita, e escrita em `ticket_sales`,
`onebox_daily_sales` e `onebox_sync_runs`. Primeira corrida real com o cron criado, às
14:07 de Madrid: 1.271 bilhetes e 65.581,75 €, contra 1.257 e 64.366,75 € do último
registo deixado pelo Chrome.

**Armadilha que faz parte da decisão: a função assume `dry_run` quando o parâmetro NÃO é
enviado.** O primeiro cron foi criado sem ele e teria corrido de hora a hora a dar sucesso
sem gravar nada. O corpo do pedido TEM de levar `"dry_run": false` explícito.

## D-ERP122 — `artist_ads_ads` com plataforma e `artist_ads_campaign_settings` (21/09/2026)

`public.artist_ads_ads` passou a aceitar `p_platform` (omissão `'meta'`); com `'google'` lê `crm.google_ad` e as linhas `level='ad'` de `crm.ads_insights_breakdown_daily`.
`public.artist_ads_campaign_settings(p_artist_id, p_campaign_id, p_platform)` é nova e devolve `jsonb` com a mesma forma nas duas plataformas.

## D-ERP123 — `crm.decrypt_token` qualifica `extensions.pgp_sym_decrypt` (21/09/2026)

A função `crm.decrypt_token(text, text)` estava partida porque chamava `pgp_sym_decrypt` sem qualificar; o `search_path` da função era `'crm','public'`, por isso qualquer chamada dava erro 42883 (`function pgp_sym_decrypt(bytea, text) does not exist`). Foi corrigida para `extensions.pgp_sym_decrypt`. Mantém a mesma assinatura, o mesmo `search_path`, a mesma ACL (`service_role` e `postgres`, sem `PUBLIC`) e continua fora de qualquer caminho vivo — o TikTok usa `public.crm_get_meta_decrypted_token`.


## D-ERP124 — Leitor do TikTok for Artists: fase 2 (21/09/2026)

**Adenda 21/09/2026 (renomeação):** a tabela do mapa passou a chamar-se `public.artist_song_tiktok_groups` (constraint `artist_song_tiktok_groups_key`, índice `artist_song_tiktok_groups_group_id_idx`, políticas e trigger com o mesmo sufixo); o SQL vive em `supabase/manual/20260921195500_artist_song_tiktok_groups.sql`. O nome `artist_song_tiktok_sounds` fica reservado ao módulo A (sons, `music_id` — ver D-ERP125): esta tabela é o mapa de MÚSICAS do painel (`group_id`).

Nova edge function `tiktok-artists-sync` (`verify_jwt = true`, aceita chamada interna por service role como os crons `carreira-*`) lê o endpoint `ttfa/song_data/list/v1` do TikTok for Artists com o cookie `TIKTOK_ARTISTS_COOKIE` (428 se faltar; nunca faz login nem segue redirect de login; sessão caída fecha o `sync_runs` com `error` e motivo `sessao_invalida`, sem retries). Escreve em `public.artist_song_metrics_daily` com `platform='tiktok'`, `source='tiktok_artists'`, `source_ref=group_id` e as métricas `ugc_videos` (`music_cv_cnt`), `ugc_creators` (`music_creator_cnt`) e `ugc_views` (`music_vv_cnt`); a chave única inclui `source`, pelo que as linhas `source='manual'` nunca são tocadas. O mapa música↔sound vive na tabela nova `public.artist_song_tiktok_sounds` (SQL em `supabase/manual/20260921195500_artist_song_tiktok_sounds.sql`, aplicação manual em Live). A resposta devolve os sounds do TikTok sem música mapeada, para mapeamento posterior. Cron sugerido (não criado): `carreira-tiktok-artists-sync-diario`, 09:40 UTC.

## D-ERP125 — Módulo A: UGC do TikTok por som (music_id) via Apify (21/09/2026)

Tabelas novas (SQL em `supabase/manual/20260921205000_artist_song_tiktok_sounds_module_a.sql`, aplicação manual em Live): `public.artist_song_tiktok_sounds` (sons por música: `music_id`, `status` candidate|validated|rejected, `discovered_via` seed|hashtag|manual_link|panel, UNIQUE `(song_id, music_id)`) e `public.artist_song_tiktok_sound_daily` (contagem diária por som, UNIQUE `(music_id, metric_date)`); ambas com as 3 políticas de `artist_song_metrics_daily`. `artist_songs` ganha `tiktok_hashtags text[]` e `tiktok_song_id text`. Sementes: os 6 `artist_song_identifiers` de TikTok (`discovered_via='seed'`, só o oficial `7681780720700327953` a `validated`) e os 14 sons validados + 1 candidato de "Roupa de Solteira - Ao Vivo".

Nova edge function `tiktok-sound-count-sync` (`verify_jwt = true`, aceita service role): lê os sons `validated` das músicas `is_launch OR is_reference`, chama o ator Apify `funny_ground/tiktok-sound-scraper` (`dzN8Pp8yxmp9Jzzyd`) por `run-sync-get-dataset-items` com `soundUrls`/`resultsPerSound`/`maxVideosToScanPerSound` — ator e input em constantes no topo do ficheiro —, exige `APIFY_TOKEN` (428 se faltar) e grava 1 linha por som em `artist_song_tiktok_sound_daily` mais a soma por música em `artist_song_metrics_daily` (`platform='tiktok'`, `metric='ugc_videos_sounds'`, `source='apify'`). Guardas: som validado ausente na resposta → a soma dessa música NÃO é gravada (as linhas por som que vieram ficam) com aviso; queda > 10% face ao último valor → grava com aviso. Marca `artist_songs.report_stale_at`. Suporta `dry_run` e `song_id`. Cron sugerido (não criado): `carreira-tiktok-sounds-daily`, 09:30 UTC.

A3-bis: `tiktok-artists-sync` passa a chamar também `ttfa/song_data/clip_data_list/v1` por cada `group_id` mapeado e faz upsert dos sons `pgc_*`/`ugc_*` em `artist_song_tiktok_sounds` com `discovered_via='panel'`, `status='validated'`, `is_official` = som `pgc` e `title = clip_name`, sem apagar nada — a descoberta dos sons oficiais do nosso artista fica automática.

## D-ERP126 — Pagamento nunca com data futura; saída prevista é data de vencimento (22/09/2026)

**Decisão:** `payment_date` em `public.transactions` e `public.transaction_payments` nunca pode ser posterior ao dia corrente. Uma saída prevista regista-se em `due_date`, não em `payment_date`.

**Contexto:** na madrugada de 22/09/2026 a transação `b0032fc9-8165-460d-97cd-2c6aa1c750f6` ("Criação Video/Campanha Golden Ticket", Coala Festival Portugal 2026, 2.413,50 €) estava com `status = 'paid'` e `payment_date = 2026-11-03`. A data futura falseava o saldo da conta bancária na implantação, porque a linha escapava à data de corte (`initial_balance_date`) e descontava dinheiro que ainda não tinha saído.

**Implementação:** duas funções de trigger em `public`:
- `validate_paid_requires_payment_date()` — associada a `transactions` pelo trigger `enforce_paid_payment_date` (já existente, BEFORE INSERT OR UPDATE), reforçada com a verificação de data futura;
- `validate_payment_date_not_future()` — nova, associada a `transaction_payments` pelo trigger `enforce_payment_date_not_future` (BEFORE INSERT OR UPDATE).

A data de referência é `(now() AT TIME ZONE 'Europe/Lisbon')::date`, para não recusar por engano um lançamento feito do Brasil ao fim do dia.

**Por que também em `transaction_payments`:** a liquidação escreve parcelas nessa tabela e `sync_paid_amount_from_payments()` só propaga `payment_date` para a transação quando o pagamento fecha o valor total. Um pagamento parcial futuro passaria sem tocar na transação se a trava estivesse apenas lá.

**Alternativas rejeitadas:**
- Validação só no ecrã — não cobre chamadas diretas à base, API, importadores nem ações manuais via SQL;
- Deixar passar e corrigir no fecho do evento — falseia o saldo da conta durante semanas e quebra a conciliação bancária enquanto o erro estiver vivo.

**Consequência:** a regra vive na base de dados, logo cobre ecrã, API, edge functions e importadores. O caminho correcto para uma saída programada continua a ser `renegotiate_transaction_installments()`, que preenche `due_date` e deixa `payment_date` a `NULL` até o pagamento ser efectuado.


## D-ERP127 — Conciliar uma linha do banco é ligar OU liquidar, e o sinal manda no tipo (22/09/2026)

**Contexto:** o modal "Conciliar manualmente" listava todas as transações **pagas** na conta sem movimento no banco, receitas e despesas misturadas, e não listava nada em aberto. O crédito de 7.380,00 € da MATUDIS de 17/09/2026 é o patrocínio "Matudis — Patrocínio Ensaios da Anitta · Lisboa" (6.000 € + IVA 23 %, `approved`, por receber, sem conta): não aparecia em lado nenhum e o utilizador via uma lista de despesas. O dinheiro estava no banco, a receita estava por receber no sistema, e não havia caminho entre os dois.

**Decisão 1 — o sinal da linha manda no tipo.** Linha a crédito só casa com `type = 'income'`; a débito só com `type = 'expense'`. Vale para as candidatas da conta do extrato, para as em aberto e para as de outras contas (D-ERP35).

**Decisão 2 — duas listas, dois significados.** O modal mostra primeiro "Pagas nesta conta, sem movimento no banco" (escolher **só liga** — D-ERP28 intacto) e depois "Em aberto (por receber / por pagar)", com `status in ('approved','partially_paid')` e bruto por liquidar > 0, sem filtro de conta porque estas ainda não têm conta. Ordenação por proximidade de valor e depois de data.

**Decisão 3 — liquidar pela linha do banco é acção explícita, no molde do "Lançar" (D-ERP29).** A conciliação continua a não alterar transações **por si** (D-ERP28): nenhuma camada automática liquida nada, e a camada 2 (valor exacto) continua restrita a transações já pagas. O que muda é que a pessoa pode decidir, linha a linha, que aquele movimento do banco **é** o recebimento/pagamento daquela transação. O pagamento nasce em `transaction_payments` (D-ERP86) com a data-valor da linha e a conta do extrato; `paid_amount`, estado e `payment_date` continuam derivados por `sync_paid_amount_from_payments` e nunca escritos à mão. Uma linha pode liquidar N transações; se o em aberto for maior do que o disponível na linha, o pagamento é parcial e o modal diz quanto fica em aberto. Nunca se paga acima do em aberto.

**Implementação:** nova RPC `public.reconcile_bank_line(p_line_id uuid, p_items jsonb)`, plpgsql **sem `SECURITY DEFINER`**, `search_path = public`, no molde de `launch_from_bank_lines` (D-ERP28/#154): valida empresa, linha livre, tipo compatível com o sinal, valor dentro do em aberto e soma = valor da linha ±0,01, e só depois escreve. Grants: `anon` sem execução, `authenticated` e `service_role` com. O ecrã deixou de fazer `UPDATE` directo em `bank_statement_lines` neste caminho — tudo passa pela RPC, e qualquer erro reverte tudo.

**Alternativas rejeitadas:**
- Liquidar automaticamente quando a camada do valor exacto casa com uma transação em aberto — esconderia decisões financeiras dentro de um motor de conciliação, exactamente o que o D-ERP28 evita;
- Mandar a pessoa liquidar no modal de pagamento e voltar para conciliar — duas escritas sem atomicidade, e era o caminho que deixava a linha do banco por explicar quando o segundo passo falhava;
- Escrever `paid_amount`/`status` directamente na transação — contraria o D-ERP86 e foi a origem das 624 transações pagas sem linhas de pagamento.

**Consequência:** o lado das receitas por receber passa a ter caminho a partir do extrato, com o pagamento a nascer sempre da mesma tabela que todos os outros. A conciliação continua a não decidir nada sozinha.

**Estado:** vigente.

---

## D-ERP126 — Leitura de ecrã do app TikTok por Atalho iOS (B1 da Máquina de recolha) (22/09/2026)

**Contexto:** o número de publicações (UGC) por som só existe de forma fiável dentro do app TikTok; nem a Display API nem o Soundcharts o devolvem. A alternativa em uso era o Pedro ler o ecrã e escrever o valor à mão, todos os dias.

**Decisão:** um Atalho do iOS abre a página do som no app, tira captura, faz OCR e envia o texto para a edge function `artist-screen-ingest`, que extrai o número (`(\d[\d.,]*)\s*(mil|mi|k|m)?\s*publica`) e grava em `artist_song_metrics_daily` com `source = 'ios_shortcut'`. Autenticação própria por header `Authorization: Bearer <SCREEN_INGEST_TOKEN>` (`verify_jwt = false`), sem JWT de utilizador; `artist_id`/`company_id` resolvidos por service role a partir de `artist_songs`.

**Precisão arredondada é aceite.** O app mostra "6,5 mil" e não o valor exacto. `source_ref` registra a precisão (`exata` para número sem sufixo, `centena` para "x,y mil", `milhar` para "x mil" sem decimal ou "mi") e o trecho do OCR, para que a série seja lida com a granularidade certa.

**Consequência:** substitui a leitura manual diária de `ugc_videos` quando activa. O upsert usa a UNIQUE `(song_id, platform, metric, metric_date, source)`, pelo que reenviar o mesmo dia corrige o valor em vez de duplicar. Não altera tabelas nem outras funções.

**Estado:** vigente.

## D-ERP128 — Edge function autentica pelo JWT explícito e valida pertença por papel, nunca por empresa activa (23/09/2026)

**Problema (produção, 23/09/2026).** `crm-meta-publish-execute` recusava sessões
válidas no preflight com 401 `sessao_invalida` e, quando passava, respondia 404
`plan_not_found` a planos existentes.

**Causa 1 — identidade.** `supabase.auth.getUser()` era chamado SEM o token,
contando com o header `Authorization` global do cliente. Nessa forma o
supabase-js procura uma sessão guardada — que não existe com
`persistSession: false` — e devolve `null`. Regra: **o token vai sempre
explícito** (`admin.auth.getUser(bearer)`), como em `_shared/artist-meta.ts →
authorize()`. `service_role` continua aceite sem utilizador.

**Causa 2 — pertença.** O plano era lido por um cliente na sessão do chamador,
cuja RLS resolve a empresa por `profiles.active_company_id`; com outra empresa
activa o plano ficava invisível e o erro saía como 404. Regra: o plano é lido
pelo cliente **admin** e a pertença é validada **por papel** em
`public.user_roles` contra `planRow.company_id` (mesma regra de
`public.artist_ads_assert_write`): `platform_admin` passa sempre; os restantes
precisam de linha para aquela empresa. Sem pertença → 403 `sem_acesso_empresa`.

**Nada mais muda:** `dry_run`, publicação e eventos mantêm o comportamento; a
verificação de escrita para planos de música continua a passar por
`artist_ads_assert_write`.

**Estado:** vigente.

## D-ERP129 — Toda a geração de estratégia fica registada em `public.sync_runs` (23/09/2026)

`artist-ads-strategy-generate` devolvia `plano_invalido` (422) sem deixar rasto,
o que tornava o diagnóstico impossível sem reproduzir no browser.

**Registo.** Cada geração abre e fecha uma linha em `public.sync_runs`
(`function_name = 'artist-ads-strategy-generate'`, `artist_id`, `company_id`) com
`details`: publicações promovíveis, quantas foram ao modelo, ids devolvidos,
quais não casaram e porquê, conjuntos/anúncios propostos, tentativas, modelo,
`plan_id` e `http_status`. Fecha `success` com plano criado, `error` com erro e
`no_data` quando o modelo não produziu nada aproveitável.

**Causa corrigida, não validação relaxada.** As publicações Meta enviadas ao
modelo passam a estar ordenadas e cortadas a 40 (antes ia lista completa e a
ordem não era determinística) e os ids devolvidos são resolvidos por índice:
aceita-se o `post_ref` exacto e também o segundo segmento de
`<page_id>_<post_id>` quando identifica SEM ambiguidade uma publicação da lista.
O tipo (`object_story` vs `instagram_media`) deriva do próprio `post_ref`.

**Retry único.** Se nenhum anúncio casar, há uma segunda chamada com a lista
literal de ids permitidos. Se falhar também, o 422 devolve `detalhe`
(tentativas, conjuntos e anúncios do modelo, ids não casados com motivo,
promovíveis totais e enviados).

**Estado:** vigente.

## D-ERP130 — `public.artist_dashboard` é a única chamada da Visão geral do artista (23/09/2026)

Migração `supabase/migrations/20260923034110_09442ebe-9c8f-46e6-9f9f-ff23af7b65e6.sql`.
Só funções: `public.artist_dashboard(uuid,date,date) → jsonb` e a auxiliar
`public.artist_dashboard_platform_label(text)`. Nenhuma tabela/coluna nova.

**Regras.** Redes, canais e música são fotografias: atual = último snapshot
`<= p_to`, anterior = último `<= p_from`, `delta_pct` NULL quando o anterior é
0/NULL; nunca se somam snapshots. Só campanhas somam por dia
(`artist_ads_daily`). Métrica sem leitura dentro da janela devolve `atual` NULL
com o `as_of` da última leitura e gera linha em `avisos`; nunca zero inventado.
Fonte preferida `platform_api`, com queda para a outra fonte por
plataforma+métrica; `source` e `as_of` vão em cada linha.

**Desvios face ao pedido.** `artist_songs` não tem `is_working_single`: a música
de trabalho é `is_launch = true` (mais recente) e, em falta, a mais recente
lançada. `artist_ads_daily` não expõe alcance — `alcance` vem NULL e
`tipo_resultado` deriva de haver resultados ou visualizações.

**Segurança.** SECURITY DEFINER, `search_path = public, crm, pg_catalog`,
pertença validada por papel em `user_roles` na empresa do artista
(`platform_admin` passa), `REVOKE EXECUTE` de PUBLIC e `anon`, `GRANT` a
`authenticated` + `service_role`. Nunca lê `crm.ad_platform_connections`
directamente — usa as RPCs `artist_ads_*`.

**Estado:** vigente.

## D-ERP131 — Revisão de fecho por linha: o previsto que resta ou é obrigação, ou é financiamento de sócio, ou é ajustado (23/09/2026)

**Contexto:** o custo do fecho é *BP aprovado + excedido*. Cada linha de BP com saldo conta como custo no acerto com os sócios; se a fatura nunca vier, o evento fecha com custo a mais e os sócios recebem a menos. Medido na Ivete a 23/09: **42 linhas, 258.136,40 € s/IVA**. O painel "Verba por usar" era por rubrica, com um único reconhecimento para o evento inteiro e nenhuma acção.

**Decisão:** o painel passa a ser **por linha de BP** (`forecast_id`, nunca por rubrica), com Previsto · Pago · A pagar · Saldo e **uma decisão obrigatória por linha** antes do selo:
1. **Custo real — fatura por chegar** → mantém; soma em *Obrigação futura da MP*.
2. **Pago por sócio** → mantém; soma em *Financiamento de sócios a devolver*.
3. **Ajustar previsto** → `reduce_forecast_budget` baixa o previsto (≥ realizado), observação obrigatória, `baseline_amount` intacto, registo em `forecast_audit_log`.

Antes de decidir, **vincular**: as transações da mesma rubrica sem linha de BP aparecem como candidatas (parcelas vinculam-se em grupo, D-ERP77). Cada decisão grava o saldo do momento; se o saldo mudar, a linha volta a "por rever". `event_close_blockers` ganha `soft.bp_lines_unreviewed` — aviso, não bloqueio.

**Estado:** vigente. Tabela `event_bp_line_reviews` (append-only), helper `computeBpLineReview` no pacote partilhado, painel `BpUnusedBudgetPanel`.

