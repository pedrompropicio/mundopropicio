-- #330 REVERSÃO INERTE / NÃO EXECUTAR automaticamente.
-- Désactive uniquement la mission; conserve données, crédit, garde unique, droits et RPC de lecture.
-- API compatible doit rester en place. Réactivation ne redonne pas de points.
BEGIN;
SELECT public._club_site_lock(id,true) FROM public.portal_sites WHERE domain='newgangfestival.pt';
SELECT public.club_profile_configure(id,'profile-v1',false) FROM public.portal_sites WHERE domain='newgangfestival.pt' AND EXISTS(SELECT 1 FROM public.club_profile_settings c WHERE c.site_id=portal_sites.id);
COMMIT;
