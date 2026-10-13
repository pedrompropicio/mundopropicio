-- 0132 (D-ERP263) — Cidade por base local DB-IP Lite City (CC BY 4.0), só BR e PT.
-- Nunca guarda IPs de visitantes: só ranges públicos da DB-IP.
CREATE TABLE IF NOT EXISTS public.ip_city_ranges (
  ip_from inet NOT NULL,
  ip_to inet NOT NULL,
  country text NOT NULL,
  region text,
  city text,
  source_month date NOT NULL
);
COMMENT ON TABLE public.ip_city_ranges IS 'D-ERP263: DB-IP Lite City (CC BY 4.0, "IP geolocation by DB-IP" https://db-ip.com), só BR/PT, IPv4+IPv6. Carregada por dbip-city-sync.';

GRANT ALL ON public.ip_city_ranges TO service_role;
ALTER TABLE public.ip_city_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY ip_city_ranges_service_only ON public.ip_city_ranges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Pesquisa: ip_from <= $ip ORDER BY ip_from DESC LIMIT 1 e depois ip_to >= $ip (ranges não se sobrepõem).
CREATE INDEX IF NOT EXISTS ip_city_ranges_from_idx ON public.ip_city_ranges (ip_from DESC, source_month DESC);

CREATE OR REPLACE FUNCTION public.ip_city_lookup(ip inet)
RETURNS TABLE(country text, region text, city text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.country, r.region, r.city
  FROM (
    SELECT c.country, c.region, c.city, c.ip_to FROM public.ip_city_ranges c
    WHERE c.ip_from <= ip_city_lookup.ip
    ORDER BY c.ip_from DESC, c.source_month DESC
    LIMIT 1
  ) r
  WHERE r.ip_to >= ip_city_lookup.ip AND family(r.ip_to) = family(ip_city_lookup.ip);
$$;
REVOKE ALL ON FUNCTION public.ip_city_lookup(inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ip_city_lookup(inet) TO service_role;

-- Troca atómica: depois de carregado o mês novo, apaga os outros meses numa só transacção.
CREATE OR REPLACE FUNCTION public.ip_city_ranges_swap(_month date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.ip_city_ranges WHERE source_month <> _month;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.ip_city_ranges_swap(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ip_city_ranges_swap(date) TO service_role;

-- Limpar um mês parcial antes de recomeçar a carga desse mês.
CREATE OR REPLACE FUNCTION public.ip_city_ranges_clear_month(_month date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.ip_city_ranges WHERE source_month = _month;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.ip_city_ranges_clear_month(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ip_city_ranges_clear_month(date) TO service_role;
