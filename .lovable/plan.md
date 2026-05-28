
# Fix matching de identidade — sync Coala

## Diagnóstico do código atual

### 1. Como `row_key` é gerado hoje
`supabase/functions/sync-coala-from-drive/index.ts:136-148`

```ts
const buildRowKey = (r) => [
  norm(r.description),     // ← muda quando se acrescenta "3ª parcela"
  moneyKey(r.netAmount),   // ← muda quando se separa em parcelas
  norm(r.supplier ?? ""),
  norm(r.invoiceRef ?? ""),
  r.paymentDate ?? "",     // ← muda quando se preenche/edita data
  r.dueDate ?? "",
].join("|");
```

**Confirmado**: qualquer edição na descrição (sufixo de parcela, correção de tipo), no valor (split em parcelas), ou na data ⇒ row_key diferente ⇒ a mesma linha conceptual aparece como `extraInBp` (antiga, a remover) + `missingInBp`/INSERT (nova). É exatamente o padrão das 37 `extraInBp` que recolheste.

### 2. Porque `coala_sync_row_state` está vazio
- Só é escrita em `mode === "apply"` (linhas 535-548 do `sync-coala-from-drive`). Os crons que correm só fazem `dry_run` → nunca escrevem.
- Mesmo na via apply, o INSERT **não preenche `forecast_id`** (coluna existe mas é sempre `NULL`). Logo nunca existiu âncora `row_key → forecast_id`.
- `apply-coala-bp` (phase `compare` e `auto_apply`) **ignora completamente** `coala_sync_row_state` — recalcula tudo por matching ad-hoc (`normTxt(description)|moneyKey(amount)` + agregação por `baseDesc` + Dice fuzzy). Não há continuidade entre execuções.

### 3. Quem produz `extraInBp`/`missingInBp`/`renameOnly`
`apply-coala-bp/index.ts:236-410`. Matching em 3 passos, todos baseados em descrição/valor — sem identidade persistida.

## Campos disponíveis no parser para identidade estável
`ParsedRow` (coalaParser.ts:39-67): `rowNumber` (1-indexed do XLSX), `rawCC`, `rawCenterCusto`, `supplier`, `invoiceRef`, `netAmount`, `paymentDate`, `dueDate`, `description`. **Não existe** um "Código" único por linha — `rowNumber` é o ID natural mais próximo, mas instável a inserções/reordenações na planilha.

---

## Plano de implementação (faseado, sem aplicar ainda)

### Fase 1 — Identity Key estável (multi-campo) e persistência sempre

**Ficheiros**: `sync-coala-from-drive/index.ts`, migração SQL.

1. Substituir `buildRowKey` por dois identificadores complementares:
   - `identityKey` (forte, baseado em fatura): `norm(supplier) + "::" + norm(invoiceRef)` quando ambos existem e `invoiceRef` é não-trivial. Usa-se como chave primária de identidade quando disponível.
   - `fallbackKey` (posicional + semântico): `rowNumber + "::" + norm(rawCenterCusto) + "::" + norm(supplier) + "::" + moneyBucket(netAmount, 5%)` para linhas sem fatura. `moneyBucket` arredonda para janelas de ±5% para tolerar splits em parcelas.
   - `legacyKey` (o atual, descrição+valor+data+supplier+invoice+due): mantém-se **só para migração one-shot** do estado existente.

2. Estender `coala_sync_row_state`:
   ```sql
   ALTER TABLE coala_sync_row_state
     ADD COLUMN identity_key text,
     ADD COLUMN fallback_key text,
     ADD COLUMN legacy_key text,
     ADD COLUMN row_number int,
     ADD COLUMN supplier_norm text,
     ADD COLUMN invoice_ref_norm text,
     ADD COLUMN center_custo_norm text,
     ADD COLUMN net_amount_cents bigint;
   CREATE INDEX ON coala_sync_row_state (config_id, identity_key);
   CREATE INDEX ON coala_sync_row_state (config_id, fallback_key);
   CREATE INDEX ON coala_sync_row_state (config_id, supplier_norm, net_amount_cents);
   ```

3. Persistir `row_state` **em todos os modos que avançam** (`apply` e `auto_apply`), nunca só em `dry_run`. Continua a não persistir em `dry_run` puro (read-only).

### Fase 2 — Bootstrap one-shot do `row_state` para o Coala atual

Sem `row_state`, o primeiro sync depois do deploy continuaria a ver tudo como "novo". Edge function nova `coala-sync-bootstrap` (admin-only, dry-run + commit):

1. Para cada config ativa: baixa o XLSX atual do Drive, faz `parseCoalaXlsx`.
2. Carrega todos os `event_forecasts` do evento (tipo `expense`, não-sponsorship).
3. Faz matching agressivo (descrição exata > base description > Dice ≥ 0.85 + valor exato) para encontrar `forecast_id` para cada linha da planilha.
4. Devolve relatório: matched / ambíguos / órfãos.
5. Em modo commit, popula `coala_sync_row_state` com `forecast_id`, `identity_key`, `fallback_key`, `legacy_key`, `last_xlsx_payload`.
6. Os ambíguos ficam para revisão manual numa UI mínima (Fase 4) ou via SQL.

### Fase 3 — Matching em cascata em `apply-coala-bp` (phase `compare` e `auto_apply`)

Refactor de `apply-coala-bp/index.ts:236-410`. Em vez de matching baseado só em descrição/valor:

1. **Carregar `row_state`** para o evento/config (passar `configId` no payload do compare; quando absent, fallback para o comportamento atual).
2. **Tier 1 — match exato por identidade persistida**: se `row_state[identityKey].forecast_id` existe ⇒ ligação direta. Compara só valor/descrição para classificar como `unchanged` | `valueMismatch` | `renameOnly`.
3. **Tier 2 — fuzzy fallback**:
   - Sub-tier 2a: `identityKey` (supplier+invoice) novo, mas existe `forecast` com `supplier+invoice` iguais ⇒ assume mesma linha, reclassifica e atualiza row_state.
   - Sub-tier 2b: scoring por `supplier` (peso 0.4) + `centerCusto` (0.2) + `valor` em janela ±10% (0.3) + Dice descrição (0.1). Score ≥ 0.7 ⇒ `renameOnly`/`valueMismatch`. Score 0.5–0.7 ⇒ `needs_review` com top-3 candidatos (já existente).
4. **Tier 3 — split detection** (1 forecast → N rows na planilha): se houver N linhas com mesmo `supplier+centerCusto` cujo somatório bate ±2% num forecast existente, classifica `splitPending` (já existe lógica `findSumCombination`, mas ancora ao `forecast_id` via row_state em vez de re-fazer match).
5. **Tier 4 — só agora `INSERT/DELETE`**: missing → INSERT novo forecast; extraInBp → DELETE (com guard: só se o forecast não está protegido por sponsorship/manual_override e não tem TX já liquidada — o último ponto já existe).

### Fase 4 — Idempotência e garantias

1. Após cada `apply`/`auto_apply` bem-sucedido, fazer **UPSERT** completo de `coala_sync_row_state` (não DELETE+INSERT como hoje, para não perder `forecast_id` em runs concorrentes). Preencher `forecast_id` sempre.
2. Adicionar `coala_sync_row_state.last_apply_hash` (jsonb hash de description+amount+date) para detetar mudanças sem reparsing.
3. Em `compare`, qualquer linha cujo `identity_key` e payload são iguais ao `last_xlsx_payload` ⇒ skip ⇒ não entra em nenhum dos buckets de diff. Idempotência garantida.

### Fase 5 — Guard contra DELETE em massa durante transição

Antes da Fase 2 (bootstrap) correr, o `compare` continuará a produzir `extraInBp` grandes. Mitigação:

1. Adicionar flag `safeMode` em `apply-coala-bp` (default ON). Em `safeMode`, recusa qualquer `auto_apply`/`apply` se `extraInBp.length > maxAutoDeletes` (sugiro 5) ou se ratio `extraInBp/totalBpRows > 10%` ⇒ devolve status `blocked` com motivo.
2. UI de revisão mostra warning explícito quando `safeMode` bloqueia.
3. Cron desliga automaticamente `auto_apply` para a config quando `safeMode` dispara 2× consecutivos.

---

## Estratégia de teste

1. **Teste de idempotência** (vitest + edge):
   - Seed: 5 forecasts, planilha com as mesmas 5 linhas.
   - Correr `dry_run` 3×, depois `apply`, depois `dry_run` 3×. Asserção: 2º `dry_run` em diante ⇒ diff vazio.

2. **Teste de renomeação**:
   - Forecast "Slow J" €30k. Planilha passa a "Slow J - 3ª parcela" €30k mesmo supplier. Asserção: `renameOnly` 1 entrada com mesmo `bpId`, `extraInBp` vazio.

3. **Teste de split em parcelas**:
   - Forecast "João Gomes" €60k. Planilha vira 3× "João Gomes - parcela N" €20k cada. Asserção: `splitPending` 1 entrada com `bpId` correto + 3 children; após apply, 3 forecasts novos com mesma category/supplier, original deletado.

4. **Teste de bootstrap**:
   - DB com 100 forecasts, 0 row_state. Correr `coala-sync-bootstrap`. Asserção: ≥95% matched, relatório enumera órfãos.

5. **Teste de safeMode**:
   - Forçar 20 `extraInBp`. Asserção: `apply` recusa com `blocked: safeMode_threshold`.

6. **Smoke em Live (read-only)**:
   - Após deploy + bootstrap, correr `dry_run` no run `104e3a21-…`. Esperado: das 37 `extraInBp` atuais, ≤3 ficam (só as despesas 2025 obsoletas legítimas); os ~14 renomeados viram `renameOnly`; os ~17 parcelados viram `splitPending` ou matched.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Bootstrap mapeia errado e perde linhas legítimas | Bootstrap nunca apaga; só popula row_state. Apply só age após Pedro aprovar diff em UI. |
| `auto_apply` apaga em massa antes do bootstrap | Fase 5 `safeMode` ON por default + cron auto-desliga após 2 bloqueios. |
| `invoiceRef` repetido entre fornecedores diferentes | `identityKey = supplier+invoiceRef` (nunca só invoice). |
| Reordenação da planilha invalida `fallbackKey` posicional | `identityKey` (supplier+invoice) tem prioridade; fallback tem `supplier+centerCusto+netAmount` na chave, não só `rowNumber`. |
| Splits com valores não-uniformes não detetados | `findSumCombination` já existe; ancorar ao `forecast_id` via row_state melhora precisão. |
| `coala_sync_row_state` corrompida por run falhado a meio | UPSERT por `(config_id, identity_key)` + transação por run; rollback no catch. |

---

## Ordem de execução proposta

1. Migração SQL (colunas + índices em `coala_sync_row_state`).
2. Refactor `buildRowKey` + escrita sempre + `forecast_id` populado em `sync-coala-from-drive`.
3. Edge `coala-sync-bootstrap` + correr em Live com `dry_run` → rever relatório → commit.
4. Refactor matching em cascata em `apply-coala-bp` (compare + auto_apply).
5. `safeMode` + auto-disable do cron.
6. Suite de testes vitest dedicada.
7. Correr `dry_run` em Live no run `104e3a21-…` e validar redução das 37 `extraInBp`.

**Sem mexer**: BE B+B, IA classificadora, regressão Forecast.

---

## Decisões em aberto (precisam Pedro)

1. **`maxAutoDeletes` em `safeMode`**: 5 (sugerido) | 10 | 0 (qualquer delete vai para review).
2. **`identityKey` quando `invoiceRef` está vazio**: usar `supplier+centerCusto+valor+rowNumber` (sugerido) ou exigir review manual da linha?
3. **Bootstrap ambíguos** (forecast com 2+ candidatos com score igual): auto-escolher o de menor `rowNumber` ou marcar todos como `needs_manual_link`?
4. **Janela `±10%` no Tier 2b**: confortável ou queres apertar para `±5%`?
