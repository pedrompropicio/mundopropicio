import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sigma, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useSyncFormulaForecasts } from "@/hooks/useSyncFormulaForecasts";
import { EventCourtesiesEditor } from "@/components/EventCourtesiesEditor";
import { writeForecastAmount } from "@/lib/forecast-amount";

const eur = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

type Kind = "fixed" | "pct_ticket_revenue" | "per_head";

/**
 * #263 / D-ERP149 — linhas de BP com fórmula + convites (Previsto / Final).
 * No Master (turnê) não se oferecem estes tipos; linhas existentes não recalculam.
 */
export function BpFormulaPanel({ eventId, isMaster, canEdit }: { eventId: string; isMaster: boolean; canEdit: boolean }) {
  const qc = useQueryClient();
  const sync = useSyncFormulaForecasts({ eventId, isMaster });
  const [open, setOpen] = useState(false);
  const [lineId, setLineId] = useState("");
  const [kind, setKind] = useState<Kind>("pct_ticket_revenue");
  const [rate, setRate] = useState("2");
  const [basis, setBasis] = useState<"gross" | "net">("gross");
  const [unit, setUnit] = useState("");
  const [incCourt, setIncCourt] = useState(true);
  const [zones, setZones] = useState<string[]>([]);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: candidates = [] } = useQuery({
    queryKey: ["bp-formula-candidates", eventId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("event_forecasts")
        .select("id, description, amount, formula_type, formula_params, account_categories(code)")
        .eq("event_id", eventId).is("version_id", null).eq("type", "expense").is("cache_config_id", null).order("description");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: zoneRows = [] } = useQuery({
    queryKey: ["bp-formula-zones", eventId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_ticket_zones").select("id, name").eq("event_id", eventId).is("version_id", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lines = sync.data?.lines ?? [];
  const evals = new Map((sync.data?.evals ?? []).map((e) => [e.forecastId, e]));
  const anyPending = (sync.data?.evals ?? []).some((e) => e.result.composition.pendingFinalCourtesies);
  const hasPerHead = lines.some((l: any) => l.formula_type === "per_head");

  const pick = (id: string) => {
    setLineId(id);
    const l: any = candidates.find((c: any) => c.id === id);
    const p = l?.formula_params ?? {};
    if (l?.formula_type === "pct_ticket_revenue" || l?.formula_type === "per_head") setKind(l.formula_type);
    else setKind("pct_ticket_revenue");
    setRate(p.rate != null ? String(p.rate) : "2");
    setBasis(p.basis === "net" ? "net" : "gross");
    setUnit(p.unit_amount != null ? String(p.unit_amount) : "");
    setIncCourt(p.include_courtesies ?? true);
    setZones(Array.isArray(p.zone_ids) ? p.zone_ids : []);
    setMin(p.min != null ? String(p.min) : "");
    setMax(p.max != null ? String(p.max) : "");
  };

  const save = async () => {
    if (!lineId) return;
    setSaving(true);
    try {
      const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
      let patch: any;
      if (kind === "fixed") {
        const l: any = candidates.find((c: any) => c.id === lineId);
        patch = { formula_type: "fixed", formula_params: null, formula_value: Number(l?.amount ?? 0) };
      } else {
        const zone_ids = zones.length ? zones : null;
        const params = kind === "pct_ticket_revenue"
          ? { rate: num(rate) ?? 0, basis, zone_ids, min: num(min), max: num(max) }
          : { unit_amount: num(unit) ?? 0, include_courtesies: incCourt, zone_ids, min: num(min), max: num(max) };
        patch = { formula_type: kind, formula_params: params };
      }
      const { error } = await (supabase as any).from("event_forecasts").update(patch).eq("id", lineId);
      if (error) throw error;
      toast.success("Fórmula gravada — a linha recalcula já.");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["bp-formula-sync", eventId] });
      qc.invalidateQueries({ queryKey: ["event_forecasts"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (isMaster) {
    if (!lines.length) return null;
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs flex gap-2">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        Há {lines.length} linha(s) com fórmula no Master. Fórmulas de receita/público só se aplicam às cidades; estas linhas não recalculam.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
          <CardTitle className="text-sm flex items-center gap-2"><Sigma className="h-4 w-4" /> Linhas com fórmula</CardTitle>
          {canEdit && <Button size="sm" variant="outline" onClick={() => { setOpen(true); setLineId(""); }}>Definir fórmula…</Button>}
        </CardHeader>
        <CardContent className="pt-0 space-y-1.5">
          {lines.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma linha com fórmula neste evento.</p>}
          {lines.map((l: any) => {
            const e = evals.get(l.id);
            return (
              <div key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 text-xs border-b border-border/40 pb-1.5">
                <div>
                  <span className="font-medium"><Sigma className="inline h-3 w-3 mr-1 text-primary" />{l.description}</span>
                  <div className="text-muted-foreground">{e?.text ?? l.formula_params?.last_text ?? "—"}</div>
                  {l.formula_params?.floor_hit && <div className="text-warning">Gravado o realizado (o recálculo ficava abaixo).</div>}
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold">{eur(Number(l.amount))}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {l.formula_params?.last_recalc_at ? `recalculado ${new Date(l.formula_params.last_recalc_at).toLocaleString("pt-PT")}` : "por recalcular"}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {hasPerHead && anyPending && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs flex gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" /> Convites finais por preencher — o evento já aconteceu e as linhas por pessoa estão a usar o previsto.
        </div>
      )}
      {hasPerHead && (
        <div className="grid gap-3 lg:grid-cols-2">
          <EventCourtesiesEditor eventId={eventId} scenario="forecast" title="Convites — Previsto" description="Usados nas linhas por pessoa antes do evento." />
          <EventCourtesiesEditor eventId={eventId} scenario="real" title="Convites — Final" description="Depois do evento substituem o previsto. São as mesmas cortesias da Bilheteira." />
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Linha com fórmula</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <select className="w-full rounded-md border bg-background p-2" value={lineId} onChange={(e) => pick(e.target.value)}>
              <option value="">Escolher linha de despesa…</option>
              {candidates.map((c: any) => (
                <option key={c.id} value={c.id}>{c.account_categories?.code ?? ""} {c.description} — {eur(Number(c.amount))}</option>
              ))}
            </select>
            <div className="flex gap-2">
              {([["fixed", "Fixo"], ["pct_ticket_revenue", "% da receita de bilhetes"], ["per_head", "Custo por pessoa"]] as const).map(([k, lbl]) => (
                <Button key={k} size="sm" type="button" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>{lbl}</Button>
              ))}
            </div>
            {kind === "pct_ticket_revenue" && (
              <div className="flex gap-2 items-center">
                <Input className="w-24" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="%" />
                <span>% da receita</span>
                <select className="rounded-md border bg-background p-2" value={basis} onChange={(e) => setBasis(e.target.value as any)}>
                  <option value="gross">bruta (c/IVA)</option>
                  <option value="net">líquida (s/IVA)</option>
                </select>
              </div>
            )}
            {kind === "per_head" && (
              <div className="space-y-2">
                <div className="flex gap-2 items-center"><Input className="w-28" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="€ / pessoa" /><span>€ por pessoa</span></div>
                <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={incCourt} onChange={(e) => setIncCourt(e.target.checked)} /> incluir convites</label>
              </div>
            )}
            {kind !== "fixed" && (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Zonas (nenhuma = evento todo)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {zoneRows.map((z: any) => (
                      <label key={z.id} className="flex items-center gap-1 text-xs border rounded px-1.5 py-0.5">
                        <input type="checkbox" checked={zones.includes(z.id)} onChange={(e) => setZones((p) => e.target.checked ? [...p, z.id] : p.filter((x) => x !== z.id))} />{z.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input value={min} onChange={(e) => setMin(e.target.value)} placeholder="mínimo € (opcional)" />
                  <Input value={max} onChange={(e) => setMax(e.target.value)} placeholder="máximo € (opcional)" />
                </div>
                <p className="text-[11px] text-muted-foreground">O valor da linha passa a ser calculado e não se edita à mão.</p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!lineId || saving}>Gravar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// evita aviso de import não usado em builds estritos
void writeForecastAmount;
