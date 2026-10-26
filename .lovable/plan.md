# P1 — Congelar por sócio (event_settlement_participants)

## Lido
- .lovable/memory/features/event-settlements.md (secção "Selo do fechamento" e g-sections)
- .lovable/memory/features/cache-payment-contracts.md
- docs/INDEX.md
- Live: seal_event_settlement (md5 f3c34692…), unseal_event_settlement (8d7dc8ed…), guard_sealed_event_settlement (ef96623c…), prevent_delete_sealed_settlement_participant (87403dc0…), validate_settlement_participant (daf7c7b8…), trg_esp_sync_event_partners (a7017fbc…); colunas e triggers de event_settlement_participants, event_partner_extras, event_cache_configs; colunas de system_audit_log
- Escritores: src/components/EventPartnersTab.tsx (insert/update/delete), EventSettlementsManager.tsx, src/lib/settlement-participants.ts (leitura), _shared/settlement/statement-service.ts (leitura)

## Factos verificados
- Cachê: event_cache_configs.is_finalized NÃO tem trigger nem RPC — só o cliente grava. Padrão a copiar é o do selo (RPC SECURITY DEFINER + trigger + set_config local), não o do Cachê.
- Guardas existentes: guard_sealed_event_settlement atua só em event_settlements; prevent_delete_sealed_settlement_participant só bloqueia DELETE com fechamento selado. A guarda nova não duplica nenhuma das duas.
- event_partner_extras: colunas id, event_id, partner_id (FK event_partners.id), kind, description, amount, notes, company_id. É por evento + event_partner, não por fechamento.
- Nenhum trigger dos participantes verifica evento concluído (validate e sync sem "completed"). Congelar funciona em eventos concluídos e por selar.
- Anitta EDA 2026: 6 participantes, 4 em settles.

## Passos (um «Sim» de cada vez)
1. Migração 0268_p1_participant_freeze_columns: ADD COLUMN frozen_at timestamptz, frozen_by uuid, frozen_values jsonb, freeze_note text (todas nullable, sem DEFAULT). Rollback: DROP COLUMN ×4.
2. Migração 0269_p1_freeze_rpcs: freeze_settlement_participant(_participant_id, _values, _note) e unfreeze_settlement_participant(_participant_id, _reason). SECURITY DEFINER, search_path public; permissões iguais ao selo; company_id = current_company_id(); só settles; recusa selado / já congelado / _values não objeto; unfreeze exige motivo e recusa selado; set_config('app.settlement_freeze_op','on',true); auditoria settlement_participant_frozen / _unfrozen (old_data = valores que estavam). ACL: REVOKE PUBLIC, anon; GRANT authenticated, service_role. Rollback: DROP FUNCTION ×2.
3. Migração 0270_p1_freeze_guard: função guard_frozen_settlement_participant + trigger BEFORE UPDATE OR DELETE em participantes (colunas listadas + colunas de congelamento fora da RPC; DELETE bloqueado) e trigger em event_partner_extras (INSERT/UPDATE/DELETE bloqueados se existir participante congelado com event_partner_id = partner_id no mesmo evento). Rollback: DROP TRIGGER ×2 + DROP FUNCTION.
4. Migração 0271_p1_seal_requires_frozen: CREATE OR REPLACE de seal_event_settlement a partir do texto Live (md5 confirmado antes de aplicar), acrescentando só a recusa «Há sócios por congelar: …» antes do C1/C2. Rollback: definição Live atual guardada byte a byte.
- unseal_event_settlement não muda (não toca nas colunas novas).

## Testes
PGlite por passo (src/test/p1-participant-freeze.test.ts): permissões, outra empresa, nominal recusado, selado recusado, duplo congelar, motivo vazio, guarda de colunas, DELETE, extras bloqueados/livres noutro sócio, selo recusado sem congelados e aceite com todos, auditoria. Vitest completo + tsgo. Sem emails/notificações.

## Verificação Live (só leitura)
Colunas existem e todas nulas; prosecdef/proacl; md5 das funções antigas iguais (exceto seal no passo 4); triggers listados; números Anitta inalterados (418.598,65 / 59.799,81 / 760.576,69).

## Fica por aplicar depois
Ecrã (P7) — sem ele não há forma de congelar pelo app; o selo da Anitta ficará bloqueado após o passo 4 até haver ecrã.

## Decisões do Pedro (26/10)
1. A — passo 4 só junto com o ecrã P7.
2. A — extras bloqueados se o sócio estiver congelado em qualquer fechamento do evento.
3. A — frozen_values: só valida objeto (não nulo, não array).
Nenhum DDL até ao «Sim» ao passo 1; depois só o passo 1 + verificação Live, e parar.
