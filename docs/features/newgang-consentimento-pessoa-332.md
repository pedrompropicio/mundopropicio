# Newgang — consentimento por pessoa (#332)

## Estado
Infraestrutura 0182 aplicada e APIs `newgang-portal`/`handle-email-unsubscribe` deployadas. Sem Publish, envios, crons ou alterações aos portais. Nenhum consentimento histórico promovido nem crédito atribuído.

## Fontes e contrato
Anúncios continuam em `marketing_consent_events` da #322. `club_member_marketing_consents` guarda apenas referências imutáveis a esses eventos e à pessoa/site/finalidade. Um sujeito interno por pessoa/site/plataforma isola Meta, TikTok e Google sem alterar as funções de cookies da #322. Email tem histórico independente `club_member_email_consents`, versão `email-v3`.

Textos literais:
- email-v3: "Aceito receber por email as novidades do Newgang Festival e do Clube Newgang, da Mundo Propício. Posso retirar a autorização a qualquer momento."
- anuncios-v1: "Autorizo a Mundo Propício a usar o meu email para anúncios no Meta, TikTok e Google. Posso retirar a qualquer momento."

`profile_preferences` recebe `token` e `preferences_payload` com `channel=email|ads`, `version`, `granted` boolean, `idempotency_key` UUID e, para ads, `platforms` com `meta_ads|tiktok_ads|google_ads`. Identidade/empresa/site vêm exclusivamente da sessão confirmada, revalidada após site-lock→member-lock.

Para grants novos, `expected_dates` obrigatório: email usa `{email: <me.consents.email.date>}`; ads usa cada finalidade selecionada e a sua data em `me.consents.ads`. Valor inicial null. Comparação CAS sob lock impede grant atrasado após revoke. 409 `consent_revision_conflict`: reler `me`, pedir nova decisão explícita, não retry automático. Mesmo UUID num retry mantém uma única decisão; replay não reabre revogação posterior. Revoke não precisa de CAS e pode retirar apenas anúncios sem mudar email.

`me.consents` expõe só estado/versão/data; sem tokens, recibos, identificadores de sujeito ou email. Falhas opcionais retornam null/temporarily_unavailable e preservam pontos/Crew/referrals/history. Rejeição de sessão retorna 401, nunca fallback. Dados não entram em site/bundle/cache público.

## Idade, supressão e efeitos
Grants ficam fail-closed sem nascimento guardado ou abaixo de 13 (`parental_flow_required`), enquanto não existir fluxo parental verificável. Revogar continua permitido. Apagar perfil não permite contornar a guarda. Não há proibição genérica abaixo de 18, nem prova parental inventada. WhatsApp continua `whatsapp_adapter_pending` e não altera perfil/50 pontos.

Descadastro POST/one-click chama uma RPC atómica: lock do token, todos os sites antes dos membros, append revoke email + todas as finalidades, supressão e token usado. Falha reverte tudo; GET só valida. Token company-scoped atua nessa empresa; token legado global revoga os membros Newgang correspondentes ao mesmo email. Tokens já usados não reexecutam nem fazem backfill. Respostas visíveis preservadas e logs sem email/token.

Um novo opt-in não remove `suppressed_emails`: o botão Reactivar permanece intocado. Histórico de email é prova de decisão, não autorização para ignorar supressões de unsubscribe/bounce/complaint.

## Limites e próxima etapa
- `P_NG27_LISTA`, `meta_custom_audiences` e `crm_meta_audience_collect_leads` INALTERADOS. O coletor legado v2 ainda não lê o ledger por pessoa: não ativar/envios/cron dessa lista sem decisão e alteração separadas.
- Consentimento de pessoa não substitui o consentimento de cookies/dispositivo. Nenhuma ponte de cookies, pixel, portal-track, CAPI ou envio Meta/TikTok/Google foi criada. Sujeitos internos não devolvem preimagem/token.
- A política existente Newgang/2026-10-v1 é reutilizada para validade técnica; TTL/cobertura jurídica precisam de validação do Pedro antes de qualquer entrega.
- Portal separado ainda precisa de controlos independentes inicialmente desmarcados, textos literais, CAS, retirada e releitura de `me`; implementação/Publish requerem autorização própria.
- Sem E2E autenticado em Live: escrita e atomicidade verificadas em PostgreSQL descartável e handler real com fronteira simulada, não numa pessoa real.
- Reversão: primeiro remover os controlos do portal; manter históricos, API compatível e descadastro atómico. Nunca apagar evidências ou reativar campanhas/crons.

Provas: `docs/testes/issue332/consentimento-pessoa.md`.