# Roadmap — épica #146 (e)

## Feito
- [x] Fase 1 — inversão do espelho: `event_partners` é derivada de
      `event_settlement_participants` (trigger `trg_esp_sync_event_partners` +
      `event_partners_sync_from_settlements(uuid)`, EXECUTE só a `service_role`).
      Removidos `trg_event_partners_mirror_*` e `event_settlement_sync_root`.
      FK `event_partner_id` → `ON DELETE SET NULL`.
- [x] Fase 1 — RLS estanque: `is_settlement_staff`, `user_settlement_ids`,
      `user_settlement_visible_ids`, `settlement_local_partners_pct`;
      SELECT recriado em `event_settlements`, `event_settlement_participants`,
      `event_third_party_operations`, `event_operation_participations`.
- [x] Fase 1.3 — prova: 9 antes / 9 depois, diferença simétrica 0
      (tabela `event_partners_mirror_inversion_proof`).
- [x] Fase 2 (A) — aba Sócios edita apuramentos (gated por `manage_bp`),
      com apuramento, modo (acerta/nominal), visibilidade em documentos e
      casa read-only recalculada (100 − Σ sócios).
- [x] Fase 2 (G) — rodapé provisório retirado do painel Apuramentos.

- [x] Fase 2 (B) — selector de apuramento no Encontro de Contas.
- [x] Fase 2 (C) — documentos estanques: "Sócios locais" (100 − % do sócio).
- [x] Fase 2 (D) — PDF de fecho identifica o apuramento em uso.
- [x] Fase 2 (E) — Portal do Sócio via `get_partner_event_shares` reescrita
      sobre `event_settlement_participants` (staff vê tudo; sócio vê a sua parte
      + "Sócios locais").
- [x] Fase 2 (F) — `src/lib/house-partner.ts` apagado; substituído por
      `src/lib/settlement-participants.ts` (7 consumidores migrados).
- [x] Fase 3 — prova por parte nos eventos legíveis: 0 linhas de diferença
      antigo vs novo; 34 testes vitest verdes; typecheck limpo.
- [x] Fase 4 — DECISIONS adenda (e) e estado-fecho-e-socios actualizados.

## Em aberto
- [ ] Comentário/checkbox (e) na épica #146 (feito via edge function).

Nota: nenhum Publish feito.
