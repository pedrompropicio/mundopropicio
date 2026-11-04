-- Classe R2 — PREPARADA, NÃO APLICADA. Issue #647, autorização 6634950065.
-- Ordem: aplicar só DEPOIS do deploy da SLE (song-link-event) e do geo.ts novos
-- em todos os seus chamadores (geo-lookup, portal-track e geo-backfill incluídos).
-- Aplicação pelo 0, na janela, com «Sim» próprio; este ficheiro não autoriza execução.
-- Os IPs apagados não são recuperáveis pelo rollback. Retenção 72 h: #202-e, fora daqui.

-- §1 — Apagar apenas chaves antigas, em lotes; preservar todas as chaves h:.
DO $issue647$
DECLARE
  deleted_count integer;
BEGIN
  LOOP
    DELETE FROM public.ip_geo_cache
    WHERE ip IN (
      SELECT ip FROM public.ip_geo_cache WHERE ip NOT LIKE 'h:%'
      ORDER BY ip LIMIT 10000
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    EXIT WHEN deleted_count = 0;
  END LOOP;
END
$issue647$;

-- §2 — A coluna histórica ip passa a conter exclusivamente uma chave opaca.
COMMENT ON COLUMN public.ip_geo_cache.ip IS
  'chave = h:<sha256(sal:ip)>; nunca IP em claro';

-- §3 — Impedir o regresso de escritas legadas após a limpeza.
ALTER TABLE public.ip_geo_cache
  ADD CONSTRAINT ip_geo_cache_hash_key_check CHECK (ip LIKE 'h:%') NOT VALID;
ALTER TABLE public.ip_geo_cache VALIDATE CONSTRAINT ip_geo_cache_hash_key_check;
