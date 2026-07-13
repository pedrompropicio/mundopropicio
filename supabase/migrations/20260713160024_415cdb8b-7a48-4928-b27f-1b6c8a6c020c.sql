ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linked_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_linked_supplier ON public.profiles(linked_supplier_id);