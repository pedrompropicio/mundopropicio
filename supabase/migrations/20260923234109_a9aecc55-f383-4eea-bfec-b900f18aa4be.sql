CREATE OR REPLACE FUNCTION public.set_active_company(target_company_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM set_config('app.via_set_active_company', 'on', true);
  IF target_company_id IS NULL THEN
    UPDATE public.profiles SET active_company_id = NULL WHERE id = v_uid;
    RETURN NULL;
  END IF;
  IF public.is_platform_admin(v_uid) THEN
    SELECT EXISTS(SELECT 1 FROM public.companies
      WHERE id = target_company_id AND status='active') INTO v_ok;
  ELSE
    SELECT EXISTS(SELECT 1 FROM public.user_roles ur
      JOIN public.companies c ON c.id = ur.company_id
      WHERE ur.user_id = v_uid AND ur.company_id = target_company_id
        AND c.status='active') INTO v_ok;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'No membership in target company %', target_company_id;
  END IF;
  UPDATE public.profiles SET active_company_id = target_company_id WHERE id = v_uid;
  RETURN target_company_id;
END;
$f$;

CREATE OR REPLACE FUNCTION public.profiles_guard_active_company()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog' AS $f$
DECLARE
  v_via text := CASE WHEN current_setting('app.via_set_active_company', true) = 'on' THEN 'set_active_company' ELSE 'update_directo' END;
  v_uid uuid := auth.uid();
  v_h jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
BEGIN
  IF NEW.active_company_id IS NOT DISTINCT FROM OLD.active_company_id THEN
    RETURN NEW;
  END IF;
  IF v_uid IS NOT NULL AND v_via = 'update_directo' THEN
    RAISE EXCEPTION 'active_company_id só pode mudar por set_active_company'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.system_audit_log
    (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
  VALUES
    ('profile', NEW.id::text, 'active_company_changed',
     coalesce(v_uid::text, current_user),
     jsonb_build_object('active_company_id', OLD.active_company_id),
     jsonb_build_object('active_company_id', NEW.active_company_id),
     jsonb_build_object('via', v_via,
       'origin', v_h->>'origin', 'referer', v_h->>'referer', 'user_agent', v_h->>'user-agent'),
     NEW.active_company_id);
  RETURN NEW;
END;
$f$;
REVOKE ALL ON FUNCTION public.profiles_guard_active_company() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_profiles_guard_active_company
  BEFORE UPDATE OF active_company_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_active_company();