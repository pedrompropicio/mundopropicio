# Ajuste D-ERP288 — linha de BP como tecto, cachê fechado e adiantamentos

Nota: `docs/questoes-cache-contratos-20261020.md` não existe no repositório (gitignored e não gravado nesta sessão). O plano baseia-se na memória `cache-payment-contracts.md`, em D-ERP288 e na migração 0214.

## Respostas às perguntas

**"Cachê fechado" hoje** — o botão "Fechar Cachê" (`CacheSettlementPanel`) grava:
- evento simples / cachê no próprio evento: `event_cache_configs.is_finalized = true` + `real_amount` (snapshot) + `finalized_at/by`;
- turnê com cachê por cidade: `event_cache_city_settlements(cache_config_id, event_id).is_finalized = true` + `real_amount`.
A linha `cache_module` do BP é depois sincronizada com esse valor (`useSyncCacheForecasts`).
Validação na RPC: para cada cidade cuja linha venha de um cachê configurado, exigir `is_finalized` em `event_cache_city_settlements` da cidade OU, se não existir linha de cidade, em `event_cache_configs` da config. Qualquer cidade configurada não fechada → `cache_nao_fechado`.

**"Evento em fecho" hoje** — não existe um estado próprio. `events.status` só tem `planning → confirmed → active → completed`. Proposta (decisão do Pedro): **em fecho = `status = 'active'` e data do evento (última data das cidades) já passada**; `completed` = fechado (não oferece legados); `planning/confirmed` = antes do evento (também não oferece). Alternativa: em fecho = qualquer estado diferente de `completed`.

**Regra 3** — confirmado no código: `add_cache_contract_advance` exige contrato existente, não cancelado, com mãe de saldo e valor ≤ saldo − pago (também por cidade). Mantém-se sem alterações.

## (a) Alterações às RPCs (nova migração aditiva `0216`, só `CREATE OR REPLACE`)

1. `_cache_cities(p_root, p_artist)` — por cidade, escolhe a linha de BP de cachê:
   - preferência: linha `cache_module` ligada a `event_cache_configs` do artista (comportamento atual);
   - senão: linha de BP ativa (`version_id IS NULL`) da categoria 2.1.01 do evento com `supplier_id`/responsável = artista; se não houver fornecedor na linha, a única linha 2.1.01 da cidade.
   - Devolve colunas novas `source` (`config`|`bp`) e `cache_config_id` (nula em `bp`). Tecto da cidade = `amount` da linha.
   - Duas linhas candidatas na mesma cidade continuam → `linha_cache_duplicada`.
   - Assinatura de retorno muda → `DROP FUNCTION` + recriação dentro da mesma migração (função interna, sem chamadores externos; reaplicar `REVOKE`).
2. `_cache_create_contract` — depois de obter as cidades: se alguma cidade tem `source='config'` e o cachê não está fechado → `cache_nao_fechado`. Cidades `source='bp'` não exigem fecho. Resto inalterado.
3. `_cache_free_advances` — o ramo legado (sem `cache_role`) só devolve linhas se o evento raiz estiver "em fecho" (critério acima); criado helper `_cache_event_in_closing(p_root)`.
4. `create_cache_advance` — recusa com `cache_ja_fechado` se qualquer cidade `source='config'` estiver fechada (aí só `add_cache_contract_advance`). Para cidades só `bp`, mantém-se a regra atual (livre até ao restante por contratar; depois de existir contrato, só dentro dele).
5. `cache_contract_context` — passa a usar `_cache_cities` (linha BP sem config) e devolve `cache_finalized`, `in_closing` e `source` por cidade, para a UI esconder/mostrar botões.

Sem DML, sem backfill, sem tocar em `transactions` existentes nem no lote da #323.

## (b) Novos códigos e mensagens (pt-PT)

- `cache_nao_fechado` — "Feche primeiro o cachê no modal (botão «Fechar Cachê»); só depois pode criar o contrato de pagamento."
- `cache_ja_fechado` — "O cachê já está fechado: lance o adiantamento dentro de um contrato."
- `sem_linha_cache` (texto revisto) — "Não há linha de cachê (2.1.01) no BP desta cidade. Crie-a no BP ou configure o cachê."
- UI (`CacheContractsPanel`): mapa código→mensagem; botão "Novo contrato" desativado com aviso quando `cache_finalized=false` numa cidade configurada; "Adiantamento livre" escondido após fecho; secção "Adiantamentos sem contrato" só se `in_closing`.

## (c) Testes

- PG descartável (`supabase/tests/cache_contracts/`): estender `stub.sql` (colunas `is_finalized`, `event_cache_city_settlements`, `events.status`, `supplier_id` em forecasts) e `scenarios.sql`:
  - evento sem config com linha 2.1.01 → contrato criado, tecto = linha;
  - config não fechada → `cache_nao_fechado`; fechada → passa; turnê com uma cidade por fechar → recusa;
  - `create_cache_advance` após fecho → `cache_ja_fechado`; `add_cache_contract_advance` continua a funcionar;
  - legado oferecido com evento `active` e data passada; não oferecido em `completed` nem antes da data;
  - duas linhas 2.1.01 na cidade → `linha_cache_duplicada`.
- Vitest: mapa de mensagens dos novos códigos e gating dos botões (lógica pura em `cache-contracts.ts`).

## (d) Índice de memória

Correr `node scripts/gen-memory-index.mjs` para registar `features/cache-payment-contracts.md`; correr `src/test/memory-index.test.ts`.

## (e) Teste checkpoint66

Em `src/test/issue333-checkpoint66.test.ts`, só aumentar o timeout (ex.: `{ timeout: 20000 }` no `describe`/`it` afetado). Sem mudar lógica.

## (f) Documentação

- D-ERP288: adenda "Ajuste 20/10/2026" com as três regras, códigos novos e critério de "em fecho".
- Memória `cache-payment-contracts.md`: tecto = linha BP 2.1.01; contrato só após cachê fechado quando configurado; adiantamento livre só antes do fecho; legados só em fecho.
- Estado financeiro (`docs/estado/estado-fecho-e-socios.md`) e `docs/questoes-cache-contratos-<data>.md` com as questões abertas.

## Limites

Sem DDL de tabela/colunas (apenas substituição de funções), sem DML, sem Publish, nada da #323. Verificação final: `tsgo`, Vitest completo, PG local; CI no commit.

## Questões para o Pedro

1. Critério de "evento em fecho": `active` + data passada (recomendado) ou "não `completed`"?
2. Linha 2.1.01 sem config: identificar o artista pelo fornecedor da linha (recomendado) ou aceitar qualquer linha 2.1.01 única da cidade?
3. A substituição de funções em `0216` conta como "sem DDL"? Se não, fica como SQL INERTE em `supabase/manual/` até autorização.
