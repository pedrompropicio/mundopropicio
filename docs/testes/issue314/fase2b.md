# #314 Fase 2b (R2) — ação só para a data de nascimento

Executor: agente Lovable ERP para o 0 · Cowork (Claude). «Sim» do Pedro: 26/10/2026 18:29 (Fortaleza). HEAD de partida 0f2e2c1a8 (CI desse HEAD não visível a partir do agente). Sem crons, sync, Publish, portal-track ou outras funções.

## Lidos
docs/testes/issue314/fase1.md, fase2.md, docs/features/newgang-consentimento-pessoa-332.md; em Live (pg_get_functiondef): club_profile_confirm, club_profile_state, _club314_birth_date, club_age_class, _club330_profile_guard (trigger club_profile_guard), _club332_city_profile (trigger club332_city_profile).

## Migração
- `drizzle/migrations/0267_issue314_fase2b_birth_date_only.sql` (única aplicada), cópia byte-idêntica `supabase/manual/0267_issue314_fase2b_birth_date_only.sql` (cmp; sha256 125b43ce4c8e74af4ad556ecec6c5f5ea19274561d6becd2c3bdc60687eb0b77); inverso comentado `supabase/manual/rollback_0267_issue314_fase2b.sql`.
- `club_profile_birth_date(uuid,text,jsonb) RETURNS jsonb`, plpgsql, SECURITY DEFINER, search_path=public. Sessão resolvida com o mesmo SELECT de club_profile_confirm; mesmos locks (_club_site_lock, FOR NO KEY UPDATE) e revalidação.
- Payload só `{birth_date: "AAAA-MM-DD"}` (senão profile_payload); _club314_birth_date nulo → birth_date_invalid; under13 → parental_flow_required antes de qualquer escrita; data já existente → birth_date_already_set; INSERT … ON CONFLICT DO UPDATE … WHERE birth_date IS NULL. Não toca completed_at/award_*/países/cidade, não chama _club_award_core, não exige settings.enabled.
- club_profile_state funciona para membro sem linha de perfil e sem settings (campos nulos; age_class unknown antes da data) — não foi alterada.
- Triggers: club_profile_guard aceita (âmbito site/company da sessão; data validada); club332_city_profile normaliza só a cidade (nula). Provado em PGlite com as definições Live (fixture src/test/fixtures/issue314-fase2b-live-fns.sql).

## Verificação Live (queries próprias, antes/depois)
- md5 inalterados: club_profile_confirm 78006c79f2fec55304e27d80e57239ad; club_profile_state 8fefae0769892365db59914d310cada2; _club330_profile_guard cc14f43355301dfcebc623f2754e9c4f; _club332_city_profile bbe64f97e1c2d32f2c596b2f6fbe6b92; _club314_birth_date 5f2b541b9320a941ea469a625bddbebf; club_age_class f2fa5b5eee8619391a2db4183dee3313.
- Agregado das 799 funções pré-existentes (assinatura+md5+proacl) edfef5326738122d2e5d386e575254d2 igual antes/depois.
- Nova: md5 07ee7cc64e5f6dc67896abdbaabf9086; prosecdef=true; proconfig {search_path=public}; proacl {postgres=X, service_role=X, sandbox_exec=X} — mesmas entradas que club_profile_confirm (ordem diferente). anon=false, authenticated=false, service_role=true.
- Nenhum dado de membro inserido/alterado em Live.

## newgang-portal
- Ação `profile_birth` (profile.ts: profileBirth/profileBirthError; index.ts: mesmo padrão de profile_confirm — chaves permitidas, rate-limit obrigatório, sessão/membro). Erros: no_session 401; parental_flow_required/birth_date_already_set 409; birth_date_invalid/profile_payload 400; outros 500 profile_birth_unavailable.
- Deploy só newgang-portal, source_sha256 3ecf41fbb65147a9437aff1fbb96f542c8140a9f08eb454e3840f550927133cb.
- Live (Origin https://newgangfestival.pt, sem sessão): token inválido → 401 no_session; sem token → 401 no_session; chave extra → 400 profile_payload. Caminho com sessão real NÃO provado em Live (sem procedimento de sessão de teste aprovado).

## Testes
- src/test/issue314-fase2b-birth-date.test.ts 13/13 (PGlite: adulto, 13–17, <13 sem linha, não sobrescreve, sem linha → só birth_date e completed_at nulo, zero club_points, chave extra, futura/inválida/<1900, sessão inválida/expirada/não confirmada, ACL; código da ação).
- vitest completo 2614 passed / 6 skipped / 11 todo; tsgo exit 0.

## Em aberto
- Portal Newgang (1a915f50): passar a usar a ação profile_birth no pedido da data (Publish só pelo 0).
