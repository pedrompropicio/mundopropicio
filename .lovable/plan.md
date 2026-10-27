# P5 — Posição Financeira: Saldo Geral e resultado MP por evento (R2, plano revisto v2)

HEAD de arranque: c70235d5150056cd723571f54816646fb6e4cbe3. Este passo não inclui código, DDL, DML nem deploy. O desenho geral mantém-se: edge function `financial-position` do lado do servidor, motor partilhado reutilizado, JWT do utilizador mais a RPC como gate, e nenhuma DDL.

Reserva: em modo plano só posso escrever este plano. A linha «P5 — R2 — agente Lovable» entra no docs/QUADRO.md › «Em execução agora» no primeiro passo depois do «Sim» e sai no fecho. O roadmap.md segue a mesma regra.

## 1. Ficheiros lidos
docs/INDEX.md; docs/QUADRO.md; docs/estado/estado-financeiro-e-tesouraria.md; docs/estado/estado-fecho-e-socios.md (l.14–16, linha final do sócio); .lovable/memory/features/financial-position-base.md; docs/testes/p4b-permissao-posicao-20261027.md; docs/testes/p6a-painel-posicao-20261027.md; docs/DECISIONS.md D-ERP320–322; supabase/manual/0283_p4b_financial_position_permission.sql (l.12, 67, 90, 140–182, 300–312); supabase/functions/partner-statement/index.ts; _shared/settlement/statement-service.ts (l.112, 167, 345, 392–425, 690–727); _shared/settlement/partner-disbursement.ts (l.240); event-settlement-engine.ts (l.352).
Mockup: é um documento do projeto Claude (`posicao-financeira-dashboard-mockup-2026-10-25`), usado só como ordem de grandeza (ver a secção 7).

## 2. Custos de estrutura (correção 1)

### Regra proposta (valida antes de implementar — Q27)
Despesa sem evento. Predicado: `t.company_id = p_company_id AND t.event_id IS NULL AND t.type = 'expense' AND t.reversed_at IS NULL`, sem filhas (exclui as mães de rateio), `NOT is_transitory`, `NOT exclude_from_result`, com o ano dado por `extract(year from coalesce(payment_date, due_date, created_at::date)) = p_year`.
Categorias excluídas:
- 10.3 Transferências Internas (37 linhas, 356.418,72)
- 10.5.01 IVA a Entregar (3 linhas, 67.333,77)
- ebitda_class `imposto_rendimento`: 10.5.03 IRC (3 linhas, 22.544,30)
- ebitda_class `financeiro` e 10.2.*: 10.2.02 Prestação de Empréstimo (1 linha, 2.967,18)

Medido em Live às 18:2x, MP, 2026, com /100.0 em todo o bruto, depois das exclusões: **282 linhas / 285.791,26 € brutos**. Em aberto (approved/pending): **10 linhas / 10.199,29 €**.

Categorias incluídas (bruto 2026):

| Código | Categoria | Bruto |
|---|---|---|
| 10.4.01 | Ordenados | 154.859,07 |
| 10.8.01 | Aluguer / Renda | 34.953,28 |
| 10.8.07 | Outros | 29.557,90 |
| — | sem categoria (45 linhas) | 15.398,82 (Q28) |
| 10.5.05 | Imposto do Selo | 8.786,64 |
| 10.7.02 | Jurídico | 7.921,20 |
| 10.4.02 | Segurança Social | 7.336,68 |
| 10.10.01 | Leasing de Viaturas | 5.116,46 |
| 10.4.06 | Deslocações da Equipa | 4.958,76 |
| 10.7.01 | Contabilidade | 3.330,78 |
| 3.1.05 | Agência criativa sem evento | 3.200,00 (Q29) |
| 10.11.01 | Passagens da Diretoria | 2.759,43 |
| 3.1.02 | Social media | 1.660,50 (Q29) |
| 3.2.01 | Digital | 529,00 (Q29) |
| 2.6.08 | Despesas Extras | 26,25 (Q29) |

Restantes 10.x com menos de 1.400 €: Agência MP, Imprensa MP, Mobiliário, Seguros, Software, Material, Taxas bancárias, Alimentação, Consumíveis, Portagens, Ofertas, Medicina, Combustíveis e IRS retenções (16,00).

Q25 = A: os 10.199,29 € em aberto entram nos passivos como «estrutura por pagar», porque a RPC não os inclui (o bloco `txo` exige evento).

## 3. Participantes e eventos com acerto (correção 3)
O motor lê `event_settlement_participants` (statement-service l.167), não `event_partners`.
Medido com `event_settlements s JOIN event_settlement_participants p ON p.settlement_id = s.id JOIN events e`, MP:
- **9 eventos** no total;
- **2 eventos** com uma data em 2026 (`event_dates.date`).
Na implementação, o conjunto do ano passa a ser `eventos_por_estagio` da RPC (raiz por `first_day`, l.67) cruzado com estes participantes. Os eventos sem participantes também correm o motor, com partes a 0. Carga: cerca de 2 eventos com sócios e menos de 25 raízes no ano, com 4 em paralelo e menos de 10 s.

## 4. Sócios: a receber e por liquidar (correção 2)
Fonte única: `buildPartnerStatement(bundle, supplier_id)`, chamado para cada participante com `mode = 'settles'`. A linha final já está definida em statement-service l.707–712 e documentada em estado-fecho-e-socios l.16: `transferBase = parte + financiamento a devolver − adiantado/receitas em poder do sócio`, e `transferTotal = transferBase + IVA 23%` só quando `transfer_with_vat` e `transferBase > 0`.
Regra de sinal, por evento e por sócio:
- `transferTotal > 0` passa a «sócio por liquidar» (a MP deve). Usa-se `transferTotal`, já com IVA, porque tudo é com IVA.
- `transferBase < 0` passa a «a receber de sócio», no valor de `|transferBase|`. Sem IVA, porque o código só aplica IVA quando a base é positiva.
- Igual a 0 não conta.

Abater acertos já pagos: hoje **não existe** uma fonte de pagamento de acerto em Live. Medi as transações transitórias por motivo: não há `distribuicao_resultado`, e `partner_payment_contracts` tem 0 contratos (o P3 está preparado mas vazio). `aporte_socio` (25 / 353.810,51), `emprestimo_socio` (3 / 26.216,66) e `partner_advance` (3 / 2.088,73) já vão para a linha de acerto da RPC, e o motor já desconta os adiantamentos. Proposta, sujeita a Q30:
- v1 abate os pagamentos de contrato (P3: `partner_payment_contracts` com transações `distribuicao_resultado` pagas) por sócio e por evento, que hoje valem 0;
- os eventos em que o acerto foi pago fora destas fontes ficam com o alerta «acerto possivelmente pago fora do sistema» se o estágio for `fechado`.

Cada linha leva a origem: `{event_id, supplier_id, transferBase, transferVat, transferTotal, pago_contratos, liquido, origem:"partner-statement"}`.

## 5. BP por lançar (correção 4) — prova
Ficheiro: supabase/manual/0283_p4b_financial_position_permission.sql (corpo idêntico ao da 0282).
- l.144: `greatest(bp.custo - coalesce(lt.pago,0), 0) AS a_pagar` por linha de BP.
- l.156–157: `lancado = least(aberto_tx, a_pagar)`, `saldo = a_pagar − lancado`.
- l.177: `bp_total = sum(lancado) + sum(saldo fora de partner_paid)`, que entra em `a_pagar.por_estagio[].bp_total`.
- l.308–310: `alertas.bp_sem_transacao.total = sum(a_pagar) WHERE n_tx = 0`, que é um subconjunto de `ls`, ou seja, das mesmas linhas já somadas em `bp_total`.

Conclusão: o BP sem transação **já está incluído** em `a_pagar.por_estagio[].bp_total` (o seu `saldo` entra no `sum` da l.177). Q23 = A: aparece como subcomponente informativo do a pagar e nunca é somado duas vezes. O passivo «BP por lançar» não é linha própria; o Saldo Geral mostra `a_pagar (dos quais BP sem transação X)`.

## 6. Desenho (inalterado, com ajustes)
Fluxo: JWT → RPC com o cliente do utilizador (gate e erros `not_authenticated` / `company_forbidden` / `financial_position_permission_denied` mapeados para 401/403) → raízes do ano → `loadStatementBundle` para cada uma, 4 em paralelo, com limite de 25 s → `buildPartnerStatement` para cada participante que liquida → estrutura (query da secção 2, feita com o cliente service-role só depois do gate) → montagem → `system_audit_log` (`entity_type 'financial_position'`) → JSON.
Histórico (Q22 = A): bundle com transações ignoradas, `so_bp = true`, fora do Saldo Geral.
Checks do motor falhados (Q24 = A): o evento entra com alerta.
ab_module / terceiros: `outros = 0` com nota (é uma limitação do statement-service).
Sub-eventos: só no master.
Sem cache (Q26 = A).

JSON p5-v1:
```text
meta{version:"p5-v1", base_version:"p4-v1", company_id, year, data_referencia, gerado_em,
     eventos_processados, eventos_com_erro[], saldos_visiveis}
eventos[]{event_id, nome, estagio, so_bp, resultado_evento, partes_socios[], partes_socios_total,
          creditos_mp{parte_casa, iva_devolvido, outros, total}, resultado_mp, checks_ok, alertas[]}
estrutura{bruto, linhas, por_categoria[{code, nome, ebitda_class, bruto, n}], por_pagar, por_pagar_n,
          excluidas[{code, motivo, bruto, n}]}
resultado_mp_ano{com_estrutura, sem_estrutura}
socios{linhas[{event_id, supplier_id, nome, transferBase, transferVat, transferTotal, pago_contratos,
       liquido, sentido:"a_receber"|"por_liquidar"}], a_receber_total, por_liquidar_total}
saldo_geral|null{
  ativos{caixa, cartoes, retido_visivel, retido_ocultas, a_receber, a_receber_socios, total},
  passivos{a_pagar{valor, dos_quais_bp_sem_transacao}, estrutura_por_pagar, socios_por_liquidar, total},
  posicao_hoje, notas[], informativo{transitorias, acerto[]}}
```
Cada valor vai como `{valor, origem}`.

## 7. Divergências esperadas face ao mockup de 25/10 (só referência)
- Sócios por liquidar (mockup: 674.361,30): só há 2 eventos de 2026 com participantes, e Maiara e Maraisa passou a Histórico, por isso espero um valor bastante menor com `p_year = 2026`. Com «Todos» aproxima-se mais.
- A receber de sócios (mockup: 135.980,17): depende do sinal de `transferBase`. O mockup pode ter somado bases sem IVA de forma diferente.
- Ativos (mockup: 1.200.421,14) e passivos (mockup: 1.654.492,32): a caixa subiu 23.406,00 desde 25/10, os eventos futuros passaram a contar só transações e entra a estrutura por pagar.

Não ajusto a lógica para bater nestes números.

## 8. Riscos, testes, verificação, rollback
- Vitest: zod fail-closed; regra de sinal (base −, base + com e sem `transfer_with_vat`); exclusões da estrutura por categoria; BP sem transação não somado duas vezes; evento sem participantes; cidade-filha; Histórico só BP; resultado negativo com `loss_pct`; sócio pt-BR bruto; erros de gate.
- Live, depois do deploy: para cada evento, o resultado MP e o `transferTotal` de cada sócio comparados com o partner-statement (diferença 0,00); a estrutura com a query da secção 2; o Saldo Geral, componente a componente, com a RPC.
- Rollback: apagar a função e reverter o commit. Não há estado persistente nem DDL.
- Deploy: só pelo 0 - Cowork, em janela, com o «Sim» do Pedro e CI verde.

## 9. Ficheiros
Criar: supabase/functions/financial-position/index.ts, supabase/functions/_shared/financial-position/assemble.ts, src/lib/financial-position-p5.ts, src/hooks/useFinancialPositionP5.ts, src/test/financial-position-p5.test.ts, docs/testes/p5-posicao-saldo-geral-20261027.md.
Alterar: QUADRO, estado financeiro, memória financial-position-base, D-ERP323, AGENTS.md.

## 10. Perguntas
27. Regra da estrutura (secção 2): A (recomendada) aprovada tal como está; B outras exclusões (diga quais, por exemplo 10.5.05 Imposto do Selo ou 10.5.04 IRS).
28. Sem categoria (45 linhas / 15.398,82): A (recomendada) entram na estrutura com o alerta «sem categoria»; B ficam fora.
29. Marketing e operacional sem evento (3.1.x, 3.2.x, 2.6.08 = 5.415,75): A (recomendada) entram na estrutura; B só as 10.x.
30. Acertos pagos aos sócios: A (recomendada) abater só os contratos P3 (hoje 0) e alertar nos fechados; B indicar outra fonte de pagamento de acerto que eu deva usar.
31. Ano da estrutura: A (recomendada) `coalesce(payment_date, due_date, created_at)`; B só `due_date`.
