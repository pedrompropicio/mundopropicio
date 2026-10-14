import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Music, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { useRealCacheCalculation } from "@/hooks/useRealCacheCalculation";
import { enrichCacheConfigs } from "@/lib/real-cache-calc";
import { useCompanyBranding } from "@/contexts/CompanyBrandingContext";
import logoFallback from "@/assets/logo-horizontal.png";
import {
  groupEventsForCacheSelector, resolveReportBlocks, buildArtistCacheReport, formatEventDate, capacityRevenueByEvent,
  type ReportBlockSpec, type ArtistCacheReport, type ReportEvent,
} from "@/lib/cache-report";
import { exportArtistCachePdf, loadImageAsDataUrl, cityRowsFor, type EventMeta } from "@/lib/export-artist-cache-pdf";

type EventRow = ReportEvent & { city_id: string | null; venue_id: string | null };

/**
 * Relatório "Cachê do Artista" — mesmo núcleo da aba Cachê (adenda D-ERP265, 14/10/2026).
 * Chaves de query com prefixos de EVENT_FINANCIAL_KEY_PREFIXES (D-ERP266).
 */
export default function ReportArtistCache() {
  const [selected, setSelected] = useState<string>("");
  const [blockData, setBlockData] = useState<Record<string, ArtistCacheReport[]>>({});
  const { logoUrl, displayName } = useCompanyBranding();

  const { data: events = [] } = useQuery({
    queryKey: ["event_detail_cache_report_events"],
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("events")
        .select("id, name, date, parent_event_id, city_id, venue_id")
        .order("date", { ascending: false }));
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const { data: places = { cities: {}, venues: {} } } = useQuery({
    queryKey: ["event_detail_cache_report_places", events.length],
    enabled: events.length > 0,
    queryFn: async () => {
      const cityIds = [...new Set(events.map((e) => e.city_id).filter(Boolean))] as string[];
      const venueIds = [...new Set(events.map((e) => e.venue_id).filter(Boolean))] as string[];
      const [c, v] = await Promise.all([
        cityIds.length ? supabase.from("cities" as any).select("id, name").in("id", cityIds) : Promise.resolve({ data: [] as any[] }),
        venueIds.length ? supabase.from("venues" as any).select("id, name").in("id", venueIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      return {
        cities: Object.fromEntries(((c as any).data ?? []).map((r: any) => [r.id, r.name])) as Record<string, string>,
        venues: Object.fromEntries(((v as any).data ?? []).map((r: any) => [r.id, r.name])) as Record<string, string>,
      };
    },
  });

  const metaOf = useCallback((id: string): EventMeta => {
    const e = events.find((x) => x.id === id);
    return {
      id, name: e?.name ?? "", date: e?.date ?? null,
      city: e?.city_id ? places.cities[e.city_id] ?? null : null,
      venue: e?.venue_id ? places.venues[e.venue_id] ?? null : null,
    };
  }, [events, places]);

  const cityNameByEvent = useMemo(() => Object.fromEntries(events.map((e) => [e.id, e.city_id ? places.cities[e.city_id] ?? "" : ""])), [events, places]);
  const options = useMemo(() => groupEventsForCacheSelector(events, cityNameByEvent), [events, cityNameByEvent]);
  const option = options.find((o) => o.value === selected);

  // Contagem de configurações do evento escolhido, do Master e das cidades (âmbito D-ERP265).
  const familyIds = useMemo(() => {
    if (!option) return [] as string[];
    const ev = events.find((e) => e.id === option.eventId);
    const root = ev?.parent_event_id ?? option.eventId;
    return [root, ...events.filter((e) => e.parent_event_id === root).map((e) => e.id)];
  }, [option, events]);
  const { data: configCounts } = useQuery({
    queryKey: ["event_cache_configs_report_counts", familyIds.join(",")],
    enabled: familyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_configs" as any).select("id, event_id").in("event_id", familyIds);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) out[r.event_id] = (out[r.event_id] ?? 0) + 1;
      return out;
    },
  });

  const resolved = useMemo(() => {
    if (!option || !configCounts) return null;
    return resolveReportBlocks({ selection: { kind: option.kind, eventId: option.eventId }, events, configCounts });
  }, [option, configCounts, events]);

  const onBlockReady = useCallback((key: string, reports: ArtistCacheReport[]) => {
    setBlockData((prev) => (prev[key] === reports ? prev : { ...prev, [key]: reports }));
  }, []);

  const isTourAll = option?.kind === "tour";
  const blocks = resolved?.blocks ?? [];
  const allReady = blocks.length > 0 && blocks.every((b) => blockData[blockKey(b)]);
  const totalConfigs = blocks.reduce((s, b) => s + (blockData[blockKey(b)]?.length ?? 0), 0);

  // Resumo da turnê: só no âmbito "own" do Master (configuração no Master).
  const tourBlock = isTourAll && blocks.length === 1 && blocks[0].childIds.length > 0 ? blocks[0] : null;

  const exportPdf = async () => {
    if (!option || !resolved) return;
    const logo = (logoUrl ? await loadImageAsDataUrl(logoUrl) : null) ?? (await loadImageAsDataUrl(logoFallback));
    const root = events.find((e) => e.id === option.eventId);
    const sections: { meta: EventMeta; reports: ArtistCacheReport[] }[] = [];
    for (const b of blocks) {
      const reps = blockData[blockKey(b)] ?? [];
      if (b.childIds.length > 0) {
        const ids = b.onlyCityId ? [b.onlyCityId] : b.childIds;
        for (const id of ids) sections.push({ meta: metaOf(id), reports: reps });
      } else {
        sections.push({ meta: metaOf(b.holderId), reports: reps });
      }
    }
    const meta = Object.fromEntries(familyIds.map((id) => [id, metaOf(id)]));
    await exportArtistCachePdf({
      title: "Relatório de Cachê do Artista",
      companyName: displayName,
      logo,
      tourSummary: tourBlock ? { tourName: root?.name ?? "", reports: blockData[blockKey(tourBlock)] ?? [], meta } : undefined,
      sections,
      fileName: `cache-artista-${(root?.name ?? "evento").replace(/\s+/g, "_")}.pdf`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-full sm:w-96">
            <SelectValue placeholder="Selecione o evento" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} className={o.indent ? "pl-8 text-muted-foreground" : o.kind === "tour" ? "font-semibold" : ""}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {allReady && totalConfigs > 0 && (
          <Button variant="outline" size="sm" onClick={exportPdf} className="gap-1">
            <FileText className="h-4 w-4" /> PDF
          </Button>
        )}
      </div>

      {!selected && (
        <p className="text-muted-foreground text-sm py-8 text-center">Selecione um evento para visualizar o relatório de cachê.</p>
      )}

      {blocks.map((b) => (
        <ReportBlockData key={blockKey(b)} spec={b} onReady={onBlockReady} />
      ))}

      {selected && allReady && totalConfigs === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">Nenhum cachê configurado para este evento.</p>
      )}

      {tourBlock && (blockData[blockKey(tourBlock)]?.length ?? 0) > 0 && (
        <TourSummary reports={blockData[blockKey(tourBlock)]!} metaOf={metaOf} />
      )}

      {blocks.map((b) => {
        const reps = blockData[blockKey(b)];
        if (!reps || reps.length === 0) return null;
        const cityIds = b.childIds.length > 0 ? (b.onlyCityId ? [b.onlyCityId] : b.childIds) : [b.holderId];
        return cityIds.map((cid) => (
          <CitySection key={`${blockKey(b)}:${cid}`} meta={metaOf(cid)} reports={reps} closesWithNet={!tourBlock}
            note={b.onlyCityId ? `Cachê configurado no Master ${metaOf(b.holderId).name}.` : undefined} />
        ));
      })}
    </div>
  );
}

const blockKey = (b: ReportBlockSpec) => `${b.holderId}|${b.childIds.join(",")}|${b.onlyCityId ?? ""}`;

/** Carrega e calcula UM bloco com o mesmo núcleo da aba Cachê. Não desenha nada. */
function ReportBlockData({ spec, onReady }: { spec: ReportBlockSpec; onReady: (k: string, r: ArtistCacheReport[]) => void }) {
  const { data: configs, isFetched } = useQuery({
    queryKey: ["event_cache_configs_report", spec.holderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_configs" as any).select("*").eq("event_id", spec.holderId).order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const configIds = (configs ?? []).map((c: any) => c.id);
  const enabled = configIds.length > 0;
  const { data: deductions = [] } = useQuery({
    queryKey: ["event_cache_deductions_report", configIds.join(",")], enabled,
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase.from("event_cache_deductions" as any).select("*").in("cache_config_id", configIds));
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const { data: tiers = [] } = useQuery({
    queryKey: ["event_cache_tiers_report", configIds.join(",")], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_tiers").select("*").in("cache_config_id", configIds).order("sort_order");
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const { data: citySettlements = [] } = useQuery({
    queryKey: ["event_cache_city_settlements_report", spec.holderId, configIds.join(",")], enabled: enabled && spec.childIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("event_cache_city_settlements" as any)
        .select("cache_config_id, event_id, adjusted_amount, real_amount, is_finalized").in("cache_config_id", configIds);
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const { data: extras = [] } = useQuery({
    queryKey: ["event_cache_extras_report", configIds.join(",")], enabled,
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase.from("event_cache_extras" as any).select("*").in("cache_config_id", configIds));
      if (error) throw error; return (data ?? []) as any[];
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["account_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*").eq("is_active", true);
      if (error) throw error; return data ?? [];
    },
  });

  // Receita máxima da sala por evento (lotes × preço) — só referência dos escalões.
  const capIds = [spec.holderId, ...spec.childIds];
  const { data: capacityByEvent = {} } = useQuery({
    queryKey: ["event_ticket_lots_cache_report", capIds.join(",")], enabled,
    queryFn: async () => {
      const { data: zones, error } = await supabase.from("event_ticket_zones").select("id, event_id").in("event_id", capIds);
      if (error) throw error;
      const zIds = (zones ?? []).map((z: any) => z.id);
      if (zIds.length === 0) return {};
      const { data: lots, error: e2 } = await fetchAllPagedQuery(supabase.from("event_ticket_lots").select("id, zone_id, quantity, price, iva_rate").in("zone_id", zIds));
      if (e2) throw e2;
      return capacityRevenueByEvent(zones ?? [], lots ?? []);
    },
  });
  const enriched = useMemo(() => enrichCacheConfigs(configs ?? [], tiers), [configs, tiers]);
  const { results, resultsByCity, isLoading } = useRealCacheCalculation(spec.holderId, spec.childIds, enriched, deductions, categories, enriched.length > 0);

  const reports = useMemo(() => enriched.map((config: any) => buildArtistCacheReport({
    config, spec,
    realResult: results.find((r) => r.configId === config.id),
    resultsByCity, citySettlements, extras, capacityByEvent,
  })), [enriched, spec, results, resultsByCity, citySettlements, extras, capacityByEvent]);

  const ready = isFetched && (enriched.length === 0 || !isLoading);
  useEffect(() => { if (ready) onReady(blockKey(spec), reports); }, [ready, reports, spec, onReady]);
  return null;
}

function TourSummary({ reports, metaOf }: { reports: ArtistCacheReport[]; metaOf: (id: string) => EventMeta }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Resumo da turnê</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Atração</TableHead>
              <TableHead>Cidades</TableHead>
              <TableHead className="text-right">Cachê bruto</TableHead>
              <TableHead className="text-right">Extras</TableHead>
              <TableHead className="text-right">Líquido a pagar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((r) => (
              <TableRow key={r.config.id}>
                <TableCell className="font-medium">{r.config.artist_name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.cities.map((c) => `${metaOf(c.cityId).name}: ${formatCurrency(c.amount)}`).join(" · ") || "Fixo"}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(r.grossTotal)}</TableCell>
                <TableCell className="text-right text-destructive">{formatCurrency(-r.extrasTotal)}</TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(r.netTotal)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CitySection({ meta, reports, closesWithNet, note }: { meta: EventMeta; reports: ArtistCacheReport[]; closesWithNet: boolean; note?: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" /> {meta.name}</div>
        <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-x-4 text-xs text-muted-foreground">
          <span>Cidade: <span className="text-foreground">{meta.city ?? "—"}</span></span>
          <span>Local: <span className="text-foreground">{meta.venue ?? "—"}</span></span>
          <span>Data: <span className="text-foreground">{formatEventDate(meta.date) || "—"}</span></span>
        </div>
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </div>
      {reports.map((rep) => {
        const city = rep.cities.find((c) => c.cityId === meta.id);
        const rows = cityRowsFor(rep, meta.id);
        const extras = closesWithNet ? rep.extras : city?.extras ?? [];
        const extrasTotal = closesWithNet ? rep.extrasTotal : city?.extrasTotal ?? 0;
        return (
          <Card key={rep.config.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2 text-base"><Music className="h-5 w-5 text-primary" />{rep.config.artist_name}</CardTitle>
                <Badge variant={rep.isVariable ? "default" : "secondary"}>{rep.isVariable ? "Variável" : "Fixo"}</Badge>
                {city?.result?.isUsingMinimum && <Badge variant="outline">Mín. Garantido</Badge>}
                {city?.settlement?.adjusted_amount != null && <Badge variant="outline">Ajustado</Badge>}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead className="w-[70%]">Descrição</TableHead><TableHead className="text-right">Valor</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(([label, value], i) => (
                    <TableRow key={i} className={label === "Cachê da cidade" || label === "Cachê Fixo" ? "bg-primary/5 font-semibold" : label.startsWith("Escalões") ? "bg-muted/30 font-medium" : value.endsWith("aplicado") ? "font-semibold text-primary" : ""}>
                      <TableCell className={label.startsWith("  ") ? "pl-8 text-muted-foreground" : ""}>{label.trim()}</TableCell>
                      <TableCell className="text-right">{value}</TableCell>
                    </TableRow>
                  ))}
                  {extras.length > 0 && (
                    <>
                      <TableRow><TableCell colSpan={2} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground pt-4">Custos Extras a Descontar</TableCell></TableRow>
                      {extras.map((ex: any) => (
                        <TableRow key={ex.id}>
                          <TableCell className="pl-8 text-muted-foreground">(-) {ex.description}</TableCell>
                          <TableCell className="text-right text-destructive">{formatCurrency(-Number(ex.amount))}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30"><TableCell className="pl-8 font-medium">Total Extras</TableCell><TableCell className="text-right text-destructive">{formatCurrency(-extrasTotal)}</TableCell></TableRow>
                    </>
                  )}
                  {closesWithNet && (
                    <TableRow className="bg-primary/10 border-t-2 border-primary/30">
                      <TableCell className="font-bold text-base">Cachê Líquido a Pagar</TableCell>
                      <TableCell className="text-right font-bold text-base">{formatCurrency(rep.netTotal)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
