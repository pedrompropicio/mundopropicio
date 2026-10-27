# P5 — Saldo Geral e resultado MP por evento — provas (27/10/2026)

Classe R2, só código, testes e docs. Sem DDL, sem DML e sem Publish. HEAD de arranque: c70235d5150056cd723571f54816646fb6e4cbe3.

## Entregue
- `supabase/functions/financial-position/index.ts`: gate pela RPC com o JWT do utilizador; motor por evento (concorrência 4, limite 25 s); auditoria em system_audit_log (`entity_type financial_position`).
- `supabase/functions/_shared/financial-position/assemble.ts`: montagem pura (estrutura, sinal dos sócios, Saldo Geral, incompleto).
- `statement-service.ts`: `computeStatementEngine(bundle)` extraído de `buildPartnerStatement` sem mudar o cálculo. Os testes partner-statement continuam verdes (3/3).
- `src/lib/financial-position-p5.ts` (zod fail-closed) e `src/hooks/useFinancialPositionP5.ts`.
- `supabase/config.toml`: `[functions.financial-position] verify_jwt = true`, igual ao partner-statement, exigido pelo teste de guarda.

## Testes
- `src/test/financial-position-p5.test.ts`: 17/17. Cobre exclusões da estrutura, alertas, IVA 23 = ×1,23, sinal dos sócios (base −, total c/IVA, pt-BR sem IVA, contratos abatidos, alerta em fechados), evento sem participantes, loss negativo, Histórico só BP, cidade-filha (só a raiz), BP sem transação não somado 2×, saldo_geral null sem permissão, incompleto sem soma parcial, gate 401/403 e versão do schema.
- Suite completa: 2932 passaram. As 3 falhas iniciais eram 2 guardas que esta entrega acionou (verify_jwt e paginação, ambas corrigidas) e 1 timeout do teste newgang-crm-profile-fields, que existia antes e passa quando corrido sozinho.
- tsc (tsgo) limpo. `deno check` local rebentou no sandbox (panic do binário), por isso o tipo Deno não foi verificado aqui.

## Medido / origem
- Eventos raiz com event_settlement_participants: 9, todos de 2026 por events.date. Fonte: medição do Pedro em Live a 27/10. Na função, o conjunto vem de `eventos_por_estagio` da RPC.
- Estrutura em 2026: 282 linhas / 285.791,26 € brutos; em aberto 10 / 10.199,29 €. Predicado em D-ERP323. Medido pelo agente às 18:2x e validado pelo Pedro.
- Contratos P3 (partner_payment_contracts): 0 em Live, por isso o abatimento vale hoje 0.

## Mockup de 25/10 (só referência, não é alvo)
Ainda não medi nenhum número do mockup contra a função. Divergências a explicar na Verificação em Live: subida da caixa desde 25/10, eventos futuros só com transações (P4), estrutura por pagar nos passivos e a regra de sinal dos sócios.

## Por fazer antes de «pronto para Publish»
1. Verificação em Live com sessão: chamar `financial-position` (empresa MP, 2026). Para cada um dos 9 eventos, comparar `resultado_mp` com o house.residual do Encontro de Contas e o `transferTotal` de cada sócio com o partner-statement («ver como sócio»), esperando diferença 0,00. Medir `meta.duracao_ms`.
2. Reconciliar o Saldo Geral, componente a componente, com a RPC p4-v1.
3. CI remoto verde no SHA final (não observado por mim).

## Rollback
Apagar a função `financial-position` e reverter o commit. Não há estado persistente nem DDL. A extração de `computeStatementEngine` é neutra, porque o partner-statement usa o mesmo bloco.

## Correção em_curso — P5-corr R1 (27/10/2026, D-ERP324)

HEAD de arranque: `3246c31de4de6fc2b0c39b3338837b7c9da3660b`.

Prova fornecida pelo Pedro em Live (27/10, sessão admin, MP 2026, contrato anterior): Henry & Klauss – Madrid (`bf9ce2d8`, em_curso, data 22/11) tinha resultado_evento −388.579,45 €, partes_socios −272.005,61 €, resultado_mp −116.573,83 € e HENRY VARGAS transferBase −376.816,12 € indevidamente classificado nos recebíveis dos totais. Sem Madrid, a_receber_socios = 138.846,44 € (Ivete Clareou). Estes números são prova do Pedro, não nova medição do agente.

Predicado dos totais: `estagio === 'em_fecho' || estagio === 'fechado'`. Aplicado a resultado_mp_ano, socios.linhas/totais e componentes de sócios do Saldo Geral. `em_curso`/`planeamento`: evento preservado com fora_dos_totais=true e motivo_fora=em_curso_projecao; resumo e linhas de sócios em projecao_em_curso, com nota «projeção pelo BP; não é recebível nem custo incorrido». Histórico mantém so_bp e fica fora, sem linhas de sócios nem projeção. Alerta de acerto em fechado preservado. Estrutura, RPC e partner-statement intocados.

Contrato exclusivo `p5-v2`: Zod exige o novo bloco e motivo_fora, rejeita p5-v1 e sócios de projeção nos totais; chave do hook inclui a versão para não reutilizar dados p5-v1. Projeção falhada devolve totais informativos null; mantém-se o comportamento incompleto sem soma parcial do P5.

Provas locais:
- `bunx vitest run src/test/financial-position-p5.test.ts`: 23/23 PASS (6 casos novos, com em_fecho/fechado parametrizados).
- Fixture equivalente Madrid/Ivete: socios.a_receber_total=138846.44; projecao_em_curso.socios_a_receber_total=376816.12; projeção resultado_mp_total=−116573.83; resultado anual da fixture=100; Saldo Geral idêntico ao cenário só com Ivete. O 100 é sintético, não o resultado anual de Live.
- `bunx vitest run --maxWorkers=2`: 299 ficheiros PASS, 2951 testes PASS, 6 skipped, 11 todo. Primeira execução com concorrência padrão: timeout preexistente no beforeAll PGlite de newgang-crm-profile-fields; repetição integral verde sem alterar o teste.
- Validação automática da plataforma: build OK após alterações; não executado tsc manual (regra da plataforma). CI do SHA final e verificação autenticada Live ainda exigem confirmação.

Sem DDL, DML, migração, alteração da RPC/partner-statement nem Publish. A alteração do módulo partilhado de financial-position desencadeia deploy automático no commit pela Lovable; não foi invocado deploy manual e não significa Publish da aplicação. Verificação Live pendente: confirmar meta.version=p5-v2, Madrid só em projecao_em_curso, recebíveis sem Madrid e Saldo Geral, com sessão admin. Não foi chamada a função pelo agente nesta correção (a chamada existente escreve auditoria).

Rollback: reverter conjuntamente assembler, schema e hook para p5-v1 pelo fluxo de commits gerido; sem rollback de dados. Estado: pronto para Verificação em Live, não pronto para Publish; CI final por confirmar.
