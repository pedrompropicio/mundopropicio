CREATE OR REPLACE FUNCTION public.log_formalidade_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_label text;
  v_auto boolean := false;
  v_setting text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.formalidade IS DISTINCT FROM OLD.formalidade THEN
    v_user := auth.uid();
    SELECT full_name INTO v_label FROM public.profiles WHERE id = v_user;

    -- Lê GUC de sessão; se for 'true', marca log como auto-sugerido.
    BEGIN
      v_setting := current_setting('app.formalidade_auto_suggested', true);
      IF v_setting IS NOT NULL AND lower(v_setting) IN ('true', 't', '1', 'on') THEN
        v_auto := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_auto := false;
    END;

    NEW.formalidade_changed_at := now();
    NEW.formalidade_changed_by := v_user;

    INSERT INTO public.event_forecast_formalidade_log
      (forecast_id, from_state, to_state, changed_by, changed_by_label, auto_suggested)
    VALUES
      (NEW.id, OLD.formalidade, NEW.formalidade, v_user, v_label, v_auto);
  END IF;
  RETURN NEW;
END;
$$;