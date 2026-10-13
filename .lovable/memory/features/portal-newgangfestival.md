---
name: Portal newgangfestival.pt
description: Portal Newgang em projeto separado lê a mesma base; line-up por revelações, história própria, Clube com pontos e acesso por link pessoal
type: feature
---
- Portal em projeto Lovable separado; só chama `newgang-portal` e `portal-track`. Configura-se em /crm/sites/newgang.
- Atração só é pública com revelação `agendada` e `public_at` passado; membro vê a partir de `club_at`. Sem revelação = nunca pública.
- Nenhuma resposta pública devolve totais ou contagens de atrações.
- Trackers do portal vêm do evento de `portal_sites.event_id`, sempre; `portal_visible` só controla a listagem no portal MP.
- Edições passadas em `festival_editions` (não criar eventos). 2023 sem data/line-up; o portal esconde campos vazios. Fotos WebP 1600 px, máx. 20, capa = cover_url ou 1.ª foto; vídeos só por link (youtube|instagram|vimeo), o 1.º é o aftermovie.
- Acesso de membro por link pessoal por email (30 dias), sem palavra-passe. Pontos só depois de confirmar; razão idempotente. Concurso por mérito, sem sorteio.
- Pontos: join_confirmed 100, friend_joined 150, friend_bought 300, promo_lot_purchase 500, guess_correct 50, attended_year 100. Níveis Fã 0, Gang 500, Lenda 1500.
- Spec: docs/specs/portal-newgangfestival.md · D-ERP257.
- Membro novo do formulário recebe automaticamente 1 email "Confirma a tua entrada no Clube Newgang" (link 30 dias); importação e confirmação 1 clique não recebem. Emails do Clube usam um só visual (cabeçalho v3, verde escuro, botão verde, rodapé Newgang Produções + descadastro).


## F2 (2026-10-13, decisões do Pedro)
- Inscrição clube_newgang NÃO recebe portal_vip_welcome; só newgang_club_welcome.
- Welcome sai logo após o processamento da inscrição (trigger → newgang-portal notify_member); cron 5 min = rede de segurança.
- Link de descadastro dos emails Newgang: https://newgangfestival.pt/descadastrar?token=… (site novo chama handle-email-unsubscribe).
- Fotos das edições: caminho `<company_id ativo>/festival-editions/<brand>/<ano>/<uuid>.webp` (1.º segmento = company_id, senão a policy recusa); falha nunca é muda (toast com a mensagem real).
