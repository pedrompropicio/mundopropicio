CREATE OR REPLACE FUNCTION public.storage_path_belongs_to_current_company(_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    public.is_platform_admin(auth.uid())
    or (
      public.current_company_id() is not null
      and _name is not null
      and (
        (storage.foldername(_name))[1] = public.current_company_id()::text
        or exists (
          select 1 from public.transactions t
          where case
                  when (storage.foldername(_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then t.id = ((storage.foldername(_name))[1])::uuid
                  else false
                end
            and t.company_id = public.current_company_id()
        )
      )
    );
$function$;

GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO anon;
GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storage_path_belongs_to_current_company(text) TO service_role;