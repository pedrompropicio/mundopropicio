-- D-ERP236: record names must not shadow SQL aliases a/b.
DO $m$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.artist_ads_investment_report(uuid,date,date)'::regprocedure);
 d:=replace(d,' b record; a record;',' v_base record; v_current record;');
 d:=replace(d,'b:=NULL;a:=NULL','v_base:=NULL;v_current:=NULL');
 d:=replace(replace(d,'INTO b ','INTO v_base '),'INTO b;','INTO v_base;');
 d:=replace(replace(d,'INTO a ','INTO v_current '),'INTO a;','INTO v_current;');
 d:=replace(replace(replace(replace(d,'b.v','v_base.v'),'b.d','v_base.d'),'a.v','v_current.v'),'a.d','v_current.d');
 EXECUTE d;
END $m$;
