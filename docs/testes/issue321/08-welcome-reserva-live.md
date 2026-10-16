# 08 — Reserva atómica do welcome do Clube (#321) — Live
Data: 2026-10-16 ~00:55 UTC · Base: a45e9fb4346474524081216872bc9b5313611058 (CI success run 38831018147)

Migrações: 0170_issue321_club_welcome_reservation, 0171_issue321_club_welcome_reserve_fix_site_table (corrige tabela de sites para portal_sites).
Edge: newgang-portal deployada (source_sha256 e84c0717…). Smoke: POST notify_member com id inválido -> 400 (sem envio).

Desenho:
- Tabela club_welcome_reservations (PK member_id) — reserva ANTES do envio; estados reserved/enqueued/error_pre_send/unknown/legacy_sent; nunca libertada automaticamente.
- club_welcome_reserve(company, site, member, message_id): valida membro∈site∈empresa; se já existe welcome em email_send_log -> regista legacy_sent e recusa; INSERT ON CONFLICT DO NOTHING = só uma execução adquire.
- club_welcome_mark(member, status, error): só a partir de reserved/unknown.
- notifyPending (notify_member e notify_pending) usa sendWelcomeOnce (welcome.ts). Acesso (access) e outros fluxos inalterados.
- sendClubLink passou a verificar erros: falha antes do enfileiramento -> PreSendError -> error_pre_send; erro/incerteza no enqueue_email -> unknown. Antes os erros eram ignorados.
- idempotency_key estável ng-welcome-<membro> mantida no payload (dedupe a jusante; não é exactly-once garantido).

Conferência Live (agregados, sem PII, sem envios):
- Backfill: 4 reservas legacy_sent (membros existentes com welcome registado; 9 logs antigos de membros já inexistentes ignorados). Membros formulario por confirmar sem reserva: 0.
- EXECUTE reserve/mark: anon=false, authenticated=false, service_role=true. Tabela: anon/authenticated SELECT=false.
- capi suspended=true; jobs 33/34/44/45=0; contacts 27088; club_members 7; welcome log 14 (iguais a antes).

Recuperação manual (error_pre_send/unknown): verificar email_send_log/fila para o message_id; se comprovadamente não enfileirado e com autorização, apagar a linha da reserva desse membro e voltar a chamar notify_member. Nunca em lote.

Limites: atomicidade garantida pela PK em Postgres (teste concorrente em memória espelha ON CONFLICT); entrega final depende do provedor; "sent" no log = aceite, não entregue.
