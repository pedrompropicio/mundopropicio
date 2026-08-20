UPDATE public.app_secrets
SET value = 'https://sfohvvlqccmmebvjgibx.supabase.co',
    updated_at = now()
WHERE name = 'project_functions_base_url';