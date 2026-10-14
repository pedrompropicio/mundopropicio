DO $migration$
DECLARE d text; expected text := 'p_test_emails text[] DEFAULT NULL::text[]';
BEGIN
 SELECT pg_get_functiondef('public.coala_send_eb_invite_batch(integer,boolean,text[],text[],text)'::regprocedure) INTO d;
 IF strpos(split_part(d,E'\n',1), expected)=0 THEN RAISE EXCEPTION 'Expected test parameter default missing; stop'; END IF;
 d := replace(d,expected,'p_test_emails text[]');
 DROP FUNCTION public.coala_send_eb_invite_batch(integer,boolean,text[],text[],text);
 EXECUTE d;
END $migration$;
REVOKE ALL ON FUNCTION public.coala_send_eb_invite_batch(integer,boolean,text[],text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.coala_send_eb_invite_batch(integer,boolean,text[],text[],text) TO service_role;