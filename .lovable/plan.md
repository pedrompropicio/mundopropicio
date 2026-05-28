
# Caminho A — Diff ancorado no `coala_sync_row_state`

## Objetivo

Fechar o gap entre o bootstrap (que já vincula 264/333 linhas a `forecast_id`) e o `compare`/`auto_apply`, que hoje ignoram o `row_state` e refazem matching por descrição. Após esta mudança, uma linha XLSX ancorada é sempre reconhecida como UPDATE do seu forecast (nunca missing+extra), eliminando o ciclo de duplicação.

Restrições mantidas: 0 DELETEs auto, mudança cirúrgica só em `apply-coala-bp` (fases `compare` e `auto_apply`) + escritas no `row_state`. Não tocar em `reset_reimport`, `preview`, sponsors, CRM, BE B+B, Forecast regression, IA classificadora.

---

## Ficheiros e funções a tocar

1. **`supabase/functions/apply-coala-bp/index.ts`**
   - `phase === "compare"` (linhas ~183–725): nova passagem T0 ancorada, antes do PASSO 1 agregado.
   - `phase === "auto_apply"` (linhas ~731–1130): escrita no `row_state` após cada operação.
   - Classificação de `severity` (linhas ~640–685): manter `extraInBp` em `auto`, mas marcar como "review" quando vier sem âncora E com forecast órfão sob suspeita (ver §3).

2. **`supabase/functions/sync-coala-from-drive/index.ts`** (apenas leitura/reuso)
   - Reusar `buildIdentityKey` e `buildFallbackKey` (já exportadas, ~linhas 147–172). Não alterar.
   - Confirmar que o `compare` recebe `configId` no payload (hoje o body do `apply-coala-bp` não tem `configId` para `compare`; tem em `auto_apply`). Adicionar `configId` opcional ao body do `compare` e propagar do `sync-coala-from-drive` quando dispara o compare (já passa em `auto_apply`).

3. **Sem migração SQL**. A tabela `coala_sync_row_state` já tem `forecast_id`, `identity_key`, `fallback_key`, `needs_manual_link`, `bootstrap_source`, `last_xlsx_payload`. Reaproveitamos.

---

## §1 — `compare`: matching ancorado em cascata

Nova passagem **T0 (anchor)** colocada **antes** do PASSO 1 atual (agregado por baseDesc):

1. Se `configId` ausente → fallback para o comportamento atual (sem âncoras). Garante backward-compat e cobre o caso "sem row_state ainda".
2. Carregar `coala_sync_row_state` filtrado por `config_id = configId` para um Map por `row_key` (identity ou fallback, conforme o que existir na linha).
3. Para cada `ParsedRow` da XLSX, computar `identityKey` (preferencial) ou `fallbackKey`. Procurar âncora:
   - **Âncora existe E `forecast_id` não-nulo E o forecast ainda existe em `bpRows`**:
     - `matchedFileKeys.add(fileKey)` + `matchedBpIds.add(forecast_id)` (consome dos dois lados → este forecast nunca vai a `extraInBp`).
     - Comparar `r.netAmount` vs `forecast.amount`:
       - delta ≤ 0.01 → match limpo (não entra em nenhum bucket).
       - delta > 0.01 → push em `valueMismatches` com `bpId = forecast_id`, marcar `source: "anchor"` para auditoria.
     - Comparar `normTxt(r.description)` vs `normTxt(forecast.description)`:
       - diferentes → push em `renameOnly` com `bpId = forecast_id`, `source: "anchor"`. Não dependemos do Dice ≥ 0.85: a âncora já garante identidade.
   - **Âncora existe MAS `needs_manual_link = true` (forecast_id NULL)**: ver §2.
   - **Âncora existe MAS `forecast_id` aponta para forecast já apagado**: tratar como "âncora obsoleta" → `audit.staleAnchors++`, não consome nada, cai no fallback (matching atual). No fim do compare, propor `row_state cleanup` (não executa).
   - **Sem âncora** (linha XLSX nova nesta sync): cai no matching atual a partir do PASSO 1.

4. **Fallback (matching atual descrição/Dice/agregação)** corre apenas sobre `fileRows` não-consumidos e `bpRows` não-marcados. Os Sets `matchedFileKeys`/`matchedBpIds` já existem e bastam.

5. **Stats novas no response do `compare`**: `anchoredMatches`, `anchoredValueMismatches`, `anchoredRenames`, `staleAnchors`, `pendingManualLink` (ver §2), `fallbackMatched`.

---

## §2 — Neutralizar `needs_manual_link`

Linhas com `needs_manual_link = true` no `row_state` (no bootstrap atual: 58 `orphan_value_candidate` + 6 `ambiguous_*`):

1. **Lado XLSX**: a linha é marcada como "pendingManualLink" e:
   - `matchedFileKeys.add(fileKey)` (não vai a `missingInBp` → não cria duplicado).
   - **NÃO** consome nenhum forecast (não toca em `matchedBpIds`).
   - Push num novo bucket `pendingManualLink: [{ rowNumber, description, netAmount, candidates: row_state.candidates }]` devolvido pelo compare. Severity sempre `"review"` (nunca `"auto"`).

2. **Lado BP**: os forecasts "candidatos" desta linha (lidos do `row_state.candidates` se persistido, ou re-derivados por valor±10% + cents igual) são marcados num Set `suspectedOrphanFcIds`. Esses forecasts:
   - **NÃO** podem ir a `extraInBp` com severity `auto`. Se sobrarem (não matched no fallback), entram em `extraInBp` com severity `"review"` e flag `reason: "candidate-of-pendingManualLink"`.

3. UI de resolução em lote (fora do scope deste plano; já planeada) consome `pendingManualLink` + `extraInBp[severity=review, reason=candidate-of-...]`.

**Resultado**: nem insert, nem delete, nem update sobre estes 64 itens até o Pedro resolver.

---

## §3 — `extraInBp` e DELETEs com âncoras

Hoje qualquer forecast não-matched vira `extraInBp` severity `"auto"`, protegido só por `safeMode maxAutoDeletes=0` (que aborta o auto_apply inteiro). Com âncoras:

1. Um forecast só é candidato a `extraInBp` **auto** se:
   - Não tem âncora a apontar para si no `row_state` (ou seja, nenhuma linha XLSX o reclama via identity/fallback), E
   - Não está em `suspectedOrphanFcIds` (§2), E
   - Não está `protectedFcIds` (sponsorship).

2. Caso contrário, severity = `"review"`.

3. **Mantém-se a decisão Pedro**: `maxAutoDeletes=0` por default → qualquer `extraInBp` mesmo `auto` continua a bloquear `auto_apply` via `safeMode`. As âncoras servem para **reduzir o número** de extraInBp falsos (já não aparecem os que estão ancorados em linhas XLSX renomeadas/com valor diferente), tornando o trabalho manual realista.

4. Métrica nova: `extraInBp.bySource = { unanchored, suspectedOrphan, protected }`.

---

## §4 — Manter o `row_state` no `auto_apply`

Após cada operação bem-sucedida em `auto_apply`, escrever no `row_state` (upsert por `(config_id, row_key)`):

1. **`missingInBp` (auto) → INSERT forecast novo** (linhas 871–887):
   - Calcular `row_key` da `ParsedRow r` (identity ou fallback).
   - Upsert: `forecast_id = newFc.id`, `bootstrap_source = "auto_apply_insert"`, `needs_manual_link = false`, `last_xlsx_payload = {…r}`, `last_apply_hash = hash(description|cents|paymentDate)`.

2. **`valueMismatches` (auto) → UPDATE amount** (linhas 926–946):
   - Se a linha veio com `source: "anchor"`, a âncora já existe; só actualizar `last_xlsx_payload` + `last_apply_hash`.
   - Se veio via fallback descrição/Dice, fazer upsert para ancorar pela primeira vez (`bootstrap_source = "auto_apply_value"`).

3. **`renameOnly` (auto) → UPDATE description** (linhas 948–964):
   - Idem ponto 2 (`bootstrap_source = "auto_apply_rename"` quando via fallback).

4. **`extraInBp` (auto) → DELETE forecast**: como `maxAutoDeletes=0` bloqueia hoje e mantém-se, não há código a alterar aqui agora. Se algum dia o cap subir, adicionar: upsert `forecast_id = NULL`, `bootstrap_source = "auto_apply_deleted"`, ou apagar a linha do `row_state`. Documentar como TODO.

5. **Transação**: cada operação já é atómica por linha. Não usamos transação global porque o código actual também não usa. Se a escrita no `row_state` falhar, registar em `audit.errors` mas **não reverter** a operação no forecast — o pior caso é uma âncora em falta que o próximo bootstrap recupera.

6. **Helper local** `upsertRowAnchor(r, forecastId, source)` para evitar repetição (uma vez por bloco).

---

## §5 — Ordem de deploy

1. **Comitar o bootstrap em Live** (PASSO 2 do `scripts/coala-bootstrap-live.txt`). Popular `row_state` com as 333 linhas (264 ancoradas + 64 needs_manual_link + 2 no_match + 3 ambiguous).
2. **Validar** com a query final do script (`vinculados`, `needs_manual_link`, etc.).
3. **Verificar safeMode em todas as `coala_sync_config`**: `maxAutoDeletes=0` (cron deve dispará-lo já assim). Confirmar via SQL antes do deploy.
4. **Deploy do código novo** (`apply-coala-bp`). Auto-deploy chega a Test; **Publish manual** para Live.
5. **Smoke test em Live**: disparar `phase:"compare"` com `configId` no run base atual. Esperado: das 37 `extraInBp` que tínhamos, ≤5 ficam (só as 2 no_match + eventuais staleAnchors); ~14 renomeações viram `renameOnly` `source:"anchor"`; valores diferentes viram `valueMismatches` `source:"anchor"`.
6. Se as métricas baterem, deixar o cron correr `dry_run` normalmente. **NÃO** subir `maxAutoDeletes` — fica 0.
7. UI de resolução de `pendingManualLink` fica para iteração seguinte (fora deste plano).

**Janela crítica entre 1 e 4**: o `auto_apply` antigo continua a correr com a lógica velha. Como o `safeMode` já está em 0, qualquer `extraInBp` bloqueia. Risco real só existe para `missingInBp` (insert duplicado). Mitigação: pausar o cron `coala-sync-auto` enquanto se faz o deploy (1 SQL `UPDATE cron.job SET active=false` + reativar no fim).

---

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Âncora aponta para forecast apagado fora do sync (staleAnchor) | T0 detecta e cai no fallback; conta em `staleAnchors`; não consome BP. |
| `configId` não chega ao `compare` em call-sites legados | Fallback: sem configId → comportamento antigo (sem regressão). |
| Escrita no row_state no `auto_apply` falha → âncora não fica | Registado em `audit.errors`; bootstrap idempotente recupera no run seguinte. |
| `suspectedOrphanFcIds` é estimado a partir de `row_state.candidates` que pode não estar persistido | Re-derivar in-flight: forecasts não-matched cujo `cents` bate exato ou ±10% com alguma `pendingManualLink` row. |
| Bootstrap não corrido antes do deploy | Sem âncoras o T0 não consome nada e o fallback antigo corre integral. Comportamento idêntico ao atual — não há regressão. |
| Race entre dois `auto_apply` concorrentes a escrever no mesmo `row_key` | Upsert por `(config_id, row_key)` é atómico no Postgres; última escrita ganha (aceitável: ambas escrevem o mesmo forecast_id se vieram da mesma XLSX). |
| `safeMode` deixa de proteger se alguém subir `maxAutoDeletes` | Manter `0` como invariant; adicionar comment-warning no body do `auto_apply`. |

---

## Fora de scope (explicitamente)

- UI de resolução em lote de `pendingManualLink`.
- Limpeza automática de `staleAnchors` no `row_state`.
- Alterações em `reset_reimport`, `preview`, sponsors, IA classificadora, BE B+B, Forecast regression.
- Subir `maxAutoDeletes` ou mexer no fluxo de DELETE.
- CRM / MP Audience.

---

## Validação pós-deploy

1. `dry_run` em Live no `configId` Coala. Comparar contadores:
   - `anchoredMatches` ≈ 264 (bootstrap auto-vinculados).
   - `pendingManualLink` ≈ 64.
   - `no_match`/genuíno → entra em `missingInBp` ≈ 2.
   - `extraInBp` cai de 37 → ≤5.
2. Correr `dry_run` 2× consecutivos. Diff deve estabilizar (idempotência).
3. Inspecionar `coala_sync_row_state` após um `auto_apply` real (forçado em Test): novos forecasts inseridos têm `forecast_id` populado e `bootstrap_source = "auto_apply_insert"`.

