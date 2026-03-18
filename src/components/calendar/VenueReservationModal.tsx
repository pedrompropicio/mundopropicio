import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface VenueReservationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
}

export function VenueReservationModal({ open, onOpenChange, defaultDate }: VenueReservationModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [date, setDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [cityId, setCityId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: cities = [] } = useQuery({
    queryKey: ["calendar-cities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cities").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: venues = [] } = useQuery({
    queryKey: ["calendar-venues-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("venues").select("id, name, city_id").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filteredVenues = useMemo(() => {
    if (!cityId) return venues;
    return venues.filter((v) => v.city_id === cityId);
  }, [venues, cityId]);

  const cityOptions = cities.map((c) => ({ value: c.id, label: c.name }));
  const venueOptions = filteredVenues.map((v) => ({ value: v.id, label: v.name }));

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Preencha o nome do evento"); return; }
    if (!date) { toast.error("Selecione uma data"); return; }
    if (!venueId) { toast.error("Selecione uma sala"); return; }

    setSaving(true);
    try {
      const selectedVenue = venues.find((v) => v.id === venueId);
      const { error } = await supabase.from("events").insert({
        name: name.trim(),
        date,
        venue_id: venueId,
        city_id: cityId || selectedVenue?.city_id || null,
        status: "planning",
        event_type: "simple",
      });
      if (error) throw error;

      toast.success("Reserva de sala criada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onOpenChange(false);
      setName("");
      setVenueId("");
      setCityId("");
    } catch (err: any) {
      toast.error("Erro ao criar reserva: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Adicionar Reserva de Sala
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Nome do Evento</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Concerto de Verão"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Data</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Cidade</Label>
            <SearchableSelect
              options={cityOptions}
              value={cityId}
              onValueChange={(val) => {
                setCityId(val);
                setVenueId("");
              }}
              placeholder="Selecionar cidade..."
            />
          </div>

          <div className="space-y-2">
            <Label>Sala de Espetáculo</Label>
            <SearchableSelect
              options={venueOptions}
              value={venueId}
              onValueChange={setVenueId}
              placeholder="Selecionar sala..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "A guardar..." : "Criar Reserva"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}