# #352 — G2 verde no par congelado

Parecer 6449883145, aplicado em 27/10/2026 por Codex (2 · Plataforma e Infra).

**Resultado: zero bloqueantes.** A comparação reutiliza exactamente o catálogo congelado do ciclo e a saída do run #64, commit `52a5a977756d512cc944bf4cb2591a17e125bc9c`. Nenhuma nova recolha, nenhum novo G1, nenhuma consulta ou escrita em Live nesta revisão. O G1 já verde mantém a prova dos runs #63/#64; não se afirma que o catálogo representa a produção actual.

## Normalizações

| Etapa | Diferenças |
|---|---:|
| Bruto | 8581 |
| N1 | 1984 |
| N2 | 1130 |
| N3 | 910 |
| N4 | 115 |
| N5 | 115 |
| N6 | 115 |
| N7 | 112 |
| N8 | 109 |
| N9 | 1 |
| R8 — índice inválido já aceite | 0 bloqueantes |

N9: 20/20 tabelas elegíveis, 108 diferenças de ordem normalizadas (65 já admitidas + 43 deste parecer). A única diferença após N9 é `storage.idx_objects_bucket_id_name_lower.valid`, exactamente a excepção R8 anterior. Linha-base da plataforma: 798 diferenças, incluindo os cinco privilégios agora enquadrados. Nenhum resíduo sem classe.

## self_contained_fixture

34 ocorrências em 19 ficheiros; todas classificadas como fixture próprio. Zero ocorrências deste conjunto correm contra uma base integral aplicada pelas migrações. Quando carregam SQL de migração depois do fixture, a tabela em causa foi criada pelo fixture: o teste não consome a ordem da tabela de produção. Cada CREATE TABLE e cadeia de carregamento foi lido, incluindo o runner de cache_contracts. Nenhum teste foi executado nem modificado.

O anexo [fixtures.json](fixtures.json) contém uma entrada por ocorrência com tabela, classe, hash SHA-256 integral, linha do INSERT, linha/hash do CREATE TABLE e provas do carregamento. Abreviaturas de hash abaixo servem só para leitura.

| Ficheiro | Tabela | Linhas INSERT | SHA-256 inicial | Prova CREATE/carregamento |
|---|---|---|---|---|
| docs/testes/issue333/head/flows.test.tsx | public.profiles | 111 | 2a523de42951 | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/head/flows.test.tsx:109 |
| docs/testes/issue333/pg/activation56.test.ts | public.profiles | 16 | 1e879661f7fb | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/activation56.test.ts:21 |
| docs/testes/issue333/pg/activation64.test.ts | public.profiles | 16 | 5d25f079ad53 | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/activation64.test.ts:21 |
| docs/testes/issue333/pg/activation73.test.ts | public.profiles | 23 | 6a9defb3a79d | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/activation73.test.ts:28 |
| docs/testes/issue333/pg/assistant-executor12e-stub.sql | public.events | 52 | 4d55b2cddc6c | docs/testes/issue333/pg/assistant-executor12e-stub.sql:9 |
| docs/testes/issue333/pg/assistant-executor12e-stub.sql | public.financial_accounts | 54 | 4d55b2cddc6c | docs/testes/issue333/pg/assistant-executor12e-stub.sql:10 |
| docs/testes/issue333/pg/attempts-pg.test.ts | public.profiles | 25, 143 | 1efa19195637 | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/attempts-pg.test.ts:23 |
| docs/testes/issue333/pg/data-entry-pg.test.ts | public.profiles | 80 | 3e43803c9472 | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/data-entry-pg.test.ts:75 |
| docs/testes/issue333/pg/driver58.test.ts | public.profiles | 35 | 1a382efe228f | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/driver58.test.ts:34 |
| docs/testes/issue333/pg/fixture-preparation47.test.ts | public.profiles | 16 | 3d9a9c06ba7c | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/fixture-preparation47.test.ts:21 |
| docs/testes/issue333/pg/hash-check-pending.test.ts | public.profiles | 26 | 85b303e8f327 | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/hash-check-pending.test.ts:24 |
| docs/testes/issue333/pg/pilot8-browser56.test.ts | public.profiles | 34 | 15fcb234731b | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/pilot8-browser56.test.ts:33 |
| docs/testes/issue333/pg/pilot8-inert.test.ts | public.profiles | 30 | f596d67e5448 | docs/testes/issue333/pg/fixture.sql:13; docs/testes/issue333/pg/pilot8-inert.test.ts:29 |
| docs/testes/smart-link-choice-ios/validate-local.py | public.song_links | 31 | e722be15098c | docs/testes/smart-link-choice-ios/validate-local.py:20 |
| scripts/coala-meta-audience/schema-test.sql | public.events | 15 | 8e31d53b09c0 | scripts/coala-meta-audience/schema-test.sql:8 |
| src/test/event-stages-p1.test.ts | public.event_cache_configs | 50 | fa04c8d48eb2 | src/test/event-stages-p1.test.ts:22 |
| src/test/event-stages-p1.test.ts | public.events | 30 | fa04c8d48eb2 | src/test/event-stages-p1.test.ts:20 |
| src/test/event-stages-p1b.test.ts | public.events | 32 | e62355349bb0 | src/test/event-stages-p1b.test.ts:21 |
| src/test/newgang-erasure-0264.test.ts | public.events | 47 | 7ad2290482ca | src/test/newgang-erasure-0264.test.ts:24 |
| supabase/tests/cache_contracts/scenarios.sql | public.event_cache_configs | 25 | 3321191e4dbe | supabase/tests/cache_contracts/stub.sql:15; supabase/tests/cache_contracts/run.sh:11 |
| supabase/tests/cache_contracts/scenarios.sql | public.event_forecasts | 27, 33, 144, 145, 154 | 3321191e4dbe | supabase/tests/cache_contracts/stub.sql:17; supabase/tests/cache_contracts/run.sh:11 |
| supabase/tests/cache_contracts/scenarios.sql | public.events | 24, 32, 143, 151 | 3321191e4dbe | supabase/tests/cache_contracts/stub.sql:12; supabase/tests/cache_contracts/run.sh:11 |
| supabase/tests/cache_contracts/scenarios.sql | public.suppliers | 7, 199 | 3321191e4dbe | supabase/tests/cache_contracts/stub.sql:13; supabase/tests/cache_contracts/run.sh:11 |
| supabase/tests/issue335/stub.sql | public.financial_accounts | 45 | 9afe41632efe | supabase/tests/issue335/stub.sql:17 |
| supabase/tests/issue335/stub.sql | public.suppliers | 44 | 9afe41632efe | supabase/tests/issue335/stub.sql:15 |

A regra mantém bloqueante qualquer INSERT sem prova de fixture próprio, incluindo ficheiros executados sobre o esquema da aplicação. Não foi concedida uma exclusão geral a testes/stubs. O uso de lista de colunas nos testes sobre o esquema real fica para a frente dona em G3, com autorização própria.

## R4b — financial_accounts

A captura `supabase/tests/issue335/live/phase2n-bloco4/live-lateral-prosrc.txt` contém 11 corpos prosrc concatenados. Foram separados pelo comprimento e MD5 guardados de cada corpo; os 11 conferem. O SELECT da linha 281 pertence apenas a `sync_partner_aporte_mirror`; `v_acc` é declarado `record` na linha 260. Classificação: `safe_dynamic_record`. A classificação anterior misturava declarações de funções diferentes e produzia `unresolved_shadowed_declaration`.

O anexo [r4b-prova.json](r4b-prova.json) conserva os hashes do ficheiro/corpos, limites e a classificação das cinco capturas SELECT-star desse ficheiro. Delimitadores ou hashes inválidos continuam a bloquear. Não se eliminou a ocorrência sem prova.

## platform_managed_privileges

Foram inventariados 2180 ficheiros SQL: ledger, supabase/migrations, drizzle/migrations e supabase/manual no source congelado. Zero instruções explícitas da aplicação dão GRANT/REVOKE/membership aos três papéis em análise ou alteram ACL de storage.*; zero ALTER ROLE/USER desses papéis. Foram ainda revistos 56 blocos com privilégios dinâmicos ou consultas de catálogo, 40 conteúdos distintos por hash: limitam-se a objectos da aplicação e outros papéis, ou preservam ACL existente. Não alteram os cinco casos deste parecer.

As referências a supabase_admin em guardas de funções são verificações de identidade, não instruções que configurem o papel; essas funções continuam na comparação. Referências de DML/consulta de storage e políticas RLS também não são propriedade da ACL da relação e continuam tratadas pelas regras existentes. Não foi necessário admitir uma instrução pg_dump de privilégio não encontrada: a origem gerida pela plataforma e a ausência de alteração aplicacional foram comprovadas para estes cinco casos.

Movidos para N4 apenas: grants de `storage.buckets` e `storage.objects`; as duas memberships de `supabase_functions_admin`/`supabase_realtime_admin` para `postgres` com grantor `supabase_admin`; e `supabase_admin.config_sha256`. Owner, restantes atributos dos papéis, outras memberships e outras ACL permanecem comparados. Valores e detalhe de privilégios ficam exclusivamente no repositório privado.

**RLS de storage.objects: 152 políticas em cada lado, iguais e mantidas na comparação.** O mapa completo de políticas e o estado RLS de cada lado foram conferidos byte a byte contra o ciclo anterior. Nenhuma diferença foi escondida por esta regra.

## Prova, limites e paragem

Plano SHA-256 `09cce24a7681497ab51badb10fb4aa05ad2a92610ff41281782b512a5d7f8d4a`; source `f02c1ea826d22306eef394061c17ed178da3c804`. Os arquivos Live, fingerprints e ledgers são os mesmos, verificados por hash. Artefacto #64 `12754041988`, SHA-256 `844c606f998ee6c3d175759647d0142abfa6be975eb40b084423f5fce941fc25`.

Mantidas reviewed_literal_allowlist, catalog_identifier_literal, sanitized_literal_reconstruction com telefone e IBAN sintéticos, enum_position_overlay, acl_final_from_live, live_only_tail, live_definition_prevails, R6 live_absence_prevails, R7 e R8. Nenhum plano, migração, original, seed ou catálogo foi alterado.

Três testes focados verificam fronteiras de captura/hash, INSERT sem fixture e limites de N4. Duas reproduções offline do G2 conferem resultados. A evidência privada inclui scripts e inventário completo de fontes; a auditoria N9 integral é regenerável e fica vinculada por hash no manifesto.

Os 48 bloqueantes do comentário 6449046318 ficam superados por este fecho. G3 NÃO iniciado: exige Sim próprio do Pedro. Reserva #352 mantida; Issue permanece aberta. Sem dados operacionais, novos seeds, segredos, infra, deploy ou Publish. Integração documental das branches anteriores por merge comum, com conferência #329 antes de cada push, registada no comentário de fecho.
