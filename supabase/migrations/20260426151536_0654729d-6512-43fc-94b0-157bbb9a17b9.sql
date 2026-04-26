CREATE OR REPLACE FUNCTION public.set_formalidade_auto_suggested(_value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.formalidade_auto_suggested', CASE WHEN _value THEN 'true' ELSE 'false' END, true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_formalidade_auto_suggested(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_formalidade_auto_suggested(boolean) TO authenticated;