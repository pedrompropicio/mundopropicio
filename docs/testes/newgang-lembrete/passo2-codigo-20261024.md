# Lembrete de confirmação Clube Newgang — passo 2/4 (R1, código e testes) — 24/10/2026

HEAD de partida: local = GitHub main = `daf55249f263dd5334e64e870558da9a2a4e76d7`.
Sem Live, sem DDL aplicada, sem deploy, sem Publish, sem e-mails enviados.

## O que existe agora
- `supabase/functions/newgang-portal/reminder-email.ts`: HTML do criativo, marcas substituídas (cabeçalho `.../test-artifacts/newgang/NG_clube_lembrete_B_1200.jpg`, link individual nas 4 posições — VML, botão, href e texto do link alternativo —, nome opcional escapado, rodapé atual com logo Newgang Produções + "Cancelar a subscrição"). A frase "Recebeste este e-mail..." aparece 1 vez (a do criativo). Lança se sobrar `{{`. Versão texto simples. lang pt-PT só aqui.
- `reminder.ts`: `sendReminderOnce` (reserva antes do envio; error_pre_send / unknown como no welcome), `runReminderBatch` (para ao 3.º unknown seguido), limite máx. 500.
- `index.ts`: tipo `reminder` em `sendClubLink` (label `newgang_club_reminder`, mesmo remetente, fila, sessão de 30 dias e descadastro); boas-vindas/acesso com a mesma saída. Ações só service_role, sem cron:
  - `club_reminder_batch { limit, dry_run }` — dry_run por defeito; devolve contagens + resumo.
  - `club_reminder_test { member_id, dry_run }` — ignora só as 48 h; conta como o lembrete dessa pessoa.
- `supabase/manual/20261024_newgang_club_reminder.sql` (+ `rollback_20261024_newgang_club_reminder.sql`): tabela `club_reminder_reservations`, `_club_reminder_reason`, `club_reminder_reserve` (lock do membro, reverifica tudo), `club_reminder_mark`, `club_reminder_candidates` (máx. 500), `club_reminder_summary` (contagens por motivo + member_id dos dlq/sem registo). Só service_role.

## Desvio ao pedido
- A migração ficou em `supabase/manual/` e não em `drizzle/migrations/0239`: um ficheiro no diretório drizzle sem entrada no journal só pode ser criado pela ferramenta de migração, que o aplica de imediato. No passo 3 o conteúdo é passado byte-a-byte e passa a 0239.

## Testes (corridos)
- Deno `reminder_test.ts`: 10/10 PASS (marcas, sem `{{`, links distintos, escape do nome, rodapé, boas-vindas com impressão digital SHA-256 igual à versão anterior, reserva/envio/estados, lote, limite).
- Deno pasta newgang-portal completa: 25/25 PASS.
- Vitest PGlite `src/test/newgang-reminder-sql.test.ts`: 8/8 PASS (confirmado, suprimido, <48 h, dlq, sem registo, já reservado, message_id forjado, idempotência, retry máx. 3, teste ignora 48 h, permissões).
- Vitest suite completa final: 260 ficheiros PASS, 2417 testes PASS, 0 falhas.
- tsgo (ecrã): 0 erros.
- deno check index.ts: 1 erro PRÉ-EXISTENTE (`wallet_sync`, `ok` duplicado, linha antiga), igual na versão de partida; ficheiros novos sem erros.

## Não corrido
- Nada em Live; nenhum envio; migração não aplicada; função não implantada.

## Exemplo renderizado
- `exemplo-renderizado.html` e `exemplo-renderizado.txt` (nome "Ana", tokens de exemplo).
