# P6a — painel Posição Financeira — 27/10/2026

R1 autorizado no despacho Pedro 16:34 UTC; plano e implementação juntos. Sem DDL/DML/migrações/edge/Publish ou testes com utilizadores Live.
HEAD arranque: 9fedd645fbec940ecc92e4338c346bd3b88905e7. HEAD implementação observado: 360a212c83f906bd8ace79ee450ae5d241305476 (fecho documental gera outro SHA pela plataforma).
agentFinished externo não disponível nesta superfície; não foi inventada confirmação. Executor desta sessão reservado no QUADRO antes do código.

## Leituras e reutilização
docs/INDEX.md inteiro; QUADRO Em execução e Financeiro; docs/estado/estado-financeiro-e-tesouraria.md; Issues abertas MP-ERP via GitHub HTTP200 (sem alterações); memórias event-stages.md e financial-position-base.md; provas P4/P4b; questões P4; DECISIONS D-ERP320/321; event-stage.ts; AGENTS e roadmap.
Integração: App.tsx, AppSidebar.tsx, Index.tsx, ResultsAnalysis.tsx; useCompany.ts, useEventStages.ts, AuthContext; guard RequireAccess, Button; vitest config/setup; contrato JSON0283 (inalterado). Labels de estágio partilhados, empresa ativa resolvida pelo hook existente, EUR pt-PT.

## Entrega e ficheiros
- Novos: src/lib/financial-position.ts; src/hooks/useFinancialPosition.ts; src/pages/FinancialPosition.tsx; src/components/financial-position/FinancialPositionAccess.tsx e FinancialPositionView.tsx.
- Testes: src/test/financial-position-p6a.test.tsx; financial-position-hook-p6a.test.tsx; fixture sintética em src/test/fixtures/financial-position.ts.
- Integração: App.tsx (lazy route com guarda, permissão financeira não exige outro papel/módulo); AppSidebar.tsx (menu só com permissão); Index.tsx (dashboard real, não existe pages/Dashboard.tsx) passa showActiveProjections=false; ResultsAnalysis.tsx recebe só opção de renderização, default true. Nenhuma fórmula/Análise de Resultados por Evento modificada.
- R0: plano, roadmap, AGENTS, memória financeira e índice gerado, DECISIONS D-ERP322, estado ERP, QUADRO, relatório e questões.

## Provas
33 novos testes PASS (26 contrato/apresentação +7 hook). Campo ausente em cada bloco, tipo errado, nested total ausente, null legítimo, três erros, formatação, permissão, company/year corretos e resposta alheia recusada; Todos=null; sem permissão/empresa nenhuma RPC. Totais sintéticos posicao.* deliberadamente diferentes da soma dos detalhes são apresentados sem recalcular. Históricos/cancelados da lista atual RPC validados e removidos do ecrã; RPC intocada.
Suite padrão primeira: 2905 PASS, um teste e um hook timeout PGlite em issue359-consent-guard-c/newgang-crm-profile-fields (mesmo timeout conhecido P4b). Não foram alterados/ignorados. Suite completa com --maxWorkers=2: 2916 PASS; após testes finais: 2923 PASS, 6 skipped, 11 todo, 297 ficheiros PASS/2 skipped. Comando bunx vitest run --maxWorkers=2; output integral /tmp/p6a-final-suite.log. Sem aumento de timeouts ou skips.
Tipos/build executados automaticamente pela plataforma: última entrada /tmp/observability/build-errors.log 16:48:31Z build OK. tsc/tsgo manual não executado por regra da plataforma.
Playwright local isolado, sem sessão/restauro/contas Live: fixture sintética do painel, desktop1280×1800/mobile390×844, estado saldos protegidos e footerP5; zero erros runtime, overflow mobile false. Screenshots /tmp/browser/p6a/{desktop,mobile,mobile-footer,hidden-balances}.png inspecionados. Ajustes ao harness (preamble/import cache) não alteraram aplicação.
Prova central RPC através de mock Vitest, não execução autenticada Live (proibida no despacho). Menu/rota wiring verificado em teste e guard renderizada sem/com permissão; ecrã completo com sessão real fica para a janela do 0/Pedro.

## CI e Publish
GitHub consultado HTTP200: main ainda 9fedd645..., CI40538174165 success nesse SHA de arranque. Nenhum CI remoto do 360a212.../fecho disponível; sincronização GitHub é da plataforma, sem git push manual. **Implementado, NÃO pronto para Publish até CI verde do SHA integrado.** Reserva de escrita libertada; acompanhamento remoto fica com controller/0.
Sem alteração RPC, migrations ou funções; nenhuma publicação.

## Questões/decisões em aberto
Nenhuma decisão nova do Pedro. Pendências técnicas: CI próprio após sincronização e verificação autenticada pelo 0/Pedro na janela; não foram apresentadas como concluídas. Questões anteriores P4 permanecem fora desta demanda.
## Adenda P6a-fix (27/10/2026, R1)

Problema (preview Live, manager): «A pagar» 1.012.494,59 = 947.790,71 por estágio + 64.703,88 transitórias; «A receber» 27.829,08 = 22.636,89 + 5.192,19. Os cartões liam `posicao.*`, que já inclui transitórias.

Correção: cartões leem `a_pagar.total` / `a_receber.total`; linha «+ transitórias de repasse: X €» com `transitorias.total` (só formatação). `posicao.a_pagar`/`posicao.a_receber` continuam validados no schema (fail-closed) mas não apresentados. Seletor de ano único: «Todos» (p_year null) + ano seguinte até 5 anos atrás; defeito ano corrente de Lisboa. `formatPositionAmount` com `useGrouping: "always"` (só este módulo): 4661,86 → «4 661,86 €».

Provas (vitest, src/test/financial-position-p6a-fix.test.tsx): (a) A pagar mostra 947.790,71 e não 1.012.494,59; (b) linha transitórias 64 703,88 €; (c) A receber 22.636,89, não 27.829,08, transitórias 5 192,19 €; (d) um único combobox, sem «Selecionar ano»/«Ano selecionado», «Todos» envia null; (e) 4 661,86 € / 1 162,19 € / 1 012 494,59 €; (f) a vista não contém reduce/somas nem posicao.a_pagar/a_receber. P6a+P6a-fix+P4+P4b+P1: 74/74. Suite completa: 2909 passaram; falhas só por tempo esgotado em testes PGlite/#333 sob carga, todas repetidas isoladas e verdes (146/146), exceto 2 sem ficheiro localizado (#359 migração C, «official transport») não repetidas.
