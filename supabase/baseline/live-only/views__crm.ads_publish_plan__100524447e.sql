-- #352 G3: local disposable replay only. Never apply to Live.
-- object: views:crm.ads_publish_plan
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "9eb1e4c69a77a8ad43853addf3e09be4d227132d01948209ff605a21298cdff3", "live_properties_sha256": "2a7c6d0273e489edcb93f1fbe845f4a2fc546f10153bdfc59ef672cab1f84828", "oid": 239755, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "bd531f68225679d4037d2e5d87705ea254899dc469f041c5a2f9660cee597c85", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 841f6d242768084acf99ad1094384f9142d50db358569077fb3f9b79256c640e
CREATE OR REPLACE VIEW crm.ads_publish_plan WITH (security_invoker=true) AS  SELECT id,
    company_id,
    event_id,
    design_id,
    objetivo,
    orcamento_total_cents,
    moeda,
    adsets,
    estado,
    resumo,
    created_by,
    created_at,
    updated_at,
    meta_campaign_id,
    publish_started_at,
    publish_finished_at,
    publish_error,
    link_destino,
    published_at,
    activated_at,
    activated_by,
    activation_error,
    start_time,
    end_time,
    artist_id,
    song_id,
    connection_id,
    platform,
    external_campaign_id
   FROM crm.meta_publish_plan;

ALTER VIEW crm.ads_publish_plan OWNER TO "postgres";
-- END OPERATION 841f6d242768084acf99ad1094384f9142d50db358569077fb3f9b79256c640e
