# Portal newgangfestival.pt — F1 (parte ERP)

Atualizado: 2026-10-13 · Decisão: D-ERP257 · Evento `407f43fc-790f-4ea7-8b2a-4162805dfb16` (Newgang Festival 2027, 25/03/2027, MEO Arena) · Empresa MP `7c858982-6ccd-47ca-bd65-e0dd3eebf01c`.

O portal é um projeto Lovable separado, ligado à mesma base com a chave anon. Não tem regras de negócio: chama a edge function `newgang-portal` (e `portal-track` para inscrições). Tudo se configura no MP CRM em `/crm/sites/newgang`.

## Feito (13/10/2026)

### Base (migrações 0119 e 0120, cópias em supabase/migrations/20261013020000_* e 20261013020500_*)
- **Segurança do line-up**: removida `event_lineups_authenticated_all` (true); leitura da empresa, escrita só admin/manager/platform_admin. `event_lineups_public` só devolve atrações com revelação `agendada` e `public_at <= now()`; atração sem revelação nunca é pública.
- `event_lineup_reveals` (label, club_at, public_at, clues, status rascunho|agendada; check public_at >= club_at).
- `event_lineups` + `reveal_id`, `category` (headliner|atracao|convidado), `video_url`, `listen_url`. `event_marketing.lineup_complete`.
- `festival_editions` com `videos jsonb [{url, provider youtube|instagram|vimeo, title}]` (o 1.º é o aftermovie principal; substitui o `aftermovie_url` do pedido inicial), `gallery_urls text[]` (máx. 20, check na base) e `cover_url` (capa explícita; se NULL o portal usa a 1.ª foto — a vista pública já devolve o coalesce). Vista `festival_editions_public` (visible).
- `portal_sites` + vista `portal_sites_public` (sem company_id).
- Clube: `club_members` (member_no sequencial por site com lock, referral_code 7 chars sem ambíguos, único email por site), `club_point_rules`, `club_points` (UNIQUE member_id+rule_key+ref_id), `club_levels`, `club_rewards`, `club_guesses` (1 por membro por revelação), `club_attendance_claims`, `club_member_sessions` (hash sha256, 30 dias), `portal_rate_limits`.
- RLS: padrão da casa (PERMISSIVE leitura + RESTRICTIVE company_isolation + escrita `portal_can_write()`); sessões e rate limit só service_role; nenhuma tabela do Clube tem anon.
- Funções (service_role): `club_upsert_member`, `club_confirm_member` (+join_confirmed; +friend_joined ao padrinho), `club_award`, `club_claim_attendance` (válido se o email está em `fever_buyers` com `edition_label = 'newgang-<ano>'`; a base 2026 tem 7.155 compradores), `portal_rate_hit`. Para o CRM (authenticated, admin/manager): `club_decide_guess`, `club_decide_attendance`, `club_ranking`.
- Criação do membro: trigger `trg_club_from_lead_capture` quando uma linha `clube_newgang` passa a `processed` (depois do `process_lead_captures_batch`, que não foi alterado); lê `raw.referral_code`. Membro nasce por confirmar; pontos só ao confirmar (clique no link pessoal). Erros no trigger só geram WARNING, nunca bloqueiam o processamento.

### API `newgang-portal` (verify_jwt=false)
CORS: `https://newgangfestival.pt`, `https://www.newgangfestival.pt` + constante `PREVIEW_SUFFIXES` por preencher. Ações: `site` (inclui trackers do evento do site **sempre**, independente de `portal_visible`, e bilhetes), `lineup`, `history`, `ranking`, `request_access` (email real por `news.newgangfestival.pt`, resposta igual exista ou não), `session`, `me`, `guess`, `attendance_claim`, `confirm_buyer` (token `buyer_confirm` em `club_member_sessions`). Rate limit 20/10 min por IP+ação nas escritas. Nenhuma resposta tem totais (verificação `assertNoTotals` em todas).

### Origens
`portal-track` (→ MP; `referral_code` e `ttclid` de topo ficam em `raw`), `geo-lookup`, `crm-google-click-ingest` aceitam os dois domínios. `event_trackers_public` não foi alterada.

### MP CRM `/crm/sites/newgang`
Geral · Line-up e revelações (LineupTab estendido + revelações + pré-visualização público/membro + "Line-up completo") · História (fotos → WebP 1600 px no browser, bucket `portal-marketing-images` no caminho `<company_id da empresa ativa>/festival-editions/<brand_key>/<ano>/<uuid>.webp` — o 1.º segmento tem de ser o company_id por causa da policy `portal_marketing_images_insert`; upload em sequência pela ordem recebida, máx. 20 com aviso, 1.ª foto = capa quando `cover_url` vazio; falha no upload ou na gravação → toast com a mensagem real e o contador não sobe; ordenação, capa; vídeos por link) · Clube (regras, níveis, prémios, ranking, palpites com sugestão automática, "Eu estive lá") · Bilhetes · Tracking.

**Textos do separador Geral (`portal_sites.content`)** — fonte: `API-CONTRACT.md` do projeto do site, secção "Textos (portal_sites.content)". 25 chaves, definidas em `src/lib/newgang-content.ts`, com o texto por omissão do site como placeholder:
- Início: hero_date, hero_venue, club_description, club_cta, club_neon_title, club_neon_subtitle, history_teaser_title, benefit_1_title, benefit_1_description, benefit_2_title, benefit_2_description, benefit_3_title, benefit_3_description.
- /clube: club_header, club_landing_description.
- /bilhetes: tickets_title, tickets_subtitle, tickets_club_title, tickets_club_description, tickets_general_title, tickets_general_description, tickets_zones_title, tickets_zones_description, tickets_official_description.
- /meu-clube: ranking_prizes (textarea, um prémio por linha; vazio ou "—" esconde o bloco).
Campo vazio = chave removida do `content` (nunca se grava texto vazio); o site volta ao texto por omissão. Se o contrato do site mudar, atualizar a lista.

### Testes
`src/test/newgang-portal.test.ts` (10).

## F2 (13/10/2026)
- **Origens**: preview `--1a915f50-55ca-4bb6-9abe-8f241c54647a.lovable.app` e `https://newgang-fest-portal.lovable.app` (→ empresa MP) em `newgang-portal`, `portal-track`, `crm-google-click-ingest` e `geo-lookup`. OPTIONS/POST: preview e Lovable 200/204; origem estranha 403 (também no OPTIONS do `newgang-portal`).
- **Email de confirmação automático**: sem DDL. Cron `newgang-club-welcome-5m` (*/5, 288/dia) chama `newgang-portal` com `{action:"notify_pending"}` e a chave de serviço (sem Origin). Membros `source='formulario'`, por confirmar, criados há ≤ 7 dias; idempotente por membro (`email_send_log.template_name='newgang_club_welcome'`, `metadata.member_id`, message_id `ng-welcome-<member>`). Emite sessão `access` 30 dias (só hash). `importacao` e `confirmacao_1_clique` nunca recebem. Atraso máx. ≈ 10 min (lead_capture 5 min + este cron 5 min).
- **Autorização das ações internas (13/10, CI)**: `notify_pending` só é aceite sem Origin e quando `isServiceRoleRequest(req)` (_shared/multiTenant.ts: chave igual à do ambiente ou claim service_role verificado no Auth) é verdadeiro; nunca se lê o claim do payload à mão (D-ERP229). Sem a chave: 403 `origin`. `notify_member` (trigger `club_from_lead_capture`) continua sem segredo, por desenho de 0129: só aceita `member_id` e só envia o welcome uma vez a membro por confirmar. As ações públicas não mudaram.
- **Visual** (`newgang-portal/email.ts`): cabeçalho clube-email-header-v3, fundo verde escuro, botão verde, rodapé logo Newgang Produções + descadastro (`mpgestaoeventos.com/unsubscribe?token=` + List-Unsubscribe one-click). Usado em `newgang_club_welcome` e `newgang_club_access`.
- **Line-up**: `next_reveal.id` = reveal_id para o palpite; `assertNoTotals` mantido.

## Por fazer
- DML de sementeira aplicado em Live a 13/10/2026 (`supabase/manual/20261013_newgang_portal_seed.sql`): 1 site, 5 edições, 6 regras, 3 níveis, 4 faixas de prémios, 2 membros por confirmar (backfill). Fluxo completo testado (inscrição → link → +100/+150 idempotente) e dados de teste apagados.
- Preencher o preview do projeto novo em `newgang-portal` e `portal-track`.
- Tokens `buyer_confirm` para o email aos compradores 2026 (envio fora de âmbito).
- Pontos `friend_bought` / `promo_lot_purchase` dependem de importações Fever (fora de âmbito).
- Publish do ERP (ecrãs).


## F2 respostas do Pedro (2026-10-13)
- portal_vip_welcome desligado para source clube_newgang (só newgang_club_welcome).
- Envio imediato: club_from_lead_capture faz net.http_post (assíncrono, em bloco EXCEPTION) a newgang-portal action notify_member; cron newgang-club-welcome-5m fica como rede de segurança. Idempotente por message_id ng-welcome-<membro>. Teste: processada 03:50:00 → sent 03:50:08 (8 s). Migração 0129.
- Descadastro dos emails Newgang: https://newgangfestival.pt/descadastrar?token=…; List-Unsubscribe um clique mantém handle-email-unsubscribe (CORS *).
