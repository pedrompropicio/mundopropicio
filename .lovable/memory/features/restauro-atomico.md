---
name: Restauro completo atómico
description: Como funciona o restauro completo desde 18/09/2026 — área de carga restore_shadow, validação por SQL, troca numa única transação, e o que nunca se reinvestiga
type: feature
---

# Restauro completo atómico (#203, D-ERP89, 18/09/2026)

`supabase/functions/database-restore` (mode `restore`) já não apaga antes de inserir.

## Caminho

1. Lê o `manifest.json` (v4) e valida partes e contagens — parte em falta ou contagem
   diferente é erro. Backups v2/v3 (ficheiro único) passam pelo **mesmo** caminho: a
   diferença é só a origem das linhas e das contagens.
2. `restore_shadow_prepare(p_tables)` — uma sombra por tabela em `restore_shadow`,
   `<schema>__<tabela>`, criada com `LIKE ... INCLUDING DEFAULTS`: colunas de HOJE, sem
   constraints, sem triggers, sem índices. Sombra de uma corrida anterior é apagada.
3. `restore_shadow_load(p_table, p_rows)` — carga em lotes de 500 por RPC. Colunas que já
   não existem são removidas **aqui**, contra `information_schema` da sombra, e devolvidas
   em `unknown_cols`. Nunca por amostra de linha (era o defeito 2 da #203).
4. `restore_shadow_validate(scope, company, tables, counts)` — tudo por SQL, produção
   intacta: contagem de cada sombra = manifesto; cada FK com pai existente (na sombra do
   pai, ou na tabela de produção quando o pai está fora do backup); `company_id` diferente
   do da empresa restaurada é **erro**, nunca filtro silencioso. Falha = relatório, sombras
   ficam de pé para inspecção.
5. `restore_apply_from_shadow(scope, company, tables)` — a função **é** a transação:
   `SET CONSTRAINTS ALL DEFERRED` → ordem topológica de `pg_constraint` → `DISABLE TRIGGER
   USER` → `DELETE` por ordem inversa (por `company_id`; nunca `TRUNCATE`) → `INSERT` por
   ordem topológica com lista de colunas explícita → `SET CONSTRAINTS ALL IMMEDIATE` →
   `ENABLE TRIGGER USER`. Qualquer erro desfaz tudo, triggers incluídos.
6. Sombras apagadas (`restore_shadow_cleanup`) e linha em `backup_runs` com `scope`
   `restore` ou `restore_test`.

Corpo aceita `keep_shadow: true` e `log_scope: 'restore_test'` — só com JWT `service_role`.

## Porque as cinco chaves são adiáveis

Dois ciclos impedem qualquer ordem: `transactions`↔`event_forecasts`
(`transactions_forecast_id_fkey`, `event_forecasts_transaction_id_fkey`) e
`transactions`↔`ticket_office_settlements` (`transactions_settlement_id_fkey`,
`ticket_office_settlements_transfer_transaction_id_fkey`,
`ticket_office_settlements_venue_retained_invoice_id_fkey`). Passaram a
`DEFERRABLE INITIALLY IMMEDIATE`: o comportamento normal **não muda** — continuam a
verificar-se de imediato — só permitem o adiamento dentro da transação de restauro.
São as únicas cinco adiáveis em `public` e `crm`; se aparecer uma sexta, alguém mexeu.

## Factos de plataforma — não reinvestigar

- O papel `postgres` **não é superuser**: `set_config('session_replication_role','replica')`
  dá permission denied. O que funciona é `ALTER TABLE ... DISABLE/ENABLE TRIGGER USER`.
- `pg_safeupdate` está activo: **todo** `DELETE` dentro destas funções leva `WHERE`,
  incluindo o da tabela temporária de dependências (`WHERE true`).
- O Postgres **não deixa** religar triggers com eventos de trigger adiados pendentes
  (erro `55006`). Por isso `SET CONSTRAINTS ALL IMMEDIATE` vem **antes** do
  `ENABLE TRIGGER USER`, ao contrário do que parecia natural.
- `backup_table_inventory` exclui partições-filhas e a própria `backup_runs` — por isso o
  restauro não duplica linhas de tabelas particionadas nem apaga o seu próprio registo.
  Uma fotografia de comparação tem de usar o **mesmo** universo, senão dá diferença falsa.

## Ensaio de referência (18/09/2026)

Backup fresco da siriguella (`siriguella/2026-09-18T19-51-05`, 226 tabelas, 2.736 linhas),
fotografia por tabela (contagem + `md5(string_agg(row_to_json))`), restauro por cima dela
própria, segunda fotografia: **zero diferenças** (227 tabelas, 2.736 linhas, 17 tabelas com
linhas). Retrocesso provado com sombra corrompida (transação com `forecast_id` inexistente):
`23503` em `SET CONSTRAINTS ALL IMMEDIATE`, siriguella idêntica, 1.570 transações intactas,
24 triggers de `transactions` em `tgenabled='O'`.

A fotografia faz-se com `restore_shadow.take_snapshot(label, company_id)` e vive em
`restore_shadow._snapshot`.

## Fora deste caminho

`selective-restore` e `surgical-restore` continuam no caminho antigo (passam pela mesma área
de carga numa tarefa seguinte). Os ficheiros de storage continuam a não ser copiados (#202).
