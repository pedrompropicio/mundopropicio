# Guarda de remoção (#59) + trigger de coerência de rubrica

## 1. Onde está a guarda

`src/components/EventForecast.tsx`:
- linhas ~3095–3146: `matchingTransactions` (useMemo dentro da linha do BP) — `directTx` por FK + `sameCat` (mesma rubrica/tipo) + desempate por `scoreDescriptionMatch` de `src/lib/bp-tx-matching.ts`.
- 3151–3161: `paidTransactions` / `unpaidTransactions` derivados desse conjunto.
- 4134+: `DeleteForecastDialog` ("Remover linha aprovada") recebe esses arrays e é o que trava.

Foi exactamente por aqui que a TX `c43d2f43…` (rubrica 2.5.03) entrou na linha errada: partilhava rubrica e o token "Digital Decor".

### Correcção
Antes do `sameCat`/desempate, construir `claimedByOtherForecast = Set(allForecasts.filter(f => f.transaction_id && f.id !== item.id).map(f => f.transaction_id))` e excluir essas TXs de `sameCat` (o `directTx` da própria linha continua sempre incluído via `mergeWithDirect`).

Efeito: uma transação já reclamada por FK por outra linha nunca bloqueia a remoção de outra linha, nem aparece duplicada na lista da linha errada. O bucket "Sem linha específica" não muda de comportamento (essas TXs pertencem à linha que as reclama).

## 2. Trigger de coerência de rubrica

Regra: com vínculo FK 1:1, **a rubrica da linha de BP manda**.

Migração com duas funções `SECURITY DEFINER`, `search_path = public`:

1. `trg_forecast_sync_tx_category` — `AFTER INSERT OR UPDATE OF transaction_id, category_id ON event_forecasts`:
   se `NEW.transaction_id IS NOT NULL` e `NEW.category_id IS NOT NULL`, faz
   `UPDATE transactions SET category_id = NEW.category_id WHERE id = NEW.transaction_id AND category_id IS DISTINCT FROM NEW.category_id`.
2. `trg_tx_realign_category_from_forecast` — `AFTER UPDATE OF category_id ON transactions`:
   se existe `event_forecasts f` com `f.transaction_id = NEW.id` e `f.category_id IS DISTINCT FROM NEW.category_id`, realinha `transactions.category_id` para `f.category_id` (usa a linha mais recente por `created_at` caso apareça mais que uma, o que não deve acontecer no modelo 1:1).

### Anti-recursão — escolha
`pg_trigger_depth() > 1` → `RETURN NULL` no início de ambas as funções. Motivo: é local, não precisa de estado de sessão nem de limpeza (uma flag `set_config` fica pendurada na sessão se algo falhar a meio) e ambos os triggers só reagem a escritas de nível 1. O `IS DISTINCT FROM` no `WHERE` já garante no-op quando são iguais, pelo que o `pg_trigger_depth` é o cinto de segurança e não o mecanismo principal.

### `event_id` NULL (Mágicos H&K)
O trigger **não usa `event_id` em nenhuma condição** — trabalha só por `transaction_id`. Logo as duas divergências com `event_id NULL` (`22f82b45…`, `37e12a82…`) não rebentam nem são tocadas por este pedido: só serão realinhadas se alguém voltar a escrever nessas linhas/transações, e mesmo aí o realinhamento é só de `category_id`. Não haverá backfill nesta migração (nada de `UPDATE` massivo), portanto o estado actual delas fica intacto até decidires o `event_id`.

### Auditoria
Sem `updated_at = now()` no realinhamento (não é edição do utilizador). Em vez disso, `INSERT INTO system_audit_log` com acção `auto_realign_tx_category`, tabela `transactions`, `record_id` da TX e `changes` = `{from, to, forecast_id, source: 'trigger'}`.

## 3. Documentação da ressalva

No topo de cada função da migração e em `docs/DECISIONS.md` (secção nova, não enterrada):
> Esta regra assume vínculo **1:1** `event_forecasts.transaction_id → transactions.id`. Com a issue #29 (alocação do realizado: 1 fatura → N linhas de BP, 1 linha → N transações) a rubrica da transação deixa de poder seguir uma única linha e **estes dois triggers têm de ser revistos/removidos** em favor da tabela de alocação.

## Fora de âmbito
Sem Publish, sem correcção dos 2 pares do Mágicos H&K, sem backfill SQL (já feito por ti para a Anitta).
