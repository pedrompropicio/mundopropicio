CREATE OR REPLACE FUNCTION public.create_registro_with_media(
  p_registro jsonb,
  p_media   jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_registro_id uuid;
  v_company_id  uuid;
BEGIN
  IF p_registro IS NULL THEN
    RAISE EXCEPTION 'p_registro is required' USING ERRCODE = '22023';
  END IF;
  IF (p_registro->>'company_id') IS NULL THEN
    RAISE EXCEPTION 'company_id is required' USING ERRCODE = '22023';
  END IF;
  IF (p_registro->>'frente_id') IS NULL THEN
    RAISE EXCEPTION 'frente_id is required' USING ERRCODE = '22023';
  END IF;
  IF (p_registro->>'author_profile_id') IS NULL THEN
    RAISE EXCEPTION 'author_profile_id is required' USING ERRCODE = '22023';
  END IF;
  IF (p_registro->>'kind') IS NULL THEN
    RAISE EXCEPTION 'kind is required' USING ERRCODE = '22023';
  END IF;

  v_company_id := (p_registro->>'company_id')::uuid;

  INSERT INTO operacao_registros (
    id, frente_id, etapa_id, author_profile_id, company_id,
    kind, text, audio_url, metadata
  )
  VALUES (
    COALESCE(NULLIF(p_registro->>'id','')::uuid, gen_random_uuid()),
    (p_registro->>'frente_id')::uuid,
    NULLIF(p_registro->>'etapa_id','')::uuid,
    (p_registro->>'author_profile_id')::uuid,
    v_company_id,
    p_registro->>'kind',
    NULLIF(p_registro->>'text',''),
    NULLIF(p_registro->>'audio_url',''),
    COALESCE(p_registro->'metadata', '{}'::jsonb)
  )
  RETURNING id INTO v_registro_id;

  IF p_media IS NOT NULL AND jsonb_array_length(p_media) > 0 THEN
    INSERT INTO operacao_registro_media (
      registro_id, company_id, file_url, thumbnail_url, file_type, sort_order
    )
    SELECT
      v_registro_id,
      v_company_id,
      m->>'file_url',
      NULLIF(m->>'thumbnail_url',''),
      m->>'file_type',
      COALESCE((m->>'sort_order')::int, (ord - 1)::int)
    FROM jsonb_array_elements(p_media) WITH ORDINALITY AS arr(m, ord);
  END IF;

  RETURN v_registro_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_registro_with_media(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_registro_with_media(jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_registro_with_media(jsonb, jsonb) IS
'OP-10b: cria operacao_registros + operacao_registro_media atomicamente. SECURITY INVOKER, respeita RLS.';