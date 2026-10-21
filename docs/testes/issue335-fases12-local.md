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
