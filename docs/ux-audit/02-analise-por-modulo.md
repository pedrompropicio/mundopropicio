# 02 — Análise heurística por módulo

> Heurísticas usadas: Nielsen 1–10 + 5 critérios extra (redundâncias, terminologia, mobile, vazios, consistência visual).
> Cada problema tem ID `H-<módulo>-<n>` para cruzar com `04-priorizacao.md`.

---

## 0. Camadas globais (Sidebar + Header + Layout)

**Refs:** `src/components/AppSidebar.tsx`, `src/App.tsx:313-407`.

### Achados

- **H-GLB-1 — Sidebar colapsado em todo o desktop <1024px e em mobile (linha `lg:w-56`).** No tablet, a barra é só ícones e o utilizador depende totalmente do `title=` do anchor (tooltip nativo do browser, lento, sem styling). Não há drawer/menu hamburger em mobile — a sidebar fica permanente com 64 px ocupando área útil. Heurística: Reconhecimento vs memorização (#6), Estética minimalista (#8). [`AppSidebar.tsx:54`]
- **H-GLB-2 — 17 itens flat no sidebar sem agrupamento visual.** Eventos, Transações, Bilheteiras, Plano de Contas, Contas, Entidades, Cotações, IVA, Recorrentes, Reembolsos, Camarim, Relatórios, Admin… Sem separadores nem secções (comentário `// sections removed — flat list` em `AppSidebar.tsx:60`). Em mobile, requer scroll vertical. Heurística: Estética e minimalismo (#8), Flexibilidade (#7).
- **H-GLB-3 — Terminologia: rota `/fornecedores` mas label "Entidades".** Confunde busca, atalhos e suporte. [`AppSidebar.tsx:46`]
- **H-GLB-4 — Botão "Trocar módulo" duplicado:** existe `<ModuleSwitcherButton>` no header (`App.tsx:319`) **e** botão "Trocar módulo" no fundo do sidebar visível apenas a admin (`AppSidebar.tsx:88-95`). Mesma acção, dois sítios, regras diferentes (header é universal, sidebar restringe). Heurística: Consistência (#4).
- **H-GLB-5 — `ApprovedPaymentListReminder` (App.tsx:315) é um banner global modal-like que aparece no topo da página independentemente do contexto.** Nenhuma maneira óbvia de desativar/temporizar para utilizadores que não são aprovadores principais. Heurística: Controle e liberdade (#3).
- **H-GLB-6 — Estado de loading global ("A carregar…", `App.tsx:230`) é um texto pequeno centrado, sem skeletons, branding ou progressos.** Em redes lentas, o utilizador fica em ecrã vazio.
- **H-GLB-7 — `inactivity timeout` (30 min) e `MfaRequiredGate` desativado** (comentário em `App.tsx:330`: "MFA gate temporariamente desativado"). Conflito entre política declarada (memória `mfa-enforcement`) e implementação. Heurística: Visibilidade (#1) — utilizador admin não sabe que está descoberto.

---

## 1. Dashboard (`/` → `Index.tsx`, 549 ln)

### Achados
- **H-DSH-1 — Mistura grelha de eventos + ResultsAnalysis pesado** (`Index.tsx:15`). Dashboard demora a carregar porque traz vendas/transações/forecasts agregados. Heurística: Visibilidade (#1) — sem skeletons individuais por card.
- **H-DSH-2 — `overflow-x-auto` em `Index.tsx:477`** numa tabela de eventos. Em mobile, scroll horizontal é a estratégia padrão em vez de cards empilhados. Não há vista alternativa "cards" para mobile.
- **H-DSH-3 — Ausência de CTA para "Criar evento" no estado vazio** — dashboard sem eventos mostra apenas KPIs zero, sem onboarding. Heurística: Ajuda e documentação (#10).

---

## 2. Eventos (`/eventos`, `/eventos/:id`)

**Refs:** `Events.tsx` (1111 ln), `EventDetail.tsx` (1296 ln), `EventEditModal.tsx`.

### Achados
- **H-EVT-1 — `EventDetail` tem 10 abas** (`EventDetail.tsx:931-940`): Resumo, Bilheteira, Patrocínios, A&B, Cachê, Sócios, Business Plan, Overhead, Fecho, Simulador. Em mobile, esta TabsList faz scroll horizontal mas sem indicador de overflow. Heurística: Reconhecimento (#6) e Flexibilidade (#7).
- **H-EVT-2 — Nomenclatura mista nas abas:** "Cachê" (artista), "A&B" (alimentação e bebidas), "Overhead" (rateio), "Fecho" (closeout). Para um promotor júnior, "Overhead" e "Fecho" não são auto-explicativos. Há tooltips (`HelpTooltip`) mas não em todas (Patrocínios, A&B, Sócios, Fecho, Simulador não têm). Heurística: Correspondência mundo real (#2), Consistência (#4).
- **H-EVT-3 — Permissões mostram/escondem abas (`isAdmin || isManager`)** sem indicar ao utilizador comum que mais existe. Para FIN sem ser manager, o evento parece "menor" do que para ADM — comparações entre utilizadores ficam confusas em suporte. Heurística: Visibilidade (#1).
- **H-EVT-4 — Inline rename do evento** (memória `event-hierarchy-ui`) está em `Events.tsx`. Não há indicação visual que o nome é editável até hover. Em mobile (sem hover), descoberta fica zero.
- **H-EVT-5 — Master/Split** — diferenciação entre evento mãe e filhas é só por hierarquia visual (recuo) sem badge claro. Sócios sub-evento podem confundir-se com a mãe. Heurística: Reconhecimento (#6).

---

## 3. Simulador (`/eventos/:id/simulador`)

**Refs:** `EventSimulator.tsx` (**2316 ln**).

### Achados
- **H-SIM-1 — Tamanho monstruoso num só ficheiro.** Sintoma UX: muitos sub-painéis dependentes (BP, sponsors, cachê, A&B, BE, calibrador) numa página única sem navegação interna. Scroll é a única forma de navegar. Heurística: Flexibilidade (#7).
- **H-SIM-2 — KPI "Bilhetes únicos" foi removido** (memória `simulator-public-unit`) — bom. Mas o termo "Presenças × dia" ainda exige explicação para promotor que não viveu a transição. Heurística: Correspondência mundo real (#2).
- **H-SIM-3 — Calibrador de Boost** — UX exige conhecimento de "evento de referência" + "janela em dias". Sem assistente. Heurística: Ajuda (#10), Recuperação de erros (#9) se valor calibrado for absurdo.
- **H-SIM-4 — Card BE em modo `surplus`** (memória `simulator-be-surplus-mode`) não tem legenda visual diferenciando `surplus` vs `break-even` — depende de leitura cuidadosa do número.

---

## 4. Transações (`/transacoes`)

**Refs:** `Transactions.tsx` (**1557 ln**), `TransactionRow.tsx` (941 ln), `TransactionFiltersPanel.tsx`.

### Achados
- **H-TXN-1 — Estado da página tem 30+ `useState`** (`Transactions.tsx:38-78`). Filtros não são persistidos por utilizador — mudar de página perde tudo. Heurística: Flexibilidade (#7) — sem "filtros guardados".
- **H-TXN-2 — Tabela com `overflow-x-auto`** (`Transactions.tsx:1340, 1477`) em vez de cards em mobile. Linha de transação tem >10 colunas (descrição, valor, IVA, conta, evento, fornecedor, data, vencimento, status, anexos, ações). Heurística: Estética/minimalismo (#8) em mobile.
- **H-TXN-3 — `viewMode "open"|"paid"`** (`Transactions.tsx:39`) é um toggle textual mas afecta drasticamente o conjunto. Sem indicador "estás a ver X de Y transações". Heurística: Visibilidade (#1).
- **H-TXN-4 — Acções por linha:** Pagar, Editar, Eliminar, Aprovar, Histórico, Documentos, Lista pagamentos, BP — algumas só visíveis no menu de mais (kebab), outras como ícones. Inconsistência por estado (paid/pending). Heurística: Consistência (#4).
- **H-TXN-5 — Eliminação cascade** (`delete-transaction-cascade.ts`): mostra `deleteWarnings` mas o utilizador tem de ler texto longo + checkbox "compreendo". Sem preview do que vai ser apagado em árvore. Heurística: Prevenção de erros (#5).
- **H-TXN-6 — Reembolsos em listagem aparecem como linhas separadas** (mãe + filhas) — origem do toggle de consolidação pedido em iteração anterior. Confirma confusão. Memória existente: `payment-timeline-unified-view`.
- **H-TXN-7 — `window.confirm()` ainda usado em vários sítios** (51 ocorrências em `src/pages` + `src/components`). Inconsistente com `<AlertDialog>` shadcn usado nos modais novos. Heurística: Consistência (#4) e Estética (#8).

---

## 5. Recorrentes (`/recorrentes`)

**Refs:** `RecurringTransactions.tsx` (648 ln).

### Achados
- **H-REC-1 — Sem IVA em templates** (memória `recurring-transactions-management`) — correcto, mas página não explica isto até o utilizador tentar adicionar. Heurística: Prevenção de erros (#5).
- **H-REC-2 — Periodicidade representada com Select sem preview do calendário** — utilizador não vê quando vão cair as próximas execuções.

---

## 6. Reembolsos (`/reembolsos`)

**Refs:** `Reimbursements.tsx`, `ReimbursementNoteDetail.tsx` (605 ln), `ReimbursementNoteFormModal.tsx`.

### Achados
- **H-REM-1 — Drill-in via `setSelectedNoteId`** (`Reimbursements.tsx:103`) substitui a página inteira em vez de usar rota — perde-se o url para partilha (ex: enviar link da nota a um aprovador). Heurística: Controle (#3).
- **H-REM-2 — `gross_total` calculado client-side** (linha 81) — somatório só acontece após query carregar. Em listagens grandes pode mostrar zero brevemente. Heurística: Visibilidade (#1).
- **H-REM-3 — `window.confirm("Eliminar esta nota?")`** em `Reimbursements.tsx:179`. Sem preview de itens consequentes. Heurística: Prevenção (#5).
- **H-REM-4 — Voltar para Transações:** botão `Voltar` (linha 112) usa `sessionStorage` para `returnScrollY` — frágil em refresh, perde estado se utilizador tiver muitos separadores.
- **H-REM-5 — Filtros (status + busca) repintam a tabela inteira sem paginação** — para >200 notas, mobile sofre.
- **H-REM-6 — "Conta mãe / contas filhas"** — terminologia que NÃO existe no schema (model real é `reimbursement_notes` ↔ `reimbursement_note_items` ↔ `transactions`). Risco identificado em iteração anterior — referência vai para `04`.

---

## 7. Camarim (`/camarim`, `/camarim/:id`)

**Refs:** `Camarim.tsx`, `CamarimSessionDetail.tsx` (1232 ln).

### Achados
- **H-CAM-1 — Sessão integrada read-only** (memória `camarim-integration-lock`) — cartão informativo existe, mas botão "Ver transações geradas" abre nova página em vez de drawer. Quebra contexto. Heurística: Controle (#3).
- **H-CAM-2 — Avisos de fecho** (`CamarimSessionDetail.tsx:353-384`) são longos, em prosa, sem hierarquia visual nem badges. Difíceis de ler em mobile. Heurística: Estética (#8).
- **H-CAM-3 — IVA snap automático** {0,6,13,23} — utilizador não vê o que vai ser snapped até abrir transação. Heurística: Visibilidade (#1).
- **H-CAM-4 — Duas abas (Itens, Fundos)** sem indicação de qual exige acção (badges de pendência). Heurística: Visibilidade (#1).

---

## 8. Bilheteiras (`/bilheteiras`)

**Refs:** `TicketOffices.tsx` (482 ln), `TicketOfficeSettlementModal.tsx`, `FeverImportModal.tsx`.

### Achados
- **H-BIL-1 — Importação Fever / Coala / Ticketline** — três wizards distintos com fluxos diferentes. Utilizador novo precisa decorar qual usar. Heurística: Consistência (#4).
- **H-BIL-2 — Fecho de bilheteira** (memória `ticket-office-settlement`) tem múltiplos campos opcionais (líquido auto/ajustável, transferência, anexo) sem agrupamento visual claro. Heurística: Estética (#8).
- **H-BIL-3 — Adiantamentos** (memória `ticket-office-advances`) registados por evento, mas UI mistura adiantamento por evento com saldo de conta — confusão semântica.

---

## 9. Cadastros (Contas, Plano, Entidades, Cotações, IVA)

### Achados
- **H-CAD-1 — `FinancialAccounts.tsx` (617 ln)** — flag `is_hidden` para "Eventos Históricos" (memória `financial-accounts-hidden-flag`) é silenciosa: utilizador procura conta e não a vê, sem hint de "X contas escondidas". Heurística: Visibilidade (#1).
- **H-CAD-2 — Plano de contas (L1>L2>L3)** — só L3 é selecionável (Core rule), mas a árvore não desabilita visualmente L1/L2 nos pickers usados em transações. Heurística: Prevenção (#5), Reconhecimento (#6).
- **H-CAD-3 — `Suppliers.tsx` (label "Entidades")** — mistura fornecedores, parceiros (`is_partner`), funcionários (para reembolsos) numa só lista. Sem facetas/filtros prominentes por tipo.
- **H-CAD-4 — `IvaManagement.tsx` (501 ln)** tem 3 tabelas com `overflow-x-auto` (linhas 390/431/462). Mobile fica intransitável.
- **H-CAD-5 — Cotações** isoladas — não ligam de volta às transações criadas a partir delas (sem badge "✓ usada em tx X").

---

## 10. Relatórios (`/relatorios/*` — 33 sub-rotas)

**Refs:** `Reports.tsx` (222 ln).

### Achados
- **H-REL-1 — 33 relatórios em 5 grupos** — em desktop é navbar lateral fixa de 56px (`Reports.tsx:183`). Em mobile vira `<Select>` (linha 146) — bom, mas Select com 33 itens + cabeçalhos de grupo é difícil de pesquisar. Sem campo de busca. Heurística: Flexibilidade (#7).
- **H-REL-2 — Permissões por relatório** (`view_report_dre`, `view_report_pl`, etc.) — bom, mas o agrupamento "Estratégicos" só aparece se utilizador tiver pelo menos 1; sem estado vazio explicativo se grupo inteiro for filtrado. Heurística: Visibilidade (#1).
- **H-REL-3 — Nomes pouco escaneáveis:** "Auditoria Bilheteiras", "Auditoria de IVA", "Pendências Documentais", "Índice de Pendências" — termos sobrepostos, utilizador hesita. Heurística: Reconhecimento (#6).
- **H-REL-4 — Sem dashboard "favoritos"** — utilizador que usa 3 relatórios diariamente tem de abrir o menu sempre. Heurística: Eficiência (#7).
- **H-REL-5 — Exports (PDF/CSV)** estão dentro de cada relatório com botões diferentes (alguns "Exportar PDF", outros "Imprimir", outros ícone só) — inconsistência visível. Heurística: Consistência (#4).

---

## 11. Aprovação (transversal — sem rota dedicada)

### Achados
- **H-APR-1 — Não existe centro de aprovações.** Aprovador acumula trabalho disperso entre `/transacoes?status=pending`, `/reembolsos?status=approved`, `ApprovedPaymentListReminder` (banner) e `payment_lists` em outro lado. Heurística: Visibilidade (#1), Eficiência (#7). **Quick Win Estrutural.**
- **H-APR-2 — Badge PWA conta apenas `payment_lists.pending_approval`** (memória `app-icon-badge`) — outras pendências (transações pending, reembolsos pending_payment) ficam sem indicador.
- **H-APR-3 — Aprovação em lote** (`BatchPaymentModal`) existe para pagamento mas não para aprovação simples. Heurística: Eficiência (#7).
- **H-APR-4 — Reabertura de aprovação** — não há botão claro "rejeitar/devolver" — só editar→guardar volta ao pending implicitamente. Heurística: Recuperação (#9).

---

## 12. Admin

**Refs:** `AdminPanel.tsx`, 13 sub-páginas, `AuditoriaContas.tsx` (1566 ln), `FormalidadeAudit.tsx` (662 ln).

### Achados
- **H-ADM-1 — `/admin` é um índice plano** — 13 cards/links sem prioridade visual nem agrupamento (segurança vs operações vs catálogos vs auditoria).
- **H-ADM-2 — `AuditoriaContas` (1566 ln) com 2 abas (IA, Reordenar)** — abas têm pesos muito diferentes (IA é heurística, Reordenar é cirúrgico). Sem onboarding diferencial. Heurística: Reconhecimento (#6).
- **H-ADM-3 — Backups** — UI "Nenhum backup encontrado" sem CTA para "executar backup manual agora" (se permitido). Heurística: Ajuda (#10).
- **H-ADM-4 — Trash retention 30 dias** — UI mostra entidades em JSON colapsável (`Trash.tsx:261-267`) — utilizador não-técnico vê código.
- **H-ADM-5 — `RlsLegacyAudit`** — relatório técnico exposto sem glossário. Útil para Pedro mas hostil para qualquer outro admin.

---

## 13. Mobile — problemas transversais

| Problema | Onde | Heurística |
|---|---|---|
| Tabelas com scroll-x em vez de cards | `Transactions`, `Index`, `IvaManagement`, `UserManagement`, `ReportSuppliers` | Estética (#8) |
| Sidebar fixa 64px sem drawer | `AppSidebar.tsx:54` | Eficiência (#7) |
| Tooltips só `title=` HTML em mobile | sidebar, ícones de acções | Reconhecimento (#6) |
| Modais (Dialog) com `max-w-lg` que estoura em telemóveis < 360px | shadcn default `dialog.tsx:32` | Estética (#8) |
| `EventDetail` 10 abas com scroll horizontal sem indicador | `EventDetail.tsx:923` | Visibilidade (#1) |
| `CamarimSessionDetail` mensagens longas em prosa | linhas 353–384 | Estética (#8) |
| `Reports` Select com 33 itens em mobile sem busca | `Reports.tsx:146` | Eficiência (#7) |

---

## 14. Consistência visual / padrões

- **Botões primários:** misto entre `<Button size="sm">` (shadcn) e `<button className="rounded-lg ...">` ad-hoc (ex: `Reimbursements.tsx` filtros).
- **Confirmações destrutivas:** misto entre `window.confirm` (51 usos) e `<AlertDialog>` (Transactions, EventEdit, etc.).
- **Toast feedback:** 545 usos de `toast({...})` — bom volume, mas sem padronização de variante/cor por tipo de acção (success, error, warning, info).
- **Empty states:** maioria é texto cinzento centrado ("Nenhum X encontrado") sem CTA; excepções com botão são poucas. Heurística: Ajuda (#10).
- **Datas:** mistura `format(new Date(t.date), "dd/MM/yyyy")` e helpers `formatDate()` — risco de fuso (memória `date-processing-standard`).

---

## 15. Terminologia / glossário em falta

Termos que aparecem sem definição inline e exigem conhecimento prévio (não cobertos por `HelpTooltip`):

| Termo | Onde | Persona afectada |
|---|---|---|
| "Master / Split" | EventDetail, BP | PRO júnior |
| "Overhead" | Aba do EventDetail | PRO, FIN |
| "Rateio" / "Apportionment" | BP, Master | FIN |
| "Cachê" vs "Garantido vs Capacidade" | Aba Cachê | PRO |
| "Formalidade" (fechado, em negociação, etc.) | BP, FormalidadeAudit | PRO |
| "BP" (Business Plan) | em todo o lado | novo utilizador |
| "Conta mãe / contas filhas" (reembolsos) | brief externo | termo NÃO existe no produto — risco terminológico crítico |
| "Implantação" | `/admin/implantacao` | qualquer um (significa "importação histórica") |
| "Camarim" | módulo | utilizador novo (espera "rider"/"hospitality") |

---

## 16. Resumo por persona

### Promotor (PRO)
- Dor primária: **EventDetail com 10 abas** + Simulador 2316 linhas + ausência de "wizard" para criar evento do zero (H-EVT-1, H-EVT-2, H-SIM-1).
- Mobile: tabelas em vez de cards, scroll em todo o lado.

### Financeiro (FIN)
- Dor primária: **`/transacoes` denso, sem filtros guardados, mistura reembolsos sem consolidação, exclusão complexa, scroll horizontal em mobile** (H-TXN-1, H-TXN-2, H-TXN-5, H-TXN-6).
- Camarim: avisos de fecho difíceis (H-CAM-2).

### Aprovador (APR)
- Dor primária: **falta de centro de aprovações unificado** (H-APR-1) + badge PWA cobre só uma das fontes (H-APR-2) + sem aprovação em lote (H-APR-3).

### Admin (ADM)
- Dor primária: `/admin` plano com 13 ferramentas misturadas (H-ADM-1) + módulos técnicos sem glossário (H-ADM-5) + MFA gate desativado a contradizer política (H-GLB-7).
