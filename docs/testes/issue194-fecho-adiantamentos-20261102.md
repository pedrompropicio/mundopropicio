# Issue #194 — E2b: adiantamentos no capítulo Fecho

Execução local R1 de 02/11/2026, despacho #473. Base conferida por `git rev-parse HEAD`: `714ba8a138f5b2fe7002135fe3d8715be93abaa0`; árvore inicialmente limpa. Validade do despacho conferida às 09:15:20 UTC, antes das edições (limite 09:59 UTC). Não houve consulta remota das autorizações ou do CI; os links e o estado remoto constam do despacho fornecido pelo Pedro.

## Comparação antes/depois

| Caminho e recorte | Antes | Depois |
|---|---|---|
| `docs/manual/fecho-do-evento.md`, frontmatter | `atualizado: 2026-10-10` | `atualizado: 2026-11-02`, chave real lida pelo parser como `updated_on`. |
| Mesmo ficheiro, apenas `fecho.bilheteira` | Mandava abater adiantamentos ao líquido do fecho e descrevia a transferência como parte obrigatória. | Explica o direito sem novo desconto de adiantamentos, o saldo restante de fatura condicional, a transferência eventual e a distinção entre confirmação e crédito bancário. |
| Mesmo bloco `ajuda` | Fontes sem D-ERP232 e sem `ticket-office-statements`. | Acrescenta ambas as referências; mantém id, heading, ecrãs, perfis e termos. |
| Fórmula do retido | Vendas − despesas − transferências − adiantamentos ± outros movimentos. | Fórmula preservada integralmente; explicita elegibilidade dos adiantamentos sem transação nem fecho e evita segunda contagem. |
| `docs/manual/bilheteiras.md`, nota final | Avisava de divergência ainda existente no capítulo Fecho. | Liga à secção corrigida `fecho.bilheteira`; todo o texto anterior permanece byte a byte. |
| `src/lib/__tests__/help-manual-bilheteiras.test.ts` | Expectativa estrita de quatro links. | Acrescenta apenas o quinto link autorizado, `/ajuda?artigo=fecho-do-evento#fecho.bilheteira`, depois dos quatro existentes e na ordem de ocorrência. Mantém `toEqual`, resolução real de destinos/anchors, parser, chunks e todas as demais asserções. |

A secção Fecho inclui a ligação inversa para `/ajuda?artigo=bilheteiras#bilheteiras.fecho`. As restantes secções de Fecho não foram alteradas. Permanecem as ressalvas de Bilheteiras sobre universos das memórias/legendas históricas, ajuda antiga, cadeia documental incompleta e ausência de comprovação remota.

## Fontes efetivamente verificadas na cópia local

- `docs/INDEX.md`: origem dos artigos, blocos `ajuda`, D-ERP79 e sequência Publish → Sincronizar manual.
- `docs/QUADRO.md`: regras, quadro de execução e secções Plataforma/Ticketing; o despacho atual define o recorte autorizado.
- `AGENTS.md`: regras de arquitetura e lista fechada; a pesquisa de AGENTS subordinados não encontrou nenhum aplicável aos caminhos editados em `docs/` e `src/lib/`.
- `docs/estado/estado-ticketing-e-receita.md`: direito do evento, posição/retido e pendências históricas; não foi usado como prova de dados remotos atuais.
- `.lovable/memory/features/ticket-office-statements.md`: repasses/transitados no apuramento, D-ERP232, adiantamentos históricos só de leitura e posição já incluída no retido.
- `.lovable/memory/features/ticket-office-reconciliation.md`: composição analítica do retido, adiantamentos e outros movimentos.
- `docs/DECISIONS.md`, D-ERP232 e D-ERP233: direito sem abater adiantamentos e posição da conta distinta do direito de um evento.
- `docs/procedimentos/PROC-fecho-evento.md`: conferência, selo e fecho financeiro; apenas leitura, sem executar as queries que o procedimento contém.
- `docs/manual/fecho-do-evento.md` e `docs/manual/bilheteiras.md`: capítulos reais, blocos e ressalvas preservadas fora do recorte.
- `src/lib/ticket-office-settlement-calc.ts`: `computeSettlement`, campos de entrada e limites da fatura.
- `src/components/TicketOfficeSettlementModal.tsx`: import e chamada de `computeSettlement`, ajuste justificado, `byStatement`, transferência opcional, `wantsTransfer`, estado de crédito e payload de gravação; nenhuma dessas operações foi invocada.
- `src/components/TicketOfficePositionCards.tsx`: saldo canónico via `ticket_office_balances`, vendas via `get_ticket_office_sales`, texto dos cartões e diferença visível a partir de 0,01 em valor absoluto.
- `src/lib/ticket-office-balance.ts`: `isOpenTicketOfficeAdvance`, elegibilidade por conta/estado e cálculo pelo valor pago.
- `src/lib/help-manual-parser.ts`, `src/lib/help-manual-source.ts` e `src/pages/HelpCenter.tsx`: parser e chunks de produção, inclusão Markdown no bundle, parâmetro `artigo` e navegação para `id={s.anchor_id}`.
- `src/lib/__tests__/help-manual-bilheteiras.test.ts`, `src/lib/__tests__/help-manual-parser.test.ts` e `src/lib/__tests__/ticket-office-settlement-calc.test.ts`: contratos e casos numéricos existentes.

## Fórmula e limites comprovados

`computeSettlement` calcula `bruto − deduções − retido pela sala − (remainderApplied ? invoiceRemainder : 0)`. Não desestrutura nem subtrai `totalAdvances`, campo obsoleto. `invoiceRemainder = max(0, saldo em aberto − retido pela sala)`; só é aplicado com fatura selecionada, opção ativa e saldo superior a 0,005. O modal arredonda o direito ao cêntimo. Retenção acima do saldo da fatura por mais de 0,005 é sinalizada e impede a submissão pelo modal.

O teste numérico existente dá direito 8.500 para bruto 10.000, deduções 1.500 e adiantamentos 500. Os casos existentes de retenção 1.200 e fatura aberta 5.000 dão direito 8.800 sem liquidar o restante e 5.000 com a opção ativa. Nenhuma regra ou fórmula financeira foi alterada.

O retido continua a subtrair adiantamentos elegíveis separadamente: `isOpenTicketOfficeAdvance` exige ausência simultânea de `transaction_id` e `settlement_id`. Os movimentos já representados não são subtraídos de novo. Os cartões obtêm o retido pela RPC canónica, distinguem o direito por evento da posição do apuramento e dizem que o já adiantado está incluído no saldo.

No modal, `byStatement` requer apuramento ligado e ausência de transferência já lançada. A transferência só é pedida ao confirmar com valor positivo, destino escolhido e sem liquidação pelo apuramento ou transferência prévia. A situação de crédito é um campo próprio. Isto comprova o texto documental local; não comprova transferência executada ou recebimento bancário.

## Anchors, parser e limites de escrita

- Os cinco destinos de Bilheteiras existem no corpus real: `fecho.ordem`, `fecho.encontro-de-contas`, `fecho.selar`, `fecho.concluir` e `fecho.bilheteira`, no artigo `fecho-do-evento`.
- A ligação inversa resolve `bilheteiras.fecho` no artigo `bilheteiras`.
- Verificação adicional com `parseHelpArticle` e `chunkArticle` reais: cinco capítulos lidos; seis links entre os dois artigos resolvidos; anchors e perfis comparados com HEAD; conteúdo reconstruído dos chunks preservado, descontando apenas imagens conforme o parser de produção.
- Comparação programática contra HEAD confirmou Fecho inalterado fora da data e da secção 2, Bilheteiras inalterado antes da nota final e teste inalterado exceto pela linha explicitamente autorizada.
- Nenhum teste novo baseado em frases foi criado; o teste existente só recebeu a expectativa de link explicitamente autorizada.

## Validação local

- Antes da edição: `bunx vitest run src/lib/__tests__/help-manual-bilheteiras.test.ts src/lib/__tests__/help-manual-parser.test.ts src/lib/__tests__/ticket-office-settlement-calc.test.ts` — exit 0; 3 ficheiros, 37 testes aprovados.
- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` — exit 0, sem diagnósticos.
- `bun run build` na cópia isolada em `/tmp/issue194-build` — exit 0; Vite concluiu em 1m48s e gerou o service worker; `bundle-report.json` confirma os dois artigos no bundle e as fontes compiladas foram comparadas byte a byte com os ficheiros editados. Avisos de Browserslist desatualizado e chunks acima de 500 kB não bloquearam o build; nenhuma dependência ou configuração foi alterada.
- `bunx vitest run` — exit 0; 341 ficheiros aprovados e 2 ignorados; 3.401 testes aprovados, 6 ignorados e 11 todo, sem falhas (223,19 s). Inclui os 5 testes de Bilheteiras, os 10 do parser e os 22 do cálculo; nenhum skip, timeout ou gate foi alterado.
- Não foi observada falha a classificar como regressão ou preexistente. A prova anterior à edição abrange os 37 testes focados; não se reivindica execução local completa anterior.
- `git diff --check` — exit 0; diff completo revisto, incluindo os dois ficheiros novos, e lista fechada de cinco caminhos conferida.

Os logs desta execução ficam temporariamente em `/tmp/issue194-tsgo.log`, `/tmp/issue194-vitest.log` e `/tmp/issue194-build.log`. O build usa uma cópia dos ficheiros versionados locais em `/tmp/issue194-build`, com as edições dos artigos e sem ficheiros `.env`, para não gerar `dist/` na árvore de trabalho. Usa as dependências já instaladas, sem alterações de configuração ou lockfiles.

## Pendências separadas

- Publish não foi executado e não está autorizado neste despacho.
- Sincronização do manual não foi executada; disponibilidade na plataforma e na pesquisa não foi verificada.
- A ajuda antiga e as memórias históricas não foram corrigidas; as ressalvas existentes permanecem.
- A migração integral da Issue #194 não está concluída; a issue-mãe permanece aberta.
- Não houve Live, ligação a serviços MP, queries remotas, DDL/DML, deploy, envios externos, commits, push ou PR.
- O CI remoto informado pelo despacho não foi revalidado nesta execução local; não há commit novo para validar remotamente.
