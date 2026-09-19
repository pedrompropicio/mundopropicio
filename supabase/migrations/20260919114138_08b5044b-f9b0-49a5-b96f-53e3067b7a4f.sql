CREATE OR REPLACE FUNCTION public.artist_ads_plan_validate(p_plan jsonb, p_smart_link text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE v_obj text; v_link text; v_adsets jsonb; v_a jsonb; v_n int := 0; v_geo jsonb;
BEGIN
  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'object' THEN
    RAISE EXCEPTION 'plano inválido' USING ERRCODE = '22023';
  END IF;
  v_obj := upper(coalesce(p_plan->>'objetivo',''));
  IF v_obj NOT IN ('AWARENESS','TRAFFIC','ENGAGEMENT') THEN
    RAISE EXCEPTION 'objetivo inválido: usa AWARENESS, TRAFFIC ou ENGAGEMENT (conversões não são aceites em campanhas de música)' USING ERRCODE = '22023';
  END IF;
  v_adsets := p_plan->'adsets';
  IF v_adsets IS NULL OR jsonb_typeof(v_adsets) <> 'array' OR jsonb_array_length(v_adsets) < 1 THEN
    RAISE EXCEPTION 'o plano precisa de pelo menos um conjunto de anúncios' USING ERRCODE = '22023';
  END IF;
  FOR v_a IN SELECT * FROM jsonb_array_elements(v_adsets) LOOP
    v_n := v_n + 1;
    IF coalesce((v_a->>'orcamento_cents')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'conjunto %: orçamento diário tem de ser maior que zero', v_n USING ERRCODE = '22023';
    END IF;
    IF v_a->'anuncios' IS NULL OR jsonb_typeof(v_a->'anuncios') <> 'array'
       OR jsonb_array_length(v_a->'anuncios') < 1 THEN
      RAISE EXCEPTION 'conjunto %: precisa de pelo menos um anúncio', v_n USING ERRCODE = '22023';
    END IF;
    v_geo := v_a->'publico_sugerido'->'geo';
    IF v_geo IS NULL OR jsonb_typeof(v_geo) <> 'array'
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(v_geo) g
         WHERE btrim(coalesce(g, '')) <> ''
       ) THEN
      RAISE EXCEPTION 'conjunto %: indica pelo menos um país em publico_sugerido.geo (ex.: ["BR"])', v_n USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_link := nullif(btrim(coalesce(p_plan->>'link_destino','')), '');
  IF v_link IS NULL THEN v_link := p_smart_link; END IF;
  IF v_obj = 'TRAFFIC' AND (v_link IS NULL OR v_link !~ '^https://') THEN
    RAISE EXCEPTION 'objetivo Tráfego exige link de destino https:// (no plano ou no smart link da música)' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('objetivo', v_obj, 'link_destino', v_link, 'adsets', v_adsets);
END $$;

REVOKE EXECUTE ON FUNCTION public.artist_ads_plan_validate(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_ads_plan_validate(jsonb, text) TO authenticated, service_role;