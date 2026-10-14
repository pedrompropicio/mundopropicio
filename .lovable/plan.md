# Coala — Convite Early Bird 2027 aos compradores 2026 + alerta de abertura a 3/11

## Levantamento (o que existe hoje)

- `fever_buyers` (coala-2026): 10.409 linhas, 9.762 emails únicos, 1 empresa (Coala). Tem `language` (Pt, En, Es, Fr, It, De) e `marketing_pref`. Não tem país.
- `coala_send_early_bird_batch(p_limit, p_dry_run=true)`: lê só `lead_capture` (consent_email = true). Exclui os endereços em `suppressed_emails` e os que já têm `email_send_log` 'coala-eb:<email>'. Exige `early_bird.fever_url` fora do dry run. Envia pela fila `transactional_emails`, purpose `marketing`, com cancelamento por `coala_unsub_token`. Não serve como convite: a origem dos destinatários é outra e exige fever_url.
- `tg_coala_lead_confirm` (trigger em `lead_capture`): envia "inscrição confirmada" a um lead Coala com `consent_email = true`, se não estiver suprimido e for a primeira inscrição. Um INSERT feito pelo confirmar_lista dispará-lo-ia.
- `coala_unsub_token(email)`: token aleatório de 32 bytes em `email_unsubscribe_tokens`, um por email e empresa; executável por anon.
- `consent_log`: é o registo de cookies (decision, locale, path, device, marketing_granted). Não tem email, versão nem método, por isso não serve para isto.
- `lead_capture` passa pelo `process_lead_captures_batch` (contacts + leads + payload CAPI Lead). A partir de `leads` alimentam-se também as conversões Google.
- Suprimidos Coala: 0. Tokens de cancelamento usados: 0.

## Definição única de "na lista" — `coala_list_members` (vista)

```text
email (lower/trim) de:
  lead_capture  company_id = Coala, email não vazio (qualquer fonte)
UNION
  coala_invites status = 'confirmed'
menos: nada (os suprimidos ficam na lista; cada envio é que os exclui)
```

Usada pelas três funções: exclusão do convite, confirmar_lista (o token de quem já está na lista devolve `already`) e alerta de 3/11 (sem filtro de fonte: entram coala_hero_email, coala_early_bird, coala_early_bird_invite e as restantes).

Contagem atual (emails únicos, lead_capture Coala):

```text
Total na lista                 1.772
  sem fonte (null)             (restantes, form antigo)
  coala_hero_email             1.546
  coala_early_bird               321
  diag_test                        1
  notify_me                        1
Convites confirmados               0
```

Nota: os totais por fonte somam mais de 1.772 porque há emails em várias fontes. O `diag_test` é um registo de diagnóstico. Proponho excluir da vista `source = 'diag_test'`; confirma.

## Contagem em dry run do convite (só leitura, hoje)

```text
Emails únicos coala-2026        9.762
Excluídos - suprimidos              0
Excluídos - descadastrados          0
Excluídos - já na lista           622
A convidar                      9.140
  PT (language = Pt)            8.073
  EN (resto + vazio)            1.067
```

## Plano

1. **Migração A — estrutura**
   - `coala_invites`: email (único por empresa+campanha), `token` (32 bytes aleatórios, único), `confirm_url` guardado por convite, `locale`, `campaign = 'eb2027_invite'`, `status` (`queued|confirmed`), `queued_at`, `confirmed_at`, `message_id`. Garante que cada email recebe no máximo um convite.
   - `coala_list_consents` (só acrescenta): email, empresa, `list_joined`, `marketing_opt_in`, `text_version` (ex.: 'eb2027-v1'; o texto vive no portal), `method = 'token_email'`, `locale`, `created_at`.
   - `coala_send_runs`: uma linha por onda real (função, contagens, data). O dry run não grava.
   - vista `coala_list_members`, com a definição acima.
   - Acesso: RLS da empresa Coala, leitura para admin/manager; escrita só pelas funções SECURITY DEFINER.
2. **Migração B — confirmar_lista(p_token, p_marketing_opt_in, p_locale)** — pública (anon):
   - token inexistente → `invalid`;
   - email já na lista (`coala_list_members`) → `already`: grava uma linha de consentimento só se o marketing mudou e não mexe no `lead_capture`;
   - caso contrário: INSERT em `lead_capture` com `source = 'coala_early_bird_invite'`, `consent_email = p_marketing_opt_in` e `raw` = {locale, invite_id, text_version}; linha de consentimento; convite passa a `confirmed`;
   - idempotente: chamar duas vezes dá `already` à segunda;
   - `tg_coala_lead_confirm` passa a ignorar `source = 'coala_early_bird_invite'`, por isso não sai nenhum email.
3. **Migração C — sem conversões a partir do convite**: o `process_lead_captures_batch` continua a gravar o contacto em `contacts` para a fonte `coala_early_bird_invite`, mas não cria a linha em `leads` nem devolve payload. Assim não saem Lead CAPI Meta, conversões Google nem TikTok. Antes de alterar, confirmo que todos os envios de conversão partem de `leads` ou do payload; se houver outro caminho, também recebe o filtro da fonte.
4. **Migração D — coala_send_eb_invite_batch(p_daily_cap int, p_dry_run bool = true, p_only_emails text[] = null)**
   - destinatários: emails únicos de `fever_buyers` coala-2026, sem suprimidos, sem descadastrados (`email_unsubscribe_tokens.used_at`), sem quem está em `coala_list_members` e sem quem já tem convite;
   - idioma: `Pt` → PT; todos os outros (En, Es, Fr, It, De, vazio) → EN;
   - fora do dry run: cria o token e guarda o `confirm_url = https://coalafestival.pt/{pt|en}/confirmar?t=<token>` em `coala_invites` antes de pôr o email na fila; o `message_id` é `coala-eb-inv:<email>`; exige confirm_url, não exige fever_url;
   - `p_daily_cap` é obrigatório fora do dry run e desconta os convites já postos na fila no próprio dia;
   - **o dry run não cria tokens, não insere, não atualiza e não põe nada na fila**: só devolve as contagens por motivo e por idioma, e uma amostra;
   - `p_only_emails` restringe o envio aos endereços de teste que indicares.
5. **Migração E — coala_send_eb_open_alert(p_daily_cap, p_dry_run = true, p_only_emails = null)**: para todos em `coala_list_members`, independentemente do marketing; exclui suprimidos e descadastrados; exige `early_bird.fever_url`; PT/EN pela locale do lead ou do convite (por defeito PT); `message_id` `coala-eb-open:<email>`, para envio único; o dry run não grava nada.
6. **Regra de marketing**: a partir daqui, todo o envio de marketing da Coala (incluindo o `coala_send_early_bird_batch`) filtra pelo último `marketing_opt_in` em `coala_list_consents` ou, sem registo, pelo `consent_email` do lead. Fica registado em DECISIONS (novo D-ERP) e em `.lovable/memory/features/coala-eb-invite.md`.
7. **Portal Coala (outro projeto)**: página `/{pt|en}/confirmar?t=` que chama `rpc('confirmar_lista')`, com a caixa de marketing desmarcada e o texto 'eb2027-v1'. Entrego o prompt para colares no chat desse projeto.
8. **Testes**: só dry run, ou `p_only_emails` com os endereços que indicares depois. Nenhum envio real.

## Ponto por confirmar

- Excluir o `diag_test` (1 email) da vista `coala_list_members`? Recomendo que sim.
