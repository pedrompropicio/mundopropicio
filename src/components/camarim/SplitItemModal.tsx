import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, Split } from "lucide-react";
import { formatCurrency } from "@/lib/camarim-helpers";
import { cn } from "@/lib/utils";

interface ParentItem {
  id: string;
  total_amount: number;
  iva_amount: number;
  currency: string;
  status: string;
  parent_item_id: string | null;
  supplier_name_raw: string | null;
  service_description: string | null;
  document_number: string | null;
  document_date: string | null;
  category_id: string | null;
  payment_origin: string;
  notes: string | null;
  session_id: string;
  has_document: boolean;
  ocr_raw_payload: any;
  ocr_confidence: string | null;
}

interface SessionEvent {
  event_id: string;
  is_primary: boolean;
  event_name: string;
  city_name: string | null;
}

interface SplitLine {
  scope: "master_common" | "local_city";
  event_id: string; // when local_city
  amount: string; // input string
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  /** When true, allows re-splitting an item already split (deletes old children first). */
  allowResplit?: boolean;
  onSaved?: () => void;
}

export function SplitItemModal({ open, onOpenChange, itemId, allowResplit, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parent, setParent] = useState<ParentItem | null>(null);
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([]);
  const [primaryEventId, setPrimaryEventId] = useState<string>("");
  const [lines, setLines] = useState<SplitLine[]>([]);
  const [existingChildrenCount, setExistingChildrenCount] = useState(0);

  const isChildItem = !!parent?.parent_item_id;
  // Pai é "redivisível" sempre que tem filhos e o utilizador entrou em modo redivisão,
  // mesmo que o status não seja exatamente 'split' (pode ter ficado inconsistente
  // se o UPDATE final falhou numa tentativa anterior — vamos auto-corrigir no submit).
  const canResplit = !!allowResplit && existingChildrenCount > 0 && !isChildItem;

  useEffect(() => {
    if (!open || !itemId) return;
    void loadAll();
  }, [open, itemId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      // Item-pai
      const { data: it, error: itErr } = await supabase
        .from("camarim_items" as any)
        .select(
          "id,total_amount,iva_amount,currency,status,parent_item_id,supplier_name_raw,service_description,document_number,document_date,category_id,payment_origin,notes,session_id,has_document,ocr_raw_payload,ocr_confidence",
        )
        .eq("id", itemId)
        .single();
      if (itErr) throw itErr;
      const p = it as any as ParentItem;
      setParent(p);

      // Eventos da sessão (com nome + cidade)
      const { data: sessEvts } = await supabase
        .from("camarim_session_events" as any)
        .select("event_id,is_primary,events(name,cities(name))")
        .eq("session_id", p.session_id);
      const evts: SessionEvent[] = ((sessEvts ?? []) as any[]).map((r) => ({
        event_id: r.event_id,
        is_primary: r.is_primary,
        event_name: r.events?.name ?? "(sem nome)",
        city_name: r.events?.cities?.name ?? null,
      }));
      setSessionEvents(evts);
      const primary = evts.find((e) => e.is_primary) ?? evts[0];
      setPrimaryEventId(primary?.event_id ?? "");

      // Filhos já existentes (resplit)
      const { data: kids } = await supabase
        .from("camarim_items" as any)
        .select("id,total_amount,bp_scope,event_id,service_description")
        .eq("parent_item_id", itemId);
      const kidsList = (kids ?? []) as any[];
      setExistingChildrenCount(kidsList.length);

      if (kidsList.length > 0 && allowResplit && !p.parent_item_id) {
        setLines(
          kidsList.map((k) => ({
            scope: k.bp_scope === "local_city" ? "local_city" : "master_common",
            event_id: k.event_id ?? primary?.event_id ?? "",
            amount: String(k.total_amount ?? 0),
            description: k.service_description ?? "",
          })),
        );
      } else {
        // 2 linhas iniciais: 1 Master + 1 Local (cidade primária)
        setLines([
          {
            scope: "master_common",
            event_id: primary?.event_id ?? "",
            amount: "",
            description: "",
          },
          {
            scope: "local_city",
            event_id: primary?.event_id ?? "",
            amount: "",
            description: "",
          },
        ]);
      }
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro a carregar item", description: e.message });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const sumLines = useMemo(
    () => lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0),
    [lines],
  );

  const totalParent = Number(parent?.total_amount ?? 0);
  const diff = +(totalParent - sumLines).toFixed(2);
  const isBalanced = Math.abs(diff) < 0.005;

  const updateLine = (idx: number, patch: Partial<SplitLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        scope: "local_city",
        event_id: primaryEventId,
        amount: "",
        description: "",
      },
    ]);
  };

  const fillRemainingInLast = () => {
    if (lines.length === 0) return;
    setLines((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      const sumOthers = copy.slice(0, -1).reduce((a, l) => a + (Number(l.amount) || 0), 0);
      const remaining = +(totalParent - sumOthers).toFixed(2);
      copy[copy.length - 1] = { ...last, amount: String(remaining > 0 ? remaining : 0) };
      return copy;
    });
  };

  const handleSubmit = async () => {
    if (!parent) return;
    if (isChildItem) {
      toast({
        variant: "destructive",
        title: "Redivisão indisponível neste item",
        description: "Abre o talão-mãe dividido para alterar a repartição.",
      });
      return;
    }
    if (existingChildrenCount > 0 && !canResplit) {
      toast({
        variant: "destructive",
        title: "Redivisão bloqueada",
        description: "Só o talão-mãe já marcado como dividido pode ser redividido.",
      });
      return;
    }
    if (lines.length < 2) {
      toast({ variant: "destructive", title: "Pelo menos 2 linhas para dividir" });
      return;
    }
    if (!isBalanced) {
      toast({
        variant: "destructive",
        title: "Soma não bate",
        description: `Diferença de ${formatCurrency(diff, parent.currency)} face ao total do talão.`,
      });
      return;
    }
    for (const l of lines) {
      if (!l.amount || Number(l.amount) <= 0) {
        toast({ variant: "destructive", title: "Cada linha tem de ter valor > 0" });
        return;
      }
      if (l.scope === "local_city" && !l.event_id) {
        toast({ variant: "destructive", title: "Escolhe a cidade em todas as linhas locais" });
        return;
      }
    }

    setSaving(true);
    try {
      // Se é resplit, apaga os filhos antigos primeiro (CASCADE no storage não é necessário —
      // os filhos não têm anexos próprios, partilham via lookup ao pai).
      if (canResplit) {
        await supabase
          .from("camarim_items" as any)
          .delete()
          .eq("parent_item_id", itemId);
      }

      // Proporção do IVA por linha (mesma proporção do total)
      const ivaParent = Number(parent.iva_amount ?? 0);
      const newChildren = lines.map((l) => {
        const amt = Number(l.amount);
        const proportion = totalParent > 0 ? amt / totalParent : 0;
        const ivaShare = +(ivaParent * proportion).toFixed(2);
        const eventForLine = l.scope === "master_common" ? primaryEventId : l.event_id;
        return {
          parent_item_id: itemId,
          session_id: parent.session_id,
          event_id: eventForLine,
          supplier_name_raw: parent.supplier_name_raw,
          service_description:
            l.description.trim() || parent.service_description || null,
          document_number: parent.document_number,
          document_date: parent.document_date,
          document_type: "receipt",
          total_amount: amt,
          iva_amount: ivaShare,
          base_amount: +(amt - ivaShare).toFixed(2),
          payment_origin: parent.payment_origin,
          bp_scope: l.scope,
          notes: parent.notes,
          has_document: parent.has_document,
          status: "submitted" as const,
          category_id: parent.category_id,
          ocr_raw_payload: parent.ocr_raw_payload,
          ocr_confidence: parent.ocr_confidence,
          currency: parent.currency,
          created_by: user?.id ?? null,
        };
      });

      const { error: insErr } = await supabase
        .from("camarim_items" as any)
        .insert(newChildren as any);
      if (insErr) throw insErr;

      // Marca o pai como split (fora dos cálculos)
      const { error: updErr } = await supabase
        .from("camarim_items" as any)
        .update({ status: "split", bp_scope: "mixed" } as any)
        .eq("id", itemId);
      if (updErr) throw updErr;

      toast({
        title: existingChildrenCount > 0 ? "Talão redividido" : "Talão dividido",
        description: `${newChildren.length} linhas criadas.`,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast({ variant: "destructive", title: "Erro a dividir", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const labelForEvent = (e: SessionEvent) =>
    e.city_name ? `${e.city_name} — ${e.event_name}` : e.event_name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-5 w-5 text-primary" />
            {canResplit ? "Redividir talão misto" : "Dividir talão misto"}
          </DialogTitle>
          <DialogDescription>
            Distribui o total do talão entre Master (rateio comum a toda a turnê) e cidades
            específicas. A soma das linhas tem de bater com o total.
          </DialogDescription>
        </DialogHeader>

        {loading || !parent ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isChildItem ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
            Este item já é uma linha filha de um talão dividido. Para alterar valores ou vínculos,
            reabre a redivisão a partir do talão-mãe.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <p className="font-medium">
                {parent.supplier_name_raw || "—"} ·{" "}
                {parent.document_date ?? ""}
                {parent.document_number ? ` · doc ${parent.document_number}` : ""}
              </p>
              <p className="mt-1 text-muted-foreground">
                Total a dividir:{" "}
                <strong className="tabular-nums text-foreground">
                  {formatCurrency(totalParent, parent.currency)}
                </strong>
              </p>
            </div>

            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div
                  key={idx}
                  className="rounded-md border p-3 space-y-2"
                >
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Tipo
                      </Label>
                      <Select
                        value={l.scope}
                        onValueChange={(v) =>
                          updateLine(idx, { scope: v as "master_common" | "local_city" })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="master_common">Master (rateio)</SelectItem>
                          <SelectItem value="local_city">Cidade específica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {l.scope === "master_common" ? "Evento (primário)" : "Cidade"}
                      </Label>
                      <Select
                        value={l.event_id}
                        onValueChange={(v) => updateLine(idx, { event_id: v })}
                        disabled={l.scope === "master_common"}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Escolher…" />
                        </SelectTrigger>
                        <SelectContent>
                          {sessionEvents.map((e) => (
                            <SelectItem key={e.event_id} value={e.event_id}>
                              {labelForEvent(e)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Valor (€)
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="h-9"
                        value={l.amount}
                        onChange={(e) => updateLine(idx, { amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-destructive"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 2}
                        title={lines.length <= 2 ? "Mínimo 2 linhas" : "Remover linha"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    placeholder="Descrição (opcional, ex: flores Lisboa)"
                    className="h-8 text-xs"
                    value={l.description}
                    onChange={(e) => updateLine(idx, { description: e.target.value })}
                  />
                </div>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar linha
                  </Button>
                  {!isBalanced && lines.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={fillRemainingInLast}
                    >
                      Auto-completar última
                    </Button>
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs",
                    isBalanced
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-600 border border-amber-500/30",
                  )}
                >
                  Soma:{" "}
                  <strong className="tabular-nums">
                    {formatCurrency(sumLines, parent.currency)}
                  </strong>{" "}
                  {isBalanced ? (
                    <span>✓</span>
                  ) : (
                    <span>
                      · falta{" "}
                      <strong className="tabular-nums">
                        {formatCurrency(diff, parent.currency)}
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || loading || !isBalanced || lines.length < 2 || isChildItem}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {canResplit ? "Aplicar redivisão" : "Confirmar divisão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
