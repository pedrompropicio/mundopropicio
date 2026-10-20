# Contratos de pagamento do cachê com retenção na fonte (revê a D15)

Esta versão substitui as anteriores.

## Documentação lida
- docs/INDEX.md; docs/estado/estado-financeiro-e-tesouraria.md.
- docs/DECISIONS.md: DR-2026-09-03-D15, D-ERP145, D-ERP148, D-ERP265 e as adendas de 13 e 14/10.
- .lovable/memory/features: tax-withholding.md, transaction-installments.md, payment-amount-invariants.md, cache-deductions-bp-first.md, tour-cache-in-cost-card.md, payment-account-ownership.md, invariant-monitor.md, rateio-mae-filhas-agregacao.md (D-ERP70/D-ERP76) e master-split-rateio-source-of-truth.md (D-ERP73).

## 1. Sítios onde se pagam cachês (confirmados no código)
- **Criação de transações:** só `src/components/CacheTransactionModal.tsx`. O modal abre a partir de `src/components/CacheSettlementPanel.tsx`, que serve quatro casos:
  - o evento simples;
  - o painel do Master da turnê (`EventCacheConfig` l.1201), onde `eventId` = Master;
  - cada cidade em `CityCacheSettlementsPanel`, onde `cityEventId` = cidade;
  - os cenários `master` e `children` (`resolveCacheScope`).
- **Bug confirmado:** aberto no Master, o `effectiveEventId` passa a ser o Master. Aí `ensureCacheModuleForecast` procura a linha por (event_id, cache_config_id), não a encontra e **insere uma linha `cache_module` no Master**.
- O resto não cria transações. "Fechar cachê" (`finalizeMutation`) só congela o valor e `useSyncCacheForecasts` só escreve no BP.
- Na implementação, `rg` confirma que nada mais insere 2.1.01. Se aparecer outro caminho (por exemplo `ImplBPTab`), passa a usar as mesmas RPCs.
- O pagamento continua nos fluxos normais (listas, `BatchPaymentModal`, `TransactionPaymentModal`). Só as mães têm conta.

## 2. Estrutura (migração aditiva, sem backfill nem DML)

### Porque não reutilizar `event_cache_payments`
- A tabela tem `cache_config_id` NOT NULL e uma configuração por linha. O contrato pertence à turnê e ao artista, e pode cruzar configurações (cenário `children`).
- Tirar o NOT NULL é uma alteração destrutiva e exigiria redefinir o significado da tabela.
- **Proposta:** a tabela fica intacta (0 linhas) e recebe `COMMENT 'DEPRECATED: substituída por cache_payment_contracts'`. Criam-se tabelas novas.

### Tabelas novas
- `cache_payment_contracts`
  - colunas: id, company_id, `tour_event_id` (Master, ou o próprio evento se for simples), `beneficiary_supplier_id`, gross_amount, withholding_answered (NOT NULL DEFAULT false), has_withholding, withholding_rate, withholding_rate_confirmed_mixed, artist_due_date, withholding_due_date, created_by, created_at;
  - CHECK: com retenção, a taxa e o vencimento são obrigatórios.
- `cache_payment_contract_cities`
  - é a fotografia da repartição: contract_id, event_id (cidade), weight, cap_effective, gross_quota, withholding_quota, advances_quota, artist_quota;
  - UNIQUE (contract_id, event_id).
- Ambas com:
  - GRANT SELECT a authenticated e ALL a service_role, sem anon;
  - RLS por empresa (`row_belongs_to_current_company`);
  - escrita só pelas RPCs.

### Colunas novas em `transactions` (nulas, estruturais)
- `cache_contract_id`: FK, preenchida **na mãe**, ou na transação legada directa.
- `cache_role`: CHECK em ('advance','artist','withholding').
- **Índices:**
  - único parcial em (cache_contract_id, cache_role) para 'artist' e 'withholding', com `parent_transaction_id IS NULL`;
  - o adiantamento é indivisível porque `cache_contract_id` é uma coluna única da transação. Não pode estar em dois contratos.
- As filhas não repetem o contrato: herdam-no pelo `parent_transaction_id`.
- A ligação nunca se faz por descrição, fornecedor ou nome.

### Bruto máximo e quota de cada cidade
- Uma só função de leitura no frontend, `resolveTourCityCacheCaps(master)` em `src/lib/cache-contract.ts`. Para cada cidade:
  - escolhe o âmbito com `resolveCacheScope`;
  - obtém o valor efectivo com `getCacheEffectiveAmount`, usando o `computeTourCityCacheAmount` no ramo de turnê;
  - não usa outra fórmula.
- **No servidor:** o tecto de cada cidade é o `amount` da linha `cache_module` viva dessa cidade. Essa linha é mantida pelo sync com a mesma fonte.
- **Conferência:** a RPC recebe os tectos do cliente e compara-os com essas linhas. Se diferirem mais de 0,01, recusa com "recarregue: o cachê da cidade X mudou". Nunca recalcula por conta própria.

## 3. RPCs (SECURITY DEFINER, atómicas, search_path fixo)

Regras de acesso e verificação comuns às RPCs:
- REVOKE a PUBLIC e anon; GRANT a authenticated e service_role.
- Papel admin ou manager, empresa da sessão.
- Lock da linha `events` do Master, para serializar os contratos da mesma turnê.
- Em Live, verificar que a função existe e `has_function_privilege` para os três papéis.

### `create_cache_advance(tour_event_id, supplier_id, amount, date, due_date, ...)`
Para adiantamentos **novos**. Cria:
- 1 mãe sem evento: role `advance`, 2.1.01, IVA 0, sem `forecast_id`, ainda sem contrato;
- N filhas por cidade, pela repartição proporcional da secção 4, cada uma com a linha `cache_module` da sua cidade, sem `account_id` e sem `transaction_payments`.

Num evento simples, cria 1 transação directa no evento.

### `create_cache_payment_contract(...)`
- **Entrada:** tour_event_id, beneficiário, bruto, resposta Sim/Não, taxa, confirmação de taxas mistas, vencimentos, tectos por cidade, ids dos adiantamentos.
- **Validações:**
  - a pergunta de retenção foi respondida;
  - a taxa está entre 0 e 100;
  - com Sim, o vencimento da retenção está preenchido;
  - se as configurações das cidades tiverem taxas diferentes, a confirmação explícita é obrigatória;
  - cada adiantamento é 2.1.01, da turnê (mãe com filhas nas cidades, ou legado directo numa cidade), da empresa, sem `cache_contract_id`, não estornado e não escondido. Não pode ser uma filha: escolhe-se sempre a mãe;
  - o adiantamento conta pelo `amount` (IVA 0);
  - Σ adiantamentos ≤ líquido (ou ≤ bruto, sem retenção);
  - o tecto da turnê não é ultrapassado (Σ dos brutos dos contratos ≤ Σ tectos);
  - nenhuma cidade ultrapassa o seu tecto (Σ das quotas de todos os contratos + o novo);
  - nenhuma filha do saldo fica negativa (secção 4). Se ficar, recusa: "Cidade X: os adiantamentos (Y) excedem o líquido da quota (Z)".
- **Criação:**
  - o contrato e as linhas por cidade;
  - a mãe "saldo ao artista" com as suas filhas por cidade;
  - com Sim, a mãe "retenção IRS", com o fornecedor `MINISTERIO DAS FINANCAS - IRS` resolvido por `company_id` da sessão (erro se não existir), e as suas filhas;
  - liga os adiantamentos: preenche `cache_contract_id` e `cache_role='advance'`, e mais nada. Valor, estado e conta ficam intactos.
- **Regras das transações criadas:**
  - todas em 2.1.01, IVA 0, `declared_withholding_*` a NULL e sem `withholding_amount`;
  - as mães não têm evento nem `forecast_id`;
  - cada filha tem o `event_id` e a linha `cache_module` da sua cidade;
  - uma filha a 0,00 não se cria. Uma mãe a 0 (saldo 0) também não.
- Se falhar qualquer passo, incluindo a 2.ª mãe, nada fica gravado.

### Leitura `cache_paid_summary(tour_event_id)`
Soma na base, por cidade e por papel:
- filhas, pelo `parent_transaction_id`;
- legados directos;
- adiantamentos ainda sem contrato.

Devolve, por cidade, tecto, adiantamentos, saldo, retenção, total e o pago (`paid_amount` das mães repartido pela proporção das filhas). Respeita a barreira dos 1.000.

## 4. Repartição e cêntimos
- Peso da cidade = tecto ÷ Σ tectos.
- Os valores contam em cêntimos inteiros.
- Para cada contrato:
  - **Quota do bruto:** arredondada (meio para cima) em todas as cidades menos uma. A **cidade absorvente** fica com a diferença: é a de maior tecto; em empate, a primeira por data e depois por id.
  - **Retenção da cidade:** quota × taxa, com a mesma regra. Σ das filhas = retenção da mãe, exacto.
  - **Adiantamentos da cidade:** filhas desse adiantamento na cidade (novos) ou o valor inteiro na cidade onde está (legado).
  - **Filha do saldo da cidade** = quota − retenção da cidade − adiantamentos da cidade. Fica exacta por construção, e Σ das filhas = mãe do saldo.
  - Se alguma for < 0, recusa.
- **Por cidade, em todos os contratos:** Σ(adiantamentos + saldo + retenção) ≤ tecto, e = tecto quando Σ dos contratos = total da turnê.

## 5. Fluxo do modal ("Novo contrato de pagamento")
1. Abre no Master, ou no próprio evento se for simples. No painel de uma cidade aparece só a leitura da parte dessa cidade, com a ligação para o Master. Fica um só fluxo.
2. Mostra o cabeçalho com o cachê efectivo total, o já contratado e o disponível, e a tabela de tectos por cidade.
3. Pede o beneficiário (pré-preenchido com o fornecedor da configuração) e o bruto.
4. Lista os adiantamentos da turnê sem contrato, de qualquer cidade e fornecedor. Os do artista aparecem marcados como sugestão; cada um tem a cidade e o valor.
5. Pergunta "Tem retenção na fonte?" Sim/Não, sem resposta pré-marcada. O botão Gravar fica desligado até haver resposta.
6. Com Sim:
   - a taxa vem pré-preenchida com `withholding_rate` (fallback 25) e pode ser editada;
   - se as cidades tiverem taxas diferentes, aparece o aviso e uma confirmação obrigatória;
   - o vencimento da retenção é obrigatório e começa vazio. Mostra-se o "Usar a data do artista (dd/mm)", mas o utilizador tem de confirmar.
7. Pré-visualização por cidade, com os números do servidor: quota, adiantamentos, retenção, líquido e saldo, com as linhas negativas a vermelho. Mostra também as duas mães.
8. Gravar faz uma única chamada à RPC.

O botão "Novo adiantamento" passa a chamar `create_cache_advance`.

`ensureCacheModuleForecast` deixa de inserir sempre que o evento é Master com subeventos. No evento simples fica como está.

## 6. Dupla contagem: consumidores e regra D-ERP70
Predicado único: `src/lib/rateio-children.ts`. A empresa conta as mães; o evento conta as filhas.

| Consumidor | Nível | Como fica |
|---|---|---|
| `useEventCacheImpact` (paidCacheTransactionsTotal) | evento (filtra event_id) | soma as filhas e os legados; a mãe fica fora por não ter evento. Já exclui as filhas `split_percentage`: as filhas novas levam `split_percentage` NULL, por isso **entram**. O filtro tem de ser revisto para excluir só as filhas do modelo B/rateio antigo |
| `cacheImpactOnTopOfCost` (card, Lucro, lista) | evento | sem alteração; o BP da cidade já tem a linha do módulo (D-ERP145) |
| `CacheSettlementPanel` "pago" | evento/cidade | passa a usar `cache_paid_summary`; deixa de filtrar pelo fornecedor |
| Fecho e `computeEventSettlementTotals` | evento | contam as filhas na linha da cidade |
| DRE | evento ou empresa | evento: filhas; empresa: mães, pelo predicado |
| Portal do Sócio (`get_partner_settlement_summary`) | evento | confirmar na implementação que filtra por event_id; as filhas contam |
| `ReportArtistCache` | evento | acrescenta a decomposição por papel via `cache_paid_summary` |
| Saldo da conta, tesouraria e listas | empresa | só as mães têm conta; a retenção não é descontada duas vezes |

A pendência do `split_percentage` é o maior risco; fica coberta por um teste próprio.

## 7. Invariantes novos (em `_run_invariant_checks_extra`, error, referência 0)
- `cache_contrato_nao_soma`: por contrato, Σ adiantamentos + saldo + retenção = bruto ao cêntimo, e cada mãe = Σ das suas filhas ao cêntimo.
- `cache_cidade_acima_do_teto`: por cidade, Σ de tudo o que lhe cabe em todos os contratos ≤ tecto da linha `cache_module` (+0,01).
- `cache_linha_modulo_no_master`: linha `cache_module` num evento que tem subeventos. Hoje deve dar 0; confirmar a referência em Live antes de semear.
- A tabela de invariantes e `postgrest-large-tables`, se aplicável, são actualizadas.

## 8. Testes
### Puros (`src/lib/__tests__/cache-contract.test.ts`)
Lisboa 20.000 e Porto 10.000; pesos 2/3 e 1/3.
- **A:** bruto 18.000, 25%, adiantamento legado de 5.000 em Lisboa.
  - Retenção 4.500 (Lisboa 3.000, Porto 1.500); líquido 13.500; saldo 8.500 (Lisboa 4.000, Porto 4.500).
  - Lisboa 12.000 = 5.000 + 3.000 + 4.000; Porto 6.000 = 1.500 + 4.500.
- **B:** bruto 12.000, sem retenção. Saldo 12.000 (Lisboa 8.000, Porto 4.000).
- **C:** Lisboa 20.000; Porto 10.000; total 30.000.
- **D:** adiantamento de 10.000 em Lisboa no contrato A → Lisboa −1.000 → recusa com mensagem.
- **Cêntimos:** pesos com dízimas (1/3) → a cidade absorvente fecha ao cêntimo.
- **Evento simples:** 10.000 a 25% (7.500 + 2.500); com adiantamento de 5.000 (2.500 + 2.500 + 5.000); sem retenção.
- **Tectos:** recusa acima do total e recusa acima do tecto de uma cidade.
- **Agregação:** as filhas novas contam no `useEventCacheImpact`.

### SQL (`supabase/tests/cache_payment_contract.sql`, BEGIN…ROLLBACK)
- A a D pela RPC.
- **E:** um adiantamento já ligado não entra noutro contrato.
- **F:** falha forçada na 2.ª mãe → 0 linhas no contrato e nas transações.
- Nenhuma linha `cache_module` criada no Master.
- Pergunta de retenção sem resposta e vencimento em falta → recusa.

### Aceitação SM 2026 (só leitura em Live)
Correr a pré-visualização com o adiantamento legado `204d17ca` (10.000, Lisboa, linha `16c052f7`). Confirmar que:
- os tectos vêm das linhas `cache_module` das cidades;
- a filha do saldo de Lisboa fica ≥ 0 para um bruto razoável (ex.: total do efectivo, com e sem 25%).

Nada é gravado.

### Qualidade
tsgo limpo, vitest sem falhas novas e CI verde.

## 9. Ficheiros
- Migração do agente: as tabelas, as colunas, os índices, as 3 RPCs, os invariantes e o COMMENT de deprecação.
- `src/lib/cache-contract.ts` (novo): tectos, repartição e validações.
- `src/components/CacheTransactionModal.tsx`: o modal de contrato e o de adiantamento; correcção de `ensureCacheModuleForecast`.
- `src/components/CacheSettlementPanel.tsx`: resumo pela RPC e botões só no Master ou no evento simples.
- `src/hooks/useEventCacheImpact.ts`: revisão do filtro `split_percentage`.
- `src/components/ReportArtistCache.tsx`: decomposição por papel.
- Testes: os da secção 8.
- Documentação:
  - `.lovable/memory/features/cache-payment-contracts.md` (novo) e remissão em `tax-withholding.md`;
  - DECISIONS.md com uma entrada que revê a D15;
  - estado da frente actualizado;
  - AGENTS.md com a regra estrutural.

## 10. Cancelar contrato (só estimativa)
`cancel_cache_payment_breakdown(contract_id)`, atómica e só quando nada está pago. Faz isto:
- verifica que as mães não têm `paid_amount` > 0, `transaction_payments` nem lista aprovada;
- envia as mães e as filhas para o Lixo (30 dias);
- os adiantamentos voltam a ficar sem contrato (colunas a NULL);
- marca o contrato com `cancelled_at`.

Custo: 1 migração, ~100 linhas de SQL, 1 teste SQL e 1 botão; cerca de meio dia a 1 dia. Risco baixo.

## Decisões para o Pedro (não implemento)
- **Regra configurável para a data da retenção.** Faz sentido mais tarde como sugestão por empresa (por exemplo, dia 20 do mês seguinte), nunca como valor automático. Recomendação: adiar.
- **Cancelamento** (secção 10). Recomendação: segunda fase.
- **Adiantamentos novos** repartidos pela proporção do momento em que são lançados. Se os tectos mudarem até ao fecho, o contrato absorve a diferença nas filhas do saldo; uma filha negativa bloqueia. Recomendação: aceitar.

## Fora de âmbito
Backfill e DML sobre dados existentes, Publish, `declared_withholding_*`, `transaction_payments` e regras das listas.
