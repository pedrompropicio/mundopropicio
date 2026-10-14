---
name: Portal newgangfestival.pt
description: Portal Newgang em projeto separado lê a mesma base; line-up por revelações, história própria, Clube com pontos e acesso por link pessoal
type: feature
---
- Portal em projeto Lovable separado; só chama `newgang-portal` e `portal-track`. Configura-se em /crm/sites/newgang.
- Atração só é pública com revelação `agendada` e `public_at` passado; membro vê a partir de `club_at`. Sem revelação = nunca pública.
- Nenhuma resposta pública devolve totais ou contagens de atrações.
- Ação `site` devolve `club` (montra pública do Clube): `levels` de `club_levels` por min_points e `rules` ativas de `club_point_rules` por points — só configuração, sem membros nem contagens (assertNoTotals mantém-se).
- Trackers do portal vêm do evento de `portal_sites.event_id`, sempre; `portal_visible` só controla a listagem no portal MP.
- Edições passadas em `festival_editions` (não criar eventos). 2023 sem data/line-up; o portal esconde campos vazios. Fotos WebP 1600 px, máx. 20, capa = cover_url ou 1.ª foto; vídeos só por link (youtube|instagram|vimeo), o 1.º é o aftermovie.
- Acesso de membro por link pessoal por email (30 dias), sem palavra-passe. Pontos só depois de confirmar; razão idempotente. Concurso por mérito, sem sorteio.
- Pontos: join_confirmed 100, friend_joined 150, friend_bought 300, promo_lot_purchase 500, guess_correct 50, attended_year 100. Níveis Gang 0, Elite 500, Lenda 1500.
- Spec: docs/specs/portal-newgangfestival.md · D-ERP257.
- Membro novo do formulário recebe automaticamente 1 email "Confirma a tua entrada no Clube Newgang" (link 30 dias); importação e confirmação 1 clique não recebem. Emails do Clube usam um só visual (cabeçalho v3, verde escuro, botão verde, rodapé Newgang Produções + descadastro).


## F2 (2026-10-13, decisões do Pedro)
- Inscrição clube_newgang NÃO recebe portal_vip_welcome; só newgang_club_welcome.
- Welcome sai logo após o processamento da inscrição (trigger → newgang-portal notify_member); cron 5 min = rede de segurança.
- Link de descadastro dos emails Newgang: https://newgangfestival.pt/descadastrar?token=… (site novo chama handle-email-unsubscribe).
- Fotos das edições: caminho `<company_id ativo>/festival-editions/<brand>/<ano>/<uuid>.webp` (1.º segmento = company_id, senão a policy recusa); falha nunca é muda (toast com a mensagem real).
- notify_pending: service role decidida só por isServiceRoleRequest (nunca claim do payload); notify_member (trigger) fica sem segredo por desenho.

## Fecho de 13/10/2026 — decisões do Pedro
- Alterações no CRM do site podem demorar até 60 s a aparecer no portal (custo aceite); as revelações não esperam, com expiração em public_at.
- Merch oficial é produto à venda, não prémio; membros têm acesso antecipado.
- Early entry dos Lenda suspenso até validação com a MEO Arena.

- D-ERP270: ação pública `bundle` = {site, lineup público, history}; leituras públicas sem token numa só ida à base (embeds); Server-Timing; cron `newgang-portal-quente` */4.
- D-ERP271: regulamento em `club_terms` (rascunho|publicada, versões imutáveis, publicar via RPC `club_terms_publish`); ação pública `regulation` (404 sem publicada); `club.terms` só versão+data; aceitação em `club_members.terms_version/terms_accepted_at` só com versão publicada, inválida nunca bloqueia.
- D-ERP272: missões (`club_missions` + `club_mission_submissions`); pontos pelo motor `club_points` (rule_key mission / mission_finalist / mission_winner, ref = submissão) derivados do estado; desafio nunca automático; 1 submissão ativa por membro/missão; link não repete entre membros; provas em bucket privado `club-proofs`, criativos em `club-mission-assets`. Fase 2 (Graph API) por fazer.
- D-ERP273: club_points nunca se apaga; reversão = linha 'void' negativa (ref '<regra>:<ref>', reason); reaprovação = ref '<ref>#N'; anulação manual via club_points_void.
- D-ERP274: Crews — club_crews/club_crew_members; regra crew_complete (200, min 4 confirmados, máx 6); ref = crew; sair não retira pontos; link ?crew=<code> via raw.crew_code aplicado ao confirmar.
- D-ERP275: Google Wallet Loyalty — classe <issuer>.newgang_clube_2027, objeto <issuer>.ngclub_<member>; QR NG-<member_no>; club_wallet_passes; cron newgang-wallet-sync */10 patcha só diferenças.
