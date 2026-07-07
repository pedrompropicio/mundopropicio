import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  eventId: string;
  eventName: string;
  parentEventId: string | null;
  eventType: string | null;
  disabled?: boolean;
}

interface TourCity {
  id: string;
  name: string;
  date: string | null;
}

export function CopyTourContentDialog({ eventId, eventName, parentEventId, eventType, disabled }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<Record<string, boolean>>({});
  const [includeMarketing, setIncludeMarketing] = useState(true);
  const [includeFaqs, setIncludeFaqs] = useState(true);
  const [includeLineup, setIncludeLineup] = useState(true);

  const isTour = !!parentEventId || eventType === "multi_day";
  const tourParentId = parentEventId ?? eventId;

  const citiesQuery = useQuery({
    queryKey: ["crm-tour-cities", tourParentId],
    enabled: open && isTour,
    queryFn: async (): Promise<TourCity[]> => {
      const { data, error } = await (supabase as any)
        .from("events")
        .select("id, name, date")
        .eq("parent_event_id", tourParentId)
        .order("date");
      if (error) throw error;
      return (data ?? []).filter((e: TourCity) => e.id !== eventId);
    },
  });

  useEffect(() => {
    if (citiesQuery.data) {
      const init: Record<string, boolean> = {};
      citiesQuery.data.forEach((c) => { init[c.id] = true; });
      setSelectedTargets(init);
    }
  }, [citiesQuery.data]);

  const selectedIds = useMemo(
    () => Object.entries(selectedTargets).filter(([, v]) => v).map(([k]) => k),
    [selectedTargets]
  );

  const copyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("copy_event_tour_content", {
        p_source: eventId,
        p_targets: selectedIds,
        p_include_marketing: includeMarketing,
        p_include_faqs: includeFaqs,
        p_include_lineup: includeLineup,
      });
      if (error) throw error;
      return data as { targets: number; marketing_rows: number; faq_rows: number; lineup_rows: number };
    },
    onSuccess: (res) => {
      toast.success(
        `Copiado para ${res.targets} cidade(s): ${res.marketing_rows} marketing, ${res.faq_rows} FAQ, ${res.lineup_rows} line-up.`
      );
      qc.invalidateQueries({ queryKey: ["crm-eventos-list"] });
      qc.invalidateQueries({ queryKey: ["crm-event-marketing"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(`Falha: ${e.message ?? e}`),
  });

  if (!isTour) return null;

  const canCopy = selectedIds.length > 0 && (includeMarketing || includeFaqs || includeLineup);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Copy className="mr-1 h-4 w-4" /> Copiar para cidades do tour
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copiar marketing para cidades do tour</DialogTitle>
          <DialogDescription>
            Isto <strong>SOBRESCREVE</strong> o marketing/FAQ/line-up das cidades selecionadas com o conteúdo de «{eventName}».
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">Conteúdo a copiar</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeMarketing} onCheckedChange={(v) => setIncludeMarketing(!!v)} />
                Marketing (hero, media, experiências, SEO, oferta…)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeFaqs} onCheckedChange={(v) => setIncludeFaqs(!!v)} />
                FAQ
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeLineup} onCheckedChange={(v) => setIncludeLineup(!!v)} />
                Line-up
              </label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Cidades-destino</p>
            {citiesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> A carregar cidades…
              </div>
            ) : (citiesQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem outras cidades neste tour.</p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded border border-border p-2">
                {citiesQuery.data!.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                    <Checkbox
                      checked={!!selectedTargets[c.id]}
                      onCheckedChange={(v) => setSelectedTargets((s) => ({ ...s, [c.id]: !!v }))}
                    />
                    <span className="flex-1">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.date ?? "—"}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={copyMutation.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => copyMutation.mutate()}
            disabled={!canCopy || copyMutation.isPending}
          >
            {copyMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Copiar ({selectedIds.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
