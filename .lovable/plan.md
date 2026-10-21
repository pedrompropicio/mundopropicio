# #335 — Modal de encontro de contas (só plano)

## Âmbito e evidência

Implementação só após aprovação do Pedro. Nesta tarefa: reserva em `docs/QUADRO.md` e este plano; nenhum código, migração, DDL, DML ou Publish. A reserva permanece enquanto o plano aguarda decisão; #322/#323 preservadas.

Base confirmada: HEAD local/main `672439bd24ea47c3e6b9f14a17e9b284535f3ca3`; CI / quality success, run `39605238174`. Reconfirmar HEAD, sincronização e CI antes de implementar. Isto confirma integração da #336, não prova Publish anterior.

### Ficheiros e fontes lidos

- `docs/QUADRO.md` (Gate CI, reservas), `AGENTS.md`, `docs/DECISIONS.md` (D-ERP28, D-ERP86, D-ERP289).
- `.lovable/memory/features/compensacao-ligada.md`, `payment-account-ownership.md`.
- Issues #335, #336 e #337 completas, com todos os comentários paginados; API GitHub autenticada, porque a ferramenta `github-issues(number)` não está disponível nesta sessão.
- `src/lib/bank-statement/reconcile.ts`; `src/pages/BankReconciliation.tsx` (leitura das pernas, manualItems, confirmManual e botões da linha).
- `src/components/TransactionOffsetsBlock.tsx`, `src/lib/transaction-offsets.ts`, `src/components/TransactionEditModal.tsx` (aba Pagamento), `src/components/EventForecast.tsx` (criação, parcelas e matching BP).
- SQL: `supabase/migrations/20260922175952_c2dfd13e-4f5b-4f61-9da7-45a29d86460c.sql` (reconcile_bank_line); `20260928221118_bea24c4b-e61c-4fd0-b901-59eba78bfbe1.sql` (offsets, derivação, aplicação/reversão); `20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql` (guardas/launch_from_bank_lines); `20260822035803_804e84f8-34d1-4958-889e-ad16e0504c18.sql` (bp_tx_link_allowed e triggers).
- Investigação complementar: `BankLineLaunchModal.tsx`, `TransactionFormModal.tsx`, `payment-settlement.ts`, `useBankMovementGroups.ts`; migrações de reverse_payment/reverse_transaction e `20261002103000_camarim_invariant_saldo_sessao.sql`.
- SELECT de metadados instalados: definições integrais de reconcile_bank_line, _apply_transaction_offset, _derive_paid_amount e inventário dos triggers das quatro tabelas. Sem leitura de dados financeiros nesta fase.

## 1. Núcleo agnóstico e três portas

Assinatura proposta (nomes novos, não existentes):

```sql
public.transaction_offset_execute(
  p_request_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_movement jsonb, -- {account_id, date, amount}; amount assinado, EUR
  p_date date,     -- data também obrigatória no saldo zero
  p_note text DEFAULT NULL
) RETURNS jsonb
```

Cada item identifica exclusivamente `transaction_id` OU `forecast_id`, `mode` e `cash_order`; inclui snapshot esperado para recusar alterações desde a prévia. Nunca aceita um valor editado: o servidor lê dívida/bruto, IVA e pagamentos. Resultado: ID do encontro, itens/transações, pagamentos, repartição, líquido e estado. Empresa/autor vêm da sessão, não do cliente.

- #335: mantém `reconcile_bank_line(p_line_id,p_items)` sem overload ambíguo e retorno compatível. Sob lock da linha, deriva conta/data/sinal do extrato, chama o núcleo e só depois liga a linha ao encontro e às transações com dinheiro. O núcleo não recebe nem procura linha do banco.
- #337: futuro adaptador do lançamento chama o mesmo núcleo com conta, data e valor obrigatórios. Não criar já o botão dessa porta.
- Porta sem dinheiro: futuro adaptador passa `p_movement=NULL`, data obrigatória e saldo exatamente zero; só pernas compensation sem conta. Núcleo preparado e testado, porta pública não ativada nesta #335.
- `link`/`settle` antigos sem offset mantêm comportamento e escolhas explícitas de data. Não permitir mistura ambígua de link histórico e novas liquidações num encontro; transações já pagas são ligadas pelo caminho link, não pagas novamente.

## 2. Registo único, pagamentos e reversão

Facto: `transaction_offsets` atual é um par obrigatório e único receita/despesa. Não suporta a regra 7 sem DDL. Proposta aditiva: `transaction_offset_groups` (cabeçalho) + `transaction_offset_items` (N linhas), sem fabricar pares no modelo legado.

Cabeçalho: company_id, supplier_id, request_id, hash do pedido, data, movimento assinado/conta opcional, nota, estado aplicado/revertido, autor/carimbos. Linhas: group_id, transaction_id, forecast_id de origem opcional, ordem, tipo e snapshots de base/IVA/bruto/dívida, dinheiro e compensação. Unicidade por grupo/transação e empresa/request_id; conta obrigatória se movimento não zero. Colunas aditivas `offset_group_id`/`offset_item_id` em transaction_payments; `offset_group_id` em transaction_offsets permite associar a ligação antiga adotada, sem a apagar.

- `settle`: item do sinal do movimento; pode receber dinheiro e a sua própria compensation pelo restante. `offset`: sinal oposto, integralmente compensation. Só offset inverte a trava de sinal; link e settle continuam a recusá-lo.
- Ambas as margens recebem as suas pernas compensation. Todas positivas, `status='paid'`, conta NULL, mesma data e associação ao encontro. Dinheiro: transfer, conta do movimento, apenas nos itens do seu sinal. Nenhuma linha/conta de caixa.
- Caso Estoril: adotar `d2e1eaa3` se ainda não aplicada e compatível; mantê-la como prova histórica, sem duplicar. O trigger legado deve ignorar apenas ligações formalmente geridas pelo grupo. Não basta uma flag enviada pelo cliente ou um GUC para contornar validações.
- `_apply_transaction_offset` hoje só paga o outro lado; não serve como motor N↔N. Preservar pares fora de encontros e adaptar `apply_transaction_offsets`/`_reverse_transaction_offsets_for` para não duplicar efeitos de grupos. Adoção de ligação já aplicada exige prévia específica; recusar, não migrar silenciosamente.
- D-ERP86: inserir/reverter pagamentos; nunca escrever paid_amount/status/payment_date derivados à mão. Usar `sync_paid_amount_from_payments` e `_derive_paid_amount`; após efeitos aninhados, derivar todos os itens pelo caminho interno protegido.
- Nova `transaction_offset_reverse(group_id,request_id,reason)`: bloqueia grupo/itens, reverte todas as pernas do encontro, desfaz só os vínculos bancários desse encontro e preserva cabeçalho/linhas/auditoria. Não apaga as transações criadas do BP: ficam aprovadas em aberto. Guardar/analisar alterações posteriores; nunca reverter pagamentos independentes.
- Estorno/remoção individual de perna gerida deve recusar e encaminhar à reversão integral (guardas também em reverse_payment/reverse_transaction/DELETE). Sem cash_refund ou supplier_credit inventados para compensation.

### Atomicidade, segurança e concorrência

RPCs invoker com search_path fixo; autorização explícita admin/manager/editor e empresa ativa em todas as entradas, além da RLS. Helpers privilegiados estritamente internos. Nenhum acesso anon. Idempotência durável: request_id igual + hash igual devolve resultado; conteúdo diferente recusa.

Locks: âncora bancária no adaptador; serialização por empresa/entidade; eventos/BP, transações e pagamentos em ordem determinística por UUID. Revalidar saldo/dívida/vínculos após locks. Compatibilizar com a ordem dos writers/estornos existentes; conflitos/deadlocks abortam integralmente, nunca retry cego. Unicidades e guarda de linha livre complementam os locks. Testar duas sessões; o código atual não tem FOR UPDATE e não prova segurança contra duplo clique concorrente.

## 3. BP no mesmo acto

Só `approved_at IS NOT NULL AND version_id IS NULL`; evento/empresa permitidos e guardas de evento fechado, cachê, rateio e aprovação permanecem. Entre eventos da mesma entidade é permitido, sem alterar a hierarquia Master/Split.

Procurar TODOS os vínculos: `transactions.forecast_id`, âncora `event_forecasts.transaction_id`, e matching canónico já usado pelo BP. Não usar só a âncora nem uma lista truncada. Linha com transações da entidade oferece essas transações; linha com alguma transação mas nenhuma da entidade não oferece criação. Não inferir dívida pela verba sobrante.

Sem transação nenhuma, sob lock/revalidação: criar approved, supplier_id do encontro, amount/iva_rate/type/category/event/descrição da própria linha, forecast_id obrigatório; respeitar bp_tx_link_allowed e triggers de âncora. Sem elevação de verba, sem alterar BP/IVA; factura em falta segue pendência contabilística existente. Não chamar o fluxo cliente de EventForecast, que faz múltiplas escritas fora de uma RPC atómica.

## 4. Aritmética e repartição

Usar cêntimos inteiros na prévia e numeric arredondado no servidor. Para documentos parcialmente pagos, usar dívida efetiva fixa ainda em aberto; mostrar bruto e já pago separadamente, sem fingir que é o documento inteiro.

`Σ(itens do sinal da linha) − Σ(itens opostos) = abs(linha)`; débito troca os lados. Igualdade exata em cêntimos: não distribuir diferenças toleradas nem editar documentos. Mensagem: “Faltam X €” ou “Excedem X €; corrija a transação ou o BP”.

Alocar abs(movimento) pelos itens do seu sinal, na ordem escolhida, até esgotar; o remanescente de cada um é compensation. A soma de compensation nas receitas deve igualar a das despesas. Base e IVA de cada documento intactos. Exemplo da Issue: 12.300 + 15.900 − 5.650 − 3.690 = 18.860; dinheiro 12.300/6.560; compensation 0/9.340/5.650/3.690.

## 5. Invariantes e #336

Manter compensacao_pendente para pares legados; excluir grupos geridos do critério unilateral e verificá-los bilateralmente por montante, não mera existência. Novas vigias com referência zero: encontro_desequilibrado, encontro_pernas_divergentes, encontro_reversao_parcial, encontro_dinheiro_sem_conta, encontro_vinculo_bancario_divergente. Preservar paid_sem_pagamento, FX, filhas sem conta/pernas e guardas de montante total.

`reconciliationCash`/`HISTORICAL_CASH_BOUNDARY` ficam intactos: as novas pernas reais alimentam a soma por conta; compensation não entra. Apenas itens com dinheiro entram na ponte bancária; todos os documentos aparecem no detalhe do grupo, evitando consumir despesas sem dinheiro como se explicassem o banco.

#337 N↔N pode repartir dinheiro por várias receitas: o motor atual b/c casa uma transação, não uma soma de grupo. Prever passagem de ligação por grupo já existente, sem liquidar, antes de b/c; testar ambiguidade e consumo único. Implementar essa extensão quando integrar a porta #337, sem prometer casamento automático N↔N só com a #336.

D-ERP28: automatismo continua só a ligar; liquidar encontro exige confirmação explícita. RPC instalada contém protocolo #233 de align/keep e auditoria ausente do SQL original: conservar no caminho legado; encontro não realinha pagamentos anteriores em silêncio.

## 6. UI

Novo `src/components/bank/BankLineOffsetModal.tsx` em BankReconciliation, terceiro botão “Encontro de contas” junto de Conciliar/Lançar numa linha unmatched. Prévia e ordenação partilhadas em novo `src/lib/transaction-offset-plan.ts`; leitura paginada ou RPC de prévia com cobertura completa.

Estados: escolher entidade → carregar documentos/BP → selecionar → ordenar dinheiro → conferir → confirmar → aplicado; erro/alteração concorrente obriga nova prévia; pedido incerto recupera pelo request_id. Mostrar crédito/débito, conta/data bloqueadas pelo banco, bruto/já pago/dívida, dinheiro/compensação por item e diferença. Valores sem inputs de edição. Cabeçalho/dismissal fora da área de scroll, desktop e mobile.

TransactionOffsetsBlock na aba Pagamento: participação só de leitura, “faz parte do encontro de contas de <data> · <entidade> · <valor>”, link para detalhe. Nenhum botão de criar encontro na ficha. Preservar apresentação dos pares legados; decisão sobre ocultar o antigo “Compensa com…” explicitada abaixo. Invalidar queries financeiras centrais, pernas, grupo, BP e conciliação após resultado confirmado.

## 7. Testes e provas

Primeiro: fixture Estoril com b873559f/0368bca9/d2e1eaa3/linha 23.406 do extrato 87b77744; receita 23.406 dinheiro + 7.590 compensation; despesa 7.590 compensation; conta +23.406; caixa idêntica.

Vitest + PostgreSQL local real: quatro documentos/IVAs da Issue; ordem invertida; débito simétrico; saldo zero; parcial prévio; diferença de 0,01 recusada; entidade/empresa erradas; BP aprovado/ativo vazio e partilhado; criação+rollback; ligação existente sem duplicação; duplo clique em duas sessões; replay alterado; falha após cada escrita; reversão integral; estorno individual recusado; datas align/keep legadas; isolamento/ACL; >1.000 pernas; retenção SEPA; fronteira anterior/posterior ao primeiro period_from; grupo N↔N sem consumo duplicado. Suite relevante/completa e validação de tipos conforme CI (tsgo; não substituir por promessa de tsc manual).

Live futuro: só depois de autorização separada e das migrações publicadas pelo Pedro; primeiro SELECT de IDs completos e baseline atual. BEGIN…ROLLBACK com caso Estoril, contagens/valores/estados/vigias/saldos antes/depois e prova de rollback; não inserir fixtures Live. Auditar triggers/efeitos externos antes: rollback não desfaz chamadas externas nem todos os efeitos técnicos. Não correr se houver despacho externo não transacional; provar isso localmente. Nesta tarefa nenhum teste de escrita executado.

## 8. Migrações e autorizações separadas

Nomes propostos, timestamp/número só atribuídos após revalidar catálogo:

1. `issue335_offset_group_storage`: duas tabelas, constraints/índices/FKs e colunas nullable acima; GRANT explícito na mesma migração, depois RLS e policies. SELECT authenticated staff com isolamento; writers apenas pelo caminho aprovado, service_role explícito; nenhum anon.
2. `issue335_offset_core`: prévia/execute/reverse, adaptador reconcile_bank_line, guardas de pagamentos/estornos e adaptação dos triggers de pares; ACL EXECUTE apenas authenticated/service_role nas entradas, helpers internos revogados de PUBLIC/anon/authenticated quando privilegiados.
3. `issue335_offset_invariants`: verificação bilateral e novas vigias (registos de configuração também são DML a autorizar).

Antes de aplicar, rever catálogo/ACL efetivos (incluindo privilégios técnicos herdados), hashes e drift. lock_timeout='5s'. DDL por migrations rastreadas → aplicação autorizada → Pedro Publish; nunca SQL Editor direto em Live.

Autorizações item a item: A) aplicação do schema aditivo; B) substituição de funções/triggers/ACL; C) registo das vigias; D) prova Estoril BEGIN…ROLLBACK; E) adoção e liquidação persistente do Estoril via modal; F) futura porta #337; G) futura porta saldo zero. Aprovar plano não autoriza D–G nem Publish. Nenhum backfill, correção Coala, apagamento ou operação #323 prevista.

Reversão técnica: desativar entrada nova, restaurar definições/ACL guardadas por migração corretiva e preservar tabelas/auditoria. Só restaurar triggers antigos se não houver grupos ativos incompatíveis; caso contrário manter guardas e reverter operações pelo núcleo. Não DROP nem apagar histórico.

## 9. Decisões e fases de aceitação

Decisões do Pedro:
- Modelo N linhas: A) cabeçalho+itens novos, preservar pares legados (recomendada); B) remodelar a tabela par-a-par, maior risco.
- Ficha: A) só leitura para grupos, manter criação par-a-par legada separada (recomendada por compatibilidade); B) tornar todo o bloco read-only e retirar “Compensa com…”. Nenhuma criação de encontro na ficha em ambas.
- Dívidas prévias/FX/retenções/créditos: A) EUR e dívidas simples, recusar casos com plano de parcelas/crédito/FX não representável, sem os alterar (recomendada na primeira fase); B) alargar após testes específicos. Estoril e exemplo obrigatório não dependem desse alargamento.
- Escritas Live: aprovação separada de cada A–G, com payload/IDs/prova revistos. Questão #323 resolvida por exclusão de dados; qualquer alteração transversal ao writer reservado requer coordenação antes de dispatch.

Fases pequenas:
1. Contrato e prévia pura: exemplos/simetria/diferenças/BP provados, zero writers.
2. Schema e núcleo LOCAL/inertes: PostgreSQL com triggers reais, atomicidade/ACL/concorrência/reversão aprovadas; nada aplicado sem autorização A–C.
3. Modal + leitura da ficha: desktop/mobile, confirmação/replay/erros; suite e CI verde no SHA integrado.
4. Aplicação autorizada e revisão do Pedro: SELECT/metadata, depois prova D com rollback; nenhuma persistência financeira automática.
5. Aceitação humana E: Estoril pelo modal, leitura de retorno e saldos/vigias confirmados; libertar reserva e comentar #335. Publish só por pedido expresso ao 0.
6. #337 e saldo zero: planos/autorizações próprios, reutilizar núcleo e acrescentar ligação automática de grupo N↔N sem liquidar.

**Aguarda aprovação do Pedro. Nada implementado.**