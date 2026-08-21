import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import type { CampaignRow, EventRow } from "@/components/crm/dashboard/types";

// ============================================================
// Reassign Campaign to Split (popover) — para tour_master families
// ============================================================
export function ReassignCampaignToSplit({
  campaign,
  master,
  splits,
  onReassigned,
}: {
  campaign: CampaignRow;
  master: EventRow;
  splits: EventRow[];
  onReassigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const initialId = campaign.linked_event_id ?? master.id;
  const [pendingId, setPendingId] = useState<string>(initialId);
  // Default lock=true: reassignment manual deve ficar pegado contra auto-linker.
  // Se a campanha já estava locked, mantém-se locked; se não estava, fica locked após Apply.
  const [lock, setLock] = useState<boolean>(campaign.linked_event_locked ?? true);
  const [saving, setSaving] = useState(false);

  // Re-sincroniza estado quando a popover abre (caso o user mude a campanha entretanto)
  useEffect(() => {
    if (open) {
      setPendingId(campaign.linked_event_id ?? master.id);
      setLock(campaign.linked_event_locked ?? true);
    }
  }, [open, campaign.linked_event_id, campaign.linked_event_locked, master.id]);

  const apply = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .schema("crm")
        .from("meta_campaign_snapshot")
        .update({ linked_event_id: pendingId, linked_event_locked: lock })
        .eq("id", campaign.id);
      if (error) throw error;
      toast.success("Linkage actualizado");
      setOpen(false);
      onReassigned();
    } catch (e: any) {
      toast.error(e?.message || "Falha a actualizar linkage");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="opacity-60 hover:opacity-100 transition-opacity p-1 rounded hover:bg-cyan-500/10"
          title="Apontar a uma cidade (split) ou ao master"
        >
          <MapPin className="h-3.5 w-3.5 text-cyan-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold mb-2">Apontar campanha a:</p>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="radio"
              name={`reassign-${campaign.id}`}
              checked={pendingId === master.id}
              onChange={() => setPendingId(master.id)}
              disabled={saving}
            />
            <span><strong>Master / blended</strong> · {master.name}</span>
          </label>
          {splits.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name={`reassign-${campaign.id}`}
                checked={pendingId === s.id}
                onChange={() => setPendingId(s.id)}
                disabled={saving}
              />
              <span>{s.name}{s.date && ` · ${format(parseISO(s.date), "dd MMM", { locale: ptBR })}`}</span>
            </label>
          ))}
        </div>
        <hr className="my-2 border-border" />
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={lock}
            onChange={(e) => setLock(e.target.checked)}
            disabled={saving}
          />
          <span>Bloquear contra auto-linker</span>
        </label>
        <Button size="sm" className="w-full mt-3" onClick={apply} disabled={saving || pendingId === initialId && lock === (campaign.linked_event_locked ?? false)}>
          {saving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
          Aplicar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
