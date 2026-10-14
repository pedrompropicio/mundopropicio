---
name: Coala convite Early Bird 2027
description: Convite token aos compradores 2026, lista coala_list_members, consentimento de marketing separado, alerta de abertura 3/11; fonte coala_early_bird_invite sem emails nem conversões
type: feature
---

D-ERP276. Três estados por email (empresa Coala): convidado (`coala_invites`), na lista (`coala_list_members`), marketing (`coala_list_consents`, append-only, 'eb2027-v1', 'token_email').

- "Na lista" = vista `coala_list_members` (lead_capture Coala com email, exceto `diag_test`, ∪ convites confirmados). Usar SEMPRE esta vista; nunca filtrar por fonte.
- `confirmar_lista(token, marketing_opt_in, locale)` pública e idempotente; fonte `coala_early_bird_invite`.
- `estado_convite(token)` é a leitura pública da página /confirmar: devolve somente `{status}`, nunca email ou dados pessoais. Nulo/tamanho diferente de 64/inexistente na empresa Coala → `invalid`; status confirmed → `confirmed`; email na vista canónica → `on_list`; restante → `pending`. Todas as campanhas, incluindo testes. STABLE, SECURITY DEFINER, search_path public; EXECUTE anon/authenticated e PUBLIC revogado. Só leituras: nunca chamar confirmar_lista nem funções que escrevam.
- Essa fonte NUNCA gera email (`trg_coala_lead_confirm` WHEN) nem conversão (`process_lead_captures_batch` salta antes de `leads`).
- `coala_send_eb_invite_batch` / `coala_send_eb_open_alert`: dry run por defeito, sem escrita; `p_daily_cap` obrigatório no envio; `p_only_emails` para testes; só service_role.
- Idioma: fever `Pt` → PT, resto → EN.
- Qualquer marketing Coala filtra pelo último `marketing_opt_in` (fallback `consent_email`).
- Proibido envio real sem ordem do Pedro; testes só dry run ou endereços internos indicados por ele.
- Convite e alerta usam `Coala Festival <noreply@news.coalafestival.pt>` e `sender_domain=news.coalafestival.pt`; o process-email-queue encaminha este domínio diretamente para a conta Resend Coala, com `RESEND_API_KEY_COALA`, nunca Lovable Emails.
- Modelos PT e EN aprovados por Pedro em 14/10/2026: HTML integral fornecido, sem alterações. PT usa imagens em `https://coalafestival.pt/email/eb27/` e assunto «O Coala volta. E o Early Bird é só para quem está na lista.». EN usa `en/02-texto.png`, as outras três imagens PT, assunto «Coala is back. And Early Bird is for the list only.» e texto simples aprovado.
- `p_test_emails` é separado de `p_only_emails`: seleciona só os endereços indicados, independentemente da base/lista/convites; exclui apenas suprimidos. Usa idioma do comprador quando existir, senão `p_test_locale` (pt por defeito). Campanha `eb2027_invite_test`, token novo ao repetir, identificador `coala-eb-test:` com epoch; não consome teto diário nem altera contagens da base. Envio efetivo de teste regista `details.test = true`; dry run nunca escreve.
- Na assinatura de cinco parâmetros, os quatro primeiros são obrigatórios, incluindo `p_test_emails`; só `p_test_locale` mantém default `pt`. A assinatura antiga de três parâmetros mantém os defaults e delega na nova sem ambiguidade.
- `p_only_emails` aceita endereços internos `@mundopropicio.com` ausentes da base, com locale `pt` e motivo nulo, após calcular as contagens da base. Outros domínios ausentes da base são ignorados. Não inserir compradores fictícios em `fever_buyers`.
- Fila (14/10/2026): sem job fixo. Trigger `email_queue_wake_transactional` (AFTER INSERT em pgmq.q_transactional_emails) → `email_queue_wake()` cria `cron.schedule('process-email-queue','5 seconds','SELECT public.email_queue_dispatch()')` se não existir e faz POST imediato; `email_queue_dispatch()` apaga o cron quando as filas ficam vazias. Não criar cron à mão. `email_send_state`: batch_size 20, send_delay_ms 150 (aprovado Pedro); ≈265/min típico, ≤8/s pior caso.
- Protocolo de onda: fatias de 400 com `p_daily_cap` acumulado (400, 800, …) e só avançar com a fila da campanha a 0 (query de monitorização em claude-outputs/2026-10-14-2300-…); assim confirmações ficam <2 min e nada se aproxima da TTL de 60 min. Teste A/B: fatias de 250 (250, 500 às 12:45; 750, 1000 às 19:30).
- Ordem dos destinatários reais e da amostra: `md5(email)` (aleatória e estável), no convite e no alerta. Dry run devolve `primeiros` (PT/EN dos primeiros 250 e 1000).
- Perdidos: só DLQ sem nenhum `sent` (base ou `:r<n>`) e convite não confirmado. Contagens da base não mudam (continuam `ja_convidado`/`ja_enviado`); campo à parte `reenvio_pendente`. Envio real reenfileira com `coala-eb-inv:<email>:r<n>` (alerta `coala-eb-open:<email>:r<n>`), mesmo token e confirm_url, atualiza message_id/queued_at e conta para o teto diário. `failed` isolado é temporário.
