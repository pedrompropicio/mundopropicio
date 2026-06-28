ALTER TABLE public.meta_custom_audiences
  ADD COLUMN event_id uuid NULL REFERENCES public.events(id) ON DELETE SET NULL;

ALTER TABLE public.meta_custom_audiences
  ADD COLUMN is_primary_purchase boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX uq_meta_custom_audiences_primary_purchase_per_event
  ON public.meta_custom_audiences (event_id)
  WHERE is_primary_purchase = true AND event_id IS NOT NULL;

CREATE INDEX ix_meta_custom_audiences_event_id
  ON public.meta_custom_audiences (event_id)
  WHERE event_id IS NOT NULL;