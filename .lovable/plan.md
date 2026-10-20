# Desdobramentos do cachê com retenção na fonte (revê a D15)

## Documentação lida
docs/INDEX.md; docs/estado/estado-financeiro-e-tesouraria.md; docs/DECISIONS.md (DR-2026-09-03-D15, D-ERP145, D-ERP148, D-ERP265 e as adendas de 13 e 14/10); .lovable/memory/features/tax-withholding.md, transaction-installments.md, payment-amount-invariants.md, cache-deductions-bp-first.md, tour-cache-in-cost-card.md, payment-account-ownership.md e invariant-monitor.md.

## 1. Sítios onde se pagam cachês (mapa)
O único sítio que **cria** transações de cachê é `src/components/CacheTransactionModal.tsx`. É aberto a partir de `src/components/CacheSettlementPanel.tsx`, que serve três casos:
- fecho do cachê de um evento simples (lê e grava `event_cache_configs`);
- fecho por cidade da turnê (lê e grava `event_cache_city_settlements`, com o `cityEventId`);
- fecho da cidade a partir da configuração do Master (D-ERP265, `resolveCacheScope`).

Não encontrei outro sítio que insira transações de cachê no frontend nem nas edge functions. A procura por `CacheTransactionModal`, pela categoria 2.1.01 e por inserts com `cache_config_id` só deu o modal.
- O "Fechar cachê" (`finalizeMutation`) só congela o valor; não cria transações.
- `useSyncCacheForecasts` só escreve linhas de BP.

Na implementação volto a confirmar com uma procura por inserts em `transactions` com a categoria do cachê, incluindo `ImplBPTab` e as gerações a partir do BP. Se aparecer outro caminho, passa a usar a mesma chamada ao servidor.

Pagamento depois de criadas as transações: listas de pagamento e `BatchPaymentModal`/`TransactionPaymentModal`, que já exigem conta. Não mudam.

## 2. Onde o "pago do cachê" é somado hoje
- `CacheSettlementPanel` ("pago"): soma `paid_amount` das transações 2.1.01 do evento com `supplier_id` = artista. **Com retenção, a transação da AT ficaria de fora**, porque o fornecedor é outro.
- `useEventCacheImpact` (`paidCacheTransactionsTotal`): soma `amount` das 2.1.01 aprovadas ou pagas, sem filtrar fornecedor. A retenção entra no total, o que está certo.
- `cacheImpactOnTopOfCost` (`event-cost-basis.ts`, D-ERP145): é usado pelo card de Custos (`useEventFinancialCardData`), pelo Lucro (`useEventContractResult`) e pela lista de eventos (`events-list-financials`).
- Fecho e DRE (`computeEventSettlementTotals`): contam as transações pela categoria e pela linha de BP. A retenção entra uma única vez.
- `events-list-cache-impact.ts` e `ReportArtistCache` leem os acertos por cidade.
- Portal do Sócio (`get_partner_settlement_summary`): na implementação confirmo que soma por categoria e não por fornecedor.

## 3. Desenho

### Estrutura: reaproveitar `event_cache_payments` como "desdobramento"
A tabela já tem `cache_config_id`, `event_id`, `company_id`, `amount`, `transaction_id` e `withholding_transaction_id`. Tem 0 linhas, o que permite acrescentar campos sem backfill. Migração só aditiva:
- `event_cache_payments`: + `gross_amount numeric`, + `withholding_answered boolean NOT NULL DEFAULT false`, + `has_withholding boolean`, + `withholding_rate numeric`, + `withholding_due_date date`, + `created_by uuid`. As colunas antigas `amount` e `description` são preenchidas pela chamada ao servidor.
- `transactions`: + `cache_payment_id uuid NULL` (FK para `event_cache_payments`) e + `cache_payment_role text NULL`, com CHECK em ('advance','artist','withholding'). Índice único parcial em (`cache_payment_id`, `cache_payment_role`) para o artista e para a retenção. Os adiantamentos podem ser vários.
- A ligação faz-se só por estas duas colunas. Nunca por descrição, fornecedor ou nome.

### RPC `create_cache_payment_breakdown(...)` (SECURITY DEFINER, atómica)
Recebe: `cache_config_id`, `event_id` (a cidade, quando é turnê), bruto, beneficiário, resposta Sim/Não, taxa, vencimento do artista, vencimento da retenção, conta e método opcionais, e a lista dos adiantamentos.

Valida no servidor, dentro da mesma transação e com lock da configuração:
- papel admin/manager e empresa (`row_belongs_to_current_company`);
- resposta obrigatória;
- taxa entre 0 e 100;
- vencimento da retenção obrigatório quando a resposta é Sim;
- cada adiantamento é 2.1.01, do mesmo evento, da mesma empresa, ainda sem desdobramento, não está estornado e não é filha de rateio;
- o adiantamento conta pelo bruto pago (`paid_amount`);
- adiantamentos acima do líquido (com retenção) ou do bruto (sem retenção) → erro;
- soma dos brutos de todos os desdobramentos do cachê, incluindo o novo, acima do cachê efectivo → erro. Ver a nota sobre o valor efectivo a seguir.

Cria o desdobramento e as transações:
- a do saldo ao artista;
- com Sim, também a da retenção, com o fornecedor "MINISTERIO DAS FINANCAS - IRS" resolvido pelo `company_id` da sessão. Se não existir nessa empresa, dá erro.
- Todas com a mesma `forecast_id` (linha do módulo de cachê ou linha escolhida no cachê fixo), categoria 2.1.01 e IVA 0.
- `declared_withholding_*` e `withholding_amount` ficam sempre a 0.

Liga os adiantamentos escolhidos (`cache_payment_role='advance'`) e devolve os ids criados.

Permissões: REVOKE a anon e PUBLIC, GRANT a authenticated e service_role. Verificação em Live com `has_function_privilege`.

**Valor efectivo no servidor:** `getCacheEffectiveAmount` é uma função do frontend. A chamada recebe esse valor e confere-o com o que está na base. Se houver acerto da cidade (`event_cache_city_settlements`), `adjusted_amount` ou `real_amount`, é esse o tecto. Sem cachê congelado, o tecto é a linha de BP do módulo. Não há uma segunda fórmula.

### Ficheiros a alterar
- Migração nova pelo agente (colunas, índice e RPC).
- `CacheTransactionModal.tsx`: o fluxo passa a ser "Novo desdobramento". Tem a pergunta Sim/Não sem nada pré-marcado, a taxa pré-preenchida com `withholding_rate` (25 se não houver), o resumo (bruto, adiantamentos, retenção, líquido, saldo) e a data da retenção (sugere a do artista, mas é obrigatório confirmá-la). Grava com uma única chamada à RPC. "Dividir pagamento" passa a ser criar vários desdobramentos.
- `src/lib/cache-breakdown.ts` (novo, puro): contas em cêntimos e validações, partilhadas pela interface e pelos testes. O servidor repete-as.
- `CacheSettlementPanel.tsx`: o "pago" deixa de filtrar pelo fornecedor e passa a filtrar pela categoria e pela configuração. A soma passa para uma RPC/vista na base, `cache_paid_summary(config, event)`, que devolve adiantamentos, artista, retenção e total.
- Aba Cachê e `ReportArtistCache`: mostram a decomposição pelo papel.
- Testes: `src/lib/__tests__/cache-breakdown.test.ts` (casos pedidos) e `supabase/tests/cache_payment_breakdown.sql` (atomicidade, recusas e o invariante, com ROLLBACK).
- Invariante novo `cache_desdobramento_nao_soma` em `_run_invariant_checks_extra`: por desdobramento, adiantamentos + artista + retenção = bruto (±0,01). Referência 0.
- Documentação: `.lovable/memory/features/cache-payment-breakdown.md` (nota nova) e remissão em `tax-withholding.md`; nova decisão em `docs/DECISIONS.md` que revê a D15; atualizar o estado da frente.

## 4. Riscos de dupla contagem
- **Saldo da conta:** a transação do artista nunca leva `withholding_amount`. Se levasse, `computeAccountBalance` descontava a retenção duas vezes. A RPC grava sempre 0.
- **Card de Custos:** com o módulo no BP, o cachê não soma (D-ERP145). Sem módulo, `max(0, calculado − pago)` já inclui a retenção, porque não filtra o fornecedor. Fica coberto por um teste.
- **"Pago" no painel:** hoje filtra pelo fornecedor e deixaria a retenção de fora, o que mostraria o cachê por pagar. É corrigido no ponto 3.
- **Adiantamento:** conta uma vez, como transação própria. O saldo já vem com o adiantamento descontado. Não se cria transação nova para o adiantamento.
- **Linha de BP:** as três transações ligam à mesma linha. O realizado é igual ao bruto, que fica dentro da verba. A verba não sobe.
- **Rateio Master→cidade:** os adiantamentos de filhas de rateio são recusados, para o mesmo valor não contar no Master e na cidade.

## 5. Adiantamentos existentes num desdobramento criado depois
- O modal lista as transações 2.1.01 do evento (e da cidade) ainda sem `cache_payment_id`, de qualquer fornecedor. Aparecem marcadas como sugestão as que são do fornecedor do artista. O utilizador escolhe.
- Ao gravar, a RPC preenche nessas transações `cache_payment_id` e `cache_payment_role='advance'`. Só são escritas essas duas colunas; valor, estado e conta ficam intactos.
- Pagamentos antigos ficam como estão: nenhum backfill nem DML. Só passam a fazer parte de um desdobramento se o utilizador os escolher num desdobramento novo.

## Decisões para o Pedro (não implemento)
- Configuração futura da data da retenção (por exemplo, dia 20 do mês seguinte ao pagamento, definido por empresa). Recomendação: adiar, e a data continua manual.
- Desfazer um desdobramento: por agora, só por estorno das transações, sem apagar. Proposta para depois: uma RPC `cancel_cache_payment_breakdown` que desliga os adiantamentos e só funciona se nada estiver pago.

## Fora de âmbito
Backfill, Publish, alterações a `declared_withholding_*`, lógica de `transaction_payments` e regras das listas de pagamento.
