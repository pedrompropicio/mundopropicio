# Decisões — MP Gestão Eventos / MP Audience

> Registo das decisões de arquitetura/produto e o seu PORQUÊ. Formato ADR leve: cada decisão = o que se decidiu + racional + estado (vigente / substituída).
> Documento vivo, organizado por módulo. Decisões antigas não se apagam — marcam-se "substituída".
> Como funciona o sistema vive em ARCHITECTURE.md; pendências vivem nas GitHub Issues.
> Última atualização: 12/set/2026.

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

**Estado:** vigente.

---

## D-ERP32 — Rateio de day-offs de turnê: encontro de contas gerencial (10/09/2026)

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



**Adenda a DR-2026-09-09-D25 — (b) construída em 2026-09-12:** `event_settlement_id`
(NULL) em `event_forecasts` e `transactions`, com índices parciais e triggers de
coerência (mesmo evento; apuramento selado não aceita marcações; transação sem
evento — mãe de rateio — não pode ter apuramento; apuramento com linhas não se
apaga). Selector "Apuramento" só visível em eventos com 2+ apuramentos e bloco
"Perímetro" no painel da aba Sócios. **Zero linhas marcadas** e nenhum cálculo
consome a coluna. Armadilha registada: `transactions.settlement_id` é o fecho de
bilheteira (`ticket_office_settlements`), não o apuramento.
