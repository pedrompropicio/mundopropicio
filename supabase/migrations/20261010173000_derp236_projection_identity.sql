-- Projection must resolve the exact account/campaign, never the campaign name.
DO $m$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.artist_ads_investment_report(uuid,date,date)'::regprocedure);
 d:=replace(d,$a$'plataforma',c->>'platform','campanha',c->>'nome'$a$,$a$'plataforma',c->>'platform','conta',c->>'account','campaign_id',c->>'cid','campanha',c->>'nome'$a$);
 d:=replace(d,$a$s->>'platform'=c->>'plataforma' AND s->>'nome'=c->>'campanha'$a$,$a$s->>'platform'=c->>'plataforma' AND s->>'account'=c->>'conta' AND s->>'cid'=c->>'campaign_id'$a$);
 EXECUTE d;
END $m$;
