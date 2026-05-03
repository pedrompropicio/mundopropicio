WITH agg AS (
  SELECT event_date_id, zone_id, SUM(quantity)::int AS qty,
         (array_agg(event_id))[1]   AS event_id,
         (array_agg(company_id))[1] AS company_id
    FROM public.event_courtesies
   GROUP BY event_date_id, zone_id
)
INSERT INTO public.event_courtesies (event_id, event_date_id, zone_id, scenario, quantity, company_id)
SELECT a.event_id, a.event_date_id, a.zone_id, 'real', a.qty, a.company_id
  FROM agg a
  LEFT JOIN public.event_courtesies ec
    ON ec.event_date_id = a.event_date_id
   AND ec.zone_id = a.zone_id
   AND ec.scenario = 'real'
 WHERE ec.id IS NULL;

UPDATE public.event_courtesies r
   SET quantity = agg.qty
  FROM (
    SELECT event_date_id, zone_id, SUM(quantity)::int AS qty
      FROM public.event_courtesies
     GROUP BY event_date_id, zone_id
  ) agg
 WHERE r.scenario = 'real'
   AND r.event_date_id = agg.event_date_id
   AND r.zone_id = agg.zone_id;

DELETE FROM public.event_courtesies WHERE scenario IN ('breakeven','forecast');

ALTER TABLE public.event_courtesies
  DROP CONSTRAINT IF EXISTS event_courtesies_unique;

ALTER TABLE public.event_courtesies
  ADD CONSTRAINT event_courtesies_unique_day_zone UNIQUE (event_date_id, zone_id);

ALTER TABLE public.event_courtesies
  ALTER COLUMN scenario SET DEFAULT 'real';