
ALTER TABLE public.ticket_sales
  ADD COLUMN source text NOT NULL DEFAULT 'manual';
