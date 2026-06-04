---
name: CRM/Portal RLS + storage isolation 2026-06
description: Fix Live para tabelas Portal/CRM criadas sem RLS (contacts, leads, event_faqs, event_lineups) e bucket crm-meta-creatives sem isolamento por path
type: security
---

2026-06-04: tabelas e bucket criados directamente em Live ficaram sem RLS/isolamento. Corrigido via `scripts/fix-crm-portal-rls-and-storage-live.txt`:

- **contacts / leads**: RLS ON, RESTRICTIVE `company_isolation_*` (company_id = current_company_id()), SELECT restrito a authenticated do tenant, writes só admin/manager. GRANT ALL → service_role (edge functions `process-lead-capture` / `process-redirect-log` continuam a escrever via SERVICE_ROLE).
- **event_faqs / event_lineups**: RLS ON + RESTRICTIVE company_isolation. SELECT público mantido (anon+authenticated `USING (true)`) porque alimentam o portal www.mundopropicio.com; writes só admin/manager.
- **storage bucket crm-meta-creatives**: removidas 5 policies antigas que só checavam `bucket_id`; substituídas por 4 (select/insert/update/delete) com `storage_path_belongs_to_current_company(name)`. Convenção de path: primeiro segmento = slug da empresa.

Tabelas que são populadas via edge function pública (lead_capture, redirect_log, contacts, leads) **não** recebem GRANT INSERT a anon — o portal escreve via edge function com SERVICE_ROLE.
