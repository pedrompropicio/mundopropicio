-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.force_no_account_on_compensation()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "0fb319fd6b12c6bbfcd594bfe2096ebcb0406f6c3f1ad603b0c683b712c06255", "live_properties_sha256": "4d61a059833a855245aaceea482e4191d5b309a487642d1788519a2c4b8ece23", "oid": 218281, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "a794167ba75f5d60e8978d190caf3cab2c7b688e5cea85f7c23b37c52c94f332", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 5e755ec6ed0956b3e647e73434552a6bfd7fdb8632d94e7c93f01dd20bf0d247
CREATE OR REPLACE FUNCTION public.force_no_account_on_compensation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Compensacao e encontro de contas sem movimento de caixa: nunca pode ter
  -- conta, senao entra na formula do saldo (que soma por t.account_id) e
  -- inflaciona a conta com dinheiro que nunca la entrou.
  -- Precedente: 4 transacoes do Coala, 103.467,78 EUR, apontadas ao Santander;
  -- so nao corromperam o saldo porque sao anteriores a data de corte de 31/08.
  IF NEW.payment_method = 'compensation' AND NEW.account_id IS NOT NULL THEN
    NEW.account_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

ALTER FUNCTION public.force_no_account_on_compensation() OWNER TO "postgres";
-- END OPERATION 5e755ec6ed0956b3e647e73434552a6bfd7fdb8632d94e7c93f01dd20bf0d247
