import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { formatCurrency } from "@/lib/mock-data";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  eventName: string;
}

type ForecastRow = {
  id: string;
  description: string | null;
  amount: number;
  iva_rate: number;
  formalidade: string | null;
  category_id: string | null;
  type: string;
  is_overhead: boolean | null;
  exclude_from_result: boolean | null;
  master_forecast_id: string | null;
  is_retroactive_override: boolean | null;
  status: string | null;
  version_id: string | null;
};

const FORMALIDADES = ["estimado", "negociacao", "fechado", "pago_parcial", "pago_total"];

export default function BPPartnerEditDialog({ open, onOpenChange, eventId, eventName }: Props) {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, Partial<ForecastRow>>>({});

  const { data: versionId } = useQuery({
    queryKey: ["bp_active_version", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bp_versions")
        .select("id")
        .eq("event_id", eventId)
        .eq("state", "active")
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
    enabled: open && !!eventId,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["bp_partner_edit_rows", eventId, versionId],
    queryFn: async () => {
      const q = supabase
        .from("event_forecasts")
        .select("id, description, amount, iva_rate, formalidade, category_id, type, is_overhead, exclude_from_result, master_forecast_id, is_retroactive_override, status, version_id, account_categories(code, name)")
        .eq("event_id", eventId)
        .order("type", { ascending: true });
      const { data, error } = versionId
        ? await q.eq("version_id", versionId)
        : await q.is("version_id", null);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: open && !!eventId,
  });

  useEffect(() => { if (!open) setEdits({}); }, [open]);

  const editable = (r: any) => !r.is_overhead && !r.exclude_from_result && !r.master_forecast_id && !r.is_retroactive_override;

  const getVal = <K extends keyof ForecastRow>(r: any, key: K): any => {
    return (edits[r.id]?.[key] ?? r[key]) as any;
  };

  const setVal = (id: string, key: keyof ForecastRow, value: any) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  };

  const dirtyIds = useMemo(() => Object.keys(edits).filter((id) => {
    const orig = rows.find((r: any) => r.id === id);
    if (!orig) return false;
    const e = edits[id];
    return Object.keys(e).some((k) => (e as any)[k] !== (orig as any)[k]);
  }), [edits, rows]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = dirtyIds.map((id) => {
        const e = edits[id];
        const out: any = { id };
        for (const k of ["description", "amount", "iva_rate", "formalidade"]) {
          if (k in e) out[k] = (e as any)[k];
        }
        return out;
      });
      const { data, error } = await supabase.rpc("batch_update_event_forecasts", {
        _event_id: eventId,
        _version_id: versionId ?? null,
        _edits: payload as any,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(`BP atualizado (${res?.updated ?? 0} linha(s)).`);
      setEdits({});
      qc.invalidateQueries({ queryKey: ["bp_partner_edit_rows", eventId] });
      qc.invalidateQueries({ queryKey: ["partner_event_data"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao guardar BP"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar BP — {eventName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">Sem linhas de BP para editar.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-28">Valor (líq.)</TableHead>
                  <TableHead className="w-20">IVA</TableHead>
                  <TableHead className="w-36">Formalidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => {
                  const isEd = editable(r);
                  return (
                    <TableRow key={r.id} className={!isEd ? "opacity-60" : ""}>
                      <TableCell className="text-xs">
                        {r.account_categories?.code ?? "—"} {r.account_categories?.name ?? ""}
                        {!isEd && <span className="ml-1 text-[10px] text-muted-foreground">(bloqueada)</span>}
                      </TableCell>
                      <TableCell>
                        <Input
                          value={getVal(r, "description") ?? ""}
                          onChange={(e) => setVal(r.id, "description", e.target.value)}
                          disabled={!isEd}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01" min="0"
                          value={getVal(r, "amount") ?? 0}
                          onChange={(e) => setVal(r.id, "amount", Number(e.target.value))}
                          disabled={!isEd}
                          className="h-8 text-xs font-mono text-right"
                        />
                        <div className="text-[10px] text-muted-foreground text-right mt-0.5">{formatCurrency(Number(getVal(r, "amount") ?? 0))}</div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={String(getVal(r, "iva_rate") ?? 23)}
                          onValueChange={(v) => setVal(r.id, "iva_rate", Number(v))}
                          disabled={!isEd}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[0, 6, 13, 23].map((n) => <SelectItem key={n} value={String(n)}>{n}%</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={String(getVal(r, "formalidade") ?? "estimado")}
                          onValueChange={(v) => setVal(r.id, "formalidade", v)}
                          disabled={!isEd}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {FORMALIDADES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <div className="flex-1 text-xs text-muted-foreground">
            {dirtyIds.length > 0 ? `${dirtyIds.length} linha(s) alterada(s)` : "Sem alterações"}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={dirtyIds.length === 0 || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
