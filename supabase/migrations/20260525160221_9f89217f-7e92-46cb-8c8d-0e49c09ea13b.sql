drop policy if exists "Suppliers viewable by admin or manager" on public.suppliers;
drop policy if exists "Suppliers viewable by tenant members" on public.suppliers;

create policy "Suppliers viewable by tenant members"
on public.suppliers
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'manager'::public.app_role)
  or public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
  or public.has_role(auth.uid(), 'editor'::public.app_role)
  or public.has_role(auth.uid(), 'viewer'::public.app_role)
  or public.has_role(auth.uid(), 'producer'::public.app_role)
  or public.has_role(auth.uid(), 'field_producer'::public.app_role)
);