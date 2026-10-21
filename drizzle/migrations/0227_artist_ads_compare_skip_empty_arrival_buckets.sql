SET LOCAL lock_timeout='5s';
DO $patch$
DECLARE d text:=pg_get_functiondef('public.artist_ads_compare(uuid,date,date,text,text)'::regprocedure);
 a text:=$a$WHERE e.artist_id=p_artist_id AND e.company_id=v_company AND e.canal<>'teste'$a$;
 b text:=$b$WHERE e.artist_id=p_artist_id AND e.company_id=v_company AND e.canal<>'teste' AND e.n>0$b$;
BEGIN
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'hourly compare guard drift'; END IF;
 EXECUTE replace(d,a,b);
END $patch$;