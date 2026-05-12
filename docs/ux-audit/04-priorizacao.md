# 04 — Priorização Impacto × Esforço

> Compilação de TODOS os achados de `02` e `03`.
> **Impacto:** Alto = afecta ≥3 personas no dia-a-dia; Médio = 1-2 personas frequente; Baixo = esporádico.
> **Esforço:** Baixo = horas a 1 dia; Médio = 2-5 dias; Alto = >5 dias / refactor.

## Tabela mestre

| ID | Achado | Persona | Impacto | Esforço | Categoria |
|----|--------|---------|---------|---------|-----------|
| H-APR-1 | Criar Centro de Aprovações unificado (`/aprovacoes`) que agrega `transactions.pending` + `reimbursement_notes.approved` + `payment_lists.pending_approval` | APR | **Alto** | Médio | **Estrutural** |
| H-APR-2 | Estender badge PWA para somar todas as fontes de aprovação | APR | Alto | Baixo | Quick Win |
| H-APR-3 | Aprovação em lote para transações `pending` | APR, FIN | Alto | Médio | Estrutural |
| H-APR-4 | Acção "Rejeitar com motivo" em transações/reembolsos | APR | Médio | Baixo | Quick Win |
| H-TXN-1 | Persistir filtros/sort de `/transacoes` por utilizador (localStorage ou `user_preferences`) | FIN, APR | Alto | Baixo | Quick Win |
| H-TXN-2 | Vista cards em mobile para tabela de transações | FIN | Alto | Médio | Estrutural |
| H-TXN-3 | KPI "X de Y transações" sempre visível | FIN | Médio | Baixo | Quick Win |
| H-TXN-4 | Padronizar acções por linha (kebab vs ícones) | FIN | Médio | Médio | Polimento |
| H-TXN-5 | Preview em árvore antes de eliminar com cascade | FIN, ADM | Alto | Médio | Estrutural |
| H-TXN-6 | Toggle de consolidação de reembolsos (já planeado em iteração anterior) | FIN | Alto | Médio | Estrutural |
| H-TXN-7 | Substituir `window.confirm` (51 usos) por `<AlertDialog>` | todas | Médio | Médio | Polimento |
| H-EVT-1 | Reorganizar 10 abas do EventDetail em 2 níveis (Planeamento / Execução / Fecho) | PRO | Alto | Alto | Estrutural |
| H-EVT-2 | Tooltips em todas as abas + glossário inline (Overhead, Fecho, A&B) | PRO | Médio | Baixo | Quick Win |
| H-EVT-3 | Mostrar abas escondidas como "🔒 Sócios (requer manager)" em vez de omitir | todas | Baixo | Baixo | Quick Win |
| H-EVT-4 | Adicionar ícone "✏️" persistente no nome do evento (não só hover) | PRO | Baixo | Baixo | Quick Win |
| H-EVT-5 | Badge `[MASTER]` / `[SPLIT — cidade X]` claro no header do EventDetail | PRO | Médio | Baixo | Quick Win |
| H-SIM-1 | Adicionar índice/anchors lateral no Simulador (mini-TOC sticky) | PRO | Alto | Médio | Estrutural |
| H-SIM-3 | Wizard inicial para Calibrador de Boost (escolher evento, janela default) | PRO | Médio | Médio | Polimento |
| H-SIM-4 | Cor/ícone diferenciador para BE em modo `surplus` | PRO | Baixo | Baixo | Quick Win |
| H-DSH-1 | Skeletons individuais por card no dashboard | todas | Médio | Baixo | Quick Win |
| H-DSH-2 | Vista cards mobile para grelha de eventos | todas | Médio | Médio | Polimento |
| H-DSH-3 | CTA "Criar primeiro evento" no estado vazio do dashboard | PRO novo | Médio | Baixo | Quick Win |
| H-REM-1 | Migrar drill-in de reembolso para rota `/reembolsos/:id` (URL partilhável) | FIN | Médio | Baixo | Quick Win |
| H-REM-2 | Calcular `gross_total` no servidor (view ou RPC) | FIN | Baixo | Médio | Polimento |
| H-REM-3 | `<AlertDialog>` para eliminação de notas com preview de itens | FIN | Médio | Baixo | Quick Win |
| H-REM-4 | Substituir `sessionStorage` de scroll por React state ou query param | FIN | Baixo | Baixo | Polimento |
| H-REM-5 | Paginação ou virtualização da lista de notas | FIN | Baixo | Médio | Polimento |
| H-REM-6 | Documentar terminologia "nota mãe / itens filhos" no help interno e UI | todas | Médio | Baixo | Quick Win |
| H-CAM-1 | Drawer "Transações geradas" em vez de nova página | FIN | Médio | Médio | Polimento |
| H-CAM-2 | Avisos de fecho em formato de checklist com badges (✓ / ⚠ / ✗) | FIN | Médio | Baixo | Quick Win |
| H-CAM-3 | Mostrar IVA snap previsto antes de fechar a sessão | FIN | Baixo | Médio | Polimento |
| H-CAM-4 | Badges de pendência nas tabs Itens/Fundos | FIN | Baixo | Baixo | Quick Win |
| H-BIL-1 | Unificar 3 wizards de import em 1 com seletor de operador no passo 1 | FIN | Alto | Alto | Estrutural |
| H-BIL-2 | Reorganizar campos do fecho de bilheteira em accordions (essenciais / opcionais) | FIN | Médio | Baixo | Quick Win |
| H-BIL-3 | Separar visualmente "adiantamento por evento" de "saldo de conta" | FIN | Médio | Baixo | Quick Win |
| H-CAD-1 | Hint "X contas escondidas — mostrar" abaixo da lista de contas | ADM, FIN | Baixo | Baixo | Quick Win |
| H-CAD-2 | Desabilitar visualmente L1/L2 nos pickers de plano de contas | FIN | **Alto** | Baixo | **Quick Win** |
| H-CAD-3 | Facetas (chips) por tipo de entidade em `/fornecedores` | FIN, ADM | Médio | Médio | Polimento |
| H-CAD-4 | Vista cards mobile para tabelas IVA | FIN | Médio | Médio | Polimento |
| H-CAD-5 | Badge "✓ usada em N transações" em cotações | FIN | Baixo | Baixo | Polimento |
| H-REL-1 | Campo de busca no topo do menu de relatórios (desktop e mobile) | todas | Alto | Baixo | Quick Win |
| H-REL-2 | Estado vazio explicativo quando grupo de relatórios está vazio por permissão | ADM, novos | Baixo | Baixo | Polimento |
| H-REL-3 | Renomear relatórios sobrepostos (Auditoria IVA vs Pendências…) com prefixos | todas | Médio | Baixo | Quick Win |
| H-REL-4 | "Relatórios favoritos" pinned por utilizador | FIN, APR | Médio | Médio | Polimento |
| H-REL-5 | Padronizar botão "Exportar" (componente partilhado) | todas | Médio | Médio | Polimento |
| H-ADM-1 | Reorganizar `/admin` em 4 secções (Catálogos · Segurança · Operações · Auditoria) | ADM | Médio | Baixo | Quick Win |
| H-ADM-2 | Onboarding diferenciado para abas IA vs Reordenar em AuditoriaContas | ADM | Baixo | Baixo | Polimento |
| H-ADM-3 | CTA "Executar backup manual" se permitido | ADM | Baixo | Baixo | Quick Win |
| H-ADM-4 | Vista "humana" (não-JSON) do conteúdo da Trash | ADM | Baixo | Médio | Polimento |
| H-ADM-5 | Glossário em `RlsLegacyAudit` | ADM | Baixo | Baixo | Polimento |
| H-GLB-1 | Drawer móvel hamburger + sidebar tooltips estilo shadcn | todas | **Alto** | Médio | **Estrutural** |
| H-GLB-2 | Reagrupar sidebar em secções (Operações · Cadastros · Relatórios · Admin) | todas | Médio | Baixo | Quick Win |
| H-GLB-3 | Renomear rota `/fornecedores` → `/entidades` (com redirect) | todas | Baixo | Baixo | Polimento |
| H-GLB-4 | Resolver duplicação Module Switcher (header vs sidebar) — manter um só | ADM | Baixo | Baixo | Quick Win |
| H-GLB-5 | Banner `ApprovedPaymentListReminder` com botão dispensar/snooze | APR | Médio | Baixo | Quick Win |
| H-GLB-6 | Skeletons + branding no loading global | todas | Baixo | Baixo | Polimento |
| H-GLB-7 | Reactivar `MfaRequiredGate` ou alinhar com memória `mfa-enforcement` | ADM | **Alto** | Baixo | **Quick Win** |
| H-REC-1 | Aviso "Templates não geram IVA" no header de Recorrentes | FIN | Baixo | Baixo | Quick Win |
| H-REC-2 | Mini-calendário "próximas 3 execuções" ao escolher periodicidade | FIN | Baixo | Médio | Polimento |
| TXT-MOB | Modais shadcn `max-w-lg` ajustar para `w-[95vw]` em < 360 px | todas mobile | Médio | Baixo | Quick Win |
| TXT-DAT | Auditar usos `new Date(t.date)` vs helpers `formatDate` (risco fuso) | FIN, ADM | Baixo | Médio | Polimento |
| TXT-EMP | Padronizar componente `<EmptyState icon title description cta />` para todos os "Nenhum X encontrado" | todas | Médio | Médio | Polimento |
| TXT-TST | Tipar variantes de toast (success/error/warning/info) e auditar 545 usos | todas | Baixo | Médio | Polimento |

---

## Visão consolidada por categoria

### 🚀 Quick Wins (impacto alto/médio, esforço baixo) — implementar primeiro

| ID | Resumo | Impacto |
|----|--------|---------|
| H-CAD-2 | Desabilitar L1/L2 no picker de plano de contas | **Alto** |
| H-GLB-7 | Reactivar MFA gate ou alinhar política | **Alto** |
| H-REL-1 | Busca no menu de relatórios | **Alto** |
| H-APR-2 | Badge PWA agregar todas as fontes de aprovação | **Alto** |
| H-TXN-1 | Persistir filtros de transações | **Alto** |
| H-EVT-2 | Tooltips/glossário em todas as abas | Médio |
| H-EVT-5 | Badge MASTER/SPLIT no header | Médio |
| H-REL-3 | Renomear relatórios sobrepostos | Médio |
| H-CAM-2 | Avisos de fecho como checklist | Médio |
| H-BIL-2 | Accordions no fecho de bilheteira | Médio |
| H-DSH-3 | CTA estado vazio dashboard | Médio |
| H-REM-3 | AlertDialog na eliminação de notas | Médio |
| H-REM-6 | Documentar terminologia mãe/filhas | Médio |
| H-ADM-1 | Reagrupar `/admin` | Médio |
| H-GLB-2 | Reagrupar sidebar em secções | Médio |
| H-GLB-5 | Snooze/dismiss banner aprovações | Médio |
| H-APR-4 | "Rejeitar com motivo" | Médio |

### 🏗 Estruturais (impacto alto, esforço médio/alto)

| ID | Resumo | Esforço |
|----|--------|---------|
| H-APR-1 | Centro de Aprovações unificado | Médio |
| H-APR-3 | Aprovação em lote | Médio |
| H-TXN-2 | Vista cards mobile transações | Médio |
| H-TXN-5 | Preview árvore eliminação cascade | Médio |
| H-TXN-6 | Toggle consolidação reembolsos | Médio |
| H-EVT-1 | Reorganizar 10 abas EventDetail | **Alto** |
| H-SIM-1 | TOC sticky no Simulador | Médio |
| H-BIL-1 | Unificar 3 wizards de import bilheteira | **Alto** |
| H-GLB-1 | Drawer móvel + responsivo geral | Médio |

### ✨ Polimento (impacto médio/baixo, esforço variável)

Restantes: H-TXN-4/7, H-EVT-3/4, H-SIM-3/4, H-DSH-1/2, H-REM-2/4/5, H-CAM-1/3/4, H-BIL-3, H-CAD-1/3/4/5, H-REL-2/4/5, H-ADM-2/3/4/5, H-GLB-3/4/6, H-REC-1/2, TXT-*.

---

## Recomendação de roadmap (proposta)

**Sprint 1 (Quick Wins críticos, ~1 semana)**
H-CAD-2, H-GLB-7, H-REL-1, H-APR-2, H-TXN-1, H-EVT-5, H-REM-6, H-DSH-3.

**Sprint 2 (Quick Wins UX, ~1 semana)**
H-EVT-2, H-REL-3, H-CAM-2, H-BIL-2, H-REM-3, H-ADM-1, H-GLB-2, H-GLB-5, H-APR-4.

**Sprint 3-4 (Estrutural — Aprovações, ~2 semanas)**
H-APR-1, H-APR-3, H-TXN-5.

**Sprint 5-6 (Estrutural — Mobile, ~2 semanas)**
H-GLB-1, H-TXN-2, H-DSH-2, H-CAD-4, TXT-MOB.

**Sprint 7-8 (Estrutural — Eventos, ~2 semanas)**
H-EVT-1, H-SIM-1.

**Backlog contínuo:** Polimento conforme aparece em sprints temáticas.
