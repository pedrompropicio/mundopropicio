import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Loader2, Calendar, Map, MapPin } from "lucide-react";
import { type CamarimSessionMode, SESSION_MODE_LABELS, SESSION_MODE_DESCRIPTIONS } from "@/lib/camarim-helpers";
import { FundHolderPicker, type FundHolderValue } from "./FundHolderPicker";

interface EventOption {
  id: string;
  name: string;
  date: string | null;
  parent_event_id: string | null;
}

interface ProfileOption {
  id: string;
  full_name: string;
  email: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (sessionId: string) => void;
}

export function OpenSessionModal({ open, onOpenChange, onCreated }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mode, setMode] = useState<CamarimSessionMode>("single_event");
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState<string>("0");
  const [responsibleId, setResponsibleId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [masters, setMasters] = useState<EventOption[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedMasterId, setSelectedMasterId] = useState<string>("");
  const [selectedSplitIds, setSelectedSplitIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [fundHolder, setFundHolder] = useState<FundHolderValue>({
    type: "employee",
    supplierId: null,
    userId: null,
  });

  useEffect(() => {
    if (!open) return;
    void loadData();
  }, [open]);

  const loadData = async () => {
    const [{ data: ev }, { data: pf }] = await Promise.all([
      supabase
        .from("events")
        .select("id,name,date,parent_event_id")
        .order("date", { ascending: false })
        .limit(500),
      supabase.from("profiles").select("id,full_name,email").order("full_name").limit(200),
    ]);
    setEvents((ev ?? []) as EventOption[]);
    setMasters(((ev ?? []) as EventOption[]).filter((e) => !e.parent_event_id));
    setProfiles((pf ?? []) as ProfileOption[]);
  };

  const splitsOfMaster = useMemo(
    () => events.filter((e) => e.parent_event_id === selectedMasterId),
    [events, selectedMasterId],
  );

  const reset = () => {
    setMode("single_event");
    setTitle("");
    setBudget("0");
    setResponsibleId("");
    setNotes("");
    setSelectedEventId("");
    setSelectedMasterId("");
    setSelectedSplitIds([]);
    setFundHolder({ type: "employee", supplierId: null, userId: null });
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "Título obrigatório" });
      return;
    }
    if (mode === "single_event" && !selectedEventId) {
      toast({ variant: "destructive", title: "Seleciona o evento" });
      return;
    }
    if ((mode === "tour_consolidated" || mode === "city_session") && !selectedMasterId) {
      toast({ variant: "destructive", title: "Seleciona a turnê (Master)" });
      return;
    }
    if (mode === "tour_consolidated" && selectedSplitIds.length === 0) {
      toast({ variant: "destructive", title: "Seleciona pelo menos uma cidade" });
      return;
    }
    if (mode === "city_session" && selectedSplitIds.length === 0) {
      toast({ variant: "destructive", title: "Seleciona as cidades (uma sessão será criada por cidade)" });
      return;
    }
    if (fundHolder.type === "employee" && !fundHolder.userId) {
      toast({ variant: "destructive", title: "Seleciona o colaborador responsável pelo caixa" });
      return;
    }
    if (fundHolder.type === "supplier" && !fundHolder.supplierId) {
      toast({ variant: "destructive", title: "Seleciona o prestador responsável pelo caixa" });
      return;
    }

    setSaving(true);
    try {
      const budgetNum = parseFloat(budget) || 0;

      if (mode === "city_session") {
        // Cria UMA sessão por cidade
        const created: string[] = [];
        for (const splitId of selectedSplitIds) {
          const split = events.find((e) => e.id === splitId);
          const cityTitle = `${title.trim()} — ${split?.name ?? "Cidade"}`;
          const { data: session, error } = await supabase
            .from("camarim_sessions" as any)
            .insert({
              title: cityTitle,
              mode: "city_session",
              master_event_id: selectedMasterId,
              budget_amount: budgetNum,
              currency: "EUR",
              responsible_profile_id: responsibleId || null,
              fund_holder_type: fundHolder.type,
              fund_holder_supplier_id: fundHolder.supplierId,
              fund_holder_user_id: fundHolder.userId,
              notes: notes || null,
              created_by: user?.id ?? null,
            } as any)
            .select("id")
            .single();
          if (error) throw error;
          const sid = (session as any).id as string;
          await supabase.from("camarim_session_events" as any).insert({
            session_id: sid,
            event_id: splitId,
            is_primary: true,
          } as any);
          created.push(sid);
        }
        toast({ title: `${created.length} sessões criadas` });
        onCreated?.(created[0]);
        navigate("/camarim");
      } else {
        // single_event ou tour_consolidated → uma única sessão
        const masterRef = mode === "tour_consolidated" ? selectedMasterId : null;
        const { data: session, error } = await supabase
          .from("camarim_sessions" as any)
          .insert({
            title: title.trim(),
            mode,
            master_event_id: masterRef,
            budget_amount: budgetNum,
            currency: "EUR",
            responsible_profile_id: responsibleId || null,
            fund_holder_type: fundHolder.type,
            fund_holder_supplier_id: fundHolder.supplierId,
            fund_holder_user_id: fundHolder.userId,
            notes: notes || null,
            created_by: user?.id ?? null,
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        const sid = (session as any).id as string;

        const links: Array<{ session_id: string; event_id: string; is_primary: boolean }> = [];
        if (mode === "single_event") {
          links.push({ session_id: sid, event_id: selectedEventId, is_primary: true });
        } else {
          // tour_consolidated: liga todas as cidades selecionadas
          selectedSplitIds.forEach((eid, idx) =>
            links.push({ session_id: sid, event_id: eid, is_primary: idx === 0 }),
          );
        }
        if (links.length > 0) {
          await supabase.from("camarim_session_events" as any).insert(links as any);
        }
        toast({ title: "Sessão criada" });
        onCreated?.(sid);
        navigate(`/camarim/${sid}`);
      }

      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao criar sessão", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Abrir nova sessão de camarim</DialogTitle>
          <DialogDescription>
            Escolhe o modo de operação. A equipa de montagem irá lançar contas dentro desta sessão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Modo */}
          <div className="grid gap-3 sm:grid-cols-3">
            {(["single_event", "tour_consolidated", "city_session"] as CamarimSessionMode[]).map((m) => {
              const Icon = m === "single_event" ? Calendar : m === "tour_consolidated" ? Map : MapPin;
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all",
                    active
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <Icon className="mb-2 h-5 w-5 text-primary" />
                  <p className="text-sm font-semibold">{SESSION_MODE_LABELS[m]}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{SESSION_MODE_DESCRIPTIONS[m]}</p>
                </button>
              );
            })}
          </div>

          {/* Título e orçamento */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título da sessão</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Camarim — Henry & Klauss / Coliseu Lisboa"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget">Orçamento previsto (€)</Label>
              <Input
                id="budget"
                type="number"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </div>

          {/* Seleção de evento(s) */}
          {mode === "single_event" ? (
            <div className="space-y-1.5">
              <Label>Evento</Label>
              <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleciona o evento" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} {e.date ? `· ${e.date}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Turnê (Master)</Label>
                <Select
                  value={selectedMasterId}
                  onValueChange={(v) => {
                    setSelectedMasterId(v);
                    setSelectedSplitIds([]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleciona a turnê" />
                  </SelectTrigger>
                  <SelectContent>
                    {masters.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} {e.date ? `· ${e.date}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedMasterId && (
                <div className="space-y-2">
                  <Label>
                    {mode === "tour_consolidated"
                      ? "Cidades incluídas nesta sessão"
                      : "Cidades — uma sessão será criada por cada"}
                  </Label>
                  <ScrollArea className="h-44 rounded-md border p-2">
                    {splitsOfMaster.length === 0 ? (
                      <p className="p-2 text-sm text-muted-foreground">Esta turnê não tem cidades (splits).</p>
                    ) : (
                      <div className="space-y-1">
                        {splitsOfMaster.map((s) => {
                          const checked = selectedSplitIds.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) =>
                                  setSelectedSplitIds((prev) =>
                                    v ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                                  )
                                }
                              />
                              <span className="text-sm">
                                {s.name} {s.date ? `· ${s.date}` : ""}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Responsável (camarim)</Label>
              <Select value={responsibleId} onValueChange={setResponsibleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleciona um utilizador" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcional"
                rows={1}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar sessão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
