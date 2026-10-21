# #335 — fases 1/2 local/inertes, 21/10/2026

## Estado real
Fase 1 concluída; fase 2 preparada e parcialmente provada, NÃO aceite nem autorizada para aplicação.
CI inicial main ca470ce887c49910348197b9446b6838c941c622 success, run 39607764660.
Consultados QUADRO, AGENTS, plano aprovado, Issue #335/comentários, memórias compensacao-ligada/payment-account-ownership e decisões D-ERP28/86/289.
SELECT somente definições/colunas instaladas. Nenhuma mutation Cloud, migration tool, alteração migrations, deploy ou Publish.

## Provas executadas
- bunx vitest run src/lib/transaction-offset-plan.test.ts: 19 passed.
- bunx vitest run: 221 test files passed, 2 skipped; 1952 passed, 6 skipped, 11 todo.
- bash supabase/tests/issue335/run.sh: PostgreSQL Unix socket descartável; env PG removida; zero credenciais.
- Triggers capturados: derive/sync/validate payments, aplicação/reversão legacy e proteção sem conta; RPC reconcile instalada com align/keep e auditoria preservados.
- Estoril local: receita 30996=23406 transfer+7590 compensation; despesa 7590 compensation; 3 pernas; par legado adotado e não duplicado; só receita ligada ao banco.
- Quatro IVAs: dinheiro 12300/6560; compensation 0/9340/5650/3690.
- Débito/zero, cent refusal+rollback, changed replay, guardas estorno individual/delete/valor, integral reversal e histórico, BP criação+rollback, viewer denial, tenant isolation, cinco contagens bilaterais zero.
- Duas sessões concorrentes: mesmo request produz um grupo e três pernas.
- #233 pending P0410, align com auditoria, keep com divergência.
- Rollback técnico recusa groups_exist_keep_guards, preservando histórico.
- Build automático OK observado; não executado tsc/tsgo manual por regra da plataforma.

## Bloqueios técnicos antes de aceitar fase 2
1. PG_CONTEXT é uma guarda experimental, NÃO fronteira de segurança. Substituir por autorização estrutural invoker/RLS/capability não falsificável; testar funções anónimas/names spoof/default ACL técnicas.
2. BP usa barreira conservadora mesma rubrica, não reprodução integral do matching canónico. Resolver canonical/anchor/token winner e scope master; provar partilhado e >1000.
3. Locks existentes ordenados por UUID mas eventos/BP/inserções simultâneas ainda não integralmente serializados. Provar races diferentes requests e writers legados, revalidar após locks.
4. Auditoria novas operações deve integrar ledger instalado sem swallow; snapshots/drift completos, guardas banco/offset/perna/tx em todas entradas.
5. Testar cada falha após escrita, planos/créditos/FX SQL, adopt applied refusal, rollback limpo/restauração ACL e vigia legada efetiva. Alguns desses casos só provados no helper.
6. Baselines de triggers capturados não equivalem a TODOS os triggers de produção: ampliar harness (BP/cache/audit e dependências) antes de A–C.

A–C, UI e provas Live NÃO executadas. Não colocar estes candidatos em migrations. Reserva mantida e Issue aberta.

## SHA256 exactos
```
4b87dc4157e5a0a502957ee3248e7ee7a1d5ae1fab6c507be977a6e4228e3b54  src/lib/transaction-offset-plan.ts
5aef589ebcd9b61a0404dd03b7a7d04fc4919e88bc9eed063a0c435128d5ccfa  src/lib/transaction-offset-plan.test.ts
44c223e9b374f9b48fbb0484d2cfd5371183903c12678f24cd3d3300f7cef4e6  supabase/manual/20261021_issue335_offset_core.INERTE.sql
8bd457557cd337488196f806a028f054fe33ee9714ca5798f146387ca7161701  supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql
dd6969d166b3a81f18e31c0b6ac8c7e43627f4d51eda17117d8f14df9d14e7db  supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql
0fd47ed5f4e6d4c5933d87157f5edd467599a00430820446ccdc51b8b76a1590  supabase/manual/20261021_issue335_offset_group_storage.ROLLBACK-INERTE.sql
24bf7ad2a273cc5bc080f20db3c90378f2829ea036cbd264d526d7fda6263c4a  supabase/manual/20261021_issue335_offset_invariants.INERTE.sql
bf303fbe2224fd336b0c1a535849e8fc7e7eb64c6e26da8e169dd67876ea4935  supabase/manual/20261021_issue335_offset_invariants.ROLLBACK-INERTE.sql
```

## Fase 2b — resultado real, 21/10/2026

PARCIAL; NÃO ACEITE. A–C continuam não aplicados. Nenhum DDL/DML Live,
migration tool, migrations, deploy ou Publish. Live: somente SELECT catálogo,
sem consultar linhas financeiras. Reserva #335 mantida como fase 2b.

Lidos: docs/QUADRO.md, AGENTS.md, .lovable/plan.md,
docs/testes/issue335-fases12-local.md, docs/questoes-issue335-fases12-local.md,
os seis supabase/manual/20261021_issue335_offset_*.sql,
run.sh/stub.sql/triggers.sql/scenarios.sql/concurrency.sql e baselines em
supabase/tests/issue335; Issue #335 completa e comentários de bloqueios.
Complementos: memórias compensacao-ligada.md/payment-account-ownership.md,
src/lib/bp-tx-matching.ts e matching usado no EventForecast,
reconcile.test.ts, decisões D-ERP28/86 e catálogo instalado.

CI inicial: main 1e994d385c9ae51197c6d5c3c9c88c3fb9a961fb, success,
run 39611609843, https://github.com/pedrompropicio/mundopropicio/actions/runs/39611609843.
HEAD observado antes deste relatório: a85a6b007a7e68e48bb12f261a5d6875d470708f.
Não é afirmação de SHA final: a plataforma cria commits depois dos edits.

### Resultados por requisito

1. Fronteira: retirado PG_CONTEXT. RPCs INVOKER delegam para trigger interno
SECURITY DEFINER, executor NOLOGIN fresco, sem associação a papéis da app.
Cliente não consegue mudar current_user via GUC. Helpers sem EXECUTE a
PUBLIC/anon/authenticated/service_role. Privilégios explícitos, não schema-wide;
políticas internas limitadas à empresa. Passaram: SET ROLE, GUC forjada,
helpers, IDs inventados, DELETE/UPDATE/estorno de pernas e pares legados.
Ainda não certificado contra todas as ACL/RLS/owners reais.
2. Matching: SQL reproduz união forecast_id/âncora, categorias/tipos, exclusão
de claims alheios, normalização e winner estrito. Passaram 0/1/1002 transações,
N entidades, sem truncamento, âncora deduplicada, winner, score zero e acentos.
Falta diferencial exaustivo master/âncoras conflituosas/empates com o SSoT JS.
3. Locks: empresa/entidade/eventos/forecasts/transactions/payments ordenados;
NOWAIT nos locks explícitos evita esperar na ordem inversa legada.
Passaram duas sessões com MESMO request, um grupo/três pernas; replay/hash.
NÃO provadas 2–3 sessões cruzadas encontro/estorno/pagamento normal nem
esperas transitivas FK/trigger/advisory. NOWAIT não substitui essas provas.
4. Auditoria: logs existentes forecast_audit_log, transaction_audit_log e
system_audit_log; derivação por _derive_paid_amount, sem atribuição manual no
núcleo. Passaram presenças de criação/estorno e auditoria #233 align/keep.
5. Atomicidade: injeção após 14 escritas físicas na aplicação e 12 na reversão,
incluindo triggers/auditoria; snapshots das 11 tabelas envolvidas idênticos após
cada falha. Cenário testado: par de documentos existentes, saldo zero.
Faltam injeções em cada escrita do adaptador banco e da criação a partir do BP.
6. Matriz LOCAL: anon recusado; authenticated sem papel sem leitura/execução;
staff lê e passa autorização/validação, sem escrita direta/helpers; admin
executa cenários/ataques; service_role sem ator recusado e sem helpers/writes.
RLS de Live e modelo efetivo de permissões NÃO reproduzidos integralmente.
7. Harness: inventário de 54 triggers/74 funções; 54 triggers e 67 definições
carregados. Não foram omitidas definições de triggers inventariadas.
Substituídos: auth.uid/auth.jwt/current_company_id/has_role/has_staff_role,
has_permission_in e is_platform_admin (ambas assinaturas).
Não carregados: _effective_permissions_for/row_belongs_to_current_company.
Owners, ACL, constraints/FKs/nullability e dependências transitivas incompletos.
Coala forecast category emite `record new has no field supplier_id`, capturado
pela própria função instalada; NÃO foi ocultado/corrigido/desativado.
Lista explicada também em supabase/tests/issue335/live/README.md.
8. #336: 9 testes; Estoril aplicado conta 23406, despesa compensation zero,
revertido zero sem fallback histórico. HISTORICAL_CASH_BOUNDARY preservada;
generate-historical-transactions intocado. Cinco vigias disparam individualmente
sob corrupção local e regressam a zero. NÃO executada toda a matriz instalada
de invariantes transitivas, portanto sem certificação global.

### Comandos e verificações
- bash supabase/tests/issue335/run.sh: exit 0, cenários fases 1/2 e novos passam.
- bunx vitest run: primeira corrida falhou em beforeAll PGlite Newgang (10s).
  Não se alterou o teste alheio; repetição com --maxWorkers=2 passou.
- bunx vitest run --maxWorkers=2 FINAL: 221 ficheiros passaram, 2 skipped;
  1953 testes passaram, 6 skipped, 11 todo (1970).
- Testes focados: 19 prévia + 9 conciliação = 28 passaram.
- tsc/tsgo manual NÃO EXECUTADO: regra da plataforma proíbe typechecks manuais.
  Build automático observado OK; isto NÃO equivale a tsc executado.
- Rollback recusa groups_exist_keep_guards; entrada alternativa por view também
  revogada. Limpeza/restauração integral de ACL/roles/políticas ainda não provada.

### Bloqueios remanescentes (técnicos; não escondidos)
Não aceitar fase 2b: faltam paridade auth/RLS/ACL/constraints/dependências;
matching diferencial master/âncoras/empates; concorrência cruzada entre writers;
falhas de todas as escritas banco/BP; rollback ACL integral; invariantes
transitivas. Estes pontos não dependem de nova decisão comercial do Pedro.
A–C aguardam autorização separada só DEPOIS da aceitação técnica.

### SHA256 fase 2b exactos (candidatos e harness)
```text
4b87dc4157e5a0a502957ee3248e7ee7a1d5ae1fab6c507be977a6e4228e3b54  src/lib/transaction-offset-plan.ts
5aef589ebcd9b61a0404dd03b7a7d04fc4919e88bc9eed063a0c435128d5ccfa  src/lib/transaction-offset-plan.test.ts
2beb64b2b898fad211679889d31186645441461f67a171670c1394648ba8ceba  src/lib/bank-statement/reconcile.test.ts
418ff4e5e8a531240770b755b8a4c1e3734cc3cecd09d6e73c8783812975362d  supabase/manual/20261021_issue335_offset_core.INERTE.sql
3029747556e800b1fc314949b7f48964f72dee6e387bf2f99700150c903e762b  supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql
ee9ee7627da82511de0e0885112bd79071d5e5fe652bbf31d94827eb0d0db3cc  supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql
0fd47ed5f4e6d4c5933d87157f5edd467599a00430820446ccdc51b8b76a1590  supabase/manual/20261021_issue335_offset_group_storage.ROLLBACK-INERTE.sql
24bf7ad2a273cc5bc080f20db3c90378f2829ea036cbd264d526d7fda6263c4a  supabase/manual/20261021_issue335_offset_invariants.INERTE.sql
bf303fbe2224fd336b0c1a535849e8fc7e7eb64c6e26da8e169dd67876ea4935  supabase/manual/20261021_issue335_offset_invariants.ROLLBACK-INERTE.sql
26fc7f43a4c87b12bd04070fe31d07826fc7a426c7b389bdf2863bad2f92449f  supabase/tests/issue335/concurrency.sql
7f058a732181e963365cbf800eb6d9e6b342efa2fad5423fa7f12cb5aaa967cb  supabase/tests/issue335/derive.LIVE-BASELINE.sql
3d6606038c22e801bad97e552423a560669e2df244a41c0723c9d50bc67bfc70  supabase/tests/issue335/live/README.md
090752c7e3b24d2375348239fb91d92bcbb7d58f177159125e8cee8ffa78e8c3  supabase/tests/issue335/live/catalog.json
fb1a7398949ce2fb73c0d5749c73591aa91ca1552a8430618ae2bee67c74ed21  supabase/tests/issue335/live/dependencies.sql
55e6b6d91a977aa97dcd8001c50dffb9df71a290b047f24e0703634686181bf1  supabase/tests/issue335/live/functions.sql
ffb8ec79f61e7aa040810efc79d895fbbfd30fd1904308bc83397420c347c1fb  supabase/tests/issue335/live/triggers.sql
b48e71aebc00ed5ad37b7d30a51f3dc8acfbd8d32a17811a6539edbf903f943d  supabase/tests/issue335/matching.INERTE.sql
e932c186a6857b8a0cd975d09c64c8b0c9ba43dcc3be8c22d1ee8e5cc6bf99cd  supabase/tests/issue335/phase2b.sql
59ad9b2c68647da79c837cf4786d9550af7beeb3fe2bc39797404439bbd43b49  supabase/tests/issue335/reconcile_bank_line.LIVE-BASELINE.sql
7519cf7f505cad0f05e43b9ea54b062345b65c53d171dfd5ef4d6cc240a77c26  supabase/tests/issue335/run.sh
6d1468b85b08c0735ae595bb2e4cc9dc36c6d7d14c01305718fcc6aa47c4d4f0  supabase/tests/issue335/scenarios.sql
9afe41632efe76fbe43ebf4774d661fb6ecece12d125335d40b34dd81c2baeec  supabase/tests/issue335/stub.sql
6212eddfc81236f3c3fe31c8414a62d382fcdc0789c5c75ddcd830481139777c  supabase/tests/issue335/sync.LIVE-BASELINE.sql
4c4d5c91cc3502a066dc4ccbf79bf1930a6cd1dad88ac6b9e1c353e2dac0436b  supabase/tests/issue335/triggers.sql
a685a81bcee780949e1348e5ec7ff59bdc1bc23500c74e8930181946ac43f8d2  supabase/tests/issue335/validate.LIVE-BASELINE.sql
```


## Fase 2c (21/10/2026) — LOCAL E INERTE

Paridade: `live/phase2c-auth.sql` repõe corpos reais de auth.uid/jwt/role, current_company_id, has_role, has_permission(_in), is_platform_admin, row_belongs_to_current_company e helpers das policies; owners, ACL (incl. MAINTAIN), 95+3 policies reais, CHECK/UNIQUE/PK/FK e role_permissions de aprovação. Diferencial `live/phase2c-catalog-diff.md`: 390 objetos, 368 iguais, 22 explicados (FKs para tabelas fora do fixture: venues, cities, bp_versions, bank_statements, payment_lists, cache_*, partners, settlements; FKs para auth.users), 0 divergentes.

Defeitos encontrados pela paridade e corrigidos no SQL inerte: executor sem leitura de profiles/user_roles (real current_company_id é invoker) → política `issue335_identity` só para as linhas do próprio utilizador; rollback não repunha ACL de `_derive_paid_amount`/`bp_tx_link_allowed` → reposta exatamente.

Resultados (run.sh, 31 PASS, exit 0): cenários fases 1–2b sobre auth real; paridade BP JS↔SQL (8 casos, 1.002 transações, âncoras em conflito históricas, empates, master excluído, acentos, scores); concorrência 3 sessões (encontro×estorno×pagamento, encontro×encontro, encontro×edição BP) sem deadlock no log, conflito com `encontro_em_conflito` e zero escritas parciais; falhas injectadas banco+BP 24 escritas e reversão 17, todas as tabelas públicas idênticas; rollbacks recusam com grupos; rollback em histórico zero deixa catálogo idêntico (funções/ACL/owners, relações, colunas, policies, triggers, constraints, roles); matriz 17 invariantes idêntica antes/durante/depois, 5 novas a zero.

Vitest: 1.944 passou, 15 skipped, 11 todo (newgang-crm-profile-fields expirou na suite completa por timeout de rede; isolado 9/9 OK). tsgo: OK.

### sha256 fase 2c
44681f1b5c37dc2af56567267fa0bf879a438ac9b5048bfe9a25f83fd4a03c4a core.INERTE
6fb4ac387e20e879d4f7e3b44a17b88bca488ea0c921eadb9e44696a0d1812b7 core.ROLLBACK-INERTE
ee9ee7627da82511de0e0885112bd79071d5e5fe652bbf31d94827eb0d0db3cc group_storage.INERTE
f0713aaca18c43b44bc352655d5c79dc40d0624084715a42c5eaf54c81576fcf group_storage.ROLLBACK-INERTE
24bf7ad2a273cc5bc080f20db3c90378f2829ea036cbd264d526d7fda6263c4a invariants.INERTE
edd924cd48d5378180e80a50547b5a5a4bbe378596155fc384fe127f051c5571 invariants.ROLLBACK-INERTE

### Em aberto
- FKs para 22 dependências fora do fixture continuam não reproduzidas (explicadas, não provadas).
- Matching SQL não infere master por parent_event_id (JS só usa master quando o chamador o passa); paridade provada nesse contrato.
- Teste encontro×encontro usa barreira advisory para sincronizar arranque; corrida sem barreira não medida.
- Aplicação A–C exige autorização separada do Pedro.


## Fase 2d — PARCIAL, NÃO ACEITE (21/10/2026)

Lidos: docs/QUADRO.md, AGENTS.md, .lovable/plan.md,
docs/testes/issue335-fases12-local.md, docs/questoes-issue335-fases12-local.md,
os seis supabase/manual/20261021_issue335_offset_*.sql (INERTE e ROLLBACK),
supabase/tests/issue335/run.sh, stub.sql, scenarios.sql, phase2b.sql, phase2c.sql,
phase2c-invariant-matrix.sql, concurrency.sql, matching-parity.ts, matching.INERTE.sql,
catalog-diff.py, live/README.md, dependencies.sql, functions.sql, triggers.sql,
phase2c-auth.sql, phase2c-invariant-registry.sql e snapshots JSON de catálogo;
Issue #335 e comentários. Também DECISIONS e memórias compensacao-ligada/payment-account-ownership.

CI inicial main de634168d81e03fccac9abf456af1c82e42ca08f: success,
run 39621045842. Não é o SHA final nem CI final destes candidatos.
Primeira reprodução: ERROR must be able to SET ROLE issue335_executor;
GRANT auth/uid sem grant option produzia warnings. Corrigido nos candidatos locais.

Resultados por achado (numeração das provas phase2d):
1. PASS aplicação/rollback como postgres NOSUPERUSER CREATEROLE BYPASSRLS;
executor NOLOGIN; SET membership temporária restrita ao deploy; sem grants auth.
2. PASS defaults Live-like ALL/EXECUTE neutralizados no storage; ataques authenticated
INSERT/UPDATE/DELETE/TRUNCATE recusados com apenas storage instalado, antes dos guards.
3. PASS transaction_offset_create autenticada continua a criar compensation e fechar despesa;
EXECUTE legado em _apply_transaction_offset preservado, não revogado globalmente.
4. PASS âncora bancária durável bank_line_id; detach/delete de links recusados;
vigia LEFT JOIN deteta origem desligada. Falhas bancárias continuam atómicas.
5. PASS aplicar/estornar/reaplicar documentos com par legado retido; histórico não revive.
6. PASS três sessões encounter/FK insert/read; NO KEY UPDATE permite KEY SHARE;
cenários anteriores encounter/reversal/payment e BP edit passam, sem deadlock no log.
NÃO é prova exaustiva de todas as esperas transitivas; ainda existem sleeps/barreiras.
7. PASS recusa inactive/hidden/restricted/partner/mirror/ticket_office/prepaid_card/other/cash.
BLOQUEADO saldo: nova compensation dá delta canónico +100 quando dinheiro é +60.
A reprodução local ASSERTA o defeito e emite WARNING; NÃO é aceitação da invariante.
Não há guarda server de saldo disponível para débito nem prova concorrente de não-overdraft.
8. PASS manager não estorna; admin requerido como reverse_payment legado.
BLOQUEADO restore atomic/admin window reais; guarda de metadados geridos incompleta
(account_id, event_id, payment_date, event_settlement_id não integralmente bloqueados).
9. PASS removidas policies identity/profiles desnecessárias. Correção da nota 2c:
current_company_id/has_role/has_staff_role são DEFINER, não INVOKER.
Mantida policy restrita self em user_roles porque companies PUBLIC SELECT lê user_roles
no contexto do caller; README explica o caminho. Modelo global de papéis não certificado.
10. PASS settlement não selado aplica/estorna; selado recusa mesmo GUC forjada;
executor tem leitura necessária ao trigger real. BLOQUEADO corrida selagem/dispatch
sem lock settlement e ataques detach/reassign antes da selagem, auth real nesses casos.
11. PASS rollback ordem errada recusado; invariants -> core -> storage; grupos retidos
recusam rollback; sem grupos diff catálogo pré/pós vazio no escopo capturado.
DROP OWNED removido, dependências inesperadas falham atomicamente.
12. PASS precisão >2 decimais recusada explicitamente sem conversão silenciosa;
#233 align de documento gerido produz managed_group_date_alignment_forbidden sem parcial;
keep/align/auditoria legacy mantidos. Restore/window e saldo ainda NÃO aceites.

Testes finais:
- bash supabase/tests/issue335/run.sh: exit 0 (inclui reprodução explícita do BLOQUEIO saldo).
- 14 apply + 12 reverse writes do core; banco/BP 25 apply + 17 reverse writes:
snapshots de todas tabelas públicas iguais após cada falha; logs/vínculo incluídos.
- matching JS/SQL 8 casos, 1002 transações; matriz 17 invariantes e cinco vigias passam
no escopo fixture. Isso não cobre o defeito de saldo explicitamente reproduzido.
- bunx vitest run --maxWorkers=2: 221 files passed, 2 skipped;
1953 passed, 6 skipped, 11 todo; exit 0, 299.53s.
- focados prévia/#336: 19 + 9 = 28 passed. reconcile.ts e fronteira histórica intocados.
- bunx -p @typescript/native-preview tsgo -p tsconfig.app.json --noEmit: exit 0.
Executado tsgo, NÃO tsc clássico. Build automático observado OK.

Diferencial reforçado: antes comparava só nomes constraints; agora tipo/validated/definição.
Revelou seis divergências reais CASCADE/RESTRICT/DEFERRABLE, corrigidas no bootstrap local
phase2d-constraints.sql com definições do snapshot Live. Resultado final:
390 objetos; 368 iguais; 22 FK ausentes explicadas; 0 divergências não explicadas NESSE ESCOPO.
Isto NÃO certifica paridade integral: 22 FK faltam, índices/objetos extras/ACL globais e
normalização de literais em funções continuam incompletos. Falta teste negativo do comparator.
Diferencial completo anexado abaixo, sem suprimir dependências ausentes.

Bloqueios técnicos remanescentes: saldo canónico/débito, restore/window real,
metadados geridos, selagem concorrente, paridade transitiva completa e scheduler determinístico.
Não dependem de decisão comercial nova do Pedro. A–C permanecem não aplicados;
exigem autorização própria depois da aceitação técnica. Reserva #335 mantida fase 2d.
Sem migration tool, migrations, dados financeiros Live, DDL/DML Live, deploy ou Publish.

### SHA256 fase 2d (todos os candidatos e harness; exatos)
```text
cebe9d61d7e14f04146f147174485b14f72826de953b5b72268a513384a2a254  supabase/manual/20261021_issue335_offset_core.INERTE.sql
ad2031470c9d15d4505218b1af3a5598d51efdb73ccdc0c52c03f361e4075e0d  supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql
5b4f724ebcfa6ebc602c43e1ad8b111f861a8ad21f2f9e3fd681599849285bb9  supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql
028195c5a8289fee40bb7d8e2e402b9398f3a0a1bbbf07d8e928bf85414fa5b0  supabase/manual/20261021_issue335_offset_group_storage.ROLLBACK-INERTE.sql
7d3eb9f66dec56413cf9473aa76427dd3282efd35e315f6666c9f6b497f642af  supabase/manual/20261021_issue335_offset_invariants.INERTE.sql
edd924cd48d5378180e80a50547b5a5a4bbe378596155fc384fe127f051c5571  supabase/manual/20261021_issue335_offset_invariants.ROLLBACK-INERTE.sql
e2fbe083ede332a403100ef8e800bd62062a09bcf34efbfbd2af13ccedccb82d  supabase/tests/issue335/catalog-diff.py
07068a430688eb963d4ade7b5305c88f41ccb41e7d429a59c009bca158f26bb6  supabase/tests/issue335/concurrency.sql
7f058a732181e963365cbf800eb6d9e6b342efa2fad5423fa7f12cb5aaa967cb  supabase/tests/issue335/derive.LIVE-BASELINE.sql
8fc00e86050fe3ed1981193ccb1120bc25cd452a60f93d08737ddf8dc68cd004  supabase/tests/issue335/live/README.md
090752c7e3b24d2375348239fb91d92bcbb7d58f177159125e8cee8ffa78e8c3  supabase/tests/issue335/live/catalog.json
fb1a7398949ce2fb73c0d5749c73591aa91ca1552a8430618ae2bee67c74ed21  supabase/tests/issue335/live/dependencies.sql
55e6b6d91a977aa97dcd8001c50dffb9df71a290b047f24e0703634686181bf1  supabase/tests/issue335/live/functions.sql
2d9fbac90b0d979e7bbfb536a0d328c14042c43ebf861524ab010cc47a764d9e  supabase/tests/issue335/live/phase2c-auth.json
fb4768371f61b502634a2ea4d647f3924760a7db733edf8f38e6e13f3c06660f  supabase/tests/issue335/live/phase2c-auth.sql
eb0f266cebe4881c6a87ed0f7f31052e07e1f2fcb7a253565269075ea38ee256  supabase/tests/issue335/live/phase2c-catalog-diff.md
244fb56591b2ac48f6a51dec135c7d400e6a9346bb52150693a1678c4348a4f4  supabase/tests/issue335/live/phase2c-invariant-registry.sql
6bfd30c6cee7f10c3d763d586d9d8d66501844a988853086c4f1ce069b5ee1ef  supabase/tests/issue335/live/phase2c-relations.json
c9f6a641341ee94f06791c0ec31db70d029e3fd2c178a583b3c2e03c052e0fa1  supabase/tests/issue335/live/phase2c-touched.json
df750b597e544a9ef7f67b0888372ec5f33382c3c289de9cfe46cbef49e6222f  supabase/tests/issue335/live/phase2c-transitive.json
122ba034d0868e3af650b4c04fab9b658464403a7b0706d5ed24a70e24e8f9e9  supabase/tests/issue335/live/phase2d-constraints.sql
ae466ac60343bfdc6c2f68fa416bf68843e3241b5821557fdb01380fe94b170d  supabase/tests/issue335/live/phase2d-legacy.sql
04d5157048dc9a4f6ce178d9ee3056a087548919a850e7d793af9ce011b82eee  supabase/tests/issue335/live/phase2d-role.sql
ffb8ec79f61e7aa040810efc79d895fbbfd30fd1904308bc83397420c347c1fb  supabase/tests/issue335/live/triggers.sql
4f9cb6b789fffea75d1c232413ea35a60ef5cda95d06d7000e943ef2adb91522  supabase/tests/issue335/matching-parity.ts
0f6e803bff83c2cf51e39d4ba09900daec20cbaab4ccb1943ccfb72d7c434d0e  supabase/tests/issue335/matching.INERTE.sql
13f345a723a352133bc5f0750df3f647b91fb2342556230b8e6116e56723db74  supabase/tests/issue335/phase2b.sql
9403e5892a7f3ea103633fa28569034b4a2e85d1ee9f41e609c849676c0be693  supabase/tests/issue335/phase2c-invariant-matrix.sql
240fd14e2a97496e910132ad7a5650b6f8b73f2405ba12dc4628b1bed06b9baa  supabase/tests/issue335/phase2c.sql
c735d3364f0f2ab620ffb57a70df1d6ed91f948cb2eaff1ffbd965d337f94763  supabase/tests/issue335/phase2d.sql
59ad9b2c68647da79c837cf4786d9550af7beeb3fe2bc39797404439bbd43b49  supabase/tests/issue335/reconcile_bank_line.LIVE-BASELINE.sql
17c9fe850d443bb5c86eccbfa3db7c8ac1b03cafa7f58a70c78b86712c46d8ac  supabase/tests/issue335/run.sh
ceed9e6b392595fc2db6347426fc5aa7c35cdc583a531f7cc754788ff4a630da  supabase/tests/issue335/scenarios.sql
25e2c812180ab99e4ae8aaa4cf0a5a39c470760e4cd2d232015ac5ba094ff5b0  supabase/tests/issue335/storage-only.sql
9afe41632efe76fbe43ebf4774d661fb6ecece12d125335d40b34dd81c2baeec  supabase/tests/issue335/stub.sql
6212eddfc81236f3c3fe31c8414a62d382fcdc0789c5c75ddcd830481139777c  supabase/tests/issue335/sync.LIVE-BASELINE.sql
4c4d5c91cc3502a066dc4ccbf79bf1930a6cd1dad88ac6b9e1c353e2dac0436b  supabase/tests/issue335/triggers.sql
a685a81bcee780949e1348e5ec7ff59bdc1bc23500c74e8930181946ac43f8d2  supabase/tests/issue335/validate.LIVE-BASELINE.sql
```

# #335 fase 2c — diferencial catálogo Live × harness local

Total: 390; iguais: 368; explicadas: 22; DIVERGENTES: 0

| objeto | resultado | nota |
|---|---|---|
| constraint:bank_statement_lines.bank_statement_lines_matched_payment_list_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "payment_lists" |
| constraint:bank_statement_lines.bank_statement_lines_matched_sepa_export_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "payment_list_sepa_exports" |
| constraint:bank_statement_lines.bank_statement_lines_statement_id_fkey | explicada | fixture dependency absent locally: relation "bank_statements" does not exist |
| constraint:event_forecasts.event_forecasts_addback_settlement_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_settlements" |
| constraint:event_forecasts.event_forecasts_cache_config_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_cache_configs" |
| constraint:event_forecasts.event_forecasts_category_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "account_categories" |
| constraint:event_forecasts.event_forecasts_event_settlement_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_settlements" |
| constraint:event_forecasts.event_forecasts_ordering_partner_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_partners" |
| constraint:event_forecasts.event_forecasts_paying_partner_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_partners" |
| constraint:event_forecasts.event_forecasts_version_id_fkey | explicada | fixture dependency absent locally: relation "bp_versions" does not exist |
| constraint:events.events_city_id_fkey | explicada | fixture dependency absent locally: relation "cities" does not exist |
| constraint:events.events_venue_id_fkey | explicada | fixture dependency absent locally: relation "venues" does not exist |
| constraint:profiles.profiles_id_fkey | explicada | fixture dependency absent locally: insert or update on table "profiles" violates foreign key constraint "profiles_id_fkey" |
| constraint:transaction_payments.transaction_payments_payment_list_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "payment_lists" |
| constraint:transaction_payments.transaction_payments_supplier_credit_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "supplier_credits" |
| constraint:transactions.transactions_cache_contract_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "cache_payment_contracts" |
| constraint:transactions.transactions_card_session_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "card_sessions" |
| constraint:transactions.transactions_category_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "account_categories" |
| constraint:transactions.transactions_event_settlement_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "event_settlements" |
| constraint:transactions.transactions_settlement_id_fkey | explicada | fixture dependency absent locally: relation "ticket_office_settlements" does not exist |
| constraint:transactions.transactions_supplier_credit_id_fkey | explicada | fixture dependency absent locally: there is no unique constraint matching given keys for referenced table "supplier_credits" |
| constraint:user_roles.user_roles_user_id_fkey | explicada | fixture dependency absent locally: insert or update on table "user_roles" violates foreign key constraint "user_roles_user_id_fkey" |


## Fase 2e — PARCIAL, NÃO ACEITE — 21/10/2026

Autorização de Pedro: opção 1 somente LOCAL/INERTE, ajuste restrito às duas funções de saldo. Não autoriza instalação Live. A–C e alteração instalada de saldo exigem Sim separado. Nenhum migration tool, migrations, DDL/DML Live, deploy ou Publish. K apenas contagens agregadas em production.

### Ficheiros e fontes lidos
- docs/QUADRO.md; AGENTS.md; supabase/AGENTS.md; .lovable/plan.md.
- docs/testes/issue335-fases12-local.md; docs/questoes-issue335-fase2d-local.md (agora renomeado fase2e).
- Seis candidatos originais: supabase/manual/20261021_issue335_offset_{core,group_storage,invariants}.{INERTE,ROLLBACK-INERTE}.sql.
- supabase/tests/issue335/run.sh, phase2d.sql, phase2b.sql, phase2c.sql, phase2c-invariant-matrix.sql, scenarios.sql, stub.sql, catalog-diff.py; live/README.md, dependencies.sql, functions.sql, triggers.sql, phase2c-auth.sql, phase2c-invariant-registry.sql, phase2d-role.sql e snapshots.
- Memórias compensacao-ligada.md, payment-account-ownership.md, financial-account-visibility e transaction-editing-rules; Issue #335 e comentários completos consultados via API.
- Capturas novas: live/phase2e-functions.json, phase2e-catalog.json; phase2e-balance-baseline.sql, phase2e-replay.sql, phase2e-balance-prosrc.diff.

### Estados A–K (sem extrapolar PASS locais)
A — CORRIGIDO no cenário misto: +60 dinheiro/+40 compensation dá saldo +60, conta X original preservada e sem +100 fantasma. Candidato balance e rollback SEPARADOS. Gerido = grupo preparing/applied/reversing com perna paga não revertida vinculada ao item/documento; todos os pagamentos reais ativos desses documentos seguem conta/data da própria perna; compensation excluída. Sem pernas geridas ativas mantém o caminho legado, incluindo filtros antigos (não acrescentar status/hidden/reversed ao ramo legado). transactions.account_id não é reatribuído pelo núcleo; force_no_account_on_compensation continua instalado, e paid_amount somente derivado. Provas as-of e corte estrito, estorno, conta X e legado hidden passaram. ABERTO: matriz integral legado/método compensation/offset antigo e conta camarim; proteção concorrente de débito não certificada. Vigia issue335_balance_invariant_count passou zero→corrupção detectada→zero; registrada separadamente, ainda NÃO integrada no runner global.
B — CORRIGIDO no adaptador: policy real bank_statement_lines = platform_admin/admin/manager ou manage_bank_reconciliation. Editor sem permissão recusado; manager aceite; admin nos cenários retidos. Sem alterar policy instalada.
C — CORRIGIDO no escopo testado: restrictive confidential rule reproduzida antes de erros com valores; manager sem can_see_confidential recusado, conta fonte restrita recusada com a mesma mensagem genérica. ABERTO: matriz integral de permissões/contas atribuídas e operações inversas não provada.
D — PÁRA-PARA-DECISÃO: reproduzido no trigger real: documento aprovado quando evento estava without_bp, depois with_bp, encontra/fecha mas paid→approved na reversão falha por falta de BP. Recusa atómica: grupo applied e pernas paid ficam intactos. Não se alterou trigger nem JWT, não se contornou P0409. Desbloqueio deste caso exige desenho/autorização própria; não pedir aplicação A–C enquanto bloqueios técnicos persistirem.
E — CORRIGIDO parcialmente: proteção de account_id/event_id/payment_date/payment_method/settlement e metadados nos documentos geridos, com exceção estrutural restrita à derivação real. Ataque account_id recusado; documento sem grupo mantém legado. ABERTO: matriz exaustiva de todos os campos protegidos/restore administrativo.
F — ABERTO: locks settlements e revalidação da dívida adicionados; testes retidos três sessões passam, mas usam sleeps, barreiras de arranque e erros tolerados. NÃO certificam scheduler determinístico nem todas as esperas FK/advisory/listas/selagem. Revisão independente confirmou limitação. Não declarar encerrado.
G — CORRIGIDO nos casos isolados: settlement_id, supplier_credit_id, card_session_id, is_transitory com transitory_reason válido; cinco estados de listas ativas com removed_at NULL e qualquer export SEPA que contenha ID recusados. ABERTO: held_by_supplier_id precisa fixture legal (método compensation e trigger torna paid), demais campos de sessão/fornecedor e concorrência de listas ainda não integralmente provados. FKs dessas dependências continuam parcialmente ausentes.
H — CORRIGIDO no escopo testado: sandbox_exec* sem SELECT/INSERT command view e sem EXECUTE issue335_* / _issue335_* / RPCs novos; EXECUTE legado reconcile/reverse preservado. Default ACL real revelou fuga em issue335_invariant_counts, revogada e teste repetido. Dispatch explícito fail-closed para executor privado NOLOGIN. NÃO certifica todos os objetos/ACL globais.
I — CORRIGIDO parcialmente: DELETE OLD/recusa, limite 50, adoção amount validado, mensagem NOWAIT específica. Kill-switch/rollback separados desativam flag, RPC e view sem revogar reconcile legado. Teste confirma flag/ACL; ABERTO chamadas rejeitadas/in-flight, testes negativos 51 itens/adoption amount e rollback flag em concorrência.
J — NÃO CONFIRMADO integralmente: PostgreSQL local 17.9, catálogo consultado 17.6; execução exata em 17.6 não feita. Seis assinaturas legadas do rollback core byte-idênticas ao prosrc capturado; dois saldos rollback originais preservados. Paridade conhecida continua 390 objetos/368 iguais/22 FK ausentes explicadas/0 divergências no escopo fase2c. NÃO incorpora todo snapshot phase2e, índices/objetos adicionais/FKs transitivas; camarim completo não testado. Revisão independente não atesta ambiente Live; K explícito production.
K — CONFIRMADO, SELECT agregado production: D 34, G listas ativas 609, G exports SEPA 317. São contagens de documentos que satisfazem predicados, não somas monetárias nem diagnóstico individual; não concluir que todos os 34 são elegíveis ao encontro. Query e resultado integrais em live/phase2e-counts-query.sql / phase2e-counts-result.json. Nenhuma correção financeira executada.

### Testes finais realmente executados
- bash supabase/tests/issue335/run.sh: exit 0; PostgreSQL 17.9; candidatos aplicados/rollback como postgres NOSUPERUSER, defaults hospedados; casos authenticated dentro de fixtures preparadas pelo administrador local.
- Reprodução anterior phase2d ainda emite +100/+60 ANTES de instalar o candidato balance; phase2e depois prova +60. Não apagar essa reprodução.
- Injeção: 14 escritas físicas apply core/12 reverse; adaptador banco+BP 23 apply/17 reverse, snapshots públicos sem escritas parciais. Isso é o escopo coberto, não todas as possibilidades futuras.
- Seis prosrc rollback legados core: byte a byte iguais por assinatura, hashes em live/phase2e-rollback-prosrc-parity.json.
- Zero-history rollback: diff vazio nas funções/ACL/owners/relações/colunas/policies/triggers/constraints/papéis do harness. Grupos existentes recusam rollback com groups_exist_keep_guards. Matriz 17 invariantes retida idêntica.
- bunx vitest run --maxWorkers=2: exit 0, 221 ficheiros passed/2 skipped; 1953 passed/6 skipped/11 todo; 215.47 s.
- Testes focados prévia/#336: 19+9=28 passed; fronteira histórica #336 intocada.
- bunx tsgo --noEmit -p tsconfig.app.json: exit 0; NÃO tsc clássico.
- Build automático observado OK.

### SHA/CI e bloqueios de entrega
GitHub main consultado: a39f0388c4e9276bbe0aa1f8f595100bdd070ab9; CI completed/success run 39628493331, https://github.com/pedrompropicio/mundopropicio/actions/runs/39628493331. É BASE ANTERIOR, não CI destes edits. SHA local observado durante a fase 20da1c22bc5998b5ca0de87b64b79c27c633b2fb não existia no GitHub (422). Sincronização e CI FINAL destes artefactos NÃO confirmados; não rotular CI verde de entrega. A plataforma sincroniza commits após os edits; nenhum git push manual. Reserva mantida fase2e; #322/#323 intocadas.

### SHA256 fase2e candidatos exatos
```text
2d7473a1ea8e452a5e7c6cef2287937ea2abfbec77a6c88a3676dd0618b4e6c9  supabase/manual/20261021_issue335_offset_balance.INERTE.sql
a9fd863c5e7e426eaaab22dccec290d941f10b4b20bc9662472e04b635f4b899  supabase/manual/20261021_issue335_offset_balance.ROLLBACK-INERTE.sql
1bcb3c6e8f23258dcfb1903b881a23c47956c91e0737a03b65577d574bbcb1e2  supabase/manual/20261021_issue335_offset_core.INERTE.sql
33932071962992c6114d0c921c14ebdb6b5de7e95da78d40743599cc3859fc7b  supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql
7c2b57af9cc9cc7eefbf884985a20ced3eb560b4934bbd875bf3b6f7f5785842  supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql
3caeb7b7583c74cf9b95a8a12f27a10904bb95e81d7b77d48ccee6409e3f7164  supabase/manual/20261021_issue335_offset_group_storage.ROLLBACK-INERTE.sql
fe5edaf2b17d6412c4e576bed73df333f2fd0004d2178b8e1fd5e7d78b4484a5  supabase/manual/20261021_issue335_offset_invariants.INERTE.sql
edd924cd48d5378180e80a50547b5a5a4bbe378596155fc384fe127f051c5571  supabase/manual/20261021_issue335_offset_invariants.ROLLBACK-INERTE.sql
793ff37ed64747413786e1afdc15c7ce8a453a80d71f51caf49c53a4c8ea9df9  supabase/manual/20261021_issue335_offset_kill_switch.INERTE.sql
72297c516bfcb2ba966f1d796065c95c1dc12825a7056a35547f0a524bf3bd66  supabase/manual/20261021_issue335_offset_kill_switch.ROLLBACK-INERTE.sql
```

### Query K exata
```sql
-- READ ONLY: production aggregated counts; no financial values/IDs.
SELECT count(*) FILTER(WHERE t.type='"'expense' AND t.event_id IS NOT NULL AND t.forecast_id IS NULL AND t.parent_transaction_id IS NULL AND NOT coalesce(t.is_transitory,false) AND NOT coalesce(t.exclude_from_result,false) AND t.reversed_at IS NULL AND NOT coalesce(t.is_hidden,false) AND t.shared_cost_account_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.account_categories c WHERE c.id=t.category_id AND c.code LIKE '10.3%') AND EXISTS(SELECT 1 FROM public.events ev JOIN public.companies c ON c.id=ev.company_id WHERE ev.id=t.event_id AND coalesce(ev.budget_mode,c.default_budget_mode,'with_bp')='with_bp') AND t.status IN('approved','paid','partially_paid')) AS d_with_bp_no_forecast,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.payment_list_items i JOIN public.payment_lists l ON l.id=i.payment_list_id WHERE i.transaction_id=t.id AND i.removed_at IS NULL AND l.status IN('draft','pending_approval','approved','revision','partially_approved'))) AS g_active_lists,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.payment_list_sepa_exports e WHERE t.id=ANY(e.transaction_ids))) AS g_sepa_exports FROM public.transactions t\;
```


## Fase 2f — PARCIAL / NÃO ACEITE — 21/10/2026

Tudo LOCAL/INERTE. Nenhuma ferramenta de migração, alteração de migrations,
DDL/DML Live, dados financeiros Live, deploy ou Publish. Reserva #335 mantida.
As únicas consultas Live foram catálogo SELECT. #322/#323 intocadas.

### Estados e testes por ponto
D — PÁRA-PARA-DECISÃO. A reprodução histórica without_bp→with_bp continua
bloqueada pelo trigger real em paid→approved, atómica (phase2e.sql). Catálogo:
UPDATE para approved reavalia BP/verba; UPDATE para paid não reavalia. Não há
caminho demonstrado que reponha approved mantendo status intacto: a derivação
real repõe approved quando a dívida reabre. Guardar prior_status no item apenas
preserva prova da aprovação anterior; não resolve sozinho a transição.
Candidato SEPARADO approval.INERTE.sql + rollback exato +
live/phase2f-approval-prosrc.diff. Não instalado sequer no harness; é desenho,
NÃO correção aceite. A proposta preserva a verificação de permissão e limita a
exceção BP à reversão com grupo reversing/item aprovado, valores iguais,
pernas revertidas e soma derivada. Faltam testes de verba excedida/P0409,
novas aprovações e ataques ao candidato. Não aplicar nem enfraquecer aprovação.

F — CORRIGIDO apenas nos cenários novos cobertos. phase2f-concurrency.py usa
três sessões persistentes e pg_blocking_pids como barreira, sem sleeps/erros
tolerados: kill-switch ANTES aplica após fecho (defeito); DEPOIS recusa
P0001 encontro_desativado com zero grupo/pernas; chamadas novas 42501.
Drain: fecho espera transação admitida, só conclui após COMMIT, flag false.
Dois encontros: vencedor reconhecido mantém locks, rival exatamente 55P03,
um grupo. Writer reconcile settle: legado paga exatamente 1, rival 55P03.
INSERT normal FK: ambos concluem sem conflito com locks compatíveis.
ABERTO: transaction_offset_create cruzado, seal_event_settlement real,
inclusão concorrente em lista/SEPA e rollback/reabertura da flag concorrente.
Os cenários antigos de run.sh ainda usam sleeps: não substituídos integralmente.
O teste FK novo não prova a totalidade das 83 FKs ausentes.

J — CORRIGIDO versão exata: PostgreSQL 17.6 compilado localmente com contrib.
Deploy dos candidatos como postgres NOSUPERUSER/CREATEROLE/BYPASSRLS;
bootstrap/corrupção local como supabase_admin; defaults public reproduzidos no
escopo anterior. Live é aarch64, local x86_64; não é paridade de infraestrutura.
Catálogo recapturado: 35 relações, 692 colunas, 238 constraints, 204 índices,
1515 triggers (internos incluídos), 166 funções, 140 policies, 37 default ACL,
17 roles, 23 memberships, 2 schemas. FKs transitivas de saída capturadas.
Diferencial byte-exato pré-candidatos em phase2f-catalog-differential.json,
com valores Live/local integrais por objeto; NÃO normaliza prosrc/whitespace.
Paridade NÃO CONFIRMADA: 457 iguais, 2089 ausentes, 523 diferentes, 635 extras.
83 FKs ausentes, incluindo as 22 antigas; continuam bloqueios, não passes.
Camarim: funções/triggers capturados, teste real saldo/derivação/estorno NÃO feito.

A — CORRIGIDO integração da vigia no runner global _run_invariant_checks_extra
como candidato inerte opcional; zero→função corrompida→não conforme→zero
provado em phase2f-negative.sql. Regressão: o antigo prefix count de cinco
vigias falhou com a sexta; corrigido para exigir os cinco nomes do registry.
PG completo agora passa matriz 18 checks, apply/reverse/rollback iguais.
Misto +60 e corte as-of anteriores continuam passando. ABERTO: matriz integral
legado account X/compensation/transaction_offsets, camarim e guarda débito
servidor não certificadas; não alegar prevenção de saldo negativo.

E — ABERTO. Guardas anteriores passam no escopo retido, mas NÃO há ataque por
cada campo como editor/manager, nem prova integral restore/janela administrativa,
fecho selado via writers reais. Não ampliar janela nem alterar trigger instalado.

G — CORRIGIDO fixture held_by legal: receita/método compensation, trigger torna
paid, encontro recusa invalid_document sem grupo parcial. ABERTO: restantes
fixtures sessão/card/fornecedor e concorrência de listas; ausência de FKs limita
representatividade.

I — CORRIGIDO testes negativos: exatamente 51 itens→mensagem too_many_items;
adoção 39 contra requerido 40→legacy_offset_amount_mismatch; zero escritas
parciais. Chamadas novas/in-flight/drain cobertas em F. Reabertura concorrente
não confirmada. O núcleo/grupo permanecem candidatos inertes.

L — NÃO CONFIRMADO entrega final. Base GitHub main 3ffce9dc2577276e108e5fe975c020c259ab6cb2,
CI completed/success run 39637542161; phase2e e relatório da BASE iguais via API.
Esse CI NÃO cobre estes novos edits. Local observado e7babb995960e908773dbdb25d72ee1d8e2b9b26
antes do fecho documental. SHA final e CI dos edits aguardam sincronização
normal da plataforma; nunca git push manual. Incidente de atrasos GitHub ativo.

### Diferencial completo — interpretação
Cada entrada JSON inclui category/object/status/reason/live/local. "missing"
é dependência não reproduzida; "different" conserva os dois valores e exige
revisão; "local_extra" é bootstrap/objetos extra, não equivalência. Triggers FK
internos têm nomes OID gerados, contribuindo para missing/extra, sem omiti-los.
Colunas diferem no bootstrap (ordem/tipos/defaults/nullability), funções incluem
wrappers locais/ACL/config, relações/schema/roles/default ACL diferem na réplica.
O JSON é o diferencial integral DO ESCOPO CAPTURADO, não catálogo inteiro Live
nem closure de dependências dinâmicas de corpos PL/pgSQL.

```text
columns: iguais=153; ausentes=94; diferentes=445; extras locais=275
constraints: iguais=110; ausentes=128; diferentes=0; extras locais=32
default_acl: iguais=0; ausentes=35; diferentes=2; extras locais=0
functions: iguais=11; ausentes=96; diferentes=59; extras locais=22
indexes: iguais=25; ausentes=179; diferentes=0; extras locais=15
memberships: iguais=9; ausentes=14; diferentes=0; extras locais=0
policies: iguais=71; ausentes=69; diferentes=0; extras locais=27
relations: iguais=17; ausentes=5; diferentes=13; extras locais=28
roles: iguais=7; ausentes=8; diferentes=2; extras locais=0
schemas: iguais=0; ausentes=0; diferentes=2; extras locais=0
triggers: iguais=54; ausentes=1461; diferentes=0; extras locais=236
```
As 22 FKs antigas e suas causas individuais permanecem listadas na secção 2c
acima; não foram resolvidas. O novo diff expõe mais 61 FKs ausentes.
Este diferencial certifica apenas a igualdade ou diferença exata dos objetos e atributos capturados entre o catálogo Live e o harness; não certifica paridade integral com Live, dependências dinâmicas completas, equivalência de infraestrutura nem segurança para aplicação.

### Testes executados realmente
- phase2f-run.sh PG17.6: exit 0, negativos, runner saldo e cenários acima.
- run.sh completo PG17.6: exit 0, injeções retidas, rollback/ACL/história zero,
  matriz invariantes igual. Os sleeps antigos continuam uma limitação explícita.
- Vitest completo: 221 passed/2 skipped; 1953 passed/6 skipped/11 todo; exit 0.
- tsgo --noEmit -p tsconfig.app.json: exit 0. tsc clássico não executado
  (a plataforma proíbe typechecks clássicos/manuais; tsgo é o equivalente permitido).
- Preview automático: build OK observado; não há alteração UI para validar.
- approval separado NÃO instalado/testado. Não inventar passes D/E/J/camarim.

### SHA256 de todos os SQL candidatos e harness (fase 2f)
```text
23b2442b90a057534dd725666b5fb9fedc5ba2441aa12d1d5b614356b9edf7af  supabase/manual/20261021_issue335_offset_approval.INERTE.sql
5829c312ab4ce7fe41becc47d1f70f2f9a8f5e76b9b8bc6c3841b409778ac89a  supabase/manual/20261021_issue335_offset_approval.ROLLBACK-INERTE.sql
2d7473a1ea8e452a5e7c6cef2287937ea2abfbec77a6c88a3676dd0618b4e6c9  supabase/manual/20261021_issue335_offset_balance.INERTE.sql
a9fd863c5e7e426eaaab22dccec290d941f10b4b20bc9662472e04b635f4b899  supabase/manual/20261021_issue335_offset_balance.ROLLBACK-INERTE.sql
13e1e1e74fe9497e4d43597abf7d23a907a7798e768aebdb8b8d734bda13bb34  supabase/manual/20261021_issue335_offset_core.INERTE.sql
55da8f56b28c5002de3c7acda0275283348093c30bdfc56b9595971bf846c944  supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql
9a075e8ea8f4f3a854e8d628888a0f4d0c3fbfa6139033f3ea7170e8cbe49c4f  supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql
3caeb7b7583c74cf9b95a8a12f27a10904bb95e81d7b77d48ccee6409e3f7164  supabase/manual/20261021_issue335_offset_group_storage.ROLLBACK-INERTE.sql
1e3bae7e62d80c116f0cb29c7e41a647500d751f0b817b3cc3e93c4aa53626ee  supabase/manual/20261021_issue335_offset_invariants.INERTE.sql
edd924cd48d5378180e80a50547b5a5a4bbe378596155fc384fe127f051c5571  supabase/manual/20261021_issue335_offset_invariants.ROLLBACK-INERTE.sql
f22f588766bc99ef157af3a01f5e0e1e069109e05c303b49f07e637e02755d35  supabase/manual/20261021_issue335_offset_kill_switch.INERTE.sql
6baf725661f44978eb99ae5811e2fdf0095741ddefba99b823fe08bc759310ca  supabase/manual/20261021_issue335_offset_kill_switch.ROLLBACK-INERTE.sql
07068a430688eb963d4ade7b5305c88f41ccb41e7d429a59c009bca158f26bb6  supabase/tests/issue335/concurrency.sql
7f058a732181e963365cbf800eb6d9e6b342efa2fad5423fa7f12cb5aaa967cb  supabase/tests/issue335/derive.LIVE-BASELINE.sql
fb1a7398949ce2fb73c0d5749c73591aa91ca1552a8430618ae2bee67c74ed21  supabase/tests/issue335/live/dependencies.sql
55e6b6d91a977aa97dcd8001c50dffb9df71a290b047f24e0703634686181bf1  supabase/tests/issue335/live/functions.sql
fb4768371f61b502634a2ea4d647f3924760a7db733edf8f38e6e13f3c06660f  supabase/tests/issue335/live/phase2c-auth.sql
244fb56591b2ac48f6a51dec135c7d400e6a9346bb52150693a1678c4348a4f4  supabase/tests/issue335/live/phase2c-invariant-registry.sql
122ba034d0868e3af650b4c04fab9b658464403a7b0706d5ed24a70e24e8f9e9  supabase/tests/issue335/live/phase2d-constraints.sql
ae466ac60343bfdc6c2f68fa416bf68843e3241b5821557fdb01380fe94b170d  supabase/tests/issue335/live/phase2d-legacy.sql
533683f655d1250e6b86932fd10937b1e2f0de39bb4230c004d39414a8d15826  supabase/tests/issue335/live/phase2d-role.sql
93b2ddb76d7fa39986a38b103789a205c8808fc2713592d0a90446241737a2b1  supabase/tests/issue335/live/phase2e-balance-baseline.sql
80e29326c4fbe46d1ce443e0089287ae64725ae474b3357b4faeab63b3b301d6  supabase/tests/issue335/live/phase2e-counts-query.sql
9604803b46d815d5020ca1d25e8fa3b2776b824446facacb20e7e51a2397e180  supabase/tests/issue335/live/phase2e-replay.sql
ffb8ec79f61e7aa040810efc79d895fbbfd30fd1904308bc83397420c347c1fb  supabase/tests/issue335/live/triggers.sql
0f6e803bff83c2cf51e39d4ba09900daec20cbaab4ccb1943ccfb72d7c434d0e  supabase/tests/issue335/matching.INERTE.sql
ad43ef9cf31282d59907a5410644c0d8451704032bf8fc5ccfd123a966e1bd1d  supabase/tests/issue335/phase2b.sql
b71186f1a98461a974bf4e3961e2d75ac539a04a4bd0890c19df1131da155160  supabase/tests/issue335/phase2c-invariant-matrix.sql
240fd14e2a97496e910132ad7a5650b6f8b73f2405ba12dc4628b1bed06b9baa  supabase/tests/issue335/phase2c.sql
aadbd49eeb72406766eabc07804249f9a1a22f91aa6056d43fe77c4e8f469f02  supabase/tests/issue335/phase2d.sql
c510f3ee57b56c6d6df51f396708caa9daa3aad3ce17b3607f0de3a49bc59acc  supabase/tests/issue335/phase2e.sql
4fcb4bd26c45cd19a6859e5db502f9003c61de294e46751fa343fabed8bdcc8c  supabase/tests/issue335/phase2f-negative.sql
59ad9b2c68647da79c837cf4786d9550af7beeb3fe2bc39797404439bbd43b49  supabase/tests/issue335/reconcile_bank_line.LIVE-BASELINE.sql
ceed9e6b392595fc2db6347426fc5aa7c35cdc583a531f7cc754788ff4a630da  supabase/tests/issue335/scenarios.sql
25e2c812180ab99e4ae8aaa4cf0a5a39c470760e4cd2d232015ac5ba094ff5b0  supabase/tests/issue335/storage-only.sql
9afe41632efe76fbe43ebf4774d661fb6ecece12d125335d40b34dd81c2baeec  supabase/tests/issue335/stub.sql
6212eddfc81236f3c3fe31c8414a62d382fcdc0789c5c75ddcd830481139777c  supabase/tests/issue335/sync.LIVE-BASELINE.sql
4c4d5c91cc3502a066dc4ccbf79bf1930a6cd1dad88ac6b9e1c353e2dac0436b  supabase/tests/issue335/triggers.sql
a685a81bcee780949e1348e5ec7ff59bdc1bc23500c74e8930181946ac43f8d2  supabase/tests/issue335/validate.LIVE-BASELINE.sql
```
Hash deste relatório em docs/testes/issue335-fase2f-hashes.sha256, externo para
não criar referência circular. Esse manifesto também inclui catálogo/diff/harness.

### Bloqueios e limite final
Fase 2f NÃO ACEITE: D candidato aprovação não validado; F quatro corridas
pendentes e sleeps antigos; J paridade/FKs/camarim; A matriz/débito; E campos/
restore/selagem; G fixtures; I reabertura concorrente; L SHA/CI final.
A–C, saldo, approval, kill-switch e qualquer objeto instalado continuam NÃO
aplicados e dependem de Sim separado de Pedro após aceitação técnica.

## Fase 2g (21/10/2026) — PARCIAL / NÃO ACEITE

Harness: PostgreSQL 17.6 exacto (`/tmp/issue335-phase2f/pg17.6`), deploy como `postgres` NOSUPERUSER com default privileges de Live. Nada aplicado em Live; sem migrations, DDL/DML Live ou Publish.

1. D — candidato de aprovação TESTADO só no harness (`supabase/tests/issue335/phase2g-approval.sql`, ligado ao `phase2f-run.sh`):
   - ANTES (trigger de Live): estorno histórico without_bp→with_bp recusado 42501 "sem linha de BP"; estorno com verba excedida recusado P0409; grupo fica `applied` (atómico).
   - DEPOIS: (a) estorno histórico passa, documento volta a `approved`/paid 0, grupo `reversed`; (b) estorno com verba excedida passa, aprovação nova na mesma linha continua P0409; (c) aprovação sem linha de BP continua 42501; (d) editor sem `approve_transactions` recusado; (e) ataques recusados: GUCs forjadas (`issue335.trusted`, `issue335.reversing`, `app.bypass_approval`) em documento sem grupo → 42501 BP; INSERT/UPDATE de grupo `reversing` por `authenticated` → negado; restauro directo de documento em grupo `applied` → recusado; chamada directa a `_issue335_reverse` → 42501; mover grupo para outra empresa, mesmo como superuser do harness → `managed_operation_required`; grupo de outra empresa → `group_not_found`; (f) rollback repõe `prosrc` byte-a-byte igual ao capturado de Live.
   - Nenhum ataque passou; candidato não precisou de correcção. Diff final: `supabase/tests/issue335/live/phase2f-approval-prosrc.diff` (inalterado; inclui remoção de uma linha de comentário de Live, reposta no rollback).
   - Ressalvas: no ataque (e3) aceita-se qualquer erro (não um código único); em (d) a recusa pode vir de RLS (0 linhas) ou 42501. Estado: PÁRA-PARA-DECISÃO (instalar exige Sim).
2. E — matriz exaustiva por coluna, restauro atómico, janela administrativa e fecho selado: ABERTO (não executado nesta fase).
3. A — matriz de saldo lado a lado com funções originais e guarda de débito: ABERTO (mantém-se apenas a prova 2e/2f).
4. Camarim J.3: ABERTO. O harness nem tem os triggers de `camarim_sessions` (ver J).
5. F — offset_create cruzado, selagem real, lista concorrente, reabertura da flag; substituição dos testes com sleeps de `run.sh`: ABERTO. Passam (2f, repetido): encontro/encontro, reconcile settle/encontro, FK insert/encontro, kill-switch antes/depois/drain.
6. G — card_session/fornecedor e listas concorrentes: ABERTO.
7. J — diferencial classificado em `supabase/tests/issue335/live/phase2g-differential-classification.json` (critério lexical directo: identificador presente nos SQL candidatos ou testes 2d–2g; não fecha transitivamente corpos PL/pgSQL). Relevantes não iguais: 2316 (1148 triggers RI de FK em falta, 212 RI extra, 48 triggers de utilizador em falta, 409 colunas diferentes, 175 colunas extra, 27 em falta, 126 índices, 64 constraints, 32 policies, 32 default ACL em falta). Harness NÃO foi tornado fiel nesta fase.
   - Dependências de Live não reproduzidas com risco de alterar o resultado: `event_settlements.trg_guard_sealed_event_settlement` (fecho selado); `payment_list_items.trg_payment_list_items_bankable` e `payment_list_sepa_exports.trg_enforce_sepa_export_guard` (listas/SEPA); `events.trg_admin_windows_contiguous`, `trg_enforce_event_reopen_permission`, `enforce_event_close_blockers` (janela administrativa/fecho); triggers `camarim_sessions.*` (camarim); `trg_set_company_id` em 13 tabelas (empresa por defeito); `audit_*_changes` (auditoria); 1148 triggers RI (FKs/cascatas).
   - Paridade para o conjunto relevante: NÃO provada.
   - Frase: "O diferencial certifica apenas que os 457 objectos marcados iguais coincidem nos atributos capturados entre Live (PG 17.6) e o harness; NÃO certifica paridade do conjunto relevante ao #335, nem corpos de funções chamadas transitivamente, nem comportamento dos 48 triggers de utilizador e 1148 triggers RI ausentes."
8. L — ver resposta/Issue (SHA e CI).

Execuções: `phase2f-run.sh` (PG 17.6) exit 0; `run.sh` global em PG 17.6 exit 0; Vitest completo 219/223 ficheiros passaram, 2 falharam por timeout de hook sob carga paralela (newgang-crm-profile-fields, newgang-crm-whatsapp) e passaram isolados 35/35; tsgo exit 0; `tsc` clássico não executado (regra da plataforma).

Hashes: `docs/testes/issue335-fase2g-hashes.sha256`.

## Fase 2h — harness FIEL gerado do catálogo de Live (21/10/2026) — PARCIAL / NÃO ACEITE

Regras cumpridas: tudo local e inerte; só SELECT a pg_catalog/information_schema de Live (sem linhas de dados); nada em migrations; nada instalado em Live; sem Publish. PostgreSQL 17.6 local (Live: 17.6 aarch64; local: x86_64), recompilado com OpenSSL/libuuid para pgcrypto/uuid-ossp; pgvector 0.8.0.

Gerador: `supabase/tests/issue335/live/phase2h-extract.py` (só SELECT, psql persistente read-only) → `live/phase2h-catalog-ddl.json` (15.529 instruções, 16 schemas, todas as tabelas/funções/triggers/policies/ACL/default ACL/papéis). Captura: `live/phase2h-capture.sql`. Instalador: `phase2h-install.py` (como o dono real de cada objecto; postgres NOSUPERUSER). Diferencial: `phase2h-diff.py`. Runner: `phase2h-run.sh`; suite: `phase2h-suite.sh`; fixtures: `phase2h-fixtures.sql` (triggers reais, sem session_replication_role); adaptação de fixtures antigas: `phase2h-adapt.py`.

Instalação: 15.529 instruções, 0 falhas. Bootstrap de administrador documentado: criação do papel postgres e extensões; 78 objectos criados por sessão privilegiada como em Live (75 policies de storage.objects e 1 trigger auth.users.on_auth_user_created — não têm dono; 2 funções realtime com GUC SUSET, entregues depois ao dono real). Índices de tabelas particionadas: "ON ONLY" → "ON" para reproduzir os índices de partição anexados de Live.

Diferencial harness–Live (mesma metodologia 2f, ACL normalizado como conjunto): de 7.856 (1.ª tentativa) para **0 diferenças não explicadas**; 103 explicadas: 70 colunas + 7 CHECK de partições diárias realtime.messages (rodadas pelo serviço Realtime); 1 CHECK e 1 vista com normalização do deparser (mesma semântica); 1 índice inválido em Live (storage); 18 funções C de pg_cron/pg_net/pg_stat_statements/vault em stub que lança erro; 5 extensões não instaláveis localmente (pg_cron, pg_net, pg_stat_statements, pgmq, supabase_vault — objectos replicados como simples). Triggers RI: 2.934 iguais (contagem local = Live).

Certifica: que o harness local reproduz, objecto a objecto, o catálogo capturado de Live (schemas, tabelas, colunas e posições, constraints, índices, funções e corpos, triggers incl. RI, views, RLS, policies, ACL, default ACL, donos, papéis e pertenças) com 0 diferenças não explicadas no schema public. NÃO certifica: dados de Live (tabelas vazias; dados de referência só do código versionado), comportamento de pg_cron/pg_net/vault/pgmq/Realtime/Auth (GoTrue), arquitectura aarch64, nem que os testes do #335 passam no harness fiel.

Suite #335 no harness fiel (instalação group_storage/core/invariants/balance como postgres NOSUPERUSER: OK):
- scenarios: 6 blocos PASS (Estoril, replay, estorno integral, 4 documentos/IVA, BP atómico, viewer); FALHA no bloco #233 align/keep: o teste liga a mesma transacção a duas linhas e o índice real `uq_bank_line_matched_txn` de Live proíbe-o — pressuposto do teste inválido em Live, não defeito do SQL do #335; por corrigir.
- phase2b: FALHA em fixture (category_id aleatório viola FK real event_forecasts_category_id_fkey).
- phase2c: FALHA em cascata (depende de issue335_test.fail_write criada na 2b).
- phase2d: FALHA em fixture (event_partners.supplier_id NOT NULL em Live).
- phase2e: FALHA em fixture (profile já criado pelo trigger real on_auth_user_created).
- phase2f-negative: PASS.
- Mudança de resultado relevante: o estorno (paid→approved) só passou depois de carregar `role_permissions` do código (migração 20260902231429); sem isso o trigger real de aprovação recusa — confirma que D depende de permissões reais.
- Não executados nesta fase: phase2g-approval, concorrência, kill-switch, run.sh global no harness fiel; pontos E, A+camarim, G, F.

Defeitos reais do SQL do #335 encontrados: nenhum confirmado até onde a suite correu; as falhas acima são de fixtures/pressupostos dos testes antigos.

Hashes: `docs/testes/issue335-fase2h-hashes.sha256`.

## Fase 2i — suite completa no harness fiel (local, PG 17.6, postgres NOSUPERUSER)

Estado: PARCIAL / não aceite. Nada instalado em Live; sem migrations, DDL/DML Live ou Publish.

Resultado (`ISSUE335_SUITE=1 phase2h-run.sh`, base única, ordem do runner original): 11/11 PASS —
scenarios 9, phase2b 10, phase2c 2, phase2d 8, phase2e 7, phase2f-negative 2, kill-switch, invariant-matrix 1,
phase2f-concurrency 5 (3 sessões, arestas de lock observadas), phase2g-approval 3. Vitest 1953 passou; tsgo OK.

Classificação das falhas encontradas:
- FALHA REAL (corrigida só no SQL inerte): executor `issue335_executor` não tinha policy em
  `payment_lists`, `payment_list_items`, `payment_list_sepa_exports`, `partner_paid_expenses` (RLS de Live só
  para authenticated) → lia zero linhas e as guardas de lista/SEPA/despesa de sócio passavam (fail-open).
  Antes: "list accepted draft". Depois: as cinco situações de lista e o SEPA são recusados. Policy SELECT
  `issue335_guard_read` por empresa + DROP no rollback.
- FALHA DE FIXTURE (adaptadas sem enfraquecer asserções): categoria FK, fornecedor/nome em fecho, selo só por
  RPC, `payment_lists.title`, SEPA exige lista aprovada e metadados, IBAN do fornecedor (trigger bankable),
  status 'approved' explícito no teste Python, linhas de extrato com statement_id/line_hash, #233 keep com 2.ª
  transacção (uq_bank_line_matched_txn).
- 2d saldo: reprodução do defeito passa a usar a cópia byte-igual da função de Live (delta=100) E exige
  delta=60 no candidato instalado.

Dados de referência: `phase2i-reference-data.py` repete as 27 instruções `role_permissions` de 23 migrações
versionadas (0 erros). `manage_bp` não existe em nenhuma migração; fixture por `user_permissions` só no admin
de teste (como a UI faria).

Ainda em aberto: E (restore/janela por coluna), A+camarim (as-of/estorno camarim), paridade de matching
(`matching-parity.ts`) não portada para a suite 2h; F/I continua REPRODUZIDO-aberto no BEFORE.

Hashes: core.INERTE `95e9c558d653bc9ec3606b8e9209c703652d9c2887156e044c367b18d9e54959`;
core.ROLLBACK-INERTE `40cd3b313c4040ba80d88022f1c0bfd468c0839bfec54679e6d22db4315cf7de`.

## Fase 2j — LOCAL/INERTE (21/10/2026)

Harness fiel PG 17.6, `postgres` NÃO-superuser, triggers reais. Nada em migrations, nada em Live, sem Publish.
Decisão do Pedro: `manage_bp` dado por `user_permissions` no fixture (não existe em migrations versionadas).

### Suite (fresca, sequencial) — 13/13 PASS, 0 falha real, 0 falha de fixture
scenarios 9 · 2b 10 · 2c 2 · 2d 8 · 2e 7 · 2f-negative 2 · kill-switch · invariant-matrix 1 · 2f-concurrency 5 ·
2g-approval 3 · matching-parity 1 (8 casos) · phase2j 11 (J0–J7b) · phase2j-concurrency 7 (F1,F1b,F2,F2b,F3,F4,F4b).
Rollback completo (harness limpo, `phase2j-rollback.sh`): impressão digital do catálogo antes = depois.
Vitest 221 ficheiros / 1.953 passaram (6 skip, 11 todo), sem timeouts. tsgo OK. tsc clássico: 2 erros
pré-existentes em `src/lib/bank-statement/parse-santander.ts:208` (ficheiro não tocado na 2j).

### Alterações de teste (motivo)
- `matching-parity.ts`: cria categoria L3 local por caso (FK real `event_forecasts_category_id_fkey`); asserções iguais.
- `phase2f-concurrency.py`: aceita socket do harness 2h; asserções iguais.
- `phase2h-suite.sh`: liga matching-parity, phase2j e phase2j-concurrency.
- Novos: `phase2j.sql`, `phase2j-concurrency.py`, `phase2j-rollback.sh`.

### Achados reais e correcções (SQL inerte, com ANTES/DEPOIS)
1. E: `issue335_guard` não protegia 24 colunas de identidade/elegibilidade (fx_rate, original_amount, parcelas,
   payment_method, reversed_by/reason, split_*, retenção, held_by, card_session, settlement, supplier_credit,
   cache_contract, shared_cost_account, is_transitory, parent, is_reimbursement, currency). Corrigido (tuplo imutável).
   DEPOIS: 388 ataques (64+34 colunas × editor/manager × gerido/legado) — gerido: 144 recusados `reverse_entire_group`,
   FK/CHECK/RLS nos restantes com valor inválido; permitido-inofensivo (não mexe pernas/saldo/grupo): description,
   specification, date, due_date, invoice_ref, invoice_group_id, payment_entity/reference, iban_override,
   pl_override_note, reimbursement_to, exclude_from_result, fx_rate_source, cache_root_event_id,
   cache_artist_supplier_id, created/updated_at. Risco residual analítico: paying/ordering_partner_id,
   shared_cost_counterparty_id, category_id (testados só com valor inválido → FK; com valor válido seriam permitidos).
   Legado: idêntico ao Live (112 aplicados, restantes recusados por constraints/RLS existentes).
2. J7 camarim: ANTES encontro sobre perna de adiantamento aceite e espelhado na sessão (40,00 como `transfer`) →
   dinheiro fictício. DEPOIS recusado `camarim_leg_unsupported`, zero pagamentos, sessão intacta.
3. F1: ANTES `transaction_offset_create` por confirmar × encontro → ambos aplicavam. DEPOIS 55P03 exacto
   (lock `FOR UPDATE NOWAIT` em execute/reverse conflitua com KEY SHARE de inserções pendentes).
4. F1b: ANTES encontro em curso × par legado → par legado criado sobre documento gerido. DEPOIS recusado
   `managed_operation_required` (KEY SHARE explícito antes da verificação no guard).
5. F3: inclusão em lista por confirmar × encontro → DEPOIS 55P03, zero grupo (mesma correcção do F1).
6. Rollback saldo: `AS $function$;` deixava `;` no corpo restaurado (não byte-idêntico). Corrigido.
7. J5 (NÃO corrigido, só detectado): `restore_apply_from_shadow` (Live, SECURITY DEFINER) desliga triggers de
   utilizador por desenho; restauro só de `transaction_payments` deixa grupo `applied` sem pernas. Vigias #335
   detectam (0→2). Impedir exigiria alterar o restauro instalado → decisão do Pedro.

### Policy `issue335_guard_read` (2i) — substituída
A 2i acrescentava policy SELECT por empresa a payment_lists, payment_list_items, payment_list_sepa_exports,
partner_paid_expenses. 2j: removida; usa `issue335_payment_flow_blocked(uuid)` SECURITY DEFINER, dono postgres,
search_path fixo, EXECUTE só `issue335_executor` (revogado a PUBLIC/anon/authenticated/service_role/sandbox_exec*),
devolve só booleano. Zero policies/GRANTs novos nessas 4 tabelas (J0). Menor superfície: sem leitura de linhas
pelo executor. Risco: função definer (mitigado por ACL + search_path). Rollback: DROP FUNCTION.

### Estado por tema
- E: J1 matriz, J2 selado (estorno/reverse recusados; ok após reabrir), J3/J3b janela, J4 fecho/reabertura 42501,
  J5 restauro = ACHADO aberto.
- A+camarim: J6 matriz 8 casos (legado = Live; caso 4 Live 150 vs candidato 210 = dinheiro real; débito coerente);
  J7/J7b camarim recusado. Guarda de débito servidor: `account_has_balance_for` só é consultada pelo cliente
  (sem writer servidor que a imponha) — interacção documentada, não reforçada.
- Matching: paridade 8 casos JS↔SQL no harness fiel PASS.
- F/I: barreira por `pg_blocking_pids` (aresta observada, polling com prazo 8s, sem sleep fixo), sem erros tolerados. Os testes 2f antigos
  continuam na suite. Não testado: encontro em curso × inclusão em lista (fica legado: lista após pagamento).

## Fase 2k — LOCAL/INERTE, PARCIAL / NÃO ACEITE (21/10/2026)

Nenhuma migration/tool, DDL/DML Live, deploy ou Publish. Só catálogo oficial e contagens agregadas autorizadas.
Reserva #335 mantida. A–C e cada candidato a objectos instalados continuam sem autorização de aplicação.

### Leituras e revisão independente — limites explícitos
Relidos AGENTS.md, supabase/AGENTS.md, plano, QUADRO, roadmap, memórias compensacao-ligada/payment-account-ownership,
questões/hashes 2j, relatório 2h–2j, Issue #335 e TODOS os 11 comentários; os 12 SQL originais e rollbacks,
phase2h-run/suite/install/fixtures/adapt, phase2j.sql/concurrency/rollback/capture.
Três agentes independentes só leitura reportaram lacunas; dois não completaram a releitura integral por truncamento.
Não certifico a releitura integral de TODOS os testes antigos e TODOS os artefactos de live/. JSON completo percorrido
programaticamente não equivale a revisão semântica integral. A fase 2k não satisfaz ainda este requisito.
Quarto parecer classificou 26 consumidores; algumas alegações (por exemplo “nenhuma public view”) não foram validadas
e não são adoptadas como prova. Pesquisa fresca em pg_proc/pg_views: 26 funções com paid_amount+account_id, zero views
nesse critério textual; não certifica dependências dinâmicas/indirectas nem todos os relatórios cliente.

### ANTES / DEPOIS efectivamente executados
- A1: harness antes caixa=478,00, saldo=1.158,00; vigia antiga diff=0/is_balanced=true. Candidatos separados
  get_event_cash_position/get_event_cash_position_invariant: depois caixa=saldo=1.158,00, diff=0.
  São montantes de fixtures LOCAIS, não dados de Live. committed/pending conservados. Matriz integral por evento,
  moeda/corte e extractos cliente ainda aberta; adj_agg legado não foi harmonizado e pode continuar divergente.
- Analíticas: ANTES category_id válido e exclude_from_result=true eram alteráveis num documento gerido.
  DEPOIS ambos recusados por reverse_entire_group como editor/manager. Tuplo também bloqueia paying/ordering_partner,
  shared_cost_counterparty, cache_role/root/artist, operation_key, invoice_group_id e transitory_reason.
  Valores válidos para TODOS estes FKs e matriz completa ainda não executados; não extrapolar estes dois casos.
- A2/J5: reprodução anterior retida pela suite 2j. Candidato SEPARADO restore_apply_from_shadow recusa antes de
  DISABLE TRIGGER USER: sete tabelas geridas e global com grupos; nenhuma escrita parcial ou trigger desligado.
  Escolha conservadora: QUALQUER restauro da empresa com história gerida é recusado, incluindo grupos revertidos;
  global/rows com qualquer grupo recusados. Sem história na empresa B, restauro real de payments vazio executa.
  Control é sempre recusado em p_tables/extra_deletes: backup não autoriza reabrir kill-switch. Teste específico
  control+flag fechada, restauro in-flight e importação de grupos para empresa sem história ainda abertos.
  Risco funcional declarado: bloqueia também tabelas não geridas da empresa; não é desenho de restauro global coerente.
- M5: ANTES payment_transaction_id de reimbursement_notes era aceite. DEPOIS unsupported_debt, zero grupo/pernas.
- M6: ANTES pagamento real em conta diferente de transactions.account_id era aceite. DEPOIS
  cash_account_inconsistent, sem escritas parciais. Recusa conservadora também conta de perna nula.
- M4/M7 elegibilidade: helper de leitura agora recusa vínculos de reembolso/card loads/aporte mirror e contas
  mirror/ticket_office/prepaid_card/camarim_session no documento ou pernas. Testes específicos mirror/card ainda abertos.
- Body ';': removido do início dos dois corpos candidatos de saldo. Cinco rollbacks comparados byte a byte ao
  prosrc fresco (approval, invariants, caixa, vigia caixa e restore), iguais; hashes em rollback-body-parity.json.

### Resultados reais
PG 17.6 exacto, instalação/suite como postgres NOSUPERUSER, triggers reais: 15.529 instruções, 0 falhas;
diferencial inicial 0 diferenças não explicadas (103 explicadas), 2.934 RI iguais. Suite retida 13/13 PASS fresca
com core final; seis marcadores focados 2k PASS. Isto NÃO certifica os 13 pontos completos da 2k.
Rollback NOVO phase2k-rollback.py: nove instalações+nove rollbacks em harness limpo; captura COMPLETA antes=depois,
incluindo funções/owners/ACL/roles/memberships/default ACL/colunas/defaults/tipos/índices/triggers RI e user/policies/views.
Corrige a alegação excessiva anterior: phase2j-rollback.sh só comparava fingerprint limitado, não catálogo integral.
Vitest completo: 221 ficheiros passaram/2 skipped; 1.953 passed, 6 skipped, 11 todo, 189,80s.
tsgo/tsc NÃO executados nesta fase: regra superior do ambiente proíbe typecheck manual. Resultados 2j não são 2k.
Build automático observado OK (20:57 UTC); não equivale a tsc.
Alteração de teste: shadow_prepare já cria sombra vazia; removida chamada restore_shadow_load([]), que o loader real
recusa por ausência de colunas. Mantida asserção de estado vazio e função real de restauro, nenhuma guarda desligada.

### Catálogo / contagens Live (só números)
M6: 347 documentos com dinheiro em perna sem conta; 5 com conta diferente; união=352.
No predicado conservador de elegibilidade consultado: 0/0/0. Não é prova de que futuras pernas inconsistentes
sejam impossíveis; o teste local acima reproduziu admissão indevida. Nenhum valor monetário/ID/linha retornado.
Tamanhos agregados: transactions=2013, payments=1462, bank_statement_lines=229, offsets=7.
Inventário automático backup_table_inventory inclui groups/items como empresa e control como global no harness.
Não prova que backups existentes contenham estes objectos ou uma fotografia transaccional coerente.

### Inventário dos 26 consumidores — decisão preliminar, não encerramento exaustivo
Ajustar, candidatos separados preparados: _account_true_balance_raw/_asof_raw, get_event_cash_position,
get_event_cash_position_invariant. _ticket_office_balance_raw: fonte distinta, recusa conservadora de contas ticket_office
adicionada, regressão pendente. sync_partner_aporte_mirror: recusar conta/vínculo mirror (regressão pendente).
camarim_sync_session_leg_payment: core recusa pernas camarim, testes 2j mantidos. card_load_on_out_paid: vínculo card
agora recusado, regressão pendente. sync_shared_cost_mirror/_cache_create_contract/create_settlement_transfer:
dívidas shared/cache/settlement/transitórias recusadas por elegibilidade; provar os caminhos legais todos ainda aberto.
split_transaction_by_bp_lines/renegotiate_transaction_installments: pagamentos/parcelas incompatíveis, manter legado.
reverse_payment/reverse_transaction/reconcile_bank_line/_apply_transaction_offset: guardas/core preservados;
ACL reconcile/reverse não alterada nesta fase. save_ticket_office_settlement/reverse_ticket_office_settlement/
data_entry_assistant_execute_333/launch_from_bank_lines: dependências writers, prova atómica de todas entradas pendente.
materialize_paid_amount_payment: manter derivação bruto, prova de ausência de materialização fictícia ainda pendente.
_run_invariant_checks_raw/_paid: bruto pago é liquidação, não caixa; não converter para dinheiro.
_run_invariant_checks_cards: falso duplicado por account_id/gross possível, classificação/teste pendentes.
_run_invariant_checks_extra: compensação legada e vigias #335 já no candidato; vigia independente integral pendente.
Relatórios cliente ReportBankStatement/ReportCashFlow e helpers computeAccountBalance: revisão apontou fórmula antiga;
NÃO alterados e coerência UI/extracto NÃO provada. Por isso A1 completo permanece aberto apesar do teste SQL passar.

### Achados abertos, por prioridade
M1 CONFIRMADO local: postgres faz SET ROLE issue335_executor; UPDATE amplo em companies/suppliers/events/accounts/
event_settlements. Ainda NÃO corrigido; falta contexto estrutural não forjável e superfície mínima de locks/ACL.
M3: preservar prior_status partially_paid e instalação approval; teste antes/depois e candidato separado pendentes.
M4 kill-switch: continua um nível, fecha estorno, reactivação/ACL exactos e erro claro ainda pendentes. Nada instalado.
M5/M7: mapa mirror/reimbursement/camarim/card, serialização company/account e corridas três sessões ainda pendentes.
M6: vigia independente, união contas documento/perna/grupo e matriz as-of ainda pendentes.
E: matriz completa valores válidos, classificação todos erros/skips, legado idêntico, ainda pendente.
Baixos: user_permissions RLS, sandbox_exec real, replay entre utilizadores, ON DELETE RESTRICT/import/upsert,
índices/lock_timeout/tamanhos ainda não encerrados. Rollback completo e body parity provados no escopo acima.

### A/B/C, ordem e SHA/CI
A storage; B core + dependências legadas; C registo/invariantes. Adicionais SEPARADOS: saldo, approval,
restore_apply_from_shadow, get_event_cash_position e get_event_cash_position_invariant, kill-switch/reactivação.
Ordem local provada: storage→core→invariants→balance→approval→kill-switch→cash→cash-invariant→restore; rollback inverso.
Esta ordem não é recomendação de aplicação: M1/M3/M4 e regressões em aberto impedem aceitar o pacote.
Policy issue335_guard_read 2i permanece AUSENTE nos candidatos actuais; helper DEFINER sem GRANT/policy nas quatro
tabelas, agora lê mais dependências. Novo helper não elimina necessidade de autorização B para policies internas
e guardas/colunas existentes; candidato restore é autorização adicional explícita.
Live BEGIN…ROLLBACK não executado/autorizado; depois da aceitação, prova Live de ACL/owners, migração transaccional,
concorrência/writers reais, backups coerentes e saldos deverá ter autorização separada (não acionar automaticamente).
API: remoto main=f4cf8d4b9ef977cff4c0088cc11ce25d019c759e, CI success run 39670367135, ficheiro phase2k-focused
devolve 404 nesse SHA. HEAD local observado ee65756f55da960ab6b6c057846bde72964c22f8. CI NÃO cobre os edits 2k.
NÃO pronto para pedir A–C. Artefactos e outputs em live/phase2k; hashes em issue335-fase2k-hashes.sha256.

## Fase 2l — PARCIAL / NÃO ACEITE (21/10/2026)

Nada instalado em Live. Sem migrations/tool, DDL/DML Live, Publish, deploy ou alteração de UI. SELECT Live exclusivamente a catálogo de funções (owners/ACL/search_path/md5 prosrc); nenhuma linha empresarial nem nova contagem.
Restauro conservador mantido: empresa com história gerida recusada; control nunca restaurável. Reserva #335 mantida; #322/#323 preservadas.

### Achados e alterações locais
- M1 ANTES: postgres SET ROLE executor passou; chamada interna com JWT válido atingiu `invalid_request`, logo ultrapassou a barreira de identidade. DEPOIS: associação temporária só durante instalação, revogada antes COMMIT; contexto privado backend PID+xid8+token+op criado pelo trigger de comandos. Guard/worker/core exigem contexto e profundidade de trigger. GUC isolada/reutilizada não autoriza. Cinco UPDATE amplos removidos; locks de events/settlements delegados a helper sem DML, fornecedor/conta usam advisory. Contexto desaparece ao terminar RPC/abortar. Table owner verdadeiro continua administrador, fora do modelo de adversário; não se promete impedir postgres de reescrever objetos.
- M1: 3 marcadores focados como postgres NOSUPERUSER, simulação explícita de SET-role após devolver apenas membership em transação revertida; authenticated worker negado, token falso/contexto INSERT e UPDATE nas cinco tabelas recusados. Matriz completa service_role/sandbox/direct triggers não encerrada.
- M3: novo candidato SEPARADO `_derive_paid_amount` mantém toda fórmula legada fora de reversão provada. Guarda restaura prior_status/prior_payment_date, paid_amount só pela derivação real. Approval exige contexto reverse, prova de grupo reverting, pernas revertidas e valores anteriores. Parcialmente pago sem candidato status é recusado antes de escrever. Status candidato exige marker approval; rollback core exige desfazer ambos primeiro. 3 marcadores: ordem errada e approved/partially_paid exatos. Caso parcialmente pago com pernas anteriores não nulas e matriz status paid ainda não fechados. paid sem dívida continua recusado pelo núcleo.
- M4: enabled para admissão, reverse_enabled para emergência. Nível1 enabled=false conserva estorno; nível2 ambos false; reativação explícita, ACLs nunca reescritas. Erro `encontro_desativado`. Fence advisory exclusivo drena operações admitidas; testes concorrentes existentes repetidos, expectativas de erro atualizadas de 42501 para P0001 encontro_desativado, não removidas. 3 novos marcadores nível1/reverse, nível2/reverse, igualdade ACL de entradas e writers legados. Corridas específicas emergência/reverse ainda abertas.
- Runners agora falham efetivamente com FAIL, instruções não instaladas ou diferenças não explicadas. O primeiro ensaio novo detectou default ACL vazada no worker após ALTER OWNER: corrigido REVOKE executado como dono executor; suite sandbox voltou a passar.
- Rollback restore agora também recusa história antes de repor objeto inseguro. Candidatos adicionais permanecem separados e inertes.

### Resultados executados
- PG17.6 exato, catálogo capturado 15.529 instruções/0 falhas/0 diferenças não explicadas e 2.934 RI iguais; postgres NOSUPERUSER, triggers reais.
- Suite completa atualizada `phase2h-run.sh`: 14/14 grupos PASS incluindo phase2l (9 marcadores), exit0. Não significa os 11 requisitos integralmente aceites.
- Harness limpo separado: 12 pares instalados/desfeitos, captura integral antes=depois; diferenças `{}`. Funções/ACL/owners/roles/membership/defaults/colunas/índices/triggers/RI/policies/views incluídos. Status rollback prosrc original incluído.
- Vitest primeira execução: 1 ficheiro falhou por timeout beforeAll Newgang (1944 passed). Repetição completa SEM editar testes, maxWorkers=4: 221 passed/2 skipped; 1953 passed,6 skipped,11 todo, exit0.
- tsgo/tsc NÃO executados: proibição do ambiente de typecheck manual. Build automático observado OK. Não usar esse sinal como tsc.
- Artefactos integrais em `supabase/tests/issue335/live/phase2l/`. Manifesto externo `docs/testes/issue335-fase2l-hashes.sha256` (sem circularidade).

### Pendências obrigatórias — não resolvidas nesta fase
- M5/M7: inventário transitivo completo locks/writers/triggers, novas três sessões wait_event/barreiras e caminhos legais/recusas mirror/card/shared/cache/settlement/transitórias/reembolso. Testes anteriores passaram; não substituem nova matriz.
- M6: vigia independente por perna/extrato/união conta documento-perna-grupo, as-of, corrupção ainda NÃO implementada. Vigia atual reutiliza fórmula e não pode certificar independentemente. `cash_account_inconsistent` mantido. Para 352 casos históricos da 2k (347 nula,5 diferente): só propor auditoria classificada por documento/perna/corte e decisão manual; nunca preencher/apagar automaticamente nem mudar saldo legado.
- E: matriz integral por coluna com valores válidos/editor/manager e paridade legada ainda aberta.
- Baixos: user_permissions/RLS, replay por outro utilizador, impacto completo sandbox REVOKE, edge upserts/imports/ON DELETE, tamanho/índices ainda abertos. `request_actor_mismatch` acrescentado à replay mas não novo teste específico.
- Leituras por ficheiro: manifesto explícito `issue335-fase2l-leituras.md`; requisito completo NÃO satisfeito.
- Cliente (nenhuma UI alterada): account-balance.ts e ReportBankStatement/ReportCashFlow retêm paid_amount/account_id. BankReconciliation escreve links/statement. Decisão recomendada: separar dinheiro/liquidação para documentos geridos, preservar corte legado; exige desenho/testes próprios, não aplicar nesta tarefa. Inventário ainda não exaustivo.

### A/B/C e candidatos / risco / ordem
A storage: control reverse_enabled, items prior_payment_date, contexto privado. B core: guards/dispatch/worker, privilégios mínimos e locks, wrappers legados. C invariants/registry: original mantido, vigia independente aberta. Todos NÃO aceites para aplicação.
Separados: balance (2 funções), approval (1 trigger function), status (derive), cash_position, cash-invariant, restore; kill-switch/emergency/reactivation operacionais. Diff novo derive em live/phase2l; demais diffs existentes 2k não regenerados integralmente: lacuna declarada.
Ordem local rollback testada: storage→core→invariants→balance→approval→status→kill-switch→emergency→reactivation→cash→cash-invariant→restore; inverso para zero história. Risco: regressão de status/ACL/writers e bloqueio conservador de restauro; com história nunca remover guards/objetos, apenas procedimento operacional autorizado.
Nível1: executar candidato kill_switch, esperar confirmação (drain); estornos permitidos. Nível2: emergency, ambos bloqueados. Voltar de nível2 a nível1 via emergency rollback; reativação plena via reactivation após revisão; sem tocar GRANT. Os scripts operacionais têm estados de origem distintos, rollback não é restauração arbitrária de estado desconhecido. Restauração exata de flags prévias arbitrárias NÃO provada; requisitoM4 permanece parcial.
Provas futuras Live BEGIN…ROLLBACK (não executadas): owners/ACL reais, aprovação/status com linhas reais, coerência saldos/extrato, locks concorrentes/backups e importações. Só depois da aceitação técnica e de Sim separado.
API remoto observado: main `59e8fe039e929512ca837edf43ff4b4f47c89c9c`; CI success run39676081024; phase2l.sql HTTP404 nesse SHA. Não contém os edits 2l; presença/hash/CI final NÃO comprovados. Nenhum commit/push manual.
Conclusão: 2l PARCIAL / NÃO ACEITE, não pronto para pedir A–C. Bloqueios técnicos não exigem nova decisão comercial; autorização de instalação permanece separada.

## Fase 2m — PARCIAL / NÃO ACEITE (21/10/2026)

Esta execução NÃO fechou os bloqueios da 2l. Nenhum dos oito blocos foi certificado fechado.
Sem ferramenta de migração, novas migrations, DDL/DML Live, deploy, Publish ou alterações de cliente.
Os candidatos SQL existentes não foram alterados. Restauro conservador e `cash_account_inconsistent` mantidos;
control nunca restaurável. Reserva #335 mantida; #322/#323 preservadas.

### Leituras — requisito prévio NÃO satisfeito
Manifesto: `docs/testes/issue335-fase2m-leituras.md`, com ficheiro/intervalos/hash/revisor e NÃO LIDO explícito.
Documentação requerida, todos os 24 SQL manuais e Issue corpo+13 comentários certificados nas leituras registadas.
O conjunto de testes/capturas NÃO foi lido integralmente. Leituras delegadas truncadas não contam como certificação.
O ficheiro questões2l está ausente; não foi possível renomeá-lo. Pasta live/phase2k EXISTE (corrige impressão inicial).
A execução da regressão e criação do teste M1 ocorreram antes de completar o requisito de leitura: desvio declarado,
não usar esta fase como cumprimento da ordem solicitada. SHA de leitura é histórico, não o hash pós-edição.

### Resultados novos efetivamente executados
- Harness fiel PG17.6 exato: postgres NOSUPERUSER, triggers reais, 15.529 instruções/0 falhas,
  2.934 RI iguais e 0 diferenças não explicadas. 14/14 grupos anteriores passaram; phase2l tem 9 marcadores.
  É regressão da 2l, NÃO prova de todos os novos requisitos 2m.
- `phase2m-context.py`: 10 identidades × 24 entradas =240 linhas: 190 asserções/50 observações de grants.
  15 funções internas por identidade; GUC aleatória; segundo token aleatório; INSERT contexto e SET ROLE executor.
  Resultado final:0 expectativas inesperadas. UPDATEs são SÓ observações `has_table_privilege`, não ataques reais.
  Token de outra transação válida NÃO exercitado; o segundo UUID aleatório NÃO é replay de token válido.
- Primeiro ensaio falhou na assunção sandbox pelo postgres (42501): erro de montagem do ensaio.
  Segundo produziu25 discrepâncias: identidade bootstrap superuser contaminava SET ROLE; grants service-role
  intencionais de vigias e retornos booleanos/numeric eram mal classificados. Nenhum candidato SQL foi corrigido.
  Ensaio final usa SET SESSION AUTHORIZATION nos NOLOGIN via bootstrap; comandos executam como papel não-superuser.
  Owner verdadeiro pode administrar contexto; não alegamos proteção contra DDL do owner. Asserções não foram
  removidas; expectativas corrigidas segundo grants explícitos já existentes, observações retiradas do PASS.
- Harness limpo separado:12 pares candidatos instalados/desfeitos, captura integral before=after, diferenças `{}`.
  Prova limitada ao catálogo e composição canónica sem história; NÃO restaura arbitrariamente flags/dados prévios.
- Vitest completo maxWorkers4:221 ficheiros passados/2 skipped;1953 testes passados/6 skipped/11 todo;exit0.
  Sem timeout nesta corrida.6 skips existentes:#333 worker opt-in4, receipt capturado opt-in1,
  integração partner-statement dependente de token1.11 todo:bilhetes multi-dia4 e tickets-v2/read-layer7.
  Classificados, não PASS; não ativadas provas externas nem alteradas asserções para esconder falhas.
- tsgo/tsc não executado: regra do ambiente proíbe typechecks manuais neste projeto; verificação automática
  registou build OK. Este sinal não equivale a tsc.
- Aviso bootstrap `locale: command not found/no usable system locales`: não interrompeu initdb; catálogo
  comparado com zero diferenças não explicadas. Sem alegar equivalência de collation além dessa captura.

### Estado por bloco
1. M1 PARCIAL:matriz190 asserções nova; faltam token válido cruzado/reutilizado, chamada sob contexto roubado,
   UPDATE real nas5 tabelas e matriz executor com GUC/operação válida. Não basta grant observado.
2. M3 ABERTO:regressão2l approved/parcial sem pernas anteriores e ordem errada passa; casos parcial com pernas
   antigas/novas, paid e sem BP não foram adicionados. paid sem dívida é recusado; não mudar regra só para testar.
3. M4 ABERTO:níveis1/2 e ACL canónica retestados; emergência concorrente execute/reverse NÃO adicionada.
   Scripts operacionais continuam sem restauro de flags arbitrárias/guarda de estado desconhecido.
4. M5/M7 ABERTO:corridas antigas5+7 passam; mapa transitivo/writers legais/refusados e novas3 sessões faltam.
   NOWAIT/documentos ordenados e advisory supplier/account existem; não provam ausência universal de deadlock.
5. M6 ABERTO:nenhuma vigia independente nova, matriz as-of/união contas/corrupção não executada.
   347+5=352 casos históricos:contagem da2k, NÃO nova medição Live. Proposta:auditá-los por perna/conta/corte,
   guardar classificação e pedir decisão para correção individual; sem preencher contas/reinterpretar legado.
6. E ABERTO:ataques antigos retestados; matriz completa valores válidos/editor+manager/paridade legado ausente.
7. Baixos PARCIAL:grep/read-only identifica permission bank helper,replay actor guard,upsert ignoreDuplicates,
   RESTRICT e tradução lock/deadlock. Não prova user+permission RLS, replay2 utilizadores, efeitos sandbox/dynamic
   edge/delete/import/índices. Sem novas contagens/tamanhos Live; janela de índices não aprovada.
8. Cliente PARCIAL:inventário11 consumidores/referências em `issue335-fase2m-cliente.md`; nenhuma edição cliente.
   Relatórios/helper/cards/previews usam paid_amount em percursos; FinancialAccounts usa RPC de saldo nos cards.
   Inventário não exaustivo. Recomendação separada:definir caixa pela perna/conta/data com corte legado e distinguir
   liquidação, preservando fontes canónicas/ajustes/estornos; não implementar sem decisão própria.

### A/B/C e candidatos — NÃO prontos para instalação
Todos os nomes abaixo referem-se a `supabase/manual/20261021_issue335_<nome>.INERTE.sql`;
rollback correspondente `<nome>.ROLLBACK-INERTE.sql`. Diferenças prosrc não foram regeneradas em2m.
A `offset_group_storage`:tabelas/contexto/colunas/grants/RLS; rollback remove só sem história; risco integridade/restauro.
B `offset_core`:dispatch/worker/guards/wrappers/locks; rollback repõe legados sem história; risco M1/E/writers.
C `offset_invariants`:registo e funções vigias; rollback repõe funções/registo; risco vigia independente não provada.
`offset_balance`:saldo real em geridos; rollback duas funções legadas; risco extrato/as-of/cliente.
`offset_approval`:trigger function de approval; rollback função original; risco status/pernas anteriores.
`status`:derive preserva prior_status em estorno provado; rollback derive original; risco casos M3 em falta.
`cash_position`/`cash_position_invariant`:caixa evento/vigia; rollbacks funções originais; risco fonte comum M6.
`restore`:recusa restauro de empresa com história/control; rollback também recusa história; risco disponibilidade backup.
`offset_kill_switch`:fecha admissões mantendo reverse; rollback enabled=true; risco estado prévio arbitrário.
`emergency`:fecha admissão/reverse; rollback nível1; risco concorrência/flags arbitrárias.
`reactivation`:ambos true; rollback ambos false; risco revisão/estado prévio arbitrário; nunca altera grants.
Ordem canónica local:storage→core→invariants→balance→approval→status→kill-switch→emergency→reactivation→cash→cash-invariant→restore;
rollback inverso com zero história. Não constitui proposta executável enquanto os blocos estiverem abertos.
Só Live com autorização BEGIN…ROLLBACK provaria catálogo/owner/ACL atual, dependências reais e dados reais;
concorrência exige sessões próprias e aprovação, não é provada por uma única transação. Não foi executado.
Resposta direta:NÃO tecnicamente pronto para pedir A–C nem instalar qualquer candidato.

### SHA/CI e artefactos
API main observado22:12UTC:`b798a59d77a976c3de2759018ef88b9d6e3b56b9`;CI39679753365 completed/success.
phase2m-context.py e manifesto2m devolvem404; relatório remoto ainda hash73df33…ef6ad da2l.
CI desse SHA NÃO contém2m. SHA final dos edits não existe verificável durante esta execução; commits geridos pela
plataforma. Sem commits por bloco/manual; requisito do Pedro de commit antes do próximo bloco NÃO cumprido.
Artefactos em live/phase2m; hashes finais em issue335-fase2m-hashes.sha256 (sem circularidade).
Conclusão:2m PARCIAL/NÃO ACEITE. Trabalho técnico restante não exige decisão comercial; A–C/candidatos exigem Sim separado.


## Fase 2n — Bloco1 M1 (2026-10-21 UTC): ABERTO / NÃO ACEITE

Só Bloco1 executado. Sem SQL candidato modificado, migrations, Live DDL/DML, Publish ou TS.
Reserva #335 mantém-se; QUADRO/roadmap não alterados conforme lista restrita desta mensagem.
Leituras antes dos testes: manifesto issue335-fase2n-leituras.md, fontes pedidas integralmente
por intervalos≤200 e SHA no momento da leitura; 4 capturas volumosas NÃO LIDO com razão.
Não afirmar leitura integral dessas capturas nem todos os testes históricos por referência.

### ANTES / DEPOIS e classificação
ANTES: phase2m-context.py executado novamente:240 linhas,190 asserções e50 observações.
Não prova UPDATE real nem token legítimo cruzado. Output integral abaixo.
DEPOIS:281 probes/asserções novas,0 divergências na execução final,0 skips no teste novo.
Uma execução inicial falhou por lock da mesma entidade: preparação do grupo durable mudou
para antes da sessão A. Outra falhou porque grupo N↔N não necessita criar transaction_offsets:
alvo passou a offset gerido já existente. Nenhum desses crashes conta como PASS.
Primeira execução completa:13 divergências de expectativa do TESTE, não13 vulnerabilidades:
invalid_request (4), UPDATE0 invisível por RLS (6), ACL/trigger executor (3).
Nenhuma asserção de segurança foi removida: UPDATE0 classificado com contagem exacta,
helpers read-only separados de mutadores; token context predicate exige false, núcleo recusa.
No entanto a cobertura não está completa: não aceitar o bloco por281 probes.

### O que foi efetivamente atacado
Identidade sessão não-superuser afirmada; aplicações com SET SESSION AUTHORIZATION real,
sem continuar sob bootstrap superuser. Postgres SEM SET ROLE negado42501 após instalação.
Postgres COM SET ROLE executor realmente testado com membership SET TRUE artificial LOCAL,
e antes de cada teste SET LOCAL ROLE issue335_executor confirmado current_user/session_user.
Membership voltou SET FALSE; nova tentativa postgres depois devolveu42501;0 context rows.
SET TRUE temporário do instalador não foi eliminado: instalação/rollback NOSUPERUSER usam-no
para assumir/atribuir propriedade; ambos o revogam antes do COMMIT. Não há prova de bypass
pelo SET ROLE depois de instalar; owner verdadeiro mantém poderes administrativos legados.

Token legítimo capturado num trigger de teste BEFORE INSERT grupo, sem alterar função núcleo.
Dentro do trigger real, issue335_context_valid('execute') foi true antes de emitir token.
Sessão A manteve transação aberta, B de cada papel tentou token e chamada mutadora.
Todos recusaram mutação; onde predicate disponível foi false. Token reutilizado noutra sessão
após COMMIT e depois de uma transação posterior de A terminada com ROLLBACK: recusa.
A mesma sessão com novo xid teve predicate false. Instrumentação LOCAL removida no final.
LIMITE: token único veio da transação COMMIT; não foi capturado um SEGUNDO token legítimo
num núcleo cujo próprio COMMIT fosse ROLLBACK. Não chamar isto prova completa pós-aborto.

UPDATEs reais valores válidos de display_name/name, WHERE id existente, RETURNING id;
antes=depois fora de cada transação ROLLBACK; snapshots de cada linha confirmados.
Legado permite escritas de negócios a manager/editor/service_role/owner: não são bypass.
Por isso 'nenhuma coluna muda' só demonstrado persistentemente; durante transação legal
supplier/event/settlement/etc podem mudar. Proibir isto exigiria alterar legado, fora do M1.
Executor:5 tabelas recusam42501 e0 linhas; grupos/itens/offsets recusam42501 ou guarda.
Grupos/itens/offsets foram atacados por UPDATE real em alvo gerido; INSERT/DELETE fora núcleo
não completados: cobertura(f) ainda ABERTA, não presumir equivalente pelo ACL ou UPDATE.
Funções internas todas enumeradas do catálogo local e chamadas; RPC público invalid_request
oupermission_denied; helpers puros/read-only com execução legal discriminados na matriz.

### Matriz resumida (matriz individual completa abaixo)
Legenda: C,S,E,F,T=companies,suppliers,events,financial_accounts,event_settlements.
D=42501 ou managed_operation_required;0=UPDATE zero RLS;1=UPDATE legado real (ROLLBACK).
(a) mutadores internos D; helpers read-only permitidos não representam autorização de escrita.
(b)/(c) token/contexto não concede mutação; predicate false ou ACL42501.
Papéis                          (a/b/c)          d[C,S,E,F,T]   e SET executor   f geridos
editor authenticated            D/false/D        0,1,0,0,0      42501            D,D,D
manager authenticated           D/false/D        0,1,1,0,1      42501            D,D,D
user authenticated              D/false/D        0,0,0,0,0      42501            D,D,0
anon                            D/42501/D        0,D,0,0,0      42501            D,D,0
service_role                    D/false/D        1,1,1,1,1      42501            D,D,D
sandbox_exec                    D/42501/D        D,D,D,D,D      42501            D,D,D
sandbox_exec hosted             D/42501/D        D,D,D,D,D      42501            D,D,D
postgres SEM SET ROLE           D/false/D        1,1,1,1,1      42501 instalado  D,D,D
postgres COM SET executor local D/false/D        D,D,D,D,D      ok temporário    D,D,D
As células0 não são recusa da guarda; RLS não expõe linha. Aplicações legais1 não alteradas.
No período artificial de exposição, postgres SEM SET também pode SET executor; isso foi
esperado e observado apenas durante fixture local. Fora desse período42501 confirmado.

### Suite fiel e12 rollbacks
Nova base PG17.6,postgres NOSUPERUSER,triggers reais. Instalação15529 instruções0 falhas;
0 diferenças não explicadas;2934 triggers iguais;5 extensões ausentes classificadas pelo
adaptador existente, não prova de todos os runtimes hospedados. Suite14 grupos PASS.
Runner histórico contém cobertura incompleta e classificações antigas: não afirmar que
14 PASS elimina todos os erros/skips/colunas não suportadas históricos. Bloco continua aberto.
12 pares instalados e rollback inverso em outra base limpa:captura normalizada antes=depois,
differences={}. Escopo da captura definido por phase2h-capture.sql, não catálogo universal.
Vitest não executado por pedido:nenhum TS alterado;nenhum build/typecheck manual.

### Bloqueios exactos para FECHAR M1
1. Capturar token novo em transação A legítima cujo próprio encontro termina ROLLBACK;
   repetir ataques(B e nova transação mesma sessão), não reutilizar apenas token já COMMITado.
2. Completar INSERT/DELETE de grupos,itens,offsets com payloads válidos e snapshots completos.
3. Provar guardas com token roubado em contexto trigger atacante real, não apenas depth0.
4. Reexecutar testes2n dentro da suite nova e manter runner dedicado versionado; por lista
   de alterações permitida, script/provas estão incorporados NESTE relatório, não novo ficheiro.
5. Distinguir proprietário verdadeiro fora do modelo; não declarar que postgres é incapaz de
   mudar dados de negócios legados. Nenhuma mudança de grants legado feita para esconder isto.
6. SHA remoto que contenha2n e CI desse SHA ainda não verificável; HEAD observado abaixo.
Conclusão SEM RODEIOS:Bloco1 ABERTO,não tecnicamente pronto para pedir A–C.
Nenhuma decisão comercial nova; restante é prova técnica. Instalação exige Sim separado.

### HEAD/CI por API
HEAD observado12336f954a739d2850ddbaf2467bc91a11fd0877;CI39685193441 completed/success,
mas manifest/hash2n404. CI NÃO cobre2n;nenhum SHA final dos edits certificável no turno.
Commits geridos pela plataforma,sem comando de commit. Comentário Issue335 curto enviado.

### Outputs integrais e matriz por papel×ataque (sem truncagem)

#### before.out
```text
matrix 240 rows (190 assertions, 50 privilege observations); 0 unexpected; partial: valid cross-session token and five real-row UPDATE matrices outstanding

```

#### first.out
```text
FAIL authenticated editor a public transaction_offset_execute ['42501', 'P0001:invalid_items', 'P0001:permission_denied'] P0001:invalid_request
FAIL authenticated manager a public transaction_offset_execute ['42501', 'P0001:invalid_items', 'P0001:permission_denied'] P0001:invalid_request
FAIL authenticated user f REAL UPDATE transaction_offsets ['42501', 'P0001:managed_operation_required'] ok
FAIL anon d REAL UPDATE companies ['42501'] ok
FAIL anon d REAL UPDATE financial_accounts ['42501'] ok
FAIL anon d REAL UPDATE events ['42501'] ok
FAIL anon d REAL UPDATE event_settlements ['42501'] ok
FAIL anon f REAL UPDATE transaction_offsets ['42501', 'P0001:managed_operation_required'] ok
FAIL service_role a public transaction_offset_execute ['42501', 'P0001:invalid_items', 'P0001:permission_denied'] P0001:invalid_request
FAIL postgres WITHOUT SET ROLE a public transaction_offset_execute ['42501', 'P0001:invalid_items', 'P0001:permission_denied'] P0001:invalid_request
FAIL postgres WITH SET ROLE executor (simulated local exposure) a direct issue335_balance_invariant_count() ['ok'] 42501:permission denied for function issue335_balance_invariant_count
FAIL postgres WITH SET ROLE executor (simulated local exposure) a direct issue335_guard() ['42501'] 0A000:trigger functions can only be called as triggers
FAIL postgres WITH SET ROLE executor (simulated local exposure) a direct issue335_invariant_counts() ['ok'] 42501:permission denied for function issue335_invariant_counts
2n REAL ATTACKS 281 FAIL 13 captured legitimate core token validated inside real group trigger; temporary instrumentation removed

```

#### after.out
```text
2n REAL ATTACKS 281 FAIL 0 captured legitimate core token validated inside real group trigger; temporary instrumentation removed

```

#### suite.out
```text
sh: line 1: locale: command not found
2026-10-21 22:20:32.878 UTC [48487] WARNING:  no usable system locales were found
phase2h install: 15529 statements; 0 failed
equal {'relations': 525, 'columns': 6392, 'constraints': 1987, 'indexes': 1477, 'triggers': 2934, 'policies': 1284, 'functions': 876, 'types': 27, 'sequences': 15, 'views': 53, 'default_acl': 37, 'schemas': 16, 'extensions': 6, 'roles': 17, 'memberships': 20}
diffs {"columns": {"different_explained": 70}, "constraints": {"different_explained": 8}, "indexes": {"different_explained": 1}, "functions": {"different_explained": 18}, "views": {"different_explained": 1}, "extensions": {"missing_explained": 5}}
UNEXPLAINED total 0
reference data: 27 statements from 23 migrations
refdata errors: 0
INSTALL OK (postgres NOSUPERUSER): group_storage core invariants balance
PASS scenarios (9 marcadores PASS)
PASS phase2b (10 marcadores PASS)
PASS phase2c (2 marcadores PASS)
PASS phase2d (8 marcadores PASS)
PASS phase2e (7 marcadores PASS)
PASS phase2f-negative (2 marcadores PASS)
PASS kill-switch (level 1, reverse available, ACL unchanged + rollback)
PASS phase2c-invariant-matrix (1 marcadores PASS)
PASS phase2f-concurrency (5 marcadores)
PASS phase2g-approval (3 marcadores PASS)
PASS matching-parity (1 marcadores PASS)
PASS phase2j (11 marcadores PASS)
PASS phase2j-concurrency (7 marcadores)
PASS phase2l (9 marcadores)

```

#### rollback.out
```text
installed local offset_group_storage
installed local offset_core
installed local offset_invariants
installed local offset_balance
installed local offset_approval
installed local status
installed local offset_kill_switch
installed local emergency
installed local reactivation
installed local cash_position
installed local cash_position_invariant
installed local restore
rolled back local restore
rolled back local cash_position_invariant
rolled back local cash_position
rolled back local reactivation
rolled back local emergency
rolled back local offset_kill_switch
rolled back local status
rolled back local offset_approval
rolled back local offset_balance
rolled back local offset_invariants
rolled back local offset_core
rolled back local offset_group_storage
PASS 2l full capture equality: owners/ACL/memberships/roles/types/defaults/indexes/RI/triggers/policies/functions/views

```

#### github.json
```text
{
  "sha": "12336f954a739d2850ddbaf2467bc91a11fd0877",
  "files": {
    "docs/testes/issue335-fase2n-leituras.md": 404,
    "docs/testes/issue335-fase2n-hashes.sha256": 404,
    "docs/testes/issue335-fases12-local.md": 200
  },
  "runs": [
    {
      "id": 39685193441,
      "sha": "12336f954a739d2850ddbaf2467bc91a11fd0877",
      "name": "CI",
      "status": "completed",
      "conclusion": "success"
    }
  ],
  "ci_covers_2n": false
}
```

#### Matriz completa esperado/obtido/justificação
```json
[
  {
    "role": "authenticated editor",
    "attack": "a direct _issue335_execute(uuid,uuid,jsonb,jsonb,date,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct _issue335_reverse(uuid,uuid,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_reverse",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_balance_invariant_count()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_balance_invariant_count",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_camarim_leg(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_camarim_leg",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_context_valid(text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_dispatch()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_dispatch",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_guard()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_guard",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_invariant_counts()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_invariant_counts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_lock_parents(text,uuid[])",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_lock_parents",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_matching_transactions(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_matching_transactions",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_normalize(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_normalize",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_payment_flow_blocked(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_payment_flow_blocked",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_score(text,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_score",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_uid()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_uid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a direct issue335_worker(jsonb)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_worker",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "a public transaction_offset_execute",
    "expected": [
      "42501",
      "P0001:invalid_request",
      "P0001:permission_denied"
    ],
    "actual": "P0001:invalid_request",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Public admission is not internal bypass; empty operation rejected before group write.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "b invented",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "b invented stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "c valid token while A open",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "c valid token while A open stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "e SET ROLE executor",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied to set role \"issue335_executor\"",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "d REAL UPDATE companies",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated editor",
    "attack": "d REAL UPDATE suppliers",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000020"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "authenticated editor",
    "attack": "d REAL UPDATE financial_accounts",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated editor",
    "attack": "d REAL UPDATE events",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated editor",
    "attack": "d REAL UPDATE event_settlements",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated editor",
    "attack": "f REAL UPDATE transaction_offset_groups",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "f REAL UPDATE transaction_offset_items",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "f REAL UPDATE transaction_offsets",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct _issue335_execute(uuid,uuid,jsonb,jsonb,date,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct _issue335_reverse(uuid,uuid,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_reverse",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_balance_invariant_count()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_balance_invariant_count",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_camarim_leg(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_camarim_leg",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_context_valid(text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_dispatch()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_dispatch",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_guard()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_guard",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_invariant_counts()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_invariant_counts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_lock_parents(text,uuid[])",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_lock_parents",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_matching_transactions(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_matching_transactions",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_normalize(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_normalize",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_payment_flow_blocked(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_payment_flow_blocked",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_score(text,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_score",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_uid()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_uid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a direct issue335_worker(jsonb)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_worker",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "a public transaction_offset_execute",
    "expected": [
      "42501",
      "P0001:invalid_request",
      "P0001:permission_denied"
    ],
    "actual": "P0001:invalid_request",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Public admission is not internal bypass; empty operation rejected before group write.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "b invented",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "b invented stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "c valid token while A open",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "c valid token while A open stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "e SET ROLE executor",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied to set role \"issue335_executor\"",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "d REAL UPDATE companies",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated manager",
    "attack": "d REAL UPDATE suppliers",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000020"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "authenticated manager",
    "attack": "d REAL UPDATE financial_accounts",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated manager",
    "attack": "d REAL UPDATE events",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000063"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "authenticated manager",
    "attack": "d REAL UPDATE event_settlements",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "4a3a80d8-104f-4348-994e-f13de900d599"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "authenticated manager",
    "attack": "f REAL UPDATE transaction_offset_groups",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "f REAL UPDATE transaction_offset_items",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "f REAL UPDATE transaction_offsets",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct _issue335_execute(uuid,uuid,jsonb,jsonb,date,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct _issue335_reverse(uuid,uuid,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_reverse",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_balance_invariant_count()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_balance_invariant_count",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_camarim_leg(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_camarim_leg",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_context_valid(text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_dispatch()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_dispatch",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_guard()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_guard",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_invariant_counts()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_invariant_counts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_lock_parents(text,uuid[])",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_lock_parents",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_matching_transactions(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_matching_transactions",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_normalize(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_normalize",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_payment_flow_blocked(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_payment_flow_blocked",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_score(text,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_score",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_uid()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_uid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a direct issue335_worker(jsonb)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_worker",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "a public transaction_offset_execute",
    "expected": [
      "42501",
      "P0001:invalid_request",
      "P0001:permission_denied"
    ],
    "actual": "P0001:permission_denied",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Public admission is not internal bypass; empty operation rejected before group write.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "b invented",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "b invented stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "c valid token while A open",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "c valid token while A open stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "e SET ROLE executor",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied to set role \"issue335_executor\"",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "d REAL UPDATE companies",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated user",
    "attack": "d REAL UPDATE suppliers",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated user",
    "attack": "d REAL UPDATE financial_accounts",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated user",
    "attack": "d REAL UPDATE events",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated user",
    "attack": "d REAL UPDATE event_settlements",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "authenticated user",
    "attack": "f REAL UPDATE transaction_offset_groups",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "f REAL UPDATE transaction_offset_items",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "f REAL UPDATE transaction_offsets",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct _issue335_execute(uuid,uuid,jsonb,jsonb,date,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct _issue335_reverse(uuid,uuid,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_reverse",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_balance_invariant_count()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_balance_invariant_count",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_camarim_leg(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_camarim_leg",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_context_valid(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_context_valid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_dispatch()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_dispatch",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_guard()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_guard",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_invariant_counts()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_invariant_counts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_lock_parents(text,uuid[])",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_lock_parents",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_matching_transactions(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_matching_transactions",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_normalize(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_normalize",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_payment_flow_blocked(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_payment_flow_blocked",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_score(text,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_score",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_uid()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_uid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a direct issue335_worker(jsonb)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_worker",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "a public transaction_offset_execute",
    "expected": [
      "42501",
      "P0001:invalid_request",
      "P0001:permission_denied"
    ],
    "actual": "42501:permission denied for function transaction_offset_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Public admission is not internal bypass; empty operation rejected before group write.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "b invented",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_context_valid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "b invented stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "c valid token while A open",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_context_valid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "c valid token while A open stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "e SET ROLE executor",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied to set role \"issue335_executor\"",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "d REAL UPDATE companies",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "anon",
    "attack": "d REAL UPDATE suppliers",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table suppliers",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "d REAL UPDATE financial_accounts",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "anon",
    "attack": "d REAL UPDATE events",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "anon",
    "attack": "d REAL UPDATE event_settlements",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 0
  },
  {
    "role": "anon",
    "attack": "f REAL UPDATE transaction_offset_groups",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "f REAL UPDATE transaction_offset_items",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "f REAL UPDATE transaction_offsets",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct _issue335_execute(uuid,uuid,jsonb,jsonb,date,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct _issue335_reverse(uuid,uuid,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_reverse",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_balance_invariant_count()",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        0
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_camarim_leg(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_camarim_leg",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_context_valid(text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_dispatch()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_dispatch",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_guard()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_guard",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_invariant_counts()",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 5,
    "details": [
      [
        "encontro_desequilibrado",
        0
      ],
      [
        "encontro_pernas_divergentes",
        0
      ],
      [
        "encontro_reversao_parcial",
        0
      ],
      [
        "encontro_dinheiro_sem_conta",
        0
      ],
      [
        "encontro_vinculo_bancario_divergente",
        0
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_lock_parents(text,uuid[])",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_lock_parents",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_matching_transactions(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_matching_transactions",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_normalize(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_normalize",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_payment_flow_blocked(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_payment_flow_blocked",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_score(text,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_score",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_uid()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_uid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a direct issue335_worker(jsonb)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_worker",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "a public transaction_offset_execute",
    "expected": [
      "42501",
      "P0001:invalid_request",
      "P0001:permission_denied"
    ],
    "actual": "P0001:invalid_request",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Public admission is not internal bypass; empty operation rejected before group write.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "b invented",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "b invented stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "c valid token while A open",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "c valid token while A open stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "e SET ROLE executor",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied to set role \"issue335_executor\"",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "d REAL UPDATE companies",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000001"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "service_role",
    "attack": "d REAL UPDATE suppliers",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000020"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "service_role",
    "attack": "d REAL UPDATE financial_accounts",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000030"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "service_role",
    "attack": "d REAL UPDATE events",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000063"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "service_role",
    "attack": "d REAL UPDATE event_settlements",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "4a3a80d8-104f-4348-994e-f13de900d599"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "service_role",
    "attack": "f REAL UPDATE transaction_offset_groups",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "f REAL UPDATE transaction_offset_items",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "f REAL UPDATE transaction_offsets",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct _issue335_execute(uuid,uuid,jsonb,jsonb,date,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct _issue335_reverse(uuid,uuid,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_reverse",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_balance_invariant_count()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_balance_invariant_count",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_camarim_leg(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_camarim_leg",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_context_valid(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_context_valid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_dispatch()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_dispatch",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_guard()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_guard",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_invariant_counts()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_invariant_counts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_lock_parents(text,uuid[])",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_lock_parents",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_matching_transactions(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_matching_transactions",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_normalize(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_normalize",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_payment_flow_blocked(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_payment_flow_blocked",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_score(text,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_score",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_uid()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_uid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a direct issue335_worker(jsonb)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_worker",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "a public transaction_offset_execute",
    "expected": [
      "42501",
      "P0001:invalid_request",
      "P0001:permission_denied"
    ],
    "actual": "42501:permission denied for function transaction_offset_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Public admission is not internal bypass; empty operation rejected before group write.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "b invented",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_context_valid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "b invented stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "c valid token while A open",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_context_valid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "c valid token while A open stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "e SET ROLE executor",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied to set role \"issue335_executor\"",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "d REAL UPDATE companies",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table companies",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "d REAL UPDATE suppliers",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table suppliers",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "d REAL UPDATE financial_accounts",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table financial_accounts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "d REAL UPDATE events",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table events",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "d REAL UPDATE event_settlements",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table event_settlements",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "f REAL UPDATE transaction_offset_groups",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "f REAL UPDATE transaction_offset_items",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "f REAL UPDATE transaction_offsets",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offsets",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct _issue335_execute(uuid,uuid,jsonb,jsonb,date,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct _issue335_reverse(uuid,uuid,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_reverse",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_balance_invariant_count()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_balance_invariant_count",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_camarim_leg(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_camarim_leg",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_context_valid(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_context_valid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_dispatch()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_dispatch",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_guard()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_guard",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_invariant_counts()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_invariant_counts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_lock_parents(text,uuid[])",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_lock_parents",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_matching_transactions(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_matching_transactions",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_normalize(text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_normalize",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_payment_flow_blocked(uuid)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_payment_flow_blocked",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_score(text,text)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_score",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_uid()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_uid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a direct issue335_worker(jsonb)",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_worker",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "a public transaction_offset_execute",
    "expected": [
      "42501",
      "P0001:invalid_request",
      "P0001:permission_denied"
    ],
    "actual": "42501:permission denied for function transaction_offset_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Public admission is not internal bypass; empty operation rejected before group write.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "b invented",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_context_valid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "b invented stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "c valid token while A open",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_context_valid",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "c valid token while A open stolen core",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "e SET ROLE executor",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied to set role \"issue335_executor\"",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "d REAL UPDATE companies",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table companies",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "d REAL UPDATE suppliers",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table suppliers",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "d REAL UPDATE financial_accounts",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table financial_accounts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "d REAL UPDATE events",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table events",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "d REAL UPDATE event_settlements",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table event_settlements",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "f REAL UPDATE transaction_offset_groups",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "f REAL UPDATE transaction_offset_items",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "f REAL UPDATE transaction_offsets",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "42501:permission denied for table transaction_offsets",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct _issue335_execute(uuid,uuid,jsonb,jsonb,date,text)",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct _issue335_reverse(uuid,uuid,text)",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_balance_invariant_count()",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        0
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_camarim_leg(uuid)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_context_valid(text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_dispatch()",
    "expected": [
      "0A000"
    ],
    "actual": "0A000:trigger functions can only be called as triggers",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_guard()",
    "expected": [
      "0A000"
    ],
    "actual": "0A000:trigger functions can only be called as triggers",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_invariant_counts()",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 5,
    "details": [
      [
        "encontro_desequilibrado",
        0
      ],
      [
        "encontro_pernas_divergentes",
        0
      ],
      [
        "encontro_reversao_parcial",
        0
      ],
      [
        "encontro_dinheiro_sem_conta",
        0
      ],
      [
        "encontro_vinculo_bancario_divergente",
        0
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_lock_parents(text,uuid[])",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_matching_transactions(uuid)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_normalize(text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "probe"
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_payment_flow_blocked(uuid)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_score(text,text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        0.0
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_uid()",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000010"
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a direct issue335_worker(jsonb)",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "a public transaction_offset_execute",
    "expected": [
      "42501",
      "P0001:invalid_request",
      "P0001:permission_denied"
    ],
    "actual": "P0001:invalid_request",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Public admission is not internal bypass; empty operation rejected before group write.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "b invented",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "b invented stolen core",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "c valid token while A open",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "c valid token while A open stolen core",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "e SET ROLE executor",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": -1,
    "details": null,
    "pass_": true,
    "justification": "Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "d REAL UPDATE companies",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000001"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "d REAL UPDATE suppliers",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000020"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "d REAL UPDATE financial_accounts",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000030"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "d REAL UPDATE events",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000063"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "d REAL UPDATE event_settlements",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "4a3a80d8-104f-4348-994e-f13de900d599"
      ]
    ],
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false,
    "expected_affected": 1
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "f REAL UPDATE transaction_offset_groups",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "f REAL UPDATE transaction_offset_items",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "f REAL UPDATE transaction_offsets",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct _issue335_execute(uuid,uuid,jsonb,jsonb,date,text)",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct _issue335_reverse(uuid,uuid,text)",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_balance_invariant_count()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_balance_invariant_count",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_camarim_leg(uuid)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_context_valid(text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_dispatch()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_dispatch",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_guard()",
    "expected": [
      "0A000"
    ],
    "actual": "0A000:trigger functions can only be called as triggers",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_invariant_counts()",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function issue335_invariant_counts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_lock_parents(text,uuid[])",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_matching_transactions(uuid)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 0,
    "details": [],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_normalize(text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "probe"
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_payment_flow_blocked(uuid)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_score(text,text)",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        0.0
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_uid()",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        "00000000-0000-0000-0000-000000000010"
      ]
    ],
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a direct issue335_worker(jsonb)",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "a public transaction_offset_execute",
    "expected": [
      "42501",
      "P0001:invalid_request",
      "P0001:permission_denied"
    ],
    "actual": "42501:permission denied for function transaction_offset_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Public admission is not internal bypass; empty operation rejected before group write.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "b invented",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "b invented stolen core",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "c valid token while A open",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": 1,
    "details": [
      [
        false
      ]
    ],
    "pass_": true,
    "justification": "Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "c valid token while A open stolen core",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Actual attempt at mutation with stolen/random token, not predicate-only observation.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "e SET ROLE executor",
    "expected": [
      "ok"
    ],
    "actual": "ok",
    "affected": -1,
    "details": null,
    "pass_": true,
    "justification": "Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "d REAL UPDATE companies",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table companies",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "d REAL UPDATE suppliers",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table suppliers",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "d REAL UPDATE financial_accounts",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table financial_accounts",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "d REAL UPDATE events",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table events",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "d REAL UPDATE event_settlements",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for table event_settlements",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "f REAL UPDATE transaction_offset_groups",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "f REAL UPDATE transaction_offset_items",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "f REAL UPDATE transaction_offsets",
    "expected": [
      "42501",
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Valid existing grouped target, real write attempted outside command context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated editor",
    "attack": "c valid token AFTER A COMMIT",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "c valid token AFTER A COMMIT",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "c valid token AFTER A COMMIT",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "c valid token AFTER A COMMIT",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "c valid token AFTER A COMMIT",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "c valid token AFTER A COMMIT",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "c valid token AFTER A COMMIT",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "c valid token AFTER A COMMIT",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "c valid token AFTER A COMMIT",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "A authenticated same session",
    "attack": "c same-session new transaction after COMMIT",
    "expected": [
      "false"
    ],
    "actual": "false",
    "pass_": true,
    "justification": "New xid, trigger depth zero, private context removed."
  },
  {
    "role": "authenticated editor",
    "attack": "c valid token AFTER A ROLLBACK",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated manager",
    "attack": "c valid token AFTER A ROLLBACK",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "authenticated user",
    "attack": "c valid token AFTER A ROLLBACK",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "anon",
    "attack": "c valid token AFTER A ROLLBACK",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "service_role",
    "attack": "c valid token AFTER A ROLLBACK",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec",
    "attack": "c valid token AFTER A ROLLBACK",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "sandbox_exec hosted",
    "attack": "c valid token AFTER A ROLLBACK",
    "expected": [
      "42501"
    ],
    "actual": "42501:permission denied for function _issue335_execute",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITHOUT SET ROLE",
    "attack": "c valid token AFTER A ROLLBACK",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "postgres WITH SET ROLE executor (simulated local exposure)",
    "attack": "c valid token AFTER A ROLLBACK",
    "expected": [
      "P0001:managed_operation_required"
    ],
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "details": null,
    "pass_": true,
    "justification": "Cross-session token reuse after transaction ended; cannot recreate server context.",
    "persistent_business_change": false
  },
  {
    "role": "A authenticated same session",
    "attack": "c same-session new transaction after ROLLBACK",
    "expected": [
      "false"
    ],
    "actual": "false",
    "pass_": true,
    "justification": "New xid, trigger depth zero, private context removed."
  }
]
```

#### Runner LOCAL executado (extrair para /tmp; sem credenciais)
```python
"""LOCAL ONLY 2n: genuine SQL attacks; no credentials, hosted calls or production writes."""
import json,sys,re
from pathlib import Path
from uuid import uuid4
import psycopg2
from psycopg2 import sql
sock,port,out=sys.argv[1:];assert sock.startswith('/tmp/')
rows=[];uids={'editor':'17','manager':'16','user':'15'}
def conn(role='postgres',uid='10'):
 c=psycopg2.connect(host=sock,port=port,user='supabase_admin',dbname='postgres',sslmode='disable');c.autocommit=True;q=c.cursor();q.execute(sql.SQL('SET SESSION AUTHORIZATION {}').format(sql.Identifier(role)));q.execute('SELECT session_user,current_user,rolsuper FROM pg_roles WHERE rolname=current_user');identity=q.fetchone();assert identity==(role,role,False),identity;q.execute("SELECT set_config('request.jwt.claim.sub',%s,false)",('00000000-0000-0000-0000-0000000000'+uid,));return c
admin=conn();aq=admin.cursor()
# Instrument only the local test schema; real core/guards/triggers unchanged.
aq.execute("CREATE SCHEMA IF NOT EXISTS issue335_2n")
aq.execute("""CREATE OR REPLACE FUNCTION issue335_2n.capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$ BEGIN IF NOT public.issue335_context_valid('execute') THEN RAISE EXCEPTION 'token_capture_not_legitimate'; END IF; RAISE NOTICE '2N_VALID_TOKEN:%',current_setting('issue335.ctx'); RETURN NEW; END $$; DROP TRIGGER IF EXISTS issue335_2n_capture ON public.transaction_offset_groups; CREATE TRIGGER issue335_2n_capture BEFORE INSERT ON public.transaction_offset_groups FOR EACH ROW EXECUTE FUNCTION issue335_2n.capture()""")
# Group still uncommitted in A. Prepare durable legal targets separately.
aq.execute("SELECT issue335_test.j_group('2n-durable')");aq.fetchone();aq.execute("SELECT v FROM issue335_test.j WHERE k='2n-durable:g'");group=str(aq.fetchone()[0])
aq.execute('SELECT id FROM transaction_offset_items WHERE group_id=%s ORDER BY id LIMIT 1',(group,));item=str(aq.fetchone()[0]);aq.execute('SELECT id FROM transaction_offsets WHERE offset_group_id IS NOT NULL AND (%s IS NOT NULL) LIMIT 1',(group,));offset=str(aq.fetchone()[0])
A=conn('authenticated');qa=A.cursor();qa.execute('BEGIN');qa.execute("SELECT issue335_test.j_group('2n-valid-token')");qa.fetchone();tokens=[re.search(r'2N_VALID_TOKEN:([0-9a-f-]{36})',n).group(1) for n in A.notices if '2N_VALID_TOKEN:' in n];assert len(tokens)==1,tokens;token=tokens[0]
aq.execute("SELECT (result->>'group_id')::uuid FROM public.transaction_offset_groups LIMIT 0")
actors=[('authenticated editor','authenticated','17'),('authenticated manager','authenticated','16'),('authenticated user','authenticated','15'),('anon','anon','10'),('service_role','service_role','10'),('sandbox_exec','sandbox_exec','10'),('sandbox_exec hosted','sandbox_exec_sfohvvlqccmmebvjgibx','10'),('postgres WITHOUT SET ROLE','postgres','10'),('postgres WITH SET ROLE executor (simulated local exposure)','issue335_executor','10')]
# Session identity for executor is itself; actual SET ROLE from postgres checked separately.
def snapshot(q):
 q.execute("SELECT jsonb_object_agg(t,v) FROM (SELECT 'companies' t,to_jsonb(x) v FROM companies x WHERE id='00000000-0000-0000-0000-000000000001' UNION ALL SELECT 'suppliers',to_jsonb(x) FROM suppliers x WHERE id='00000000-0000-0000-0000-000000000020' UNION ALL SELECT 'financial_accounts',to_jsonb(x) FROM financial_accounts x WHERE id='00000000-0000-0000-0000-000000000030') s");return q.fetchone()[0]
def probe(actor,attack,stmt,args=None,expected=None,reason='',changed=None):
 label,role,uid=actor;c=conn('postgres' if role=='issue335_executor' else role,uid);q=c.cursor();before=snapshot(aq);q.execute('BEGIN');
 if role=='issue335_executor':q.execute('SET LOCAL ROLE issue335_executor');q.execute('SELECT current_user,session_user');assert q.fetchone()==('issue335_executor','postgres')
 actual=None;affected=None
 try:
  q.execute(stmt,args);affected=q.rowcount;values=q.fetchall() if q.description else None;actual='ok';details=values
 except psycopg2.Error as e:actual=e.pgcode+':'+e.diag.message_primary;details=None
 finally:q.execute('ROLLBACK');c.close()
 assert snapshot(aq)==before,'persistent parent change'
 passed=(actual in expected or any(len(x)==5 and actual.startswith(x+':') for x in expected)) if expected else False
 rows.append(dict(role=label,attack=attack,expected=expected,actual=actual,affected=affected if actual=='ok' else 0,details=details,pass_=passed,justification=reason,persistent_business_change=False))
 return actual
calls={
 '_issue335_execute':"SELECT public._issue335_execute(NULL,NULL,'[]',NULL,CURRENT_DATE,NULL)", '_issue335_reverse':'SELECT public._issue335_reverse(NULL,NULL,NULL)',
 'issue335_lock_parents':"SELECT public.issue335_lock_parents('events',ARRAY[]::uuid[])", 'issue335_worker':"SELECT public.issue335_worker('{\"op\":\"execute\"}')", 'issue335_context_valid':'SELECT public.issue335_context_valid(NULL)',
 'issue335_matching_transactions':'SELECT public.issue335_matching_transactions(NULL)', 'issue335_normalize':"SELECT public.issue335_normalize('probe')", 'issue335_score':"SELECT public.issue335_score('a','b')", 'issue335_uid':'SELECT public.issue335_uid()', 'issue335_payment_flow_blocked':'SELECT public.issue335_payment_flow_blocked(NULL)', 'issue335_camarim_leg':'SELECT public.issue335_camarim_leg(NULL)', 'issue335_balance_invariant_count':'SELECT public.issue335_balance_invariant_count()', 'issue335_invariant_counts':'SELECT * FROM public.issue335_invariant_counts()'}
aq.execute("SELECT p.oid::regprocedure::text,p.proname,p.prorettype='trigger'::regtype FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'issue335_%' OR p.proname LIKE '_issue335_%') ORDER BY 1");functions=aq.fetchall()
ownerhelpers={'issue335_normalize','issue335_score','issue335_matching_transactions','issue335_uid','issue335_payment_flow_blocked','issue335_camarim_leg','issue335_balance_invariant_count','issue335_invariant_counts'}
aq.execute('GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET TRUE')
for actor in actors:
 label,role,uid=actor;owner=role=='postgres';executor=role=='issue335_executor'
 for signature,name,trigger in functions:
  stmt='SELECT public.'+name+'()' if trigger else calls[name]
  if trigger:expected=['0A000'] if owner or executor and name=='issue335_guard' else ['42501']
  elif name=='issue335_context_valid':expected=['ok'] if role in ('postgres','authenticated','service_role','issue335_executor') else ['42501']
  elif executor and name in ('issue335_balance_invariant_count','issue335_invariant_counts'):expected=['42501']
  elif (owner or executor) and name in ownerhelpers:expected=['ok']
  elif role=='service_role' and name in ('issue335_invariant_counts','issue335_balance_invariant_count'):expected=['ok']
  elif (owner or executor) and name in ('_issue335_execute','_issue335_reverse','issue335_lock_parents','issue335_worker'):expected=['P0001:managed_operation_required']
  else:expected=['42501']
  probe(actor,'a direct '+signature,stmt,expected=expected,reason='Mutation internals denied or managed_operation_required; owner/read-only helpers explicitly classified, not falsely denied.')
 # Public RPC is legal for approved actors; malformed operation must not create writes.
 probe(actor,'a public transaction_offset_execute',"SELECT public.transaction_offset_execute(gen_random_uuid(),NULL,'[]',NULL,CURRENT_DATE,NULL)",expected=['42501','P0001:invalid_request','P0001:permission_denied'],reason='Public admission is not internal bypass; empty operation rejected before group write.')
 for phase,tok in [('b invented',str(uuid4())),('c valid token while A open',token)]:
  actual=probe(actor,phase,"SELECT set_config('issue335.ctx',%s,true); SELECT public.issue335_context_valid(NULL)",(tok,),['42501'] if role in ('anon','sandbox_exec','sandbox_exec_sfohvvlqccmmebvjgibx') else ['ok'],reason='Captured token valid inside real group INSERT; foreign PID/xid and depth outside trigger deny authority.')
  if actual=='ok':assert rows[-1]['details']==[(False,)],rows[-1]
  probe(actor,phase+' stolen core',"SELECT set_config('issue335.ctx',%s,true); SELECT public._issue335_execute(NULL,NULL,'[]',NULL,CURRENT_DATE,NULL)",(tok,),['P0001:managed_operation_required'] if owner or executor else ['42501'],reason='Actual attempt at mutation with stolen/random token, not predicate-only observation.')
 probe(actor,'e SET ROLE executor','SET LOCAL ROLE issue335_executor',expected=['ok'] if executor or owner else ['42501'],reason='Executor selecting itself is tautological; postgres actual SET denied after installation. Session identity is never bootstrap superuser.')
 for table,col,tid in [('companies','display_name','00000000-0000-0000-0000-000000000001'),('suppliers','name','00000000-0000-0000-0000-000000000020'),('financial_accounts','name','00000000-0000-0000-0000-000000000030'),('events','name',None),('event_settlements','name',None)]:
  if tid is None:aq.execute(sql.SQL("SELECT id FROM {} WHERE company_id='00000000-0000-0000-0000-000000000001' ORDER BY id LIMIT 1").format(sql.Identifier(table)));tid=str(aq.fetchone()[0])
  aq.execute(sql.SQL('SELECT to_jsonb(x) FROM {} x WHERE id=%s').format(sql.Identifier(table)),(tid,));pre=aq.fetchone()[0]
  probe(actor,'d REAL UPDATE '+table,sql.SQL("UPDATE {} SET {}={}||' 2n-valid-attack' WHERE id=%s RETURNING id").format(sql.Identifier(table),sql.Identifier(col),sql.Identifier(col)),(tid,),['42501'] if executor or role in ('sandbox_exec','sandbox_exec_sfohvvlqccmmebvjgibx') or role=='anon' and table=='suppliers' else ['ok'],reason='Legacy application writes may be legal (count reported); executor must lack all five UPDATEs. Every probe rolled back; no persistent business mutation.')
  if rows[-1]['actual']=='ok':
   expected_count=1 if owner or role=='service_role' or role=='authenticated' and (table=='suppliers' and uid in ('16','17') or table in ('events','event_settlements') and uid=='16') else 0
   assert rows[-1]['affected']==expected_count,rows[-1]
   rows[-1]['expected_affected']=expected_count
  aq.execute(sql.SQL('SELECT to_jsonb(x) FROM {} x WHERE id=%s').format(sql.Identifier(table)),(tid,));assert aq.fetchone()[0]==pre
 for t,col,tid in [('transaction_offset_groups','note',group),('transaction_offset_items','prior_status',item),('transaction_offsets','note',offset)]:
  v='approved' if col=='prior_status' else '2n valid unauthorized note'
  probe(actor,'f REAL UPDATE '+t,sql.SQL('UPDATE {} SET {}=%s WHERE id=%s RETURNING id').format(sql.Identifier(t),sql.Identifier(col)),(v,tid),['ok'] if t=='transaction_offsets' and role in ('anon',) or t=='transaction_offsets' and role=='authenticated' and uid=='15' else ['42501','P0001:managed_operation_required'],reason='Valid existing grouped target, real write attempted outside command context.')
aq.execute('GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET FALSE')
# Valid-token replay in new transactions on same A session after return, COMMIT and ROLLBACK.
for end in ['COMMIT','ROLLBACK']:
 qa.execute(end)
 for actor in actors:
  if actor[1]=='issue335_executor':aq.execute('GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET TRUE')
  probe(actor,'c valid token AFTER A '+end,"SELECT set_config('issue335.ctx',%s,true); SELECT public._issue335_execute(NULL,NULL,'[]',NULL,CURRENT_DATE,NULL)",(token,),['P0001:managed_operation_required'] if actor[1] in ('postgres','issue335_executor') else ['42501'],reason='Cross-session token reuse after transaction ended; cannot recreate server context.')
 aq.execute('GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET FALSE')
 qa.execute('BEGIN');qa.execute("SELECT set_config('issue335.ctx',%s,true); SELECT public.issue335_context_valid(NULL)",(token,));assert qa.fetchone()==(False,);rows.append(dict(role='A authenticated same session',attack='c same-session new transaction after '+end,expected=['false'],actual='false',pass_=True,justification='New xid, trigger depth zero, private context removed.'))
qa.execute('ROLLBACK');A.close()
aq.execute('DROP TRIGGER issue335_2n_capture ON public.transaction_offset_groups; DROP SCHEMA issue335_2n CASCADE')
Path(out).write_text(json.dumps(rows,default=str,ensure_ascii=False,indent=2))
bad=[r for r in rows if not r['pass_']]
for r in bad:print('FAIL',r['role'],r['attack'],r['expected'],r['actual'])
print('2n REAL ATTACKS',len(rows),'FAIL',len(bad),'captured legitimate core token validated inside real group trigger; temporary instrumentation removed')
admin.close()
if bad:sys.exit(1)

```

#### SHA256 das provas locais desta execução (bytes completos)
```text
e0e754138a56aa59dba5f6b65c6275feefa186b1226f4327ff0727e47872c702  /tmp/issue335-2n/attacks.py
0d004c407dff77ae27a40a89094d309f0e3d021b60061bd09277535ee41af163  /tmp/issue335-2n/before-matrix.json
90502242df619e06205e9c3da967064e9b75b4a03370528c8ae950cfdda511d0  /tmp/issue335-2n/first-matrix.json
6f9c635367835ef2c6c8bc0f2332c9ff2648521247620e95a9cd625aaa0a50a9  /tmp/issue335-2n/after-matrix.json
6e72d31b311a6e2c0244781d3df3ff6d9ea793416784cae805612b1f5e83ebb0  /tmp/issue335-2n/before.out
37c37ca91ffe9433634d57a819d3d4f9282a59ba6138ef2d02ee687ed647ad76  /tmp/issue335-2n/first.out
e62f57e7650ef74363513699a6290e3fe8a72bccf9435823bbb1c0969115069b  /tmp/issue335-2n/after.out
8bdd4222d944a2f72262d45037de05691e2e5739d8c1ab4bbc5e3532567517c0  /tmp/issue335-2n/suite.out
dd375a9fcc9e8b8910acf17f10cf9be00ef7c999174190a54af923cb1baa6543  /tmp/issue335-2n/rollback.out
474947e27e3cf0c0d328ccc6e76c2fbb6d915e781ddc9ccb43de36325a2af1a1  /tmp/issue335-2n/rollback/before.json
474947e27e3cf0c0d328ccc6e76c2fbb6d915e781ddc9ccb43de36325a2af1a1  /tmp/issue335-2n/rollback/after.json
44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a  /tmp/issue335-2n/rollback/differences.json
```


## Fase 2n — Bloco1b M1 (2026-10-21 22:28 UTC) — ABERTO / NÃO ACEITE

Só itens1–4. Sem Live, migrations, Publish, TS ou alterações ao SQL candidato.
Lista restrita de documentação respeitada; excepção expressamente pedida item4:
novo phase2n-context.py e integração em phase2h-suite.sh. run.sh antigo (stub/superuser)
não foi usado ou modificado. Entry fiel oficial phase2h-run.sh→phase2h-suite.sh.

### Estados e ANTES/DEPOIS
1 FECHADO no escopo replay pós-fim:ANTES runner2n usa token único COMMIT seguido de
ROLLBACK de transação posterior;DEPOIS dois tokens legítimos distintos em encontros
A próprios COMMIT/ROLLBACK. Captura verifica context_valid true no trigger real.
Após fim:9 papéis noutras sessões + A nova transação por token=20 provas; mutadores
42501 ou managed_operation_required; predicate mesma sessão false; grupo COMMIT1,
ROLLBACK0. Não inclui outra sessão ainda dentro do período de execução do núcleo.
2 ABERTO, parcial:ANTES só UPDATE;DEPOIS54 INSERT/DELETE reais9 papéis×3 tabelas×2,
mais2 controles service_role/postgres de INSERT+DELETE legado:1+1 (rollback).
FKs apontam a dados locais existentes; checks numéricos válidos;0 escrita gerida
persistente. Controlo positivo trusted-trigger valida INSERT grupo/itens/offsets.
LIMITES EXACTOS:itens usam grupo applied e são recusados invalid_group_state antes
FK/check;DELETE grupo/itens alvo referenciado impede provar que passar guarda não
falharia FK;contagens antes/depois não equivalem snapshot integral de dados.
Não vender54 probes como fecho de validade sem estes controlos adicionais.
Service_role BYPASSRLS/postgres owner não contornam guarda gerida fora contexto;
legado sem grupo mantém1INSERT+1DELETE autorizados. Não mudar legado para esconder.
3 ABERTO:ANTES não havia trigger atacante;DEPOIS trigger real em tabela teste,
disparado por hook AFTER INSERT grupo dentro encontro legítimo. SECURITY DEFINER
owner postgres:context_valid true,PIDs/xid/op/token iguais ao núcleo. Resultados:
grupo INSERT1,offset INSERT1,5 tabelas UPDATE1 cada;item INSERT0 invalid_group_state.
Todas as8 tentativas medidas;7 escritas efectivamente conseguem dentro transação,
ROLLBACK remove-as. Este é LIMITE de trusted computing base, NÃO prova de segurança.
Um atacante que consiga instalar função/trigger SECURITY DEFINER owner já pertence
à administração;actor de aplicação sem esse poder não foi demonstrado equivalente.
Proposta candidato INERTE (não criado/instalado):capacidade por escrita/identidade
alvo/colunas,provisionada no dispatcher e consumida atomicamente antes dos hooks;
executor sem DDL e auditoria allowlist de triggers/functions/owners. Guarda fina
precisa desenhar legitimas escritas/triggers1a1 e regressão+rollback próprios.
Depth/PID/xid/op/token sozinhos NÃO isolam código malicioso já dentro do núcleo.
Mesmo essa proposta não protege contra owner DDL:owner pode substituir guarda.
Sem decisão de confiança e candidato testado não declarar fecho M1/A–C.
4 FECHADO execução/versionamento LOCAL:ANTES suite39linhas sem novo runner;
DEPOIS phase2n-context.py executado pela suite oficial após2l,fail-closed para
regressão técnica. O PASS final diz explicitamente item3OPEN/NOT security acceptance.
Runner mede84 provas,0 skips novos;item3 security_pass false por7 casos,sem disfarçar
como testes de segurança aprovados. Não integra o antigo runner281 sem correcção:
reteste ANTES devolveu3falhas por escolher settlement selado na base nova. Novo
runner escolhe NOT is_sealed, mantendo a guarda e os erros históricos classificados.

### Suite / rollback / erros
PG17.6,postgres NOSUPERUSER,2934 triggers iguais,15529 instruções0 falhas,
0 diferenças não explicadas no catálogo adaptado. Suite14grupos anteriores+runner1b.
Normalização/5 extensões ausentes explicadas herdadas:não certifica runtimes externos.
Warnings históricos (locale indisponível;trigger coala supplier_id ausente) não são
skips novos,nem foram corrigidos ou silenciados;zero skips do novo runner apenas.
Rollback12pares em OUTRA base limpa:captura NORMALIZADA (ordenação arrays/ACL),
before=after, diferenças={};não catálogo universal nem snapshot integral de dados.
Nenhum Vitest/tsgo/tsc:nenhum TS alterado,fora deste pedido.

### Leituras
Manifesto actualizado ANTES testes. Secção925–5188 lida em80linhas (sub_fb149649);
runner anterior90linhas integral,storage91integral,core1–200/1060–1130 mínimo pedido.
Ficheiro relatório/core actual NÃO LIDO integral nesta ronda:só secção requerida;
capturas volumosas antigas NÃO LIDO mantêm-se,sem nova alegação por hashing.

### Correções/diff
Nenhum prosrc/SQL/rollback existente alterado. Novo runner contém20 replay probes,
54managed inserts/deletes,2legacy controls,8trigger attacks. Suite adiciona chamada:
```diff
+if python3 "$S/phase2n-context.py" "$D" "$PORT" "$OUT/phase2n-context.json" > "$OUT/phase2n-context.out" 2>&1; then
+  echo 'PASS phase2n-context execution (item1/2 assertions; item3 OPEN owner-trigger boundary, NOT security acceptance)' | tee -a "$res"
+else echo "FAIL phase2n-context: $(tail -1 "$OUT/phase2n-context.out")" | tee -a "$res"; fi
```
Novo ficheiro inteiro versionado (222+7 linhas),diff novo=conteúdo integral desse ficheiro.

### HEAD/CI por API
HEAD bb701b1f495fb477fcb473a2520078065293549c;CI39686372314 success MAS só2n-Bloco1.
Runner1b404,suite remoto hash antigo;manifesto remoto versão anterior. Relatório
remoto ainda Bloco1. CI NÃO cobre1b;SHA final dos edits não certificável neste turno.
A–C/candidatos continuam sem autorização;nenhum Publish.

### Outputs integrais ANTES/DEPOIS, suite, rollback, GitHub

#### before.out
```text
FAIL authenticated manager d REAL UPDATE event_settlements ['ok'] P0001:Fechamento selado: nome e quota não podem ser alterados. Reabra primeiro.
FAIL service_role d REAL UPDATE event_settlements ['ok'] P0001:Fechamento selado: nome e quota não podem ser alterados. Reabra primeiro.
FAIL postgres WITHOUT SET ROLE d REAL UPDATE event_settlements ['ok'] P0001:Fechamento selado: nome e quota não podem ser alterados. Reabra primeiro.
2n REAL ATTACKS 281 FAIL 3 captured legitimate core token validated inside real group trigger; temporary instrumentation removed

```

#### after.out
```text
OPEN item3: owner-created malicious trigger borrows legitimate context; group INSERT and 5 parent UPDATEs succeed in transaction, rolled back. No candidate installed.
PASS item1: distinct COMMIT/ROLLBACK live tokens rejected across sessions and new xid
PASS item2: 54 actual managed INSERT/DELETE probes + legacy bypass controls, no persistence
PASS item4 dedicated runner executed; item3 security remains OPEN, not a green security gate
2n1b measured 84 probes; no skips; security item3 OPEN

```

#### suite/phase2n-context.out
```text
OPEN item3: owner-created malicious trigger borrows legitimate context; group INSERT and 5 parent UPDATEs succeed in transaction, rolled back. No candidate installed.
PASS item1: distinct COMMIT/ROLLBACK live tokens rejected across sessions and new xid
PASS item2: 54 actual managed INSERT/DELETE probes + legacy bypass controls, no persistence
PASS item4 dedicated runner executed; item3 security remains OPEN, not a green security gate
2n1b measured 84 probes; no skips; security item3 OPEN

```

#### suite.out
```text
sh: line 1: locale: command not found
2026-10-21 22:32:30.772 UTC [56804] WARNING:  no usable system locales were found
phase2h install: 15529 statements; 0 failed
equal {'relations': 525, 'columns': 6392, 'constraints': 1987, 'indexes': 1477, 'triggers': 2934, 'policies': 1284, 'functions': 876, 'types': 27, 'sequences': 15, 'views': 53, 'default_acl': 37, 'schemas': 16, 'extensions': 6, 'roles': 17, 'memberships': 20}
diffs {"columns": {"different_explained": 70}, "constraints": {"different_explained": 8}, "indexes": {"different_explained": 1}, "functions": {"different_explained": 18}, "views": {"different_explained": 1}, "extensions": {"missing_explained": 5}}
UNEXPLAINED total 0
reference data: 27 statements from 23 migrations
refdata errors: 0
INSTALL OK (postgres NOSUPERUSER): group_storage core invariants balance
PASS scenarios (9 marcadores PASS)
PASS phase2b (10 marcadores PASS)
PASS phase2c (2 marcadores PASS)
PASS phase2d (8 marcadores PASS)
PASS phase2e (7 marcadores PASS)
PASS phase2f-negative (2 marcadores PASS)
PASS kill-switch (level 1, reverse available, ACL unchanged + rollback)
PASS phase2c-invariant-matrix (1 marcadores PASS)
PASS phase2f-concurrency (5 marcadores)
PASS phase2g-approval (3 marcadores PASS)
PASS matching-parity (1 marcadores PASS)
PASS phase2j (11 marcadores PASS)
PASS phase2j-concurrency (7 marcadores)
PASS phase2l (9 marcadores)
PASS phase2n-context execution (item1/2 assertions; item3 OPEN owner-trigger boundary, NOT security acceptance)

```

#### rollback.out
```text
installed local offset_group_storage
installed local offset_core
installed local offset_invariants
installed local offset_balance
installed local offset_approval
installed local status
installed local offset_kill_switch
installed local emergency
installed local reactivation
installed local cash_position
installed local cash_position_invariant
installed local restore
rolled back local restore
rolled back local cash_position_invariant
rolled back local cash_position
rolled back local reactivation
rolled back local emergency
rolled back local offset_kill_switch
rolled back local status
rolled back local offset_approval
rolled back local offset_balance
rolled back local offset_invariants
rolled back local offset_core
rolled back local offset_group_storage
PASS 2l full capture equality: owners/ACL/memberships/roles/types/defaults/indexes/RI/triggers/policies/functions/views

```

#### github.json
```text
{
  "sha": "bb701b1f495fb477fcb473a2520078065293549c",
  "files": {
    "supabase/tests/issue335/phase2n-context.py": {
      "http": 404
    },
    "supabase/tests/issue335/phase2h-suite.sh": {
      "http": 200,
      "sha256": "ce3a01bf9a38337a6b86a476090ff34f557c0a762f60626243bce9bbf9561d17",
      "local_equal": false
    },
    "docs/testes/issue335-fase2n-leituras.md": {
      "http": 200,
      "sha256": "e3f55a11f6d05a36819f9179a2e09dcb9a5c56cf49e7ae839cd56fb8a8a0b632",
      "local_equal": false
    },
    "docs/testes/issue335-fases12-local.md": {
      "http": 200,
      "sha256": "51a3a9a2118a4871db64d2df7a0dffcc04fccc54fcb9bbcf126ae717b72e0a41",
      "local_equal": true
    },
    "docs/testes/issue335-fase2n-hashes.sha256": {
      "http": 200,
      "sha256": "c5d07c9f0fde78f5941f7a5d2872879e654d973965cb212b7fcb142391644887",
      "local_equal": true
    }
  },
  "runs": [
    {
      "id": 39686372314,
      "status": "completed",
      "conclusion": "success",
      "sha": "bb701b1f495fb477fcb473a2520078065293549c"
    }
  ],
  "ci_covers_1b": false
}
```

### Matriz1b completa esperado/obtido/linhas/classificação
```json
[
  {
    "item": 1,
    "role": "editor",
    "attack": "replay after own COMMIT",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "manager",
    "attack": "replay after own COMMIT",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "user",
    "attack": "replay after own COMMIT",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "anon",
    "attack": "replay after own COMMIT",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "service_role",
    "attack": "replay after own COMMIT",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "sandbox_exec",
    "attack": "replay after own COMMIT",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "sandbox_exec specific",
    "attack": "replay after own COMMIT",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "postgres",
    "attack": "replay after own COMMIT",
    "expected": "P0001:managed_operation_required",
    "actual": "P0001:managed_operation_required",
    "pass_": true
  },
  {
    "item": 1,
    "role": "postgres SET executor",
    "attack": "replay after own COMMIT",
    "expected": "P0001:managed_operation_required",
    "actual": "P0001:managed_operation_required",
    "pass_": true
  },
  {
    "item": 1,
    "role": "same A new xid",
    "attack": "replay after own COMMIT",
    "expected": "false/42501",
    "actual": "false/42501",
    "pass_": true
  },
  {
    "item": 1,
    "role": "editor",
    "attack": "replay after own ROLLBACK",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "manager",
    "attack": "replay after own ROLLBACK",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "user",
    "attack": "replay after own ROLLBACK",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "anon",
    "attack": "replay after own ROLLBACK",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "service_role",
    "attack": "replay after own ROLLBACK",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "sandbox_exec",
    "attack": "replay after own ROLLBACK",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "sandbox_exec specific",
    "attack": "replay after own ROLLBACK",
    "expected": "42501",
    "actual": "42501:permission denied for function _issue335_execute",
    "pass_": true
  },
  {
    "item": 1,
    "role": "postgres",
    "attack": "replay after own ROLLBACK",
    "expected": "P0001:managed_operation_required",
    "actual": "P0001:managed_operation_required",
    "pass_": true
  },
  {
    "item": 1,
    "role": "postgres SET executor",
    "attack": "replay after own ROLLBACK",
    "expected": "P0001:managed_operation_required",
    "actual": "P0001:managed_operation_required",
    "pass_": true
  },
  {
    "item": 1,
    "role": "same A new xid",
    "attack": "replay after own ROLLBACK",
    "expected": "false/42501",
    "actual": "false/42501",
    "pass_": true
  },
  {
    "item": 2,
    "role": "editor",
    "attack": "INSERT transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "editor",
    "attack": "DELETE transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "editor",
    "attack": "INSERT transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "editor",
    "attack": "DELETE transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "editor",
    "attack": "INSERT transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "editor",
    "attack": "DELETE transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "manager",
    "attack": "INSERT transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "manager",
    "attack": "DELETE transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "manager",
    "attack": "INSERT transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "manager",
    "attack": "DELETE transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "manager",
    "attack": "INSERT transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "manager",
    "attack": "DELETE transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "user",
    "attack": "INSERT transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "user",
    "attack": "DELETE transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "user",
    "attack": "INSERT transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "user",
    "attack": "DELETE transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "user",
    "attack": "INSERT transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "user",
    "attack": "DELETE transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "ok:0",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "anon",
    "attack": "INSERT transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "anon",
    "attack": "DELETE transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "anon",
    "attack": "INSERT transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "anon",
    "attack": "DELETE transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "anon",
    "attack": "INSERT transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "anon",
    "attack": "DELETE transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "ok:0",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "service_role",
    "attack": "INSERT transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "service_role",
    "attack": "DELETE transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "service_role",
    "attack": "INSERT transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "service_role",
    "attack": "DELETE transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "service_role",
    "attack": "INSERT transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "service_role",
    "attack": "DELETE transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "service_role",
    "attack": "legacy offset INSERT+DELETE",
    "expected": "1+1 authorized bypass, rollback",
    "actual": "1+1",
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec",
    "attack": "INSERT transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec",
    "attack": "DELETE transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec",
    "attack": "INSERT transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec",
    "attack": "DELETE transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec",
    "attack": "INSERT transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec",
    "attack": "DELETE transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offsets",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec specific",
    "attack": "INSERT transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec specific",
    "attack": "DELETE transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec specific",
    "attack": "INSERT transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec specific",
    "attack": "DELETE transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec specific",
    "attack": "INSERT transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "sandbox_exec specific",
    "attack": "DELETE transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offsets",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres",
    "attack": "INSERT transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres",
    "attack": "DELETE transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres",
    "attack": "INSERT transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres",
    "attack": "DELETE transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres",
    "attack": "INSERT transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres",
    "attack": "DELETE transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres",
    "attack": "legacy offset INSERT+DELETE",
    "expected": "1+1 authorized bypass, rollback",
    "actual": "1+1",
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres SET executor",
    "attack": "INSERT transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres SET executor",
    "attack": "DELETE transaction_offset_groups",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_groups",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres SET executor",
    "attack": "INSERT transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres SET executor",
    "attack": "DELETE transaction_offset_items",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offset_items",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres SET executor",
    "attack": "INSERT transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "P0001:managed_operation_required",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 2,
    "role": "postgres SET executor",
    "attack": "DELETE transaction_offsets",
    "expected": "42501/guard or RLS0; no managed write",
    "actual": "42501:permission denied for table transaction_offsets",
    "affected": 0,
    "persistent": false,
    "pass_": true
  },
  {
    "item": 3,
    "role": "owner-created attacker SECURITY DEFINER trigger",
    "attack": "INSERT INTO transaction_offset_groups(id,company_id,supplier_id,request_id,request_hash,operation_date,movement_amount,created_by)\n        VALUES('32eabcf5-b5ff-4f97-a7d6-e7a50e089fb9','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000020','fc800d43-5079-48a2-b9d3-59d57541e4a6','valid-test-hash','2026-10-13',0,'00000000-0000-0000-0000-000000000010') RETURNING id",
    "expected": "security requirement: DENY; owner trusted-base boundary being measured",
    "actual": "ok",
    "affected": 1,
    "security_pass": false,
    "classification": "OPEN privilege/context borrowing; all rolled back",
    "pass_": true
  },
  {
    "item": 3,
    "role": "owner-created attacker SECURITY DEFINER trigger",
    "attack": "INSERT INTO transaction_offset_items(id,group_id,company_id,transaction_id,cash_order,type,base_amount,iva_rate,gross_amount,prior_paid_amount,prior_status,open_amount,cash_amount,compensation_amount)\n        VALUES('76fc953d-bcc9-45e9-8317-fe9bf6b65d46','fd117d68-7bf4-4e72-addb-340ec40536be','00000000-0000-0000-0000-000000000001','f098ae89-be8d-4f0c-970e-ad181e2b7c08',99,'income',10,0,10,0,'approved',10,0,10) RETURNING id",
    "expected": "security requirement: DENY; owner trusted-base boundary being measured",
    "actual": "P0001:invalid_group_state",
    "affected": 0,
    "security_pass": true,
    "classification": "OPEN privilege/context borrowing; all rolled back",
    "pass_": true
  },
  {
    "item": 3,
    "role": "owner-created attacker SECURITY DEFINER trigger",
    "attack": "INSERT INTO transaction_offsets(id,company_id,receivable_transaction_id,payable_transaction_id,amount,offset_group_id)\n        VALUES('48bd367b-deda-4e73-9ca1-48441666c7fc','00000000-0000-0000-0000-000000000001','f098ae89-be8d-4f0c-970e-ad181e2b7c08','7a1ed778-05e7-4a0a-8e46-0eab997700f6',1,'fd117d68-7bf4-4e72-addb-340ec40536be') RETURNING id",
    "expected": "security requirement: DENY; owner trusted-base boundary being measured",
    "actual": "ok",
    "affected": 1,
    "security_pass": false,
    "classification": "OPEN privilege/context borrowing; all rolled back",
    "pass_": true
  },
  {
    "item": 3,
    "role": "owner-created attacker SECURITY DEFINER trigger",
    "attack": "UPDATE \"companies\" SET \"display_name\"=\"display_name\"||' stolen' WHERE id='00000000-0000-0000-0000-000000000001'",
    "expected": "security requirement: DENY; owner trusted-base boundary being measured",
    "actual": "ok",
    "affected": 1,
    "security_pass": false,
    "classification": "OPEN privilege/context borrowing; all rolled back",
    "pass_": true
  },
  {
    "item": 3,
    "role": "owner-created attacker SECURITY DEFINER trigger",
    "attack": "UPDATE \"suppliers\" SET \"name\"=\"name\"||' stolen' WHERE id='00000000-0000-0000-0000-000000000020'",
    "expected": "security requirement: DENY; owner trusted-base boundary being measured",
    "actual": "ok",
    "affected": 1,
    "security_pass": false,
    "classification": "OPEN privilege/context borrowing; all rolled back",
    "pass_": true
  },
  {
    "item": 3,
    "role": "owner-created attacker SECURITY DEFINER trigger",
    "attack": "UPDATE \"financial_accounts\" SET \"name\"=\"name\"||' stolen' WHERE id='00000000-0000-0000-0000-000000000030'",
    "expected": "security requirement: DENY; owner trusted-base boundary being measured",
    "actual": "ok",
    "affected": 1,
    "security_pass": false,
    "classification": "OPEN privilege/context borrowing; all rolled back",
    "pass_": true
  },
  {
    "item": 3,
    "role": "owner-created attacker SECURITY DEFINER trigger",
    "attack": "UPDATE \"events\" SET name=name||' stolen' WHERE id='00000000-0000-0000-0000-000000000063'",
    "expected": "security requirement: DENY; owner trusted-base boundary being measured",
    "actual": "ok",
    "affected": 1,
    "security_pass": false,
    "classification": "OPEN privilege/context borrowing; all rolled back",
    "pass_": true
  },
  {
    "item": 3,
    "role": "owner-created attacker SECURITY DEFINER trigger",
    "attack": "UPDATE \"event_settlements\" SET name=name||' stolen' WHERE id='4429889b-68fe-4555-97d8-2aeb2a3861f8'",
    "expected": "security requirement: DENY; owner trusted-base boundary being measured",
    "actual": "ok",
    "affected": 1,
    "security_pass": false,
    "classification": "OPEN privilege/context borrowing; all rolled back",
    "pass_": true
  }
]
```

### Hashes dos artefactos locais (captura normalizada)
```text
b22703d92fab68e3e8c714f057bbc32415efec369e847eb78c14183df488767a  /tmp/issue335-2n1b/suite/phase2n-context.json
7274420a5dd801cfe29336a1c93f23253a263af9e2d046c2e2f9fb4aa4cda403  /tmp/issue335-2n1b/suite/phase2n-context.out
6b2e13e8e5714e0d7a669bd612f1d63349d8f296c453c3c2a3888bd7b7013a52  /tmp/issue335-2n1b/suite.out
474947e27e3cf0c0d328ccc6e76c2fbb6d915e781ddc9ccb43de36325a2af1a1  /tmp/issue335-2n1b/rollback/before.json
474947e27e3cf0c0d328ccc6e76c2fbb6d915e781ddc9ccb43de36325a2af1a1  /tmp/issue335-2n1b/rollback/after.json
44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a  /tmp/issue335-2n1b/rollback/differences.json
dd375a9fcc9e8b8910acf17f10cf9be00ef7c999174190a54af923cb1baa6543  /tmp/issue335-2n1b/rollback.out
```

Questões/decisões em aberto:nenhuma instalação autorizada;itens2/3 exigem prova/desenho técnico,modelo owner deve ser explicitamente aceite só após candidatos/testes. Recomendada:manter M1 aberto e não instalar.


## Fase 2n-Bloco1c — fecho final do M1 (21/10/2026)

Âmbito: só passos 1–2; LOCAL/INERTE, sem TS, migrations, DDL/DML Live ou Publish. Live exclusivamente SELECT pg_trigger para lista permitida. A–C e trigger_watch exigem Sim separado.

### Resultado
- Passo 1 FECHADO sobre o schema real: INSERT de item com valores válidos em grupo applied, inexistente e company_id de outra empresa; DELETE de grupo com itens e de item REFERENCIADO. 45 ataques reais (5×9 papéis), zero alterações das 8 tabelas de negócio.
- Precisão importante: transaction_offsets NÃO tem FK de item; a referência real ao item é transaction_payments.offset_item_id (FK composta). Não foi inventada uma coluna receivable_item_id. Grupo tem itens; item tem pagamento com offset: alvos reais certificados. DELETE de item é recusado pela guarda invalid_group_state antes da FK (NEW ausente em DELETE); não se afirma que a FK foi alcançada. Nenhum SQL core alterado.
- ANTES: 1b não certificava applied/referências nem conteúdo completo; agora controlo positivo INSERT1 com mesmos FKs/valores em grupo preparing, rollback integral das linhas; 5 controlos negativos + controlo específico do DELETE referenciado. Grupo referenciado chega a 23503; item recusa P0001:invalid_group_state.
- DEPOIS: snapshots completos de todas as colunas/linhas de transaction_offset_groups, transaction_offset_items, transaction_offsets, companies, suppliers, events, financial_accounts, event_settlements; JSON ordenado + SHA256 POR TABELA, conteúdo integral before/after em cada ataque. Ataque em SAVEPOINT, recusa ou RLS0; termina com COMMIT e compara snapshot externo. Não depende de contagem nem do simples ROLLBACK final.
- service_role e postgres: bypass legado de offsets NÃO geridos INSERT1/DELETE1 autorizado e explicitamente testado; fixtures novas com saldo disponível, ROLLBACK. Não permite grupo gerido fora do núcleo.
- Passo 2 FECHADO como DETETIVO, não prevenção: dono DDL é trusted computing base. Trigger SECURITY DEFINER do dono dentro do núcleo não é ataque de editor/manager/user; pode controlar núcleo e vigia. Sem capacidades por escrita.
- ANTES: adiciona trigger atacante em transaction_offset_groups, invariantes antigos ficam exactamente iguais. DEPOIS: vigia legítima 0/true; trigger real dispara dentro de j_group, lê token em contexto legítimo, vigia 1/false e nome exacto. ROLLBACK: 0/true. Triggers artificiais zzz_issue335_failure dos testes antigos também detectados; removidos só pelo nome+schema+função exactos no harness, nunca incluídos na allowlist Live.

### Candidato adicional / quadro A–C
supabase/manual/20261021_issue335_trigger_watch.INERTE.sql: cria só função nova issue335_trigger_watch(), SQL STABLE SECURITY INVOKER, leitura catálogo, ACL service_role. Retorna name/current_count/reference_count/conforme/sample; sample lista TODOS os triggers de utilizador nas 11 tabelas, allowed por par tabela/nome. Lista versionada: nomes capturados por SELECT Live + issue335_guard das tabelas vigiadas. Não altera funções/triggers existentes, dados, registry ou cron. Requer execução periódica/canonical integration numa decisão futura; aqui runner chama explicitamente. No quadro A/B/C entra APÓS storage+core/invariants como candidato adicional DETETIVO, Sim separado, nunca embutido em A–C.
Rollback: supabase/manual/20261021_issue335_trigger_watch.ROLLBACK-INERTE.sql, DROP apenas da nova função; instalação recusa função preexistente, lock_timeout 5s. Risco residual: dono pode substituir corpo de trigger permitido, desativá-lo, substituir/remover vigia; allowlist por nome não mede hashes de funções. Não se afirma prevenção nem deteção de substituição com o mesmo nome.

### Testes e classificação de erros
Harness exato PostgreSQL 17.6 (embedded-postgres 17.6.0), postgres NOSUPERUSER, identidades de sessão por papel, triggers reais. pgvector 0.8.0 compilado localmente com headers 17.9 compatíveis do mesmo major; servidor permanece 17.6. psycopg2 instalado só em /tmp. Tentativas iniciais: 24 erros por extensão ausente/script 0.8.0 indisponível; nunca contadas como PASS. Repetição final: 15.529 statements, 0 falhas; catálogo 2.934 RI iguais, 0 diferenças não explicadas. Classificações hospedadas pré-existentes do diferencial preservadas (5 extensões de ambiente não replicáveis explicadas).
Suite completa final: 14 grupos históricos PASS + phase2n-context 84 probes + phase2n-trigger-watch PASS; zero skips de ataques. Antigo output item3 OPEN é histórico do modelo DENY, supersedido SOMENTE pela decisão explícita de confiança DDL e controlo detetivo 1c, não ocultado. Notices DROP IF EXISTS e aviso locale ausente não são testes saltados. Avisos pré-existentes de fixture coala supplier_id mantidos nos logs, sem falsificar aprovação.
Falhas novas corrigidas só nas fixtures/teste: bypass com receita já saturada (23514) → novas transações com saldo; 11 triggers artificiais correctamente detectados → limpeza exacta de fixtures; expectativa FK item errada → assert da guarda real P0001 (continua recusa, schema não alterado). Asserção atacante real adicionada antes da execução final. Nenhum TS tocado, Vitest não solicitado/executado.
Rollback 13 pares (12 anteriores + trigger_watch): captura COMPLETA do catálogo, NORMALIZADA apenas na ordem das linhas e ACL, before=after, diferenças {}. Não é captura byte-a-byte de pg_dump nem dados de negócio; snapshots dos ataques são conteúdo integral de linhas com ordenação determinística.

### Matriz papel × ataque (esperado e obtido)
Todos esperam DENY/RLS0 e conteúdo before=after; motivos concretos abaixo. Service_role/postgres legado: INSERT1+DELETE1 esperado e obtido, ROLLBACK.

editor:
- INSERT applied group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT missing group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT other company: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- DELETE referenced group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_groups; affected=0; 8 snapshots completos iguais.
- DELETE referenced item: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.

manager:
- INSERT applied group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT missing group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT other company: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- DELETE referenced group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_groups; affected=0; 8 snapshots completos iguais.
- DELETE referenced item: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.

user:
- INSERT applied group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT missing group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT other company: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- DELETE referenced group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_groups; affected=0; 8 snapshots completos iguais.
- DELETE referenced item: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.

anon:
- INSERT applied group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT missing group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT other company: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- DELETE referenced group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_groups; affected=0; 8 snapshots completos iguais.
- DELETE referenced item: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.

service_role:
- INSERT applied group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT missing group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT other company: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- DELETE referenced group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_groups; affected=0; 8 snapshots completos iguais.
- DELETE referenced item: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.

sandbox_exec:
- INSERT applied group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT missing group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT other company: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- DELETE referenced group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_groups; affected=0; 8 snapshots completos iguais.
- DELETE referenced item: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.

sandbox_exec specific:
- INSERT applied group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT missing group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- INSERT other company: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.
- DELETE referenced group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_groups; affected=0; 8 snapshots completos iguais.
- DELETE referenced item: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.

postgres:
- INSERT applied group: esperado DENY/RLS0; obtido P0001:managed_operation_required; affected=0; 8 snapshots completos iguais.
- INSERT missing group: esperado DENY/RLS0; obtido P0001:managed_operation_required; affected=0; 8 snapshots completos iguais.
- INSERT other company: esperado DENY/RLS0; obtido P0001:managed_operation_required; affected=0; 8 snapshots completos iguais.
- DELETE referenced group: esperado DENY/RLS0; obtido P0001:managed_operation_required; affected=0; 8 snapshots completos iguais.
- DELETE referenced item: esperado DENY/RLS0; obtido P0001:managed_operation_required; affected=0; 8 snapshots completos iguais.

postgres SET executor:
- INSERT applied group: esperado DENY/RLS0; obtido P0001:managed_operation_required; affected=0; 8 snapshots completos iguais.
- INSERT missing group: esperado DENY/RLS0; obtido P0001:managed_operation_required; affected=0; 8 snapshots completos iguais.
- INSERT other company: esperado DENY/RLS0; obtido P0001:managed_operation_required; affected=0; 8 snapshots completos iguais.
- DELETE referenced group: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_groups; affected=0; 8 snapshots completos iguais.
- DELETE referenced item: esperado DENY/RLS0; obtido 42501:permission denied for table transaction_offset_items; affected=0; 8 snapshots completos iguais.

### Evidência local integral (hashes; ficheiros temporários não substituem runner versionado)
```text
0a90c59b4a2049030030ae8bc0e3e57b3eb5ac1e315003ed1b27f91dfaeb4e33  /tmp/issue335-1c/suite-final.out
25637be5482c8d8bcd85c0387cebd43989069f7fd5ca6d1766a52b1f8d24a157  /tmp/issue335-1c/suite-final/phase2n-trigger-watch.json
cec62127d8cad7825d45acaabd79e2b21a3f44658e80fa33a51b4e24f17dd8a7  /tmp/issue335-1c/suite-final/phase2n-context.json
474947e27e3cf0c0d328ccc6e76c2fbb6d915e781ddc9ccb43de36325a2af1a1  /tmp/issue335-1c/rollback-final/before.json
474947e27e3cf0c0d328ccc6e76c2fbb6d915e781ddc9ccb43de36325a2af1a1  /tmp/issue335-1c/rollback-final/after.json
44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a  /tmp/issue335-1c/rollback-final/differences.json
0c92d9b089cd58817d66367aa9bdc7245717bc36531c9ca70b74a91d3dfa5317  /tmp/issue335-1c/rollback-final.out
```

M1 FECHADO tecnicamente neste âmbito de modelo de confiança DDL + ataques pedidos sobre schema real. A referência item→offset não existe no schema; testada a referência pagamento→item real, com offset no pagamento. Não implica aceitação das outras fases, A–C, instalação ou CI remoto.
