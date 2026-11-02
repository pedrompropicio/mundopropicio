---
capitulo: bilheteiras
titulo: Bilheteiras
modulo: erp
atualizado: 2026-11-02
perfis: [manager, admin]
rotas: [/bilheteiras]
fontes: [ticket-office-statements, ticket-office-reconciliation, ticket-office-sales-scope, src/pages/TicketOffices.tsx, src/lib/ticket-office-balance.ts, src/lib/ticket-office-position.ts]
---

# Bilheteiras

Uma bilheteira tem uma conta financeira e eventos associados. O dinheiro retido nessa conta, o direito de um evento e a posição de um apuramento respondem a perguntas diferentes. Conferir um deles não prova os outros.

Este capítulo é uma preparação documental local. Não comprova publicação, sincronização nem disponibilidade na pesquisa da plataforma.

## Onde consultar

```ajuda
id: bilheteiras.consultar
tooltip: "Abra Bilheteiras e escolha a conta: Dados, Liquidez, Vendas / Bilhetes, Fechos e Apuramentos mostram aspetos diferentes da mesma bilheteira."
ecras: [bilheteiras]
perfis: [manager, admin]
fontes: [src/pages/TicketOffices.tsx, src/components/TicketOfficeSettlementsOverview.tsx]
termos: [bilheteiras, ticketline, conta da bilheteira, onde ver fechos]
```

Em **Bilheteiras**, escolha a bilheteira para abrir os separadores:

- **Dados** — contactos, notas e resumo financeiro.
- **Liquidez** — composição do retido e saldo por evento.
- **Vendas / Bilhetes** — eventos associados e informação de bilhetes.
- **Fechos** — registos por evento e bilheteira, com consulta pelo botão do olho.
- **Apuramentos** — posição da conta, Apuramentos Ticketline e histórico de adiantamentos.

A lista geral inclui **Todos os fechos de bilheteira**, filtrável por bilheteira e evento. A forma de liquidação distingue a informação derivada da declarada à mão; declarar uma forma não prova uma entrada no banco. Criar e gerir fechos depende das permissões da sessão; ver o conteúdo não equivale a poder alterá-lo.

## Saldos e composição do retido

```ajuda
id: bilheteiras.saldos
tooltip: "Retido é o saldo ainda na bilheteira. Valor por apurar soma saldos dos eventos sem fecho e sem apuramento, não vendas brutas. A posição apurada já está no retido."
ecras: [bilheteiras.saldo, bilheteiras.liquidez, bilheteiras.apuramentos]
perfis: [manager, admin]
fontes: [src/pages/TicketOffices.tsx, src/components/TicketOfficeBalancePanel.tsx, src/components/TicketOfficePositionCards.tsx, src/lib/ticket-office-balance.ts, src/lib/ticket-office-position.ts, src/lib/ticket-office-reconciliation.ts]
termos: [saldo retido, retido na bilheteira, valor por apurar, já adiantado, outros movimentos, movimentado, transferido]
```

**Retido** é dinheiro ainda na bilheteira, não disponível no banco da empresa. A decomposição é:

> Vendas + receitas − despesas − transferências − adiantamentos ainda não contados por transação ou fecho = retido.

No cálculo partilhado, os movimentos pertencem à conta da bilheteira, estão aprovados ou pagos, não estão estornados nem escondidos e contam pelo **valor pago**, não pelo valor nominal da fatura. Um adiantamento ligado a uma transação ou fecho não se subtrai outra vez. As vendas usam o total registado; quando não existe, quantidade × preço unitário.

**Transferido**, no resumo da página, soma as saídas pagas elegíveis da rubrica **10.3 Transferências Internas**. **Movimentado**, nessa mesma página, é calculado como saldo inicial da conta mais entradas menos saídas pelos valores pagos lidos. Apesar do nome, não é apresentado aqui como total de despesas mais transferências: essa explicação do manual antigo não corresponde ao cálculo atual. Não use esse indicador para provar o retido ou o crédito bancário.

Em **Liquidez**, **Outros movimentos** é o resto que falta para os indicadores fecharem no retido; inclui receitas lançadas e movimentos sem evento. Só aparece a partir de um cêntimo em valor absoluto. Os totais por evento não explicam sozinhos os movimentos sem evento.

Em **Apuramentos**, os três cartões têm esta leitura:

| Cartão | O que representa |
|---|---|
| **Valor por apurar** | Soma dos saldos dos eventos atribuídos sem qualquer registo de fecho e sem presença nas linhas de apuramentos. Inclui eventos liquidados com saldo zero. Não é venda bruta. |
| **Já adiantado** | Valor absoluto da posição do apuramento mais recente. Se a posição for positiva, o próprio cartão explica que é valor a entregar à MP, não adiantamento. |
| **Saldo retido** | Saldo obtido pela leitura canónica da conta. Já inclui a posição apurada. |

> Retido = posição apurada com sinal + saldos dos eventos sem fecho e sem apuramento + diferença de calendário.

Com posição negativa, a mesma conta lê-se como **valor por apurar − já adiantado + diferença de calendário = retido**. Nunca abata o já adiantado novamente ao retido.

A posição usada é a do último apuramento, podendo ser **rascunho**; não significa que o documento esteja confirmado. A **diferença de calendário** só aparece se o valor absoluto atingir um cêntimo e permite abrir detalhe. É uma explicação da composição, não uma tarefa ou prova de erro: pode envolver movimentos já feitos pela bilheteira ainda não refletidos no registo e eventos à espera de apuramento. O detalhe pode ser incompleto; não atribua automaticamente toda a diferença a uma sala.

⚠️ **Âmbito:** as memórias e os textos de ajuda declaram universos diferentes para página, Liquidez e Auditoria. No código atual, a página e Liquidez recebem todas as vendas devolvidas pela leitura agregada da conta; as atribuições limitam a apresentação por evento, não filtram essas vendas antes do cálculo do total. A Auditoria também consulta vendas por conta. Antes de comparar números, confira conta, atribuições e movimentos incluídos; a correspondência entre as legendas históricas e estes totais precisa de revisão funcional. Não se assume que os três ecrãs tenham universos iguais em todos os detalhes.

## Extratos e Apuramento Ticketline

```ajuda
id: bilheteiras.apuramento
tooltip: "O Apuramento Ticketline reúne direitos de eventos, faturas, acertos de sala, repasses e transitados com sinal. Fechar a soma não prova a conferência linha a linha com o documento."
ecras: [bilheteiras.apuramentos]
perfis: [manager, admin]
fontes: [ticket-office-statements, src/components/TicketOfficeStatementsPanel.tsx, src/components/TicketOfficeStatementDocuments.tsx]
termos: [extrato ticketline, apuramento ticketline, repasse, transitado, posição a fechar, crédito para o seguinte]
```

Na aba **Apuramentos**, cada documento registado mostra número, data, estado, linhas ordenadas, soma das linhas, total do documento, subtotais por tipo e documentos anexos. Os tipos são **Direito do evento**, **Fatura Ticketline**, **Acerto da sala**, **Repasse** e **Transitado**.

Os valores conservam o sinal: positivo a favor da MP, negativo a favor da Ticketline. A soma negativa indica crédito da bilheteira para o apuramento seguinte; positiva indica valor a entregar à MP; a zero não há posição em nenhum dos sentidos. Repasses e transitados são movimentos da conta, não deduções a imputar a um evento para fazer o seu fecho dar zero.

O painel assinala linhas **pendentes de documento** e diferenças entre soma e total. Um valor numérico zero não elimina a condição de pendente. Segundo a memória funcional, a confirmação exige soma igual ao total e ausência de pendentes; **este painel não oferece criação, edição de linhas ou confirmação de apuramentos**. Não há aqui um procedimento operacional comprovado para essas ações.

Os documentos podem ser abertos; admin e gestor podem carregar e remover anexos. Essa gestão de anexos não confirma o apuramento nem cria movimentos financeiros. O histórico de adiantamentos permanece para consulta: não serve para atribuir repasses genéricos a eventos nem para novos lançamentos.

⚠️ A cadeia histórica e a correspondência linha a linha com os PDFs têm pendências registadas no estado da frente Ticketing & Receita. Um total correto ou um anexo presente não prova cadeia completa. Obter e conferir os documentos em falta é revisão operacional separada; este capítulo não preenche lacunas nem comprova o estado atual de dados remotos.

## Conciliação e conferência

```ajuda
id: bilheteiras.conciliacao
tooltip: "Confira vendas, despesas na conta certa, transferências, repasses e documentos. Na Auditoria, a soma por evento mais os movimentos sem evento deve explicar o saldo previsto."
ecras: [bilheteiras.liquidez, bilheteiras.apuramentos]
perfis: [manager, admin]
fontes: [ticket-office-reconciliation, ticket-office-sales-scope, src/lib/ticket-office-reconciliation.ts, src/components/ReportTicketOfficeAudit.tsx, src/components/TicketOfficeSettlementModal.tsx]
termos: [conciliação, conciliado, saldo previsto, diferença de calendário, movimentos sem evento, conferir extrato]
```

1. Confira as vendas registadas da conta e do evento com os documentos da bilheteira. O fecho usa as vendas dessa bilheteira; havendo várias, os fechos são independentes.
2. Confira se cada despesa descontada pela bilheteira está lançada **na conta dessa bilheteira**. Sem conta, o desconto documental não reduz o saldo registado.
3. Separe custos, transferências internas e repasses: não desconte o mesmo movimento duas vezes.
4. Compare o apuramento linha a linha com o documento, além de conferir a soma e os pendentes.
5. Em **Liquidez**, clique no retido para abrir os movimentos da bilheteira no relatório de Auditoria. Na vista analítica, confira **Σ saldos por evento + sem evento**, **Saldo previsto da bilheteira** e **Diferença**.

A decomposição analítica soma vendas e receitas e subtrai despesas, transferências e adiantamentos, preservando o bloco **sem evento**. Essa prova confere os registos incluídos; não é confirmação do recebimento no banco nem conferência automática do PDF externo.

A gravação confirmada de um fecho envia o carimbo de conciliação pela operação de gravação do fecho. Não foi identificado nestes painéis um botão autónomo de **Marcar como conciliado** como sugere a ajuda antiga. Não use essa indicação antiga como sequência operacional.

**Dinheiro da bilheteira local retido pela sala:** a memória funcional distingue a passagem entre contas, fora do resultado, da comissão da sala, que é custo. Não basta escrever uma nota no apuramento nem antecipar uma devolução para resolver a conta. O campo de retenção no fecho pode abater ao direito sem gerar pagamento de fatura quando nenhuma fatura é escolhida. A regularização concreta depende dos documentos e de conferência própria; não se inventam acertos para atingir um saldo antigo.

## Fecho da bilheteira por evento

```ajuda
id: bilheteiras.fecho
tooltip: "O fecho apura o direito do evento nesta bilheteira. Guardar rascunho, confirmar o fecho e confirmar crédito são ações distintas. Repasses ficam no apuramento."
ecras: [bilheteiras.fecho]
perfis: [manager, admin]
fontes: [src/components/TicketOfficeSettlementsPanel.tsx, src/components/TicketOfficeSettlementModal.tsx, src/components/TicketOfficeSettlementViewDialog.tsx, src/lib/ticket-office-settlement-calc.ts, src/lib/ticket-office-settlement-eligible.ts]
termos: [novo fecho, direito do evento, rascunho, confirmar crédito, retido pela sala, guardar pdf, estornar fecho]
```

Na bilheteira, abra **Fechos → Novo Fecho**. O botão exige admin ou permissão de gerir contas. O seletor oferece eventos atribuídos sem fecho confirmado nessa bilheteira; é necessário haver registos de vendas para prosseguir.

1. Escolha evento e **data do fecho**. O ecrã indica que esta data serve para o pagamento das despesas e da transferência ao confirmar.
2. Confira a **Receita bruta de bilhetes (c/IVA)** calculada das vendas. O ajuste manual tem campo próprio de justificação.
3. Selecione apenas as **Despesas pagas pela bilheteira (c/IVA)**. A lista distingue as já pagas por esta conta das despesas em aberto; estar na lista não prova que a bilheteira as pagou. Pode anexar faturas às deduções. Ao confirmar com deduções sem documento, o ecrã avisa e pede confirmação explícita; não é o bloqueio de documento pendente do apuramento.
4. Se aplicável, indique a venda à porta retida pela sala, a fatura a abater e a opção de liquidar o saldo restante pela bilheteira. Sem fatura escolhida, a retenção reduz o direito, mas não cria esse pagamento parcial automaticamente. Com fatura, o valor retido não pode exceder o saldo em aberto.
5. Confira o **Direito do evento** e qualquer ajuste declarado, com justificação.
6. Reveja a transferência, se houver, a conta destino e a situação de crédito. Não declare recebido o que está por receber. Um fecho ligado a apuramento, sem transferência já lançada, trata a liquidação pelo apuramento e não pede uma segunda transferência.
7. Reveja comprovativo e notas; escolha guardar rascunho ou confirmar.

> Direito calculado = receita bruta − deduções − retido pela sala − saldo de fatura pago pela bilheteira, quando aplicado.

**Os adiantamentos não entram nesta fórmula.** O botão de novo adiantamento está desativado; repasses pertencem ao Apuramento Ticketline. Transações de transferência interna fora do resultado e a própria transferência do fecho são excluídas das deduções. Em despesas rateadas, confira a indicação **fatura completa · parte deste evento** e não pague novamente as partes quando a mãe já representa o pagamento.

O formulário envia a gravação/confirmação para a operação de fecho; confirmar pode liquidar deduções, compensar a fatura e criar a transferência pedida. **Não é uma ação só documental.** Faturas anexadas são carregadas antes dessa gravação: falhar o fecho não significa desfazer anexos já carregados.

O cartão distingue **Confirmado**, **Crédito a receber** e **Crédito liquidado** quando há transferência. Se há crédito pendente, **Confirmar crédito** permite indicar a data efetiva. Confirmar sem transferência pode deixar o direito retido; não prova recebimento bancário.

O botão do **olho** abre uma vista só de leitura, também para rascunhos, com **Guardar PDF**. Um PDF de rascunho não é confirmação. Só admin pode estornar fechos confirmados, com motivo obrigatório. Se já existe transferência lançada, o formulário manda estornar antes de voltar a confirmar alterações; não se reconfirma para criar novo repasse.

## Fecho de bilheteira e fecho financeiro do evento

```ajuda
id: bilheteiras.fecho-financeiro
tooltip: "Fechar a bilheteira apura um direito por evento e operador. O Apuramento Ticketline fecha a posição documental da conta. O fecho financeiro reparte e sela o resultado do evento."
ecras: [bilheteiras.fecho, bilheteiras.apuramentos, evento.fecho]
perfis: [manager, admin]
fontes: [docs/manual/fecho-do-evento.md, docs/manual/bp-e-cache.md, docs/manual/transitorias.md, docs/manual/rateios.md, src/lib/ticket-office-settlement-calc.ts]
termos: [fecho financeiro, fechamento do evento, selar, encontro de contas, fecho versus apuramento]
```

| Processo | Âmbito e resultado |
|---|---|
| **Fecho da bilheteira** | Um evento numa bilheteira: bruto, deduções, direito e eventual transferência. |
| **Apuramento Ticketline** | Documento da conta: direitos de eventos, faturas, sala, repasses e transitados; posição a transportar ou entregar. |
| **Fecho financeiro do evento** | Receitas e custos do evento, Encontro de Contas com os sócios, selo e conclusão do evento. |

O fecho de bilheteira não sela o resultado nem conclui o evento. O direito em bruto com deduções não é o lucro do evento. O apuramento da conta não substitui o acerto com os sócios.

Consulte a [ordem do fecho do evento](/ajuda?artigo=fecho-do-evento#fecho.ordem), o [Encontro de Contas](/ajuda?artigo=fecho-do-evento#fecho.encontro-de-contas), o [selo do fechamento](/ajuda?artigo=fecho-do-evento#fecho.selar) e a [conclusão do evento](/ajuda?artigo=fecho-do-evento#fecho.concluir). São referências a secções existentes do capítulo Fecho; a disponibilidade na plataforma depende da sua publicação e sincronização.

⚠️ **Divergência documental a rever:** a secção existente **Bilheteira e dinheiro retido** do capítulo Fecho ainda descreve abater adiantamentos no fecho de bilheteira. A fórmula atual em `computeSettlement` ignora adiantamentos, conforme a memória de apuramentos. Para este procedimento vale a implementação descrita acima. A revisão desse capítulo e da ajuda antiga permanece separada desta entrega.
