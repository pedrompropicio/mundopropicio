-- D-ERP276: reenvio de perdidos (DLQ sem 'sent') com :r<n>, mesmo token/confirm_url;
-- ordem aleatória estável md5(email); índice lead_capture. Edição textual da definição atual
-- (preserva HTML PT/EN aprovados) com verificação de que cada trecho existe exatamente 1 vez.
CREATE INDEX IF NOT EXISTS lead_capture_company_email_norm_idx
  ON public.lead_capture (company_id, lower(btrim(email)));

CREATE OR REPLACE FUNCTION pg_temp._derp276_rep(s text, a text, b text) RETURNS text LANGUAGE plpgsql AS $f$
BEGIN
  IF (length(s) - length(replace(s, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'trecho nao encontrado exatamente 1 vez: %', left(a, 80);
  END IF;
  RETURN replace(s, a, b);
END $f$;

DO $do$
DECLARE d text := pg_get_functiondef('public.coala_send_eb_invite_batch(integer,boolean,text[],text[],text)'::regprocedure);
BEGIN
  d := pg_temp._derp276_rep(d, $q$  create temp table _inv on commit drop as
  with fb as ($q$,
    $q$  -- D-ERP276: estado de entrega por email (base + reenvios :r<n>), uma leitura do log.
  drop table if exists _invlog;
  create temp table _invlog on commit drop as
  select x.e, bool_or(x.status = 'sent') has_sent,
         (array_agg(x.status order by x.created_at desc))[1] last_status,
         count(distinct x.message_id) filter (where x.message_id ~ ':r[0-9]+$') n_reenvios
    from (select regexp_replace(substr(l.message_id, 14), ':r[0-9]+$', '') e, l.message_id, l.status, l.created_at
            from public.email_send_log l where l.message_id like 'coala-eb-inv:%') x
   group by x.e;

  create temp table _inv on commit drop as
  with fb as ($q$);
  d := pg_temp._derp276_rep(d, $q$      else null end motivo
    from fb;$q$,
    $q$      else null end motivo,
    exists (select 1 from public.coala_invites i
              join _invlog g on g.e = i.email
             where i.company_id = COALA and i.campaign = 'eb2027_invite' and i.email = fb.e
               and i.status <> 'confirmed' and g.last_status = 'dlq' and not g.has_sent) reenvio
    from fb;$q$);
  d := pg_temp._derp276_rep(d, $q$    'a_convidar', count(*) filter (where motivo is null),$q$,
    $q$    'a_convidar', count(*) filter (where motivo is null),
    'reenvio_pendente', count(*) filter (where motivo = 'ja_convidado' and reenvio),$q$);
  d := pg_temp._derp276_rep(d, $q$  insert into _inv (e, loc, motivo)
  select distinct e, 'pt'::text, null::text$q$,
    $q$  insert into _inv (e, loc, motivo, reenvio)
  select distinct e, 'pt'::text, null::text, false$q$);
  d := pg_temp._derp276_rep(d, $q$  select e, loc from _inv where p_test_emails is null and motivo is null
    and (v_only is null or e = any(v_only))
  union all
  select e, coalesce($q$,
    $q$  select e, loc, false reenvio from _inv where p_test_emails is null and motivo is null
    and (v_only is null or e = any(v_only))
  union all
  -- Reenvio de convites perdidos (DLQ, sem 'sent'): mesmo token/confirm_url do convite.
  select inv.e, i.locale, true from _inv inv
    join public.coala_invites i on i.company_id = COALA and i.campaign = 'eb2027_invite' and i.email = inv.e
   where p_test_emails is null and inv.motivo = 'ja_convidado' and inv.reenvio
     and (v_only is null or inv.e = any(v_only))
  union all
  select e, coalesce($q$);
  d := pg_temp._derp276_rep(d, $q$p_test_locale)
  from unnest(v_test)$q$,
    $q$p_test_locale), false
  from unnest(v_test)$q$);
  d := pg_temp._derp276_rep(d, $q$    from (select e, loc from _eb_recipients order by e
           limit$q$,
    $q$    from (select e, loc from _eb_recipients order by md5(e), e
           limit$q$);
  d := pg_temp._derp276_rep(d, $q$      'only_emails', v_only, 'test', p_test_emails is not null, 'test_emails', v_test, 'ts', now());$q$,
    $q$      'only_emails', v_only, 'test', p_test_emails is not null, 'test_emails', v_test,
      'ordem', 'md5(email)',
      'primeiros', (select jsonb_build_object(
          '250', jsonb_build_object('pt', count(*) filter (where rn <= 250 and loc = 'pt'), 'en', count(*) filter (where rn <= 250 and loc = 'en')),
          '1000', jsonb_build_object('pt', count(*) filter (where rn <= 1000 and loc = 'pt'), 'en', count(*) filter (where rn <= 1000 and loc = 'en')))
        from (select loc, row_number() over (order by md5(e), e) rn from _eb_recipients) o),
      'ts', now());$q$);
  d := pg_temp._derp276_rep(d, $q$  for r in select e, loc from _eb_recipients order by e limit v_room
  loop
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_url := 'https://coalafestival.pt/' || r.loc || '/confirmar?t=' || v_token;
    if p_test_emails$q$,
    $q$  for r in select e, loc, reenvio from _eb_recipients order by md5(e), e limit v_room
  loop
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    v_url := 'https://coalafestival.pt/' || r.loc || '/confirmar?t=' || v_token;
    if r.reenvio then
      v_mid := 'coala-eb-inv:' || r.e || ':r' || (coalesce((select g.n_reenvios from _invlog g where g.e = r.e), 0) + 1);
      update public.coala_invites
         set message_id = v_mid, queued_at = now()
       where company_id = COALA and campaign = 'eb2027_invite' and email = r.e and status <> 'confirmed'
      returning token, confirm_url into v_token, v_url;
      if not found then continue; end if;
    elsif p_test_emails$q$);
  EXECUTE d;
END $do$;

DO $do$
DECLARE d text := pg_get_functiondef('public.coala_send_eb_open_alert(integer,boolean,text[])'::regprocedure);
BEGIN
  d := pg_temp._derp276_rep(d, $q$  drop table if exists _alert;$q$,
    $q$  drop table if exists _alertlog;
  create temp table _alertlog on commit drop as
  select x.e, bool_or(x.status = 'sent') has_sent,
         (array_agg(x.status order by x.created_at desc))[1] last_status,
         count(distinct x.message_id) filter (where x.message_id ~ ':r[0-9]+$') n_reenvios
    from (select regexp_replace(substr(l.message_id, 15), ':r[0-9]+$', '') e, l.message_id, l.status, l.created_at
            from public.email_send_log l where l.message_id like 'coala-eb-open:%') x
   group by x.e;

  drop table if exists _alert;$q$);
  d := pg_temp._derp276_rep(d, $q$      when exists (select 1 from public.email_send_log l where l.message_id = 'coala-eb-open:' || m.email) then 'ja_enviado'
      else null end motivo
  from public.coala_list_members m;$q$,
    $q$      when exists (select 1 from _alertlog g where g.e = m.email) then 'ja_enviado'
      else null end motivo,
    coalesce((select g.last_status = 'dlq' and not g.has_sent from _alertlog g where g.e = m.email), false) reenvio,
    coalesce((select g.n_reenvios from _alertlog g where g.e = m.email), 0) n_reenvios
  from public.coala_list_members m;$q$);
  d := pg_temp._derp276_rep(d, $q$    'a_enviar', count(*) filter (where motivo is null),$q$,
    $q$    'a_enviar', count(*) filter (where motivo is null),
    'reenvio_pendente', count(*) filter (where motivo = 'ja_enviado' and reenvio),$q$);
  d := pg_temp._derp276_rep(d, $q$from _alert where motivo is null and (v_only is null or e = any(v_only)) order by e limit 3) s;$q$,
    $q$from _alert where (motivo is null or (motivo = 'ja_enviado' and reenvio)) and (v_only is null or e = any(v_only)) order by md5(e), e limit 3) s;$q$);
  d := pg_temp._derp276_rep(d, $q$  for r in select e, loc from _alert where motivo is null
             and (v_only is null or e = any(v_only)) order by e limit v_room
  loop
    v_mid := 'coala-eb-open:' || r.e;$q$,
    $q$  for r in select e, loc, reenvio, n_reenvios from _alert
            where (motivo is null or (motivo = 'ja_enviado' and reenvio))
              and (v_only is null or e = any(v_only)) order by md5(e), e limit v_room
  loop
    v_mid := 'coala-eb-open:' || r.e || case when r.reenvio then ':r' || (r.n_reenvios + 1) else '' end;$q$);
  EXECUTE d;
END $do$;