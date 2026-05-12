# 00 — Sumário Executivo

**Projecto:** MP Gestão Eventos · auditoria UX/UI · Maio 2026
**Escopo:** módulo Gestão (MP Audience excluído). 4 personas: Promotor, Financeiro, Aprovador, Admin.
**Método:** análise heurística (Nielsen + 5 critérios extra) + walkthrough de 7 fluxos críticos · sem alterações ao código.
**Entregáveis:** 6 ficheiros markdown em `/docs/ux-audit/`.

---

## Visão geral

A aplicação tem **fundações sólidas**: design system coerente (dark + Space Grotesk + Blue/Lime), tooltips de ajuda em pontos sensíveis (112 ocorrências), feedback abundante via toasts (545), e arquitectura modular por permissões. O sidebar lateral, o sistema de relatórios agrupados e o controle de acesso por role estão acima da média de produtos internos.

O risco principal está em **3 dimensões**:

1. **Sobrecarga em páginas críticas** — 5 ficheiros ultrapassam 1000 linhas (`EventSimulator` 2316, `AuditoriaContas` 1566, `Transactions` 1557, `EventDetail` 1296 com 10 abas, `CamarimSessionDetail` 1232). Sintoma UX: navegação por scroll, modais sobre tabelas longas, e curva de aprendizagem alta.
2. **Mobile tratado como afterthought** — sidebar de 64px sempre presente sobre conteúdo, tabelas com `overflow-x-auto` em vez de cards, modais com `max-w-lg` que estouram em telemóveis pequenos. Personas APR e FIN sofrem mais.
3. **Aprovação dispersa** — não existe um centro de aprovações. O aprovador alterna entre `/transacoes?status=pending`, `/reembolsos?status=approved`, listas de pagamento embebidas e o banner global `ApprovedPaymentListReminder`. O badge PWA cobre apenas 1 das 3 fontes.

Há ainda **inconsistências táticas acumuladas** ao longo do tempo: 51 usos de `window.confirm` coexistindo com `<AlertDialog>` shadcn; rotulagem `/fornecedores` exibindo "Entidades"; module switcher duplicado entre header e sidebar; `MfaRequiredGate` desativado em produção apesar da política declarada (memória `mfa-enforcement`).

---

## Top 10 problemas mais críticos

> Ordem por impacto × frequência. Detalhe completo em `02-analise-por-modulo.md` e `04-priorizacao.md`.

| # | ID | Problema | Personas | Impacto |
|---|----|----------|----------|---------|
| 1 | H-APR-1 | Não existe centro de aprovações — aprovador alterna entre 3+ páginas | APR, FIN | Alto |
| 2 | H-EVT-1 | EventDetail com 10 abas heterogéneas (`Resumo, Bilheteira, Patrocínios, A&B, Cachê, Sócios, BP, Overhead, Fecho, Simulador`) — sobrecarga cognitiva | PRO, FIN | Alto |
| 3 | H-GLB-1 | Mobile sem drawer/hamburger; sidebar 64 px sempre sobre conteúdo; tooltips só `title=` HTML | todas | Alto |
| 4 | H-TXN-2 | `/transacoes` em mobile usa `overflow-x-auto` numa tabela com 10+ colunas; sem vista cards | FIN, APR | Alto |
| 5 | H-CAD-2 | Picker do plano de contas permite seleccionar L1/L2 visualmente, mas Core rule diz "Only L3" — falha só no save | FIN | Alto |
| 6 | H-BIL-1 | 3 wizards distintos para importar bilheteira (Fever, Coala, Ticketline) com fluxos diferentes | FIN | Alto |
| 7 | H-TXN-1 | Filtros e sort de `/transacoes` não persistem por utilizador — perde-se ao trocar de página | FIN, APR | Alto |
| 8 | H-GLB-7 | `MfaRequiredGate` desactivado em código (App.tsx:330) apesar de política `mfa-enforcement` declarar admin obrigatório | ADM | Alto |
| 9 | H-REL-1 | Menu de relatórios sem campo de busca; mobile usa `<Select>` com 33 itens | todas | Alto |
| 10 | H-APR-3 | Aprovação em lote só existe para pagamento (`BatchPaymentModal`), não para mudar status de `pending` → `approved` | APR | Alto |

---

## Top 5 Quick Wins recomendados

> Alto impacto, esforço estimado em horas a 1 dia. Implementáveis na próxima sprint.

| # | ID | Quick Win | Onde |
|---|----|-----------|------|
| 1 | H-APR-2 | Estender badge PWA para somar todas as fontes (`payment_lists.pending_approval` + `transactions.pending` + `reimbursement_notes.pending_payment`) | `src/lib/app-badge.ts` |
| 2 | H-CAD-2 | Desabilitar visualmente L1/L2 no picker de plano de contas usado em `TransactionFormModal` e `EventForecast` | `src/components/CategoryFormModal.tsx` + pickers consumidores |
| 3 | H-REL-1 | Adicionar `<Input>` de busca filtrando os 33 relatórios em `Reports.tsx` (desktop e mobile) | `src/pages/Reports.tsx` (top do menu) |
| 4 | H-TXN-1 | Persistir filtros (`viewMode`, `filter`, `selectedAccountIds`, etc.) em `localStorage` por utilizador | `src/pages/Transactions.tsx:38-78` |
| 5 | H-GLB-7 | Decidir e alinhar: ou reactivar `MfaRequiredGate` em `App.tsx:330` ou actualizar memória `mfa-enforcement` | `src/App.tsx:330` |

---

## Roadmap sugerido (8 sprints)

| Sprint | Foco | IDs principais |
|--------|------|----------------|
| 1 | Quick Wins críticos | H-CAD-2, H-GLB-7, H-REL-1, H-APR-2, H-TXN-1, H-EVT-5, H-REM-6, H-DSH-3 |
| 2 | Quick Wins UX | H-EVT-2, H-REL-3, H-CAM-2, H-BIL-2, H-REM-3, H-ADM-1, H-GLB-2, H-GLB-5, H-APR-4 |
| 3-4 | Estrutural — Aprovações | H-APR-1, H-APR-3, H-TXN-5 |
| 5-6 | Estrutural — Mobile | H-GLB-1, H-TXN-2, H-DSH-2, H-CAD-4 |
| 7-8 | Estrutural — Eventos & Simulador | H-EVT-1, H-SIM-1 |

Backlog contínuo: 30+ itens de Polimento (ver `04-priorizacao.md`).

---

## Próximos passos

1. **Capturar as 30 telas prioritárias** indicadas em `05-checklist-screenshots.md` (lista marcada).
2. **Validar a priorização** em `04` com stakeholders antes de iniciar Sprint 1.
3. **Decidir formato de entrega final** (PDF executivo, Notion, Linear) — este conjunto de markdowns é a fonte canónica.
4. **Confirmar política MFA** (H-GLB-7) — bloqueador de baixo esforço mas implicação de segurança imediata.

---

## Ficheiros do dossier

- `00-sumario-executivo.md` (este)
- `01-inventario.md` — rotas, módulos, mapa persona × módulo
- `02-analise-por-modulo.md` — análise heurística com IDs
- `03-fluxos-criticos.md` — 7 fluxos end-to-end
- `04-priorizacao.md` — tabela Impacto × Esforço + roadmap
- `05-checklist-screenshots.md` — 103 capturas pedidas, agrupadas por módulo
