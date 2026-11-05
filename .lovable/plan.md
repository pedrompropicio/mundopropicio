# #405 — E-mail de reforço da pré-venda NG27 (R2, newgang-portal)

Lido: `docs/INDEX.md`, `supabase/functions/newgang-portal/` (`reminder.ts`, `reminder-consent.ts`, `reminder-email.ts`, `legal-footer.ts`, `index.ts` envio/lembrete), `process-email-queue/index.ts`. Em `.lovable/memory/features/` só existe `portal-newgangfestival.md` sobre Newgang; os ficheiros de lembrete/consentimento do índice de memória não estão nesse caminho (não lidos). SELECT em Live: bucket, fila, crons.

## 1) Tabelas (SQL só como ficheiro, regra D-ERP343)
Ficheiro `drizzle/migrations/NNNN_issue405_club_presale.sql` + cópia `supabase/manual/`, rollback comentado. Aplicação pelo 0, não por mim.
```sql
CREATE TABLE public.club_presale_codes (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
  code text NOT NULL CHECK (code IN ('NEWGANG27A','NEWGANG27B')),
  source text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.club_presale_exclusions (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email <> ''),
  reason text, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.club_presale_codes, public.club_presale_exclusions TO service_role;
REVOKE ALL ON public.club_presale_codes, public.club_presale_exclusions FROM anon, authenticated;
ALTER TABLE public.club_presale_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_presale_exclusions ENABLE ROW LEVEL SECURITY;
-- sem políticas: só service_role
-- ROLLBACK: DROP TABLE public.club_presale_exclusions; DROP TABLE public.club_presale_codes;
```
Nota: o CHECK de minúsculas faz o INSERT falhar se vier um e-mail mal normalizado — carregar com `lower(btrim(...))`.
Reserva: reutilizo a tabela de reservas do lembrete (`club_reminder_reservations`) com `message_id = ng-reforco-<memberId>` só se o seu índice único o permitir; se a unicidade for por membro (bloqueava o reforço a quem já recebeu lembrete), é preciso estrutura nova — paro e digo antes de codificar.

## 2) Modelo `presale-reinforce-email.ts`
- HTML fiel ao enviado; só substitui `{{URL_IMAGENS}}` (base já existente `REMINDER_HEADER_BASE`, importada, sem duplicar), `{{NOME_OPCIONAL}}` (`" Maria"` ou vazio), `{{CODIGO}}` (texto, escapado), `{{LINK_FEVER}}`, `{{RODAPE_LEGAL}}` = `legalFooterHtml(unsubscribeUrl)`.
- Assunto exacto: «O teu código da pré-venda Newgang 27 (válido até 10/11)»; teste com prefixo «[TESTE] ».
- Texto simples com `legalFooterText`. Erro se sobrar `{{`.
- Nome: 1.ª palavra, só letras Unicode e hífen, Capitalizada; < 2 letras/inválido → «Olá,».
- Link Fever: não existe constante no código (só o URL em `portal_settings` da Coala e em docs). Proposta: constante única `FEVER_CLUB_URL` neste ficheiro + UTM `utm_source=clube&utm_medium=email&utm_campaign=ng27_prevenda_reforco`.

## 3) Ações de operador (em `index.ts`, mesmo invólucro do lembrete)
- `reforco_count`: decomposição (consentimento granted, sem erased_at, sem supressão simples/`sha256:`, com código, fora de exclusões, já reservados, elegíveis).
- `reforco_test`: `{to, member_email}` → um envio para `to`, com nome/código do membro; não reserva.
- `reforco_run`: `dry_run` por defeito, `limit` ≤ 300 (400 acima), reserva `ng-reforco-<id>` antes do envio, paragem a 3 unknown, `email_send_log.template_name='ng27_reforco'`, enfileira via `enqueue_email` (como o lembrete).
- Lógica pura em `presale-reinforce.ts` (elegibilidade, reutiliza `grantedOnly` e `runReminderBatch`-padrão sem o alterar).

## 4) Fila e débito
Envio = `email_send_log` + `enqueue_email` → `process-email-queue`. Live: `batch_size=20`, `send_delay_ms=150` → ~20 e-mails por execução (~3 s). Não encontrei por SELECT o cron que corre a fila; débito real só confirmável depois disso (passo 1 da implementação). Com 14k: 47 chamadas de 300. Se a fila corre a cada minuto: ~20/min → ~11 h — demasiado lento; propor ao 0 subir `batch_size` (ex.: 200) antes de 06/11.
Proposta (para o 0): cron `*/2 * * * *` a chamar `reforco_run` limit 300 a partir de 11:00 de 06/11 (Lisboa = UTC), desligado quando `elegíveis=0`; enfileirar ~1,5 h; entrega depende do ritmo da fila. Não crio cron.

## 5) Imagens
Bucket `test-artifacts` é público (confirmado). As 2 imagens NG27 ainda não existem (0 objectos). URLs finais: `…/test-artifacts/newgang/NG27_prevenda_cabecalho_1200x600.jpg` e `…/NG27_prevenda_carimbo_ultimos_dias.png`.

## 6) Riscos e testes
Riscos: nomes com emoji/números/apóstrofos; duplicados de e-mail (vários membros mesmo e-mail → um envio por e-mail); sem código → excluído e contado; revogação entre teste e envio → elegibilidade lida em cada chamada; supressão `sha256:`; reserva consumida em unknown (não repete).
Testes Deno/vitest: nome (MARIA JOANA SILVA, vazio, «A», «jo-ana», acentos, números), placeholders resolvidos, assunto, código escapado, elegibilidade, limite 300, paragem a 3 unknown, teste sem reserva. tsc/deno check dos ficheiros tocados.
Ficheiros: `presale-reinforce-email.ts`, `presale-reinforce.ts`, testes, `index.ts` (só novas acções), migração + cópia manual. Não toco em `email.ts`, `reminder*.ts`.

## 7) Deploy
Sem deploy, SQL ou Publish por mim; deploy e migração pelo Pedro/0 após aprovação.
