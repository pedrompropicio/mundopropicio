# 01 — Inventário de Rotas e Módulos

> Escopo: módulo **Gestão de Eventos** (MP Gestão Eventos). MP Audience excluído deliberadamente.
> Fonte: `src/App.tsx` (linhas 332–402), `src/components/AppSidebar.tsx`, `src/pages/Reports.tsx`.

## Personas analisadas

| Sigla | Persona | Permissões-chave (referência `MANAGEMENT_PERMS` em `App.tsx:141-159`) |
|------|---------|----------------------------------------------------------------------------|
| **PRO** | Promotor (criador de eventos) | `manage_events`, `view_events`, `manage_calendar` |
| **FIN** | Financeiro (lança despesas, gera reembolsos) | `manage_transactions`, `manage_recurring`, `manage_quotations` |
| **APR** | Aprovador (autoriza pagamentos/listas) | `manage_payment_lists`, `view_balances`, `edit_approved_bp` |
| **ADM** | Admin (configurações, contas, permissões) | `isAdmin === true` (todas) |

> Existem ainda dois sub-perfis observados no código mas fora de foco neste relatório:
> - **Camarim-only** (`isCamarimOnly` em `App.tsx:161-162`) — redirecionado para `/camarim-equipa`.
> - **Sócio/Partner** (`isPartner`) — redirecionado para `/parceiro/*` (PartnerLayout).
>   Estes recebem análise leve apenas onde tocam fluxos das 4 personas principais.

---

## Lista completa de rotas (Gestão)

### A. Rotas públicas / autenticação
| Rota | Componente | Notas |
|------|------------|-------|
| `/login` | `Auth` | Login + sign-up |
| `/reset-password` | `ResetPassword` | Recuperação |
| `/accept-invitation` | `AcceptInvitation` | Onboarding por convite |
| `/privacy`, `/terms`, `/about` | `legal/*` | Estáticas |
| `/unsubscribe` | `Unsubscribe` | Saída de notificações |

### B. Operacional (núcleo diário)
| Rota | Componente (linhas) | Personas |
|------|---------------------|----------|
| `/` → `Index` | `Index.tsx` (549 ln) | PRO, FIN, APR, ADM |
| `/erp` | alias do dashboard | todas |
| `/calendario` | `EventCalendar.tsx` (717 ln) | PRO |
| `/eventos` | `Events.tsx` (1111 ln) | PRO, FIN, APR |
| `/eventos/:id` | `EventDetail.tsx` (1296 ln, **10 abas**) | PRO, FIN, APR, ADM |
| `/eventos/:id/simulador` | `EventSimulator.tsx` (**2316 ln**) | PRO |
| `/demo/simulador` | `EventSimulatorDemo.tsx` | onboarding/PRO |
| `/transacoes` | `Transactions.tsx` (**1557 ln**) | FIN, APR, ADM |
| `/recorrentes` | `RecurringTransactions.tsx` (648 ln) | FIN |
| `/reembolsos` | `Reimbursements.tsx` | FIN, APR |
| `/camarim` | `Camarim.tsx` | FIN/Operações |
| `/camarim/:id` | `CamarimSessionDetail.tsx` (1232 ln) | FIN/Operações |
| `/bilheteiras` (alias `/bilhetes`) | `TicketOffices.tsx` | FIN, PRO |

### C. Cadastros
| Rota | Componente | Personas |
|------|-----------|----------|
| `/contas` | `FinancialAccounts.tsx` (617 ln) | ADM, APR |
| `/plano-contas` | `AccountCategories.tsx` | ADM |
| `/fornecedores` (label "Entidades") | `Suppliers.tsx` | FIN, ADM |
| `/cotacoes` | `Quotations.tsx` | FIN |
| `/iva` | `IvaManagement.tsx` (501 ln) | FIN, ADM |

### D. Relatórios (sub-rotas de `/relatorios`, ver `Reports.tsx:54-116`)
**33 relatórios** organizados em 5 grupos:
- **Estratégicos** (7): DRE, DRE Empresarial, DRE Brasil, Business Plan, Rentabilidade, Evolução Mensal, Desvio Orçamental
- **Financeiros** (7): Fluxo de Caixa, Extrato Bancário, Contas a Pagar, Exposição Financeira, Aging, Concentração Fornecedores, Projeção Tesouraria
- **Vendas & Bilheteira** (5): Auditoria Bilheteiras, Taxa de Ocupação, Curva de Vendas, Comparativo Vendas, Mix Receitas
- **Parcerias** (2): Despesas Sócios, Acerto Sócios
- **Operacionais** (10): BP×Transações, Movimentações, Fornecedores, Plano de Contas, Listas de Pagamento, Cachê do Artista, Pendências Documentais, Exportação Contábil, Índice de Pendências, Auditoria de IVA

### E. Admin
| Rota | Componente | Personas |
|------|-----------|----------|
| `/admin` | `AdminPanel.tsx` | ADM |
| `/admin/utilizadores` | `UserManagement.tsx` | ADM |
| `/admin/backups` | `DatabaseBackups.tsx` | ADM |
| `/admin/seguranca` | `SecurityDashboard.tsx` | ADM |
| `/admin/lixeira` | `Trash.tsx` | ADM |
| `/admin/implantacao` (+ `:id`) | `EventImplementations.tsx` | ADM |
| `/admin/atividade` | `UserActivityLog.tsx` | ADM |
| `/admin/auditoria-contas` | `AuditoriaContas.tsx` (**1566 ln**) | ADM, gestor |
| `/admin/formalidade` | `FormalidadeAudit.tsx` (662 ln) | ADM |
| `/admin/empresas` | `admin/Companies.tsx` | platform_admin |
| `/admin/lembretes` | `admin/Reminders.tsx` | ADM |
| `/admin/auditoria-rls` | `admin/RlsLegacyAudit.tsx` | ADM |
| `/admin/sync-coala` | `admin/CoalaSync.tsx` | ADM (cliente Coala) |

### F. Suporte / Outros
| Rota | Componente |
|------|-----------|
| `/ajuda` | `HelpCenter.tsx` |
| `/camarim-equipa` | `CamarimEquipa.tsx` (vista compacta PWA) |
| `/parceiro/*` | `PartnerLayout` → `PartnerPortal`, `PartnerEventDetail` |

---

## Agrupamento por módulo lógico

Organização proposta (não corresponde 1:1 ao sidebar actual — ver problema #02-Inv-1):

```text
┌─ DASHBOARD ─────────────  /, /erp
├─ PLANEAMENTO ───────────  /calendario, /eventos, /eventos/:id, /demo/simulador
├─ ORÇAMENTAÇÃO ──────────  /eventos/:id/simulador, /eventos/:id (aba BP/Forecast)
├─ EXECUÇÃO FINANCEIRA ────  /transacoes, /recorrentes, /reembolsos, /camarim
├─ BILHETÉTICA ───────────  /bilheteiras
├─ CADASTROS ─────────────  /contas, /plano-contas, /fornecedores, /cotacoes, /iva
├─ APROVAÇÃO ─────────────  (sem rota dedicada — disperso em /transacoes + /reembolsos + listas embed)
├─ RELATÓRIOS ────────────  /relatorios/*  (33 sub-rotas)
└─ ADMIN ─────────────────  /admin/*       (13 sub-rotas)
```

### Observação crítica de inventário
- **Não existe rota "Aprovações"** dedicada. O aprovador (APR) tem de saber procurar em três sítios diferentes:
  1. `/transacoes` filtrado por `status=pending` + `viewMode=open`
  2. `/reembolsos` filtrado por `status=pending_payment` ou `approved`
  3. Aba "Listas de Pagamento" embebida em alguma página de relatórios + popups de `ApprovedPaymentListReminder` (App.tsx:315)
- O **badge do PWA** (`app-badge.ts`) só conta `payment_lists` em `pending_approval` (memória `app-icon-badge`), o que confirma a importância do fluxo mas torna ainda mais evidente a falta de UI agregadora.

---

## Mapa Persona × Módulo

Legenda: ●●● uso diário · ●● uso semanal · ● uso esporádico · — sem acesso típico

| Módulo | PRO | FIN | APR | ADM |
|--------|-----|-----|-----|-----|
| Dashboard (`/`) | ●●● | ●●● | ●●● | ●● |
| Calendário | ●●● | ● | ● | ● |
| Eventos (lista + detail) | ●●● | ●● | ●● | ●● |
| Simulador (`/eventos/:id/simulador`) | ●●● | ● | — | ● |
| Transações | ● | ●●● | ●●● | ●● |
| Recorrentes | — | ●● | ● | ● |
| Reembolsos | — | ●●● | ●●● | ● |
| Camarim | — | ●● | — | ● |
| Bilheteiras | ●● | ●● | ● | ● |
| Cadastros (Contas/Plano/Entidades/IVA/Cotações) | ● | ●● | ● | ●●● |
| Relatórios | ●● | ●●● | ●●● | ●● |
| Admin | — | — | — | ●●● |

---

## Inventário de modais/componentes pesados (mais usados)

Componentes com >300 linhas que aparecem em vários fluxos:
- `TransactionFormModal`, `TransactionEditModal`, `TransactionPaymentModal`, `TransactionRow` (941 ln) — núcleo `/transacoes`
- `BatchPaymentModal`, `TransactionPaymentsListModal`, `PaymentTimeline` — fluxo de aprovação/pagamento
- `ReimbursementNoteDetail` (605 ln), `ReimbursementNoteFormModal` — núcleo `/reembolsos`
- `EventEditModal`, `EventForecast`, `EventFecho`, `ResultsAnalysis` — abas do EventDetail
- `CacheSettlementPanel`, `CacheTransactionModal`, `CityCacheSettlementsPanel` — Cachê
- `FeverImportModal`, `CoalaImportWizard`, `TicketForecastImportModal`, `BPSheetMappingModal` — importações
- `MfaEnroll`, `MfaVerify`, `MfaRequiredGate` — segurança

> **Nota técnica:** três páginas ultrapassam 1500 linhas (`Transactions`, `EventSimulator`, `AuditoriaContas`) e cinco passam de 1000. Risco directo de UX: tempo de mount, scroll lock global em modais sobre páginas grandes, e deriva visual entre seções do mesmo ficheiro.
