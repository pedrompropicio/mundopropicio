# Estado — coala-portal

> Ficheiro de estado do chat `coala-portal` (portal público coalafestival.pt). Reescrito por cima no fecho de cada demanda autorizada. Criado a 15/10/2026 a partir do arquivo `claude/coala-emails-resend-2026-08-18.md` (Projeto Claude, actualizado 22/09/2026) e de `claude/coala-eb27-convite-pronto-e-ab-horario-2026-10-14.md`; os números abaixo têm a data da sua origem e **devem ser reconsultados** antes de se usarem.

## A trabalhar agora

- (vazio — primeira tarefa do chat: confirmar o ID do projeto Lovable do portal por `list_projects` e registá-lo aqui)

## Onde estamos

- Projeto Lovable separado do ERP, sem base própria: lê a base Live `sfohvvlqccmmebvjgibx` pela chave anon. Empresa Coala `7d831e59-6e82-427b-95a0-64904aae5dd2`. Evento Coala Festival Portugal 2027 `49cb03de-331d-415c-97cc-b8b0695b015e` (29–30/05/2027, Hipódromo Manuel Possolo, Cascais). Coala 2026 `5a1da5fb-3115-4ae3-af50-15ce1f869a5c` está selado — não se mexe.
- Calendário 2027 (origem: arquivo 22/09): Early Bird lote único 03/11/2026 (no site, vinda da BD); vendas gerais 01/12/2026 — **interna, não divulgar, sem chave em `portal_settings`**.
- Definições do portal em `portal_settings` (categoria `early_bird`: `state`, `fever_url`, `price_label`, `open_date`); desde 21/09/2026 `companies.public_portal = true` na Coala, pelo que as definições têm efeito imediato no site. `early_bird.fever_url` e `price_label` por preencher no dia 03/11.
- Emails: domínio `notify.coalafestival.pt` verificado no Resend; `RESEND_API_KEY_COALA`; funções `tg_coala_lead_confirm` (confirmação PT/EN), `coala_send_early_bird_batch(p_limit, p_dry_run)` (dry run por defeito; recusa sem `fever_url`), unsubscribe one-click. Lista única `coala_list_members` com consentimento de marketing separado (feature `coala-eb-invite`). Convite Early Bird 2027 preparado (14/10, arquivo).
- Risco aberto (origem 22/09): plano Resend free, 100 emails/dia; `lead_capture` da Coala com 745 linhas a 22/09 — subida de plano a decidir antes de 03/11.
- Pendentes de então: revisão jurídica da política de privacidade; sentinela + alerta no `process-email-queue` para falhas `no_matching_sender`.

## Relação com outras frentes

- Filas CAPI, consentimento no ERP, atribuição → 9. Email (Resend, DNS, plano) → 2. Bilheteira Fever → 3. BP/fecho → `bp-coala-2027` / `fecho-coala-2026`.

## Issues

#53 payloads e triggers duplicados · #54 emails da Coala · #79 páginas estáticas do portal (estado a confirmar na lista de issues abertas).
