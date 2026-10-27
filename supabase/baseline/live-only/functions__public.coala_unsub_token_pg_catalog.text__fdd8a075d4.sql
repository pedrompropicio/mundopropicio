-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.coala_unsub_token(pg_catalog.text)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "6ab831d6e30310b6ae5af6f976c7b1c81d76eed32278d7f4ec4df88d0ebc31a9", "live_properties_sha256": "b62e79beb1041b3e6f3c746780646e1c5bae054c3f4952ec32d7fc7c708c3962", "oid": 187655, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "1f817c7de84eae5a770b313b17d628b42d63bf17cf940777bea06bc3bc4085f4", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 5c829db06ac61b914ffef3ca8298573e6ce791d2a9c552d44a429ca24b05efd0
CREATE OR REPLACE FUNCTION public.coala_unsub_token(p_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  COALA constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  v_email text := lower(btrim(p_email));
  v_token text;
begin
  select token into v_token
    from public.email_unsubscribe_tokens
   where email = v_email and company_id = COALA
   limit 1;

  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.email_unsubscribe_tokens (token, email, company_id)
         values (v_token, v_email, COALA)
    on conflict (email, company_id) do nothing;

    select token into v_token
      from public.email_unsubscribe_tokens
     where email = v_email and company_id = COALA
     limit 1;
  end if;

  return v_token;
end
$function$
;

ALTER FUNCTION public.coala_unsub_token(pg_catalog.text) OWNER TO "postgres";
-- END OPERATION 5c829db06ac61b914ffef3ca8298573e6ce791d2a9c552d44a429ca24b05efd0
