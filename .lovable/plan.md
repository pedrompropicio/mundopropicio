# Desdobramentos do cachê com retenção na fonte (revê a D15) — plano revisto

## Documentação lida
docs/INDEX.md; docs/estado/estado-financeiro-e-tesouraria.md; docs/DECISIONS.md (DR-2026-09-03-D15, D-ERP145, D-ERP148, D-ERP265 e as adendas de 13 e 14/10); .lovable/memory/features/tax-withholding.md, transaction-installments.md, payment-amount-invariants.md, cache-deductions-bp-first.md, tour-cache-in-cost-card.md, payment-account-ownership.md e invariant-monitor.md.

## 0. O que confirmei no código (factos de Live)
- `resolveCacheScope` (src/lib/cache-scope.ts):
  - `master` = subevento cujo Master tem configuração;
  - `children` = Master com configurações nos subeventos;
  - `own` = evento simples, ou Master com configuração própria. É o caso das 3 turnês em Live.
- `CacheSettlementPanel` passa ao modal `effectiveEventId = cityEventId ?? eventId`.
  - Aberto a partir do "Fecho por Cidade" (`CityCacheSettlementsPanel`), o modal recebe a cidade e encontra a linha `cache_module` dela.
  - Aberto a partir do painel do Master (`EventCacheConfig` l.1201), recebe o Master. Aí `ensureCacheModuleForecast` procura por (event_id, cache_config_id), não encontra a linha e **insere uma linha `cache_module` no Master**. Isso conta o cachê a dobrar face às linhas das cidades. **Bug confirmado.**

## 1. Sítios onde se pagam cachês
- O único sítio que cria transações é `CacheTransactionModal.tsx`, aberto por `CacheSettlementPanel.tsx`. Este painel serve:
  - o evento simples;
  - o Master de turnê (painel principal);
  - cada cidade dentro de `CityCacheSettlementsPanel`;
  - o cenário `master`/`children` de D-ERP265.
- "Fechar cachê" só congela o valor; não cria transações.
- `useSyncCacheForecasts` só escreve linhas de BP.
- Na implementação confirmo de novo que nada mais insere transações 2.1.01 (`ImplBPTab`, geração a partir do BP). O que aparecer passa a usar a mesma chamada ao servidor.
- O pagamento continua pelos fluxos normais (listas, `BatchPaymentModal`, `TransactionPaymentModal`), sempre com conta obrigatória.

## 2. Onde o "pago do cachê" é somado hoje
- `CacheSettlementPanel` ("pago"): soma `paid_amount` das 2.1.01 do evento **filtradas pelo fornecedor do artista**. A retenção, que tem a AT como fornecedor, ficaria de fora. Tem de mudar.
- `useEventCacheImpact` (`paidCacheTransactionsTotal`): soma `amount` das 2.1.01 aprovadas ou pagas, sem filtro de fornecedor. Já soma o Master e as cidades. Está certo.
- `cacheImpactOnTopOfCost`: card de Custos, Lucro e lista de eventos (D-ERP145).
- Fecho, DRE e Portal do Sócio: somam por categoria e linha. A retenção entra uma vez. No Portal confirmo `get_partner_settlement_summary` na implementação.
- `events-list-cache-impact.ts` e `ReportArtistCache`: leem os acertos por cidade.

## 3. Onde vive o desdobramento numa turnê

### Opções
| | A. Desdobramento no Master, transações directas por cidade (proposta) | B. Transação-mãe no Master com rateio às cidades |
|---|---|---|
| BP | cada transação liga à linha `cache_module` da sua cidade, que já existe | a mãe precisaria de uma linha no Master, que não existe e não pode existir (dupla contagem) |
| Pagamento e conta | cada transação é paga por si; segue o padrão dos pagamentos que já existem | só a mãe tem conta; as filhas são analíticas (payment-account-ownership) |
| Fecho por cidade | certo de imediato | depende do rateio estar bem propagado |
| D-ERP148 (1/N do Master nas deduções) | não é afectado: o cachê não é rubrica de dedução | o rateio do Master por 1/N iria contra a quota proporcional |
| Adiantamentos existentes | já estão nas cidades, sem mãe: encaixam | teriam de ser convertidos em filhas: é DML, proibido |

**Proposta: A.** O desdobramento (bruto, Sim/Não, taxa) define-se sobre o cachê **total** do Master. A chamada ao servidor reparte-o pelas cidades e cria as transações directamente em cada cidade. Não há transação no Master.

Evento simples: uma só "cidade", que é o próprio evento. O comportamento fica igual ao de hoje.

### Repartição por cidade
- Quota de cada cidade = bruto × peso da cidade.
- Peso = cachê efectivo da cidade ÷ total das cidades. É a mesma fonte das linhas `cache_module` e do `computeTourCityCacheAmount`: acerto da cidade > configuração > valor calculado.
- O cliente envia o peso de cada cidade. O servidor confere-o com as linhas `cache_module` vivas das cidades, com tolerância de 0,01 €. Não há segunda fórmula.
- Retenção da cidade = quota × r, na mesma proporção.
- Arredondamento ao cêntimo (meio para cima) em todas as cidades menos uma. A diferença vai para a **cidade com maior quota**; em empate, a primeira por data e depois por id. Assim, a soma das quotas dá o bruto ao cêntimo, e a soma das retenções dá bruto × r ao cêntimo.
- O utilizador vê a tabela por cidade antes de gravar.

### Adiantamento numa cidade acima do líquido da quota (total OK)
**Proposta: bloquear**, com mensagem que diz a cidade e o excesso.
- Realocar um adiantamento para outra cidade obrigaria a mudar o `event_id` de uma transação já lançada, ou a criar compensações. Isso mexe no fecho dessa cidade e é DML implícito sobre dados existentes.
- Saída prevista: o utilizador ajusta o bruto do desdobramento, ou associa o adiantamento a outro desdobramento.
- A realocação fica como decisão do Pedro, se for precisa.

### Tectos
- Soma dos brutos de todos os desdobramentos ≤ cachê efectivo total do Master.
- Soma das quotas de cada cidade em todos os desdobramentos ≤ cachê efectivo dessa cidade.
- Ambos verificados no servidor, com lock da configuração.

## 4. Estrutura e RPC

### Base (migração aditiva, sem backfill)
- `event_cache_payments` passa a ser o **desdobramento**. Tem 0 linhas. Fica com `event_id` = evento da configuração (o Master na turnê). Colunas novas:
  - `gross_amount`;
  - `withholding_answered` (NOT NULL DEFAULT false);
  - `has_withholding`;
  - `withholding_rate`;
  - `withholding_due_date`;
  - `created_by`.
- Tabela nova `event_cache_payment_cities`:
  - colunas: id, cache_payment_id, event_id (cidade), company_id, weight, gross_quota, withholding_quota, advances_total, artist_balance;
  - UNIQUE (cache_payment_id, event_id);
  - GRANT SELECT a authenticated e ALL a service_role; RLS por empresa; escrita só pela RPC.
- `transactions`: + `cache_payment_id` (FK), + `cache_payment_city_id` (FK) e + `cache_payment_role`, com CHECK em ('advance','artist','withholding').
  - Índice único parcial em (cache_payment_city_id, role) para o artista e para a retenção.
  - A ligação é sempre estrutural. Nunca por descrição, fornecedor ou nome.

### RPC `create_cache_payment_breakdown` (SECURITY DEFINER, atómica)
Faz tudo numa única operação: se falhar, nada fica gravado.
- **Entrada:** configuração; bruto; beneficiário; resposta Sim/Não; taxa; vencimento do artista; vencimento da retenção (obrigatório com Sim); lista de cidades com o peso; lista dos adiantamentos.
- **Validações:**
  - papel admin/manager e empresa (`row_belongs_to_current_company`);
  - resposta dada;
  - taxa entre 0 e 100;
  - pesos conferidos com as linhas da base, como em 3;
  - adiantamentos: 2.1.01, de uma cidade do desdobramento, da mesma empresa, sem `cache_payment_id`, não estornados, não filhas de rateio;
  - os adiantamentos contam pelo **`amount`** (IVA 0), não pelo `paid_amount`: um adiantamento aprovado e ainda por pagar tem `paid_amount` 0;
  - adiantamentos da cidade acima do líquido da cidade (ou do bruto da cidade, sem retenção) → erro;
  - tectos da secção 3.
- **Criação por cidade:**
  - a transação do saldo ao artista;
  - com Sim, a da retenção, com o fornecedor "MINISTERIO DAS FINANCAS - IRS" resolvido pelo `company_id` da sessão; se não existir, dá erro;
  - ambas com `forecast_id` = linha `cache_module` **da própria cidade** (no cachê fixo, a linha escolhida para essa cidade), rubrica 2.1.01, IVA 0 e `declared_withholding_*` a 0;
  - um saldo de 0 não gera transação.
- **Liga** os adiantamentos (role `advance`), escrevendo só as duas colunas estruturais.
- **Permissões:** REVOKE a PUBLIC e anon; GRANT a authenticated e service_role; verificação em Live com `has_function_privilege`.

### Linha de BP no Master (correcção do bug)
- Numa turnê (configuração no Master com cidades), a RPC **nunca** cria linha de módulo. Se faltar a linha `cache_module` de uma cidade, dá erro claro. Quem cria essa linha continua a ser `useSyncCacheForecasts`.
- `ensureCacheModuleForecast` deixa de inserir quando o `eventId` é o Master com subeventos. Fica só para o evento simples.
- Teste: Master de turnê sem linha própria, chamada → 0 linhas novas no Master.

### Interface
- `CacheTransactionModal` passa a "Novo desdobramento". Inclui:
  - a pergunta Sim/Não sem nada pré-marcado;
  - a taxa pré-preenchida com `withholding_rate` (25 se não houver);
  - a tabela por cidade: quota, adiantamentos, retenção, líquido e saldo;
  - a data da retenção, que sugere a do artista mas é obrigatório confirmar.
- Grava com uma única chamada à RPC.
- `CacheSettlementPanel`:
  - **`own` no Master de turnê:** o botão abre o desdobramento sobre o total.
  - **Painel de cada cidade (`cityEventId`):** mostra a parte da cidade nos desdobramentos e não cria desdobramentos soltos por cidade. Assim fica um só fluxo.
  - **`children`** (configuração nas cidades): cada cidade é um evento com configuração própria e segue o caso simples.
  - **`master`** (subevento que mostra a configuração do Master): igual ao painel da cidade.
  - O "pago" passa para uma RPC de leitura `cache_paid_summary(config, event)`, que soma na base por configuração e papel e devolve adiantamentos, artista, retenção e total. Deixa de filtrar pelo fornecedor e respeita a barreira dos 1.000.
- `src/lib/cache-breakdown.ts` (puro): repartição, arredondamento e validações, para a interface e os testes. O servidor repete tudo.

### Invariante
`cache_desdobramento_nao_soma` (error, referência 0) em `_run_invariant_checks_extra`, com duas verificações (±0,01):
- por cidade: adiantamentos + saldo + retenção = quota;
- por desdobramento: soma das quotas = bruto.

## 5. Riscos de dupla contagem
- **Linha `cache_module` no Master:** corrigida no ponto 4.
- **Saldo da conta:** a transação do artista nunca leva `withholding_amount`.
- **Card de Custos:** sem módulo no BP, `max(0, calculado − pago)` já inclui a retenção. Com módulo, não soma (D-ERP145).
- **"Pago" no painel:** deixa de filtrar pelo fornecedor.
- **Adiantamento:** conta uma vez, como transação própria; o saldo já vem com ele descontado.
- **BP:** a linha de cada cidade recebe adiantamentos + saldo + retenção = quota, que fica dentro da linha. A verba não sobe.
- **Rateio:** filhas de rateio não entram como adiantamento.

## 6. Adiantamentos existentes num desdobramento criado depois
- O modal lista as 2.1.01 do Master e das cidades ainda sem `cache_payment_id`, agrupadas por cidade. As do fornecedor do artista aparecem marcadas como sugestão.
- Um adiantamento lançado no Master de uma turnê não tem linha onde caber: é recusado com mensagem.
- Ao gravar, só se escrevem `cache_payment_id`, `cache_payment_city_id` e o papel. Valor, estado e conta ficam intactos.
- Nenhum backfill: os dados antigos só entram se o utilizador os escolher.

## 7. Caso de teste: turnê com 2 cidades
Bruto 20.000,00; peso A 1/3 e B 2/3; retenção 25%; adiantamento de 3.000,00 em A.

| Cidade | Quota | Retenção (AT) | Líquido | Adiantamento | Saldo ao artista | Soma |
|---|---|---|---|---|---|---|
| A (1/3) | 6.666,67 | 1.666,67 | 5.000,00 | 3.000,00 (existe) | 2.000,00 | 6.666,67 |
| B (2/3, absorve a diferença) | 13.333,33 | 3.333,33 | 10.000,00 | — | 10.000,00 | 13.333,33 |
| Total | 20.000,00 | 5.000,00 | 15.000,00 | 3.000,00 | 12.000,00 | 20.000,00 |

Transações novas: A-artista 2.000,00; A-AT 1.666,67; B-artista 10.000,00; B-AT 3.333,33. O adiantamento de A fica ligado como `advance`. Não há nada no Master.

Variante: o mesmo caso com adiantamento de 5.500 em A. O total passa (5.500 ≤ 15.000), mas A só tem 5.000 de líquido → **recusa** "Cidade A: adiantamentos 5.500,00 excedem o líquido 5.000,00".

Os outros testes pedidos mantêm-se:
- evento simples: 10.000 com 25% sem adiantamentos; com adiantamento de 5.000; sem retenção;
- dois desdobramentos com respostas diferentes;
- recusas: adiantamentos acima do líquido, tecto total, tecto por cidade;
- atomicidade;
- nenhuma linha nova no Master;
- invariante por cidade e por desdobramento.

Ficheiros de teste: `src/lib/__tests__/cache-breakdown.test.ts` e `supabase/tests/cache_payment_breakdown.sql` (com ROLLBACK).

## 8. Cancelar desdobramento (só estimativa)
`cancel_cache_payment_breakdown(id)` atómica, só quando nada está pago:
- verifica que nenhuma transação do desdobramento tem `paid_amount` > 0, linhas em `transaction_payments` nem está numa lista de pagamento aprovada;
- envia as transações de artista e retenção para o Lixo (30 dias);
- desliga os adiantamentos (as colunas voltam a NULL);
- marca o desdobramento como cancelado (coluna `cancelled_at`).

Custo: cerca de 1 migração, ~80 linhas de SQL, 1 teste SQL e 1 botão; meio dia.
Risco: baixo, porque o "nada pago" é verificado sob lock.

## Decisões para o Pedro (não implemento)
- Regra configurável para a data da retenção. Recomendação: adiar; a data continua manual.
- Realocar um adiantamento entre cidades. Recomendação: não, fica bloqueado.
- Cancelar desdobramento (secção 8). Recomendação: fazer numa segunda fase.

## Documentação no fim
- `.lovable/memory/features/cache-payment-breakdown.md` (nota nova) e remissão em `tax-withholding.md`.
- Entrada em DECISIONS.md que revê a D15.
- Estado da frente actualizado.
- Sem Publish e sem backfill.
