import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Phone, Mail } from "lucide-react";
import { NewProfileInlineDialog, NEW_PROFILE_SENTINEL } from "@/components/operacao/shared/NewProfileInlineDialog";

const ELIGIBLE_LEAD_ROLES = ["platform_admin", "admin", "manager", "producer"];

export function NewEtapaDialog({ frenteId, companyId, onClose }: { frenteId: string; companyId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { isAdmin, hasPermission } = useAuth();
  const canCreateProfile = isAdmin || hasPermission("manage_users");

  const [name, setName] = useState("");
  const [escopo, setEscopo] = useState("");
  const [zoneId, setZoneId] = useState<string>("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [responsibleId, setResponsibleId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [showNewProfile, setShowNewProfile] = useState(false);

  const { data: frente } = useQuery({
    queryKey: ["op-new-etapa-frente", frenteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,type,event_id")
        .eq("id", frenteId)
        .maybeSingle();
      return data;
    },
  });

  const isService = (frente as any)?.type === "service";

  const { data: zones } = useQuery({
    queryKey: ["op-zones-for-event", (frente as any)?.event_id],
    enabled: isService && !!(frente as any)?.event_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("operacao_frentes")
        .select("id,name,color")
        .eq("event_id", (frente as any).event_id)
        .eq("type", "zone")
        .neq("status", "cancelled")
        .order("name");
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["op-new-etapa-profiles", companyId],
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", companyId)
        .in("role", ELIGIBLE_LEAD_ROLES as any);
      const eligibleIds = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
      if (eligibleIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name")
        .eq("company_id", companyId)
        .is("archived_at", null)
        .in("id", eligibleIds)
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["op-new-etapa-suppliers", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id,name,email,phone")
        .eq("company_id", companyId)
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

  const submit = async () => {
    if (!name.trim()) return;
    if (datesInvalid) {
      toast({ title: "Data limite antes do início", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: created, error } = await supabase.from("operacao_etapas").insert({
      frente_id: frenteId,
      company_id: companyId,
      name: name.trim(),
      escopo: escopo.trim() || null,
      status: "pending",
      zone_id: isService && zoneId ? zoneId : null,
      planned_start: plannedStart ? new Date(plannedStart).toISOString() : null,
      planned_end: plannedEnd ? new Date(plannedEnd).toISOString() : null,
      responsible_profile_id: responsibleId || null,
      supplier_id: supplierId || null,
    }).select("id").single();

    if (error || !created) {
      setSaving(false);
      toast({ title: "Erro", description: error?.message ?? "Falha", variant: "destructive" });
      return;
    }

    if (supplierId) {
      const { error: mnErr } = await supabase.from("operacao_etapa_suppliers").insert({
        etapa_id: created.id,
        supplier_id: supplierId,
        company_id: companyId,
        role: "principal",
      } as any);
      if (mnErr) {
        // não bloqueia o fluxo; o supplier_id legacy ficou guardado
        console.warn("Falha a inserir etapa_supplier M:N:", mnErr.message);
      }
    }

    setSaving(false);
    toast({ title: "Etapa criada" });
    qc.invalidateQueries({ queryKey: ["op-etapas", frenteId] });
    qc.invalidateQueries({ queryKey: ["op-etapas-table", frenteId] });
    qc.invalidateQueries({ queryKey: ["op-hub-planning"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova etapa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Escopo (opcional)</Label>
            <Input value={escopo} onChange={(e) => setEscopo(e.target.value)} />
          </div>

          {isService && (
            <div>
              <Label>Zona que atende</Label>
              <Select value={zoneId || "__none__"} onValueChange={(v) => setZoneId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma (etapa geral do serviço) —</SelectItem>
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
            <Label>Responsável (opcional)</Label>
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
            <Label>Fornecedor principal (opcional)</Label>
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

          <Button onClick={submit} disabled={saving || !name.trim() || !!datesInvalid} className="w-full">
            {saving ? "A guardar..." : "Criar"}
          </Button>
        </div>

        {showNewProfile && (
          <NewProfileInlineDialog
            companyId={companyId}
            defaultRole="producer"
            invalidateKeys={[["op-new-etapa-profiles", companyId]]}
            onClose={() => setShowNewProfile(false)}
            onCreated={(id) => { setResponsibleId(id); setShowNewProfile(false); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
