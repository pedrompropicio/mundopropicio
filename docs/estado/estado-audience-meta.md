# ESTADO — MP Audience · Meta

Atualizado: 2026-08-29 (herdado de sessões anteriores — confirmar) · Issues: `a-seguir` #36, #76

## Em que pé está
Sync Meta a funcionar com token revalidado. O **P0 do diagnóstico está em produção**: `crm.campaign_diagnosis_360` em Live, edge function `crm-campaign-diagnosis` deployada, UI do CampaignView com "Diagnóstico & Decisão". A postura `fraca` dispara redesign ativo; as outras três aparecem como "Em breve" na UI, mas as edge functions **já estão deployadas** — só faltam os botões.

## A trabalhar agora
Nada em execução.

## Próximo passo concreto
Ligar na UI as 3 posturas restantes (escalar / cirúrgica / novo desenho).

## Bloqueios
- **#36 (P1)** — erros de sync só se escrevem em `meta_sync_state` e nunca propagam para `ad_platform_connections`.
- **#76 (P1)** — ligações Meta expiradas continuam marcadas `active` (Fortal e Siriguella).
- **Elo 4 partido** — o pixel da Ticketline não propaga `fbc` para o evento Purchase. Elos 1–3 provados. Reunião com Luísa Rodrigues agendada.

## Factos que não se reinvestigam
- Ad account `act_5094207367314169` (EUR).
- **`ticket_sales` é agregada** — atribuição venda→clique impossível; o caminho é **lead→conversão**.
- Fronteira bom/fraco = **60% do ROAS-alvo** (~4,8x num alvo de 8x). "Morta" só quando `projected_baseline_roas ≈ 0`.
- Design P0: **o LLM só escreve linguagem**; o determinístico decide diagnóstico, projeção, classificação e feasibility. Re-runs dão resultado idêntico.
- A edge function de redesign é **estocástica** (Gemini) — uma corrida não generaliza.
- Meta Graph API **não expõe URLs MP4** source para ad assets (política, não permissão).
- Customer Match "Compradores Geral Ticketline Jun2026" (5.933 membros) carregada; **Fase 2 pendente**.

## Onde ler mais
- `.lovable/memory/features/audience-unified-paid-dashboard.md`, `elo-publicacao-fase3-ativacao.md`
- `docs/features/crm-meta-publish-flow.md`
