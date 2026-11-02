# Issue #194 — E2b: capítulo Bilheteiras (02/11/2026)

Entrega R1 preparatória na cópia local, sobre `d8d9c954f01cffb5a1234dd4d2c3cb7dc5e84a16`. O HEAD local coincide com a base indicada no despacho. Nenhum commit, push ou consulta remota foi feito; os estados de CI e reservas citados no despacho não foram revalidados por rede nesta execução.

## Fontes efetivamente conferidas

- Instruções: `docs/INDEX.md`, `docs/QUADRO.md`, `AGENTS.md`. Pesquisa de `AGENTS.md` não encontrou instruções subordinadas nos diretórios dos ficheiros desta entrega ou dos componentes lidos.
- Estado e procedimento: `docs/estado/estado-ticketing-e-receita.md` e `docs/procedimentos/PROC-fecho-evento.md` (somente leitura; nenhuma query executada).
- Formato canónico: `docs/manual/fecho-do-evento.md`, `docs/manual/bp-e-cache.md`, `docs/manual/transitorias.md`, `docs/manual/rateios.md`.
- Legado: grupo `ticket-offices` em `src/lib/help-manual.ts`.
- Parser e consumo: `src/lib/help-manual-parser.ts`, `src/lib/help-manual-source.ts`, `src/lib/__tests__/help-manual-parser.test.ts`, `src/pages/HelpCenter.tsx`.
- Memórias: `.lovable/memory/features/ticket-office-statements.md`, `ticket-office-reconciliation.md`, `ticket-office-sales-scope.md`, `venue-retained-door-sales.md`, `settlement-transfer-pair.md` (os últimos quatro nomes relativos à mesma pasta).
- Página e posição: `src/pages/TicketOffices.tsx`, `src/components/TicketOfficePositionCards.tsx`, `src/components/TicketOfficeBalancePanel.tsx`, `src/lib/ticket-office-position.ts`, `src/lib/ticket-office-balance.ts`, `src/lib/ticket-office-reconciliation.ts`.
- Apuramentos: `src/components/TicketOfficeStatementsPanel.tsx` e `src/components/TicketOfficeStatementDocuments.tsx`.
- Fechos: `src/components/TicketOfficeSettlementsPanel.tsx`, `src/components/TicketOfficeSettlementModal.tsx`, `src/components/TicketOfficeSettlementLauncher.tsx`, `src/components/TicketOfficeSettlementViewDialog.tsx`, `src/components/TicketOfficeSettlementsOverview.tsx`, `src/lib/ticket-office-settlement-calc.ts` e `src/lib/ticket-office-settlement-eligible.ts`.
- Conferência analítica: `src/components/ReportTicketOfficeAudit.tsx`; pesquisa complementar em `src/components/TicketOfficeEventsList.tsx` e `src/components/TicketOfficeTicketingTab.tsx` para localizar ações de conciliação.

## Comportamento comprovado e limites

| Tema | Evidência local e limite |
|---|---|
| Retido | `computeTicketOfficeBalance` soma vendas e movimentos elegíveis pelo valor pago; evita abater adiantamentos já ligados. `TicketOfficePositionCards` usa `ticket_office_balances` para o retido e saldos por evento para o valor por apurar. Não houve leitura da base. |
| Movimentado | A página calcula saldo inicial mais entradas menos saídas pelos valores pagos lidos. O legado descreve despesas mais transferências: divergência explicitada, sem alterar o legado. |
| Posição | Último apuramento, mesmo rascunho; absoluto no cartão Já adiantado, com texto próprio para posição positiva. Retido já inclui a posição. Diferença de calendário é residual, não diagnóstico automático nem alerta operacional. |
| Âmbitos | Memórias e tooltips declaram âmbitos distintos; a implementação passa as vendas agregadas da conta ao total sem filtrar por atribuição. As atribuições limitam a apresentação por evento. O capítulo explicita o limite em vez de repetir a legenda como prova. |
| Apuramentos | Painel apresenta linhas tipadas, somas, sinais, pendentes e documentos. Não oferece criação/edição das linhas nem confirmação. Gestão de anexos é separada, para admin/manager. A regra de confirmação soma/pendentes é atribuída à memória, sem alegar teste do backend. |
| Conciliação | Analítica preserva eventos e movimentos sem evento; mostra soma, saldo previsto e diferença. O formulário envia conciliated_by na gravação do fecho; não se identificou nos painéis um botão autónomo para marcar conciliado. A prova é de código, não de efeitos remotos. |
| Direito do evento | `computeSettlement` calcula bruto menos deduções, retido pela sala e restante da fatura quando aplicado; ignora adiantamentos. O capítulo Fecho e a memória antiga de retenção ainda incluem adiantamentos na fórmula: ficam pendentes de revisão, sem edição nesta parcela. |
| Confirmação e crédito | Modal distingue rascunho, confirmação e transferência opcional, estado recebido/pendente e fecho por apuramento. Painel permite confirmar crédito e exige admin/motivo para estorno. Anexos antecedem a gravação financeira e podem persistir se esta falhar. Não se promete atomicidade dos anexos. |
| Fecho financeiro | O capítulo distingue direito por evento/operador, posição documental da conta e acerto/selo/conclusão do evento. Remete para secções existentes do Fecho; não afirma que fechar bilheteira conclui o evento. |

A cadeia histórica de apuramentos e a equivalência linha a linha dos documentos estão incompletas nas fontes da frente. Não se reproduziram valores empresariais, dados pessoais ou exemplos reais no capítulo. Não se inventaram fechos, ligações, percentagens de retenção nem procedimentos de escrita ausentes da UI. As validações locais não comprovam saldos, permissões ou documentos atuais em Live.

Não foi criado `docs/manual/img/bilheteiras-fluxo.svg`: a tabela comparativa distingue os três processos sem sugerir uma sequência de operações que o painel de apuramentos não permite executar.

## Anchors, links e recursos

O parser real lê seis secções, com tooltip, ecrãs, perfis, fontes e termos:

- `bilheteiras.consultar`
- `bilheteiras.saldos`
- `bilheteiras.apuramento`
- `bilheteiras.conciliacao`
- `bilheteiras.fecho`
- `bilheteiras.fecho-financeiro`

O teste lê todos os capítulos reais de `docs/manual/*.md` e verifica unicidade de slugs e anchors. Resolve todas as fontes declaradas para ficheiros existentes; não testa apenas presença de frases.

Os quatro links usam `/ajuda?artigo=fecho-do-evento#<anchor>`, contrato de deep-link observado em `HelpCenter.tsx`, e resolvem no artigo real para `fecho.ordem`, `fecho.encontro-de-contas`, `fecho.selar` e `fecho.concluir`. O teste percorre links/imagens com o lexer Markdown e verifica os destinos contra os artigos produzidos pelo parser real. Não há imagem, recurso externo ou referência órfã. A resolução local não comprova disponibilidade remota.

A decomposição em chunks também usa `chunkArticle` real: cobre cada secção, conserva termos/posições e permite reconstruir integralmente o corpo de cada secção. Não se duplicou o parser.

## Validações locais

- `bunx vitest run` antes das edições: exit 0; 338 ficheiros aprovados, 2 ignorados; 3373 testes aprovados, 6 ignorados e 11 todo. Duração 160,04 s. Sem falhas de base.
- `bunx vitest run src/lib/__tests__/help-manual-bilheteiras.test.ts`: exit 0; 5/5 testes aprovados, duração 2,09 s.
- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0, sem diagnósticos.
- `bun run build`: exit 0; Vite concluiu em 1 min 10 s e gerou o service worker. Aplicável porque `help-manual-source.ts` inclui os capítulos Markdown por glob no bundle. Avisos de Browserslist desatualizado, imports estáticos/dinâmicos e tamanho de chunks não foram ocultados nem motivaram alterações de dependências/configuração.
- `bunx vitest run` após as edições: exit 0; 339 ficheiros aprovados, 2 ignorados; 3378 testes aprovados, 6 ignorados e 11 todo. Duração 141,89 s. Diferença face à base: +1 ficheiro e +5 testes aprovados, sem falhas nem novos skips/todo.
- Revisão integral dos diffs dos ficheiros novos e verificação dos caminhos: apenas os três artefactos versionáveis autorizados e `.executor/resumo.md`; `git diff --exit-code` confirma que nenhum ficheiro já versionado foi modificado. Verificação de whitespace também nos ficheiros novos sem erros.
- Nenhum teste existente foi alterado, ignorado ou teve timeout/limites ajustados. Não foi necessário corrigir falhas ou atuar fora do recorte.

Logs temporários no runner: `/tmp/issue194-dedicated.log`, `/tmp/issue194-tsgo.log`, `/tmp/issue194-vitest-before.log`, `/tmp/issue194-vitest-after.log`, `/tmp/issue194-build.log`. CI remoto não executado nesta parcela local sem commit/push.

## Pendências separadas

- **Integração UI/tooltips:** não executada; `helpTexts`, `HelpLink` e componentes de produto intactos. O carregador existente descobre automaticamente ficheiros Markdown no build; não foi alterado nem foi invocada sincronização.
- **Remoção do legado:** não executada; `src/lib/help-manual.ts` intacto. O slug legado `ticket-offices` difere de `bilheteiras`, pelo que este ficheiro novo não prova substituição automática do grupo antigo.
- **Revisão funcional:** pendente com a equipa; inclui Movimentado, âmbitos declarados versus cálculo, fórmula antiga de adiantamentos no Fecho e na memória de retenção, cadeia documental e ligação que ainda não abre automaticamente o separador Apuramentos.
- **Sincronização futura:** não executada; requer etapa própria. Não há prova de importação, pesquisa pela IA ou disponibilidade dos novos anchors na plataforma.
- **Publish:** não executado nem autorizado nesta parcela.

A migração integral do manual e a Issue #194 permanecem abertas. Nenhum ficheiro existente de produto, parser ou manual foi alterado; o relatório e `.executor/resumo.md` são as saídas de fecho desta parcela.
