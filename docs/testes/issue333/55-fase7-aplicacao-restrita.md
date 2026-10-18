# #333 — fase7 estrutura restrita aplicada, não ativação

UTC 2026-10-18 06:11–06:14. HEAD recebido e38900fc7cf2d6258a4136ab8f90f0860ce91bf9, GitHub idêntico; CI39102834214 completed/success confirmado pela API (CI39102377304 do código revisto também success). Issue aberta; reserva333 mantida. Executor único, sem subagentes.

## Submissão oficial e bytes
Original supabase/manual/20261018_issue333_pilot8_allowlist.PENDENTE.sql intacto SHA256 ed445516276c1355c264e4a43e38fdde153f51602e8b767b29d6b44a37fd48c2.
Único diff autorizado na submissão: retirar linha3 BEGIN; e linha180 COMMIT;. Todos os outros bytes/DO/END/guards intactos; ferramenta oficial gere transação.
Migration oficial aplicada: drizzle/migrations/0195_issue333_pilot8_scoped_closed_structure.sql. SHA256 cb2153c127cc928642472373977b96928186ef12a792083ea4d862a79bc8d7aa; cmp exit0 com payload sem wrappers. Registry criado só pela ferramenta;0190–0194 intactos. Tipos regenerados automaticamente pela ferramenta, sem edição manual.

## Fontes e ACL efetivas Live
Preflight cincoMD5 iguais53/54, owner postgres/search_path public,pg_temp. Defaults public abrangentes revalidados antes e depois; nenhuma alteração global.
Pós-aplicação MD5 prosrc coincide exatamente com fontes candidatas (ver abaixo). Todos owner postgres/search_path public,pg_temp/PUBLIC execute=false.
EXECUTE [anon,authenticated,service_role]: gate false/false/false; capabilities false/true/false; scoped receipt false/false/true. Só grants postgres + destinatário explícito nos objetos novos; grants nominais herdados do executor removidos nos novos, preservados nas funções existentes.
preparation false/false/false; session e commit false/true/false; gate333 false/false/false; old receipt false/false/true. ACL text das cinco existentes exatamente iguais ao preflight, incluindo executor nominal. Table allowlist ACL somente postgres=arwdDxtm/postgres, RLS=true, force=false, policies0; anon/auth/service SELECT/INSERT/UPDATE/DELETE false; PUBLIC sem grants. Count0, settings core/attempt count0/open0. Não existem linhas de ativação.

## Deploy e HTTP
Deploy exclusivo data-entry confirmado pela ferramenta. SourceSHA submetido files/settings:55759e143723f018e17866375f57a501a16a22a1547ed6971c8ab786165b0a94. Isto não é hash runtime lido nem versão runtime; não observados. handler/index hashes iguais manifesto/código3addc012.
POST status sem Authorization401 UNAUTHORIZED_NO_AUTH_HEADER; POST token/header de owner/empresa forjados401 UNAUTHORIZED_INVALID_JWT_FORMAT: rejeição gateway, não prova de contexto com JWT real.
Ferramenta HTTP não aceita OPTIONS (invalid_http_method); requests.options direto confirmou200, allow-origin*, allow-headers contém authorization/content-type/x-data-entry-user/x-data-entry-company.
Nenhuma fixture autenticada nova/existente usada; não mint/login/reabertura. Contrato authenticated sem allowlist e efeitos positivos Cloud NÃO exercitados; ACL/source não substituem essa prova. Testes permanentes handler fail-closed4/4PASS; provas locais53 continuam separadas. Não repetir negativos50.

## Comparação integral de dados e limites
Mesma query COUNT+hash por rowMD5 ordenado antes/depois, sem excluir fixtures/perfis/roles/auditorias.15 grupos não vazios listados abaixo absolutamente iguais.8 grupos vazios omitidos naturalmente pelo GROUP BY, confirmados0 por COUNT explícito depois:documents/messages/previews/results/receipts/settings/attempt_settings/attempt_audit; preflight não produziu linhas desses grupos, comprovando0. Allowlist nova0. Storage somente buckets data-entry-staging/standalone-invoices,105objetos; buckets2 e hashes iguais. Other_functions exclui SOMENTE4substituídas+3novas;701 corpos/ACL/config restantes iguais. Table_acl_rls e policies excluem só nova allowlist; existentes311/1085 iguais. Nenhuma alteração financeira/documental/fixture/audit observada.

Sem rollback: não houve divergência. Rollback original guardado intacto; condições exigem fontes candidatas exatas/flags fechadas/nenhuma allowlist enabled; se necessário futura migration oficial com só wrappers removidos, semDROP/delete. Não executado.

## Próximo passo controlador
Verificar independentemente0195/fonts/grants/baselines/deploy; só controlador marca fase7 concluída. Fase6 concluída, fase7 aplicada aguardando review, fase8 não executada. Depois autorização específica de piloto8 já preparado: PDF mínimo fictício válido/bytes/hash/reader+validateDocument antes conta; única conta e owner/empresa/operação temporários; prévia/autorização canónica/commit/check/duplo-clique e finally não destrutivo. NÃO criar conta/allowlist nesta entrega; nenhum flag global. Concorrência legada normalizada não é garantia global. Automação pausada; #323/DECISIONS/AGENTS/0194/portal-track preservados. Sem Publish/crons/Meta/email/financeiro real.

## MD5 candidatos verificados
- data_entry_pilot8_gate: 1e066a6df3637c8d5c8f99f00a255d33
- data_entry_pilot8_capabilities: bb4ba4bef75c97ad61564868cfe534d0
- data_entry_preparation_gate: ae3012613f345731917f629ebfe93a74
- data_entry_session: 9be714ee0ad4f8df6aa36f3c8e480979
- data_entry_commit: 3e47099b39581940ef7f6e6203b1dddd
- standalone_attempt_gate_333: a74836149d3a2eba12b5d5619222f9ab
- data_entry_pilot8_receipt: ec5f67dc0d9dfa973d2b78a45b010619

## Baselines antes = depois
```json
{
  "accounts": [
    27,
    "596361f4c6766c397faa166d14141b37"
  ],
  "attempts": [
    6,
    "eff2ef4c205ecfdc9920184837c7a692"
  ],
  "audit": [
    13240,
    "00f2e23c668d2f34e3a6063537c571d8"
  ],
  "buckets": [
    2,
    "8a5388ff6e610c9e18836cfb65d14c2b"
  ],
  "core_sessions": [
    2,
    "ccced8abf755ea045bdd376795abaca5"
  ],
  "forecasts": [
    2300,
    "3016a314ee91305e8fdd2274c8f40d20"
  ],
  "invoices": [
    98,
    "ee04da1f3bd3e05b2ad72e9f44e3e1bc"
  ],
  "other_functions": [
    701,
    "3a778ad6381c0272ecc068c2d3000df6"
  ],
  "payments": [
    1417,
    "1e9ee5af8dead9199574b29d5627e1fc"
  ],
  "policies": [
    1085,
    "08439870862eb7139626d98363dceb77"
  ],
  "profiles": [
    63,
    "49160012d9fb42152b6e5aff1f674906"
  ],
  "roles": [
    86,
    "04483f3e5681ef0f30759018519342f7"
  ],
  "storage": [
    105,
    "a76577e7bc2bb9d05a21da40105fa034"
  ],
  "table_acl_rls": [
    311,
    "dd7b8df335524722ef6e8c03a316d8b1"
  ],
  "transactions": [
    1966,
    "30ccbaa48dc3ec7490c18cce8c5b41ab"
  ]
}
```
