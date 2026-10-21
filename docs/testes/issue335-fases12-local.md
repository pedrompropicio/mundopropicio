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
a64721f8ee9d0c8b0c5f41364d22fe3701679b5a1152f241b847296e49f446d0  src/lib/transaction-offset-plan.test.ts
44c223e9b374f9b48fbb0484d2cfd5371183903c12678f24cd3d3300f7cef4e6  supabase/manual/20261021_issue335_offset_core.INERTE.sql
8bd457557cd337488196f806a028f054fe33ee9714ca5798f146387ca7161701  supabase/manual/20261021_issue335_offset_core.ROLLBACK-INERTE.sql
dd6969d166b3a81f18e31c0b6ac8c7e43627f4d51eda17117d8f14df9d14e7db  supabase/manual/20261021_issue335_offset_group_storage.INERTE.sql
0fd47ed5f4e6d4c5933d87157f5edd467599a00430820446ccdc51b8b76a1590  supabase/manual/20261021_issue335_offset_group_storage.ROLLBACK-INERTE.sql
24bf7ad2a273cc5bc080f20db3c90378f2829ea036cbd264d526d7fda6263c4a  supabase/manual/20261021_issue335_offset_invariants.INERTE.sql
bf303fbe2224fd336b0c1a535849e8fc7e7eb64c6e26da8e169dd67876ea4935  supabase/manual/20261021_issue335_offset_invariants.ROLLBACK-INERTE.sql
```
