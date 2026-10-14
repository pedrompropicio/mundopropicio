-- D-ERP275: cartão do Clube na Google Wallet (e Apple, mais tarde).
CREATE TABLE public.club_wallet_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('google','apple')),
  object_id text NOT NULL,
  last_points int,
  last_level text,
  last_error text,
  saved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, platform)
);
GRANT SELECT ON public.club_wallet_passes TO authenticated;
GRANT ALL ON public.club_wallet_passes TO service_role;
ALTER TABLE public.club_wallet_passes ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_wallet_passes_select ON public.club_wallet_passes FOR SELECT TO authenticated USING (true);
CREATE POLICY company_isolation_club_wallet_passes ON public.club_wallet_passes AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));

-- Passes cujo pontos/nível atual difere do último enviado (lote para o cron).
CREATE OR REPLACE FUNCTION public.club_wallet_due(p_limit int DEFAULT 200)
RETURNS TABLE(pass_id uuid, member_id uuid, site_id uuid, points bigint, level_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH b AS (
    SELECT w.id, w.member_id, w.last_points, w.last_level, m.site_id,
           coalesce((SELECT sum(p.points) FROM club_points p WHERE p.member_id = w.member_id), 0)::bigint AS pts
      FROM club_wallet_passes w JOIN club_members m ON m.id = w.member_id
     WHERE w.platform = 'google')
  SELECT b.id, b.member_id, b.site_id, b.pts,
         (SELECT l.name FROM club_levels l WHERE l.site_id = b.site_id AND l.min_points <= b.pts ORDER BY l.min_points DESC LIMIT 1)
    FROM b
   WHERE b.last_points IS DISTINCT FROM b.pts
      OR b.last_level IS DISTINCT FROM (SELECT l.name FROM club_levels l WHERE l.site_id = b.site_id AND l.min_points <= b.pts ORDER BY l.min_points DESC LIMIT 1)
   LIMIT p_limit
$$;
REVOKE ALL ON FUNCTION public.club_wallet_due(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_wallet_due(int) TO service_role;
