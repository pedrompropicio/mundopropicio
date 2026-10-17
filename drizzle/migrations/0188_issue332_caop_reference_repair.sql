-- #332: repair three transcription errors in0187, fail closed against all308 approved rows.
DO $repair$
DECLARE definition text; signature text;
BEGIN
 SELECT md5(string_agg(code||':'||name||':'||region,E'\n' ORDER BY code)) INTO signature FROM public.portugal_municipalities;
 IF signature='c2173f4ab7f8f5a55e60b40cd24e414e' THEN RETURN; END IF;
 definition:=pg_get_viewdef('public.portugal_municipalities'::regclass,true);
 IF md5(definition)<>'f7deccf199198bd1e003210a75b1b29e' THEN RAISE EXCEPTION 'unexpected_caop_reference'; END IF;
 definition:=replace(definition, '(''0208''::text,''Aljustrel''::text,''Continente''::text)', '(''0208''::text,''Ferreira do Alentejo''::text,''Continente''::text)');
 definition:=replace(definition, '(''1606''::text,''Ponte de Lima''::text,''Continente''::text)', '(''1606''::text,''Ponte da Barca''::text,''Continente''::text)');
 definition:=replace(definition, '(''1607''::text,''Ponte da Barca''::text,''Continente''::text)', '(''1607''::text,''Ponte de Lima''::text,''Continente''::text)');
 EXECUTE 'CREATE OR REPLACE VIEW public.portugal_municipalities WITH (security_invoker=true) AS '||definition;
 SELECT md5(string_agg(code||':'||name||':'||region,E'\n' ORDER BY code)) INTO signature FROM public.portugal_municipalities;
 IF signature IS DISTINCT FROM 'c2173f4ab7f8f5a55e60b40cd24e414e' OR (SELECT count(*) FROM public.portugal_municipalities)<>308 THEN RAISE EXCEPTION 'caop_reference_mismatch'; END IF;
END
$repair$;
