-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.user_supplier_id(pg_catalog.uuid)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "79f612bd13f3a93925c5711a65332791c5a5040fb9152e85b5ae64ef6e5f2e98", "live_properties_sha256": "3292eaccf777cf301e08dbfd61c0e227842c0180ddba649ce6abfd74d773cfdb", "oid": 146808, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "e6f23886bb68c3a634593e0a4da66991bb19f8be8620b30155e7b10d33225e23", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 8b610c2c97f9834b980b750c24f82062d7bae0d81ea3890455ccb9c96d907b0d
CREATE OR REPLACE FUNCTION public.user_supplier_id(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- A identidade do socio e SEMPRE a ligacao explicita (D-ERP63). O antigo
  -- recurso por coincidencia de email foi removido a 14/09/2026: atribuia a
  -- entidade errada a quem partilhasse dominio de email e fazia aparecer
  -- ligacoes que nao existiam. Medido antes de remover: os 8 parceiros tinham
  -- ligacao registada; so dois utilizadores (papel producer, sem acesso de
  -- parceiro) resolviam por email, e nenhuma politica lhes dava nada.
  SELECT p.linked_supplier_id FROM public.profiles p WHERE p.id = p_user_id;
$function$
;

ALTER FUNCTION public.user_supplier_id(pg_catalog.uuid) OWNER TO "postgres";
-- END OPERATION 8b610c2c97f9834b980b750c24f82062d7bae0d81ea3890455ccb9c96d907b0d
