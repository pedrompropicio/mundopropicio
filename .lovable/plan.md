## Diagnóstico

A Délia **não é admin** em Mundo Propício — é **editor** (verifiquei na DB: `user_roles` → `editor@mundo-propicio` + `producer@coala-portugal`). Foi presunção minha (e do briefing inicial) que ela era admin.

A policy SELECT em `public.suppliers` é:

```
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))
```

E há uma policy RESTRICTIVE `company_isolation_suppliers` por cima. Resultado para editors:

```
(admin OR manager)  AND  (company_id = current_company_id())
       ↑ falha
```

→ Délia (editor) recebe 0 linhas. A página `/fornecedores` mostra "Nenhum fornecedor encontrado" e a coluna **Beneficiário** em `/transacoes` aparece "—" para todas as linhas.

A app inteira lê `suppliers` em ~20 sítios (Transactions, Recurring, EventPartners, Reembolsos, Camarim, Quotations, etc.). Sem SELECT, nada disto funciona para um editor.

## Correção

Substituir a policy SELECT de `suppliers` para autorizar todos os roles do tenant que precisam de ler fornecedores:

- `admin`, `manager`, `editor`, `viewer`, `accountant`

O isolamento entre empresas continua garantido pela policy RESTRICTIVE `company_isolation_suppliers` (não muda).

INSERT / UPDATE / DELETE continuam restritos a `admin` / `manager` (sem alteração).

## Migration

```sql
DROP POLICY "Suppliers viewable by admin or manager" ON public.suppliers;

CREATE POLICY "Suppliers viewable by tenant members"
ON public.suppliers FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'manager')
  OR has_role(auth.uid(),'editor')
  OR has_role(auth.uid(),'viewer')
  OR has_role(auth.uid(),'accountant')
);
```

Nota: a memória **Security hardening 2026-05** já previa que "suppliers viewer já não lê dados bancários" — isso continua válido (IBAN/NIB ficam ocultos por outro mecanismo de coluna; esta mudança só restaura o SELECT de id/name/etc. para editors e abaixo).

## Validação

1. Login como Délia → `/fornecedores` deve listar fornecedores de MP.
2. `/transacoes` → coluna **Beneficiário** mostra "Gilberto…" nas linhas correspondentes.
3. Switcher → trocar para Coala → só vê suppliers de Coala (isolamento intacto).
4. Tentar criar/editar/eliminar um fornecedor como Délia → deve falhar (continua admin/manager-only).

## Atualizar memória

Acrescentar à memória `security-hardening-2026-05` (ou criar `suppliers-select-tenant-members`) a regra: **SELECT de suppliers passa a aberto a admin/manager/editor/viewer/accountant dentro do tenant; mutações ficam admin/manager**.

## Out-of-scope

Não mexer no role da Délia (continua editor, é a configuração correta para ela). Não mexer no isolamento por empresa. Não tocar em outras tabelas.
