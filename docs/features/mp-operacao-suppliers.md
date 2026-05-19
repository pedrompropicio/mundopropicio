---
name: MP Operação — Fornecedores na Etapa (OP-0)
description: Modelo M:N etapa↔fornecedor com contacto operacional por linha (telefone/WhatsApp/email)
type: feature
---

# MP Operação — Fornecedores na Etapa (OP-0)

Slice cirúrgica antes do Coala (28-31 maio 2026). Apenas o essencial para os
produtores de zona/serviço terem fornecedores e contactos clicáveis durante a
montagem. **NÃO** inclui Hub do Evento (OP-1) nem pipeline de cotações (OP-2).

## Modelo de dados

Tabela nova: `operacao_etapa_suppliers`

- `etapa_id` → `operacao_etapas(id)` (cascade)
- `supplier_id` → `suppliers(id)` (set null)
- `company_id` (auto-fill por trigger a partir da etapa)
- `role` ∈ `principal | secundario` (default `principal`)
- `decided_amount`, `iva_rate` (opcionais)
- Contacto **por linha** (não global do fornecedor): `contact_name`,
  `contact_phone`, `contact_role`, `contact_email`
- `notes`
- UNIQUE(`etapa_id`, `supplier_id`)

### Triggers

- `autofill_oes_company` — preenche `company_id` a partir da etapa
- `sync_etapa_principal_supplier` — quando a linha `principal` muda/é
  inserida/removida, sincroniza `operacao_etapas.supplier_id` para
  compatibilidade com relatórios existentes

### RLS

- SELECT permissivo: quem pode ver a etapa (`can_view_event_operacao`)
- WRITE permissivo: quem pode gerir a etapa (`can_manage_operacao_etapa`)
- RESTRICTIVE tenant isolation por `company_id`

### Backfill

Etapas existentes com `supplier_id` populado recebem uma linha `principal`
sem contacto (preenchido depois pelo utilizador conforme necessário).

## UI

- `src/components/operacao/suppliers/EtapaSuppliersPanel.tsx` — lista
  fornecedores ordenados (principal primeiro), badge âmbar para principal,
  botões clicáveis 📞 Chamar (`tel:`), 💬 WhatsApp (`https://wa.me/`) e
  📧 Email (`mailto:`). Telefone normalizado removendo `+` e não-dígitos
  para `wa.me`.
- `AddSupplierToEtapaDialog` — select fornecedor + opção "+ Novo
  fornecedor" (abre `SupplierFormModal`), papel, valor decidido, contacto.
- `EditEtapaSupplierDialog` — mesmo form, pré-preenchido, sem trocar
  fornecedor (para isso remover + adicionar).
- Integração mobile: `EtapaDetail.tsx` renderiza o painel entre o cartão
  de dados da etapa e os botões Iniciar/Bloquear/Concluir.
- Integração desktop: `EtapasTable.tsx` coluna "Fornecedores" mostra
  `Principal +N` e abre popover com o painel compacto.

## Fix de permissão associado

O perfil `viewer` tinha `open_chamado` mas faltava-lhe `view_operacao`
(criava chamados que depois não conseguia ver). Adicionado.

## Próximas sprints (NÃO incluído)

- OP-1: Hub do Evento, `events.operacao_mode`
- OP-2: pipeline de cotações (`operacao_etapa_quotes`), sync com
  `forecasts.amount`, descomissionar `Quotations.tsx`
- OP-4: templates de etapas
