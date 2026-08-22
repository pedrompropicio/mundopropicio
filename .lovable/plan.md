# Guarda de remoção (#59) + coerência de rubrica BP↔TX (apertar o que existe)

## 0. Levantamento — o que já existe na BD

Já existem **os dois lados**, não só um:

- `enforce_tx_category_l2_match()` — `transactions`, valida ao mudar `category_id`; se há forecast a reclamar por FK e o L2 não bate, `RAISE check_violation`.
- `enforce_forecast_tx_link_l2_match()` — `event_forecasts`, valida ao mudar `transaction_id`/`category_id` com a mesma função; mensagem "Não é possível vincular esta transação ao BP: categorias em grupos L2 diferentes."
- `validate_tx_category_l2_match(tx_cat, forecast_id)` — resolve o L2 de cada lado e compara.

Ou seja a lacuna real é dupla: **granularidade L2 em vez de L3** e **semântica de bloqueio em vez de sincronização**. Ambos os triggers dizem "não", nenhum diz "alinha". É isso que torna a correcção legítima um gesto de dois passos em ordem adivinhada e faz uma CTE única falhar (o trigger lê o snapshot antigo do outro lado).

## 1. Desenho — trocar validação por propagação, mantendo as funções actuais

Direcção única: **a rubrica da linha de BP manda**.

- `event_forecasts` AFTER INSERT/UPDATE OF `category_id`, `transaction_id` → nova função `sync_tx_category_from_forecast()`:
  `UPDATE transactions SET category_id = NEW.category_id WHERE id = NEW.transaction_id AND category_id IS DISTINCT FROM NEW.category_id`.
  Substitui `enforce_forecast_tx_link_l2_match` (que passa a ser dropado): mover a linha deixa de ser recusado e passa a arrastar a TX. É isto que torna o gesto único e atómico — uma só instrução `UPDATE event_forecasts …` resolve o par.
- `transactions` AFTER UPDATE OF `category_id` → `realign_tx_category_from_forecast()`: se existe forecast a reclamar a TX e a rubrica difere, reescreve a TX para a do forecast (silenciosamente, sem erro). Substitui `enforce_tx_category_l2_match`.

**Sobre L3 vs L2:** ao propagar, a comparação passa a ser de **igualdade exacta de `category_id`** — L3 exacto por construção, o que resolve os casos `2.6.08` vs `2.6.04`, `2.9.01` vs `2.9.03`, `3.1.01` vs `3.1.06`. `validate_tx_category_l2_match` deixa de ser chamada por triggers; **mantenho-a** (é lida noutros sítios/relatórios) mas sem criar versão L3 ao lado — a igualdade exacta dispensa-a.

**Alternativa que descarto:** apertar a validação para L3 e manter o bloqueio. Continuaria a exigir dois passos e a recusar correcções legítimas. Bloquear não serve quando existe uma fonte de verdade clara.

### Anti-recursão — escolha
`IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;` no topo de ambas as funções. Local, sem estado de sessão a limpar (uma flag `set_config` fica pendurada se algo falhar a meio) e ambas só precisam de reagir a escritas de nível 1. O `IS DISTINCT FROM` no `WHERE` já garante no-op quando são iguais; o `pg_trigger_depth` é o cinto de segurança.

### `event_id` NULL (Mágicos H&K)
Os triggers **não referem `event_id` em condição nenhuma** — trabalham só por `transaction_id`. As duas divergências (`22f82b45…`, `37e12a82…`) não rebentam nem são tocadas: só serão realinhadas se alguém voltar a escrever nessas linhas ou transações. **Sem backfill** nesta migração, portanto ficam como estão até decidires o `event_id`.

### Auditoria
Sem `updated_at = now()` no realinhamento automático (não é edição de utilizador). Registo em `system_audit_log` com acção `auto_realign_tx_category`, `record_id` da TX e `changes = {from, to, forecast_id, source:'trigger'}`.

## 2. Guarda de remoção — issue #59

Está em `src/components/EventForecast.tsx`:
- ~3095–3146 `matchingTransactions` (FK `directTx` + `sameCat` por rubrica/tipo + desempate `scoreDescriptionMatch` de `src/lib/bp-tx-matching.ts`);
- 3151–3161 `paidTransactions` / `unpaidTransactions`;
- ~4134 `DeleteForecastDialog` ("Remover linha aprovada"), que trava com base nesses arrays.

Foi por aqui que `c43d2f43…` entrou na linha errada: mesma rubrica + token "Digital Decor".

**Fix:** construir `claimedByOtherForecast = Set(allForecasts.filter(f => f.transaction_id && f.id !== item.id).map(f => f.transaction_id))` e excluir essas TXs de `sameCat` antes do desempate. O `directTx` da própria linha continua incluído via `mergeWithDirect`. Assim uma TX já reclamada por FK por outra linha nunca bloqueia nem aparece na linha errada.

## 3. UI — empurrar a correcção para a linha, não para a TX

Onde a transação está vinculada por FK a uma linha de BP, o campo de rubrica no `TransactionEditModal` passa a read-only com nota "Rubrica definida pela linha do BP vinculada — corrija na linha" e link para a linha. Sem isto, o realinhamento silencioso do trigger parece um bug ao utilizador.

## 4. Ressalva 1:1 (issue #29)

No cabeçalho de ambas as funções da migração e em `docs/DECISIONS.md` (secção própria, não enterrada):
> Assume vínculo **1:1** `event_forecasts.transaction_id → transactions.id`. Com a issue #29 (1 fatura → N linhas de BP, 1 linha → N transações) a rubrica da transação deixa de poder seguir uma única linha e **estes dois triggers têm de ser revistos/substituídos** pela camada de alocação.

## Fora de âmbito
Sem Publish, sem tocar nos 2 pares do Mágicos H&K, sem backfill SQL.
