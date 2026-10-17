# #332 — ação request_access + consentimento signup/backfill

## Sincronização (regra #329)
HEAD GitHub e Lovable iguais no arranque: `70d1f4a82b7ba5fd10dc6421030a8412ad7bc798`.
Reserva #332 registada em docs/QUADRO.md; #323 preservada. Autorizado por Pedro, 17/10/2026 10:19 UTC.

## Leitura prévia
`docs/testes/issue332/consentimento-pessoa.md`, `drizzle/migrations/0182_issue332_member_consent.sql`,
`supabase/functions/newgang-portal/{index,pending,person-consent}.ts`, triggers
`trg_club_from_lead_capture` (0120/0129) e `_club332_history_guard` (0182).

## Parte A — request_access
Alterações mínimas em `supabase/functions/newgang-portal/index.ts`:
- Lookup com `trim().toLowerCase()` via `requestAccessAction` (nova `request-access.ts`), que injeta
  o lookup exacto e o envio (sem acoplamento à base/HTTP).
- Membro: cria sessão + envia `newgang_club_access` + responde `200 {ok:true,status:"sent"}`.
- Não-membro: NÃO envia e NÃO cria sessão; responde `200 {ok:true,status:"not_member"}`.
- Limite mantido (`portal_rate_hit` 20/600s → 429); novo log com motivo
  `limitado` no 429 (apenas prefixo de hash do IP). Logs normais com `sent`/`not_member`,
  sem email em claro.

Testes Deno (`request-access_test.ts`, 5/5 passam):
1. Membro → sent + envio chamado uma vez.
2. Não-membro → not_member + envio NÃO chamado.
3. `  PEDRO@Example.COM ` → normalizado para `pedro@example.com` → sent.
4. Sem email → 400 `{error:"email"}`.
5. Falha no envio não revela a existência ao chamador.

Smoke Live após deploy (`55cee83d59b6b9011c4aa0fd11c8a7c0ecceec93a4ea276a202a57aae6a5c86f`):
- `request_access` com email inexistente → `200 {"ok":true,"status":"not_member"}`.
- `request_access` sem email → `400 {"error":"email"}`.
- Membro real não testado em Live para não enviar email a terceiros.

## Parte B — consentimento por pessoa
Migração aplicada: `drizzle/migrations/0183_issue332_consent_signup_backfill.sql`.

### B.1 CHECKs alargados
- `version IN ('email-v3','clube-newgang-v2','legacy-sem-versao')`.
- `origin  IN ('club_session','email_unsubscribe','signup','legacy_migration')`.
- Append-only (`_club332_history_guard`) intacto.

### B.2 Trigger de inscrição
`_club332_consent_from_lead_capture` + `trg_club_zzz_consent_from_lead_capture`
(AFTER UPDATE OF processed; `WHEN NEW.processed=true AND OLD.processed IS DISTINCT`).
- Dispara APÓS `trg_club_from_lead_capture` (ordem alfabética confirmada).
- Só grava para `source='clube_newgang'`, `consent_email=true` e `raw.consent_text_version='email-v3'`.
- Respeita `suppressed_emails`.
- `idempotency_key` estável: `md5('lc332:'||lc.id)` formatado como UUID → reenvio não duplica
  (constraint `UNIQUE(member_id,site_id,idempotency_key)` + `EXCEPTION WHEN unique_violation THEN NULL`).
- Falhas isoladas (`WARNING`) para nunca bloquear a inscrição.

### B.3 Backfill
Captura mais recente por email dentro da MP + `source='clube_newgang'`; só se `consent_email=true`,
não suprimido e sem linha prévia. Versão derivada de `raw.consent_text_version`
(`email-v3`/`clube-newgang-v2`; demais → `legacy-sem-versao`). Origin: `signup` para email-v3,
`legacy_migration` para o resto. `decided_at = lead_capture.created_at`.

### Contagens
Antes: 1 linha (c43ea5ae via club_session). Esperado: 47 linhas (37/9/1).
Depois:
- total 47; distinct_members 47; duplicates 0.
- version: `legacy-sem-versao` 37, `clube-newgang-v2` 9, `email-v3` 1.
- origin: `legacy_migration` 46, `club_session` 1 (preservada), `signup` 0 (c43ea5ae já tinha linha e foi ignorado).

### Preservação
`club_points` NÃO foi tocado (migração não escreve nesta tabela e última inserção real foi 09:14 UTC,
antes da reserva às 10:19 UTC). Snapshot atual: 45 linhas / 4225 pontos / hash
`38ea85c65b9c9b493ca6046e16811bcb` — difere do baseline 31/3075/b138… por actividade do Clube
entre 15–17/10, não pela presente migração.

`P_NG27_LISTA`, botão «Reativar» do CRM, consentimentos de anúncios, crons e envios: NÃO tocados.
Nenhum email enviado por esta tarefa.

## O que o portal (projecto separado) precisa de mudar
`me.consents.email` já devolve `{state:'granted', version:'<legacy|email-v3>', date:<decided_at>}`
para qualquer das três versões (o `_club332_state` entrega a versão sem conversão).

O portal deve:
1. Mostrar a caixa de email MARCADA sempre que `email.state === 'granted'`, independentemente da
   versão.
2. Mostrar a versão aceite por extenso (ex.: «Aceitaste email-v3 em 17/10/2026», «Aceitaste a versão
   anterior clube-newgang-v2 em …», «Aceitaste a versão anterior do Clube em …» para
   `legacy-sem-versao`).
3. Ao desmarcar, continuar a chamar `profile_preferences` com `channel:'email'`,
   `version:'email-v3'`, `granted:false` + `expected_dates` igual ao `me.consents.email.date` actual.

Pedro faz o Publish do portal.
