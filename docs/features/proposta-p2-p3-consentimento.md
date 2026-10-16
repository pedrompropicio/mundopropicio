# PROPOSTA NÃO APROVADA PARA IMPLEMENTAR — P2/P3 consentimento marketing por interação

Data: 2026-10-16 · Estado: só leitura/proposta. Nada aplicado. Decisões de produto ficam com o Pedro.

## Lido (ERP)
- supabase/functions/portal-track/index.ts — grava redirect_log/lead_capture; `consent=true` só controla IP/geo; aceita fbc/fbp/client_event_id do cliente.
- supabase/functions/_shared/capi-guard.ts, process-lead-capture, process-redirect-log, process-leads-capi (#320).
- Live: `capi_consent_proof(lead, event)` devolve sempre false (fail-closed). `consent_log` = registo do banner (decision, marketing_granted, functional_granted, path, locale, device) SEM identificador de visitante nem ligação a lead/clique. `lead_capture.consent_email/consent_whatsapp` = newsletter/WhatsApp, não Meta. `redirect_log` tem mp_click_id/fbc/fbp. `coala_list_consents.marketing_opt_in` = lista Coala.
- supabase/functions/song-link-event envia Meta — fora deste âmbito, precisa de revisão própria.

## Lacunas (não li / não posso concluir)
- Código dos portais: MP (26b95793…), Coala, Newgang (1a915f50…) são projetos separados; não li banner, cookies `_fbc/_fbp/mp_click_id`, pixel browser nem revogação. Precisam de âmbito explícito por projeto.
- Não sei se o pixel browser dispara antes do consentimento nem se ViewContent é duplicado na saída para bilheteira.

## Modelo de prova (ERP, proposto)
Tabela nova `marketing_consent_events` (service_role only): id, company_id, portal (mp|coala|newgang), visitor_id (aleatório 1.ª parte, cookie funcional), state (granted|denied|revoked), purpose='meta_ads', policy_version, banner_version, decided_at (servidor), origin (domínio), path, source_event_id (do banner). Append-only; revogação = nova linha `revoked`.
- `lead_capture`/`redirect_log`: colunas novas nullable `visitor_id`, `consent_event_id`.
- `capi_consent_proof` passa a: último evento do visitor_id ≤ momento da interação, mesma empresa/portal, purpose meta_ads, state=granted, versão política vigente. Sem linha → false.
- Nunca retroativo: registos antigos ficam sem prova (bloqueados). Opt-in newsletter nunca conta.

## Gates
- Browser (cada portal): pixel e cookies `_fbp/_fbc/mp_click_id` só após granted; na recusa/revogação apagar apenas esses cookies controlados; enviar evento de consentimento ao portal-track.
- Servidor: portal-track descarta fbc/fbp se não houver prova granted; guarda de CAPI usa `capi_consent_proof` antes do POST (já existe).
- InitiateCheckout: só no clique de saída portal→bilheteira (redirect_log), com o mesmo client_event_id para dedupe browser/servidor; sem ViewContent extra nessa saída.

## Independência
Leads CRM, ingestão #321, Clube e emails transacionais não dependem do consentimento marketing (continuam como hoje).

## Alterações mínimas
- ERP: migração (tabela + 2 colunas + nova capi_consent_proof), portal-track aceita `kind=consent` e visitor_id, testes. Migração escrita só após aprovação.
- MP portal / Coala / Newgang: banner com versão, visitor_id, gate do pixel, limpeza de cookies, envio do evento de consentimento. Um âmbito por projeto.

## Testes (sem envios)
Mocks de fetch com egress bloqueado; fixtures revertidas: sem prova→false, granted→true, revogado depois→false, outro portal→false, newsletter→false, antigos→false; portal: pixel não carrega antes de granted.

## Sequência de autorização proposta
1. Pedro aprova modelo + âmbitos por portal. 2. ERP migração+testes. 3. Portais (um a um). 4. Teste Meta em Test Events com dataset de teste (autorização própria). 5. Validação pixel. 6. Retoma CAPI (abrir interruptor + crons) — autorização própria.
