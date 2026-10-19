SET LOCAL lock_timeout = '5s';
REVOKE ALL ON public.song_link_delivery_slots FROM sandbox_exec, sandbox_exec_sfohvvlqccmmebvjgibx;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = 'public.song_link_delivery_slots'::regclass
      AND EXISTS (
        SELECT 1 FROM aclexplode(c.relacl) a
        JOIN pg_roles r ON r.oid = a.grantee
        WHERE r.rolname NOT IN ('postgres','service_role')
      )
  ) THEN
    RAISE EXCEPTION 'song_link_delivery_slots: grant fora de owner/service_role' USING ERRCODE='55000';
  END IF;
END $$;