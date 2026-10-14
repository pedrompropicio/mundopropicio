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
CORS: `https://newgangfestival.pt`, `https://www.newgangfestival.pt` + constante `PREVIEW_SUFFIXES` por preencher. Ações: `site` (inclui trackers do evento do site **sempre**, independente de `portal_visible`, bilhetes, e `club` — montra pública do Clube: `levels` [{name, min_points, benefit}] por min_points e `rules` [{rule_key, label, points}] ativas por points, lidas de `club_levels` e `club_point_rules`; só configuração, sem membros nem contagens), `lineup`, `history`, `ranking`, `request_access` (email real por `news.newgangfestival.pt`, resposta igual exista ou não), `session`, `me`, `guess`, `attendance_claim`, `confirm_buyer` (token `buyer_confirm` em `club_member_sessions`). Rate limit 20/10 min por IP+ação nas escritas. Nenhuma resposta tem totais (verificação `assertNoTotals` em todas).

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

## Desempenho e ação "bundle" (D-ERP270, 13/10/2026)
- Ação pública `bundle` → `{ site, lineup, history }` (lineup sempre público). O site pode trocar 3 pedidos por 1.
- Leituras públicas sem token numa só ida à base; `Server-Timing` em todas as respostas.
- Cron `newgang-portal-quente` (`*/4 * * * *`, 360/dia, Live via cron.schedule): `net.http_post` com `{action:"bundle"}` e Origin `https://newgangfestival.pt`.

## Regulamento do Clube (D-ERP271, 13/10/2026)
- Gerido no CRM (separador Clube → Regulamento), publicado por versões; v1 em rascunho.
- Ação pública `regulation` → `{ version, published_at, body_md }` (404 sem versão publicada). `site`/`bundle`: `club.terms = { version, published_at } | null`.
- O formulário do site envia `raw.terms_version` (inteiro) com a versão aceite; só versões publicadas ficam gravadas no membro (`terms_version`, `terms_accepted_at`).

## Missões de criativos — fase 1 (D-ERP272, 13/10/2026)
- CRM: Clube → Missões (lista, editor, criativos, ativar/encerrar) e Fila de moderação (filtros missão/estado/rede, "aprovadas automaticamente", aprovar/rejeitar em lote, finalista/vencedora nos desafios).
- API: `missions` → `{ missions: [{ id, kind, title, description, network, points, proof_type, mention, hashtag, caption_suggestion, assets:[{url,type,name}], ends_at, (desafio) finalist_points, winner_points, judging_until }] }`.
- `mission_upload_url` {token, content_type} → `{ path, upload_url, token, max_bytes }` (o site faz PUT da imagem e depois envia `proof_image_path`).
- `submit_mission` {token, mission_id, proof_url?, proof_image_path?} → `{ status: "aprovada" | "pendente" }` ou erro (`closed`, `duplicate`, `already_submitted`, `network`, `proof_link`, `proof_image`, `url`, `image`).
- `profile` {token, instagram_handle?, tiktok_handle?}; `me` traz `instagram_handle`, `tiktok_handle`, `submissions[]` (mission_id, mission_title, kind, status, reject_reason, points, submitted_at).
- Fase 2: deteção automática (Instagram Graph API, menções em stories) — por fazer.

## Extrato de pontos no "me" (13/10/2026)
"me" inclui `history`: movimentos de club_points do membro, mais recentes primeiro, máx. 100, cada um `{ at, points, label, detail }`. Labels pt-PT por regra (join_confirmed, friend_joined, friend_bought, promo_lot_purchase, guess_correct, attended_year, mission, mission_finalist, mission_winner); regras sem tradução usam club_point_rules.label; movimentos negativos = "Pontos anulados" (detail = motivo em ref_id). detail: amigo = primeiro nome + inicial do apelido (só amigos convidados pelo próprio, nunca email); missão = título; attended_year = ano. Com >100 movimentos, os mais antigos agregam-se numa linha "Movimentos anteriores" para a soma bater sempre com `points`. Código puro em supabase/functions/newgang-portal/history.ts.

## Anulações de pontos (D-ERP273)
Reversões nunca apagam: linha negativa rule_key 'void', ref '<regra>:<ref>', reason. Reaprovação = nova geração '<ref>#N'. history: "Pontos anulados" com detail = reason; submissions[].points soma gerações e anulações da submissão. CRM: "Pontos" no ranking e "Anular pontos" na fila (RPC club_points_void, motivo obrigatório).

## Crews (D-ERP274)
Ações com token (membro confirmado): `crew_create {name}` → {id,name,code,invite_link}; `crew_join {code}` (erros 404 crew_not_found, 409 crew_full/already_in_crew); `crew_leave {new_owner_short?}` (dono com membros → 409 owner_transfer; new_owner_short = índice em me.crew.members). `me.crew` = {name, code, invite_link, members:[{short_name, confirmed, is_owner}], min, max, completed} ou null. Link de convite `https://newgangfestival.pt/clube?crew=<code>` → o portal envia `raw.crew_code` na inscrição; entra na crew ao confirmar. history: "Crew completa" (detail = nome). CRM: Clube → Crews (lista, ficha, pesquisa, pontos e limites).

## Google Wallet (D-ERP275)
Ação `wallet_google {token}` → `{ save_url }` (401 no_session; 503 wallet_unavailable se a Google falhar). O portal abre o save_url (botão "Adicionar à Google Wallet"). Classe `<issuer>.newgang_clube_2027`, objeto `<issuer>.ngclub_<member sem hífenes>`; pontos e nível atualizam sozinhos até 10 min depois (cron newgang-wallet-sync). Links da classe: /meu-clube e /clube/regulamento (confirmar caminho do regulamento no portal). Módulo puro: supabase/functions/newgang-portal/wallet-google.ts. Ações internas (service role): wallet_sync, wallet_test_url. Issuer ID: 3388000000023216419 (secret GOOGLE_WALLET_ISSUER_ID; o GET /issuer não o devolve para a conta de serviço).

### Criativos por nível (adenda D-ERP275)
- Receber do Pedro `hero-gang.png`, `hero-elite.png`, `hero-lenda.png` (1032×336) e `logo-quadrado.png` (660×660); upload sem transformação para Storage público em `newgang/wallet/`, nomes `hero-gang-v1.png`, `hero-elite-v1.png`, `hero-lenda-v1.png`, `logo-quadrado-v1.png`.
- Constantes `WALLET_ARTWORK_URLS` provisórias (`https://example.invalid/newgang/wallet/...`); `WALLET_ARTWORK_READY=false` preserva o cartão atual até receber os ficheiros. Nunca enviar estes URLs à Google.
- Classe existente: `patchClassLogo` envia só programLogo por PATCH (não cria classe). O logo é circular na Wallet.
- Objeto: heroImage e hexBackgroundColor pelo nível atual — Gang #0b1f14, Elite #170a2b, Lenda #050505. Nível desconhecido usa criativo Gang, sem alterar o nível apresentado. Campos atuais mantidos.
- `last_level` já existe; `club_wallet_due` seleciona alterações de pontos OU nível; sincronização grava o nível apenas após PATCH bem-sucedido. Sem migração. O mesmo `buildObject` é usado pelo cron e pela geração de save_url.
- Após anexos: upload, URLs definitivos + flag ativa, deploy, PATCH da classe e `wallet_test_url` para membro nº 3. Ler classe/objeto na Google e validar o cartão com conta de teste (emissor em demo); o link anterior aponta ao mesmo objeto, podendo ser regenerado. Não confirmar visual novo antes desta prova.
