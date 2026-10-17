# #332 — aplicação consentimento por pessoa

## Sincronização e leitura
Antes de qualquer escrita: Lovable/GitHub HEAD `7e950672400f92f1e64331a9f72b4824dbe0310d`, iguais; `merge-base --is-ancestor` exit 0; GitHub já continha último commit. Reserva #332 mantida até fecho; #323/DECISIONS intactos.

Lidos: docs/INDEX.md, docs/QUADRO.md, docs/estado/estado-newgang-portal.md, docs/estado/estado-coala-portal.md; Issues #322/#332; docs/features/consentimento-marketing-322.md e proposta-p2-p3-consentimento.md; memórias newgang-person-consent/newgang-profile-mission, portal RLS e multi-platform tracking; migrações 0169/0173/0175/0179/0181; ledger, perfil, sessão, handler e unsubscribe. Arquitetura portal e AGENTS lidos. Revisão independente identificou CAS, isolamento de finalidade, idade e ACL; corrigidos antes da aplicação.

## Aplicação e preservação
Migração canónica `0182_issue332_member_consent.sql` aplicada. Apenas duas APIs deployadas:
- newgang-portal source_sha256 `317db2e8a245ea0ee859ac24f6f2d8259470e6697b61077ab9d23fb9b9e365c8`
- handle-email-unsubscribe source_sha256 `9565e9fd60fa6b4273adfaa218f9207b06b4892ebcc7b31efd7f80e34bdbdfb6`

Snapshot antes/depois: club_points 31 linhas / 3075 pontos / hash `b138bae60762cb68157209ac97c1a199` preservado; perfis 1; tokens usados 10. Novos históricos/referências 0/0. Nenhum backfill ou consentimento/crédito real.
RLS ON; anon/authenticated sem leitura/escrita; service_role só SELECT nas novas tabelas, sem INSERT/UPDATE/DELETE/TRUNCATE/MAINTAIN. Só os 4 entrypoints são executáveis pelo serviço; helpers internos sem EXECUTE público ou service_role. UPDATE/DELETE/TRUNCATE bloqueados por triggers.

Hashes existentes antes/depois iguais:
- _club_site_lock 74b2a06b7edd3ff957089d8c4da9ecff
- club_profile_confirm bd3143f59bb3a93c8c8e7baed1815cbe
- club_profile_state 427b0698c2facf794ddfd7a5eb3826a4
- crm_meta_audience_collect_leads 5d4a95a7e46b58c0705388935c2e11a0
- marketing_consent_binding_valid f9bfe518cce723235f2f671c74ed2e2a
- marketing_consent_effective 13022a438e8294c4626d2b945d47900c
- marketing_consent_record d127c7787917afb25ba1a74f01520f69

## Testes
- PostgreSQL17.9 socket Unix, listen_addresses vazio, sem extensões instaláveis/network/cron/vault: #332 40/40; regressão #330 54/54 usando motor real #327/#328. 8 ligações concorrentes para idempotência; revoke bloqueia grant antigo concorrente. Falha real de trigger de supressão reverte ledger/token. Crypto é stub SQL local de fronteira, não teste criptográfico.
- Handler real Newgang + unsubscribe: 17/17 Deno, sem permissão de rede; missing/timeout/denied/empty/rejected, 401 sem fallback, GET/POST/one-click, sem retry/sucesso falso.
- Vitest completo 160 ficheiros: 1281 passed, 1 skipped, 11 todo. Subconjunto MP/Coala/#322/CRM: 53/53.
- Build automático OK às04:06:26 UTC. Typecheck separado não corrido (harness). CI GitHub final não confirmado.
- Smoke Live: site/bundle200 sem consents privados; países200/249; me sem sessão/token inválido401; preferences inválido401; unsubscribe token inválido404. Nenhuma escrita autenticada ou pessoa fictícia Live.

## Limitações
Portal separado não alterado/publicado. P_NG27_LISTA e Reactivar intactos; coletor legado precisa de decisão separada antes de entrega. Consentimento de pessoa não revoga sujeitos de cookies não vinculados. WhatsApp e parental verificável pendentes; nascimento ausente bloqueia grants. Sem Publish/envios/crons/CAPI. Issue GitHub não comentada por ausência de conexão acessível; conteúdo do fecho está aqui para comentário posterior. DECISIONS reservado #323 não alterado; arquitetura registada em AGENTS e decisão na secção Newgang do QUADRO.