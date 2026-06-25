
UPDATE crm.campaign_design cd
SET adsets = (
  SELECT jsonb_agg(
    CASE
      WHEN adset->>'trigger_nome' = 'Momento do artista/evento' THEN
        jsonb_set(adset, '{pecas}', (
          SELECT COALESCE(jsonb_agg(p), '[]'::jsonb)
          FROM jsonb_array_elements(adset->'pecas') p
          WHERE p->>'creative_id' NOT IN (
            'b231fb68-6d53-4f0c-8405-fbcbcdab261e',
            '64425b67-03b8-4998-9c41-33183cd043c0',
            'a19fc4b4-e4cf-43d7-a02d-f17ea151c0d9'
          )
        ))
      ELSE adset
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(cd.adsets) WITH ORDINALITY a(adset, ord)
)
WHERE cd.id = '8e1e501a-48e4-44a7-b9be-2333f5e697e5';
