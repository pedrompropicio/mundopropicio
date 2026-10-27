---
name: Estágios dos eventos
description: P1 servidor com carimbos de fecho/histórico, checklist canónica e reabertura legada compatível
type: feature
---

# Estágios — D-ERP318

event_stage: cancelado primeiro; histórico por historical_at; fechado somente closed_at e status completed; planning→planeamento; completed ou maior data própria/filhos diretos passada→em_fecho; restante→em_curso. Datas civis Europe/Lisbon como D-ERP288. event_stage_list filtra empresa ativa.

close_event exige admin/manager da empresa, checklist servidor completa e carimbo vazio. Checklist usa is_sealed+snapshot não nulo; freeze city/config is_finalized; soft.bp_lines_unreviewed; todos hard de event_close_blockers. Não calcula outro motor. Ausência de selos/configurações é condição satisfeita, com totais zero explícitos.

reopen_event_closure exige admin, reopen_event e motivo; limpa carimbos, não status. O caminho legado completed→outro status limpa carimbos por zz_stage_legacy_reopen; z_stage_fields_guard precede cleanup e recusa mudança enviada diretamente. Funções e snapshots existentes intactos.

Histórico: mark/unmark só admin, auditados; não mudam status. Escritas RPC só authenticated, validam papel/empresa; leituras authenticated/service_role; anon sem EXECUTE, helpers privados. Flag de sessão delimitada por evento/transação, não é defesa contra SQL privilegiado.

Migração0280, manual idêntica e rollback comentado. Provas (a)–(h), predicados e limites: docs/testes/p1-event-stages-20261027.md. P2 backfill é separado com autorização do Pedro. Nenhuma UI implementada por P1.