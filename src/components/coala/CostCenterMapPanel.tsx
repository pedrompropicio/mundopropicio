import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { mustWrite } from "@/lib/must-write";
import { normCentroCusto, suggestCategoryForCostCenter, isMappableCategory, type CcCategory } from "@/lib/cost-center-map";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/mock-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

/**
 * #230 — "Mapa de centros de custo": centros vistos nas importações Coala da
 * empresa (coala_sync_row_state), com contagem/valor, sugestão de rubrica e
 * gravação SÓ quando confirmada. O importador consulta o mapa antes de cair
 * em "0.0.99 A Classificar". Nada é reclassificado aqui.
 */
export default function CostCenterMapPanel() {
  const qc = useQueryClient();
  const { companyId } = useCompany();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["cost-center-map", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: cfgs, error: ce } = await supabase.from("coala_sync_config").select("id").eq("company_id", companyId!).limit(100);
      if (ce) throw ce;
      const cfgIds = (cfgs ?? []).map((c: any) => c.id);
      const { data: rows, error: re } = cfgIds.length
        ? await fetchAllPagedQuery(supabase.from("coala_sync_row_state")
            .select("center_custo_norm, net_amount_cents, event_forecasts(category_id)")
            .in("config_id", cfgIds).order("id", { ascending: true }))
        : { data: [], error: null };
      if (re) throw re;
      const { data: cats, error: ke } = await supabase.from("account_categories").select("id, code, name, parent_id")
        .eq("company_id", companyId!).eq("is_active", true).order("code").limit(1000);
      if (ke) throw ke;
      const { data: map, error: me } = await supabase.from("import_cost_center_map").select("cost_center_raw, category_id")
        .eq("company_id", companyId!).eq("source", "coala").limit(1000);
      if (me) throw me;
      return { rows: (rows ?? []) as any[], cats: (cats ?? []) as CcCategory[], map: (map ?? []) as any[] };
    },
  });

  const centers = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, { cc: string; n: number; value: number; hist: { category_id: string | null }[] }>();
    for (const r of data.rows) {
      const cc = normCentroCusto(r.center_custo_norm);
      if (!cc) continue;
      const e = m.get(cc) ?? { cc, n: 0, value: 0, hist: [] };
      e.n++; e.value += Number(r.net_amount_cents || 0) / 100;
      e.hist.push({ category_id: r.event_forecasts?.category_id ?? null });
      m.set(cc, e);
    }
    const mapped = new Map(data.map.map((x) => [x.cost_center_raw, x.category_id]));
    return [...m.values()].sort((a, b) => b.value - a.value).map((e) => ({
      ...e,
      mapped: mapped.get(e.cc) ?? null,
      suggestion: suggestCategoryForCostCenter(e.cc, data.cats, e.hist),
    }));
  }, [data]);

  const catLabel = (id: string | null | undefined) => {
    const c = data?.cats.find((x) => x.id === id);
    return c ? `${c.code} ${c.name}` : "—";
  };
  const options = (data?.cats ?? []).filter(isMappableCategory);

  const save = async (cc: string, categoryId: string) => {
    if (!companyId) return;
    setSaving(cc);
    try {
      const { data: u } = await supabase.auth.getUser();
      await mustWrite(
        supabase.from("import_cost_center_map").upsert(
          { company_id: companyId, source: "coala", cost_center_raw: cc, category_id: categoryId, confirmed_by: u.user?.id, confirmed_at: new Date().toISOString() } as any,
          { onConflict: "company_id,source,cost_center_raw" },
        ).select("id"),
        "Gravar mapa de centro de custo",
        { expectRows: true },
      );
      toast.success(`"${cc}" → ${catLabel(categoryId)}`);
      qc.invalidateQueries({ queryKey: ["cost-center-map"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível gravar.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapa de centros de custo</CardTitle>
        <CardDescription>
          Centros de custo vistos nas importações. A sugestão só é gravada quando confirmada; o importador usa o mapa antes de mandar para "A Classificar". Linhas já importadas não mudam.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Centro de custo</TableHead>
              <TableHead className="text-right">Linhas</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Rubrica</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {centers.map((c) => {
              const value = choice[c.cc] ?? c.mapped ?? c.suggestion?.category_id ?? "";
              return (
                <TableRow key={c.cc}>
                  <TableCell>{c.cc}</TableCell>
                  <TableCell className="text-right">{c.n}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.value)}</TableCell>
                  <TableCell className="min-w-[260px]">
                    <Select value={value} onValueChange={(v) => setChoice((p) => ({ ...p, [c.cc]: v }))}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Escolher rubrica" /></SelectTrigger>
                      <SelectContent>
                        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.code} {o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="mt-1">
                      {c.mapped ? <Badge>Confirmado</Badge>
                        : c.suggestion ? <Badge variant="secondary">Sugestão ({c.suggestion.via === "historico" ? "classificação manual" : "nome"})</Badge>
                        : <Badge variant="outline">Sem sugestão</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" disabled={!value || saving !== null || (value === c.mapped && !choice[c.cc])} onClick={() => save(c.cc, value)}>
                      Confirmar
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {centers.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-muted-foreground">Sem centros de custo importados nesta empresa.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
