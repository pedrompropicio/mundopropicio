# #468 — transporte multimoeda BP → TX em lote (R1)

Base efetiva inicial: `51a72a32179b1a043044cbce36584ee245acdcd3`, igual à base do despacho; árvore inicial limpa. O executor não mudou ramo, não fez commit/push nem consultou serviços externos. O despacho fornecido é a evidência da fila após #467; a fila remota não foi consultada. Os caminhos da #467 e os documentos de visão/contrato foram preservados.

Leitura prévia: INDEX, QUADRO (execução), AGENTS raiz (não há AGENTS subordinado aplicável em src/components ou src/lib), estados financeiro/plataforma, D-ERP345–351, PROC-promocao, memória `transactions-bp-linkage.md` e relatório BR1b. A memória afirma que `transactions.forecast_id` não existe; o INSERT atual já o usa. Nenhuma conclusão de catálogo instalado foi retirada dessa memória.

## Antes e depois

Antes, a mutation real `bulkCreateTxMutation` enviava `amount: Number(f.amount)`, IVA, FK e demais campos, mas não os quatro metadados. Exemplo sintético: BP BRL original 100,01, amount EUR 17 e taxa 0,17 produzia payload sem moeda/original/FX/fonte. Depois envia `currency: 'BRL', original_amount: 100.01, fx_rate: 0.17, fx_rate_source: 'manual'`, mantendo EUR 17. Original 100,02 continua 100,02; zero explícito continua zero. Não há divisão por taxa, arredondamento, fixing ou alteração de tributos.

| Campo | Origem / regra mantida |
|---|---|
| currency | `f.currency`; códigos suportados do helper existente currency.ts; só ausência null/undefined sem qualquer metadado admite EUR legado |
| original_amount | `f.original_amount`, transportado sem conversão nem arredondamento; obrigatório não EUR; zero válido |
| fx_rate | `f.fx_rate`, transportado sem normalização; obrigatório não EUR, finito e positivo como na validação existente ForecastEditModal; nenhum teto/escala nova |
| fx_rate_source | `f.fx_rate_source`, opcional/nullable no writer existente; não se inventa manual/suggested nem se exige fonte ausente |
| amount / iva_rate | Mesmas conversões Number existentes; amount inválido/não finito agora impede o lote antes da escrita; IVA não é recalculado |
| forecast_id / vínculo legado | `f.id` no INSERT; update de `event_forecasts.transaction_id` após auditoria/anexos, com mustWrite/expectRows existentes |
| event_id / date / due_date | eventId e eventDate do componente, exatamente como antes |
| type / descrição / especificação / categoria | Mesma linha selecionada, mesmos fallbacks existentes |
| status / ordering_partner_id | approved se BP aprovado, pending caso contrário; ordenador apenas para expense, mesma regra |
| empresa / permissões | Nenhuma company_id nova no payload; mantém contexto/RLS existente, seleção explícita, aprovação e verificações de duplicados do componente |
| auditoria / anexos | Mantém Criação/status e extração HTTP(S) em ref://, nomes, autor e flags existentes |

A query paginada `event_forecasts` seleciona `*, account_categories(...)`, pelo que os quatro campos seguem integralmente para forecastsRaw e para a seleção existente; não foi necessário regenerar tipos/schema. O helper puro é chamado realmente pela mutation em `forecastItems.map(...)`, antes do primeiro INSERT. Moedas desconhecidas, vazias ou malformadas não caem em EUR. Ausência de currency acompanhada de metadados também é recusada. EUR explícito conserva metadados fornecidos válidos; EUR/legado sem metadados envia EUR e os opcionais null. A convenção foi confirmada em `src/lib/currency.ts` (amount sempre EUR) e nos writers existentes ForecastEditModal/TransactionFormModal (EUR com opcionais null).

## Falhas e compatibilidade

Validação falha com ID, descrição e nome do campo da linha; nenhuma escrita começa nesse caso, mesmo que uma linha válida venha antes. As gravações continuam sequenciais, sem retries ou rollback novo. Falha de TX, auditoria, anexo ou vínculo lança erro, mostra toast destrutivo e impede o callback de sucesso integral. A mensagem distingue INSERTs com ID confirmado de linhas totalmente concluídas e pede verificação antes de repetir; as queries de TX/BP são invalidadas para reler dados de prevenção de duplicados. Ausência de ID no retorno também falha. Um erro de transporte não prova ausência de commit no servidor: a contagem é só de criações confirmadas ao cliente.

Nenhum novo campo de data foi criado/alterado. Comparador de versões, parcelas, formulário manual, snapshots, SQL, FK de cadastro, engine de fecho, #413/#404 e histórico ficaram fora do diff funcional.

## Provas locais

O teste `src/lib/__tests__/issue468-bp-tx-currency.test.ts` extrai e transpila a configuração real da mutation do componente, executando mutationFn/onSuccess/onError com Supabase thenable mockado. Não replica o payload num writer fictício e não importa o cliente real. O teste também extrai/executa a queryFn paginada real e encaminha os resultados ao INSERT mockado. Não monta todos os painéis do BP; os guards de seleção têm asserções estruturais de ligação ao componente. O merge de forecastsRaw no componente conserva os objetos (`[...forecastsRaw, ...masterOverheadSlice]`).

35 testes focados passaram (sem skips). Casos: BRL 100,01/100,02, string decimal sem perda, zero, USD/GBP/EUR e legado, fonte null, inválidos/ausentes/não finitos, taxa zero/negativa, moeda desconhecida e lote misto sem qualquer chamada a from. Sucesso com uma linha aprovada e um anexo válido: 5 chamadas from, 1 INSERT TX, 2 INSERTs de auditoria, 1 INSERT de documentos, 1 UPDATE BP. Payload completo (EUR/IVA/FK/evento/datas/status/ordenador) e documentos comparados literalmente. Receita pending sem anexo e com vínculo prévio: 2 chamadas (TX + auditoria), sem novo backlink. Falha na segunda TX: 2 tentativas TX, 1 linha concluída; falhas nos passos posteriores da primeira: 1 TX confirmada e 0 linhas concluídas. Cada erro mostra um único toast destrutivo; não há toast de sucesso.

| Verificação | Resultado |
|---|---|
| Antes — `bunx vitest run` | Exit 0; 333 ficheiros passados / 2 skipped; 3.242 testes passados / 6 skipped / 11 todo (3.259); 273,57 s |
| Focados — `bunx vitest run src/lib/__tests__/issue468-bp-tx-currency.test.ts` | Exit 0; 35/35, sem skips; 3,51 s |
| Tipos — `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit` | Exit 0, sem diagnósticos, após o último ajuste funcional |
| Depois concorrente com build — `bunx vitest run` | Exit 1; 333 ficheiros passados, 1 falhou, 2 skipped; 3.276 testes passados, 1 falhou, 6 skipped, 11 todo; 219,09 s. Timeout de 5 s no teste existente issue359-consent-guard-c.test.ts:35, também documentado no BR1b |
| Depois sem build concorrente — `bunx vitest run` | Exit 0; 334 ficheiros passados / 2 skipped; 3.277 testes passados / 6 skipped / 11 todo (3.294); 184,79 s |
| Build final — `bun run build` | Exit 0; 9.143 módulos; 2m10s; PWA gerada. Avisos existentes de Browserslist antigo, import estático/dinâmico e chunks grandes; limites/configuração inalterados |
| Revisão local | `git diff --check` limpo; HEAD final `51a72a32179b1a043044cbce36584ee245acdcd3` igual à base inicial (sem avanço a reconciliar); apenas caminhos autorizados |

Delta final: +1 ficheiro e +35 testes passados, skips/todos inalterados. O timeout concorrente da #359 passou na repetição completa sem alterar o teste ou o limite; fica registado como instabilidade observada, sem atribuir causalidade definitiva ao build. Nenhuma regressão própria ficou aberta.

A corrida anterior começou antes das alterações e não incluiu o novo ficheiro de testes. Os testes existentes e seus skips/todos não foram alterados. A suíte completa inclui os seus testes locais inertes preexistentes (alguns usam PGlite); não certifica nem acede a serviços MP. Não foi criado ambiente de negócio ou base de homologação. Logs locais: `/tmp/issue468-before.log`, `issue468-focused.log`, `issue468-after.log`, `issue468-after-concurrent.log`, `issue468-tsgo.log`, `issue468-build.log`.

## Limites e próximo passo manual

Mock de payload não prova persistência, instalação, atomicidade nem comportamento de triggers/RLS. Catálogo e readback reais dependem de revisão/autorização separada, sem os executar neste R1. Erros parciais podem deixar TX sem auditoria/anexo/backlink; o vínculo canónico já enviado não foi redesenhado. Sem garantia de recuperação automática nem de concorrência entre clientes.

Continuam pendentes manual/parcelas/edição/renegociação, pagamentos, restore, snapshots/comparação (#467), exports e comprovação dos seis gates. Não foi iniciado adapter país/TaxEngine, não foi declarado BR operacional e a mãe #457 não foi fechada. Revisão pelo 0 ChatGPT, CI do diff e merge manual permanecem externos a esta cópia local.
