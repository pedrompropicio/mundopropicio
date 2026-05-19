import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Trash2, Phone, Mail } from "lucide-react";
import { NewProfileInlineDialog, NEW_PROFILE_SENTINEL } from "@/components/operacao/shared/NewProfileInlineDialog";

const ELIGIBLE_LEAD_ROLES = ["platform_admin", "admin", "manager", "producer"];

// Converte ISO timestamp -> string para <input type="datetime-local"> (yyyy-MM-ddTHH:mm em hora local)
function isoToLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditEtapaSheet({
  etapaId, open, onClose,
}: { etapaId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { isAdmin, hasPermission } = useAuth();
  const canCreateProfile = isAdmin || hasPermission("manage_users");

  const { data: etapa } = useQuery({
    queryKey: ["op-edit-etapa", etapaId],
    enabled: !!etapaId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_etapas")
        .select("id,name,escopo,frente_id,zone_id,planned_start,planned_end,responsible_profile_id,supplier_id,company_id, frente:operacao_frentes!operacao_etapas_frente_id_fkey(id,type,event_id,company_id)")
        .eq("id", etapaId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const frente = (etapa as any)?.frente;
  const companyId: string | undefined = etapa?.company_id ?? frente?.company_id;
  const isService = frente?.type === "service";

  const [name, setName] = useState("");
  const [escopo, setEscopo] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNewProfile, setShowNewProfile] = useState(false);

  useEffect(() => {
    if (!etapa) return;
    setName(etapa.name ?? "");
    setEscopo(etapa.escopo ?? "");
    setZoneId(etapa.zone_id ?? "");
    setPlannedStart(isoToLocalInput(etapa.planned_start));
    setPlannedEnd(isoToLocalInput(etapa.planned_end));
    setResponsibleId(etapa.responsible_profile_id ?? "");
    setSupplierId(etapa.supplier_id ?? "");
  }, [etapa?.id]);

  const { data: zones } = useQuery({
    queryKey: ["op-zones-for-event", frente?.event_id],
    enabled: isService && !!frente?.event_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name")
        .eq("event_id", frente!.event_id)
        .eq("type", "zone")
        .neq("status", "cancelled")
        .order("name");
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["op-edit-etapa-profiles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", companyId!)
        .in("role", ELIGIBLE_LEAD_ROLES as any);
      const eligibleIds = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
      if (eligibleIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("company_id", companyId!)
        .is("archived_at", null)
        .in("id", eligibleIds)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["op-edit-etapa-suppliers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id,name,email,phone")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name")
        .limit(2000);
      return data ?? [];
    },
  });

  const selectedSupplier = (suppliers ?? []).find((s: any) => s.id === supplierId);
  const datesInvalid = plannedStart && plannedEnd && new Date(plannedEnd) < new Date(plannedStart);

  const handleResponsibleSelect = (v: string) => {
    if (v === NEW_PROFILE_SENTINEL) { setShowNewProfile(true); return; }
    if (v === "__none__") { setResponsibleId(""); return; }
    setResponsibleId(v);
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["op-etapa", etapaId] });
    qc.invalidateQueries({ queryKey: ["op-edit-etapa", etapaId] });
    if (etapa?.frente_id) {
      qc.invalidateQueries({ queryKey: ["op-etapas", etapa.frente_id] });
      qc.invalidateQueries({ queryKey: ["op-etapas-table", etapa.frente_id] });
    }
    qc.invalidateQueries({ queryKey: ["op-hub-planning"] });
  };

  const save = async () => {
    if (!etapa || !name.trim()) return;
    if (datesInvalid) {
      toast({ title: "Data limite antes do início", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("operacao_etapas").update({
      name: name.trim(),
      escopo: escopo.trim() || null,
      zone_id: isService && zoneId ? zoneId : null,
      planned_start: plannedStart ? new Date(plannedStart).toISOString() : null,
      planned_end: plannedEnd ? new Date(plannedEnd).toISOString() : null,
      responsible_profile_id: responsibleId || null,
      supplier_id: supplierId || null,
    }).eq("id", etapa.id);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Etapa atualizada" });
    invalidateAll();
    onClose();
  };

  const remove = async () => {
    if (!etapa) return;
    if (!confirm("Eliminar esta etapa? Esta ação não pode ser revertida.")) return;
    setSaving(true);
    const { error } = await supabase.from("operacao_etapas").delete().eq("id", etapa.id);
    setSaving(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Etapa eliminada" });
    invalidateAll();
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Editar etapa</SheetTitle></SheetHeader>
        {!etapa ? (
          <p className="text-sm text-muted-foreground mt-4">A carregar…</p>
        ) : (
          <div className="space-y-3 mt-4">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Escopo</Label>
              <Input value={escopo} onChange={(e) => setEscopo(e.target.value)} />
            </div>

            {isService && (
              <div>
                <Label>Zona que atende</Label>
                <Select value={zoneId || "__none__"} onValueChange={(v) => setZoneId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Nenhuma —</SelectItem>
                    {(zones ?? []).map((z: any) => (
                      <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <Label>Data início prevista</Label>
                <Input type="datetime-local" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
              </div>
              <div className="flex-1">
                <Label>Data limite prevista</Label>
                <Input type="datetime-local" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
              </div>
            </div>
            {datesInvalid && (
              <p className="text-xs text-muted-foreground">Data limite antes do início.</p>
            )}

            <div>
              <Label>Responsável</Label>
              <Select value={responsibleId || "__none__"} onValueChange={handleResponsibleSelect}>
                <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem responsável —</SelectItem>
                  {(profiles ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                  {canCreateProfile && (
                    <SelectItem value={NEW_PROFILE_SENTINEL} className="text-primary font-medium">
                      + Nova pessoa…
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Fornecedor principal</Label>
              <Select value={supplierId || "__none__"} onValueChange={(v) => setSupplierId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Sem fornecedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem fornecedor —</SelectItem>
                  {(suppliers ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSupplier && (
                <div className="mt-2 p-2 rounded-md bg-muted/50 text-xs space-y-1">
                  {selectedSupplier.phone || selectedSupplier.email ? (
                    <>
                      {selectedSupplier.phone && (
                        <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {selectedSupplier.phone}</div>
                      )}
                      {selectedSupplier.email && (
                        <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {selectedSupplier.email}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">Sem contactos registados</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-3 border-t">
              <Button onClick={save} disabled={saving || !name.trim() || !!datesInvalid} className="flex-1">
                {saving ? "A guardar…" : "Guardar"}
              </Button>
              <Button variant="destructive" size="icon" onClick={remove} disabled={saving} title="Eliminar etapa">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {showNewProfile && companyId && (
          <NewProfileInlineDialog
            companyId={companyId}
            defaultRole="producer"
            invalidateKeys={[["op-edit-etapa-profiles", companyId]]}
            onClose={() => setShowNewProfile(false)}
            onCreated={(id) => { setResponsibleId(id); setShowNewProfile(false); }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
