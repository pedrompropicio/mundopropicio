# Roadmap — épica #146 (e)

## #303 — rascunho Deive Braga
- [x] Criar rascunho documental, ligar dedução existente e linha do 3163, verificar travas sem novos movimentos.
- [x] Actualizar estado e comentar #303 sem fechar; confirmação fica para Pedro (comentário 6099594598, issue aberta verificada).

## Smart links — chegada SSR (despacho D-ERP189)
- [ ] D-ERP234: migração, função, deploy e testes browser/401 autorizados; segredo partilhado por criar pelo Pedro.
- [ ] Provar SSR válida, repetição browser e prefetch autenticado — bloqueado por SONG_LINK_SSR_KEY, que Pedro configura igual no ERP e Portal.

## #303 — cartões e resumo de apuramentos
- [x] Cartões com saldos dos eventos sem fecho e sem apuramento, diferença de calendário e listas.
- [x] Subtotais por tipo, significado da posição e nota do 3163 sem números móveis.
- [x] Registar decisões e verificar travas antes/depois iguais; 13 testes, ecrã desktop/mobile e build automático OK; sem Publish.

## Lote 2 — Infra (#231, #244, #61)
- [x] Remover AGENTS.md; preservar regras em docs/DECISIONS.md.
- [x] #244: suite sem falhas; identificar commits e prova de correção do cálculo, não do teste.
- [x] #231: confirmar splitting existente e medir entrada/preloads em produção; acrescentar relatório derivado do bundle.
- [x] #231: verificar version.json contra SHA/HEAD por script, com testes positivos e negativos.
- [x] Suite final: 834 passed, zero falhas; build automático OK; índice regenerado/testado. CI remoto não confirmado.
- [ ] #61: migrar xlsx, validar Coala/Ticketline, só depois unpdf/BOL — bloqueado: três ficheiros reais não disponíveis no storage identificado. Imports intactos.

## Lote 1 — BP (#260, #249, #247, #248)
- [x] #260: diálogo de classificação na pilha comum com foco; percurso antigo de desambiguação já removido anteriormente.
- [x] #249: campos intactos preservados; Vincular ao BP já usa a pilha comum, confirmado por teste.
- [x] #247: snapshot + inserts + updates atómicos; prova real recusada sem novas versões/linhas.
- [x] #248: edição inline regista Desfazer; cancelamento da observação não repõe outros campos.
- [x] Testes e camadas verificados, sem Publish; percurso visual completo fica para Pedro.

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
- [x] Comentário e checkboxes (a)–(e) na épica #146 (issuecomment-5649753808).

## Faturas avulsas — issues #191–#193
- [x] Criar `ingest-standalone-invoice` sem tocar nos fluxos financeiros proibidos.
- [x] Acrescentar número, moeda original, câmbio e pagador ao Scanner, Conferência e XLSX.
- [x] Atualizar OCR e documentação; validar sem escritas em Live.

## Manual de Orientação — Fase 4
- [ ] Migração rastreada de pesquisa híbrida e gestão de lacunas.
- [ ] Reescrever `help-search` com embeddings, citações e registo de perguntas.
- [ ] Integrar “Pergunte ao manual” em `/ajuda` e no painel lateral.
- [ ] Criar `/admin/lacunas-manual`, validar e deixar testes/consultas para pós-Publish.

Nota: nenhum Publish feito.

## Épica #146 — (g4) acrescentos de 13/09 (Pedro)
- [ ] Cabeçalho da aba Sócios: "(NN% atribuído)" por fechamento (ou só raiz), nunca soma cruzada
- [ ] Confirmar que o aviso "Fechamento X sem percentagem sobre o pai" desaparece (motor lê parent_share_pct: 0 válido, NULL só na raiz)
- [ ] Remover coluna "Base IVA" e "(herda)" da tabela de participantes; mostrar a base junto ao nome do fechamento

## Issue #200 — listagem de listas em blocos
- [x] Trocar a tabela principal por blocos com barra de cinco fases por lista.
- [x] Validar por lista: fases = Lançadas + Não aprovadas.
- [x] Corrigir a memória de “Marcar como Pago” versus “Liquidar (N)”.
