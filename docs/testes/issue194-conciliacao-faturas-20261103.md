# Issue #194 — E2b: Conciliação Bancária e Faturas/Fornecedores

Entrega R1 local de 03/11/2026, sobre o HEAD `372427d08d24fb845c0b93f0472e31873cf9e2cc`. O despacho cita uma medição em `d04ef00`; o trabalho foi conferido contra os ficheiros da cópia local, sem consultar comentários, serviços da MP ou Live. Não houve commit, push, DDL/DML, sincronização ou Publish.

## Âmbito e fontes

Foram lidos primeiro `docs/INDEX.md`, as entradas pertinentes de `docs/QUADRO.md` e os estados de Financeiro/Tesouraria e Plataforma/Infra. O despacho prevalece sobre os rituais de escrita remota e fecho geral destes documentos: só os caminhos fechados desta entrega foram editados. Foram conferidos o `AGENTS.md` raiz e as instruções subordinadas encontradas na pesquisa; não há instruções subordinadas nos caminhos editados. O `src/components/standalone/AGENTS.md` foi consultado como contexto do scanner, sem editar essa pasta.

Memórias consultadas em `.lovable/memory/features/`:

- `conciliacao-bancaria.md`;
- `ads-invoices.md` e `standalone-invoices.md`;
- `invoice-groups.md`;
- `supplier-lifecycle.md`, `supplier-credits.md` e `supplier-iban-validation.md`.

Documentação consultada: D-ERP289 e D-ERP290 em `docs/DECISIONS.md`, `docs/procedimentos/PROC-entrada-de-dados.md`, a distinção do procedimento de conciliação Ticketline e os capítulos existentes de Bilheteiras, Rateios, Transitórias e BP/Cachê. Nenhum destes ficheiros foi alterado.

Confirmação no código:

- `src/pages/BankReconciliation.tsx` e `src/lib/bank-statement/{reconcile,rules,transfer-fees,parse-santander}.ts`;
- `src/components/bank/{BankLineLaunchModal,BankLineOffsetModal,BankLineDocumentsDialog}.tsx`, `src/lib/bank-link-date.ts` e os contratos/RPCs clientes de `src/lib/offset-plan/`;
- `src/pages/{Suppliers,AdsInvoices,StandaloneInvoiceScanner}.tsx`;
- `src/components/{SupplierFormModal,SupplierTransactions,SupplierCreditsPanel,SimilarSuppliersNotice,TransactionPaymentModal,InvoiceGroupAction}.tsx`;
- `src/components/supplier-credits/`, `src/components/ads/AdsInvoiceImportDialog.tsx` e `src/pages/contabilidade/AccountantStandaloneInvoicesTab.tsx`;
- `src/lib/{supplier-lifecycle,supplier-credits,validations,bank-account-value,invoice-group}.ts`;
- parser, origem por glob, `HelpTooltip`, teste existente de Bilheteiras e grupos de `src/lib/help-manual.ts`, apenas para conferir os contratos.

## C1 — capítulos e consumo real

`docs/manual/conciliacao-bancaria.md` contém nove secções: consulta/ações, importação, camadas automáticas, saldos e corte, conciliação manual, lançamento pela linha, regras/taxas, encontro de contas e documentos/ignoradas. Os ids têm prefixo `conciliacao.`.

`docs/manual/faturas-e-fornecedores.md` contém oito secções: consulta, criação/edição, ciclo de vida, entrada documental, grupos de fatura, créditos, avulsas e Faturas Ads. Os ids têm prefixo `fornecedores.`. Os campos BR são descritos apenas como campos por país da empresa, sem pormenorizar a #498.

Cada secção tem `id`, `tooltip`, `ecras`, `perfis`, `fontes` e `termos`. Os dois testes novos usam `parseHelpArticle` e `chunkArticle` de produção, conferem a unicidade dos slugs e de todos os anchors do corpus completo, posições, termos e reconstrução integral do corpo a partir dos chunks.

Os testes também importam `loadManualArticles` e `loadManualSyncPayload`: provam que o glob real inclui os capítulos e que a montagem local do payload conserva os chunks. Montar o payload não chama a edge nem sincroniza o manual. Não foi alterado o parser nem o carregador.

As tabelas de ações e de entrada documental tornam as escolhas explícitas; não foram necessários os dois SVG opcionais. Os testes percorrem os recursos Markdown para detetar referências sem destino.

## C2 — fontes e links

As fontes dos frontmatters e de todas as secções novas resolvem para ficheiros locais não vazios, usando caminhos `src/...`, `docs/...` ou nomes de memórias em `.lovable/memory/features/`. Referências D-ERP usam `docs/DECISIONS.md` como fonte existente, sem inventar um ficheiro por decisão.

O lexer Markdown percorre os links reais dos dois capítulos. Cada `/ajuda?artigo=…#anchor` é resolvido contra o slug e os anchors devolvidos pelo parser do corpus em disco, incluindo referências cruzadas entre os capítulos novos e ligações a Bilheteiras, Transitórias, BP/Cachê e Rateios. Esta prova é local e não atesta a disponibilidade na base ou pesquisa remotas.

## C3 — retirada dos dois grupos legados

`src/lib/help-manual.ts` passou de 17 para 15 grupos pela remoção integral de `suppliers` e `ticket-offices`. O diff desse ficheiro contém apenas essas duas remoções.

Foi calculado a partir da versão original no HEAD o SHA-256 de `JSON.stringify` dos grupos originais, excluindo apenas os dois autorizados: `88d13b8c0be79f20a21a41814195df28ff1bdcabc6fdaae7792e7d863d0131ad`. O teste de Faturas confere esse hash e a lista ordenada dos 15 ids, preservando títulos, tópicos, imagens e conteúdo de todos os grupos retidos sem depender de Git durante os testes.

## C4 — tooltips

| Local | Anchor | Reserva |
|---|---|---|
| `TicketOffices.tsx`, h1 da lista | `bilheteiras.consultar` | `helpTexts.ticketOffices` conservado |
| `BankReconciliation.tsx`, h1 | `conciliacao.consultar` | Texto fixo sobre conta e efeito da ação |
| `Suppliers.tsx`, h1 | `fornecedores.consultar` | `helpTexts.suppliers` conservado |
| `Suppliers.tsx`, Novo Fornecedor | `fornecedores.criar` | `helpTexts.newSupplier` conservado |
| `AdsInvoices.tsx`, h1 do detalhe da fatura | `fornecedores.faturas-ads` | Texto fixo sobre confirmar e gerar |

O h1 do detalhe Ads corresponde ao ponto da linha 465 citado no despacho. A ajuda já existente no h1 da lista Ads, `rateios.faturas-ads`, permanece. Os testes leem os quatro TSX, verificam os pontos pedidos e as reservas, e resolvem todas as âncoras usadas nesses ecrãs, incluindo a de Rateios, para uma única secção com tooltip no corpus.

Não foi feita verificação visual ou autenticada. Os testes não abrem serviços nem importam as páginas com clientes de dados: leem o seu código. O comportamento do componente `HelpTooltip` permanece o existente.

## Divergências confirmadas e limites da descrição

| Fonte ou indicação anterior | Código atual e tratamento no capítulo |
|---|---|
| Memória e subtítulo da conciliação dizem «só liga». | O motor automático só liga, mas a seleção manual admite `settle`, cria pagamentos e pede decisão em divergências de data; Lançar e Encontro têm efeitos próprios. O capítulo distingue as ações e a escolha de alinhar/manter a data. |
| Descrição antiga das camadas usa `paid_amount` e data do lote como requisito geral. | `reconciliationCash` usa pagamentos efetivos por conta, sem compensações/estornos e líquidos de retenção/crédito; o legado sem pagamentos só serve antes do primeiro `period_from`. O motor SEPA prefere a data, mas pode usar candidatos pelo valor. A passagem por descrição não impõe a janela de cinco dias. |
| A memória contém versões sucessivas do lançamento e reversão das taxas. | O cliente chama a operação de lançamento para criar/ligar; a ligação posterior da mãe ao BP pode falhar com as taxas já lançadas. O capítulo manda conferir e não repetir as taxas nesse caso. Não se alegou ter executado ou provado atomicidade no servidor. |
| Histórico financeiro anterior à implantação. | O texto separa `initial_balance_date` (fecho já implantado) do primeiro `bank_statements.period_from` (fronteira do legado), declara D-ERP289 e não apresenta contagens nem medições financeiras reais. |
| Anexar documento equivale a aparecer futuramente nas transações. | O diálogo só replica para as transações ligadas no momento do upload; o texto manda conferir depois de conciliar e não promete réplica posterior. |
| «Nada gravado» no passo de leitura Ads. | `doRead` carrega o PDF antes do `dry_run`; o capítulo distingue arquivo do ficheiro e gravação da proposta. Confirmar rateio, gerar, reabrir e reverter são ações distintas. |
| A memória de IBAN apresenta MOD-97 para qualquer valor bancário. | O formulário usa a classificação partilhada e não trata todos os formatos como IBAN. O texto limita a afirmação aos valores reconhecidos como IBAN e mantém a regra de campos por país. |
| A memória de créditos descreve o helper transacional de abate. | O modal individual grava pagamento, usos e atualização do crédito em chamadas separadas. O capítulo não promete atomicidade global e pede conferência antes de repetir após erro. |
| A memória antiga do scanner promete limpeza de objetos em falhas. | A captura atual preserva incerteza e bloqueia nova gravação enquanto falta conferir. O texto descreve o estado de revisão/conferência e não promete eliminação de ficheiros. |
| O filtro Ativos/Inativos/Todos aparece na memória. | O seletor existe, mas `statusFilter` não consta das dependências do `useMemo` da lista. O capítulo descreve as opções oferecidas, sem prometer atualização imediata ao mudar apenas esse filtro. Correção funcional fora deste despacho. |

Não foram feitas medições nem operações bancárias, fiscais ou de fornecedor. A leitura dos clientes e helpers prova o que o código pede e apresenta, não a instalação, os saldos, a disponibilidade ou os efeitos atuais de RPCs/edges em Live.

## C5 — validações locais

- Antes: `bunx vitest run`, exit 0, 375 ficheiros aprovados e 2 ignorados; 4.406 testes aprovados, 6 ignorados e 11 todo; duração 164,28 s.
- Antes: `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`, exit 0, sem diagnósticos.
- Focados: `bunx vitest run src/test/issue194-manual-conciliacao.test.ts src/test/issue194-manual-faturas.test.ts src/lib/__tests__/help-manual-bilheteiras.test.ts src/lib/__tests__/help-manual-parser.test.ts`, exit 0, 28/28 testes em quatro ficheiros; duração 1,20 s.
- Depois: `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`, exit 0, sem diagnósticos.
- Depois: `bunx vitest run`, exit 0, 377 ficheiros aprovados e 2 ignorados; 4.419 testes aprovados, 6 ignorados e 11 todo; duração 165,84 s. Os 13 testes novos explicam o aumento de 4.406 para 4.419; não houve falhas nem novos testes ignorados. Os testes existentes ficaram intactos.
- Build: `bunx vite build`, exit 0, concluído em 1 min 25 s, incluindo geração do service worker. Emitiu avisos de Browserslist, combinação de imports estáticos/dinâmicos, tamanho de chunks e minificação CSS (`Expected identifier but found "-3"`, declaração `-3: 0`). Não houve falha; não foram alterados CSS, dependências ou configuração para tratar estes avisos. Não foi executado build de base para comparar avisos.
- `git diff --check`: sem erros; conferência da lista fechada inclui ficheiros modificados e novos, com apenas os 11 caminhos autorizados da entrega, incluindo este dossier e `.executor/resumo.md`.

Não foram criados ou alterados campos de data nesta entrega; as edições nas páginas limitam-se às ligações de ajuda e à importação necessária em Conciliação.

## Fora desta entrega

Publish e **Administração → Sincronizar manual** continuam a cargo do Pedro em Live. Não foi afirmado que estes capítulos já estejam pesquisáveis ou que as novas âncoras existam na base. Os textos de reserva continuam disponíveis antes da sincronização.

Não foram alterados `.github/`, `supabase/`, `drizzle/`, `.lovable/`, ficheiros `.env`, parser, origem por glob, `HelpCenter`, `HelpTooltip`, `docs/INDEX.md`, capítulos existentes ou os restantes 15 grupos legados. Não foram acrescentadas dependências, testes ignorados ou alterações de configuração. CI remoto, Publish e sincronização não foram consultados nem executados.
