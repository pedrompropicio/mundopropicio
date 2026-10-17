# #332 whatsapp — Fase A (preparação, sem aplicação)

Pedro autorizou Fase A em 17/10/2026 11:37 UTC. Reserva «#332 whatsapp» registada no QUADRO. Nada aplicado em Live: sem migração, sem deploy, sem envios.

## O que muda
- Nova tabela append-only `club_member_whatsapp_consents` (mesma disciplina da família #332: idempotency_key estável, decided_at, origin, UNIQUE(member_id,site_id,idempotency_key), guarda `_club332_history_guard`, sem UPDATE/DELETE/TRUNCATE).
- Canal `whatsapp`, versão `whatsapp-v1`, origem `club_session`. Texto aprovado (a validar pelo advogado antes de qualquer Publish): «Aceito receber novidades da Mundo Propício no WhatsApp. Posso retirar a qualquer momento.»
- `phone_fp` = sha256 hex do telefone no momento da decisão (padrão sha256 já usado em contacts); nunca número em claro no livro nem em logs.
- Grant exige telefone válido (`^\+[1-9][0-9]{7,14}$`, regra da 0179) no perfil; sem número → erro de contrato `whatsapp_no_phone` (HTTP 400). Revoke nunca exige número.
- Mudança de número invalida o grant: `_club332_state` devolve `valid_for_current_number=false` até nova autorização (compara phone_fp com sha256 do telefone atual).
- Guarda parental <13 (`parental_flow_required`) já cobre todos os grants — reutilizada, não duplicada.
- CAS em grant via `expected_dates.whatsapp`; retry com mesmo UUID não duplica; grant antigo nunca reabre revogação.
- `club_profile_preferences` aceita `channel:"whatsapp"` (sem `platforms`); desmarcar WhatsApp não altera email nem anúncios, e vice-versa.
- Edge `newgang-portal`: `person-consent.ts` ganha `CONSENT_TEXTS.whatsapp` e mapeia `whatsapp_no_phone` → 400. `me`/`club_consent_state` passam a incluir o objeto `whatsapp` automaticamente.

## Contrato do estado (me / club_consent_state)
```json
"whatsapp": {"state":"unknown|granted|revoked","version":"whatsapp-v1|null","date":"timestamptz|null","number_masked":"+351•••••678|null","valid_for_current_number":true|false}
```
Erros: `whatsapp_no_phone` (400), `consent_payload` (400), `parental_flow_required`/`consent_revision_conflict`/`idempotency_conflict` (409), `no_session` (401), resto 503 `consent_unavailable`.

## Ficheiros
- `supabase/manual/20261017_issue332_whatsapp.PENDENTE.sql` (migração preparada; será 0185 via canal canónico na Fase B)
- `supabase/functions/newgang-portal/person-consent.ts` (texto + mapeamento de erro)
- `scripts/newgang-whatsapp/`: run.sh, scenario.sql, concurrency.sh, run-handler.sh, handler_test.ts

## Testes (PostgreSQL 17.9 descartável, socket Unix, sem rede)
- SQL whatsapp: 22/22 (grant sem número, grant com número, máscara, fingerprint não-plaintext, retry, conflito de idempotência, mudança de número invalida, regrant revalida, revoke sem número, grant antigo não reabre, CAS, payload inválido, independência de canais, parental <13, append-only, concorrência real 8 ligações → 1 linha).
- Regressão #332: 40/40. Regressão #330: 54/54.
- Handler real whatsapp: 4/4. Regressão handler #332: 17/17. Vitest: 1281 passed / 1 skipped / 11 todo.

## Riscos / decisões
- `phone_fp` sem salt (sha256 simples, padrão contacts); número é enumerável por força bruta — aceite por coerência com o padrão do projeto; se se quiser salt, decidir antes da Fase B.
- `number_masked` mostra os 4 primeiros e 3 últimos dígitos do número ATUAL do perfil (não do consentimento).
- Descadastro/«PARAR» por WhatsApp: modelo preparado (origin extensível), sem envios nem webhooks — documentado, não implementado.
- Sem backfill: ninguém tem consentimento WhatsApp histórico; todos começam `unknown`.

## Fase B (só com «Sim» do Pedro)
Aplicar migração canónica (0185), deploy só `newgang-portal`, prova Live com membro de teste @mundopropicio.com (conceder, retirar, mudar número, verificar invalidação e independência de email/anúncios, club_points inalterado), limpeza com SQL curto + «Corro?», fecho documental e libertação da reserva.
