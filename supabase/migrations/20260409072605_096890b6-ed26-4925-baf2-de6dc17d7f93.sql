DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'partner_event_access_user_id_fkey' 
    AND table_name = 'partner_event_access'
  ) THEN
    ALTER TABLE public.partner_event_access 
    ADD CONSTRAINT partner_event_access_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;