---
name: role-accountant
description: Role accountant — portal /contabilidade read-only com 3 abas (Documentos / Relatórios / Fornecedores), ZIP export, audit log de downloads
type: feature
---

# Role "accountant" — Portal de Contabilidade

## 1. Visão geral
- Role: `accountant` (label "Contabilista", priority=3 em AuthContext, cor teal).
- Caso de uso: contabilista externo da empresa acede read-only para descarregar documentos contábeis (faturas/recibos) e consultar relatórios não-gerenciais.
- Multi-tenant: 1 contabilista pode estar em N empresas via memberships existentes (`user_roles` UNIQUE(user_id,company_id,role)). Troca de empresa via CompanySwitcher no header.

## 2. Permissions (read-only, mapeadas em `role_permissions`)
- `view_report_accounting_export`, `view_report_document_pendencies`
- `view_report_artist_cache`, `view_report_categories`
- `view_report_suppliers`, `view_reports`, `view_events`, `view_bp`
- Removidos (2026-06-09): `view_report_cashflow`, `view_report_bank_statement`, `view_report_contas_pagar`, `view_report_payment_lists` — contabilista não precisa de operacionais para fechar contabilidade.

## 3. Layout `/contabilidade`
- 3 tabs: **Documentos** (default) / **Relatórios** / **Fornecedores**.
- Header: BrandedLogo + "Portal Contabilidade" + CompanySwitcher + PeriodSelector (presets + custom).
- Footer: badge "Acesso de Contabilista — Read Only" + botão Sair.
- Sem AppSidebar / sem chrome do ERP normal.

## 4. Aba Documentos (`AccountantDocumentsTab.tsx`)
- Query: `transactions` da empresa activa onde `payment_date BETWEEN from AND to` E (`status='paid'` OR `paid_amount>0`); JOIN suppliers; counts em transaction_documents.
- Colunas: Data Pagto · Descrição · Fornecedor · NIF · Valor · Nº Doc · Anexos · Ações.
- Filtros: Tipo (Despesa/Receita/Todos) · Conta financeira · Busca fornecedor · Com/Sem anexos.
- Download individual: signed URL (1h) sobre bucket `transaction-documents` + RPC `record_document_download` (resource_type=`transaction_document`).
- Tx com vários anexos: passa pelo edge ZIP focado nesse dia/supplier.
- Botão grande "Descarregar Tudo (ZIP)" → edge `generate-accountant-zip`.
- Limites: 500 transações, 200 MB, timeout 25s síncrono.

## 5. Aba Relatórios (`AccountantReportsTab.tsx`)
- Grid de cards por categoria. Click → renderiza o componente Report* embebido (lazy) com botão "Voltar".
- Reutiliza componentes existentes (`ReportCashFlow`, `ReportBankStatement`, `ReportContasPagar`, `ReportAging`, `ReportPaymentLists`, `ReportAccountCategoriesPage`, `ReportIvaAudit`, `ReportAccountingExport`, `ReportDocumentPendencies`, `ReportArtistCache`).
- Nenhum desses componentes tem gate por role — todos respeitam tenant via `current_company_id()` em RLS.
- Bloqueados por design: DRE / DRE Brasil / DRE Empresarial / BP / Rentabilidade / Evolução Mensal / Desvio Orçamental / Projeção Tesouraria / Despesas Sócios / Acerto Sócios / Vendas & Bilheteira / Movimentações / Concentração Fornecedores / Fornecedores (gerencial) / Comparativo Vendas / Mix Receitas / Curva Vendas / Taxa Ocupação / BP vs Transações / Indice Pendências.
- A `Reports.tsx` central filtra por `managementOnly + accountantAllowed` para casos em que accountant tem direito (Cachê do Artista, Exportação Contábil).

## 6. Aba Fornecedores (`AccountantSuppliersTab.tsx`)
- Query `suppliers` da empresa activa (is_active=true) + count de `supplier_documents` por id.
- Colunas: Nome · NIF · IBAN (tooltip com até 3) · Email · Telefone · Morada · Anexos · Ações.
- Filtros: busca por nome (inclui trade_name) · busca por NIF · com/sem anexos. Sort por Nome/NIF.
- Botão "Ver" abre `SupplierViewModal` read-only.

### `SupplierViewModal.tsx`
- Modal sem botões Editar/Eliminar/Criar. Sem mutations.
- Mostra todos os campos cadastrais + até 3 IBANs/SWIFT + notas.
- Lista anexos do bucket `supplier-documents` com botão Descarregar individual.
- Download: signed URL (1h) + RPC `record_document_download` (resource_type=`supplier_document`).

## 7. Edge function `generate-accountant-zip`
- Inputs: `company_id`, `period {from,to}`, `filters` (type, account_ids[], supplier_ids[], has_attachments).
- Auth: JWT obrigatório; `has_role` aceita `accountant` OR `admin` OR `manager` na company_id.
- Constrói ZIP em pastas `YYYY-MM-DD_FornecedorSlug_invoice_ref/filename` + `index.csv` no root.
- Upload em bucket privado `accountant-exports` + retorna signed URL 30min.
- Chama `record_document_download` (resource_type=`zip_export`) internamente.
- Limites: max 500 tx, max 200MB, timeout 25s. Excedido → erro PT-PT.
- Cleanup: cron diário 03:00 UTC apaga objetos >24h.

## 8. Audit log
- Tabela `document_download_audit` (company_id, user_id, user_email, user_role, resource_type CHECK IN ('transaction_document','zip_export','supplier_document'), resource_id, bucket, file_path, file_name, downloaded_at, period_from, period_to, extra_metadata).
- Indexes: (company_id, downloaded_at DESC) e (user_id, downloaded_at DESC).
- RLS: SELECT apenas admin/platform_admin/manager da empresa. Zero INSERT/UPDATE/DELETE direto via client — só via RPC.
- RPC `record_document_download` SECURITY DEFINER: lê auth.uid + email + role + current_company_id, insere, retorna uuid.
- Página `/admin/audit-downloads` (admin/platform_admin) com tabela paginada + filtros (user, empresa, tipo, datas).

## 9. Redirect login
- AccountantGate em `/contabilidade` aceita `isAccountant` OR `isAdmin` (auditoria).
- App.tsx: role=`accountant` em qualquer pathname ≠ `/contabilidade` → `<Navigate to="/contabilidade" />`.
- Login bem-sucedido com role=`accountant` → cai directamente em `/contabilidade`.
- Admins podem entrar em `/contabilidade` para validar a vista.

## 10. Decisões arquiteturais
- **SEM** DRE / DRE Brasil / DRE Empresarial — gerenciais, fora do escopo fiscal.
- **SEM** SAF-T PT — sistema não trata fiscal, só armazena documentos.
- **SEM** tabela de facturas independente (existe apenas `invoice_ref` em transactions).
- **SEM** constraint UNIQUE em IBAN (preserva legados — gerido em feature separada de validação cross-supplier).
- Bucket `transaction-documents` já é privado desde Março/2026 (sem migration necessária).
- Reutilização dos componentes Report* > duplicação. Embebidos em lazy() dentro do AccountantReportsTab para evitar refactor de rotas.

## 11. TODO futuro
- Relatórios extra desenhados especificamente para contabilistas (a definir).
- SAF-T PT se sistema evoluir para tratar fiscal.
- Background async para ZIPs >200MB (hoje devolve erro PT-PT).
- Hook `useSignedUrl` com cache 50min se houver dor de re-requests.

## 12. Riscos conhecidos
- URLs externas antigas de `transaction-documents` — bucket já privado há tempo, sem impacto.
- Timeout 25s pode falhar com ZIP muito grande — mitigado por limites 500 tx + 200 MB.
- Componentes Report* assumem RLS por `current_company_id()`; trocar empresa no CompanySwitcher invalida query cache e re-fetch corre limpo.
