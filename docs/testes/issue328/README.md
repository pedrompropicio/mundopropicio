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

---

## Revisão 2 (16/10, após revisão independente de 812c585) — pacote INERTE, nada aplicado

Nota de proveniência: os ficheiros de 812c585 não estavam no HEAD (commits externos 55b55a0/1f421c8 partiram de 684722c).
Foram repostos verbatim a partir de 812c585 (só docs/testes/issue328, scripts/club-sql-it, supabase/manual/20261016_issue328.*); QUADRO/estado não tocados.

### O que mudou no pacote
1. `club_from_lead_capture` (trigger AFTER UPDATE OF processed em lead_capture) entra no SQL pendente.
   Base = Live md5 `25201a26499f432c4b7e2ca6274935c2` (SELECT 16/10), igual a drizzle/migrations/0143 (baseline 14/14 prova paridade; não foi preciso snapshot à parte; snapshot #326 não alterado).
   Só mudam DECLARE (+j, st) e o bloco Crew. Guardas source/site/contacts, upsert, termos, notify (is_new + net.http_post), EXCEPTION final e trigger ficam verbatim. processed não é escrito pela função.
   Bloco Crew novo: confirmado → 1 tentativa; falha → par (código normalizado, estado, checked_at) SUBSTITUI o anterior; entra → par limpo; já na própria Crew → limpo; já noutra Crew → `already_in_crew` com código guardado. Não confirmado → novo código substitui e limpa estado antigo. Formato inválido → A-Z0-9 ≤7 + `crew_not_found`.
   Constraint de estado aceita `already_in_crew`.
2. `club_crew_pending`: `p_action` NULL → `{"error":"action"}` (antes caía em status). Verificação de ação antes de ler o membro.
   É ESCRITA (FOR UPDATE): `status` pode limpar a pendência se o membro já está na Crew do código, ou noutra Crew com estado ≠ already_in_crew. `retry` apanha exceções → estado `error`, código preservado, sem entrada parcial.
3. Rollback repõe também `club_from_lead_capture` verbatim de 0143 (md5 Live). Colunas e constraint ficam (sem DROP).

### Hashes (md5 pg_get_functiondef)
- club_upsert_member 76fb3c63… → 6050fa75bb8eb33eada23ded1be64f74
- club_confirm_member eb8ce41b… → df3a12edd179829ba9233d71fc5816b7
- club_from_lead_capture 25201a26499f432c4b7e2ca6274935c2 → 0e73d48a654ee1e3e39bd66f92bc3054
- club_crew_pending (nova) 04185aa10e84c6e44fc81ed90aa08f56 — ACL só service_role
- restantes 11 do âmbito #326: iguais a Live. Pós-reversão: 14/14 iguais a Live.
- sha256 PENDENTE e3895f1a…34ed; ROLLBACK 390429a6…8cc8c

### Bateria SQL (2 execuções, serial-results.json idêntico)
- A) baseline 14/14 = Live; egress: net 3F000, dblink 0A000.
- B) antes: defeitos 1–3 + DEFEITO 4 (confirmado + Crew cheia via formulário → código perdido) reproduzidos.
- D) serial 67/67 (inclui 21 do trigger real via UPDATE processed: feliz, cheia, novo cheio substitui, inexistente, formato inválido, novo código após falha, própria Crew, outra Crew, não confirmado, captura sem código, processed preservado, NULL recusado, retry com exceção).
- Concorrência: antes 2 asserts/1 barreira; depois 17 asserts/5 barreiras (JSON separa `asserts` de `barreiras`). Nova corrida: 3 retry + 2 status + 2 confirm + 1 retry no mesmo membro → entra 1 vez, crew 6, pendência limpa, join_confirmed sem duplicados, crew_complete 1×/membro, sessões inalteradas.
- E) reversão 14/14, créditos preservados.
- Transportes: notify cai em WARNING (schema net inexistente); sem emails.

### Patch edge (inerte): patches/issue328/
- `newgang-portal.patch` (sha256 38a69661…8eca): novo `pending.ts`; index.ts: ação `crew_pending` (rate-limit WRITE_ACTIONS, `op` z.enum), `me.pending_crew`, request_access com `eq` no email normalizado.
- `verify.sh`: extrai HEAD para /tmp, aplica, `deno check` (0 erros novos; 2 erros TS2783/TS2785 pré-existentes em wallet_sync também no HEAD), `deno test --deny-net --deny-env --deny-run --deny-write` 9/9. sha256 agregado dos originais antes = depois `8ab37d57…371f`. Prova: edge-patch-results.json / edge-patch-log.txt.
- Live: 23 membros, 0 emails não normalizados, 0 com `_`/`%` → eq exato não perde ninguém.
- Fora do patch: confirm_buyer ainda usa ilike em fever_buyers/contacts (proposta à parte).
- Não testado: handler Deno.serve completo (wiring só por typecheck + grep), CORS/origem, RPC real via PostgREST.

### Contrato frontend
- `me` → `pending_crew: null | {status, code, crew_name}`; se falhar a leitura: `pending_crew_error: "unavailable"` (mostrar nada, não bloquear).
- `crew_pending {token, op:"status"|"retry"|"dismiss"}` → 200 `{pending, joined}`; 401 no_session; 400 action; 429 rate_limited; 500 crew_pending.
- Nunca enviar member_id; é ignorado.
- Mensagens (telemóvel, curtas):
  - crew_full: "A Crew {crew_name} já está completa. Tenta outra vez mais tarde ou escolhe outra Crew." [Tentar outra vez] [Esquecer]
  - crew_not_found: "Não encontrámos a Crew com o código {code}. Confirma o código ou cria a tua." [Esquecer]
  - already_in_crew: "Já estás numa Crew. Para entrares em {crew_name}, sai primeiro da atual." [Esquecer]
  - error: "Não foi possível entrar na Crew agora. Tenta outra vez." [Tentar outra vez]
  - retry com joined=true: "Entraste na Crew!"

### Prévia de aplicação (ordem; cada passo com autorização)
1. SQL: migração versionada com o conteúdo do PENDENTE → aplicar → SELECT md5 das 4 funções = hashes acima; ACL club_crew_pending só service_role.
2. API: aplicar o patch e deploy só newgang-portal; smoke `crew_pending` sem token → 401, op inválida → 400.
3. Portal: UI conforme contrato (projeto portal, tarefa própria).
4. Publish manual do portal pelo Pedro.
Riscos: trigger agora escreve pendência para confirmados (antes perdia o código); `status` escreve; UI antiga ignora campos novos (compatível).
Rollback: passo 2 → redeploy da versão anterior; passo 1 → ROLLBACK.sql (funções antigas verbatim, sem DROP de colunas, pontos/membros intactos). Antes de reverter o SQL, reverter a edge (club_crew_pending deixa de existir).
