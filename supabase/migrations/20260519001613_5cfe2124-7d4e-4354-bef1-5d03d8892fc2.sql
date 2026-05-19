-- MP Operação Batch 1 v2 — Parte 1/2: enum + campo events
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'field_producer';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS operacao_mode text NOT NULL DEFAULT 'planning'
  CHECK (operacao_mode IN ('planning','montagem','evento','post'));