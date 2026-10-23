# Issue #346 (R2, D-ERP291) — Ligar adiantamento livre a um contrato de cachê existente

Executor 7 · Fecho e Sócios, autorizado pelo Pedro a 23/10/2026. HEAD de partida c5dfad1. Este passo é só plano.

## O que foi lido
- Issue #346: pelo resumo do despacho (a função `github-issues` pede sessão; não reli o corpo).
- `.lovable/memory/features/cache-payment-contracts.md`; D-ERP288 e adendas de 20/10 e 21/10 em `docs/DECISIONS.md`.
- `drizzle/migrations/0214`, `0215`, `0216`, `0217` (lista das funções).
- Live, só leitura: `pg_get_functiondef` de `_cache_create_contract` (lida por inteiro), `_cache_free_advances` (embrulha `_cache_free_advances_x` com `_cache_guc_choices()`), `_run_invariant_checks_cache_contracts` (lida); assinatura, tamanho e SECURITY DEFINER de `_cache_alloc`, `_cache_cities`, `add_cache_contract_advance`, `update_cache_payment_contract`, `_cache_cancel_contract`, `cache_contract_context`. Antes de escrever a migração leio também o corpo destas seis.
- `src/components/CacheContractsPanel.tsx` (painel, modal "Novo contrato de pagamento"/"Alterar contrato", diálogo do adiantamento).
- `attach_cache_advance_to_contract` ainda não existe em Live.

## Estado real em Live (lido hoje)
Contrato 1 `0db87a56` (85.000,00, IRS 25%):
- mãe de saldo `a6d6199d` 63.750,00; filhas: Lisboa (`95051bc2`) `a6f0f847` 28.272,01, Porto (`56e431e8`) `30c6d752` 35.477,99 (âncora da linha de BP do Porto);
- mãe de retenção `b3fa1e9f` 21.250,00; filhas: Lisboa 9.424,01, Porto 11.825,99;
- nada pago, nenhum `transaction_payments`.

Adiantamento `204d17ca`: 10.000,00, pago, 1 pagamento, Lisboa, linha de BP `16c052f7`, `cache_role` NULL, fornecedor HENZA (`58d26542`) ≠ beneficiário SIMONE MENDES; é a âncora da linha de BP de Lisboa.

## Resultado esperado (prova 1, ligar ao contrato 1)
| Linha | Antes | Depois |
|---|---|---|
| Filha de saldo de Lisboa `a6f0f847` | 28.272,01 | 18.272,01 |
| Mãe de saldo `a6d6199d` | 63.750,00 | 53.750,00 |
| Filha de saldo do Porto `30c6d752` | 35.477,99 | 35.477,99 (só a percentagem muda) |
| Cidade Lisboa: adiantamentos / saldo | 0 / 28.272,01 | 10.000,00 / 18.272,01 |
| Contrato: adiantamentos | 0 | 10.000,00 |
| Adiantamento 204d17ca | livre | `cache_contract_id`=contrato 1, `cache_role`='advance' |

Bruto, quotas e retenção ficam iguais. "Usar o restante por contratar" passa de 60.420,19 para 155.420,19 − 85.000,00 = **70.420,19**, e um contrato HENZA de 70.420,19 deixa de bater no teto de Lisboa (37.696,02 + 31.230,13 = 68.926,15).

## 1. RPC `attach_cache_advance_to_contract(p_contract_id uuid, p_advance_tx_id uuid, p_confirm_beneficiary boolean DEFAULT false) RETURNS jsonb`
SECURITY DEFINER, `search_path=public`. Guardas iguais às outras RPC do cachê: `_cache_assert_actor`, empresa ativa (`current_company_id()` = empresa do contrato e do adiantamento), `pg_advisory_xact_lock(hashtext('cache:'||raiz||':'||artista))`, `FOR UPDATE` no contrato, mãe/filhas de saldo e adiantamento (por id).

Ordem:
1. **Idempotência:** se o adiantamento já está neste contrato com `cache_role='advance'`, devolve `{already_attached:true}` e não muda nada.
2. **Recusas:** `contrato_cancelado`; `adiantamento_inexistente`; `adiantamento_ja_associado` (outro contrato); `adiantamento_invalido` (não está em `_cache_free_advances(raiz, artista)`, ou seja, de outro artista, outra raiz, lançado no Master ou com papel); `adiantamento_estornado` (`reversed_at` não nulo); `empresa_diferente`; `cidade_fora_do_contrato` (a cidade do adiantamento não tem linha em `cache_payment_contract_cities`); `sem_mae_saldo`; `saldo_negativo` (saldo da cidade − valor < 0); `saldo_abaixo_do_pago` (saldo da cidade − valor < pago dessa filha + valor em lista aprovada/paga dessa filha); `beneficiario_diferente: beneficiário <nome> ≠ fornecedor do adiantamento <nome>` quando diferem e `p_confirm_beneficiary` é falso.
3. **Alterações (por esta ordem, numa transação):**
   - `transactions` do adiantamento e das suas filhas (se tiver): `cache_contract_id`, `cache_role='advance'`, `cache_root_event_id`, `cache_artist_supplier_id` — o mesmo UPDATE que `_cache_create_contract` faz no fim. Valor, estado, conta, data, fornecedor e pagamentos não mudam.
   - Filha de saldo da cidade: `amount -= valor`. Mãe de saldo: `amount -= valor`. Percentagens (`split_percentage`) das filhas de saldo recalculadas com a regra da criação (4 casas; a filha maior fica com 100 − soma).
   - Se a filha da cidade ficar a 0: apagada pelo mesmo tratamento de dependências da 0217 (re-âncora da linha de BP); se a mãe ficar a 0: apagada e `artist_mother_id` a NULL. (Só acontece com adiantamento = saldo da cidade; as recusas do passo 2 garantem que não há pagamento nela.)
   - `cache_payment_contract_cities` da cidade: `advances += valor`, `artist_balance -= valor`.
   - `cache_payment_contracts`: `advances_amount += valor`, `updated_at`.
   - Auditoria: uma linha em `system_audit_log` (ação `cache_advance_attached`, contrato, adiantamento, cidade, saldo antes/depois, confirmação de beneficiário).
4. **Não muda:** `transaction_payments` (nenhuma linha), retenção (mãe e filhas), quotas, bruto, outros contratos, outras cidades além da percentagem das filhas de saldo do mesmo contrato, `withholding_amount`/`declared_withholding_*` (nunca usados).
5. **Âncora da linha de BP:** `event_forecasts.transaction_id` não é tocado. Em Lisboa continua o adiantamento `204d17ca` (já âncora); no Porto continua `30c6d752`. Só se a filha for apagada (passo 3) a linha é re-ancorada à próxima transação (date, created_at, id) com `bp_tx_link_allowed`, ou NULL — o mesmo código da 0217.
6. Devolve `{contract_id, advance_id, event_id, amount, city_balance_before, city_balance_after, contract_advances_after}`.

`cache_contract_context` e o estado do contrato passam a refletir a ligação sem alterações (leem as tabelas). Se `cache_contract_context` não devolver os nomes do beneficiário/fornecedor do adiantamento livre, acrescento `supplier_id`/`supplier_name` a `free_advances` (só leitura, campo novo).

## 2. Ecrã — "Ligar adiantamento" no cartão do contrato
- Botão no cartão de cada contrato ativo, visível quando há adiantamentos livres do artista.
- Diálogo: lista dos livres (descrição, cidade, valor, fornecedor, pago/não pago); ao escolher um, prévia da cidade: saldo antes → depois, adiantamentos do contrato antes → depois; erro em linha se o saldo ficasse negativo ou abaixo do já pago.
- Se o fornecedor ≠ beneficiário: aviso com os dois nomes e caixa "Confirmo que este adiantamento conta para este contrato" (passa `p_confirm_beneficiary=true`). Sem caixa, o botão fica desligado; se a RPC devolver `beneficiario_diferente`, mostra a mesma caixa.
- Confirmação final → RPC → invalida as chaves do painel e o helper central dos cartões do evento.

## 3. Modal "Novo contrato" — aviso antes de "Criar contrato"
- Com adiantamentos livres por marcar e a divisão proporcional (`previewContract`) a passar o teto de uma cidade, mostrar antes do botão: por cidade, teto, quotas dos contratos ativos, adiantamentos livres e espaço livre; e as duas saídas: "Ligar a um contrato existente" (abre o diálogo da secção 2 já filtrado) e "Marcar neste contrato" (marca o adiantamento na lista do modal).
- "Criar contrato" fica desligado enquanto o aviso estiver ativo (a RPC recusaria com `teto_cidade_excedido`). O texto do erro da RPC passa a remeter para estas duas saídas.
- Caso real: depois de ligar o `204d17ca` ao contrato 1, "Usar o restante por contratar" mostra 70.420,19 e o aviso desaparece.

## 4. Invariante nova em `_run_invariant_checks_cache_contracts`
`cache_cidade_teto_excedido`: por raiz + artista + cidade, soma das quotas dos contratos ativos + adiantamentos livres (`_cache_free_advances`) ≤ teto da cidade (+0,005). Registo em `system_invariants` com `reference_count=0`; ajuste do `_run_invariant_checks_all` só se precisar de ser listado lá. Antes de aplicar, conto em Live quantos casos já existem; se houver algum, o `reference_count` fica com esse número e documento quais.

## 5. Migração
- `drizzle/migrations/0237_cache_attach_advance_to_contract.sql` (última livre: 0236).
- Conteúdo: `CREATE FUNCTION attach_cache_advance_to_contract`; nova versão de `_run_invariant_checks_cache_contracts`; INSERT da invariante em `system_invariants` (`ON CONFLICT DO NOTHING`); `cache_contract_context` só se for preciso o campo de fornecedor.
- ACL: `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;` (e `service_role`, como na 0215).
- Rollback (`supabase/manual/rollback_0237.sql`, não aplicado): `DROP FUNCTION attach_cache_advance_to_contract(uuid,uuid,boolean)`; repor `_run_invariant_checks_cache_contracts` com o corpo atual de Live (guardado byte a byte); apagar a linha da invariante. Ligações já feitas não se desfazem pelo rollback — desligam-se com "Alterar" do contrato.
- Prova antes de aplicar, em `BEGIN … ROLLBACK` (passo R2 com "Sim", sessão de leitura sem COMMIT):
  - Prova 1: criar a função temporariamente na transação, ligar `204d17ca` ao contrato 1, mostrar as linhas da tabela acima antes/depois, soma de `amount` por contrato/cidade para todos os outros contratos igual antes e depois, invariantes `cache_contrato_cidade_divergente` e nova a 0, e `_cache_free_advances` sem o 204d17ca; ROLLBACK.
  - Prova 2: na mesma transação de prova, criar o contrato HENZA de 70.420,19 sem adiantamentos, ligar-lhe o `204d17ca`, mostrar saldos de Lisboa antes/depois e o contrato 1 intacto; ROLLBACK.
  - Recusas: `beneficiario_diferente` sem confirmação; segunda chamada idempotente.

## 6. Testes, ficheiros e riscos
**Testes vitest:** prévia por cidade (saldo antes/depois, recusa de saldo negativo e abaixo do pago); aviso do modal com os números do caso real (Lisboa 74.491,32 > 68.926,15; espaço livre por cidade); restante = 70.420,19 após ligação; confirmação de beneficiário obrigatória quando diferem; botão "Criar contrato" desligado com aviso ativo.
**Testes SQL** (`supabase/tests/`, inertes, sem credenciais): fixture sintética de 2 cidades — ligação idempotente; cada recusa; quotas/retenção inalteradas; invariantes a 0; nada de outro contrato muda; ACL (anon sem EXECUTE).
**Ficheiros:** migração 0237; rollback manual; `src/components/CacheContractsPanel.tsx` (botão, diálogo, aviso); helper puro em `src/lib/cache-contracts-preview.ts` (ou onde já vive `previewContract`); testes; memória `cache-payment-contracts.md`; adenda a D-ERP288; relatório `docs/testes/issue346-ligar-adiantamento.md`; QUADRO.

**Riscos:**
- Listas de pagamento: filha de saldo em lista pendente — a redução muda o valor que a lista mostra; recusar também se a filha estiver em lista não rejeitada (não só aprovada). A decidir: proponho recusar (`saldo_em_lista`).
- Estornos: adiantamento estornado recusado; estorno depois de ligado segue o caminho atual (fica fora da soma da invariante 1 por `reversed_at`).
- Retenção: nunca `withholding_amount`/`declared_withholding_*`; a retenção do contrato não muda (o adiantamento sai do saldo líquido, como na criação).
- Beneficiário diferente (HENZA vs SIMONE MENDES): é a situação real; a confirmação fica registada na auditoria.
- Mapa de percentagens das filhas: muda dentro do mesmo contrato; relatórios que leem `split_percentage` continuam coerentes porque a regra é a da criação.
- Portal público e cartões: só leitura destas tabelas; invalidação pelo helper central.

## 7. Passos R2 separados (cada um com "Sim" do Pedro)
- (a) Prova `BEGIN…ROLLBACK` em Live e, se igual ao esperado, aplicar a migração 0237.
- (b) Código do ecrã (botão, diálogo, aviso no modal) + testes; Publish à parte.
- (c) Verificação em Live: ligar `204d17ca` ao contrato 1 no ecrã (com confirmação de beneficiário), ver Lisboa 18.272,01, restante 70.420,19, criar o contrato HENZA sem recusa; invariantes a 0.

Nada é aplicado neste passo.
