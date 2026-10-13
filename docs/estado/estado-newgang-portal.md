# ESTADO — newgang-portal (portal newgangfestival.pt)

Atualizado: 2026-10-13 · Decisões: D-ERP256, D-ERP257, D-ERP262

## Em que pé está
- Site no ar em https://newgangfestival.pt (projeto Lovable `1a915f50-55ca-4bb6-9abe-8f241c54647a`), com a demo `/teste` para os sócios.
- ERP F1+F2 publicado (D-ERP257): API `newgang-portal`, ecrã `/crm/sites/newgang`, Clube Newgang, email automático de confirmação.
- Tracking testado ponta a ponta a 13/10: Meta Lead + CompleteRegistration com eventID; TikTok; GA4 `ng27_clube_inscricao` via GTM-KBWT46HF v2; conversão Google Ads 7838816133 "NG27 - Inscrição Clube".
- Números (query de 13/10, 06:00 UTC): 1 site (`newgangfestival.pt`, ativo, GTM-KBWT46HF) ligado a "Newgang Festival 2027"; 5 edições na história; 2 membros do Clube (0 confirmados); 0 revelações (0 agendadas).

## A trabalhar agora
Nada.

## Próximo passo concreto
1. Preencher no CRM o link da Fever (`events.ticketing_url` está vazio), os textos (`portal_sites.content` está vazio) e a og:image (`og_image_url` está vazio).
2. Primeira revelação do line-up.
3. Remover `/teste` antes do lançamento.

## Bloqueios
- Fotos e aftermovies reais — Newgang Produções.
- Textos dos prémios e dos níveis — Pedro.
- Plano Resend antes de 03/11 — plataforma-e-infra.

## Factos que não se reinvestigam
- Sem contagens de atrações (nenhuma resposta da API traz totais).
- Cada revelação tem `club_at` (o Clube vê primeiro) e `public_at` (todos), com `public_at >= club_at`.
- A história é ordenada por ordem ascendente.
- Sem sorteio.
- O acesso ao Clube é por link pessoal (sem password).
- Os ids de pixel nunca ficam no código: vêm do CRM (`portal_sites` / `event_trackers`).
- Nas campanhas Google Newgang, a meta é só "NG27 - Inscrição Clube", para não contar a dobrar com o upload "offline (upload)".

## Onde ler mais
- `docs/specs/portal-newgangfestival.md`
- `docs/handoffs/2026-10-13-newgang-portal.md`
