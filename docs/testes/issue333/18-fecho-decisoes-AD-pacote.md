# #333 — fecho da preparação: decisões A–D, gate fechado e pacote para autorização

Gate: HEAD 7be0095f = GitHub; ancestralidade da entrega 7be0095f exit0; checkout limpo; escritor único, sem subagentes. Zero Live/DDL/DML/config/bucket/migração/deploy/Publish/ativação/provider. Fontes ativas (scanner, edição, ingest, core) intactas.

## Decisões aprovadas por Pedro (17/10/2026 17:01 Fortaleza) — regras, não voltar a perguntar
- A. IVA > total: tentativa técnica persistida em `review` (`review_reason=iva_exceeds_total`); authorize/begin/commit não mudam estado nem fazem INSERT/UPDATE financeiro. Nada corrigido/adivinhado. Outros itens independentes mantêm o seu estado; não há "sucesso total".
- B. Clientes antigos: migração gradual. Ramo antigo sem ID mantém contrato/FX/permissões e moedas EUR/USD/BRL/GBP; estado explícito `legacy_untracked`, sem garantia global. Sem corte obrigatório nem deny silencioso (fontes ativas não alteradas).
- C. Nova intenção com os mesmos dados: só pela ação tipada `confirm_new_intent` do owner autenticado (mesma empresa/operação/hash), sobre tentativa anterior `completed` e a mais recente. Grava `intent_seq`, `prior_attempt_id`, `intent_confirmed_at`, `intent_confirmation_hash` (sha256 de prior/hash/seq/principal). UUID novo, storage limpo ou novo envelope igual = retry (devolve a mesma tentativa). Anterior inprogress/unknown/review → recusa 40001 (só conferência). NIF+número fortes completos → 23505 (nunca "confirmar segunda"). Edição (`accountant_edit`) e ingest não têm esta ação.
- D. Chave forte `standalone_strong_key_333`: `translate(btrim(x,' '), a-z→A-Z) COLLATE "C"`, vazio→NULL. Preserva separadores, barras, hífens, prefixos, zeros e não-ASCII. Mesma definição que `20261017_issue333_normalized_uniqueness.PROPOSTA.sql`. Duplicado forte existente no commit → `review` (`strong_duplicate`), sem INSERT. NULL/vazios continuam opcionais. Ambíguos só revisão.

## Bloqueador corrigido: ativação CLOSED-BY-DEFAULT no servidor
- `standalone_attempt_settings_333(operation PK, enabled default false)`: REVOKE total a PUBLIC/anon/authenticated/service_role; RLS ligada; o SQL NÃO tem linha ativadora.
- `standalone_attempt_gate_333(op)` (SECDEF, sem EXECUTE a ninguém): sem linha ⇒ false.
- Verificado em `standalone_attempt_internal_333` antes de qualquer prepare/authorize/begin/commit/confirm (cobre RPC browser, wrapper service-role de ingest e wrapper do assistente) e RELIDO após o lock da linha, imediatamente antes da mutação. `check` e `standalone_attempt_list_333` ficam read-only para recuperação.
- Chaves separadas por operação: v1 (`scanner_create`, `accountant_edit`, `ingest_create`) e v2 (`assistant_create`) ativáveis independentemente.
- Endpoint candidato: `review` → 409 `{status:'revisao',reason}` antes de qualquer cópia/recibo; o gate SQL fecha antes do upload porque authorize/begin falham primeiro.

## Provas (cópia isolada, 14 destinos reais + config inerte) — outputs integrais em 19
apply/tsgo/Deno offline/build: exit0 (6220 módulos). Integrados 38, entrada/preflight Chromium 7, PostgreSQL real pgcrypto/2 ligações 67 (60→67), handler 20, geral 1334 (1 skip/11 todo preexistentes). Sem skips novos nem guard relaxado. Ativação `true` só em fixture SQL local.
Novos PG: gate ausente e false → zero reservas/escritas (browser e service), check continua; gate fechado durante espera do lock → 42501 e zero fatura; sem privilégio em settings/gate; A; C (retry vs confirmação, owner, unknown, duplicado forte); D (caixa/espaço iguais; `FT1/23`≠`FT12/3`, `/`≠`-`, zero/prefixo distintos; NULL/vazios). O teste antigo "colisão 23505" passou a esperar `review strong_duplicate` (decisão D); 23505 de corrida continua coberto pela suíte do índice exato.
Nota de ambiente: o sandbox novo não tinha o uid 65534 em /etc/passwd; acrescentado só no sandbox para correr o PostgreSQL descartável sem root.

## Hashes
- attempts.PENDENTE.sql d4c8029637361010c24d48801a0176181e7e5684706f3123436da0a04822b2e0
- core: fonte PREPARED v2 `patches/issue333/core.PENDENTE.sql` b60f9360599f3204ce64c0eebd46350c73f07051ae3365e1dc043c14a3c1248e, validada PG73 na prova21. Deriva do PREPARED 9f8baeea0a19931c6b591aaf8f65d2429845bacd0c2a66004ef24b0501d8c3ef, que NÃO tinha gate nas 4 escritas core (prova20). BASE 4eeff2df… permanece inerte, nunca fonte Live.
- normalized_uniqueness.PROPOSTA.sql e6d85d294eefb9b764a2a1cb81469398f43e3c8cc7cf6900ead3acbe52cf39ab
- compatibility.PENDENTE.patch eac7fe0daa345324cd757fb776f00fb1fb3ae1ced0c84dc6734d09d8aac1c51c
- base-sha256.txt (manifesto BASE/PREPARED, 14 destinos) 93f5723e60006d1bd9fd983eae1766fec447370cb563c92c0e2434414aae530e

## Pacote para autorização futura (NÃO executado) — ordem
1. Preflight read-only Live: HEAD=GitHub; corpos/grants atuais; zero grupos de conflito forte (agregado, sem PII); ausência dos objetos 333.
2. Migração tracked 1: CORE v2 congelado (sessões/prévias/recibos/commit, preparation_validated e execute_validated independentes, `data_entry_settings` sem linha e sem grants ao cliente/service). Autorizada a estrutura em17/10 17:31 Fortaleza; retoma depende da integração #329, não de nova escolha técnica.
3. Migração tracked 2: attempts.PENDENTE (tabelas, settings sem linha, gate, chave forte, RPCs, triggers, list).
4. Verificação: `has_function_privilege` (internal/gate: ninguém; browser/list: authenticated; ingest: service_role), tabelas fechadas, corpos repo×Live, zero linhas settings ⇒ todas as mutações 42501.
5. Bucket `data-entry-staging` privado (ferramenta de storage) + políticas; prova alvo = matriz 17 repetida nesse bucket com execução ainda fechada.
6. Deploy endpoints candidatos (`standalone-attempt-333`, `data-entry`, ingest v2) com `verify_jwt=true`; gate de verificação pós-deploy: OPTIONS/POST 401/403/409 e mutação 42501 por gate fechado, sem efeito financeiro/externo. Runtime Cloud exato só legível após este deploy: dependência, não impedimento.
7. Índice forte: `CREATE UNIQUE INDEX CONCURRENTLY` fora de transação após preflight de conflitos=0 com escritores parados; validar `indisvalid/indisready`; se inválido, DROP INDEX CONCURRENTLY só desse índice e repetir preflight. Rollback sem DELETE/merge/backfill financeiro.
8. Fontes ativas v1 (scanner/edição/ingest) só depois: clientes antigos continuam `legacy_untracked` durante a transição.
9. Ativação (linhas em settings, por operação) e Publish: autorizações SEPARADAS. Aplicar DDL não ativa nada.
Rollback DDL: DROP das funções/tabelas 333 (sem dados financeiros), em migração separada autorizada.

## Limites restantes
- Garantia só no âmbito empresa+principal+operação+hash; sem unicidade global por PDF. Antigos sem ID sem proteção.
- Parser estrutural ≠ antivírus/validação documental universal.
- StorageACL do staging e runtime Cloud por provar após criação/deploy autorizados.
- UI de confirmação humana de nova intenção: cliente `confirmNewIntent`/`reviewMessage` preparados; o botão no scanner fica para a fase de aplicação (servidor já obriga a confirmação tipada).
- Contas técnicas banidas e 6 objetos fictícios da prova 17 mantidos até autorização de limpeza.
