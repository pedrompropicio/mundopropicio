import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

interface EditReservation {
  id: string;
  date: string;
  venue_id: string;
  city_id: string | null;
  notes: string | null;
}

interface VenueReservationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  editReservation?: EditReservation | null;
}

export function VenueReservationModal({ open, onOpenChange, defaultDate, editReservation }: VenueReservationModalProps) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [cityId, setCityId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditing = !!editReservation;

  // Populate fields when editing
  useEffect(() => {
    if (editReservation && open) {
      setDate(editReservation.date);
      setVenueId(editReservation.venue_id);
      setCityId(editReservation.city_id || "");
      setNotes(editReservation.notes || "");
    } else if (!editReservation && open) {
      setDate(defaultDate || new Date().toISOString().slice(0, 10));
      setVenueId("");
      setCityId("");
      setNotes("");
    }
  }, [editReservation, open, defaultDate]);

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
    if (!date) { toast.error("Selecione uma data"); return; }
    if (!venueId) { toast.error("Selecione uma sala"); return; }

    setSaving(true);
    try {
      const selectedVenue = venues.find((v) => v.id === venueId);
      const payload = {
        date,
        venue_id: venueId,
        city_id: cityId || selectedVenue?.city_id || null,
        notes: notes.trim() || null,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("venue_reservations")
          .update(payload)
          .eq("id", editReservation!.id);
        if (error) throw error;
        toast.success("Reserva atualizada com sucesso");
      } else {
        const { error } = await supabase.from("venue_reservations").insert(payload);
        if (error) throw error;
        toast.success("Reserva de sala criada com sucesso");
      }

      queryClient.invalidateQueries({ queryKey: ["venue-reservations"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Erro ao ${isEditing ? "atualizar" : "criar"} reserva: ` + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? <Pencil className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
            {isEditing ? "Editar Reserva de Sala" : "Adicionar Reserva de Sala"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Data</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              autoFocus={!isEditing}
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

          <div className="space-y-2">
            <Label>Notas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: aguardar confirmação de disponibilidade"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "A guardar..." : isEditing ? "Guardar Alterações" : "Criar Reserva"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
