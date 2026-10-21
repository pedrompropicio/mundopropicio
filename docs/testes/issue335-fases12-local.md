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
