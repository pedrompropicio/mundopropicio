# P415-P — contrato e reconciliação do fecho

Plano para revisão de Pedro, preparado em 03/11/2026 por leitura local. **Não implementa P415-I, não aplica configurações e não encerra a #415.** A única escrita autorizada nesta entrega é este ficheiro e `.executor/resumo.md`.

## 1. Evidência, precedência e completude

O despacho prevalece sobre o corpo da Issue e sobre memórias anteriores. A decisão de Pedro de 31/10 separa a vista dos cards do contrato, mantém overhead contratual por omissão e permite dispensa individual quando há vários participantes que acertam. Revoga o acoplamento da D-ERP211/e2; não revoga g4, g5, g14, g15, g17, regras fiscais, cambiais, perímetros ou selo.

Fontes de enquadramento: `docs/INDEX.md`, `docs/QUADRO.md` (reservas e frente 7), `docs/estado/estado-fecho-e-socios.md`, `docs/procedimentos/PROC-despacho-executor.md` §§1–4; `.lovable/memory/features/partner-settlement.md`, `event-settlements.md`, `event-cost-basis.md`, `master-split-rateio-source-of-truth.md` e `financial-position-base.md`. A revisão inclui `PROC-fecho-evento.md`, `PROC-promocao.md` e `PROC-verificar-versao-publicada.md`. O estado da frente ainda contém regras antigas; não certifica o comportamento publicado. O procedimento de fecho também contém passos antigos de IVA por sócio e a frase «ERP para no nível 1», ultrapassados por g4/g17; as suas queries não são um motor alternativo nem foram executadas.

Base desta leitura: HEAD local `e947a6b12fe6b07462d1a6261ecc0e04b601b2b4`. O anexo do despacho relata leitura pública de 02/11 no SHA `d1ac522f9e59652a6e34d960fbf77a22f5c0b09c`; os dois identificadores não provam qual SHA está publicado. Os comentários 6550486531, 6550533420 e 6591214041 são fontes **transcritas no despacho**, não consultadas nesta execução. As observações históricas de 23,70 no excedido e 0,01 entre BP/real não foram reproduzidas.

| Pedido | Entrega neste plano | Implementação/execução posterior |
|---|---|---|
| Realizado/Previsto + excedido e overhead visuais separados | §§2–4, 8: dois contratos e grafo dos consumidores | P415-I, após aprovação e persistência disponível |
| Overhead contratual sim; alteração deliberada, auditada, admin/gestora; selo | §§3, 7: persistência, comando, locks, permissões e snapshot | Preparação R2, aplicação própria, depois P415-I |
| Valores iniciais escolhidos por Pedro | §§3.5, 10: manifesto e perguntas; nenhum valor histórico escolhido | Aplicação separada, com prévia e Sim |
| Suporta overhead por participante; casa absorve diferença | §§3.2, 5, 6: elegibilidade, cascata e C1/C2 | P415-I + suporte R2 |
| Motor, Sócios, Fechamentos, Encontro, Fecho, relatórios, PDF/Excel, Portal, Posição | §§2, 4, 8: todos com resultado canónico e dependências | Entregável conjunto; só separar por R2/R1 e aplicação real |
| Cidades, Só MP, IVA, Master | §§4.3, 6.7: mesmo perímetro/base e linhas com proveniência | Preservar #404/#413 e helpers existentes |
| Quota, aporte, repasse, operacional, caução, devolução, saldo | §§4.2, 6.6: fontes, pontes e limites dos conceitos | Unificação sem regra financeira nova; Q4 antes de comportamento novo |
| Excedido cidade/turnê e rótulo Base do contrato | §§4.3, 6.7, 10: alternativas quantificadas e recomendação | Q2 antes de mudar política |
| Cêntimo BP/real | §6.9: arredondamento existente e protocolo de diagnóstico | Correção de dados só em DML próprio |
| Comissão Ticketline e overhead reposto em 31/10 | Facto fornecido: já executados segundo 6550486531, retificado por 6550533420 | Não repetir DML; não afirmar que o card mudou |
| Excedido documental #414 | §6.8: entrega encontrada, cobertura e limite de publicação | Reutilizar; não duplicar nem presumir encerramento |
| Seis referências, paridade, homologação, publicação e validação | §9: protocolo e fontes indisponíveis identificadas | Execução operacional e publicação com Sim próprios |

## 2. Mapa atual: leituras, escritas e divergências

Os caminhos abaixo foram inspecionados localmente. São código versionado, não certificação do catálogo instalado. `src/lib/event-settlement-inputs.ts`, `event-settlement-engine.ts`, `partner-disbursement.ts`, `partner-statement-doc.ts` e os restantes shims reexportam o núcleo de `supabase/functions/_shared/settlement/`.

| Caminho/símbolo atual | O que lê/escreve hoje | Destino no desenho |
|---|---|---|
| `src/hooks/useEventCostBasis.ts`: `eventCostBasisQueryKey`, `useEventCostBasis` | SELECT literal `cost_expense_source, cost_include_overhead, partner_calc_basis` em `events`; setters fazem UPDATE em `events`; gate cliente admin/manager **ou** `manage_bp` | Apenas vista dos cards; nenhum setter contratual; conservar campos de vista existentes |
| `src/hooks/useFechoBasis.ts`: `useFechoBasis`, `describeFechoBasis`, `useExpenseColumnsMode` | Alias do hook anterior; modo de colunas do documento é preferência local | Resolver critério contratual do nó; colunas continuam só apresentação |
| `src/components/EventFinancialCard.tsx`; `src/pages/EventDetail.tsx`; `src/pages/Events.tsx`; `src/hooks/useEventFinancialCardData.ts` | Cards usam critério do evento; `EventDetail` mostra «Base do contrato (fecho)» | Cards continuam visuais; legenda contratual passa a ler o resultado canónico, com perímetro explícito |
| `src/hooks/useEventContractResult.ts`; `src/lib/event-contract-result.ts` | Lucro segue números dos cards; comparação contratual recompõe totais com `useFechoBasis` | Preservar lucro visual; comparação passa a projeção do contrato, sem recalcular o fecho |
| `src/hooks/useEventSettlementEngine.ts`: `useEventSettlementEngine` | Passa `basis.includeOverhead/expenseSource` a `computeEventSettlementTotals`; monta também input do motor | Carregador/adaptador do mesmo contexto usado pelo serviço; retirar montagem paralela |
| `src/lib/settlement-participants.ts`: `EVENT_SETTLEMENTS_SELECT`, `SettlementParticipant`, `toSettlementParticipant`, fetchers | Nós com pai, quota, base, IVA devolvido e selo; participantes com modo, percentagens, campos históricos e repasse IVA | Acrescentar contrato/revisão e suporte de overhead em tipos e selects consistentes |
| `_shared/settlement/event-settlement-inputs.ts`: `computeEventSettlementTotals`, `collectSettlementExpenseDocLines` | Receita partilhada; despesa por fonte; overhead; excedido por rubrica sobre família carregada; linhas documentais com `gross` independente | Única composição de custos e linhas; receber critério contratual resolvido e devolver proveniência |
| `_shared/settlement/event-settlement-engine.ts`: `computeSettlementEngine` | g4 usa `node.nodeUsesGrossExpenses` para todos, inclusive casa; ignora `expense_includes_iva`; resultados, partes, residual, C1/C2 | Único cálculo de árvore/partes; incorporar ajuste de overhead explicitamente |
| `_shared/settlement/statement-service.ts`: `loadStatementBundle`, `computeStatementEngine`, `buildPartnerStatement` | Lê critério do Master em `events`; tem select próprio de nós; monta motor e **ainda recompõe** despesas/parte do sócio em `buildPartnerStatement` | Um contexto canónico do evento e projeções por destinatário; sem segunda conta da parte |
| `src/components/PartnerSettlementTab.tsx`: `cityBreakdown`, `settlements`, pools, `buildSoloDocInput` | Cidades usam TX/bilhetes/overhead e rateio próprio; render usa `c.revenueNet - c.expensesGross`; modo contract força casa s/IVA; calcula quota, aporte, saldo e transferência paralelamente | Consumidor das projeções canónicas, com pontes entre conceitos diferentes |
| `src/components/EventSettlementsPanel.tsx`, `EventSettlementsManager.tsx`, `EventPartnersTab.tsx` | Painel usa motor; managers fazem INSERT/UPDATE/DELETE de nós/participantes; `syncHouse` trata percentagens da raiz | Editor explícito do contrato e flag; comandos protegidos; preservar regras de casa nominal/settles |
| `src/components/SettlementSealControl.tsx`; `src/lib/settlement-seal.ts` | `create_bp_snapshot`, `seal_event_settlement`, `unseal_event_settlement`; `SealSnapshot` v1 tem basis global e subárvore | Snapshot versionado com critério efetivo por nó e ajustes; compatibilidade v1 sem inventar campos |
| `src/components/EventFecho.tsx` | `useFechoBasis`, receita partilhada e blocos locais de distribuição/acerto | Resultado e conta corrente do mesmo contexto; preservar distinção DRE/contrato |
| `src/components/ReportPartnerSettlement.tsx`; `src/lib/partner-settlement-report.ts`: `buildPartnerSettlementReportData` | Lê tabelas e recompõe receita, custos, overhead e pools; não recebe contrato completo da árvore | Adaptador de projeções por evento/participante, sem motor próprio nem soma nominal como real |
| `_shared/settlement/partner-disbursement.ts` | BP pago, TX, ajustes, receitas em poder, extras; `partnerDisbursement`, `partnerFinancingToReturn`, `partnerAdvancedTotal`, `partnerMpTransfersAdvanced`, `partnerTransferIvaBase` | Conservar helpers g5; composição final única para todos os consumidores |
| `_shared/settlement/partner-settlement-internal-report.ts`; `src/lib/export-partner-settlement-internal-pdf.ts` | Modelo interno g15, residual e reconciliação de linhas | Acrescentar termos canónicos; exportador só renderiza |
| `_shared/settlement/partner-statement-doc.ts`; `src/lib/export-partner-statement-doc.ts` | Construtor puro g4/g13; grupos de receitas, linhas de despesa, cascata, overrides e PDF/XLSX | Receber projeção do destinatário; PDF e Excel sem fórmula financeira própria |
| `src/pages/PartnerEventDetail.tsx`, `src/components/partner/PartnerSettlementBlock.tsx`, `PartnerFinancialCards.tsx`; `supabase/functions/partner-statement/index.ts` | Portal recebe `{doc, block, cards}` do serviço; edge resolve identidade/acesso | Mesmo contrato e conta corrente da equipa; preservar estanqueidade e gates servidor |
| `supabase/functions/financial-position/index.ts`: `eventInput` | `computeStatementEngine` + `buildPartnerStatement`; histórico força `so_bp`; gate pela RPC com JWT | Uma execução/contexto por evento; projeções sem recomputar partes; falha marca incompleto |
| `_shared/financial-position/assemble.ts`, `position-reads.ts`; `src/lib/financial-position-p5.ts`; `src/hooks/useFinancialPositionP5.ts`; `src/components/financial-position/P6bSections.tsx` | Agregação/contrato estrito da Posição; slots nomeados de leitura | Transportar decomposição nova se exibida, sem SQL/TS alternativo do motor |
| `src/lib/partner-contracts.ts`: `buildShareOrigin`, `buildFreezeValues`, `readFrozenOrigin`; `src/components/PartnerPaymentDialog.tsx` | Congela só a parte e origem do nó; RPCs de pagamento próprias | Snapshot da parte ajustada e da origem do ajuste; nunca usar vista atual para reescrever congelado |
| `src/lib/report-event-cost.ts`; `ReportDRE.tsx`, `ReportDREEmpresarial.tsx`, `ReportProfitability.tsx`; `src/lib/export-dre.ts` | Custo/reporting de evento e empresa com critério visual/contabilístico existente | Continuam na família de reporting; se mostrarem «parte/acerto», recebem projeção contratual, não a deduzem do DRE |
| `scripts/prove-settlement-engine.ts` | Script autenticado, lista raízes visíveis e replica conta antiga do ecrã | Apenas lido; não executado; não pode servir como oráculo atualizado sem revisão/autorização próprias |

Outras escritas a preservar, sem as redirecionar para o contrato: `PartnerPaidExpensesPanel.tsx`/pagamento criam propostas/vínculos de despesas pagas; `PartnerExtrasPanel.tsx` e `src/lib/partner-extras.ts` alimentam extras/ajustes; transações, BP, capital e operações continuam nos seus fluxos. `event_partners` mantém identidades/FKs históricas, não volta a ser fonte da percentagem ou da flag nova. `transactions.settlement_id` é fecho de **bilheteira**; só `event_settlement_id` é perímetro do fechamento do evento.

### Divergências demonstradas por leitura, sem diagnóstico de dados

- O critério visual entra hoje nos totais contratuais tanto no hook como no serviço.
- A quebra por cidade não é a composição do resumo: ignora a fonte committed em blocos próprios, soma receitas sem a partição Só MP e força despesas brutas na renderização.
- O modo contract da aba usa override por participante e casa sempre s/IVA, contrariando g4. O motor já faz g4 corretamente.
- O relatório global mantém outra fórmula de custos/pools e pode misturar nós/nominais. A existência de g17 não elimina esses blocos legados.
- `buildPartnerStatement` calcula uma parte local a partir de totais/rotulagem efetiva; deve usar `ParticipantResult.share`. Base efetiva é rótulo, não autorização para trocar a base g4.
- O serviço calcula IVA do repasse sobre a base positiva; a aba e o documento já dispõem da regra com transferências MP anteriores por `partnerTransferIvaBase`. Alinhar pela regra existente, não escolher uma regra fiscal nova.
- Snapshot v1 não contém proveniência/flag de overhead por participante. Comentários que prometem leitura congelada não substituem teste de todos os leitores, sobretudo serviço/Portal.

## 3. Contratos propostos de persistência e comandos

**Todos os nomes novos deste capítulo são propostas**, não colunas/RPCs certificadas como existentes. Não há SQL executável nem número de migração reservado neste plano.

### 3.1 Critério do fechamento e herança

Propor em `event_settlements`:

| Campo proposto | Tipo/semântica | Validação |
|---|---|---|
| `contract_expense_source` | `realized | committed | null` | Raiz inicializada exige valor; filho null herda do ancestral mais próximo; nunca ler `events.cost_expense_source` como fallback |
| `contract_include_overhead` | `boolean | null` | Raiz nova propõe true; filho novo null herda; false exige decisão explícita e motivo |
| `contract_revision` | inteiro crescente servidor | Controlo de concorrência e referência no snapshot; mudança herdada também invalida o contexto dos dependentes |
| `contract_initialized_at`, `contract_initialized_by` | instante servidor e autor | Juntos; ausentes significam «por configurar», não false/zero/default histórico |

A criação de raiz nova pode apresentar overhead sim, mas só fica inicializada após confirmação explícita da fonte. Para registos existentes, nem fonte nem overhead são escolhidos pelo código. Filho sem override mostra «Herdado de <fechamento>», valor efetivo e revisão da origem; definir/remover override é ato contratual auditado. Sem ancestral inicializado, o filho também não tem contrato utilizável. Q3 confirma este desenho de herança antes de R2.

A adição estrutural deixa os campos contratuais dos nós históricos por inicializar; defaults de criação não equivalem a backfill dos acordos existentes. Nem um valor visual antigo nem a omissão técnica de uma coluna nova constituem decisão de Pedro.

Não mover nesta Issue `events.partner_calc_basis`: g4 continua raiz por esse campo, filhos por `parent_share_basis`; `returns_parent_deductible_vat` mantém g10/g14. O resolvedor devolve também essa proveniência de IVA. Não usar `expense_includes_iva` histórico para reintroduzir exceções de IVA por pessoa. `gross_revenue` continua a ignorar despesas; a flag de overhead não pode criar custo/dispensa nessa modalidade.

### 3.2 Participante

Propor `event_settlement_participants.supports_overhead: boolean`, omissão true para participante novo. Na inicialização histórica a proposta true é mostrada a Pedro com o resto do acordo; não representa confirmação automática de acordos antigos.

A opção editável aplica-se a participante externo `mode='settles'`. O controlo só aparece quando o **mesmo nó tem pelo menos dois participantes settles**; contam as linhas `house` em settles, porque o despacho diz participantes, e não contam nominais nem participantes de outros nós. A casa mantém supports=true e apresenta o encargo absorvido na decomposição do residual: desligar overhead da própria casa não teria efeito económico independente. Esta interpretação fica explícita na aprovação do plano; não contar cadastros legados de `event_partners`.

Com overhead global desligado, uma dispensa individual guardada é inativa e identificada como tal; não apagar a escolha. Se uma edição de modo/remoção deixasse menos de dois settles com uma dispensa ativa, recusar a operação e pedir regularização deliberada da flag, sem a repor em silêncio. Nominal não recebe dispensa; a referência nominal conserva o contrato do nó. Revalidar contagem, modo, tenant e selo no servidor sob o mesmo lock que a escrita.

### 3.3 Leitura e tipos

Propor `_shared/settlement/settlement-contract.ts`, reexportado por `src/lib/settlement-contract.ts`, com tipos discriminados:

- `SettlementContractState = uninitialized | ready | invalid`; nada de `?? committed/true` num contrato histórico ausente.
- `ResolvedSettlementContract`: settlementId, expenseSource, includeOverhead, origem de cada campo, revisão própria e revisões herdadas, base g4, estado do selo.
- `SettlementComputationContext` versionado: contrato por nó, linhas selecionadas com proveniência, engine, contas g5, diagnóstico de liquidez, projeções de cidades e documentos. Reutiliza `StatementBundle`, sem expor o bundle completo ao Portal.
- Extensões tipadas de `EngineSettlement`, `EngineParticipant`, `ParticipantResult`, `SettlementNodeResult`, `EngineResult`, `StatementBundle`, `PartnerAccountLine`, `PartnerStatementResult`, `PartnerStatementDocInput` e modelos internos: valores-base, ajuste de overhead, valor final, revisões e mismatches explícitos.

Um só conjunto de colunas partilhado para os carregadores de nós/participantes, inclusive o select local do serviço. Chaves React Query incluem empresa/utilizador/permissão e evento; o resultado derivado inclui revisão e nó. Não misturar uma linha parcial com a mesma chave `event-settlements`. Dados incompletos/contrato desconhecido dão erro explícito e indisponibilidade contratual; nunca mostram zero com aparência de fecho válido. Colunas geradas em `src/integrations/supabase/types.ts` só após o catálogo aprovado estar disponível.

Os campos visuais existentes continuam em `events`; não são migrados para o fechamento. Conservar a permissão atual dos seletores de vista, separada da permissão contratual mais restrita. Num fechamento selado, mudar a vista continua sem alterar revisão/snapshot; conferir no catálogo se alguma guarda antiga também bloqueia esses campos e adaptar apenas essa fronteira em R2. Não afrouxar guardas de BP, transações, IVA ou contrato para permitir a vista.

### 3.4 Escrita, permissões e auditoria

Propor comandos transacionais `set_settlement_contract` e `set_settlement_participant_overhead` (nomes/assinaturas finais dependem do catálogo). Entrada lógica: identificadores, alterações tipadas, revisão esperada, motivo obrigatório e chave idempotente. Saída: valores normalizados, revisões e recibo de auditoria. Inicialização usa comando distinto, `initialize_settlement_contract`, que recebe o manifesto aprovado e exige estado ainda não inicializado.

Admin/gestora da empresa ativa podem escrever; `manage_bp` isolado não basta para mudar contrato. Mapear `platform_admin` pelo resolvedor de papéis existente, sem acesso cruzado implícito. Editor, contabilista e Portal só leem o que já lhes é permitido. Serviço não aceita `company_id`, flags ou fornecedor do cliente como prova de autorização. O servidor resolve sessão/tenant e valida participação/árvore; o gate cliente é apenas UX. Anon não executa comandos; grants a authenticated só onde a RPC revalida identidade e papel. Funções privadas auxiliares não ficam expostas. Verificar privilégios efetivos, incluindo PUBLIC.

Ordem proposta: resolver tenant e conjunto afetado; bloquear evento e nós envolvidos em ordem estável de UUID, incluindo ancestral/origem de herança e descendentes dependentes; bloquear participante quando aplicável; reler revisão, selo, congelamento e elegibilidade; atualizar e auditar numa transação. Edições concorrentes, selo simultâneo, mudança de pai, modo e exclusão usam o mesmo protocolo. Nunca obter um lock filho antes de um pai que outra operação já possa bloquear. A ordem concreta tem de ser conciliada com os corpos SQL fornecidos na etapa R2.

Auditoria em `system_audit_log`, pelo mecanismo existente: tenant, evento/nó/participante, autor servidor, instante servidor, motivo, valores anterior/novo, herança anterior/nova, revisões e chave de pedido. Um retry idêntico devolve o mesmo recibo; mesma chave com payload diferente é conflito. Auditar também inicialização, remoção de override e recusas relevantes pelo mecanismo existente, sem escrever uma alteração parcial. Sem logs com documentos/dados de pagamento.

Recusar UPDATE direto dos campos novos e os caminhos legados de alteração contratual; não conceder UPDATE amplo para conseguir o novo comando. Preservar as guardas antigas e fechar INSERT/UPSERT, troca de pai e DELETE que contornem herança/selo. Após sucesso, usar `src/lib/invalidate-event-financials.ts` e os hooks centrais (`useInvalidateEventFinancials`, `useEventFinancialsRealtime`), além das chaves de contrato/participantes/documento/Posição; falha não altera a cache para um contrato que não foi gravado.

### 3.5 Inicialização deliberada e transição

Manifesto a fornecer por Pedro: empresa + evento + nó, fonte escolhida, overhead, overrides dos filhos ou herança, flags dos participantes, motivo/origem da decisão e revisão esperada. A prévia lista estado configurado/por configurar, selos/congelamentos/contratos ativos e impacto calculado, sem importar valores dos cards. Não há data de hoje ou fonte por omissão preenchida para resolver ausência de decisão.

Sequência conforme PROC-promocao: schema aditivo em preparação → homologação/aplicação R2 → UI/comandos e consumidores preparados e verdes → manifesto escolhido/aprovado → Publish/deploy autorizado → inicialização por comando com prévia/Sim próprios → aceitação operacional conjunta dos leitores. DML associado fica depois do Publish, não escondido na migração. Até publicar, o código antigo permanece a baseline legada; depois, o novo resolvedor mostra contrato por configurar onde faltar inicialização e nunca faz fallback para os cards. Planear com o 0 a janela de indisponibilidade contratual dos eventos abertos; não declarar corte aceite enquanto houver evento do perímetro operacional sem critério aprovado. Snapshots válidos preservam a sua leitura histórica.

Selo existente não é reaberto nem reescrito para inicializar. Conservar snapshot v1; quando faltar informação, declarar «critério histórico não registado no selo». Reabertura/reconfiguração só pelo fluxo autorizado, com motivo e avaliação de contratos de pagamento já ativos. Um evento sem sócios não deve ganhar um acordo fictício para contornar o estado por configurar.

## 4. Um resultado por conceito e por consumidor

### 4.1 Pipeline canónico

`loadStatementBundle` carrega fontes paginadas → resolvedor de contrato e perímetro → `computeEventSettlementTotals`/coleção de linhas → `computeSettlementEngine` via `computeStatementEngine` → composição g5 → `buildPartnerStatement`/modelo interno/cidades/relatório/Posição. O hook ERP passa pelo mesmo montador puro que o serviço; pode manter carregamento React Query, mas não outra aritmética. Propor `computeSettlementContext` em `statement-service.ts` para reutilizar uma execução do motor e projetar vários destinatários.

Antes de somar, classificar as linhas por origem, evento/cidade e nó. A seleção de fonte por nó atua sobre o **seu perímetro**; não calcular um total global numa fonte e subtrair linhas de outro nó numa fonte diferente. Raiz = linhas não marcadas ou marcadas com a raiz; filho = suas linhas + quota/addbacks/IVA/ativos existentes. Fontes diferentes entre nós não misturam TX/BP nem duplicam despesas. A âncora mantém a definição do motor sobre os perímetros selecionados; não é saldo bancário nem previsão universal dos cards.

Reutilizar `settlement-revenue.ts`: presença real por bucket antes da partição repartível/Só MP; `ticket_sales` sem duplicar receitas TX da bilheteira; real substitui BP, não `max(real, previsto)` nos acordos. Só MP fica na receita do evento/âncora e residual, fora da raiz/filhos/documento do sócio, sem fallback BP pela exclusão. `fecho-filters.ts`, `settlement-perimeter.ts`, overhead e rateios mantêm filtros, IRC, estornos, transitórias e versões.

As linhas documentais vêm de `collectSettlementExpenseDocLines`, com os mesmos net/gross dos totais. Não calcular um IVA implícito para excedido; não eliminar linha cujo net=0 e gross>0. A devolução de IVA, IVA não recuperável e addbacks usam os termos do motor e continuam separados de despesas pagas/receitas em poder.

### 4.2 Dicionário de resultados

| Conceito canónico | Fonte/cálculo único | Quem recebe e significado |
|---|---|---|
| Resultado da vista | Cards + `computeEventContractResult` | Capa/reporting visual; pode divergir do acordo, com critério/perímetro visíveis |
| Receita do evento / repartível / Só MP | `computeSettlementRevenue` e partição existente | Resumo interno mostra as três; sócio recebe só base repartível autorizada |
| Resultado do nó | `SettlementNodeResult.resultNet/resultGross`, `vatReturnedOut` e base g4 | Painel, Encontro, Fecho, cascatas, origem congelada; g10 só determina rótulo |
| Parte contratual | `ParticipantResult.share` final; percentagem efetiva do mesmo resultado | Todos os ecrãs, documentos, relatório, freeze e Posição; nominal é informativo, não desembolso |
| Parte declarada da casa | `house.declared`: casas em settles | Não confundir com líquido residual MP; casa nominal é pool, não parcela declarada |
| Líquido residual MP | `house.residual` + decomposição C2 | Gestão/Posição; não inserir como se fosse quota de participante |
| Desembolso | TX aprovadas vinculadas + BP elegível pago pelo sócio sem dupla contagem, helpers `partner-disbursement` | Conta corrente; não cria despesa de resultado nova |
| Ajustes / receitas em poder / extras | Helpers existentes, com sinais, `kind` e origens preservados | Financiamento = desembolso + ajustes − receitas em poder; adiantado abate uma vez |
| Base a transferir | `roundCents(shareCents + financingCents − advancedCents)` na composição partilhada | Conta corrente g5; negativa = a receber; não substituir por aporte de liquidez |
| IVA e total do repasse | `partnerTransferIvaBase(base, partnerMpTransfersAdvanced(...))`, `calcIvaAmount`, `roundCents` | Mesmos montantes na equipa, serviço, Portal, PDF/Excel e Posição; preservar regra existente |
| Caução pendente/devoluções | Linha transitória vinculada: despesa − devolução, cap zero; órfãs da casa excluem capital 10.1 | Fora do resultado/g5 operacional; créditos identificados por titular, sem ratear transitória Master |
| Aporte/repasse de liquidez/operacional/saldo com cauções | Extrair pools atuais para helper puro partilhado, proposto `settlement-liquidity.ts` | Indicadores com fórmula e ponte explícitas; não confundir com aporte já pago em `partner_capital_moves` |

Preservar g5: BP/transações não duplicam desembolso; `disbursement_adjustment` mantém sinal e nunca vira extra; receitas em contas de acerto, contas do sócio, operações e compensação entram uma vez; propostas `pending_approval` não entram. Base do desembolso continua pela regra existente (incluindo locale onde já se aplica), não pela flag de overhead. Omissão de overhead do acordo não apaga pagamento real pelo sócio nem caução.

Os pools atuais são `pending=min(cauções,max(resultado,0))`, `offset=min(cauções,max(-resultado,0))`, `contribution=max(0,max(-resultado,0)-cauções)` e percentagem efetiva. Essa extração não autoriza ratear novos pools entre nós de bases distintas, usar residual como percentagem ou alterar a imputação de cauções. A projeção deve trazer o perímetro do pool e identificar itens sem atribuição inequívoca; não repetir uma caução em todos os nós. Em caso não coberto pelas regras atuais, bloquear o indicador afetado e decisão Q4, sem bloquear a conta g5 válida nem inventar zero.

Para casos existentes inequívocos, manter os pools como diagnóstico, com campos separados e ponte para g5 (§6.6). Com dispensa de overhead e mudança de sinal, a antiga percentagem/pool pode deixar de representar a obrigação individual: apresentar a diferença e exigir Q4 antes de qualquer comportamento de cobrança novo. Não «corrigir» transferBase para bater com a simulação de aporte.

### 4.3 Cidades, rubricas e Master

Propor `settlement-reconciliation.ts` partilhado: recebe o contexto já calculado, produz `byCity`, `byCategory` e `unallocatedMaster` com net/gross, base exibida, receita total/repartível/Só MP, overhead incluído, excedido e identificadores de origem. É projeção das linhas do total, não novo motor a somar TX. Cada célula indica se é detalhe do contrato ou comparação com o realizado local.

Usar `expandOverheadToSplits`/`overheadLinesFor` (originais na família, fatias na cidade), `expandMasterAdoptedExpensesToSplits`, `master-formula-load.ts`, `master-formula.ts`, `master-revenue-load.ts`/`expandMasterRevenueToSplits`. Receitas Master seguem `revenue_split_mode`/params; não dividir todas igualmente. Despesa Master usa a fórmula existente; filhas reais não contam com a mãe. Sem regra de receita, fica linha Master não repartida; não inventar cidade. Caixa/receitas em poder continuam Master, mesmo quando resultado é repartido virtualmente.

As três verificações por base/perímetro são: soma das linhas canónicas = total; cidades + Master não repartido = resumo; totais de rubricas = o mesmo resumo. Não exigir que a soma dos **resultados locais calculados independentemente** seja o resultado contratual se a política escolhida for excedido agregado (§6.7). Nesse caso o detalhe contratual recebe a atribuição do excedido agregado, e a comparação local é uma coluna diferente, com ponte quantificada.

Q2 escolhe a política do excedido. Recomendação de compatibilidade: conservar a agregação por rubrica da família hoje usada em `computeEventSettlementTotals` para os contratos iniciais; distribuir apenas o detalhe aprovado, sem alterar o total. Para essa política, atribuir o excedido agregado de cada rubrica às cidades/Master em proporção dos excedidos locais positivos, separadamente em net e gross; usar o reconciliador de apresentação existente só para o resíduo de cêntimos. Essa atribuição é documentada, não muda o realizado local. Se não existir base positiva rastreável para atribuição, conservar o termo «Master/não atribuído» e sinalizar inconsistência. Se Pedro escolher política por cidade, mudar a composição **uma vez** no helper partilhado e executar os deltas esperados; isso muda contratos e não pode ser apresentado como simples correção de vista.

## 5. Overhead individual, cascata e provas de conservação

Esta é a proposta de extensão económica sujeita à aprovação de P415-P. Não há implementação nesta entrega.

1. O resultado-base do nó inclui overhead conforme contrato resolvido, independentemente dos cards. Produzir a parte-base de cada participante pela base g4 e pelas percentagens de lucro/prejuízo existentes.
2. Para um externo settles dispensado, obter a base «sem overhead imputável a este acordo» pelo **mesmo pipeline puro** de composição e cascata, removendo só overhead elegível do seu caminho de origem (ancestrais + próprio perímetro). Não remover overhead duas vezes se já devolvido por addback, nem devolver o seu IVA duas vezes. Operações/exclusivos não relacionados não mudam.
3. Essa projeção contrafactual é interna ao motor e usa as mesmas funções, nunca uma fórmula em UI/SQL. Deve transportar linhagem/impacto por nó, incluindo quotas, `vatReturnedIn/Out`, não recuperável e addbacks. É necessário testar tanto overhead do próprio nó como overhead recebido na quota. Não basta somar o overhead local à parte.
4. `shareBase` = parte com contrato normal; `shareFinal` = parte na base sem overhead para o dispensado, escolhendo lucro/perda pelo sinal dessa base; `overheadRelief = shareFinal − shareBase`. Se suporta=true, overhead contratual=false ou modalidade ignora despesas, relief=0. Não assumir que relief=%×overhead quando há mudança de sinal/percentagem.
5. Quotas entre nós, IVA devolvido, resultado do evento e partes dos outros participantes ficam na cascata **contratual**. A dispensa é ajuste individual posterior; a casa absorve a diferença no residual, sem a retirar da quota de um irmão ou voltar a calcular todos sem overhead.
6. Na decomposição usar uma referência-base explícita: `declaredBase`, `ivaDeductibleBase`, `nominalGapBase` são os termos atuais antes das dispensas; `overheadAbsorbedByHouse = −Σ relief` dos externos settles. A casa não recebe dispensa própria. Nominal gap base compara nominal-base com real-base; o gap nominal–real **final** pode ser mostrado como explicação, mas nunca somado outra vez com o relief.

Definições propostas, preservando a âncora e o significado de C1:

```text
A = eventNetResult existente (perímetros + ativos + addbacks + Só MP − IVA não recuperável)
P = soma das partes finais de externos settles (casas não entram em P)
H = A − P
O = −soma(overheadRelief de externos settles)
C1 = P + H − A
C2 = H − (declaredBase + ivaDeductibleBase + nominalGapBase + houseOnlyRevenue + O)
```

Os termos base vêm do mesmo motor antes do ajuste, não de uma cópia do motor. O termo O é assinado: uma dispensa favorável ao sócio reduz H. Na UI «Overhead absorvido pela casa» pode mostrar encargo positivo com sinal de subtração, mantendo o valor assinado no contrato. Se o cálculo produzir benefício inverso por regras de perda/sinal, mostrar o sinal real e levar o caso à revisão; não fazer `abs` nem cap para parecer custo.

Prova geral, antes dos limites de apresentação: se a referência fecha, `Pfinal=Pbase+Σrelief` e `Hfinal=Hbase−Σrelief`; portanto C1 conserva zero e C2final=C2base, porque O é exatamente `−Σrelief`. Esta identidade vale também para relief negativo e mudança de percentagem, e não permite usar O como termo de balanceamento de qualquer outro erro.

Se a política não conseguir explicar C2, o motor devolve erro/`rest` visível. Não atribuir o erro a «overhead absorvido» por diferença residual. Documentos do sócio mostram despesas da raiz e cascata g13 contratual, a sua base/ajuste individual e a parte final; não retiram overhead de todas as despesas do evento para justificar uma exceção pessoal. O seu «Sócios locais» é agregado documental e não se torna soma das partes pagas reais de pessoas ocultas. Relatório interno mostra todos os termos; Portal só os necessários ao seu acordo.

## 6. Exemplos fictícios e reconciliação

Todos os nomes A/B/Casa e valores deste capítulo são **inventados**, sem IDs, bundles ou dados reais. São provas algébricas do desenho a transformar em testes P415-I, não resultados de testes implementados nesta entrega. Nos exemplos, C1=C2=0,00 pelas contas abaixo. Para o mesmo campo/contexto, a diferença exigida entre motor, Encontro, painel, Fecho, relatório, documento, Portal e Posição é 0,00; conceitos diferentes têm pontes, não uma falsa igualdade.

### 6.1 Lucro e dispensa

Raiz s/IVA: receita 1.000, despesa operacional 500, overhead 100 sem IVA; resultado 400. A/B/Casa settles a 30/20/50%, lucro=perda.

| Estado | A | B | Casa declarada | O | Residual casa | C1 | C2 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Todos suportam | 120 | 80 | 200 | 0 | 200 | 120+80+200−400=0 | 200−200=0 |
| A dispensado | 150 | 80 | 200 | −30 | 170 | 150+80+170−400=0 | 170−(200−30)=0 |

A recebe 30% de 500 no acordo individual; o resultado-base do nó continua 400. B e quotas descendentes não mudam. Alternar os cards entre fontes/overhead não muda qualquer célula desta tabela.

### 6.2 Prejuízo e mudança de sinal

Mesmos custos, receita 300, resultado −300. A tem 30% lucro/40% perda; B 20/10; Casa 50/50. Base: A −120, B −30, Casa −150, residual −150. A dispensado: base individual −200, parte −80, relief=40, O=−40, residual −190. C1=−80−30−190−(−300)=0; C2=−190−(−150−40)=0.

Receita alternativa 550: resultado-base −50, A-base −20, B −5, Casa −25. Sem overhead, A vê +50 e usa 30% de lucro: parte +15, relief=35 (não 40 nem 30). Residual −60; C1=15−5−60−(−50)=0; C2=−60−(−25−35)=0. O aporte de liquidez legado não pode substituir esta parte +15.

### 6.3 Bases distintas entre nós, casa nominal e IVA devolvido

Receita 1.000; despesa 400 s/IVA e 492 c/IVA; overhead zero. Raiz c/IVA: A settles 50%, Casa nominal 50%. Filho recebe 50% do resultado c/IVA e o IVA dedutível do pai; B e Casa no filho acertam 50/50, base **s/IVA**.

Raiz: resultNet=600, resultGross=508, vatReturnedOut=92. A=254; Casa nominal=254, nunca declarada. Filho: quota 254 + IVA 92 = resultado 346; B=173, Casa declarada=173. Âncora=600; pagos externos=427; residual=173. C1=427+173−600=0; C2=173−(173+0+0)=0. Casa no filho usa base do filho; não há «casa sempre s/IVA» no cálculo da raiz.

Para provar fontes distintas, acrescentar no perímetro exclusivo do filho BP 50/TX 40, IVA0, sem mudar os custos próprios do pai. Pai committed mantém A=254, quota=254 e IVA devolvido=92. Filho realized: resultado=306, B=153, Casa=153; âncora=560, pagos=407, residual=153; C1=407+153−560=0 e C2=153−153=0. Filho committed: resultado=296, B=148, Casa=148; âncora=550, pagos=402, residual=148; C1=402+148−550=0 e C2=148−148=0. Só muda a seleção do filho, nunca a origem da quota nem o custo escolhido no pai.

### 6.4 Nominal gap e overhead recebido na quota

Raiz s/IVA: receita 1.000, operação 500, overhead 100, resultado 400. A settles 50%=200; B nominal 20%=80; Casa nominal 30%=120. Filho B recebe 20%=80 e B acerta 50%=40. Outro filho recebe 30%=120 e Casa acerta 100%=120. Nominal gap base=80−40=40; declarada=120; residual=160; C1=200+40+160−400=0; C2=160−(120+40)=0.

B dispensado no filho: projeção sem overhead dos ascendentes dá quota 20% de 500=100; B-final=50, relief=10. A continua 200; ambas as quotas contratuais continuam 80/120; residual=150. C1=200+50+150−400=0; C2=150−(120+40−10)=0. O gap final nominal–real é 30; somá-lo com O=−10 duplicaria o ajuste. Este caso impede uma implementação que só retire overhead local (que aqui é zero).

### 6.5 Overhead com IVA e receita Só MP

Raiz c/IVA: receita repartível 1.000; operacional 500+115 IVA; overhead 100+23 IVA. Resultado net=400, gross=262. A/B/Casa 30/20/50: partes-base 78,60/52,40/131,00; IVA dedutível base=138,00; residual=269,00.

A dispensado: base individual gross=385; parte=115,50; relief=36,90; O=−36,90; B=52,40; Casa declarada=131,00; residual=232,10. C1=115,50+52,40+232,10−400=0; C2=232,10−(131+138−36,90)=0. Não alterar ivaDeductibleBase para voltar a absorver o mesmo IVA no termo O.

Adicionar receita Só MP 50 sem IVA: base repartível/partes/quota não mudam; receita do evento=1.050, âncora=450 e residual=282,10. C1=115,50+52,40+282,10−450=0; C2=282,10−(131+138+50−36,90)=0. Documento do sócio não recebe a linha 50; gestão identifica-a. Havendo real Só MP no bucket, uma previsão desse bucket não volta a entrar por falta de real repartível.

Com overhead contratual global false, não há relief individual: na mesma fonte o custo selecionado seria 500/615 e resultado 500/385. Isso é **outro critério contratual**, auditado, e não é o efeito de clicar no card nem uma alteração de imposto. A inicialização decide qual critério se aplica; o plano não o aplica a nenhum evento.

### 6.6 Desembolso, caução, devolução, aporte e saldo

Usar A=120 do caso 6.1, TX não transitórias pagas por A=80, BP elegível pago por A sem dupla contagem=30, ajuste manual=−10, receitas em poder=40, extras=20. Desembolso=110; financiamento=110−10−40=60; base a transferir=120+60−20=160. Com repasse IVA ativo e transferências MP anteriores elegíveis=10, base do IVA=170, IVA=39,10, total=199,10. São três conceitos diferentes, com os mesmos valores em todos os consumidores de cada conceito.

Caução paga por A=100, devolução direta=40: crédito pendente=60, fora do resultado. Nenhum outro crédito. No pool legado de lucro 400, pending=60; A 30% tem resultado pendente=18 e repasse de liquidez=102. Operacional legado=102+80−20=162; saldo com cauções=162+18+60=240. Ponte verificável para g5: 240−160=80=−BP30−ajuste(−10)+receitas40+caução60. Não alterar g5 para 240; explicitar o que o saldo inclui e o que a conta corrente já reconhece.

No prejuízo do caso 6.2 **antes de dispensa**, com caução total 60 e nenhum desembolso/extra: pool perda=300, offset=60, contribuição=240; A40% tem aporte estimado=96, offset=24, repasse de liquidez=−96 e saldo com sua caução=−36. Base g5=−120; ponte=84=24+60. Aporte efetivamente pago tem fonte de capital própria, não nasce deste 96. Se a devolução remanescente extinguir a caução, crédito/pools mudam; resultado/parte não mudam. Repetir com devolução para a casa: não abater a caução de A sem vínculo de titular.

Com dispensa, não há regra aprovada para transformar todos os pools legados numa cobrança diferente. Q4 mantém g5 como obrigação e exige discriminar o diagnóstico; os testes devem detetar a divergência, não apagá-la. Com várias bases de nó, comprovar a atribuição de titular/perímetro antes de calcular pool; caso ambíguo fica indisponível.

### 6.7 Turnê: excedido agregado versus cidade e rateio

Exemplo independente: duas cidades, mesma rubrica, cada uma BP 100. Real cidade A=130, B=70; IVA de todas as linhas=23%.

| Política | Excedido net/gross | Custo net/gross da turnê | Resultado com receita net 300 |
|---|---:|---:|---:|
| Por rubrica na família, atual helper contratual | 0 / 0 | 200 / 246 | 100 s/IVA ou 54 c/IVA |
| Soma do excedido por cidade | 30 / 36,90 | 230 / 282,90 | 70 s/IVA ou 17,10 c/IVA |

Delta económico=30 net/36,90 gross; não é arredondamento. Num acordo s/IVA A/B/Casa 30/20/50, a política família dá partes 30/20/50, pagos externos 50, residual 50; a política cidade dá 21/14/35, pagos 35, residual 35. C1/C2 são zero em ambas, **mas os contratos são diferentes**. Não confundir este exemplo com os 23,70 históricos.

Sob política família, o quadro contratual atribui BP 100 a cada cidade e nenhum excedido; a coluna «desvio realizado local» mostra +30/−30. Sob política cidade, custos contratuais são 130/100. Nenhuma linha é ajustada para esconder a diferença: o agregado escolhido define qual série é contratual, a outra fica comparação. Em casos com excedido agregado positivo, aplicar a atribuição com proveniência descrita em §4.3.

Outro exemplo, só de rateio, sem excedido e IVA zero: receitas locais A=500/B=300, custos locais A=200/B=100, overhead Master=60 repartido igualmente, receita Master repartível=100 com regra 75/25, receita Master Só MP=40 com igual regra. Quadro repartível: receitas 575/325; custos 230/130; resultados 345/195; soma=540, igual a 900−360. Só MP por cidade=30/10, evento=40; âncora final=580. Externos A/B com 30/20% do resultado do nó raiz 540 recebem 162/108, Casa declarada 270 e residual=310. C1=162+108+310−580=0; C2=310−(270+40)=0. A repartição de receita é 75/25, não 50/50; overhead conta uma vez. Se a receita Master não tiver regra, as cidades não a recebem e o quadro conserva uma linha Master 140, com partição 100/40.

Rótulos propostos: card «Resultado da vista»; legenda «Resultado-base do contrato · <fechamento> · <fonte> · <base IVA>»; gestão «Receita do evento», «Receita repartível do fechamento», «Receita só da MP»; parte «Parte contratual de <destinatário>»; casa «Parte declarada» e «Líquido residual da MP». O texto atual «Base do contrato (fecho)» não deve designar receita repartível nem total de caixa; tooltip identifica perímetro e critério. No Portal, a referência ao nó técnico fica fora do documento estanque.

### 6.8 Excedido net zero / gross positivo e #414

Exemplo fictício: BP 100 a IVA0, real 100 a IVA23 na mesma rubrica; excedido net=0, gross=23. Com receita 200 e acordo c/IVA, custo=123 e resultado=77. A/B/Casa30/20/50 dão 23,10/15,40/38,50; âncora net=100, IVA dedutível=23, residual=61,50. C1=23,10+15,40+61,50−100=0; C2=61,50−(38,50+23)=0.

Entrega #414 encontrada: `computeOutsideBpExcessLines` mantém net/gross independentes; `SettlementExpenseDocLine.gross` atravessa `collectSettlementExpenseDocLines`; `partner-statement-doc.ts` usa o bruto explícito e verifica o resultado/cascata. `supabase/functions/_shared/settlement/issue414-statement.test.ts` cobre net zero/gross positivo, colunas detailed/totalOnly, base efetiva net, arredondamentos e alertas de raiz/cascata. Reutilizar esta correção, não reconstruir uma taxa fictícia nem editar as suas expectativas/fixtures.

Limite de cobertura: `vitest.config.ts` inclui `src/**/*.{test,spec}.{ts,tsx}`; o ficheiro #414 em `_shared` não é descoberto diretamente pelo comando completo. P415-I deve adicionar uma ponte de teste em `src/test/issue415-statement-regressions.test.ts` que importe os testes existentes e acrescente os cenários fictícios, sem alterar configuração/workflows nem o teste original. Presença do código/teste não prova Publish ou deploy da #414, nem encerra a Issue.

### 6.9 O cêntimo BP/real e a regra existente

`_shared/settlement/iva.ts`: `roundCents` normaliza a 15 dígitos significativos, reescala exponencialmente e arredonda simetricamente half-away-from-zero; `calcIvaAmount`/`calcTotalWithIva` aplicam IVA por linha. Manter a implementação. Arredondar componentes da conta g5 antes do total, como g15-b/g17. Não usar taxa média, truncatura ou outra fórmula de IVA.

`reconcileDisplayValues/Field` do modelo interno já arredonda **linhas de apresentação** em half-even e atribui o resíduo à maior linha absoluta, última em empate, preservando total autoritativo. Conservar o âmbito estritamente visual desse mecanismo; não é regra fiscal nova nem autorização para absorver diferenças de fonte.

Não usar o reconciliador para mudar a parte canónica de uma pessoa ou a sua base a transferir. Se a soma das partes publicadas diferir do total publicado pelo motor, o ensaio deve expor esse cêntimo e conferir os limites de arredondamento existentes no produtor; não «corrigir» uma linha individual, esconder em overhead ou aceitar paridade com tolerância de 0,01. Detalhes itemizados reconciliados não podem substituir os montantes de obrigação do modelo.

Exemplo fictício de precisão de entrada: BP de receita 10,005 e real 10,00 podem produzir apresentação 10,01 versus 10,00. Se há real no bucket, `computeSettlementRevenue` seleciona o real; não somar ambos nem mudar a expectativa para obter igualdade. Protocolo para o 0,01 histórico: identificar a linha/origem escolhida, precisão guardada, fonte do bucket, IVA por linha, fase do arredondamento e consumidores; comparar entradas idênticas antes de culpar `roundCents`. Se a diferença estiver nos dados, anexar prévia de correção para despacho DML separado. Se for recálculo local, trocar pelo resultado canónico. Reconciliação visual só pode distribuir resíduos demonstrados de apresentação; divergências de cálculo/perímetro continuam visíveis e impedem aceitação.

## 7. Selo, congelamento, fontes SQL e rollback

Propor snapshot v2, mantendo parser v1: versão do contrato/contexto, valores efetivos e proveniência por nó, revisão, flags por participante, share-base/relief/share-final, decomposição residual e conferências, subárvore e referências às linhas/base documental necessárias. Hash/revisões vinculam o snapshot às entradas validadas; hash sozinho não prova verdade dos montantes enviados pelo cliente. Servidor verifica autorização, revisões e estados e recusa contexto obsoleto; o cálculo continua TS partilhado, sem réplica SQL. Definir a validação servidor na etapa R2 com as fontes disponíveis, sem alegar recálculo servidor que não existe hoje.

Mover o parser/modelo puro do selo para `_shared/settlement/settlement-seal.ts`, com shim em `src/lib/settlement-seal.ts`, para serviço e browser lerem as mesmas versões. Edge não importa código de `src/` nem de outra função. A validação v2 é estrita; falha não cai para cálculo ao vivo ou parser v1 permissivo.

Selado: contrato/flags/perímetro/ancestrais que o afetam não mudam; consumidores contratuais usam o snapshot suportado e não recalculam quota a partir dos cards. Comparação ao vivo é interna e separada. Snapshot antigo incompleto não se enriquece com valores atuais como se fossem históricos; preservar o que contém e marcar as parcelas sem prova. Impedir novas emissões que dependam de informação histórica ausente até resolução autorizada. Reabrir exige fluxo/motivo existentes e não reescreve BP/snapshot anterior. Congelamento de participante/contratos ativos é dependência adicional: não atualizar acordo por trás da parte congelada; usar os RPCs existentes de descongelar/cancelar e suas condições. Não tocar contratos pagos/conciliados para obter paridade.

Selar/fechar evento preserva os bloqueios canónicos de sessões/circuitos, revisão de verba BP, cachê congelado e estágios (`event_close_blockers` e fontes servidor existentes). A #415 não promove estado nem afrouxa essas condições para conseguir emitir um documento. Não substituir as conferências atuais do motor pelas antigas designações «C1 receitas/C2 sócios» do procedimento histórico.

`buildFreezeValues` e `buildShareOrigin` passam a projetar a parte final e o ajuste do contexto; `readFrozenOrigin` continua a ler apenas o snapshot. Não atribuir diferença desconhecida a «Outros/arredondamentos» para legitimar nova origem. Limitação atual documentada: freeze aceita share enviado pelo cliente; não chamar a isso certificação financeira pelo servidor.

### Fontes versionadas e informação essencial ausente

| Disponível por leitura local | Falta antes de fechar R2/aplicar |
|---|---|
| Migrações históricas `20260912223728_d789b3f5-a3b4-4fa4-9b60-f049cedff4bc.sql`, `20260913021127_911735a4-a1a6-4245-9080-9abed744c4ad.sql`, `20260913021445_f4057ed5-6118-40b2-a57e-1a74faf879a5.sql`, `20260913030313_e3c5005d-f363-47d8-8f17-8c4beb74af5d.sql`; `drizzle/migrations/0071_collect_event_benchmarks.sql` | DDL instalado e cadeia efetiva de substituições de tabelas, defaults, checks, índices, FKs e triggers dos fechamentos; não concluir que uma versão histórica é a última |
| `supabase/manual/0296_issue404_excluded_from_partner_settlement.sql`, `0297_issue413_house_only_inherit_from_bp.sql` | Corpos/estado instalado das guardas Só MP e herança, catálogo de triggers e confirmação de promoção; preservar as duas reservas |
| `supabase/manual/0270_p1_freeze_guard.sql`, `0275_p3_unfreeze_requires_no_contracts.sql`; RPCs referidos em `partner-contracts.ts` | Definições atuais de freeze/unfreeze, contratos e todas as guardas que bloqueiam alterações em nó/participante/linhas |
| Chamadas `seal_event_settlement`, `unseal_event_settlement`, `create_bp_snapshot` e snapshot v1 no cliente | Corpos atuais/assinaturas/overloads, ownership, ACL efetiva, RLS, bypass e ordem real dos locks; comportamento em corrida com o novo comando |
| `system_audit_log`, gates de papéis/permissões referidos pelo código | Definições atuais de auditoria, `current_company_id`, `has_permission(_in)` e resolução de admin/manager; papéis técnicos que possam escrever diretamente |
| Clientes do Portal e Posição, RPCs citadas nas memórias | Contratos/corpos atuais de `get_partner_settlement_summary`, `get_partner_event_tx_aggregates`, `get_financial_position_base` e leitores legados ainda ativos, com ACL e isolamento |

Nenhuma dessas lacunas impede escrever este plano; impedem afirmar que o patch R2 é instalável ou que uma guarda cobre todos os writers. O executor deste despacho não as obtém em serviços. O responsável autorizado fornece export **só de definições**, com data, ambiente, hashes e proveniência, sem dados/segredos. Antes de preparar R2, comparar por leitura com o catálogo fornecido e resolver ordem/escopo. Não tocar #352/replay/bindings privados nem abrir acesso para suprir a lacuna.

Rollback proposto: schema aditivo, histórico e snapshots preservados; não apagar colunas/logs para «voltar atrás». Antes de ativar, exportar manifesto/revisões/configurações aprovadas como evidência autorizada. Se falhar homologação, não ativar; o código anterior continua no ambiente anterior. Após corte, suspender edições/novas emissões do contrato afetado e manter último snapshot válido; não restaurar uma versão que reconecte os cards ao acordo. Correção por roll-forward; rollback de configuração por comando compensatório auditado, com revisão atual e bloqueios do selo/contratos respeitados. Qualquer reversão SQL/aplicação requer plano próprio e Sim, sem DML automático ou drop destrutivo neste despacho.

## 8. Lista fechada proposta de implementação e dependências

Esta lista é **proposta para novos despachos**, não amplia a lista de escrita desta execução. Ficheiro não enumerado exige revisão de âmbito antes de edição. Não reservar número SQL nem assumir posse de reservas existentes.

### 8.1 Etapas por dependência real

| Etapa | Entregável autónomo | Gate seguinte |
|---|---|---|
| P415-P (agora) | Estes dois documentos; plano completo, limites e testes locais | Revisão por leitura e respostas Q1–Q4 |
| P415-R2 preparação | Contrato aditivo, comandos, validação/permissões, auditoria, selo e rollback em ficheiros, com ensaios locais sintéticos | Fontes SQL fornecidas; autorização R2 e reserva; nenhuma aplicação implícita |
| P415-A aplicação estrutural | 0/frente autorizada promove estrutura no mp-homolog-3 e depois Live com Sim por passo; ensaios sintéticos de comandos | Colunas/RPCs disponíveis, ACL/guardas provadas; nenhum backfill ou inicialização operacional nesta etapa |
| P415-I | Único conjunto coerente de código/tipos/testes/i18n e leitores/writers do contrato em homologação | tsgo/Vitest completos verdes; paridade/homologação e inicialização aprovadas antes do corte |
| P415-PUB e inicialização | 0 coordena código público e reimplantação das duas edges; só depois aplica manifesto por comando com prévia/Sim de dados próprios | Sim de Publish/deploy, inicialização deliberada, validação publicada e SHA completo |

P415-I inclui núcleo `_shared` e handlers de edge, logo não cabe numa autorização R1 que proíba `supabase/`. A sua parte R2 deve ter autorização explícita para ficheiros; aplicar/deploy continuam capacidades separadas. Não publicar UI que espere coluna ausente, nem núcleo novo com exportador/Portal antigos. Se o mecanismo exigir PRs separados R2/R1, preparar o núcleo compatível primeiro e só ativar o conjunto após ambos; cada PR tem de ficar verde sozinho. Não separar componentes de tipos, testes e textos apenas para caber numa run.

### 8.2 Caminhos da proposta P415-I

**Núcleo e tipos (classe adequada aos caminhos):**

- `supabase/functions/_shared/settlement/settlement-contract.ts` (novo), `settlement-reconciliation.ts` (novo), `settlement-liquidity.ts` (novo), `settlement-seal.ts` (novo módulo partilhado para o selo existente).
- `supabase/functions/_shared/settlement/event-settlement-inputs.ts`, `event-settlement-engine.ts`, `statement-service.ts`, `partner-disbursement.ts`, `partner-statement-doc.ts`, `partner-settlement-internal-report.ts`.
- `src/lib/settlement-contract.ts`, `settlement-reconciliation.ts`, `settlement-liquidity.ts` (novos shims); `src/lib/settlement-participants.ts`, `settlement-seal.ts`, `partner-contracts.ts`, `partner-settlement-report.ts`, `event-contract-result.ts`, `invalidate-event-financials.ts`, `src/integrations/supabase/types.ts`.

`settlement-revenue.ts`, `iva.ts`, `fecho-filters.ts`, `settlement-perimeter.ts` e helpers de rateio existentes são dependências **reutilizadas sem mudar regras**, não alternativas a reimplementar. Se surgir defeito que exija editá-los, propor os caminhos e o impacto antes de editar; `roundCents` permanece inalterado.

**Hooks, UI, documentos e endpoints (juntos com as provas correspondentes):**

- `src/hooks/useEventCostBasis.ts`, `useFechoBasis.ts`, `useEventSettlementEngine.ts`, `useEventContractResult.ts`; novo `src/hooks/useSettlementContract.ts`.
- `src/components/EventFinancialCard.tsx`, `src/pages/EventDetail.tsx`, `src/components/FechoBasisSelector.tsx`, `EventPartnersTab.tsx`, `EventSettlementsManager.tsx`, `EventSettlementsPanel.tsx`, `SettlementSealControl.tsx`, `PartnerSettlementTab.tsx`, `EventFecho.tsx`, `ReportPartnerSettlement.tsx`, `PartnerDisbursementDetail.tsx`, `PartnerPaymentDialog.tsx`.
- `src/lib/export-partner-statement-doc.ts`, `export-partner-settlement-internal-pdf.ts`, `export-partner-disbursement.ts`; exportadores recebem o mesmo modelo, sem fórmulas novas.
- `src/pages/PartnerEventDetail.tsx`, `src/components/partner/PartnerSettlementBlock.tsx`, `PartnerFinancialCards.tsx`; `supabase/functions/partner-statement/index.ts`, `supabase/functions/financial-position/index.ts`.
- `supabase/functions/_shared/financial-position/assemble.ts`, `src/lib/financial-position-p5.ts`, `src/hooks/useFinancialPositionP5.ts`, `src/components/financial-position/P6bSections.tsx` para transportar/mostrar decomposição quando necessário; não mudar o SQL base da Posição.

Textos pt-PT/pt-BR e dicionários documentais existentes em `partner-statement-doc.ts` entram com os respetivos consumidores e testes. Não criar infraestrutura i18n separada. Colunas «Só total pago», agrupamento de receitas e estanqueidade continuam nos modelos partilhados. Modais conservam cabeçalho/dismissal fora da área rolável; eventuais campos de data alterados usam `src/components/ui/date-picker.tsx`, `dd/MM/aaaa`, clearable quando opcional. Não autorizar migração global de datas.

**Novos testes de aceitação propostos, todos fictícios e descobertos por Vitest:**

- `src/test/issue415-contract.test.ts`: esquema estrito, herança, ausência de configuração, seleção por perímetro/fonte, revisão e cache.
- `src/test/issue415-overhead.test.ts`: casos 6.1–6.5, sinal/perda, quota ancestral, IVA devolvido/não recuperável, addback e C1/C2; nenhum relief duplo.
- `src/test/issue415-reconciliation.test.ts`: caso 6.7 nas duas políticas, Master não repartido, net/gross, Só MP e origens; cidades/rubricas/resumo iguais por conceito.
- `src/test/issue415-account.test.ts`: g5, bridges do caso 6.6, `kind`, despesas aprovadas, BP/TX deduplicados, compensação, repasse IVA com MP anteriores, cauções/devoluções/capital separados.
- `src/test/issue415-consumers.test.tsx`: mesmo contexto nos ecrãs/relatório; clicar nos cards deixa parte, base, C1/C2, documento e Posição inalterados; controlo só com 2+ settles, rejeição preserva valores.
- `src/test/issue415-statement-regressions.test.ts`: ponte #414 + modelos fictícios equipa/Portal/PDF/Excel, detailed/totalOnly, privacidade e mismatches de origem explícitos.
- `src/test/issue415-seal.test.ts`: compatibilidade v1/v2, snapshots incompletos, alteração ao vivo não muda congelado, revisões e emissão bloqueada sem prova.
- `src/test/issue415-permissions.test.ts`: ensaios locais R2 com credenciais fictícias e catálogo fornecido, concorrência editar/selar/mover/dispensar, papéis e ACL; sessão fiel ao ator, sem rede.

Reexecutar os testes existentes de engine, settlement-perimeter/revenue, disbursement, transfer-vat-mp, internal-report, settlement-seal, documentos, `issue404-house-only-revenue.test.ts`, switch #404, rateios Master/cidade e Posição. Não alterar expectativas/fixtures/skips para acomodar regressão. Baselines antigas com dados históricos não fornecem novos exemplos; não copiar bundles reais para novos testes.

### 8.3 R2, reservas e leitores que ficam fora da edição

Os futuros ficheiros de migração/manual/rollback só recebem caminhos concretos quando o responsável de R2 conferir o catálogo e o próximo identificador livre; não fixar `0298` nem qualquer reserva antecipada. Essa futura lista de escrita deve ser anexada ao despacho R2. Não produzir SQL agora. Atualização das três memórias de feature cabe ao agente/conector autorizado no mesmo ciclo de implementação, com decisão de 31/10 e fórmulas removidas documentadas; `.lovable/` continua proibido ao executor E2b deste despacho.

Sobreposição comprovada no QUADRO: #404 reserva núcleo de receita/inputs/motor/serviço, PartnerSettlementTab, EventFecho, relatórios, documentos e edges; #413 reserva herança Só MP e editores de TX/BP. Ambas devem ser coordenadas/libertadas pelo dono antes de P415-I, nunca assumidas pelo executor. P7/Posição constam com reservas libertadas, mas a informação local não prova reservas por comentário posteriores; o 0 confirma no despacho. Este plano não atualiza QUADRO/estado nem toca nas reservas.

`src/pages/Events.tsx`, `useEventFinancialCardData.ts`, `report-event-cost.ts`, DREs, Rentabilidade e `export-dre.ts` são leitores mapeados que continuam no domínio visual/contabilístico; não migrar os seus custos para o contrato. `src/lib/export-partner-statement.ts` tem um homónimo `buildPartnerStatement` de extrato; não confundir com `statement-service.ts` nem migrá-lo por nome. Scripts autenticados e wrappers SQL legados são inventariados como dependências; alteração só se o inventário de chamadas demonstrar participação no fecho atual, com revisão de âmbito.

## 9. Aceitação e ensaio dos seis eventos

### 9.1 Gates de implementação

| Gate | Predicado verificável |
|---|---|
| G1 separação | Mudar qualquer seletor de card altera só vista; contrato/revisão/parte/base/documentos/Posição permanecem idênticos |
| G2 configuração | Só admin/gestora gravam decisão com motivo/revisão; falha/concorrência não deixa auditoria de sucesso nem alteração parcial |
| G3 proteção | Selo e congelamento aplicáveis recusam alterações diretas/indiretas; v1 não ganha informação histórica inventada |
| G4 motor único | Nenhum consumidor multiplica resultado por percentagem nem recompõe custos g5; recebe modelo tipado do contexto |
| G5 conservação | Todos os cenários sintéticos válidos têm C1=C2=0,00; erro de configuração continua erro, sem ajuste de dados para fechar |
| G6 reconciliação | Diferença por campo/mesma base entre consumidores=0,00; cidades+Master e rubricas fecham o resumo; conceitos distintos exibem ponte |
| G7 regressão | #404/#413 e #414 preservadas; IVA/câmbio/quarentena intactos; totalOnly e documentos estanques não vazam participantes |
| G8 Posição | Gate JWT/base RPC, estágio/ano, cobertura todos os anos e slots nomeados preservados; evento inválido deixa output incompleto, sem soma parcial |
| G9 qualidade | tsgo e Vitest completos verdes sem alteração de expectativas/fixtures/skips/workflows; CI remoto verde no SHA do futuro PR |
| G10 operação | Manifesto dos seis, dados autorizados, homologação, deploy/Publish e prova do SHA publicados registados antes de fechar operacionalmente |

### 9.2 Disponibilidade real das referências

As memórias referem prova histórica de seis eventos/13 participantes. O script enumera raízes visíveis à sessão, não contém um manifesto fixo de seis eventos aprovado para #415. Nesta entrega **não há seis bundles contemporâneos fornecidos nem lista completa autenticada de identidades/revisões/fontes**. Não fabricar a lista a partir de nomes mencionados nas memórias e não recuperar dados reais para fixtures.

Protocolo reserva seis posições R1–R6 no manifesto operacional; **todas aguardam identificação e fontes pelo responsável autorizado**. A seleção tem de cobrir conjuntamente: raiz simples com lucro; prejuízo e perda diferente; árvore com bases IVA distintas/casa nominal; nominal gap/IVA devolvido/addback; turnê com cidades/Master/overhead; Só MP e excedido net zero/gross positivo. Se os seis eventos históricos não cobrirem tudo, mantê-los para paridade e cobrir os cantos em testes sintéticos adicionais, sem trocar silenciosamente as referências.

Para cada posição: empresa/ID autorizado fora das fixtures públicas, nós/participantes e revisões, fonte/overhead escolhidos por Pedro, estado de selo/freeze, timestamp/corte e proveniência das fontes, hashes dos artefactos autorizados, versão do motor, papel de leitura e resultados antes/depois. Não presumir que o script pode autenticar nem que um ficheiro com nome «live» é bundle suficiente. `ab_module` tem limitação conhecida entre hook e serviço; exigir fonte canónica atual equivalente ou marcar paridade desse caso bloqueada, nunca completar com zero guardado.

### 9.3 Ensaio futuro autorizado

1. Fechar Q1–Q4 e obter definições SQL/manifesto. O responsável operacional valida o conjunto de seis, os selos e o critério histórico desejado antes de qualquer comparação. Corte financeiro segue os períodos de implantação de saldo das contas quando o conceito envolver caixa; não misturar importação histórica com falha atual.
2. Em ambiente autorizado, capturar um conjunto consistente de entradas por evento, sem mutação e sem envio externo. Congelar o conjunto de comparação: não comparar duas leituras separadas enquanto receitas/transações mudam. Dados ficam no repositório/armazenamento operacional autorizado, não em novas fixtures públicas.
3. Calcular baseline e candidato sobre as **mesmas entradas e configurações aprovadas**. Primeiro provar modo de compatibilidade sem dispensa e sem mudança de política: diferenças 0,00 em resultado de cada nó, parte, residual, g5 e total. Se a baseline contém a fórmula paralela errada, registar a divergência e a justificação canónica; não exigir preservar um erro nem esconder delta com fixture nova.
4. Executar variações de vista, dispensa e política aprovadas. Para alterações económicas deliberadas, comparar com deltas previstos e assinados; paridade 0,00 é entre consumidores do novo contrato, não exigência de que uma dispensa não mude a parte. Provar C1/C2 e pontes, seletor/selo/privacidade por papel e tenant.
5. Comparar Encontro, Sócios/Fechamentos, Fecho, relatório global/interno, PDFs/Excel da equipa e Portal, freeze novo e Posição (incluindo estágio/ano/incompleto). Mesma moeda, base, perímetro, revisão e identificação do conceito em cada coluna. Linha nominal não é pagamento real; saldo com caução não é transferBase.
6. Publicar relatório assinado de seis linhas com anexos por nó/participante: disponibilidade das fontes, diferenças exatas e decisão de cada delta. Falha ou fonte ausente impede declarar paridade/homologação integral. Não executar `scripts/prove-settlement-engine.ts` como substituto: replica fórmulas antigas e requer sessão.
7. Com estrutura já promovida por P415-A e ensaios/homologação aceites, pedir Sim para Publish/deploy coordenado de `partner-statement` e `financial-position` pelo 0. Inicialização/DML associado só depois do Publish, com prévia e Sim próprios, como PROC-promocao. ERP pode receber shared via build e Portal só após reimplantação: confirmar ambos e a leitura por configurar durante a janela autorizada.
8. Depois do Publish, seguir `docs/procedimentos/PROC-verificar-versao-publicada.md`: ler `/version.json` na origem esperada e comparar **SHA completo** com o aprovado; `commit:null` é inconclusivo. `builtAt`, marcador funcional ou build novo não provam equivalência de todo o código. A versão de cada edge exige recibo/proveniência próprios; `/version.json` da UI não prova deploy de função.
9. Revalidar os seis consumidores operacionais no conjunto autorizado e registrar o que foi verificado depois da publicação. Só então propor fecho da Issue; P415-P por si não autoriza nenhuma dessas operações.

## 10. Perguntas fechadas e condições de avanço

As decisões de 31/10 (vista separada, overhead por omissão e dispensa suportada pela casa) já estão fechadas e não são reabertas aqui. Falta escolher parâmetros e aprovar as propostas necessárias:

| ID | Pergunta a Pedro | Recomendação / consequência |
|---|---|---|
| Q1 | Para **cada evento/nó** do manifesto, escolhes `Realizado` ou `Previsto + excedido`, overhead contratual `Sim/Não` e «Suporta overhead» de cada participante `Sim/Não`, confirmando cada linha na prévia? | Nenhuma seleção histórica pelo executor; overhead novo proposto Sim, sem copiar cards. Sem manifesto aprovado não há inicialização |
| Q2 | O excedido contratual da turnê fica **A: por rubrica da família**, com detalhe atribuído rastreável, ou **B: soma do excedido por cidade**? | A conserva a composição contratual encontrada; B altera custos/partes no exemplo em 30 net/36,90 gross e exige aprovação do impacto por evento. Em ambas, comparação local e contrato têm rótulos distintos |
| Q3 | Aprovas **A: filhos herdam fonte/overhead do ancestral, com override deliberado por nó**, ou **B: cada nó exige escolha explícita sem herança**? | A reduz duplicação de configuração e mantém proveniência; bloqueia mudança herdada que afete selo. Ambas impedem fallback para cards |
| Q4 | Confirmas **A: conta corrente g5 continua o valor contratual a liquidar e pools/aporte/operacional são diagnóstico de liquidez com pontes**, ou pretendes **B: nova regra de liquidação com cauções/dispensa**? | A não cria regra de cobrança e explicita fórmulas existentes; B requer despacho de decisão com exemplos de lucro/prejuízo, múltiplos nós/titulares e mudança de sinal antes de implementar esses comportamentos |

Aceitação do plano inclui a convenção de C2 com termos-base e overhead assinado (§5), o limiar de participantes do §3.2 e snapshot sem enriquecimento histórico. Se Pedro não aprovar uma dessas propostas, devolver alternativa concreta antes de R2; não transformar a ausência de resposta em aprovação.

Bloqueios delimitados: catálogo instalado/ACL/guardas ausentes impedem preparar aplicação R2 certificada; manifesto inicial ausente impede escolher acordos; seis fontes ausentes impedem paridade operacional; SHA publicado/deploy não observados impedem declarar publicação/fecho. Nenhum bloqueia esta entrega documental. Não há autorização para alterar dados, fiscal/câmbio/quarentena, #352 ou reservas #404/#413.

## 11. Validação desta entrega documental

Antes da escrita, o código local passou `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` (exit 0) e `bunx vitest run` (exit 0): 347 ficheiros aprovados, 2 skipped; 3.639 testes aprovados, 6 skipped e 11 todo existentes. Nenhuma expectativa, fixture, skip ou workflow foi alterado. A execução padrão não descobre diretamente o teste #414 em `_shared`, limite descrito em §6.8.

Os cenários deste plano são especificação algébrica, não testes novos implementados: as 15 linhas de conservação e as pontes g5/liquidez foram conferidas localmente com aritmética decimal, sem ficheiros adicionais. A repetição final dos dois comandos completos terminou com exit 0 e os mesmos resultados da baseline. Verificação final da árvore documental e comandos completos consta em `.executor/resumo.md`. CI remoto, paridade real dos seis, homologação, SQL/configuração, publicação e validação de SHA ficam pendentes das etapas autorizadas acima.
