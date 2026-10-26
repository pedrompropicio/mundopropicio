# R2 — Conservação de dados do Clube Newgang (30/36 meses)

Nada é aplicado sem "Sim" por passo. Não há hoje nenhuma rotina de conservação para o Clube. O único modelo existente é a retenção de criativos Meta (#209: dry_run por omissão, registo por corrida).

## 1. Dados de "última interação"

Já existem (Live, 26/10):
- Inscrição: `club_members.created_at`. Confirmação: `confirmed_at`.
- Login e ligação mágica: `club_member_sessions.used_at`.
- Missões: `club_mission_submissions.created_at`. Pontos: `club_points.created_at`.
- Decisões de consentimento: `club_member_email_consents.decided_at`.

Faltam:
- Aberturas e cliques de email: `email_send_log` só tem os estados sent, pending, failed, bounced, suppressed e dlq. Hoje há 0 aberturas e 0 cliques. É preciso o webhook de eventos do Resend (opened/clicked), gravado por `message_id`.
- Visitas ao portal com o membro identificado: não existe esse registo. Proposta: guardar só um carimbo `last_seen_at` por membro, atualizado na sessão válida.
- Compra de bilhete por email: está nas fontes de bilheteira, mas não está ligada ao membro. Proposta: cruzar pelo hash do email dentro da rotina, sem copiar dados.
- `updated_at` fica de fora: muda com processos internos e não é uma interação.

## 2. Como a rotina corre e como guarda prova

- Uma função agendada, `newgang-retention`, só com service-role. Corre uma vez por dia (03:30 UTC), porque os prazos são em meses.
- Aos 30 meses: envia um email de reconfirmação com um token de um clique (sessão `purpose='reconfirm'`). Um por membro e por ciclo; lotes e canário iguais aos do lembrete (300/500).
- Clicar no link regista a interação e renova o prazo.
- Aos 36 meses, sem clique: elimina email, telefone, nome, redes sociais e o contacto ligado. Mantém o registo de supressão (`suppressed_emails` só com o hash do email, `reason='retention_36m'`). Os pontos ficam anónimos ou são eliminados (decisão em aberto).
- Pedido de remoção ou cancelamento: elimina logo pelo mesmo caminho, com `reason='erasure_request'`.
- Prova: nova tabela `club_retention_log` (sem dados pessoais) com id da corrida, id antigo do membro, hash do email, motivo, data da última interação, tabelas afetadas e contagens. Mais `club_retention_runs` com totais por corrida. Nenhuma das duas é visível a anon/authenticated.

## 3. Testes em simulação

- `dry_run=true` por omissão: calcula os candidatos e devolve as contagens e os hashes, sem enviar nem apagar.
- `member_id` de teste com data simulada (`as_of`) para forçar os limiares.
- Testes PGlite: eliminação, supressão, renovação pelo clique e idempotência.
- O cron começa em dry_run. Passa a real só depois de um "Sim".

## 4. Impacto hoje (query em Live)

- 10.518 membros. A última interação mais antiga é de 13/10/2026.
- Aos 30 meses: 0. Aos 36 meses: 0. Os primeiros chegam aos 30 meses por volta de abril de 2029.

## Passos (cada um precisa de "Sim")

1. Webhook Resend para aberturas e cliques, e `last_seen_at` (DDL e deploy).
2. Tabelas de log, função em dry_run e testes.
3. Email de reconfirmação e link de um clique.
4. Remoção imediata a pedido.
5. Cron diário em dry_run e, depois, passagem a real.

## Decisões em aberto

- Pontos e missões aos 36 meses: anonimizar (recomendado, mantém totais) ou apagar.
- Base da supressão: hash SHA-256 do email normalizado (recomendado).
