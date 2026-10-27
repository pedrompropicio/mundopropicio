-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.coala_capture_category_change()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "e9e128df733f5dce6ae27ab68f7c569fec73340bba3bb235420da1b8c94bca38", "live_properties_sha256": "2884cc8ad6ca74449c4761e0705a8c4c7de2c1bdbb571ed9c3a69cef2d0a0a07", "oid": 97807, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "51782c59f9b39d089658a9970994f80b817de38b77de36e82286656dc7dcea9d", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 61cb840bfcf00a7cd7e2218690526779130fd2bdff210e8f537eaa68be5a188d
CREATE OR REPLACE FUNCTION public.coala_capture_category_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fallback_id uuid;
  v_desc_norm text;
  v_src text;
  v_actor uuid;
BEGIN
  -- só interessa quando categoria mudou para algo válido
  IF NEW.category_id IS NULL OR NEW.supplier_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  -- Ramo Capital (10.1.x): movimentos de capital — aportes, devoluções, distribuições,
  -- empréstimos a sócio — não são classificação de despesa e não alimentam o mapa de
  -- sugestão. Sem esta guarda, cada aporte espelhado automático escrevia uma linha aqui.
  IF EXISTS (
    SELECT 1 FROM public.account_categories c
     WHERE c.id = NEW.category_id AND c.code LIKE '10.1.%'
  ) THEN
    RETURN NEW;
  END IF;

  -- ignorar se for a categoria fallback "A Classificar"
  SELECT id INTO v_fallback_id
    FROM public.account_categories
   WHERE company_id = NEW.company_id
     AND code IN ('0.0.99','2.6.08')
   ORDER BY (code = '0.0.99') DESC
   LIMIT 1;
  IF v_fallback_id IS NOT NULL AND NEW.category_id = v_fallback_id THEN
    RETURN NEW;
  END IF;

  v_desc_norm := public.norm_coala_desc(NEW.description);
  IF v_desc_norm IS NULL OR length(v_desc_norm) < 3 THEN RETURN NEW; END IF;

  v_src := COALESCE(NULLIF(current_setting('app.coala_match_source', true), ''), 'inline_edit');
  v_actor := auth.uid();

  INSERT INTO public.coala_supplier_category_map AS m (
    company_id, supplier_id, description_normalized, category_id,
    confirmed_count, matched_via, created_by, last_used_at
  ) VALUES (
    NEW.company_id, NEW.supplier_id, v_desc_norm, NEW.category_id,
    1, v_src, v_actor, now()
  )
  ON CONFLICT (company_id, supplier_id, description_normalized) DO UPDATE
    SET category_id   = EXCLUDED.category_id,
        confirmed_count = CASE
          WHEN m.category_id = EXCLUDED.category_id THEN m.confirmed_count + 1
          ELSE 1
        END,
        matched_via   = EXCLUDED.matched_via,
        last_used_at  = now(),
        updated_at    = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'coala_capture_category_change failed: %', SQLERRM;
  RETURN NEW;
END $function$
;

ALTER FUNCTION public.coala_capture_category_change() OWNER TO "postgres";
-- END OPERATION 61cb840bfcf00a7cd7e2218690526779130fd2bdff210e8f537eaa68be5a188d
