# Fornecedores: acesso a dados bancários — levantamento e plano

## Conclusão principal (antes de tudo)

O finding **`suppliers_bank_details_non_financial_roles` é um falso positivo do scanner**.
Nenhum papel não-financeiro consegue hoje ler `iban`, `iban_2`, `iban_3`, `swift_bic`,
`swift_bic_2`, `swift_bic_3` — não por causa das policies, mas por causa dos **grants por coluna**.

Estado real em BD:

```text
suppliers.relacl  → authenticated = awdDxtm   (SEM 'r' = SEM SELECT à tabela inteira)
grants por coluna → authenticated tem SELECT apenas em:
  id, name, nif, contact_name, email, phone, address, payment_terms,
  category, notes, is_active, created_at, updated_at, trade_name,
  is_partner, company_id            (16 colunas, zero bancárias)
```

Ou seja: a policy `Suppliers viewable by tenant members` autoriza a *linha*, mas o grant
recusa a *coluna*. Um `select("*")` de um producer devolve erro de permissão; qualquer
select das 16 colunas funciona. O scanner só lê `pg_policy` e não vê os grants de coluna,
por isso volta a marcar o mesmo caso.

O acesso legítimo ao IBAN passa exclusivamente por
`get_supplier_bank_details(uuid[])` (SECURITY DEFINER), que já valida:
- papel via `can_view_supplier_bank_data()` → `admin`, `platform_admin`, `manager`, `editor`, `accountant`
- empresa via `s.company_id = current_company_id()`

## 1. Inventário de leituras de `public.suppliers`

### 1.1 Leituras diretas com colunas bancárias — 1 caminho único
| Onde | Colunas | Quem chega |
|---|---|---|
| RPC `get_supplier_bank_details` (SECURITY DEFINER) | iban×3, swift×3, id, name, nif | admin, platform_admin, manager, editor, accountant + filtro `current_company_id()` |

Wrapper de frontend: `src/lib/supplier-bank.ts`
(`fetchSupplierBankRows/Map`, `mergeSupplierBank`, `mergeEmbeddedSupplierBank`,
`attachSupplierBankToTxRows`). Degrada em vazio no erro 42501, não parte ecrãs.

Consumidores do wrapper (10 ficheiros, todos já via RPC):
`pages/Suppliers.tsx`, `pages/contabilidade/AccountantSuppliersTab.tsx`,
`pages/admin/IbanDuplicates.tsx`, `components/PaymentListsTab.tsx`,
`components/ReportContasPagar.tsx`, `components/TransactionFormModal.tsx`,
`components/ReimbursementNoteFormModal.tsx`, `components/ReimbursementNoteDetail.tsx`,
`components/TransactionPaymentModal.tsx`, `components/camarim/FundHolderPicker.tsx`.

`src/lib/payment-iban.ts` (SEPA/pain.001, elegibilidade, badge "Sem IBAN") **não lê a BD**:
consome `tx.suppliers.iban*` já hidratado pelo wrapper, ou `transactions.iban_override`,
ou o IBAN da conta destino (`card-load-destination.ts`).

### 1.2 Leituras diretas sem colunas bancárias
`pages/Suppliers.tsx` usa `SUPPLIER_BASE_COLUMNS` (as 16 colunas permitidas).
Selects de `id, name[, trade_name, nif]` em: `GlobalSearch`, `EventPartnersTab`,
`EventCacheConfig`, `Quotations`, `ReportMovementReconciliation`, `ReportSuppliersPage`,
`SponsorsImportModal`, `ReimbursementNoteFormModal`, `CacheTransactionModal`,
`CamarimSessionDetail`, `cards/NewCardExpenseModal`, `supplier-credits/NewSupplierCreditModal`,
`operacao/suppliers/AddSupplierToEtapaDialog`, `camarim/FundHolderPicker`,
`TransactionFormModal`.

### 1.3 Embeds PostgREST `suppliers(...)` — ~40 sítios, todos só `name`/`trade_name`/`email`
Relatórios (DRE, DRE Brasil, DRE Empresarial, Aging, Contas a Pagar, Bank Statement,
BP×Transações, Partner Settlement, Partner Expenses, Supplier Concentration,
Ticket Office Audit, Document Pendencies, Accounting Export, Movement Reconciliation),
ERP (`TransactionRow`, `EventDetail`, `EventFecho`, `FinancialOperationsTab`,
`OrphanTransactionsModal`, `PaymentListsTab`, `PartnerSettlementTab`,
`PartnerPaidExpensesPanel`, `PartnerDREDialog`, `ResultsAnalysis`,
`TransactionPaymentModal`) e Operação (`MinhasTarefas`, `FrenteDetail`, `EtapasList`,
`EtapaDetail`, `EtapaSuppliersPanel`).
Nenhum embed pede colunas bancárias — confirmado por grep (`suppliers([^)]*iban` → 0 hits).

### 1.4 Edge functions
`apply-coala-bp`, `coala-sync-bootstrap`, `classify-coala-tx-with-ai`,
`test-multi-tenant-isolation` — todas com **service_role**, fora de RLS e de grants;
nenhuma exporta IBAN para o cliente. Geração SEPA/MT101 corre no frontend a partir
do RPC, não em edge function.

### 1.5 Views / RPC dependentes
Nenhuma view pública depende de `suppliers`. RPCs relacionadas:
`get_supplier_bank_details`, `can_view_supplier_bank_data`, `check_supplier_iban_duplicate`
(SECURITY DEFINER, devolve booleano/contagem, não expõe IBAN),
`get_partner_event_*` (só nomes).

### 1.6 Portais
- **Contabilista** (`AccountantSuppliersTab`): precisa e mantém — `accountant` está em `can_view_supplier_bank_data()`.
- **Parceiro/sócio**: `partner` não tem SELECT em `suppliers` (ausente da policy) e chega a nomes via RPCs agregadas. Sem impacto.
- **Produtor/Operação**: só `id, name` — já servido pelos grants de coluna.

## 2. Quem precisa mesmo do IBAN
| Fluxo | Papéis | Estado |
|---|---|---|
| Geração SEPA pain.001 / Santander, MT101 | admin, manager | OK via RPC |
| Listas de pagamento, badge "Sem IBAN", tesouraria | admin, manager, editor | OK via RPC |
| Portal do contabilista (ficha + export fiscal) | accountant | OK via RPC |
| Ficha de fornecedor em edição, auditoria de IBANs duplicados | admin, manager, editor | OK via RPC |
| Notas de reembolso, camarim (fund holder), pagamentos | admin, manager, editor | OK via RPC |
| Operação, marketing, viewer, producer, field_producer, partner | — | sem acesso (correto) |

## 3. Proposta

**Opção recomendada: A — endurecer sem mudar superfície (0 ficheiros de frontend).**

Não criar view nem cortar a policy de SELECT (isso partiria os ~40 embeds e a Operação).
Em vez disso, uma migration puramente defensiva que torna a proteção explícita e
resistente a regressões:

1. `REVOKE SELECT (iban, iban_2, iban_3, swift_bic, swift_bic_2, swift_bic_3)
   ON public.suppliers FROM authenticated;` — idempotente, reafirma o estado atual
   (protege contra um futuro `GRANT SELECT ON public.suppliers TO authenticated` genérico).
2. Renomear/rescrever a policy de SELECT para `suppliers_select_tenant_members` com o
   mesmo conjunto de papéis (sem alargar nem estreitar) e comentário `COMMENT ON POLICY`
   a documentar que as colunas bancárias estão cortadas por grant de coluna.
3. `COMMENT ON COLUMN` nas 6 colunas bancárias: "acesso apenas via get_supplier_bank_details()".
4. Restrição RESTRICTIVE `company_isolation_suppliers` fica intocada; o RPC continua a
   filtrar por `current_company_id()`. Isolamento multi-tenant inalterado.

Ficheiros a mudar: **1 migration, 0 ficheiros de `src/`, 0 edge functions.**

**Opção B (não recomendada): view `suppliers_safe` `security_invoker` + SELECT na tabela
só para admin/manager/accountant.** Obrigaria a reescrever ~40 embeds PostgREST
(`suppliers(name)` deixa de resolver porque a FK aponta para a tabela, não para a view),
mais os 15 selects diretos e a Operação inteira. Estimativa: 55+ ficheiros, risco alto,
ganho de segurança nulo face ao estado atual.

**E o finding?** Continua a aparecer, porque o scanner não lê grants de coluna. Depois da
migration da opção A, o caminho correto é **ignorar o finding com a justificação
"colunas bancárias revogadas por column-level grant; acesso só via
get_supplier_bank_details() com verificação de papel + empresa"**.

## Nada foi aplicado
Sem migrations, sem publish. À espera de luz verde para escrever a migration da opção A.
