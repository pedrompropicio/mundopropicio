-- Adicionar coluna parent_item_id para suportar split de talões mistos
ALTER TABLE public.camarim_items
ADD COLUMN IF NOT EXISTS parent_item_id uuid NULL
REFERENCES public.camarim_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_camarim_items_parent_item_id
ON public.camarim_items(parent_item_id)
WHERE parent_item_id IS NOT NULL;

COMMENT ON COLUMN public.camarim_items.parent_item_id IS
'Quando preenchido, este item é um filho de um talão misto dividido. O pai tem status=split e fica fora dos cálculos de gasto.';