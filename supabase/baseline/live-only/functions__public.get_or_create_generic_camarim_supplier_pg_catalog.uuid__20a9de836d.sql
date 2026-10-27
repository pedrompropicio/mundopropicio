-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.get_or_create_generic_camarim_supplier(pg_catalog.uuid)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "e48510e26b37ee6b88795f59931ec8dee4bd740a28b814de91624765c2bd81a0", "live_properties_sha256": "1957f13ad22625a066f5a271994ec16796788b8fa12c530d74cdb0da2d0e2d7f", "oid": 178124, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "36abbc18ee91d814fefc5000b87c89c281d845c7232e6b2549bdd19f3f28fbac", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 2fe728b9ffd8c4e56f87a175c568dc52a0561dee604f40cdcc5c8a9ea74977cc
CREATE OR REPLACE FUNCTION public.get_or_create_generic_camarim_supplier(_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF _company_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
    FROM public.suppliers
   WHERE company_id = _company_id
     AND is_active = true
     AND lower(btrim(name)) = lower('Diversos — Camarim')
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.suppliers (name, category, notes, is_active, company_id)
  VALUES (
    'Diversos — Camarim',
    'Camarim',
    'Fornecedor genérico para pequenas despesas de camarim sem cadastro próprio. O estabelecimento real fica registado no item e na descrição da transação.',
    true,
    _company_id
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.suppliers
     WHERE company_id = _company_id
       AND is_active = true
       AND lower(btrim(name)) = lower('Diversos — Camarim')
     LIMIT 1;
  END IF;

  RETURN v_id;
END;
$function$
;

ALTER FUNCTION public.get_or_create_generic_camarim_supplier(pg_catalog.uuid) OWNER TO "postgres";
-- END OPERATION 2fe728b9ffd8c4e56f87a175c568dc52a0561dee604f40cdcc5c8a9ea74977cc
