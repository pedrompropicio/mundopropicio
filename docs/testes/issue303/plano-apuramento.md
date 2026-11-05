# #303 — Plano de implementação do apuramento Ticketline

Preparação E2b de 05/11/2026. Autorização 6666841381; reserva 6666842027; regras 6666762025. Base de código: commit `4614c7a19882b388362bed61c8002b22c36bf478`. Este documento é um plano, não uma declaração de instalação ou de conferência de dados remotos. Nesta entrega só se escrevem este ficheiro e `.executor/resumo.md`; os caminhos dos runs abaixo são propostas para despachos posteriores. Não se escreve nem executa SQL, código de produto, testes ou migrações nesta tarefa.

## 1. Base conferida e decisões aplicáveis

Leitura de arranque: `docs/INDEX.md:123` (ritual), `docs/QUADRO.md:43` (execuções) e `docs/QUADRO.md:283` (frente 3); pesquisa em `docs/` e nas memórias antes de desenhar a solução. Memórias lidas: `.lovable/memory/features/ticket-office-statements.md`, `ticket-office-reconciliation.md`, `ticket-revenue-single-rule.md` e `ticket-office-sales-scope.md`. Consultados também `docs/manual/bilheteiras.md` e `docs/procedimentos/PROC-conciliacao-ticketline.md`.

### 1.1 As seis regras estão fechadas

O despacho prevalece sobre a proposta antiga da D-ERP247. Nenhum run ou pergunta abaixo reabre estas escolhas:

| Regra | Contrato e prova de aceitação exigidos |
|---|---|
| 1 — Só Ticketline | Todas as novas escritas e leituras operacionais do apuramento verificam o identificador canónico da conta Ticketline da empresa; outra bilheteira é recusada. Não identificar pelo nome visível. |
| 2 — Quota do evento = líquido declarado no PDF | Guardar o líquido documental por evento e a sua origem; a decomposição bruto − deduções tem de o reproduzir ao cêntimo. Não ratear o saldo do documento pelas vendas. |
| 3 — Negativo transporta | O saldo final negativo entra, com o mesmo sinal e uma única vez, como `carry_over` no apuramento seguinte da mesma conta; não se atribui ao evento futuro. |
| 4 — Selados congelados | Preservar valores, documentos, autoria e snapshots selados; uma ligação documental nova não recalcula nem substitui o fecho selado. |
| 5 — 25 adiantamentos só histórico | Preservar as 25 linhas e todas as ligações; não converter, desligar, apagar ou voltar a subtrair esses registos. |
| 6 — Confirma admin | Só uma sessão com papel admin na empresa confirma, em guarda de servidor; manager, permissões de gestão e chamadas do assistente não substituem esse papel. |

### 1.2 Código encontrado: o que existe e o que falta

As referências seguintes descrevem o repositório, incluindo candidatos expressamente preparados. Não provam o catálogo instalado. R1 de documentação não autoriza consulta ou intervenção em Live.

| Área | Evidência ficheiro:linha | Consequência para a implementação |
|---|---|---|
| Fecho por evento | `src/integrations/supabase/types.ts:19532` expõe conta, evento, bruto, deduções, `net_calculated`, ajuste, transferência, estado e retenções; `src/integrations/supabase/types.ts:19557` expõe `statement_id`. | Reutilizar o fecho e os seus vínculos; não confundir com `event_settlements`, que é o fecho dos sócios. Tipos gerados não demonstram CHECKs/ACL instalados. |
| Histórico antigo | `src/integrations/supabase/types.ts:12615` expõe evento, conta, transação e fecho dos adiantamentos; `drizzle/migrations/0078_derp232_direito_do_evento.sql:17` exige transação ou fecho e bloqueia INSERT/UPDATE/DELETE. `src/components/TicketOfficeAdvancesPanel.tsx:274` explica a ausência de valor probatório da atribuição por evento; os comandos estão desativados em `:278` e `:337`. | Conservar tabela, CHECK e trigger; retirar apenas a dependência operacional futura. O número 25 vem do despacho e do estado documental, não de uma contagem nesta sessão. |
| Cabeçalho de apuramento | `drizzle/migrations/0077_derp231_ticket_office_statements.sql:4` já cria `ticket_office_statements`, com número único por conta em `:20`, data, total, documento e `draft/confirmed`. | Evolução aditiva da tabela existente; não a recriar. |
| Linhas | `drizzle/migrations/0077_derp231_ticket_office_statements.sql:23` já cria linhas com referências opcionais e `pending_document`; o CHECK em `:27` usa **`event_right`**, não `event_sales`; `:44` impede reutilizar `transaction_id`. | Compatibilidade explícita e versionada; o nome histórico não prova se o valor era venda após retenção ou direito já líquido. Não renomear/reinterpretar linhas congeladas. |
| Confirmação atual | `drizzle/migrations/0077_derp231_ticket_office_statements.sql:91` define `confirm_ticket_office_statement`; `:95` bloqueia o pai; `:98` admite admin, manager e platform_admin; `:103` soma linhas e conta pendentes; `:109` grava estado/autoria. | A soma já tem uma guarda. Falta alinhar com admin apenas e fechar entradas diretas e validações documentais/relacionais. |
| Escrita direta e imutabilidade | `drizzle/migrations/0077_derp231_ticket_office_statements.sql:49` concede CRUD a authenticated; políticas de escrita em `:58` e `:65` admitem manager; o trigger `:72` protege linhas, não um cabeçalho completo. | Não basta esconder o botão: proteger também cabeçalho, estado, anexos e ligações contra escrita direta, regressão para rascunho e DELETE em cascata. |
| Concorrência das linhas | `drizzle/migrations/0213_issue333_tosl_guard.sql:1` identifica um candidato inerte; `:25`–`:41` bloqueia ambos os pais OLD/NEW em ordem de identificador antes de consultar estado. | Preservar esse protocolo; confirmar a presença do candidato na revisão de catálogo futura. Não substituir pelo trigger mais antigo sem locks. |
| Cálculo do direito | `src/lib/ticket-office-settlement-calc.ts:9` ignora `totalAdvances`; `:48` calcula o saldo restante de fatura; `:51` calcula bruto − deduções − retido − saldo restante aplicado. | A fórmula D-ERP232 já existe. Reconciliar com a quota documental, sem reinserir repasses ou deduzir a mesma fatura duas vezes. |
| Modal de fecho | `src/components/TicketOfficeSettlementModal.tsx:59` permite editar confirmados a `isAdmin`; `:306`–`:322` exclui transações históricas e linhas `advance/carry_over`; `:468` chama o cálculo puro; `:483` lê o apuramento; `:653` evita transferência própria quando já está ligado ao apuramento. | Acrescentar apresentação da quota documental e bloqueio por selo; a ligação tem de existir antes da confirmação para não produzir repasse por evento. Não presumir uma guarda de selo por existir uma guarda de estado. |
| RPC que grava o fecho | `src/components/TicketOfficeSettlementModal.tsx:659` chama `save_ticket_office_settlement`. O corpo de `drizzle/migrations/0094_derp_296_triggers_own_invoice_paid.sql:39` valida sessão/empresa; `:62` bloqueia e atualiza/cria o fecho; `:115` pode criar transferência; `:129` liquida deduções; `:155`–`:187` gere pagamentos da sala; `:190` marca conciliação. | Confirmar apuramento será documental: não reutilizar esta operação para voltar a pagar despesas ou criar transferências. A gravação de fechos futuros Ticketline precisará de uma guarda própria para quota e selo. |
| Outra versão preparada | `drizzle/migrations/0323_issue314_fecho_entrada_sem_conta.sql:2` declara PREPARADA, NÃO APLICADA; `:27` redefine `create_settlement_transfer`; `:139` redefine `save_ticket_office_settlement`. | Antes de preparar novos corpos, conferir a revisão efetiva e coordenar #314; não sobrescrever o corretivo nem alegar que já está instalado. |
| Estorno | `src/components/TicketOfficeSettlementsPanel.tsx:184` chama `reverse_ticket_office_settlement`; o corpo em `drizzle/migrations/0067_derp219_delete_cascade_settlement_reverse_forecast_amount_rateio.sql:119` valida admin/empresa, `:130` elimina pernas, `:141` reverte despesas e `:148` tenta desligar adiantamentos. | Barrar estorno automático de fecho selado/ligado a apuramento confirmado antes de efeitos financeiros; preservar histórico e testar a interação com o bloqueio de UPDATE dos adiantamentos. |
| Rubrica 10.3 | `src/lib/ticket-office-balance.ts:35` descreve o par expense/income; `src/lib/ticket-office-settlement-eligible.ts:12`–`:21` exclui a transferência própria e movimentos fora do resultado antes de verificar elegibilidade; `supabase/functions/_shared/settlement/fecho-filters.ts:22` exclui `exclude_from_result` do resultado. | `advance` liga à perna de saída da conta Ticketline; a entrada bancária não é receita nova. Não usar transferência como dedução do direito. |
| Saldo canónico | `src/lib/ticket-office-balance.ts:79`–`:99` filtra movimentos pelo pago e só considera adiantamentos sem ambos os vínculos; `:102` soma vendas e movimentos. `src/components/TicketOfficePositionCards.tsx:24` usa vendas agregadas e `:29` lê `ticket_office_balances`. | Preservar a fórmula e evitar dupla subtração dos 25 antigos. A posição histórica terá um contrato com corte; o saldo atual não prova um PDF antigo. |
| Composição do retido | `src/lib/ticket-office-balance.ts:165`–`:180` centraliza posição + eventos abertos + resíduo; `:168` escolhe o primeiro apuramento, sem filtrar estado. `src/hooks/useRetainedComposition.ts:25` lê rascunhos e confirmados e `:41` chama esse helper; `src/components/TicketOfficeBalancePanel.tsx:125` também lê ambos. | Separar leitura preliminar de posição confirmada sem criar outra fórmula; não abater a posição novamente ao saldo retido. |
| Ecrã e navegação | `src/pages/TicketOffices.tsx:236` cria tabs não controladas; `:243` e `:319` contêm Apuramentos. `src/components/TicketOfficeStatementsPanel.tsx:28` declara painel de leitura, `:40` usa a FK explícita no embed e `:97` permite gestão de anexos. `src/components/TicketOfficeSettlementsOverview.tsx:104` liga apenas ao hash. | Acrescentar criação/conferência/confirmação e abrir conta/tab antes da âncora; manter FK explícita. Não prometer que o editor já existe. |
| Anexos | `drizzle/migrations/0090_ticket_office_statement_documents.sql:4` define documentos e fontes; `:29` isola empresa e `:34` permite admin/manager. `src/lib/ticket-office-statement-documents.ts:50` monta caminho por empresa; `:69` usa upload sem sobrescrever; `:102` remove referências com proteção de reutilização. | Reutilizar anexos e bucket; congelar documento primário e referências ao confirmar. Upload ou remoção não podem contornar esse congelamento. |
| Selo financeiro | `src/lib/settlement-seal.ts:4` documenta snapshot em `event_settlements.sealed_snapshot`; `:42` define o contrato. `src/components/SettlementSealControl.tsx:113` chama `seal_event_settlement`. `src/hooks/useTreasuryBridge.ts:64` lê os selos e `:72` resolve resultado congelado/corrente. | Manter snapshots e respetivos leitores; ligação do apuramento não autoriza deselar, rederivar ou regravar snapshot. |
| Motor partilhado | `src/lib/event-settlement-inputs.ts:1` reexporta `_shared`; `src/hooks/useEventSettlementEngine.ts:23` usa o cálculo partilhado; `supabase/functions/_shared/settlement/statement-service.ts:434` centraliza o motor e `:587` é chamado pelo construtor do documento do sócio. | Não construir um segundo motor SQL ou trocar receita por saldo Ticketline. O apuramento documenta direitos e liquidação, não resultado distribuível. |
| Assistente existente | `supabase/functions/_shared/assistant-ticketline-proposal.ts:10` enumera `event_right`; `:137` descreve confirmação admin/manager. `drizzle/migrations/0212_issue333_assistant_executor.sql:202` insere linhas e `:226` chama a confirmação existente. | Adaptar compatibilidade e rejeição de manager no servidor, mantendo os limites e a revisão humana do fluxo #333. |

### 1.3 Decisões e estado: leitura sem transportar números operacionais

| Fonte | Leitura e efeito no plano |
|---|---|
| `docs/DECISIONS.md:5357` — D-ERP231 | Modelo já criado; repasses/transitados sem evento; regra da linha de vendas após retenção em `:5365`; confirmação antiga admitia manager. Reutilizar estrutura e corrigir o desvio de autorização pelo despacho. |
| `docs/DECISIONS.md:5369` — D-ERP232 | Direito não abate adiantamentos; forma derivada e declaração manual são distintas; histórico protegido. Manter transferência efetiva e direito como grandezas diferentes. |
| `docs/DECISIONS.md:5378` — D-ERP233 e adendas até `:5395` | Posição já incluída no retido; preservar subtotais, FKs explícitas e leitura do resíduo; um total igual não prova equivalência das linhas ao PDF. |
| `docs/DECISIONS.md:5450` — D-ERP237 | Bilheteira local retida pela sala exige o par 10.3 fora do resultado, comissão separada e devolução só quando recebida. A nova confirmação não lança novamente esses movimentos. |
| `docs/DECISIONS.md:5608` — D-ERP247 | Está expressamente marcada PROPOSTA, NÃO DECIDIDA e propõe outras tabelas em `:5611`–`:5613`; as seis alternativas estão em `:5618`. O despacho fecha-as e manda usar `ticket_office_statements/lines`; não criar `ticketline_statements/events/flows`. |
| `docs/estado/estado-ticketing-e-receita.md:7`, `:26`–`:40`, `:55`–`:62` | Relata apuramentos 2558/3163 já registados, cadeia incompleta e falta de reconciliação linha a linha. Tratar como relato documental a revalidar pelo 0 na janela, sem duplicar os já existentes. Não afirmar que a #303 está concluída. |

O molde **0289** consultado é `supabase/manual/0289_p5c_cenario_receita_prevista.sql`: é de cenários, não de apuramentos (`:1`). Aproveitar empresa/autoria derivadas no servidor (`:36`), log (`:52`), revogação dos helpers (`:61`), política RESTRICTIVE de empresa (`:71`) e separação leitura/escrita (`:75`–`:89`). A política de escrita desse molde admite manager (`:80`); **essa permissão não serve para confirmar apuramentos**. O contrato abaixo é mais restritivo nesse comando.

## 2. Contratos propostos

Todo este capítulo é proposta de implementação futura. Os nomes novos são propostas, a validar na reserva; não são objetos encontrados em Live. Valores monetários documentais em EUR, `numeric(14,2)` na persistência e inteiros de cêntimos nas comparações/transporte. Rejeitar entradas com precisão superior a dois decimais antes de qualquer coerção; não arredondar silenciosamente para obter igualdade.

### 2.1 Cabeçalho `ticket_office_statements`

Reutilizar `id`, `company_id`, `financial_account_id`, `number`, `statement_date`, `document_total`, `status`, `notes`, `created_at/by`, `updated_at`, `confirmed_at/by`, `document_url/name` já definidos na 0077, referida em §1.2. Acrescentar:

| Coluna proposta | Tipo / obrigação |
|---|---|
| `contract_version` | smallint, 1 para registos anteriores, 2 nos novos; CHECK em 1/2. A versão não altera valores antigos. |
| `period_from`, `period_to` | date opcionais, ambas ou nenhuma; CHECK início ≤ fim. São cobertura do documento, não data de recebimento. |
| `position_cutoff_at` | timestamptz, obrigatório para confirmar v2; corte explícito da posição da conta. |
| `primary_document_id`, `primary_document_sha256` | Referência ao anexo PDF deste apuramento e resumo dos bytes; obrigatórios na confirmação v2. Caminho/empresa e existência do objeto verificados pelo fluxo de anexos; o servidor lê os bytes no storage e calcula o hash, sem aceitar o hash do cliente como prova de upload. |
| `revision` | bigint positivo, incrementado no servidor em cada alteração de rascunho; envio de revisão esperada impede perda de edição e confirmação sobre outra revisão. |
| `confirmation_receipt` | jsonb versionado, escrito só no servidor: total calculado, posição independente no corte, referências e hashes das fontes, revisão e autoria. Não incluir dados pessoais desnecessários nem confiar em JSON do cliente. |

Conservar unicidade `(financial_account_id, number)`, normalizando número/ano antes da escrita e recusando duplicados de representação. CHECK de estados apenas `draft`/`confirmed`; rascunho pode ter total por documentar, confirmado v2 exige total, PDF, corte, carimbo e recibo completos. Toda a criação operacional nova exige versão 2 no servidor; versão 1 é apenas compatibilidade dos registos anteriores, não uma opção do cliente para contornar guardas. `company_id` vem da conta validada na empresa ativa, nunca de um parâmetro livre. Não mudar conta, número, empresa ou versão de um registo confirmado.

Não guardar um saldo móvel no cabeçalho nem uma cópia operacional dos repasses: total documental e recibo congelado são provas com corte. Se positivo, o vínculo ao recebimento efetivo pode ser acrescentado por uma relação de conciliação auditada, fora do conteúdo congelado; não alterar o total nem inventar transferência na confirmação.

### 2.2 Linhas `ticket_office_statement_lines`

Conservar as referências existentes `statement_id`, `company_id`, `position`, `description`, `amount`, `pending_document`, `event_id`, `ticket_office_settlement_id`, `transaction_id`, `invoice_group_id`, `previous_statement_id`, `notes` e autoria. Acrescentar `document_line_type`, `document_page`, `document_line_ref`, `source_sha256`, `declared_event_net`, `event_gross_amount`, `event_retained_amount` e `quota_line_id`.

**Compatibilidade sem DROP:** o CHECK histórico de `line_type` aceita `event_right`, conforme §1.2. Acrescentar `document_line_type` nullable com CHECK nos cinco tipos abaixo; exigir o seu preenchimento para cabeçalhos v2 através da guarda do pai. O escritor v2 recebe `event_sales`, grava esse valor em `document_line_type` e mantém `line_type='event_right'` como compatibilidade de armazenamento. Nos outros quatro tipos os dois campos coincidem. A API v2 expõe sempre os cinco tipos canónicos. Leitores v1 continuam com o campo anterior. Não apagar/recriar constraints nem reclassificar em massa linhas antigas; qualquer reconciliação de v1 exige revisão documental separada. A nova coluna é a tipagem canónica v2, não uma segunda parcela financeira.

| Tipo canónico v2 | Valor e ligações obrigatórias / proibidas |
|---|---|
| `event_sales` | `event_id` obrigatório; referência ao fecho quando existe; `event_gross_amount` e `event_retained_amount` não negativos; `amount = bruto − retido local` documentado. `declared_event_net` é o líquido declarado no PDF **após** as deduções desse evento. A quota não é o saldo a pagar pela conta. Não ligar transação de repasse nem apuramento anterior. |
| `ticketline_invoice` | Valor com sinal do documento, normalmente negativo; ligar à transação existente **ou** ao grupo de fatura existente, com decomposição provada; não aos dois modos simultaneamente. Evento opcional. `quota_line_id` só se a fatura integra a quota desse evento neste documento. Fatura tardia de evento já apurado pode ficar como acerto da conta, sem reabrir a quota anterior. |
| `venue_settlement` | Valor com sinal e prova do acerto; evento opcional conforme documento. Ligar às faturas existentes quando há fatura; retenção local sem fatura exige origem documental e motivo explícito, sem gerar fatura fictícia. `quota_line_id` identifica a quota corrente a que deduz, se aplicável. |
| `advance` | Valor negativo do repasse; `transaction_id` obrigatório, da perna expense 10.3 paga na conta Ticketline e da mesma empresa; `event_id`, fecho, `quota_line_id` e `previous_statement_id` nulos. O histórico pode conter evento na transação: não o copiar para a linha nem alterar a transação antiga. |
| `carry_over` | `previous_statement_id` obrigatório, da mesma conta/empresa e confirmado; valor igual ao saldo anterior em aberto, conservando sinal. Sem evento, fecho, transação, grupo ou `quota_line_id`. Não cria despesa, pagamento ou outro adiantamento. |

`document_page` é inteiro positivo; `document_line_ref` identifica a linha/quota no PDF. `declared_event_net`, bruto e retido só pertencem a `event_sales`; nas outras linhas ficam nulos. `quota_line_id` referencia uma linha `event_sales` do mesmo apuramento/evento; não pode apontar para si própria ou para quota histórica. A quota documental de um evento é `event_sales.amount + Σ deduções com quota_line_id`; tem de ser igual a `declared_event_net`. Uma retenção já subtraída em `event_sales` não volta como acerto dedutível: se o PDF a mostra em separado, a apresentação deve conciliá-la sem duplicar o efeito.

CHECKs de uma linha: valor finito/decimal válido ou pendência explícita; tipo válido; exclusão dos campos proibidos; posição não negativa; sinal de `advance` negativo. Guardas transacionais, não CHECKs entre tabelas, validam versão do pai, empresa/conta/evento/fontes, identidade e total das faturas, igualdade da quota e do transitado. Nota de crédito/acerto positivo só com prova desse sinal; nunca inverter sinal por conveniência. `pending_document=true`, mesmo com valor zero, impede confirmar.

Unicidades propostas: `(statement_id, position)`; `(statement_id, document_line_ref)` quando preenchido; uma linha `event_sales` por evento/apuramento; um único consumo de `previous_statement_id` por sucessor; manter o índice de `transaction_id` não nulo, inclusive entre tipos e empresas. O grupo de fatura não permite contornar esse índice: o servidor resolve todos os seus membros e impede reutilização por grupo ou transação individual. Uma quota não pode reutilizar a mesma fonte de vendas noutro apuramento; eventual parcela adicional exige fonte documental nova e intervalo explicitamente disjunto (§8, Q3).

### 2.3 RLS, ACL e operações

Aplicar o padrão 0289 referido em §1.3 às tabelas e referências novas: RLS ativa, política RESTRICTIVE de empresa em USING e WITH CHECK; autoria, empresa e carimbos derivados no servidor; helpers com `search_path` fixo e execução revogada a PUBLIC/anon/authenticated. Preservar a audiência de leitura autenticada da empresa, sem ampliar acesso entre empresas. Staff autorizado prepara rascunhos segundo o papel de escrita admin/manager; a confirmação exige **admin** da empresa ativa. `isAdmin` do cliente não basta: `src/contexts/AuthContext.tsx:294` também o dá a platform_admin; esse papel isolado não deve ganhar confirmação implicitamente.

Propor RPCs `save_ticket_office_statement_draft`, `confirm_ticket_office_statement` (evolução da existente) e `get_ticketline_statement_position`. Revogar CRUD direto a authenticated nas tabelas operacionais v2 ou impor a mesma transição privada por triggers a todos os escritores v1; nenhuma rota direta pode criar `confirmed`, alterar `confirmed_by`, regressar a draft ou apagar um confirmado. Atualizar os escritores existentes no mesmo run da restrição, ou fazê-los falhar sem efeitos; não deixar uma janela de bypass. Não alargar privilégios de helpers para acomodar chamadas antigas.

RPC pública SECURITY DEFINER: revogar EXECUTE de PUBLIC, anon e authenticated, conceder apenas authenticated nas operações de sessão necessárias; `service_role` apenas se necessário e sempre sem dispensa de identidade admin no comando de confirmar. Helpers privados não ficam expostos como RPC. Verificar `has_function_privilege` por assinatura efetiva, não só a ACL textual. RLS não basta em função definer: cada função revalida sessão, papel, empresa, conta Ticketline e todas as referências. O assistente também atravessa estas guardas.

Imutabilidade: pai, linhas, relações de quota e anexo PDF primário de um confirmado ficam congelados, incluindo hash, valores e vínculos. Arquivo/eliminação do objeto não pode inutilizar um PDF confirmado; reutilizar a política de retenção de anexos, sem apagar evidência. Bloquear mudança de pai de uma linha confirmada, mudança de empresa, DELETE em cascata e edição dos campos confirmados através de qualquer RPC antiga. Alterações futuras fazem documento de acerto novo, não reabertura silenciosa.

### 2.4 Confirmação atómica, por ordem verificável

1. Resolver sessão admin/empresa e conta Ticketline; adquirir lock da conta para serializar a cadeia. Bloquear pais envolvidos, deduplicados e em ordem de identificador, antes de validar estado; preservar o protocolo OLD/NEW descrito em §1.2. Definir a mesma ordem para salvar, mover linha, transportar e confirmar.
2. Verificar revisão esperada, estado draft, PDF primário íntegro e todas as fontes acessíveis na mesma empresa/conta. Revalidar o snapshot de origem das propostas; não confiar no pré-preenchimento antigo do cliente.
3. Exigir pelo menos uma linha, nenhum `pending_document`, valores não nulos, nenhuma fonte reutilizada, quotas documentais reconciliadas, transitado válido e prova das deduções. Diferença de **um cêntimo**, para mais ou para menos, recusa confirmação. Não gerar linha de ajuste para fechar a soma.
4. Calcular `T = Σ amount` de todas as linhas com sinal e exigir `T_cents = document_total_cents`. O mesmo PDF tem de estar conferido linha a linha; somar ao total, por si, é insuficiente.
5. Apurar a posição independente da conta no corte (§3) e exigir a igualdade no mesmo universo documental; fontes em falta ou resíduo não explicado bloqueiam a prova. Guardar o recibo e carimbos do servidor, então mudar para confirmed na mesma transação.
6. Não criar, pagar, apagar ou alterar transações, pagamentos, vendas, BP ou os 25 antigos. Falha em qualquer passo deixa o rascunho e todas as contas como estavam. Repetição com a mesma chave/revisão devolve o recibo existente; pedido incompatível recusa, não duplica.

## 3. Saldo da conta, transporte e direito do evento

### 3.1 Convenção de sinal e corte

Usar a convenção documental: positivo a favor da MP; negativo a favor da Ticketline. Seja `Q` a soma das quotas dos eventos no período, `A` os repasses positivos em módulo, `F` os acertos/faturas com sinal que não estejam já incluídos em `Q` e `C` o saldo anterior ainda em aberto. Então **posição documental `P = C + Q + F − A`**. Os `carry_over` não são somados novamente às transações históricas no cálculo independente. A frase do corpo da Issue «repasses menos direitos» tem o sinal oposto a esta posição; o ecrã pode mostrar o módulo «já adiantado», mas nunca inverter o sinal do total que compara ao PDF.

Não confundir esta posição com o retido atual de todos os eventos. A fórmula canónica e os seus filtros estão nas referências de §1.2; a decomposição continua **retido = posição do apuramento + saldo dos eventos fora dele + diferença de calendário**. Não subtrair duas vezes a posição negativa e não usar rascunho como posição confirmada sem rótulo explícito.

Propor uma leitura agregada com corte por conta, empresa e instante, reaproveitando a classificação canónica de vendas/movimentos e comprovando paridade com o saldo atual quando o universo é igual. Ela devolve posição dos eventos apurados, movimentos incluídos/excluídos, saldo de eventos fora do apuramento e resíduo explicado. Não é uma réplica do motor de sócios. Na data de aceitação, comparar **a mesma posição da conta e o mesmo corte do documento**; se houver vendas de eventos futuros fora do PDF, mostrá-las separadas na ponte até ao saldo retido total, nunca escondê-las ou atribuí-las ao apuramento.

O saldo atual e `paid_amount` atual não demonstram, sozinhos, o saldo num dia passado. Para histórico, a leitura exige fontes datadas e pagamentos/movimentos comprovados no corte ou um snapshot de corte revisto pelo 0. Falta de fonte torna o resultado incompleto; não preencher com zero, não retroagir o pagamento de hoje e não validar a posição lendo apenas `document_total`. O recibo de confirmação conserva as fontes e o resultado para tornar a prova reproduzível.

### 3.2 Cadeia e saldo negativo

Um negativo de um confirmado torna-se `carry_over` do seguinte, pelo valor assinado integral; não é receita, despesa ou repasse novo. O sucessor tem data/corte posterior, mesma conta e empresa, e consome o predecessor uma vez. Conta bloqueada durante confirmação evita dois sucessores concorrentes. Sem ciclos, saltos por documento não provado ou dois consumos do mesmo negativo. A posição final do sucessor já inclui o transitado: não somar os saldos finais de toda a cadeia.

Se o saldo é positivo, mostrar «a receber da Ticketline» e ligar ao recebimento quando ocorrer, pela perna de saída da conta e entrada bancária verificadas. Não criar recebimento na confirmação. Se o documento seguinte transportar um positivo ainda em aberto, exigir prova do saldo não recebido; se já recebido, o mesmo valor não pode reaparecer como carry_over. Saldo zero não cria linha financeira de transporte.

### 3.3 Direito e fecho por evento

**Direito = bruto − deduções do evento.** Para a reconciliação, as deduções incluem retenção local, faturas/comissões e acertos de sala imputáveis ao evento, sem repetição. O valor autoritativo da quota é o líquido declarado no PDF (regra 2). Mostrar lado a lado bruto, deduções, direito documental, cálculo de conferência e diferença; uma discrepância bloqueia confirmação, não ativa rateio proporcional ou ajuste automático.

`event_sales` contém a venda após retenção local, antes das restantes deduções que o PDF liste separadas; a quota resulta da agregação descrita em §2.2. Isto distingue a linha do documento do direito final e evita subtrair a comissão duas vezes. Se o PDF trouxer só o líquido, o pré-preenchimento não inventa bruto/fatura: exige os documentos complementares antes da confirmação.

No fecho não selado, apresentar a quota e os apuramentos que a suportam; manter `net_calculated` como cálculo e a origem documental explícita. Não preencher `net_transferred` com o direito nem criar transferência por evento. Conservar retido pela sala, compensação da fatura e saldo restante pago pela Ticketline, respeitando a D-ERP237; confirmar o apuramento não volta a executar os pagamentos do fecho. Para fecho já selado, mostrar valor congelado e ligação de leitura ao documento; diferença documental fica em acerto identificado no novo apuramento, sem sobrescrever o fecho/snapshot antigo (regra 4).

### 3.4 Motor / Encontro de Contas e consumidores

O motor de resultado continua com vendas e custos canónicos, IVA, BP/realizado, bases contratuais, partições e snapshots existentes. O direito líquido Ticketline **não** substitui a receita bruta/líquida fiscal que o motor já recebe, nem entra como receita adicional. `advance/carry_over` não alteram resultado, quota do sócio, cachê, financiamento ou caixa por evento. Muda a proveniência/apresentação da liquidação: acrescentar ao Encontro de Contas um bloco de leitura do direito documental e situação na conta Ticketline, sem simular entrada no banco ou repartir o pool. Os dados desse bloco vêm do adaptador partilhado; a inclusão num documento de sócio não altera os seus totais e preserva a origem congelada nos selados.

Inventário de impacto; os caminhos existentes e a razão da inclusão têm prova em §1.2 ou na referência da linha. «Regressão» significa verificar paridade, não autorização para alterar a fórmula:

| Consumidor | Alteração futura ou regressão exigida |
|---|---|
| `src/components/TicketOfficeStatementsPanel.tsx`, `TicketOfficeStatementDocuments.tsx`, `src/lib/ticket-office-statement-documents.ts` | Criar/conferir/confirmar, tipos v2, PDF imutável e recibo. |
| `src/pages/TicketOffices.tsx`, `TicketOfficeSettlementsOverview.tsx` | Só Ticketline, conta/tab/âncora selecionadas pelo link e posição com corte/estado. |
| `TicketOfficeSettlementModal.tsx`, `TicketOfficeSettlementsPanel.tsx`, `src/lib/ticket-office-settlement-calc.ts`, `ticket-office-settlement-eligible.ts` | Direito e origem; nenhuma atribuição de repasses; guardas contra duplo abatimento e regravação de selados. |
| `src/lib/ticket-office-settlement-view.ts:71`, `src/components/TicketOfficeSettlementViewDialog.tsx:20`, `src/lib/export-ticket-office-settlement-pdf.ts:67` | A vista e o PDF já projetam número/anexos do apuramento; acrescentar quota/origem sem expor um líquido fictício «a transferir». |
| `TicketOfficePositionCards.tsx`, `TicketOfficeBalancePanel.tsx`, `src/lib/ticket-office-position.ts`, `ticket-office-balance.ts` | Distinguir projeção de rascunho, posição confirmada e saldo atual; manter helper único e resíduo visível. |
| `src/hooks/useRetainedComposition.ts`, `src/components/financial-position/P6bSections.tsx:68` | A Posição Financeira também exibe a composição e rótulo draft; partilhar exatamente a seleção/contrato da bilheteira. |
| `src/components/ReportTicketOfficeAudit.tsx:103`, `src/lib/export-ticket-office-audit.ts`, `src/lib/ticket-office-reconciliation.ts` | Regressão da decomposição por evento + sem evento; o âmbito do relatório está explicitado em `src/lib/ticket-office-balance.ts:25`. Repasses novos permanecem sem evento, sem reescrever os antigos. |
| `src/hooks/useEventSettlementEngine.ts`, `supabase/functions/_shared/settlement/statement-service.ts`, `src/components/PartnerSettlementTab.tsx`, `ReportPartnerSettlement.tsx` | Regressão de resultado/participações; eventual bloco informativo usa adaptador partilhado, nunca outra fórmula. Os consumidores do construtor partilhado estão descritos em `supabase/functions/_shared/settlement/statement-service.ts:1`. |
| `src/lib/settlement-seal.ts`, `SettlementSealControl.tsx`, `src/hooks/useTreasuryBridge.ts:61`, `supabase/functions/_shared/financial-position/assemble.ts:6` | Provar igualdade dos snapshots/resultados e dos agregados antes/depois; a posição Ticketline não entra de novo na liquidez do motor. |
| `supabase/functions/_shared/assistant-ticketline-proposal.ts:10`, `supabase/functions/_shared/assistant-ticketline-apuramento.ts:21`, `supabase/functions/_shared/assistant-erp.ts:60`, escritor da 0212 | Preservar protocolos #333, leitura/revisão e aliases v1; confirmação admin revalidada, sem bypass de service-role. |
| `TicketOfficeAdvancesPanel.tsx` | Regressão só de leitura e conservação das 25 linhas; sem botões operacionais novos. |

## 4. Migração e saneamento histórico: dois pacotes separados

### 4.1 Estrutura aditiva, número a reservar depois

Não reservar número nem produzir SQL nesta entrega. Após revisão do 0: reservar um `NNNN` livre e preparar `drizzle/migrations/NNNN_issue303_apuramento_contract.sql`, com cópia byte a byte em `supabase/manual/NNNN_issue303_apuramento_contract.sql` e rollback **comentado**, em run autorizado. O número é um marcador, não uma migração já criada.

Adicionar colunas, índices, guardas e RPCs versionadas às tabelas encontradas; **sem DROP**, truncagem, recriação de tabelas, alteração de migrações históricas ou edição do journal/meta. Manter o CHECK antigo através da tipagem v2 aditiva (§2.2). Usar ALTER POLICY/REVOKE/guardas para fechar permissões existentes, inventariando também políticas permissivas que se combinam por OR; não deixar a política antiga mais larga a neutralizar a nova. Falha de pré-condição de unicidade ou dados incompatíveis aborta o pacote, sem correção automática.

Antes da futura aplicação, o 0 confere catálogo/assinaturas/ACL, candidatos 0213/0317/0323, storage e dependências, incluindo #333/#314. O candidato 0317 declara não estar aplicado em `drizzle/migrations/0317_issue313_settlements_unique_active.sql:2` e propõe unicidade de fecho ativo em `:28`; não presumir instalação. O rollback comentado desativa a entrada v2 e repõe corpos/ACL revistos; conserva dados e recibos, sem apagar documentos confirmados. Aplicação, homologação e eventual deploy/Publish são uma janela separada do 0, com autorização própria; PR verde não as substitui.

### 4.2 DML histórico separado, parametrizado e com recibo

Pacote manual futuro, separado do DDL: `supabase/manual/issue303_reconcile_history.PARAMETRIZADO.sql`, acompanhado de rollback comentado. Sem UUIDs operacionais, caminhos privados de PDF ou valores comerciais no repositório; os parâmetros e a matriz evento/documento são revistos pelo 0 em canal privado. Os números dos apuramentos abaixo são identificadores solicitados no despacho, não valores monetários.

| Universo a conferir | Destino proposto a provar pelo PDF |
|---|---|
| Ivete | 2816, confirmando também a relação de transporte que o PDF mostrar. |
| Anitta | 2558; procurar e reconciliar o registo existente antes de qualquer inserção. |
| SM Lisboa / Porto, com Deive Braga no documento conjunto | 3163; conservar os fechos existentes e conferir todas as linhas do corte documental. |
| H&K | 1158; o 0 identifica as cidades/fechos efetivamente abrangidos, sem alargar por semelhança de nome. |

Essa correspondência é uma lista de trabalho, não prova de pertença ou ordem cronológica; conferir PDFs e datas, não ordenar por número. Reaproveitar 2558/3163 se encontrados como descritos no estado; não voltar a criá-los. Os fechos selados só ganham relação documental externa de leitura, nunca DML de recálculo ou alteração dos seus valores/snapshot.

Sequência futura, numa operação protegida por conta: carregar parâmetros privados e PDFs verificados; conferir empresa/conta/tipo, número, data, revisão/estado, hashes, conjunto exato dos fechos e fontes, predecessor e contagens esperadas; comparar com a fotografia anterior; abortar em qualquer divergência. Inserir apenas o que falta e reconciliar rascunhos autorizados. Se um registo confirmado estiver errado, não o editar: reportar para acerto documental novo.

Preservar vendas, BP, transações e pagamentos existentes. As linhas `advance` documentais podem referenciar as transações reais indicadas no PDF; isso não converte nem consome os 25 objetos legados e não duplica efeito no saldo. Provar antes/depois o conjunto das 25 linhas, montantes, vínculos, notas e hashes; saldo canónico, resultados e snapshots selados ficam iguais. Não inventar predecessor para um carry_over opaco, não lançar saldo inicial de conveniência e não completar linhas pelo valor da diferença.

Recibo privado por execução: autorização, commit e hash do pacote, hash dos parâmetros/PDFs, contagens previstas/efetivas, identidades resolvidas, igualdade dos totais/quotas/posição, alterações efetivas, fotografia antes/depois e ausência de alterações proibidas. Segunda execução com o mesmo recibo é no-op verificável; parâmetros diferentes ou fonte reutilizada abortam. O repositório guarda só o modelo de recibo e resultado sem PII/valores comerciais. Confirmação permanece ação de admin no fluxo canónico; DML não carimba confirmação por impersonação.

## 5. Testes de aceitação e fixture sintética

### 5.1 Prova real, posterior e privada

Critério: **o apuramento 3163 confirma no total assinado do PDF original e a posição da conta Ticketline nesse dia/corte é igual, ao cêntimo**. O total real é um parâmetro privado revisto pelo 0, não é reproduzido neste plano ou em fixture. Conferir também cada linha, quota e fonte; soma coincidente não basta. O recibo identifica qual o corte da conta, eventos incluídos, movimentos e quaisquer parcelas fora do documento. Saldo atual com vendas futuras não substitui a posição histórica (§3.1).

Executar esta aceitação só em janela própria: PDF e cadeia anterior completos, DML privado revisto, estrutura instalada e admin real. Verificação independente da posição não pode ler o total do documento como se fosse o saldo. Prova de catálogo/ACL e sessão válida de outra empresa fazem parte da homologação; não foram executadas nesta tarefa.

### 5.2 Fixture pública: mesma estrutura, dados inteiramente inventados

Preparar em run futuro uma fixture intitulada «estrutura 3163», com empresa A, outra empresa B, uma conta Ticketline, outra bilheteira, três eventos E-A/E-B/E-C, duas faturas F-1/F-2, retenções locais, dois acertos de sala, dois repasses genéricos e um predecessor confirmado. Identidades geradas apenas na fixture; PDF mínimo sintético e hashes dos seus bytes, sem cópia do documento real. Usar os seguintes valores inventados em cêntimos:

| Linhas sintéticas | Cêntimos com sinal |
|---|---:|
| `event_sales` E-A: bruto 101.000 menos retido 1.000 | +100000 |
| `event_sales` E-B: bruto 152.000 menos retido 2.000 | +150000 |
| `event_sales` E-C: bruto 50.500 menos retido 500 | +50000 |
| `ticketline_invoice` F-1, dedução da quota E-A | −10000 |
| `ticketline_invoice` F-2, de evento apurado no predecessor, sem quota corrente | −5000 |
| `venue_settlement` da quota E-A | −20000 |
| `venue_settlement` da quota E-B | −30000 |
| `advance` R-1, sem evento | −200000 |
| `advance` R-2, sem evento | −100000 |
| `carry_over` do predecessor, sem evento | −40000 |
| **Total do PDF sintético** | **−105000** |

Quotas documentais sintéticas: E-A = 70000, E-B = 120000, E-C = 50000 cêntimos. Prova independente: saldo anterior −40000 + quotas 240000 − fatura histórica 5000 − repasses 300000 = **−105000**; também igual a Σ linhas e ao PDF sintético. No movimento canónico, as retenções locais correspondem a saídas 10.3 já existentes e os custos a despesas já lançadas; não se lançam outra vez ao confirmar. Um lote adicional de vendas fora do documento comprova separadamente a ponte posição + eventos abertos + resíduo = saldo retido, sem alterar o total documental.

Criar 25 registos históricos sintéticos ligados a movimentos/fechos existentes, com valores arbitrários e sem efeito adicional no saldo. Criar um fecho/snapshot selado para provar a igualdade byte a byte antes/depois. Um sucessor S-N recebe carry_over −105000 e quota nova +120000: posição final +15000, sem atribuir o negativo ao evento e sem voltar a somar o predecessor. Não converter o saldo positivo em pagamento até existir transferência verificada.

### 5.3 Matriz mínima de testes futuros

- Caminho positivo: rascunho → anexar PDF → conferir linhas/quotas → confirmar por admin; totais, recibo e posição independente iguais; zero escritas financeiras na confirmação.
- Diferença +1 ou −1 cêntimo, precisão excedente, total nulo, documento ausente/alterado, linha pendente a zero ou nula, conjunto vazio, quota incorreta ou retenção duplicada: recusa integral.
- Manager com gestão, viewer, anónimo, service-role sem sessão admin e utilizador autenticado de B: não confirmam A; referências cruzadas, outra conta e outra bilheteira recusadas; leituras não revelam A a B.
- Duplicação de número normalizado, transação, membro de grupo de fatura, posição, referência documental, quota/fonte e carry_over: recusa; grupo não serve de bypass à deduplicação individual.
- Pai confirmado: recusar edição direta/RPC, alteração de total/PDF, retorno a draft, DELETE/cascata, mover linha para/de confirmado e alteração de evento/empresa; anexos confirmados continuam acessíveis.
- Concorrência: confirmar vs inserir/editar/apagar/mover linha, dois sucessores e repetição da confirmação; uma versão consistente confirma, ou uma operação falha por revisão; nunca recibo com soma desatualizada ou dupla utilização do transitado.
- Transporte negativo atravessa dois documentos com sinal preservado; ciclo, predecessor draft, outro tenant/conta, corte invertido, saldo adulterado e reutilização bloqueiam.
- Fechos selados e 25 históricos: snapshot, valores e vínculos idênticos; UPDATE/DELETE e estorno proibido recusam antes de efeitos. O novo documento não altera resultados/participações nem cria recebimento.
- Paridade de consumidores: ecrã de bilheteira, vista/PDF do fecho, Auditoria, Posição Financeira, Encontro de Contas e construtor partilhado do sócio mantêm resultados e mostram a mesma proveniência; rascunho mais recente não substitui silenciosamente posição confirmada.
- UI: fluxo completo, erro de pré-preenchimento sem zeros silenciosos, confirmação só admin, datas limpas persistem vazias, link abre conta/tab/âncora, desktop e mobile com botão de fechar acessível.
- Compatibilidade: v1 conserva valores/tipos históricos; v2 apresenta `event_sales`; extração/proposta/execução #333 não contorna revisão ou papel admin.

## 6. Ecrã proposto

**Bilheteiras → Ticketline → Apuramentos** conserva cartões e histórico, acrescentando «Novo apuramento» para quem prepara. O fluxo é: identificar número/data/corte → anexar PDF → pré-preencher candidatos → conferir → guardar rascunho → confirmar por admin. Reutilizar os anexos existentes; OCR/extração é sugestão com proveniência, nunca validação ou confirmação automática.

Pré-preenchimento lê fechos, vendas agregadas, faturas/grupos já lançados, saídas 10.3 e predecessor; não cria transações. Mostrar origem e referência do PDF em cada linha e separar quota do evento de movimentos da conta. Sem origem, manter pendência e bloquear confirmação; sem PDF ou fonte de posição não declarar «conferido». Não copiar os vínculos por evento dos 25 históricos para novos repasses.

Na conferência: grelha por tipo, subtotais, quota declarada/calculada por evento, total calculado, total do PDF, diferença em cêntimos, posição independente com corte e ponte para o saldo atual. Divergências aparecem com explicação concreta. Após confirmação, modo só leitura com quem/quando/recibo. Manager pode preparar, mas não vê um comando que prometa confirmar; tentativa direta recebe a mesma recusa do servidor.

Datas novas/alteradas usam `src/components/ui/date-picker.tsx` em `dd/MM/aaaa`, calendário da plataforma e `clearable` nos campos omitíveis, sem repor hoje ao limpar; datas obrigatórias vazias validam como erro. O componente já oferece limpeza por `onChange("")` em `src/components/ui/date-picker.tsx:27`. Não criar input nativo de data nem migrar campos alheios.

O fecho do evento mostra **Direito do evento**, decomposição e quota do PDF, estado de congelamento e ligação aos apuramentos. Transferência efetiva continua separada. A ligação seleciona conta e tab antes de localizar o documento. No modal, cabeçalho/fechar ficam fora do corpo rolável e respeitam viewport/safe-area, conforme a regra de arquitetura aplicável. Para selado, comparação documental de leitura não se torna editor do snapshot.

## 7. Runs futuros, cada um com PR verde por si

Nenhum run abaixo está autorizado a executar por este despacho. O 0 despacha cada lista fechada; nomes NNNN e novos ficheiros são propostos, não reservas. Na tabela, nomes de componentes sem diretório têm o prefixo `src/components/`; nomes `assistant-*.ts` sem diretório têm o prefixo `supabase/functions/_shared/`. Cada PR deve conter apenas o seu incremento utilizável/testável, sem depender de migração ainda não aplicada para manter os fluxos atuais. Novas entradas ficam indisponíveis até prova de capacidade v2 no servidor; não tentar escrita v2 e cair para v1 silenciosamente.

Em cada tecto estão incluídos preparação, testes focados, os comandos completos `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` e `bunx vitest run`, revisão de diff e observação do CI `quality`. Reservar até 25 min de alteração, 20 min de validação e 10 min de revisão/CI; antes de começar, medir a suíte e reduzir o lote se essa margem não couber. Um run termina com unidade coerente e PR verde; pendências tornam-se run seguinte com lista explícita, sem publicar metade do contrato ou introduzir skips. Não presumir um número de run como autorização de aplicação/Live.

| Run / tecto | Ficheiros propostos e motivo | Dependência e saída verificável |
|---|---|---|
| R1 / 50 min — contrato puro e fixture | Novo `supabase/functions/_shared/ticketline-statement-contract.ts`; novos `src/lib/ticketline-statement-contract.ts` (reexport) e `src/test/issue303-contract.test.ts`; nova fixture em `src/test/fixtures/issue303-statement.ts`. Centralizar cinco tipos, cêntimos, versão e quotas sem UI/IO. | Independente; fixture sintética soma −105000, quotas reconciliam, precisão/sinais inválidos recusados; nada novo é ativado. |
| R2 / 55 min — estrutura e acesso preparados | Futuros `drizzle/migrations/NNNN_issue303_apuramento_contract.sql`, cópia em `supabase/manual/NNNN_issue303_apuramento_contract.sql`, `supabase/manual/rollback_NNNN_issue303_apuramento_contract_comentado.sql`; novo `src/test/issue303-schema-acl.test.ts`. Colunas/unicidades/tipagem aditivas, RLS/ACL e prova inerte local. | Depende de R1 e reserva pelo 0; SQL preparado sem aplicar, teste local com dados inventados. CRUD direto/confirmado bloqueado e compatibilidade demonstrada antes de merge. |
| R3 / 55 min — comandos e congelamento preparados | Futuros `drizzle/migrations/NNNN_issue303_commands.sql`, `supabase/manual/NNNN_issue303_commands.sql`, `supabase/manual/rollback_NNNN_issue303_commands_comentado.sql`; novo `src/test/issue303-confirmation.test.ts`. Draft/confirm/guardas de pai, quotas e fontes. O número é reservado só neste run. | Depende de R2; confirmar apenas admin, igualdade em cêntimos, recibo e imutabilidade testados. Sem pagamentos; novos escritores indisponíveis externamente até instalação autorizada. |
| R4 / 55 min — transporte e leitura no corte | Futuros `drizzle/migrations/NNNN_issue303_chain_position.sql`, `supabase/manual/NNNN_issue303_chain_position.sql`, `supabase/manual/rollback_NNNN_issue303_chain_position_comentado.sql`; novos `src/test/issue303-position.test.ts` e `src/test/issue303-concurrency.test.ts`. Provar posição independente e locks, não alterar fórmula de resultado. | Depende de R3 e resolução Q1/Q2; dois sucessores não consomem o mesmo saldo, alteração concorrente não escapa à confirmação, corte histórico incompleto recusa. |
| R5 / 50 min — leituras e proveniência partilhadas | Novo `src/hooks/useTicketOfficeStatements.ts`; `src/lib/ticket-office-position.ts`, `src/lib/ticket-office-balance.ts`, `src/hooks/useRetainedComposition.ts`; novo `src/test/issue303-read-contract.test.ts`. Um adaptador seleciona versão/estado/corte e reutiliza a decomposição. | Depende de R1/R4; leitura v1 preservada, v2 confirmada separada de draft, falha de capacidade explícita; nenhum editor novo ainda. |
| R6 / 55 min — rascunho e anexos | Novo `src/components/TicketOfficeStatementModal.tsx`; `TicketOfficeStatementsPanel.tsx`, `TicketOfficeStatementDocuments.tsx`, `src/lib/ticket-office-statement-documents.ts`; novo `src/test/issue303-draft-ui.test.tsx`. Formulário, DatePicker, PDF e pré-preenchimento de fontes existentes. | Depende de R3/R5 e capacidade instalada em homologação; só grava rascunho. Regressão dos anexos e consulta atual verde; confirmação ainda indisponível nesta UI. |
| R7 / 55 min — conferir, confirmar e navegar | `TicketOfficeStatementModal.tsx`, `TicketOfficeStatementsPanel.tsx`, `src/pages/TicketOffices.tsx`, `TicketOfficeSettlementsOverview.tsx`; novo `src/test/issue303-confirm-ui.test.tsx`. Conferência, admin, recibo e ligação conta/tab/documento. | Depende de R4/R6; fluxo completo com fixture e erros; link funcional em viewport pequeno; UI nunca afirma que manager confirmou. |
| R8 / 55 min — direito nos fechos e guardas | `TicketOfficeSettlementModal.tsx`, `TicketOfficeSettlementsPanel.tsx`, `src/lib/ticket-office-settlement-view.ts`, `TicketOfficeSettlementViewDialog.tsx`, `src/lib/export-ticket-office-settlement-pdf.ts`; futuros `drizzle/migrations/NNNN_issue303_event_guards.sql`, `supabase/manual/NNNN_issue303_event_guards.sql`, `supabase/manual/rollback_NNNN_issue303_event_guards_comentado.sql`; novo `src/test/issue303-event-right.test.tsx`. Guardas nos caminhos save/reverse/create-transfer. | Depende de R3/R7 e coordenação #314; fecho Ticketline com quota não gera repasse por evento; selo bloqueia efeitos em todas as entradas. Preserva regras de pagamento da sala. |
| R9 / 50 min — consumidores de posição | `TicketOfficePositionCards.tsx`, `TicketOfficeBalancePanel.tsx`, `src/components/financial-position/P6bSections.tsx`; novo `src/test/issue303-consumers.test.tsx` e regressão usando `src/test/fixtures/issue303-statement.ts`. Verificar Auditoria e exportação sem editar fórmulas. | Depende de R5/R8; mesmos totais e snapshots, nenhuma dupla receita ou carry_over por evento. |
| R10 / 50 min — proveniência no Encontro e documentos | `PartnerSettlementTab.tsx`, `ReportPartnerSettlement.tsx`, `supabase/functions/_shared/settlement/statement-service.ts`, `supabase/functions/_shared/settlement/partner-statement-doc.ts`; novo `src/test/issue303-engine-parity.test.ts`. Projetar o bloco de leitura partilhado, sem alterar o núcleo do motor nem totais dos documentos. | Depende de R8/R9; comparação com/sem metadados prova resultado, participações e snapshots idênticos; o bloco distingue direito e recebimento. Mudança funcional do motor só por novo despacho se a prova demonstrar necessidade. |
| R11 / 55 min — compatibilidade #333 | `supabase/functions/_shared/assistant-ticketline-apuramento.ts`, `assistant-ticketline-candidate.ts`, `assistant-ticketline-proposal.ts`, contrato puro R1 e novo `src/test/issue303-assistant-compat.test.ts`; se necessário, futuros `drizzle/migrations/NNNN_issue303_assistant_compat.sql`, `supabase/manual/NNNN_issue303_assistant_compat.sql`, `supabase/manual/rollback_NNNN_issue303_assistant_compat_comentado.sql`. Adaptar o escritor da 0212. | Depende de R3/R8 e reserva coordenada #333; manter leitura v1, saída v2 e revisão humana; manager não confirma pela execução assistida. Sem deploy nesta preparação. |
| R12 / 50 min — pacote histórico e aceitação reproduzível | Futuros `supabase/manual/issue303_reconcile_history.PARAMETRIZADO.sql`, `supabase/manual/rollback_issue303_reconcile_history_comentado.sql`; novo `src/test/issue303-history.test.ts`, fixture R1 e modelo de recibo em `docs/testes/issue303/recibo-modelo.md` (só com novo âmbito autorizado). | Depende de R4/R8/R10/R11 e PDFs revistos pelo 0; placeholder obrigatório, guardas, idempotência e hashes demonstrados em fixture; nenhuma execução histórica, valor real ou identidade operacional no PR. |

Janela posterior, fora destes PRs de preparação: o 0 revê respostas, aplica estrutura em homologação autorizada, comprova catálogo/ACL e fluxo integrado, executa a aceitação privada do 3163 e só depois propõe promoção/Live. Nenhum PR precisa de dados comerciais para estar verde; nenhum PR verde prova aplicação ou reconciliação real. Se o CI exceder a margem, o PR fica pendente até verde e o lote seguinte é reduzido; o limite de 55 min não autoriza omitir um gate nem declarar sucesso sem observação.

## 8. Riscos e perguntas fechadas ao 0

Riscos concretos: `event_right` pode conter cortes históricos diferentes; reconciliação incompleta pode coincidir no total; ACL antiga admite manager e escrita direta; posição atual pode incluir eventos futuros; UPDATE de linha pode trocar de pai durante confirmação; estorno antigo tenta alterar histórico protegido; um grupo de fatura pode contornar unicidade individual; confirmação do fecho tem efeitos financeiros; versões preparadas de #333/#314 podem divergir do catálogo. As referências e mitigação estão em §1.2 e §§2–5. Não são motivo para ajustar números, reabrir decisões ou alargar os caminhos desta entrega.

Só estas perguntas permanecem; as seis regras de §1.1 não são opções:

| Pergunta fechada | Opções | Recomendada e efeito |
|---|---|---|
| Q1 — Qual o instante de corte quando o PDF só traz dia civil? | A: fim desse dia em Europe/Lisbon, com movimentos documentalmente abrangidos identificados; B: hora expressa acordada para cada documento. | **A**, salvo hora explícita no PDF. Registar corte e cobertura; vendas futuras fora do documento continuam na ponte, não desaparecem. |
| Q2 — Como tratar o início da cadeia se faltar prova do saldo anterior? | A: obter documento anterior e fontes, mantendo rascunho entretanto; B: admitir saldo de abertura com certificado privado específico do 0, origem e recibo, sem fingir predecessor. | **A**. Não confirmar cadeia incompleta. B exigiria autorização própria para essa exceção e contrato de abertura adicional. |
| Q3 — Pode o mesmo evento aparecer em vários apuramentos? | A: sim, apenas parcelas/correções explicitamente distintas no PDF e sem reutilização de fonte; B: uma quota única, com documento de acerto separado para mudanças. | **A**, com identidade/intervalo da parcela e soma documental; nunca repartir por vendas ou rederivar selados. Até resposta, não ativar quotas repetidas. |
| Q4 — Como corrigir erro num apuramento já confirmado? | A: novo documento/linha de acerto auditada, mantendo original; B: reversão documental formal com cadeia de versões, sem editar conteúdo original. | **A**, menor contrato inicial e preservação das provas. Não oferecer «voltar a rascunho». |
| Q5 — Como introduzir `event_sales` sem DROP nem mudar históricos? | A: coluna canónica v2 e adaptação explícita do campo histórico, como §2.2; B: adiar mudança de armazenamento e expor alias só numa API versionada. | **A**, porque permite CHECK canónico na própria tabela. Nenhuma opção muda montantes ou o líquido declarado no PDF. |
| Q6 — O que pode acontecer aos anexos após confirmação? | A: PDF primário e provas usadas congelados; anexos complementares só por adição auditada sem mudar o recibo; B: congelar todos os anexos, admitindo complementos só num novo documento de acerto. | **A**, mantendo a prova original e permitindo documentação posterior claramente separada. Remoção/substituição das fontes confirmadas permanece proibida. |

Estas respostas afinam cortes, provas e operação. O 0 precisa ainda de fornecer/rever os PDFs, parâmetros privados, identificação canónica da conta e correspondência exata dos fechos históricos; nenhum nome, UUID ou valor é inferido a partir deste plano.
