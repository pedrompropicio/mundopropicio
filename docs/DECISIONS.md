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
