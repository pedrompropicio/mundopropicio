# Parcelas: original por transação · #471 / #457 · 02/11/2026 · MP Gestão Eventos — Mundo Propício

O original informado é repartido uma única vez na criação Modelo A; alterações monetárias estrangeiras nos dois editores continuam bloqueadas nesta R1.

## Base e reserva

Base autorizada e HEAD local: `bd3227bb9cd31e7131cd4db3b72fb7ab728a7deb`, inicialmente sem alterações. HEAD revalidado durante a execução, sem mudança. CI quality `41389230553 completed/SUCCESS`, autorização da reserva recortada do formulário (#413, comentário 6569399762), aceite #298/6567176261 e estado Lovable são contexto fornecido no despacho, sem consulta remota. Não foi enviado trabalho ao Lovable nem efetuada escrita GitHub. Revisão e merge manuais pelo 0.

Lidos INDEX, QUADRO (execução/reservas), AGENTS raiz e pesquisa dos subordinados (não há subordinado aplicável nestes caminhos de componentes/lib), estados financeiro/plataforma, D-ERP345–351, PROC-promocao, catálogo/regras de relatórios, memórias `transaction-installments`, `transactions-bp-linkage`, `payment-amount-invariants`, plano `contrato-monetario-multiempresa`, direção `plataforma-saas-2027` e relatórios BR1/BR1b (#462/#465). A memória de parcelas ainda descreve Modelo B e afirma suporte estrangeiro na renegociação; não é prova do contrato instalado. Prevalecem código atual, despacho e decisão #298: Modelo A mantido, aposentadoria não refeita.

## Regra implementada

`src/lib/installment-original.ts` é consumido pela mutation de criação e pelo preflight do formulário, antes do diálogo que permite elevar a verba. O helper recebe o original informado, nunca o reconstrói por EUR/FX e nunca o trata como bruto com IVA.

- Original: inteiro de cêntimos obtido do texto decimal, com BigInt; exige presença, valor não negativo e no máximo duas casas, inclusive rejeitando escala extra composta por zeros. O contrato atual cobre EUR/BRL/USD/GBP; EUR mantém os opcionais nulos.
- Pesos: bases EUR já devolvidas pelo `computeInstallmentNets`, com quatro casas, não negativas, finitas e em limite inteiro seguro. Nenhuma alteração nesse helper, no IVA ou na regra D7 EUR.
- Quotas: divisão inteira proporcional; cêntimos restantes atribuídos aos maiores restos, empate pela ordem do plano. Multiplicações usam BigInt, sem arredondamento intermediário de quotas. São verificados limites de soma e a possibilidade de representar os cêntimos no payload numérico.
- Zero explícito produz zeros, incluindo pesos todos zero. Original positivo com pesos todos zero é recusado; uma parcela conserva o original. A UI de criação continua a exigir pelo menos duas parcelas com bruto positivo pelo validador existente: o contrato zero/uma parcela do helper não amplia a UI.
- Ausência, escala extra, NaN/Infinity, pesos inválidos, moeda desconhecida, FX ausente/não positivo/não finito ou incompatível com o parser do payload interrompem antes do primeiro INSERT. A validação também antecede a oferta de elevação de verba.

Exemplos: `100.02`, pesos `[1,1,1]` → `[33.34,33.34,33.34]`; `100.01` → `[33.34,33.34,33.33]`; `100.01`, pesos `[1,2,3]` → `[16.67,33.34,50.00]`; `0.01` em quatro pesos iguais → `[0.01,0,0,0]`.

## Payload antes → depois

Para original BRL `100.01`, FX `0.17/manual`, base EUR `100.02`, plano EUR `[33.34,33.34,33.34]` sem IVA:

- Antes: primeira TX e irmãs tinham `original_amount: 100.01` cada, soma `300.03`.
- Depois: os INSERTs reais recebem `33.34 / 33.34 / 33.33`, soma `100.01`; todos conservam `currency: BRL`, `fx_rate: 0.17`, `fx_rate_source: manual`. `amount`, IVA, metadados e vínculo estrutural seguem o fluxo existente.
- EUR: `original_amount`, `fx_rate`, `fx_rate_source` continuam nulos. O fixture com IVA 23 e brutos `8374.94 / 8374.93` conserva bases `6808.8943 / 6808.8857`; o helper EUR não faz validação de FX nem introduz conversão.

Parcelamento combinado com desdobramento multi-IVA ou de terceiros é recusado explicitamente antes de iniciar o loop de criação; o rateio entre eventos e fluxos incompatíveis permanecem recusados. Não se alteraram os escritores desses desdobramentos. Não se alteraram TransactionEditModal, herança/exclusão/selo #413/#404, país, TaxEngine, DRE, fecho, saldos, snapshots, exports ou #467/#468.

## Edição e renegociação

O leitor local real é `useInstallmentGroup`, dentro de `TransactionInstallmentGroupEditor.tsx`. Acrescenta apenas `currency` à projeção e ao tipo; conserva os filtros estruturais, paginação e isolamento existente via cliente/RLS, sem query genérica nem alargamento de tenant.

A mutation do editor valida todas as linhas antes da primeira escrita: permissão, valores, pagas travadas e tentativa monetária. Se algum membro não é explicitamente EUR, a mudança monetária é recusada com feedback; moeda ausente/legada não é presumida EUR. Uma data estrangeira isolada envia exclusivamente `{ due_date }`, preservando a base de quatro casas, original e FX. O teste executa esse payload, inclusive num caso que antes poderia arredondar `amount` ao gravar só a data. Datas pagas conservam a trava; desbloqueio autorizado continua no caminho EUR. O comportamento de arredondamento das alterações EUR é preservado.

A renegociação recusa moeda diferente de EUR ou desconhecida na própria mutation, mostra a limitação e desativa a confirmação. EUR conserva a chamada única a `renegotiate_transaction_installments` com JSON `{ amount, due_date }`; não se enviam campos ignorados e não se substitui a RPC por loop cliente. Não há prova de capacidade multimoeda atómica do servidor nesta entrega.

## Provas locais

Os testes executam os configs das mutations e o preflight extraídos do código de produção e compilados por TypeScript, com estado sintético e Supabase mockado. Não copiam o construtor dos payloads nem criam um writer alternativo. A trava de paga usa as funções reais extraídas do editor. O helper puro também é importado diretamente.

Cobertura: 100.02/3, 100.01/3, pesos desiguais, mais parcelas que cêntimos, zero/presença, ausência, escala extra, uma parcela, NaN/Infinity, pesos negativos/nulos/inseguros, escala EUR inválida, FX inválido no fluxo real, payload primeira/irmãs, opcionais EUR, IVA/bases quatro casas, recusa antes de qualquer escrita e antes da elevação de verba, edição/renegociação estrangeiras sem write, RPC EUR, data isolada, permissões, pagas travadas/desbloqueio autorizado e falha numa irmã sem sucesso integral.

Antes: `bunx vitest run`, iniciado antes das edições, terminou em 316,13 s: 334 ficheiros passaram, 2 falharam e 2 ficaram skipped; 3290 testes passaram, 1 falhou, 13 skipped e 11 todo. As falhas foram timeouts existentes em `reimbursement-payment-exclude-0286.test.ts` (hook de 10 s) e `issue359-consent-guard-c.test.ts` (teste de 5 s). Esta execução sobrepôs-se a outras verificações; não foi alterado qualquer timeout, skip ou teste dessas frentes. A verificação final corre sem sobreposição com o build.

O recorte novo passou: 2 ficheiros, 75 testes, sem skips novos. Uma execução intermédia ainda com módulos em alteração acusou a regressão do decimal `90071992547409.91`: a verificação anterior por multiplicação não o recusava. A implementação final verifica os bytes decimais serializados, e esse teste passa na corrida estável.

Verificação final sem alterações de código/testes durante a corrida e sem sobreposição com build:

- `bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit`: exit 0, sem erros.
- `bunx vitest run`: exit 0; 338 ficheiros passaram, 2 skipped; 3373 testes passaram, 6 skipped preexistentes e 11 todo preexistentes; total 3390, duração 184,15 s. Os 7 skips adicionais da primeira corrida pertenciam à suite cujo beforeAll falhou; não se introduziu nem removeu skip de código.
- `bun run build`: exit 0 na repetição final; Vite em 53,88 s e PWA gerado, com avisos de Browserslist desatualizado e tamanho de chunks; sem alteração de dependências, limites ou flags.
- `git diff --check`: sem erros. HEAD mantido na base autorizada; nenhum caminho proibido alterado.

## Limites e menor pacote R2

A criação Modelo A continua a fazer INSERT da primeira TX, marcação do grupo e INSERTs das irmãs em chamadas separadas. Não existe garantia de rollback entre elas. Erro interrompe, não chama sucesso e mostra risco de criação parcial; ausência de ID confirmado também é erro. O editor de grupo continua com updates sequenciais e pode ficar parcial por erro de transporte/concorrência. Guardas locais impedem entradas inválidas conhecidas, mas não substituem guardas servidor nem protegem callers antigos, clientes desatualizados ou escritas diretas. Não foi feito backfill nem inferido catálogo real.

Próximo R2 mínimo, a preparar e autorizar separadamente:

- Inspecionar o contrato instalado e permissões da RPC existente em ambiente autorizado, sob ator/tenant reais de teste, antes de desenhar a migração; as memórias não certificam a instalação.
- Colocar guardas servidor para alterações monetárias estrangeiras e legados sem origem qualificada, cobrindo os escritores antigos. Não somar originais historicamente duplicados nem reconstruir total por EUR/FX para qualificar um grupo.
- Habilitar renegociação estrangeira apenas quando uma operação atómica puder validar original informado/armazenado qualificado, moeda, FX/fonte, escala e limites; repartir por bases confirmadas com a mesma regra e gravar original/irmãs/auditoria numa transação. Manter o contrato EUR, permissões, travas de pagas, fecho, tenant e vínculo BP.
- Para edição de grupos, criar uma operação servidor atómica com bloqueio e revalidação de todos os membros e metadados antes de alterar bases/originais. Manter mudanças de data independentes. Qualificação e reparação de legados exigem origem documental/decisão própria, sem backfill automático.
- Fechar a pendência de atomicidade da criação na operação servidor, incluindo metadados, vínculo e auditoria necessários; testar rollback por falha em cada etapa, concorrência e isolamento por empresa. Só depois retirar as guardas clientes mediante contraprovas equivalentes.

Nenhum SQL de produto foi preparado ou aplicado, nem houve ligação a base MP local/remota, serviços MP, credenciais, dados reais, Live, homolog, deploy/Publish, envio, commit ou push. A suite existente inclui testes inertes com PGlite em memória, executados como parte do vitest obrigatório. Não se afirma que parcelas BR estão totalmente prontas. #457 permanece aberta; seis gates e rollout não autorizados; CI do diff, revisão/merge e promoção continuam externos a esta execução.

Origem dos números: fixtures sintéticos dos testes e payloads mockados do código local; sem consulta financeira. Emissão: executor E2b da #471, frente Financeiro e Tesouraria, 02/11/2026.
