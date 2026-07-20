import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { CityVenueSelector } from "@/components/CityVenueSelector";
import { toast } from "sonner";
import { X, Plus, Calendar } from "lucide-react";
import { formatCityLabel } from "@/lib/country";
import { createSubEventInTour, type SessionDraft } from "@/lib/create-sub-event";

interface AddSubEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  masterEventId: string;
  masterStatus: string;
  onCreated?: (newSubId: string) => void;
}

export function AddSubEventModal({ open, onOpenChange, masterEventId, masterStatus, onCreated }: AddSubEventModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [cityId, setCityId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [newExtraDate, setNewExtraDate] = useState("");
  const [sessions, setSessions] = useState<SessionDraft[]>([]);

  const { data: citiesMap = {} } = useQuery({
    queryKey: ["cities_map"],
    queryFn: async () => {
      const { data } = await supabase.from("cities" as any).select("*");
      const map: Record<string, string> = {};
      (data ?? []).forEach((c: any) => { map[c.id] = formatCityLabel(c.name, c.state); });
      return map;
    },
  });

  const { data: venuesMap = {} } = useQuery({
    queryKey: ["venues_map"],
    queryFn: async () => {
      const { data } = await supabase.from("venues" as any).select("*");
      const map: Record<string, any> = {};
      (data ?? []).forEach((v: any) => { map[v.id] = v; });
      return map;
    },
  });

  const reset = () => {
    setName(""); setDate(""); setCityId(""); setVenueId("");
    setExtraDates([]); setNewExtraDate(""); setSessions([]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !date) throw new Error("Nome e data são obrigatórios");
      return createSubEventInTour({
        parentId: masterEventId,
        parentStatus: masterStatus,
        sub: {
          name: name.trim(),
          date,
          city_id: cityId,
          venue_id: venueId,
          extra_dates: extraDates,
          sessions,
        },
        venuesMap,
        citiesMap,
      });
    },
    onSuccess: (newSubId) => {
      toast.success("Cidade adicionada à turnê");
      queryClient.invalidateQueries({ queryKey: ["sub_events", masterEventId] });
      queryClient.invalidateQueries({ queryKey: ["events_full"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      reset();
      onOpenChange(false);
      onCreated?.(newSubId);
    },
    onError: (e: any) => toast.error(`Erro: ${e?.message || String(e)}`),
  });

  const addExtraDate = () => {
    if (newExtraDate && !extraDates.includes(newExtraDate)) {
      setExtraDates([...extraDates, newExtraDate].sort());
      setNewExtraDate("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar cidade à turnê</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome da cidade / data *</Label>
              <Input
                placeholder="Ex.: RG - Faro"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data principal *</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cidade e sala</Label>
            <CityVenueSelector
              cityId={cityId}
              venueId={venueId}
              onCityChange={setCityId}
              onVenueChange={setVenueId}
            />
          </div>

          {/* Datas extra (torna sub em festival) */}
          <div className="space-y-2 rounded-lg border border-border/50 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Datas extra (opcional — converte em festival)
              </Label>
            </div>
            <div className="flex gap-2">
              <DatePicker value={newExtraDate} onChange={setNewExtraDate} />
              <Button type="button" variant="secondary" size="sm" onClick={addExtraDate} disabled={!newExtraDate}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {extraDates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {extraDates.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs">
                    <Calendar className="h-3 w-3" /> {d}
                    <button onClick={() => setExtraDates(extraDates.filter((x) => x !== d))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sessões */}
          <div className="space-y-2 rounded-lg border border-border/50 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Sessões (opcional)
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSessions([...sessions, { date: date || "", label: `Sessão ${sessions.length + 1}`, start_time: "" }])}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar sessão
              </Button>
            </div>
            {sessions.map((s, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input
                  className="col-span-4"
                  placeholder="Label"
                  value={s.label}
                  onChange={(e) => setSessions(sessions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <div className="col-span-4">
                  <DatePicker
                    value={s.date}
                    onChange={(d) => setSessions(sessions.map((x, j) => (j === i ? { ...x, date: d } : x)))}
                  />
                </div>
                <Input
                  className="col-span-3"
                  type="time"
                  value={s.start_time}
                  onChange={(e) => setSessions(sessions.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="col-span-1"
                  onClick={() => setSessions(sessions.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            ℹ️ A nova cidade herda automaticamente o conteúdo de marketing da mãe.
            O rateio das transações master passa a dividir por {"{"}novo N{"}"} datas.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || !date || createMutation.isPending}
          >
            {createMutation.isPending ? "A criar..." : "Adicionar cidade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
