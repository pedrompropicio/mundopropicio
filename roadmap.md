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

## Em aberto
- [ ] Fase 2 (B) — separador por apuramento no Encontro de Contas
      (`PartnerSettlementTab.tsx`, 2253 linhas).
- [ ] Fase 2 (C) — documentos estanques com bloco "Sócios locais"
      (`settlement_local_partners_pct`).
- [ ] Fase 2 (D) — PDF por apuramento (`export-partner-statement.ts`,
      `bp-closing-data.ts`).
- [ ] Fase 2 (E) — Portal do Sócio a ler `event_settlement_participants`.
- [ ] Fase 2 (F) — retirar `src/lib/house-partner.ts` (5 consumidores de cálculo).
- [ ] Fase 3 — `scripts/prove-settlement-engine.ts` com partes antes/depois +
      testes vitest de visibilidade, documento de filho e sync de `event_partners`.
- [ ] Fase 4 — documentação (D-ERP56 adenda (e)) e comentário na #146.

Nota: nenhum Publish feito.
