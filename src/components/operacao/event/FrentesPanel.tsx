import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MapPin, Wrench, Plus, ChevronRight, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { EditFrenteSheet } from "@/components/operacao/event/EditFrenteSheet";
import { NewFrenteDialog } from "@/components/operacao/NewFrenteDialog";

function initials(n?: string | null) {
  if (!n) return "?";
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function FrentesPanel({
  eventId, companyId, type, canManage,
}: { eventId: string; companyId: string; type: "zone" | "service"; canManage: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openAdd, setOpenAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);


  const { data: frentes } = useQuery({
    queryKey: ["op-hub-frentes", eventId, type],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color,current_lead_id, lead:profiles!operacao_frentes_current_lead_id_fkey(full_name)")
        .eq("event_id", eventId).eq("type", type).neq("status", "cancelled")
        .order("display_order");
      return data ?? [];
    },
  });

  const ids = (frentes ?? []).map((f: any) => f.id);
  const { data: counts } = useQuery({
    queryKey: ["op-hub-frente-counts", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("operacao_etapas").select("frente_id").in("frente_id", ids);
      const out: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { out[r.frente_id] = (out[r.frente_id] ?? 0) + 1; });
      return out;
    },
  });

  const seedTemplate = async (kind: "festival" | "indoor" | "conferencia" | "blank") => {
    if (kind === "blank") { setOpenAdd(true); return; }
    if (type !== "zone") return;
    // Currently the only seed helper. Filter to zones.
    if (kind === "festival") {
      const { data, error } = await supabase.rpc("seed_operacao_frentes_default", { p_event_id: eventId });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      // ensure type=zone (seed function doesn't set type, default is 'zone' already)
      toast({ title: `${data ?? 0} zonas criadas` });
      qc.invalidateQueries({ queryKey: ["op-hub-frentes", eventId, type] });
      return;
    }
    toast({ title: "Template em breve", description: "Por agora usa Festival ou cria manualmente." });
  };

  const label = type === "zone" ? "Zona" : "Serviço";
  const labelPlural = type === "zone" ? "Zonas físicas do evento" : "Serviços transversais";
  const Icon = type === "zone" ? MapPin : Wrench;

  return (
    <Card className="p-5 glass">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Icon className="h-4 w-4" /> {labelPlural}
        </h2>
        {canManage && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setOpenAdd(true)}>
              <Plus className="h-3 w-3 mr-1" /> {label}
            </Button>
            {type === "zone" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost">Template</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => seedTemplate("festival")}>Festival</DropdownMenuItem>
                  {/* TODO: adicionar Indoor / Conferência quando templates forem implementados (seed_operacao_frentes_default só cobre festival) */}
                  <DropdownMenuItem onClick={() => seedTemplate("blank")}>Em branco</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {(frentes ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Sem {label.toLowerCase()}s ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {(frentes ?? []).map((f: any) => (
            <div
              key={f.id}
              className="flex items-center gap-3 p-2 rounded border cursor-pointer hover:bg-muted/40"
              onClick={() => navigate(`/operacao/frente/${f.id}`)}
            >
              <div className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: f.color ?? "#6b7280" }} />
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px]">{initials(f.lead?.full_name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.name}</p>
                {f.lead?.full_name ? (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {f.lead.full_name} · {counts?.[f.id] ?? 0} etapas
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground truncate italic">
                    Sem produtor responsável
                    {canManage && (
                      <button
                        type="button"
                        className="ml-2 not-italic text-primary hover:underline"
                        onClick={(ev) => { ev.stopPropagation(); setEditId(f.id); }}
                      >
                        + atribuir
                      </button>
                    )}
                    {" · "}{counts?.[f.id] ?? 0} etapas
                  </p>
                )}
              </div>
              {canManage && (
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={(ev) => { ev.stopPropagation(); setEditId(f.id); }}
                  title="Editar"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}

      <EditFrenteSheet
        frenteId={editId}
        open={!!editId}
        onClose={() => setEditId(null)}
      />


      {openAdd && (
        <AddFrenteInlineDialog
          eventId={eventId}
          companyId={companyId}
          type={type}
          onClose={() => setOpenAdd(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ["op-hub-frentes", eventId, type] })}
        />
      )}
    </Card>
  );
}

function AddFrenteInlineDialog({
  eventId, companyId, type, onClose, onCreated,
}: { eventId: string; companyId: string; type: "zone" | "service"; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[5]);
  const [leadId, setLeadId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ["op-hub-add-frente-profiles", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name").eq("company_id", companyId).is("archived_at", null).order("full_name");
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { data: created, error } = await supabase.from("operacao_frentes").insert({
      event_id: eventId, company_id: companyId, name: name.trim(), color, type, status: "active",
      current_lead_id: leadId || null,
    }).select("id").single();
    if (error || !created) {
      setSaving(false);
      toast({ title: "Erro", description: error?.message ?? "Falha", variant: "destructive" });
      return;
    }
    if (leadId) {
      await supabase.from("operacao_frente_team").insert({
        frente_id: created.id, profile_id: leadId, company_id: companyId,
        role_in_frente: "lead", is_permanent_lead: true, active: true,
      });
    }
    toast({ title: `${type === "zone" ? "Zona" : "Serviço"} criada` });
    setSaving(false);
    onCreated();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova {type === "zone" ? "Zona" : "Serviço"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
          <div>
            <Label>Responsável (opcional)</Label>
            <Select value={leadId} onValueChange={setLeadId}>
              <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
              <SelectContent>
                {(profiles ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={saving || !name.trim()} className="w-full">
            {saving ? "A criar…" : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
