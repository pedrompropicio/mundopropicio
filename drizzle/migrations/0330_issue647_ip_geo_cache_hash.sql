-- Classe R2 — PREPARADA, NÃO APLICADA. Issue #647; autorização 6634950065.
-- Ordem obrigatória: aplicar depois do deploy da SLE e do geo.ts novos.
-- Aplicação pelo 0, na janela, com «Sim» próprio; este ficheiro não autoriza execução.
-- Só ip_geo_cache; retenção de 72 h pertence ao 202-e e não se repete aqui.

-- §1 — Eliminar apenas chaves antigas, em lotes; IPs apagados não são recuperáveis.
DO $$
DECLARE
  removed integer;
BEGIN
  LOOP
    DELETE FROM public.ip_geo_cache
    WHERE ip IN (
      SELECT ip FROM public.ip_geo_cache WHERE ip NOT LIKE 'h:%' LIMIT 10000
    );
    GET DIAGNOSTICS removed = ROW_COUNT;
    EXIT WHEN removed = 0;
  END LOOP;
END $$;

-- §2 — A coluna conserva o nome legado; o seu conteúdo é só a chave por hash.
COMMENT ON COLUMN public.ip_geo_cache.ip IS
  'chave = h:<sha256(sal:ip)>; nunca IP em claro';

-- §3 — Fechar futuras escritas em claro e validar as linhas retidas.
ALTER TABLE public.ip_geo_cache
  ADD CONSTRAINT ip_geo_cache_hash_key_check CHECK (ip LIKE 'h:%') NOT VALID;
ALTER TABLE public.ip_geo_cache VALIDATE CONSTRAINT ip_geo_cache_hash_key_check;
