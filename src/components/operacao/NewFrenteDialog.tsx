import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { setFrenteLead } from "@/lib/operacao-frente-lead";
import { NewProfileInlineDialog, NEW_PROFILE_SENTINEL } from "@/components/operacao/shared/NewProfileInlineDialog";

const PALETTE = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#6b7280"];

export function NewFrenteDialog({ onClose }: { onClose: () => void }) {
  const { user, isAdmin, hasPermission } = useAuth();
  const canCreateProfile = isAdmin || hasPermission("manage_users");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [eventId, setEventId] = useState<string>("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PALETTE[5]);
  const [leadId, setLeadId] = useState<string>("");
  const [type, setType] = useState<"zone" | "service">("zone");
  const [saving, setSaving] = useState(false);

  // Eventos não-completed para escolher
  const { data: events } = useQuery({
    queryKey: ["op-new-frente-events"],
    queryFn: async () => {
      const { data } = await supabase.from("events")
        .select("id,name,date,status,company_id")
        .in("status", ["planning", "active"])
        .order("date", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const selectedEvent = (events ?? []).find((e: any) => e.id === eventId);

  const { data: profiles } = useQuery({
    queryKey: ["op-new-frente-profiles", selectedEvent?.company_id],
    enabled: !!selectedEvent,
    queryFn: async () => {
      const { data } = await supabase.from("profiles")
        .select("id,full_name").eq("company_id", selectedEvent!.company_id).order("full_name");
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!user || !eventId || !name.trim() || !selectedEvent) return;
    setSaving(true);
    const { data: created, error } = await supabase.from("operacao_frentes").insert({
      event_id: eventId,
      company_id: selectedEvent.company_id,
      name: name.trim(),
      description: description.trim() || null,
      color,
      type,
      status: "active",
    }).select("id").single();
    if (error || !created) {
      setSaving(false);
      toast({ title: "Erro", description: error?.message ?? "Falha", variant: "destructive" });
      return;
    }
    if (leadId) {
      await supabase.from("operacao_frente_team").insert({
        frente_id: created.id,
        profile_id: leadId,
        company_id: selectedEvent.company_id,
        role_in_frente: "lead",
        is_permanent_lead: true,
        active: true,
      });
    }
    toast({ title: type === "service" ? "Serviço criado" : "Zona criada" });
    qc.invalidateQueries({ queryKey: ["op-my-frentes"] });
    setSaving(false);
    onClose();
    navigate(`/operacao/frente/${created.id}`);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Zona/Serviço</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Evento *</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger><SelectValue placeholder="Escolhe o evento" /></SelectTrigger>
              <SelectContent>
                {(events ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={type} onValueChange={(v) => setType(v as "zone" | "service")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="zone">Zona</SelectItem>
                <SelectItem value="service">Serviço</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Zona = setor físico (Tenda VIP, Backstage). Serviço = função transversal que pode atender várias zonas (Catering, Energia, Decoração).
            </p>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap mt-1">
              {PALETTE.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={"h-7 w-7 rounded-full border-2 " + (color === c ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {selectedEvent && (
            <div>
              <Label>Lead permanente (opcional)</Label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger><SelectValue placeholder="Sem lead" /></SelectTrigger>
                <SelectContent>
                  {(profiles ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={submit} disabled={saving || !name.trim() || !eventId} className="w-full">
            {saving ? "A criar..." : (type === "service" ? "Criar Serviço" : "Criar Zona")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
