ALTER TABLE public.ugc_watchdog_config ADD COLUMN IF NOT EXISTS recipient_profile_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.ugc_watchdog_config ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
UPDATE public.ugc_watchdog_config
   SET recipient_profile_id = 'd8e502f7-9ceb-4dae-bd73-7291832d0d6f',
       company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'
 WHERE id = '7219c9a8-db3c-4945-9613-6ad992fd9079';
ALTER TABLE public.ugc_watchdog_config ALTER COLUMN recipient_profile_id SET NOT NULL;
ALTER TABLE public.ugc_watchdog_config ALTER COLUMN company_id SET NOT NULL;