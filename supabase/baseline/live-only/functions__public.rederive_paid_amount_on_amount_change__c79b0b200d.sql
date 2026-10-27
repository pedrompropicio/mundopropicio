-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.rederive_paid_amount_on_amount_change()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "cd1191a91491ba21f3036ca95d8d993749c1333c45415e1f760caf95995608a9", "live_properties_sha256": "ac0cc34337261107273b641062153869e487dad4513b57b78a840422a42aab4b", "oid": 361278, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "66b5fa64644c12a6e003ce37729cc3f6b12540e6e8f0a2dce63f1d0313f59295", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 506eda48e434904785a460880c4a7bc2dea61abee0d081be197f925b6438a9ea
CREATE OR REPLACE FUNCTION public.rederive_paid_amount_on_amount_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.amount is distinct from old.amount
     or coalesce(new.iva_rate,0) is distinct from coalesce(old.iva_rate,0) then
    if exists (select 1 from public.transaction_payments p
                where p.transaction_id = new.id and p.status = 'paid') then
      perform public._derive_paid_amount(new.id);
    end if;
  end if;
  return new;
end $function$
;

ALTER FUNCTION public.rederive_paid_amount_on_amount_change() OWNER TO "postgres";
-- END OPERATION 506eda48e434904785a460880c4a7bc2dea61abee0d081be197f925b6438a9ea
