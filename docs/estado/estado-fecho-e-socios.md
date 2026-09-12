# ESTADO — Fecho & Sócios

Atualizado: 2026-09-12 · Issues: #82, #65, #85, #68, #133, #146, #147, #148, #150 · P0 aberto: nenhum

## Em que pé está

A **Anitta EDA 2026 foi apurada, conferida e entregue aos sócios** a 08/09, em planilha gerada fora do ERP (gerador v23). A versão do BP que sustenta essa entrega está **congelada como v4**. A Anitta está entregue, **não sacramentada**; a Ivete ainda não fechou. A **fase de conferência pelos sócios** está aberta — ajustes ao BP nesta fase são normais, e é para os poder medir contra o que foi enviado que a v4 existe.

O **Extra do Sócio foi arrumado de ponta a ponta a 09/09**:
- **Deixou de passar pelo BP na criação** — é custo do sócio, não do evento (D-ERP21). O toggle "🧳 Extra do Sócio" **mudou de sítio**: fica a seguir ao evento, antes do painel do BP, e com ele ligado o painel do BP recolhe e deixa de ser exigido.
- **A reversão total ganhou trava de linha de BP** (D-ERP22): em `approved`/`paid` abre-se o `LinkBpLineDialog` em `pickOnly` e nada se escreve até haver linha; em `pending` não se trava.
- **Os extras passaram a ter fonte única** (`src/lib/partner-extras.ts`, D-ERP23), lida pelos três ecrãs — painel da aba Sócios, Fecho do Evento e Encontro de Contas. Antes cada um lia só metade das duas tabelas e o saldo do mesmo sócio divergia entre os dois ecrãs de fecho.
- **A base c/IVA vs s/IVA passou a ser respeitada nos blocos de sócios** (extras e despesas pagas pelo sócio), por sócio, com indicação visível da base em vigor. O extra manual entra sempre pelo valor escrito.
- **A entrada parcial passou a repartir a fatura** (D-ERP24): principal `total − X`, irmã transitória `X`, mesmo `invoice_group_id`. Antes contavam-se os mesmos euros duas vezes.

## A trabalhar agora

Épica #146 — Apuramentos múltiplos (D25). Sub-tarefa (a) em produção a 12/09 (Publish do Pedro): tabelas `event_settlements` e `event_settlement_participants`, 7 raízes migradas, casa explícita, espelho temporário de `event_partners`, painel só-leitura na aba Sócios. Os ecrãs continuam a ler `event_partners` até à sub-tarefa (e). Próxima: (b) perímetro por linha.

O Fecho do Evento ganhou a 10/09 o painel **"Verba por usar"** — lista de revisão, por rubrica, da verba de BP não consumida (espelho do excesso por rubrica), logo a seguir à Síntese Operacional. Só leitura, mais um reconhecimento append-only em `event_bp_review_acks` (`unused_net` gravado sempre s/IVA, botão só com `manage_bp`, badge "Revisão desactualizada" quando os números mudam). Ver `.lovable/memory/features/bp-verba-por-usar.md`. Nada mudou no resultado, no acerto com sócios nem nos blockers de fecho.


## Divergência viva: BP de hoje vs. o que foi enviado

Diff corrido a 09/09, linha a linha por id contra o `snapshot_payload` da v4: **zero linhas alteradas, zero apagadas, uma linha nova**.

| | v4 (enviado aos sócios) | BP em produção hoje |
|---|--:|--:|
| Linhas de fecho | 186 | **187** |
| Base | 1.667.709,64 | 1.668.459,64 |
| IVA (linha a linha) | 262.459,85 | 262.459,85 |
| Despesa c/IVA | **1.930.169,49** | **1.930.919,49** |
| Resultado | 597.183,45 | −750,00 |
| Parte EDA (70%) | 418.028,42 | −525,00 |

A linha nova é **`Comissão Durex`, 750,00 € a 0% de IVA**, id `29cb9c41`, rubrica `0371402a`, pagador MP, sem transação associada, criada a 08/09 às 22:12 — depois do congelamento das 18:44. **Por decidir:** se entra numa reemissão da planilha ou se fica para um segundo fecho.

## Próximo passo concreto

Acompanhar a conferência dos sócios e manter o diff v4 ↔ BP atualizado. Só se regera a planilha quando o Pedro fechar o lote de ajustes — nunca a cada linha que entra. Corrigir as três linhas de hospedagem a 0% (#68), 33.783,35 €, pagador EIN, que saem a 6% na fatura dela.

A seguir ao acompanhamento da conferência dos sócios: arrancar a épica **#146 — Apuramentos múltiplos por evento, fechos bilaterais, MP residual (D25)**, pela sub-tarefa (a) — entidade apuramento, participantes com modos `settles`/`nominal`, MP explícita e migração dos eventos existentes para um apuramento raiz.

## Bloqueios

- **#65** é a mesma ferida da #64 vista do `EventFecho.tsx` — ainda por tratar.
- **#133** — o Encontro de Contas ainda não lê as contas de acerto com sócio.

## Feito em 31/08–09/09

- **Planilha da Anitta entregue** (gerador v23): Resumo do Fecho com a secção 5 "A PARTE DOS SÓCIOS" em destaque igual e sem nota de subtração, Comparativo convertido a c/IVA e sem ordenador, Detalhamento com receitas s/IVA e contagem de documentos por linha.
- **Fecho da Ticketline registado** (frente `ticketing-e-receita`, 09/09). Não mexe no resultado — converte custo previsto em realizado.
- **Portal do Sócio com paridade face ao Excel**: receita de bilhetes s/IVA no ecrã, as outras receitas incluídas, exportação de prestação de contas completa (Excel e PDF) agrupada por L2, e a repartição interna MP/EIN colapsada em "Sócios locais" para não expor a divisão da casa.
- **v4 congelada** a 08/09 18:44 como `VF - Fecho 04Set`. As v2 (04/07) e v3 (12/07) são rascunhos abandonados criados automaticamente por edição em grelha; a v1 (17/06, Juliana Martins, 152 linhas, 1.638.460,21) é a primeira versão de todas.
- **Nomenclatura das versões corrigida no UI** (09/09): "Ativa" passou a **Última Congelada**, "Substituída" a **Histórico**, e "Versão Ativa" nos avisos de sandbox a **BP em produção**. Ver `DECISIONS.md`.
- **#64 fechada.** `event_partners.expense_includes_iva` passou a anulável (NULL = herda o evento); os 6 registos existentes foram convertidos. A quota de cada sócio segue a base do contrato dele.
- **#67 fechada** — já estava construída e não tinha sido registada. `entity_documents` (polimórfica), bucket privado `entity-documents`, RLS completa e `EntityDocumentsSection` ligada ao separador Documentos do evento.
- **Composição do custo visível**, **bloco interno "Posição da Mundo Propício"** no Encontro de Contas (nunca em PDF, ver D-ERP10), **Seletor de Apuramento** (por contrato de cada sócio, default, ou pela regra geral do evento), **defeitos do PDF corrigidos** e **relatórios individuais por sócio** na base do destinatário.

## Factos que não se reinvestigam

**Congelar é para isto.** A v4 não é burocracia: é a única forma de saber o que mudou depois de um fecho entregue, porque `event_forecasts.updated_at` **não é mantido** quando o valor muda. O diff faz-se contra o `snapshot_payload` da versão, por `id` de linha — nunca por valor, nunca por `updated_at`. A cada novo lote congelado, a nova versão passa a Última Congelada e a anterior a Histórico, mantendo o snapshot intacto.

**Ajustes depois da entrega são o processo, não um erro.** O fecho entrega-se e os sócios conferem; os ajustes que daí vêm são normais. O que não pode acontecer é a planilha enviada deixar de ter uma fotografia correspondente no sistema.

**Regra da base de apuramento:** sede fiscal **PT** → s/IVA; sede **BR** → c/IVA. Receitas sempre s/IVA. O critério é a sede, não a origem. Falta `suppliers.tax_country` — migração preparada, nunca corrida.

**A Mundo Propício não é um `event_partner`** — continua verdade em `event_partners`; em `event_settlement_participants` já é participante `house` (D25 (a)). É injetada no Encontro de Contas como "casa", com percentagem = 100 − Σ dos sócios. Não existe na tabela. Consequência no Portal: `partner_event_access` não tem `supplier_id`, pelo que o sistema não sabe que sócio um utilizador representa — a heurística em uso é a maior quota que não seja a da casa.

**A MP está escrita como participante `house` na raiz de cada evento com sócios** (Anitta 15/85, Ivete 40/40, FestVybbe 40/40, H&K Madrid 30/30, Mágicos 30/10, Plenitude 25/25, Coala 0 — porque lá a MP é sócio explícito como supplier). Enquanto o espelho existir, `event_partners` é a fonte e a raiz é derivada — nunca editar a raiz à mão.

**Base de apresentação uniforme é decisão de negócio, não erro** (D-ERP10). A casa segue a base contratual do evento no documento apresentado aos sócios; a sua posição real é s/IVA. A diferença é IVA dedutível que fica na empresa. Acertos de IVA entre a MP e sócios portugueses tratam-se **fora do sistema** e arquivam-se no separador Documentos do evento, tipo "Acerto com sócio".

**Com bases mistas não existe resultado único** e a soma das quotas não fecha contra nenhum total. É propriedade do contrato, não defeito. Sinalizado no ecrã e no PDF.

**O evento fecha pelo BP** (D-ERP3). Em co-produção, a ausência de transações nas linhas pagas pelo sócio é o comportamento correto.

**O IVA calcula-se linha a linha, meio afastado do zero** (`roundCents` em `src/lib/iva.ts`). Somar em agregado dá 1.930.169,41 contra 1.930.169,49 linha a linha — 8 cêntimos em 186 linhas. A planilha e o ERP usam linha a linha; qualquer SQL agregado dará um valor ligeiramente diferente e **não é esse o número de fecho**.

**Δ de método por reconciliar:** a query canónica de excedido dá 61.464,91 na Anitta contra os 63.544,11 do ecrã — 2.079,20 na rubrica 2.2.01 Aéreo. Número de fecho sai do ecrã ou da planilha, nunca de SQL ad-hoc.

**Nível 2 vive na planilha:** cascata MP/EIN, ativos exclusivos (bares 93.969,63 · Bengaleiro 138,82 · Oeiras 50.000), encontros de contas — **até à D25; a partir daí passa a apuramento no sistema**. `event_partners` não ganha conceito de ativo por sócio.

**Anitta, três linhas sem transação e sem pagador sócio** (Estrutura WC CNA 9.745, Copos 9.120, Assessoria de Imprensa 2.500): confirmado que aconteceram, à espera de fatura. Não zerar.

**Despesa com pagador sócio: a fatura é dele, o documento fiscal da MP é a refaturação.** Confirmado pelo Pedro em 07/09 para a EIN na Anitta: as faturas dos fornecedores saem em nome da EIN e ela emite depois uma fatura à MP a lastrear reembolso das despesas mais lucro. Consequências: (a) `paying_partner_id` diz quem desembolsa, nunca de quem é o custo fiscal; (b) essas linhas de BP **nunca podem virar transações com fatura de fornecedor no ERP** — seria contar o custo duas vezes quando a fatura da EIN chegar; (c) as 124 linhas da EIN, 1.170.562,18 € de base, que vivem só no BP, estão corretas assim e não são um buraco; (d) a linha do BP é a verdade de gestão e a fatura do sócio é a verdade fiscal, e reconciliam pelo total, nunca linha a linha.

**O IVA que a secção 5 devolve à sociedade é repartição, não fiscalidade.** A cascata é calculada com as despesas c/IVA, portanto a EDA e a Carvalheira suportam 80% de um valor que não é custo real; o IVA volta inteiro à sociedade MP+EIN como lucro. Quem o recupera perante o Estado — a EIN ou a MP — é indiferente, porque em qualquer dos casos fica dentro da sociedade. Daqui decorre que não há dupla contagem: os 214.742,43 € das linhas da EIN são o mesmo IVA que ela recupera, e quando refaturar com IVA próprio entrega ao Estado o que a MP deduz. E refaturar a 23% linhas compradas a 0% também não cria perda — é caixa e calendário, não resultado. Numa despesa de 1.000 + 230: a cascata reparte 1.230 (EDA 861, Carvalheira 123, sociedade 246) e a secção 5 devolve 230 à sociedade, que fica 184 acima do que ficaria com a cascata s/IVA — e esses 184 são exatamente os 80% suportados pela EDA e pela Carvalheira.

**A exposição do IVA é documental, não de cálculo.** A planilha devolve o IVA a partir da taxa do BP, sem verificar se existe fatura por trás. Onde a linha está a 23% e a fatura vem sem IVA, o que foi repartido é um custo que nunca existiu, e não há documento a apontar se for pedido. São 15.836,61 € — open bar 14.726,86 (5 linhas a 23% no BP, transações a 0% e sem fornecedor) e Licenciamento mais Corte da CRIL 1.109,75 (taxas públicas) — dos quais 12.669,29 € vêm da EDA e da Carvalheira. Decisão do Pedro a 08/09: fica assim por enquanto, sabendo que estas linhas podem ser questionadas; a via limpa é pedir ao operador do bar as faturas das linhas que foram a encontro de contas. A decisão de manter o open bar a 23% já tinha sido tomada a 02/09.

**Os dois regimes de faturação do sócio pagador vão conviver.** As despesas que são rateio de um contrato celebrado pela EIN para um evento próprio — houve um festival deles uma semana antes da Anitta — só podem ser refaturação (art. 4.º/4 do CIVA): a adquirente é ela e o contrato serve dois eventos. Nas despesas exclusivas do evento o regime depende de em nome de quem saiu a fatura do fornecedor: em nome da MP cabe o redébito sem IVA do art. 16.º/6/c; em nome da EIN é refaturação. A 08/09 a decisão ainda estava em discussão — tanto que o repasse dos 905.000 foi feito sem fatura gerada.

**A conta de acerto com a EIN existe desde 08/09.** `Acerto EIN · Anitta EDA 2026`, com `is_accounting = true`, controlo de saldo ligado e `partner_id` da EVERYTHINGISNEW. **Não** é conta-espelho: o espelho serve o sócio que paga contas da MP, como o H&K; a EIN faz o contrário, refatura. Os 905.000,00 € do repasse da Ticketline de 04/09 estão lá como par de transferência na rubrica 10.3, com `exclude_from_result` nas duas pernas e nota de que não têm fatura associada. Saldo: 905.000,00. Faltam as outras entradas — Oeiras 50.000,00, bengaleiro 138,82, bares que ficaram com ela — e a fatura dela, quando for emitida. O Encontro de Contas ainda não lê estas contas (#133).

**O recurso do evento que está com a EIN tem origem documental.** Por instrução da MP, a Ticketline transferiu 905.000,00 € diretamente para a EIN em 04/09/2026, ficando 402.836,17 € por liquidar para a MP. Os documentos de fecho da Ticketline são todos em nome da Mundo Propício — a bilhética é da MP, os 905.000 são uma instrução de pagamento e não uma venda da EIN. Revenue share: 5% sobre 2.211.170,00 de vendas web = 110.558,50 + IVA = 135.986,96, faturado pela MP à Ticketline em 07/09 (FT 2026 101). Bate com o fecho: 4% entram como receita do evento, 1% fica como ativo exclusivo MP+EIN.

**O fecho da bilheteira não mexe no resultado.** Confirmado a 09/09 com o fecho da Ticketline da Anitta: bruto 2.424.200,00 − deduções 1.320.700,00 − adiantamentos 1.103.500,00 = **zero líquido a transferir**. Como o evento fecha pelo BP, o custo das quatro faturas da Ticketline já lá estava; o fecho converte previsto em realizado. Detalhe do apuramento na frente `ticketing-e-receita`.

**A conta "Pgto Mágicos Acerto Madrid" é o veículo de devolução do H&K, não financiamento de eventos.** A MP financiou o evento de Madrid acima dos seus 30%; o H&K devolve esse excesso pagando, em reais, contas que a MP tinha no Brasil. As despesas de outros eventos pagas por ali são contas da MP e o H&K é só o canal — não existe dívida entre eventos. Por isso o aporte tem `flow = partner_settlement` e não `event_cash`: nunca entrou no caixa de Madrid.

**`parent_transaction_id` tem dois significados, e só `split_percentage` os separa** (D-ERP26c). Filha de RATEIO (com `split_percentage`) reparte o CUSTO por eventos: o dinheiro sai uma vez, na mãe, e a filha nunca tem conta nem linha em `transaction_payments` — 137 filhas de rateio na Live, zero com conta. PARCELA (sem `split_percentage`) é um pagamento real, na sua data e da sua conta — 12 na Live, e as que foram pagas têm conta e razão próprios. A propagação da liquidação desce às filhas de rateio e nunca toca em parcelas: liquidar o pai não faz sair o dinheiro das parcelas seguintes.

**Decisões de 30/08:** a última versão do BP contém só linhas com custo real; o snapshot faz-se **antes** da limpeza. O guarda-chuva de rubrica para despesas de equipa nasce a zero. O sistema não decide tratamento fiscal — produz a composição por taxa e uma pessoa decide `redebito` ou `reembolso`.

**Existe UM único Extra do Sócio em toda a Live e ZERO splits parciais alguma vez criados.** Medido a 09/09/2026. Tudo o que se corrigiu neste caminho era defeito latente, não estrago instalado.

**`transactions.paid_amount` NÃO é derivado de `transaction_payments`** — 624 de 706 transações liquidadas não têm linhas lá. As guardas só limitam cada campo contra o bruto da própria transação; nunca se reconstrói `paid_amount` a partir do razão de pagamentos.

**Pagar uma transação de um grupo de fatura liquida automaticamente as irmãs**, cada uma pelo seu remanescente, com linha própria em `transaction_payments`. Nunca correu em produção até 09/09/2026: zero dos 147 pagamentos têm essa marca.

## Onde ler mais

- `docs/procedimentos/PROC-fecho-evento.md`
- `docs/estado/estado-ticketing-e-receita.md` — apuramento 2558/2026 e o fecho da Ticketline
- `.lovable/memory/features/fecho-filter-parity.md`, `partner-settlement.md`, `partner-advance-expenses.md`, `event-cost-basis.md`
- `docs/DECISIONS.md` — D-ERP26 (três fronteiras do Extra do Sócio e do rateio), D-ERP3, D-ERP4, D-ERP9, D-ERP10, D-ERP21–D-ERP24, e a nomenclatura das versões de BP
- Issues #82, #65, #85, #68, #133, #146, #147, #148, #150 — #150: mães de rateio divergentes da soma das filhas, sem validação
