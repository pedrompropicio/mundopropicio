# Roadmap — épica #146 (e)

## #327 — CRM e prévia de ativação (16/10/2026)
- [x] Aplicar compatibilidade em todos os editores Clube; bloquear estados não verificados e valores ignorados pelo motor.
- [x] Validar integração local antes/depois de configuração ativa, refetch, erros, troca de site e ranking canónico.
- [x] Registar prévia Live só leitura, revisão CUTOVER/ROLLBACK, provas e passos futuros; sem ativação/Publish/deploy.
- [ ] Confirmar CI do commit final e verificação pós-Publish ERP — aguarda commit automático e autorização de Pedro.

## Coala — estado público do convite (D-ERP276)
- [x] Criar e aplicar estado_convite só leitura, com grants anon/authenticated e PUBLIC revogado.
- [x] Verificar estados Pedro/Fernanda/inválidos via HTTP anon e contagens imediatas antes/depois iguais.
- [x] Registar D-ERP276, memória e output sem tokens; sem email ou Publish.

## Coala Early Bird — remetente e modelo PT (14/10/2026)
- [x] Confirmar domínio marketing na Resend; aplicar remetente nas duas funções e modelo PT integral, preservando EN.
- [x] Aceitar testes internos fora da base sem alterar as contagens; dry run Pedro em PT confirmado, zero convites/fila/logs do teste.
- [x] Guardar definições finais e output integral; sem envio real ou Publish.

## Google Wallet — criativos por nível (14/10/2026)
- [x] Preparar constantes provisórias, lógica por nível e PATCH exclusivo do logo; preservar cartão atual até aos anexos.
- [x] Confirmar na base `last_level` e seleção por pontos OU nível; sem migração necessária.
- [x] Validar testes e documentar a preparação: 12/12 testes Wallet passaram; compilação automática OK.
- [x] Upload público original (SHA-256 igual), URLs definitivos, deploy e PATCH classe/membro nº 3; GET Google confirma logo e hero, pontos, nível, evento e QR; 12/12 testes.
- [x] Gerar novo save_url para nº 3: HTTP 200, pedido 202017; link anterior referencia o mesmo objeto.
- [ ] Confirmar visual no dispositivo — depende do Pedro; só API Google verificada.
- [ ] Decidir alternativa para cores por membro — LoyaltyObject ignora hexBackgroundColor; manter classe única até decisão do Pedro.

## PDF e datas dos fechos — 10/10/2026
- [x] Sinais saneados no PDF, carimbo único em Lisboa e datas civis preservadas; 7 testes passaram e PDF inspeccionado sem sobreposições. Sem dados ou Publish.

## Fórum Braga — bilheteira local (Pedro, 10/10/2026)
- [x] Par 10.3 de 265,00 e comissão IB de 6,15 executados; variações Ticketline −265,00 / Acerto +258,85, diferença zero, restantes travas preservadas. Sem linha BP nova ou devolução antecipada.
- [x] Fecho documental: observação e detalhe ocultos abaixo de 0,01; D-ERP237/estado/memória actualizados; 17 testes passaram e build automático OK. Fórmulas intactas, sem DML ou Publish.
- [ ] Devolução 258,85 aguarda recebimento; pendência da Délia, não lançar agora.

## Folha de crescimento — período de comparação (D-ERP235 autorizada)
- [x] Acrescentar p_from preservando resultado integral sem período; autorizado sem novas confirmações.
- [x] Testar MD5 integral na mesma transacção e bases/deltas de 7 e 28 dias; documentar decisão e commits.

## Relatório de investimento — D-ERP236 autorizada
- [x] Sete KPIs/séries, BCE canónico sem alterar relatório existente; igualdade pela soma das campanhas por plataforma, tempo SQL.
- [x] Criar função reutilizando a lógica canónica, testar Litto e desempenho SQL abaixo de 2 s; registar decisão e commits.
- [ ] Projecção Google numérica — bloqueada por orçamento diário ausente nos snapshots de três campanhas activas; retorna null, sem inventar orçamento nem alterar dados.

## #303 — correcção da explicação da diferença
- [x] Corrigir texto e memória: movimentos já feitos pela bilheteira, ainda não reflectidos no nosso registo; nenhuma escrita financeira.
- [x] Lista clicável com uma linha de bilheteira local, identidade ao cêntimo e apresentação discreta verificadas em desktop/mobile; 3 testes passaram. Sem dados ou Publish.

## #303 — rascunho Deive Braga
- [x] Criar rascunho documental, ligar dedução existente e linha do 3163, verificar travas sem novos movimentos.
- [x] Actualizar estado e comentar #303 sem fechar; confirmação fica para Pedro (comentário 6099594598, issue aberta verificada).

## Smart links — chegada SSR (despacho D-ERP189)
- [x] D-ERP234 adenda: deploy e prova Live sem client_ip, UA vazio: 200, origin ssr, hash/geo null, other; 24 testes passaram. Meta tentou sem IP (400 nesta prova sem UA/cookies), TikTok enviado; sem DDL.
- [x] D-ERP234: migração 0080 aplicada, função implantada, 11 testes focados passaram; Live: 401 sem escrita, browser/repetição uma linha, Meta/TikTok enviados, cookie completado; segredo não criado.
- [ ] Completar provas anteriores de repetição browser e prefetch autenticado; chave já configurada e SSR sem IP comprovada nesta adenda. Fora do âmbito desta adenda.

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

## Tráfego Pago — meta ROAS opcional (11/10/2026)
- [x] Retirar alvos implícitos dos dois motores e do cliente new-design, actualizar memória e testar sem meta.
- [x] Vitest antes 984/depois 999 passed, sem falhas; sintaxe das funções limpa, compilação automática OK; duas funções implantadas, sem DDL/DML/Publish.
- [ ] Verificação tsgo explícita/CI — não executada nesta sessão; compilação automática não substitui essa prova.

## Portal newgangfestival.pt — F1 ERP (aprovado 13/10/2026)
- [x] A: segurança line-up (vista + RLS)
- [x] B: revelações + colunas line-up + lineup_complete
- [x] C: festival_editions (videos jsonb, cover_url), portal_sites + vistas
- [x] D: Clube (membros, pontos, níveis, prémios, palpites, presenças, sessões 30d)
- [x] DML sementeira aplicado 13/10 (supabase/manual/20261013_newgang_portal_seed.sql, incl. backfill); fluxo testado e dados de teste limpos
- [x] Edge newgang-portal (trackers do evento do site sempre; email real via news.newgangfestival.pt)
- [x] Origens portal-track / geo-lookup / google-click-ingest
- [x] Ecrãs /crm/sites/newgang (WebP 1600px, máx 20 fotos, vídeos YouTube/Instagram/Vimeo)
- [x] Testes, spec, D-ERP (próximo livre), memória, estado
