# Lembrete de confirmação do Clube Newgang — plano (passo 1 de 4, R2)

## 0. Verificações feitas
- HEAD local = GitHub main = `389278f1377c946309a6616482ee5d072741b3b4` (fetch de origin/main nesta sessão).
- Ficheiros lidos: `supabase/functions/newgang-portal/index.ts` (issueSession, unsubscribeUrls, sendClubLink, notifyPending), `email.ts`, `welcome.ts`, `pending.ts`, `pending_test.ts`, `drizzle/migrations/0170_issue321_club_welcome_reservation.sql`, `0171_..._fix_site_table.sql`, `0184_issue332_immediate_welcome.sql`; definição Live de `club_welcome_reserve` e `club_welcome_mark`; uso de `suppressed_emails` em `process-email-queue`. docs/INDEX, QUADRO e estado-crm só na parte Newgang/#321/#332.
- Contagem Live agora (14:30 UTC): 1.865 sem confirmar; 1.680 com mais de 48 h (valores mudam; recontar na hora do envio).
- Correção a um pressuposto: as migrações deste projeto vivem em `drizzle/migrations/` (não em `supabase/migrations/`).
- Supressão: a fonte usada pela fila é `suppressed_emails` (email + company_id; motivos bounce/complaint/unsubscribe). O descadastro (`handle-email-unsubscribe`) grava lá. É a mesma fonte que o lembrete vai usar.
- Reserva no QUADRO: em modo plano não posso gravar ficheiros fora do plano. Será a PRIMEIRA ação depois de aprovado (linha nova em "Em execução agora", âmbito descrito no ponto 6).

## 1. Desenho confirmado (com correções)
1. `sendClubLink` ganha o tipo `"reminder"`: label `newgang_club_reminder`, assunto exato "Falta 1 clique para entrares no Clube Newgang", mesmo remetente `Newgang Festival <clube@SENDER_DOMAIN>`, mesma fila `transactional_emails`, mesmo `issueSession` (link `/clube/entrar?t=...`, 30 dias), mesmos `unsubscribeUrls` (página + one-click). Os ramos `welcome` e `access` ficam byte-a-byte iguais.
2. Tabela nova `club_reminder_reservations` + `club_reminder_reserve` / `club_reminder_mark`, análogas às do welcome mas sem o ramo `legacy_sent`. message_id fixo `ng-reminder-<member_id>` (idempotência na fila também).
3. Template novo em ficheiro próprio `reminder-email.ts` (não mexe no `clubEmail`); `lang="pt-PT"` só no lembrete; welcome continua pt-BR (correção do welcome fica como pergunta, não incluída).
4. Função pura `reminderEligible` + filtro SQL na reserva (dupla barreira).
5. Novo `action` manual na edge function, só com segredo de operador (mesmo mecanismo das ações admin já existentes), sem cron.

## 2. Ficheiros a criar/alterar
- `supabase/functions/newgang-portal/reminder-email.ts` (novo): `reminderEmail({ firstName, link, unsubscribeUrl, headerBase })` -> `{ html, text }`. Substitui `{{URL_CABECALHO}}`, as 3 ocorrências de `{{LINK_CONFIRMACAO}}` (VML, botão, link alternativo — 4 marcas textuais contando o texto visível), `{{NOME_OPCIONAL}}` (" Nome" escapado ou vazio) e `{{RODAPE_ATUAL_LOGO_NEWGANG_PRODUCOES}}` por: logo Newgang Produções + link "Cancelar a subscrição" (a frase "Recebeste este email..." do rodapé atual NÃO é repetida, porque o HTML já a tem). Falha (lança) se sobrar algum `{{`.
- `supabase/functions/newgang-portal/reminder.ts` (novo): `sendReminderOnce` (cópia do padrão de `welcome.ts`: reserva antes do envio, error_pre_send / unknown nunca libertam) e `reminderEligible`.
- `supabase/functions/newgang-portal/index.ts`: ramo `reminder` em `sendClubLink`; função `notifyReminders(site, { limit, memberId?, test })`; ação `club_reminder_batch` (lote) e `club_reminder_test` (um member_id, ignora 48 h).
- Testes: `reminder-email_test.ts`, `reminder_test.ts` (Deno, padrão de `pending_test.ts`) e `src/test/newgang-reminder-sql.test.ts` (PGlite) para as funções SQL.
- `drizzle/migrations/<próximo nº>_newgang_club_reminder.sql` + `supabase/manual/..._rollback.sql`.
- Docs: QUADRO (só a linha), estado-crm-portal-e-leads, memória Newgang, relatório em `docs/testes/`.

## 3. DDL descrita (não aplicada)
```text
CREATE TABLE public.club_reminder_reservations(
  member_id uuid PRIMARY KEY REFERENCES club_members(id) ON DELETE CASCADE,
  site_id uuid NOT NULL, company_id uuid NOT NULL,
  message_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','enqueued','error_pre_send','unknown','skipped_confirmed','skipped_suppressed')),
  attempt_count int NOT NULL DEFAULT 1, retry_safe boolean NOT NULL DEFAULT false,
  next_attempt_at timestamptz, error text, test boolean NOT NULL DEFAULT false,
  created_at/updated_at timestamptz DEFAULT now());
GRANT ALL TO service_role; RLS ligada; sem políticas para anon/authenticated (só service_role).

club_reminder_reserve(p_company_id, p_site_id, p_member_id, p_message_id, p_test boolean) -> text
  - message_id tem de ser 'ng-reminder-'||member_id
  - membro pertence ao site/empresa; SELECT ... FOR UPDATE do membro (serializa com a confirmação)
  - confirmed_at IS NULL (senão 'confirmed')
  - email não está em suppressed_emails (lower(trim), mesma empresa ou global) (senão 'suppressed')
  - não p_test: created_at < now()-48h
  - welcome com status 'dlq' ou sem registo em email_send_log -> 'excluded_welcome' (fora do lote)
  - INSERT ... ON CONFLICT(member_id) DO UPDATE só para error_pre_send retry_safe attempt<3 (igual ao welcome)
  - devolve 'reserved' ou o motivo da recusa
club_reminder_mark(p_member_id, p_status, p_error) -> boolean  (igual a club_welcome_mark)
REVOKE EXECUTE de PUBLIC/anon/authenticated; GRANT a service_role.
```
Nada toca em `club_welcome_reservations`, `club_members` nem nas funções existentes.

## 4. Fluxo do envio (manual, em lotes)
```text
operador -> action club_reminder_batch(limit<=50, dry_run=true por defeito)
  SELECT candidatos (keyset por created_at,id; exclui já reservados)
  por membro: reserve (reverifica confirmed_at + supressão sob lock)
            -> sendClubLink('reminder') -> mark enqueued | error_pre_send | unknown
  devolve contagens (sem emails nem IDs)
```
- Retomável: repetir a chamada continua de onde ficou (quem já tem reserva é saltado). unknown nunca é repetido.
- dry_run devolve só contagens de elegíveis/excluídos, sem reservar nem criar sessão.
- Modo teste: `club_reminder_test(member_id)` — ignora só as 48 h; marca `test=true`. Um teste num membro real conta como o seu lembrete (não recebe outro no lote) — ver pergunta.
- Corrida com confirmação: lock da linha do membro na reserva; quem confirma depois da reserva recebe o e-mail na mesma (janela de milissegundos a segundos), o link continua a funcionar e não dá pontos em duplicado (confirmação é idempotente).

## 5. Testes previstos
- PGlite: confirmado recusado; suprimido/descadastrado recusado; <48 h recusado (e aceite em teste); já reservado recusado; segunda reserva devolve recusa (idempotência); dlq/sem registo excluídos; retry de error_pre_send limitado a 3; unknown nunca reabre; message_id forjado recusado.
- Deno: nenhum `{{` no HTML final; os 3 links = link individual; nome escapado ou vazio; dois membros -> dois links distintos; lang pt-PT; cores #0b1f14/#3ddc6f presentes; texto simples contém link e cancelar; `clubEmail` welcome com saída idêntica antes/depois (snapshot do HTML gerado com dados fixos); `sendReminderOnce` com os mesmos casos de `welcome.ts`.
- Suite completa vitest + deno check no fim.

## 6. Passos e classe de risco
1. (R0) Reserva no QUADRO: newgang-portal index.ts/reminder*.ts, migração e rollback do lembrete, testes, docs Newgang.
2. (R1) Código + testes, sem deploy. Pedro anexa a imagem; alojamento em `test-artifacts/newgang/NG_clube_lembrete_B_1200.jpg`. URL final no HTML: `https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang/NG_clube_lembrete_B_1200.jpg` (o código passa `{{URL_CABECALHO}}` = `.../public/test-artifacts/newgang`, porque o template já acrescenta o nome do ficheiro). Upload da imagem é R1 (armazenamento público já existente).
3. (R2) Migração em Live + deploy da edge function (janela do 0 · Cowork, Sim próprio).
4. (R2, efeito externo) Teste num member_id; depois lotes autorizados pelo Pedro.

## 7. Riscos
- Reputação do domínio: 1.680 envios para quem ainda não abriu/confirmou -> mais queixas e bounces. Mitigação: lotes pequenos (ex.: 50, depois 200/dia), pausa se bounce >2% ou queixa >0,1% entre lotes, supressão revista na hora.
- Descadastro: link one-click e página iguais aos atuais; supressão reverificada em cada reserva.
- Confirmação em corrida: ver ponto 4; risco residual aceite.
- Links antigos: cada lembrete cria uma sessão nova de 30 dias; as anteriores continuam válidas até expirar.
- Assinatura: "Recebeste este e-mail..." aparece uma só vez.

## 8. Provas em Live (SELECT, sem dados pessoais)
- Antes: contagem de elegíveis por motivo (confirmados, suprimidos, <48 h, dlq, sem registo, elegíveis).
- Depois de cada lote: `status, count(*)` em club_reminder_reservations; `status, count(*)` em email_send_log com template `newgang_club_reminder`; zero reservas com membro confirmado antes de `created_at` da reserva; zero e-mails para suprimidos; zero duplicados por member_id.
- Lista à parte (15 dlq + 4 sem registo): só contagem e member_id, para decisão do Pedro.

## Decisões para o Pedro
```text
Decisões para o Pedro — lembrete Clube Newgang

1. Tamanho dos lotes
   a) 50 por chamada, até 200 por dia, pausa por bounce/queixa  (RECOMENDADA)
   b) 200 por chamada, tudo em 2 dias
2. 15 em dlq + 4 sem registo
   a) Fora do lote; lista à parte para decidir depois  (RECOMENDADA)
   b) Incluir no lote
3. Membro de teste
   a) O teste conta como o lembrete dessa pessoa (não recebe 2.º)  (RECOMENDADA)
   b) O teste não conta; recebe outro no lote
4. Corrigir lang pt-BR -> pt-PT também na boas-vindas
   a) Não agora; só no lembrete  (RECOMENDADA)
   b) Sim, no mesmo passo
5. Quem confirma depois da reserva mas antes da entrega
   a) Aceitar o risco residual (sem pontos duplicados)  (RECOMENDADA)
   b) Adiar o envio e reverificar na fila (mais código na fila partilhada)
6. Novo lembrete para quem não confirmar depois deste
   a) Não; um único lembrete por pessoa  (RECOMENDADA)
   b) Sim, a definir depois
```
