SELECT set_config('test.uid','11111111-1111-1111-1111-111111111111',false),set_config('test.admin','true',false),set_config('test.company','7d831e59-6e82-427b-95a0-64904aae5dd2',false),set_config('request.jwt.claims','{"role":"authenticated"}',false);
DO $$ DECLARE f jsonb; aid uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; BEGIN
 FOR f IN SELECT value FROM jsonb_array_elements('[{}, {"event_slugs":["event1"]}, {"sources":["invite"]}, {"since_days":3}, {"consent_required":"email"}, {"consent_required":"whatsapp"}, {"consent_required":"any"}, {"event_slugs":[],"sources":[]}, {"event_slugs":["event2"],"sources":["form"],"since_days":7,"consent_required":"email"}]') LOOP
 DELETE FROM meta_custom_audiences;
 INSERT INTO meta_custom_audiences VALUES (aid,'7d831e59-6e82-427b-95a0-64904aae5dd2',f);
 INSERT INTO expected SELECT f,coalesce(jsonb_agg(to_jsonb(r) ORDER BY email,phone),'[]') FROM crm_meta_audience_collect_leads(aid) r;
 END LOOP;
END $$;
