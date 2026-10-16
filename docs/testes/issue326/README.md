# #326 — Testes integrados de SQL real do Clube (base local descartável)

Data: 2026-10-16 (UTC) · Executor: ChatGPT · newgang-portal via agente Lovable · Sem Live, sem deploy, sem Publish.

## Como correr
`bash scripts/club-sql-it/run.sh [pasta_saida]` (por omissão escreve aqui). Termina com código ≠ 0 em qualquer assert falhado.

## Runtime
- PostgreSQL 17.9 (binários locais do sandbox), copiados para uma instalação privada temporária só com `plpgsql` (sem dblink/postgres_fdw nem outras extensões).
- `initdb` + `pg_ctl` num diretório `mktemp`; `listen_addresses=''` (sem TCP), só socket Unix nesse diretório; apagado no fim (`trap`).
- Corre como utilizador sem privilégios (uid 1000) quando lançado como root.
- Sem dependências novas no package.json.

## Fonte das funções e equivalência
- Aplicadas verbatim: `drizzle/migrations/` 0119, 0120, 0140, 0141, 0142, 0143 (sha256 em `run-log.txt`).
- Snapshot Live lido por `SELECT md5(pg_get_functiondef(oid))` (sem dados pessoais) em `scripts/club-sql-it/live-hashes.json`.
- `equivalencia.json`: as 14 funções do âmbito (club_award, club_award_fixed, club_confirm_member, club_crew_cfg/check/create/gen_code/join/leave/name_ok, club_upsert_member, club_gen_referral_code, club_from_lead_capture, club_record_terms) têm md5 **igual** a Live.
- Tabelas: vêm das mesmas migrações; paridade de colunas/índices com Live **não** comparada por hash.

## Stubs de borda (scripts/club-sql-it/00_stubs.sql)
Papéis anon/authenticated/service_role; `auth.uid()/auth.role()` por GUC; `has_role`, `row_belongs_to_current_company`, `current_company_id` → false/NULL; tabelas mínimas companies, events, event_lineups, event_marketing, contacts, fever_buyers, lead_capture; `storage.objects`/`storage.foldername` só para as policies de 0141 compilarem. Nenhum stub substitui o motor de pontos/crews.

## Egress bloqueado (05_egress.sql)
- 0 extensões além de plpgsql; 0 instaláveis; sem schemas net/cron/vault/extensions/supabase_functions; `listen_addresses` vazio.
- Tentativa efetiva: `net.http_post(...)` → erro 3F000; `CREATE EXTENSION dblink` → 0A000.
- Trigger real do Clube: `notify` cai em `WARNING ... schema "net" does not exist` (nenhum pedido sai).
- Runner remove do ambiente DATABASE_URL/SUPABASE_URL/SUPABASE_DB_URL/SUPABASE_SERVICE_ROLE_KEY/PG* (valores nunca impressos) e aborta se PGHOST não for o socket temporário.

## Resultados
- Serial (`serial-results.json`): **64/64** asserts — indicação (+100 próprio / +150 convidador, idempotência, existente não muda ref, autoindicação, código inválido, telefone), Crew (criador conta, 2/3 incompleta, 4.º completa → 200 a cada, 5.º/6.º uma vez, 7.º `crew_full`, duplicação, check repetido), saída/reentrada/mudança/dono, captura `lead_capture` → trigger (par ref+crew pendente até confirmar), invariantes.
- Concorrência real (`concurrency-results.json`): 8 ligações independentes, barreira por `LOCK ACCESS EXCLUSIVE` em club_members com confirmação em `pg_locks` (N/N à espera) antes de soltar. **17/17**:
  - C1 última vaga: 6 candidatos → 1 entra, 5 `crew_full`, crew = 6, bónus 6.
  - C2 4.º confirmado em corrida (3 entradas simultâneas): completa uma vez, 6 bónus sem duplicados.
  - C3 8 confirmações simultâneas: 0 erros, join_confirmed 1×, friend_joined 1×.
  - C4 8 inscrições simultâneas do mesmo email: 1 membro; 7 ligações recebem `unique_violation`.
- Duas execuções consecutivas iguais (determinístico).

## Descobertas (não corrigidas — propostas)
1. **Inscrição concorrente do mesmo email devolve erro** (C4: 7/8 `unique_violation` em vez do id existente). No trigger fica só WARNING; chamadores diretos veem erro. Proposta: em `club_upsert_member`, repetir a procura depois do `pg_advisory_xact_lock` (ou `INSERT ... ON CONFLICT` no índice email) e devolver o id existente.
2. **Mudar de Crew volta a dar o bónus** (regra atual, ref = crew): um membro pode somar `crew_complete` por cada crew que complete. Limite por edição exige decisão do Pedro (#327).
3. **Crew cheia ao confirmar**: o código pendente é apagado sem aviso ao membro (só WARNING); fica sem crew.
4. **Correspondência por telefone**: email novo com telefone já existente devolve o membro antigo (não cria nem muda ref).
5. Membro que entra numa crew já completa recebe os 200 (regra atual, documentada).

## NÃO validado
RLS e Auth reais (stubs), grants em Live, storage/buckets, edge function `newgang-portal`, envio de emails/welcome reservations, Wallet, `crm_ingest_*` (#321) e cron, missões/anulações (só carregadas), paridade de tabelas com Live, CI geral (este runner não está no workflow).
