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
Geral · Line-up e revelações (LineupTab estendido + revelações + pré-visualização público/membro + "Line-up completo") · História (fotos → WebP 1600 px no browser, bucket `portal-marketing-images`, ordenação, capa; vídeos por link) · Clube (regras, níveis, prémios, ranking, palpites com sugestão automática, "Eu estive lá") · Bilhetes · Tracking.

### Testes
`src/test/newgang-portal.test.ts` (10).

## Por fazer
- DML de sementeira aplicado em Live a 13/10/2026 (`supabase/manual/20261013_newgang_portal_seed.sql`): 1 site, 5 edições, 6 regras, 3 níveis, 4 faixas de prémios, 2 membros por confirmar (backfill). Fluxo completo testado (inscrição → link → +100/+150 idempotente) e dados de teste apagados.
- Preencher o preview do projeto novo em `newgang-portal` e `portal-track`.
- Tokens `buyer_confirm` para o email aos compradores 2026 (envio fora de âmbito).
- Pontos `friend_bought` / `promo_lot_purchase` dependem de importações Fever (fora de âmbito).
- Publish do ERP (ecrãs).
