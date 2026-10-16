# #328 — Aplicação em produção (16/10/2026)
Autorização: Pedro 16/10 14:06 Fortaleza. HEAD local = remoto = a63d54b6 antes de editar.
- Guard ANTES: 3 hashes Live = esperadas; club_crew_pending e 2 colunas ausentes.
- Migração `0176_issue328_club_identity_crew_pending` (transação única) = SQL de `supabase/manual/20261016_issue328.PENDENTE.sql` (cabeçalho marcado APLICADO).
- DEPOIS: 4 hashes = esperadas; colunas + constraint presentes; has_function_privilege anon/authenticated=false, service_role=true nas 4 SECDEF.
- Dados: membros 23, confirmados 15, créditos 16/1650, hashes de membros/pontos/crews iguais antes/depois (patch não mexe em dados).
- Edge newgang-portal: patch aplicado + correção (pendência malformada → 500 crew_pending / me `unavailable`, teste 10). Deploy 17:12Z, source_sha256 f67c2bc7…0a83. A função implantada fica ativa já, antes de qualquer Publish.
- Smoke: site 200; crew_pending sem token 401; op inválida 400.
- Testes: deno 10/10 sem rede; deno check só 2 erros baseline Wallet; tsgo 0; vitest 1254 ok.
- Não validado: RLS/Auth com sessão real, retry/dismiss com membro real, emails, Wallet.
- Rollback: `supabase/manual/20261016_issue328.ROLLBACK.sql` (não apaga histórico; edge: reverter index.ts/pending.ts e deploy).
Detalhe: aplicacao.json.
