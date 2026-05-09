---
name: Security hardening 2026-05
description: 4 fixes pós-multi-tenant aplicados em 2026-05-01 — suppliers viewer-leak, storage role checks, realtime auth, update-transaction role gate
type: feature
---

## Contexto

Pós-publicação multi-tenant + scan de segurança 2026-05-01 detetou 4 críticos. Corrigidos numa migration única + alteração à edge fn `update-transaction`.

## FIX 1 — Suppliers: viewer já não vê dados bancários

`Suppliers viewable by editor` incluía `viewer` no OR. Reescrita para apenas `has_role(editor)`. Admin/manager mantêm a sua policy própria. Resultado: viewer **não** tem SELECT em `public.suppliers` (IBAN, SWIFT, NIF, contactos).

## FIX 2 — Storage: 4 buckets sem role check

Removidas as policies fracas "Authenticated users can upload/delete..." nos buckets `supplier-documents`, `transaction-documents`, `supplier-credit-documents`, `import-reports`. Recriadas com role check forte:

- supplier-documents / transaction-documents / import-reports → INSERT só admin/manager/editor
- supplier-credit-documents → INSERT só admin/manager
- DELETE já tinha policies fortes; mantidas

## FIX 3 — Realtime: anon deixa de subscrever

`ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` + policy SELECT só `TO authenticated`. Granularidade per-tenant em `realtime.messages` exige Realtime Authorization (broadcast/presence) — fora de scope; `public.ticket_sales` continua protegido pelo RLS da tabela.

## FIX 4 — update-transaction edge fn: role gate + status removido

Antes: qualquer auth user podia chamar e flipar `status` para `paid` bypassando `approve-transaction`. Agora:

- Exige role admin/manager/editor/platform_admin **OU** permissão explícita `manage_transactions` (403 caso contrário)
- `status` removido de `allowedFields` — transições passam só pelos endpoints dedicados (approve-transaction, liquidate)

## Pendências conhecidas (NÃO corrigidas nesta volta)

- ~~`check-login-rate / record_failure` sem throttle~~ → **FECHADO 2026-05-09**: token HMAC bound to (email,ip) + lockout decisivo por IP + alertas dedupe por IP/hora. Ver `mem://security/auth-rate-limit-hardening`.
- 110+ funções `SECURITY DEFINER` callable por anon/auth (linter SUPA_0028/0029). Auditoria função-a-função fica para uma volta dedicada.
- HIBP password protection: a memória diz ON; reconfirmar no painel Cloud (linter ainda flagga warn).
- Realtime per-tenant granularity (Realtime Authorization).
- `profiles` enumera emails dentro da mesma empresa (aceitável; ponderar restringir colunas para non-admin).

## Como verificar

```sql
-- FIX 1: viewer não vê suppliers
SET LOCAL ROLE authenticated; -- com user viewer no JWT
SELECT count(*) FROM public.suppliers; -- esperado: 0

-- FIX 2: policies fracas removidas
SELECT polname FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='storage' AND polname ILIKE 'Authenticated users can%';
-- esperado: 0 linhas

-- FIX 3: RLS ligado em realtime.messages
SELECT relrowsecurity FROM pg_class WHERE relname='messages' AND relnamespace='realtime'::regnamespace;
-- esperado: true
```
