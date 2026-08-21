import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_TARGET_ROAS } from "@/lib/crm/dashboard-format";

/** Edição da meta de ROAS do evento (public.events.target_roas). NULL ⇒ fallback 8x. */
export function TargetRoasEditor({
  eventId,
  value,
  onSaved,
}: {
  eventId: string;
  value: number | null | undefined;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  const save = async (clear = false) => {
    const parsed = clear ? null : Number(text.replace(",", "."));
    if (!clear && (!Number.isFinite(parsed as number) || (parsed as number) <= 0)) {
      toast.error("Meta inválida", { description: "Indica um número maior que zero." });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("events")
      .update({ target_roas: clear ? null : parsed })
      .eq("id", eventId);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível gravar a meta", { description: error.message });
      return;
    }
    toast.success(clear ? `Meta reposta no padrão (${DEFAULT_TARGET_ROAS}x)` : `Meta ${parsed}x gravada`);
    setOpen(false);
    onSaved?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground rounded px-1 py-0.5 hover:bg-muted"
          title="Editar meta de ROAS do evento"
        >
          <Pencil className="h-3 w-3" />
          Meta
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1.5">
          <Label className="text-xs">Meta de ROAS do evento</Label>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={String(DEFAULT_TARGET_ROAS)}
            inputMode="decimal"
            className="h-8 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Vazio ou reposto usa o padrão de {DEFAULT_TARGET_ROAS}x.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => save(false)}>
            {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Gravar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={saving}
            onClick={() => save(true)}
          >
            Repor padrão
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
