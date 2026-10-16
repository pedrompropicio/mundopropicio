# #328 — Correções do Clube: preparação + testes locais (NÃO aplicado em Live)

Data: 2026-10-16 (UTC) · Executor: ChatGPT · newgang-portal via agente Lovable ERP · Sem DDL/DML Live, sem deploy, sem Publish.
Preparação testada ≠ correção publicada.

## Ficheiros
- SQL pendente: `supabase/manual/20261016_issue328.PENDENTE.sql` (fora de `supabase/migrations/`, sem autodeploy).
- Reversão: `supabase/manual/20261016_issue328.ROLLBACK.sql` (funções antigas extraídas verbatim de 0120/0143).
- Runner: `bash scripts/club-sql-it/run328.sh [saida]` — `30_before328.sql`, `35_snapshot328.sql`, `40_after328.sql`, `25_conc328.sh`, `compare_patch.py`.
- Provas: `equivalencia-baseline.json`, `concurrency-before.json`, `hashes-depois-esperado.json`, `serial-results.json`, `concurrency-after.json`, `equivalencia-pos-reversao.json`, `run-log.txt`.

## Proveniência (por ordem, mesma base efémera PostgreSQL 17, socket local, só plpgsql)
A. Migrações canónicas verbatim → guard #326 contra `live-hashes.json` (não alterado): **14/14 iguais** (exit≠0 se divergir). Egress: `net` 3F000, `dblink` 0A000.
B. ANTES, funções Live: defeitos reproduzidos — telefone devolve membro antigo; crew cheia apaga `pending_crew_code`; 8 inscrições simultâneas → 1 membro e 6–7 `unique_violation` (nº varia por corrida, assert `>0`).
C. Snapshot de dados → carrega o pendente → `compare_patch.py`: alteradas exatamente `club_upsert_member`, `club_confirm_member`, `club_crew_pending` (corpo `prosrc` presente verbatim no ficheiro pendente, hash ≠ Live); as outras 12 do âmbito **iguais a Live**. 2.ª aplicação do pendente: hashes idênticos (idempotente). ACL: só `service_role`.
D. DEPOIS: serial **41/41**; concorrência **15/15** (8 inscrições mesmo email → 0 erros, 1 id; 8 confirmações → join único; última vaga com 6 confirmações pendentes → 6 confirmados +100 uma vez, crew=6, 1 entra, 5 `crew_full` com código preservado; reconfirmação simultânea sem novas tentativas).
E. Reversão → **14/14 iguais a Live** de novo; `club_crew_pending` removida; créditos inalterados; colunas mantidas.
Duas execuções consecutivas: `serial-results.json` idêntico.

## Prévia para Live
| | Antes (Live 16/10, SELECT) | Depois esperado |
|---|---|---|
| club_upsert_member(uuid,text,text,text,uuid,text,text) → uuid | 76fb3c63be8ce73f4fa408499599da1e | 6050fa75bb8eb33eada23ded1be64f74 |
| club_confirm_member(uuid) → void | eb8ce41b0a8b5c302488cc3242ab9598 | df3a12edd179829ba9233d71fc5816b7 |
| club_crew_pending(uuid,text) → jsonb (nova, service_role) | ausente | 6ee0d3d38f12067e0fce95f31bff4378 |
| club_members.pending_crew_status text + CHECK (crew_full, crew_not_found, error) | ausente | NULL em todas as linhas |
| club_members.pending_crew_checked_at timestamptz | ausente | NULL |

Live (agregados, sem PII): 22 membros, 14 créditos, 0 `pending_crew_code`, 0 grupos de telefone repetido, índice `club_members_site_email_uq (site_id, lower(trim(email)))` presente (usado pelo `ON CONFLICT`).

Instruções (só com "Sim" do Pedro): 1) SELECT acima repetido (hashes antes iguais); 2) criar migração versionada com o conteúdo exato do pendente; 3) aplicar; 4) SELECT hashes depois = tabela; ACL `club_crew_pending` só service_role; contagens 22/14 iguais; 5) Publish manual. Rollback: migração com o conteúdo do ROLLBACK; confirmar 14/14 contra `live-hashes.json`.

Compatibilidade: assinaturas e tipos de retorno iguais; ACL preservada por `CREATE OR REPLACE`; o trigger `club_from_lead_capture` e a edge `newgang-portal` funcionam sem alteração. Risco: um email novo com telefone repetido passa a criar membro novo (intencional; telefone deixa de identificar). Dados já fundidos antes não são separados nem migrados.

## Contrato recomendado para a edge/UI (próximo patch, NÃO feito)
- `me` passa a incluir `pending_crew` = `club_crew_pending(member,'status').pending` → `null` ou `{status:'crew_full'|'crew_not_found'|'error', code, crew_name}` (sem emails/tokens).
- Nova ação `crew_pending` `{op:'retry'|'dismiss'}` → `club_crew_pending(member, op)`; erros mapeados como em `crews.ts` (`no_session` 401, `action` 400). Retry só por clique explícito; UI oferece "tentar de novo", "criar crew" ou "entrar noutra".
- Testes locais com mocks (sem rede) antes de qualquer deploy.

## Limitações / NÃO validado
- RLS/Auth reais, edge `newgang-portal`, emails/welcome, Wallet, ingestão #321, crons: fora.
- Trigger: membro JÁ confirmado que reenvia formulário com crew cheia continua a perder o código (WARNING) — exige mudar `club_from_lead_capture` (proposta separada).
- `request_access` na edge usa `ilike(email)`: `_`/`%` no email funcionam como coringa (possível correspondência cruzada) — propor `eq` com email normalizado num patch de edge.
- Bónus por edição (#327) e valores de pontos não alterados.
