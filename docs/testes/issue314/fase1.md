# #314 Fase 1 (R2) — versões v4/v2 + idade pela data completa

Executor: agente Lovable ERP para o 0 · Cowork (Claude). «Sim» do Pedro: 26/10/2026 17:02 (Fortaleza). HEAD de partida a7585ac5c9c26fa4a280ed8332cd1604a248df88.
Sem deploy, Publish, crons, sync/envio Meta, capi_*, policies. Sem dados pessoais neste documento.

## Lidos
docs/QUADRO.md (Em execução agora, reservas #359 e #368), docs/features/newgang-consentimento-pessoa-332.md, docs/testes/issue332/consentimento-pessoa.md, índice .lovable/memory (o ficheiro features/newgang-person-consent.md não existe nesse caminho; docs/testes/issue359 não existe).

## Colisão resolvida
Paragem inicial (colisão com #359/#368). O executor das duas reservas libertou `_crm_whatsapp_contact_guard` e `crm_ingest_lead_captures` (#359) e autorizou `_club368_resubscribe_clear` (só versões). 13 funções confirmadas em pg_proc.

## Incidente de aplicação
A primeira chamada aplicou por engano uma migração sem SQL: `drizzle/migrations/0265_issue314_fase1_versoes_idade.sql` contém apenas `-- placeholder` (sem efeito). A migração real é `0266_issue314_fase1_versoes_idade_real.sql`. Cópia byte-idêntica (cmp) em `supabase/manual/0266_issue314_fase1_versoes_idade.sql` (sha256 9d3ed130941c913ed88505050d49dbf95da5146812e3e331c735881aa896a1d9). Inverso comentado: `supabase/manual/rollback_0266_issue314_fase1.sql` (corpos originais completos).

## O que mudou (diffs em fase1-diff-funcoes.md)
- Nova `club_age_class(date)`: STABLE, SECURITY INVOKER, search_path public, pg_temp; idade em Europe/Lisbon (clock_timestamp). EXECUTE: authenticated, service_role; PUBLIC/anon = false.
- Novo auxiliar `_club314_birth_date(text)`: valida ISO yyyy-mm-dd real, não futura, ano >= 1900. SECURITY INVOKER; PUBLIC/anon/authenticated sem EXECUTE (service_role tem EXECUTE por privilégio por defeito do esquema).
- Conjuntos aceites {email-v3,email-v4}, {anuncios-v1,anuncios-v2}, {whatsapp-v1,whatsapp-v2} em 11 funções. Os três appenders gravam a versão recebida pelo payload: `club_profile_preferences` passa-a por `set_config('club314.consent_version', …, true)` (local à transação, limpa logo após); sem valor = versão antiga (revogações de outros caminhos inalteradas). A assinatura das funções não mudou.
- `club_profile_preferences`: guarda parental via `club_age_class(bd) IN ('under13','unknown')` → `parental_flow_required` (mesmo comportamento; -infinity já era impossível pela guarda do perfil).
- Ingestão: `crm_ingest_lead_captures` marca `under13_blocked` (processed=true) antes de contacto/lead; `club_from_lead_capture` e `_club332_consent_from_lead_capture` ignoram capturas `under13_blocked`; `club_from_lead_capture` grava `raw.birth_date` válida no perfil só se o perfil não tiver data (nunca sobrescreve). Sem raw.birth_date = comportamento anterior.
- `club_profile_state` (parte "profile" do me): + `age_class`.
- Coletor `newgang_clube:v2`: limiar 13+ → `club_age_class(birth_date)='adult'`; aceita anuncios-v1/v2. Ramo Coala intacto.
- `crm_whatsapp_eligible`: aceita etiquetas `club_profile_whatsapp-v1/-v2`. `_crm_whatsapp_project` e `_crm_whatsapp_contact_guard` NÃO alteradas (md5 guarda ac7469e0912c890f186d880951623c54 mantém-se).

## Verificação em Live (queries próprias)
(i) club_age_class existe; provolatile s, prosecdef false; has_function_privilege anon=false, authenticated=true, service_role=true.
(ii) Snapshot pg_proc (public+crm, 842 linhas) antes/depois: só 15 md5 mudados (os 14 listados no diff + nenhum outro) e 2 funções novas; prosecdef/proconfig/proacl idênticos em todas as pré-existentes (diff vazio sem a coluna md5). prosrc com versões: todas as funções que tinham v1/v3 contêm agora as duas.
md5 novos: ingestão crm_ingest_lead_captures 905ff064bae25cf54a45605517f108ef (antes 1dbcd55e81cd63e58e3fb613d9db0283); club_from_lead_capture b309b71b4b915646c0852e761ecd077b; club_profile_preferences cb5ef98002faeecc1bc63f07b02352df; crm_meta_audience_collect_leads fc5396207de6366607aa5a5971fd9ead.
(iii) Contagens antes (20:22 UTC) → depois (20:24 UTC): club_members 10762→10764, email_consents 12597→12599, whatsapp_consents 1488→1488, marketing_consents 2103→2103, lead_capture 15967→15969, marketing_consent_events 39858→39869. As diferenças são inscrições reais em curso (4 capturas clube_newgang 20:20–20:24, todas processed=true, membro criado, sem birth_date, email-v3) — a ingestão continua a funcionar depois da alteração. lead_capture under13_blocked = 0.
(iv) Teste de comportamento NÃO feito em Live: inserir lead_capture dispara trg_coala_lead_confirm, emails VIP e net.http_post (notify_member). Provado em PGlite (src/test/issue314-fase1-versoes-idade.test.ts, 11/11) com as funções reais da 0266: under13 não cria membro/contacto/lead/consentimento/notificação; adulto grava birth_date e email-v4; data existente não é sobrescrita; sem data/data inválida = membro sem perfil; versão desconhecida não cria consentimento; appender grava versão recebida, recusa versão de outro canal. Sem resíduos (base descartável).

## Passo 2 — consent_text_versions
3 linhas inseridas (valid_from 2026-10-26 20:25:34.24751+00, valid_to NULL): email-v4/email, anuncios-v2/ads, whatsapp-v2/whatsapp, texto exato do pedido. 6 linhas MP; text_sha256 = sha256(text) conferido nas 6; md5 das 3 antigas iguais antes/depois (6f13ea0a…, c0e79502…, 3c5fbfba…). Inverso: `DELETE FROM public.consent_text_versions WHERE company_id='7c858982-6ccd-47ca-bd65-e0dd3eebf01c' AND version IN ('email-v4','anuncios-v2','whatsapp-v2');` (não aplicado).

## Passo 3 — verificação final
Membros Newgang por classe (perfil ou sem perfil): adult 1444, minor 744, unknown 8576 (under13 0).
Coletor newgang_clube:v2 (réplica do filtro, sem correr sync): 13+ = 688; 18+ = 429.
capi_dispatch_control md5 5e1f2203356f4b00250faefc8bb47cc2 igual antes/depois; cron.job md5 b8af884d2830cb151e6c98829b6853d1 igual (80 jobs).
Testes: vitest completo antes de aplicar 2584 passed / 6 skipped / 11 todo (278 ficheiros); tsgo exit 0. Após regenerar o rascunho B: 5 ficheiros relacionados 48/48.

## Passo 4 — rascunho B da #359 (só ficheiros, NÃO aplicado)
`supabase/manual/draft_359_migracao_B.sql` regenerado: ingestão = corpo 0266 + as mesmas duas alterações da B (consent_whatsapp_source e data do WhatsApp no INSERT de contacts); md5 de referência da ingestão 905ff064…; guarda inalterada (ac7469e0…). `rollback_359.sql` repõe agora o corpo 0266. `src/test/issue359-consent-drafts-sql.test.ts` usa a 0266 como base (5/5).

## Fase 2 (só leitura)
- `supabase/functions/newgang-portal/person-consent.ts` linhas 3–5 têm versões/textos fixos (email-v3, anuncios-v1, whatsapp-v1) → alterar na Fase 2.
- `me.age_class`: `profile.ts` devolve o objeto de `club_profile_state`, que já traz age_class; verificar só se o tipo/serialização em TS filtra campos.
- `portal-track`: sem versões Newgang escritas à mão.
