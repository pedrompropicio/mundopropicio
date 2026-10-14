# Coala — Convite Early Bird 2027 aos compradores 2026 + alerta de abertura a 3/11

## Levantamento (o que existe hoje)

- `fever_buyers` (coala-2026): 10.409 linhas, 9.762 emails únicos, 1 empresa (Coala). Tem `language` (Pt, En, Es, Fr, It, De) e `marketing_pref`. Não tem país.
- `coala_send_early_bird_batch(p_limit, p_dry_run=true)`: lê **só `lead_capture`** (consent_email = true). Exclui `suppressed_emails` e quem já tem `email_send_log.message_id = 'coala-eb:<email>'`. Exige `early_bird.fever_url` quando não é dry run. Põe o email na fila `transactional_emails` com purpose `marketing`, label `coala_early_bird` e cancelamento por `coala_unsub_token`. Não serve como convite: a lista de destinatários é outra e exige fever_url.
- `tg_coala_lead_confirm` (trigger em `lead_capture`): envia o email "inscrição confirmada" quando entra um lead Coala com `consent_email = true`, se não estiver suprimido e for a primeira inscrição. **Um INSERT do confirmar_lista dispará-lo-ia** — é preciso desligá-lo para a nova origem.
- `coala_unsub_token(email)`: token aleatório de 32 bytes guardado em `email_unsubscribe_tokens` (um por email e empresa). Pode ser chamado sem sessão iniciada (D-ERP, ver DECISIONS l.909).
- `consent_log`: **não serve para isto**. É o registo dos cookies (decision, locale, path, device, marketing_granted). Não tem email, versão do texto nem método.
- `lead_capture`: não tem uma coluna "na lista". Hoje, estar na lista = ter uma linha Coala com email. Passa também pelo `process_lead_captures_batch` (contacts + CAPI Lead).
- `suppressed_emails` Coala: 0 linhas. Tokens de cancelamento já usados: 0.

## Contagem em dry run (feita hoje, só leitura)

```text
Emails únicos coala-2026        9.762
Excluídos - suprimidos              0
Excluídos - descadastrados          0
Excluídos - já na lista Coala     622  (qualquer linha Coala em lead_capture com o mesmo email)
A convidar                      9.140
  PT (language = Pt)            8.073
  EN (todos os outros + vazio)  1.067
```

Regra proposta para o idioma: `Pt` → PT; tudo o resto (En, Es, Fr, It, De, vazio) → EN.

## Plano

1. **Migração A — estrutura**
   - `coala_invites`: email (único por empresa+campanha), token (32 bytes aleatórios, único), locale, campanha `eb2027_invite`, estado (`pending|queued|confirmed`), `queued_at`, `confirmed_at`, `message_id`. A tabela garante o envio único: nenhum email é convidado duas vezes.
   - `coala_list_consents` (registo de consentimento por email, porque o `consent_log` é de cookies): email, empresa, `list_joined`, `marketing_opt_in`, `text_version`, `method = 'token_email'`, locale e data. Só se acrescenta: cada alteração gera uma linha nova.
   - `coala_send_runs`: uma linha por onda (função, dry_run, contagens, data).
   - RLS de empresa Coala, só para leitura por admin/manager; escrita só pelas funções.
2. **Migração B — confirmar_lista(token, marketing_opt_in, locale)** — pública (SECURITY DEFINER, anon):
   - token desconhecido → `invalid`; token já confirmado → devolve `already` e atualiza o marketing só se mudou (com linha nova no registo).
   - na primeira vez: insere em `lead_capture` com `source = 'coala_early_bird_invite'` e `consent_email = marketing_opt_in`, e grava `raw.list_member = true`, a locale e o id do convite.
   - grava a linha de consentimento e marca o convite como `confirmed`.
   - ajusta o `tg_coala_lead_confirm` para ignorar `source = 'coala_early_bird_invite'`. Assim, nenhum email sai deste caminho.
3. **Migração C — coala_send_eb_invite_batch(p_daily_cap, p_dry_run = true)**
   - destinatários: emails únicos de `fever_buyers` coala-2026, sem suprimidos, sem descadastrados, sem quem já está na lista e sem quem já tem convite;
   - cria o token, monta `confirm_url = https://coalafestival.pt/{pt|en}/confirmar?t=<token>`, exige o confirm_url e não exige o fever_url;
   - teto diário: só envia até ao limite `p_daily_cap`, descontando o que já saiu hoje;
   - message_id `coala-eb-inv:<email>`; quem já foi enviado é recusado na segunda execução;
   - o dry run devolve as contagens por motivo e por idioma, e uma amostra; não cria tokens nem envia nada.
   - opcional: `p_only_emails text[]`, para testar só nos endereços internos que indicares.
4. **Migração D — coala_send_eb_open_alert(p_daily_cap, p_dry_run = true)**: para todos os que estão na lista (`raw.list_member` ou fonte Early Bird), independentemente do marketing; exige `early_bird.fever_url`; PT/EN; message_id `coala-eb-open:<email>` para envio único; sem suprimidos.
5. **Regra de marketing**: o `coala_send_early_bird_batch` e qualquer envio de marketing da Coala filtram pelo último `marketing_opt_in` em `coala_list_consents`, ou pelo `consent_email` do lead para quem não tem registo. Fica escrito em DECISIONS (novo D-ERP) e em `.lovable/memory/features/coala-eb-invite.md`.
6. **Portal Coala (outro projeto)**: página `/{pt|en}/confirmar?t=` que chama `rpc('confirmar_lista')`, com a caixa de marketing desmarcada por defeito. Entrego o prompt para colares no chat desse projeto.
7. **Testes**: só dry run, ou `p_only_emails` com os endereços internos que indicares. Nenhum envio real.

## Questões para o Pedro

1. Idioma: Pt → PT e todos os outros → EN? (recomendado)
2. "Já na lista" = qualquer linha Coala em `lead_capture` (622, recomendado) ou só as fontes do Early Bird (`coala_hero_email`, `coala_early_bird`)?
3. Quantos convites por dia no teto? Proponho 2.000/dia (cerca de 5 dias).
4. Versão do texto de consentimento: qual é o identificador (ex.: `eb2027-v1`) e o texto PT/EN?
5. O lead do convite deve entrar no CAPI da Meta como Lead? Hoje entraria, pelo `process_lead_captures_batch`. Proponho excluir a fonte `coala_early_bird_invite`.
6. Que endereços internos uso para o teste real?
