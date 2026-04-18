ALTER TABLE public.event_forecasts
ADD COLUMN attachment_refs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.event_forecasts.attachment_refs IS 'Array of external attachment URLs (Drive, Dropbox, etc.) imported from BP spreadsheet columns G-K. Format: [{"url": "https://...", "name": "optional"}]';