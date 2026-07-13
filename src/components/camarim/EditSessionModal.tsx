import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Lock } from "lucide-react";
import { FundHolderPicker, type FundHolderValue } from "./FundHolderPicker";

type SessionMode = "single_event" | "tour_consolidated" | "city_session";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  initial: {
    title: string;
    budget_amount: number;
    notes: string | null;
  };
  onSaved?: () => void;
}

interface EventOption {
  id: string;
  name: string;
  date: string | null;
  parent_event_id: string | null;
}

export function EditSessionModal({ open, onOpenChange, sessionId, initial, onSaved }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [budget, setBudget] = useState(String(initial.budget_amount ?? 0));
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [fundHolder, setFundHolder] = useState<FundHolderValue>({
    type: "employee",
    supplierId: null,
    userId: null,
  });

  // Vinculo
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [mode, setMode] = useState<SessionMode>("single_event");
  const [itemsCount, setItemsCount] = useState<number>(0);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [masterEventId, setMasterEventId] = useState<string>("");
  const [singleEventId, setSingleEventId] = useState<string>("");
  const [tourSplitIds, setTourSplitIds] = useState<string[]>([]);
  const [citySplitId, setCitySplitId] = useState<string>(""); // city_session: cidade desta sessão

  const masters = useMemo(() => events.filter((e) => !e.parent_event_id), [events]);
  const splitsOfMaster = useMemo(
    () => events.filter((e) => e.parent_event_id === masterEventId),
    [events, masterEventId],
  );

  // Carrega tudo quando abre
  useEffect(() => {
    if (!open) return;
    setTitle(initial.title);
    setBudget(String(initial.budget_amount ?? 0));
    setNotes(initial.notes ?? "");

    void (async () => {
      setLoadingLinks(true);
      try {
        const [{ data: ses }, { data: evs }, { data: links }, { count }] = await Promise.all([
          supabase
            .from("camarim_sessions" as any)
            .select("mode, master_event_id")
            .eq("id", sessionId)
            .single(),
          supabase
            .from("events")
            .select("id,name,date,parent_event_id")
            .order("date", { ascending: false })
            .limit(500),
          supabase
            .from("camarim_session_events" as any)
            .select("event_id, is_primary")
            .eq("session_id", sessionId),
          supabase
            .from("camarim_items" as any)
            .select("id", { count: "exact", head: true })
            .eq("session_id", sessionId),
        ]);

        const sesMode = ((ses as any)?.mode ?? "single_event") as SessionMode;
        const masterRef = ((ses as any)?.master_event_id ?? "") as string;
        setMode(sesMode);
        setMasterEventId(masterRef);
        setEvents((evs ?? []) as EventOption[]);
        setItemsCount(count ?? 0);

        const linkedIds = ((links ?? []) as any[]).map((l) => l.event_id as string);
        if (sesMode === "single_event") {
          setSingleEventId(linkedIds[0] ?? "");
          // Se for Split, deduzir master para o seletor coerente
          const ev = (evs ?? []).find((e: any) => e.id === linkedIds[0]) as EventOption | undefined;
          if (ev?.parent_event_id) setMasterEventId(ev.parent_event_id);
          else if (ev) setMasterEventId(ev.id);
        } else if (sesMode === "tour_consolidated") {
          setTourSplitIds(linkedIds);
        } else if (sesMode === "city_session") {
          setCitySplitId(linkedIds[0] ?? "");
        }
      } catch (e: any) {
        console.error(e);
        toast({ variant: "destructive", title: "Erro a carregar vínculo", description: e.message });
      } finally {
        setLoadingLinks(false);
      }
    })();
  }, [open, sessionId, initial]);

  const canEditLinks = itemsCount === 0;

  const validateLinks = (): { masterRef: string | null; eventIds: string[] } | null => {
    if (mode === "single_event") {
      if (!singleEventId) {
        toast({ variant: "destructive", title: "Seleciona o evento" });
        return null;
      }
      return { masterRef: null, eventIds: [singleEventId] };
    }
    if (mode === "tour_consolidated") {
      if (!masterEventId) {
        toast({ variant: "destructive", title: "Seleciona a turnê (Master)" });
        return null;
      }
      if (tourSplitIds.length === 0) {
        toast({ variant: "destructive", title: "Seleciona pelo menos uma cidade" });
        return null;
      }
      return { masterRef: masterEventId, eventIds: tourSplitIds };
    }
    // city_session
    if (!masterEventId) {
      toast({ variant: "destructive", title: "Seleciona a turnê (Master)" });
      return null;
    }
    if (!citySplitId) {
      toast({ variant: "destructive", title: "Seleciona a cidade desta sessão" });
      return null;
    }
    return { masterRef: masterEventId, eventIds: [citySplitId] };
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ variant: "destructive", title: "Título obrigatório" });
      return;
    }
    const budgetNum = Number(budget);
    if (isNaN(budgetNum) || budgetNum < 0) {
      toast({ variant: "destructive", title: "Orçamento inválido" });
      return;
    }

    let linkPayload: { masterRef: string | null; eventIds: string[] } | null = null;
    if (canEditLinks) {
      linkPayload = validateLinks();
      if (!linkPayload) return;
    }

    setSaving(true);
    try {
      // 1) Update campos básicos + master_event_id (se podemos editar vínculo)
      const updatePatch: Record<string, any> = {
        title: title.trim(),
        budget_amount: budgetNum,
        notes: notes.trim() || null,
      };
      if (canEditLinks && linkPayload) {
        updatePatch.master_event_id = linkPayload.masterRef;
      }
      const { error: upErr } = await supabase
        .from("camarim_sessions" as any)
        .update(updatePatch as any)
        .eq("id", sessionId);
      if (upErr) throw upErr;

      // 2) Regravar vínculos (DELETE + INSERT) — só se sem itens
      if (canEditLinks && linkPayload) {
        const { error: delErr } = await supabase
          .from("camarim_session_events" as any)
          .delete()
          .eq("session_id", sessionId);
        if (delErr) throw delErr;

        const rows = linkPayload.eventIds.map((eid, idx) => ({
          session_id: sessionId,
          event_id: eid,
          is_primary: idx === 0,
        }));
        if (rows.length > 0) {
          const { error: insErr } = await supabase
            .from("camarim_session_events" as any)
            .insert(rows as any);
          if (insErr) throw insErr;
        }
      }

      toast({ title: "Sessão atualizada" });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro ao gravar", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleSplit = (id: string) => {
    setTourSplitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar sessão</DialogTitle>
          <DialogDescription>
            Ajusta título, orçamento, notas e — se ainda não houver contas — o vínculo ao(s) evento(s).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Campos básicos */}
          <div className="space-y-1.5">
            <Label htmlFor="ses-title">Título</Label>
            <Input id="ses-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ses-budget">Orçamento (€)</Label>
              <Input
                id="ses-budget"
                type="number"
                step="0.01"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ses-notes">Notas</Label>
            <Textarea
              id="ses-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Vínculo a evento(s) */}
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">Vínculo a evento(s)</Label>
              {!canEditLinks && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <Lock className="h-3 w-3" /> Bloqueado
                </span>
              )}
            </div>

            {loadingLinks ? (
              <p className="text-xs text-muted-foreground">A carregar…</p>
            ) : !canEditLinks ? (
              <p className="text-xs text-muted-foreground">
                Esta sessão já tem <strong>{itemsCount}</strong> conta(s) lançada(s). Para mudar o
                vínculo, elimina primeiro todos os itens da sessão (ou abre uma sessão nova).
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Modo da sessão: <strong>{mode === "single_event" ? "Evento único" : mode === "tour_consolidated" ? "Turnê consolidada" : "Sessão por cidade"}</strong> (não editável).
                </p>

                {mode === "single_event" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Evento</Label>
                    <Select value={singleEventId} onValueChange={setSingleEventId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolher evento" />
                      </SelectTrigger>
                      <SelectContent>
                        {events.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.parent_event_id ? "↳ " : ""}
                            {e.name} {e.date ? `· ${e.date}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(mode === "tour_consolidated" || mode === "city_session") && (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Turnê (Master)</Label>
                      <Select
                        value={masterEventId}
                        onValueChange={(v) => {
                          setMasterEventId(v);
                          setTourSplitIds([]);
                          setCitySplitId("");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolher turnê" />
                        </SelectTrigger>
                        <SelectContent>
                          {masters.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} {m.date ? `· ${m.date}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {mode === "tour_consolidated" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Cidades incluídas</Label>
                        <div className="max-h-44 space-y-1 overflow-y-auto rounded border border-border bg-background p-2">
                          {splitsOfMaster.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sem cidades neste Master.</p>
                          ) : (
                            splitsOfMaster.map((s) => (
                              <label
                                key={s.id}
                                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/40"
                              >
                                <Checkbox
                                  checked={tourSplitIds.includes(s.id)}
                                  onCheckedChange={() => toggleSplit(s.id)}
                                />
                                <span className="text-xs">
                                  {s.name} {s.date ? `· ${s.date}` : ""}
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    {mode === "city_session" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Cidade desta sessão</Label>
                        <Select value={citySplitId} onValueChange={setCitySplitId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Escolher cidade" />
                          </SelectTrigger>
                          <SelectContent>
                            {splitsOfMaster.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name} {s.date ? `· ${s.date}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingLinks}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
