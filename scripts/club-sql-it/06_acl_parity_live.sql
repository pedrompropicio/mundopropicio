-- #327 — Paridade de ACL com Live (drift conhecido do repo): 0141 fazia só REVOKE em club_award_fixed; Live tem
-- EXECUTE para service_role. Aplicado ao baseline local para que baseline = Live também nas ACL. Sem anon/authenticated.
GRANT EXECUTE ON FUNCTION public.club_award_fixed(uuid, text, text, int) TO service_role;
