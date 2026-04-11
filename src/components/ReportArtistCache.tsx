import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Music, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ReportArtistCache() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");

  // Fetch events
  const { data: events = [] } = useQuery({
    queryKey: ["events-for-cache-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date, status, event_type, parent_event_id")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Get selected event
  const selectedEvent = events.find((e) => e.id === selectedEventId);

  // Child event IDs (for parent events)
  const childEventIds = useMemo(() => {
    if (!selectedEvent || selectedEvent.event_type !== "parent") return [];
    return events.filter((e) => e.parent_event_id === selectedEventId).map((e) => e.id);
  }, [selectedEvent, events, selectedEventId]);

  const allEventIds = useMemo(() => [selectedEventId, ...childEventIds], [selectedEventId, childEventIds]);

  // Cache configs
  const { data: cacheConfigs = [] } = useQuery({
    queryKey: ["cache-report-configs", selectedEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_cache_configs" as any)
        .select("*")
        .eq("event_id", selectedEventId)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!selectedEventId,
  });

  // Cache deductions
  const configIds = cacheConfigs.map((c: any) => c.id);
  const { data: deductions = [] } = useQuery({
    queryKey: ["cache-report-deductions", configIds.join(",")],
    queryFn: async () => {
      if (configIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_cache_deductions" as any)
        .select("*, account_categories(code, name)")
        .in("cache_config_id", configIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: configIds.length > 0,
  });

  // Cache extras
  const { data: cacheExtras = [] } = useQuery({
    queryKey: ["cache-report-extras", configIds.join(",")],
    queryFn: async () => {
      if (configIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_cache_extras" as any)
        .select("*")
        .in("cache_config_id", configIds)
        .order("created_at");
      if (error) throw error;
      return data as any[];
    },
    enabled: configIds.length > 0,
  });

  // Ticket data for revenue
  const { data: ticketZones = [] } = useQuery({
    queryKey: ["cache-report-zones", selectedEventId, childEventIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id")
        .in("event_id", allEventIds);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  const zoneIds = ticketZones.map((z) => z.id);
  const { data: ticketLots = [] } = useQuery({
    queryKey: ["cache-report-lots", zoneIds.join(",")],
    queryFn: async () => {
      if (zoneIds.length === 0) return [];
      const { data, error } = await supabase
        .from("event_ticket_lots")
        .select("*")
        .in("zone_id", zoneIds);
      if (error) throw error;
      return data;
    },
    enabled: zoneIds.length > 0,
  });

  // Forecasts for deduction amounts
  const { data: forecasts = [] } = useQuery({
    queryKey: ["cache-report-forecasts", selectedEventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("*")
        .eq("event_id", selectedEventId);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedEventId,
  });

  // Calculate revenues
  const ticketRevenueGross = useMemo(() => {
    return ticketLots.reduce((s, l) => s + l.quantity * Number(l.price), 0);
  }, [ticketLots]);

  const ticketRevenueNet = useMemo(() => {
    return ticketLots.reduce((s, l) => {
      const rate = Number((l as any).iva_rate ?? 6);
      return s + l.quantity * (Number(l.price) / (1 + rate / 100));
    }, 0);
  }, [ticketLots]);

  // Build report data per artist
  const artistReports = useMemo(() => {
    return cacheConfigs.map((config: any) => {
      const isVariable = config.cache_type === "variable";
      const basis = config.cache_revenue_basis === "gross" ? ticketRevenueGross : ticketRevenueNet;
      const basisLabel = config.cache_revenue_basis === "gross" ? "Bruta" : "Líquida (s/ IVA)";

      // Deductions for this config
      const configDeductions = deductions.filter((d: any) => d.cache_config_id === config.id);
      const deductionCategoryIds = new Set(configDeductions.map((d: any) => d.category_id));

      const categoryDeductionItems = forecasts
        .filter((f) => f.type === "expense" && deductionCategoryIds.has(f.category_id ?? ""))
        .map((f) => {
          const ded = configDeductions.find((d: any) => d.category_id === f.category_id);
          const catInfo = (ded as any)?.account_categories;
          return {
            label: catInfo ? `${catInfo.code} ${catInfo.name}` : f.description,
            amount: Number(f.amount),
          };
        });

      const categoryDeductionTotal = categoryDeductionItems.reduce((s, i) => s + i.amount, 0);

      const fixedPct = Number(config.fixed_deduction_percentage) || 0;
      const fixedPctAmount = basis * (fixedPct / 100);
      const totalDeduction = categoryDeductionTotal + fixedPctAmount;
      const baseForCalc = basis - totalDeduction;
      const pct = Number(config.percentage) || 0;
      const calculated = isVariable ? Math.max(0, baseForCalc * (pct / 100)) : Number(config.fixed_amount);
      const minGuaranteed = Number(config.minimum_guaranteed) || 0;
      const cacheAmount = isVariable ? Math.max(minGuaranteed, calculated) : calculated;
      const isUsingMinimum = isVariable && minGuaranteed > 0 && cacheAmount === minGuaranteed;

      // Extras for this config
      const configExtras = cacheExtras.filter((e: any) => e.cache_config_id === config.id);
      const extrasTotal = configExtras.reduce((s: number, e: any) => s + Number(e.amount), 0);
      const netCache = cacheAmount - extrasTotal;

      return {
        artistName: config.artist_name,
        cacheType: config.cache_type,
        isVariable,
        isFinalized: !!config.is_finalized,
        basis,
        basisLabel,
        categoryDeductionItems,
        categoryDeductionTotal,
        fixedPct,
        fixedPctAmount,
        totalDeduction,
        baseForCalc,
        pct,
        cacheAmount,
        minGuaranteed,
        isUsingMinimum,
        extras: configExtras,
        extrasTotal,
        netCache,
      };
    });
  }, [cacheConfigs, deductions, cacheExtras, forecasts, ticketRevenueGross, ticketRevenueNet]);

  const exportToPDF = () => {
    if (!selectedEvent) return;
    const doc = new jsPDF();
    const title = `Relatório de Cachê - ${selectedEvent.name}`;
    doc.setFontSize(14);
    doc.text(title, 14, 18);
    doc.setFontSize(9);
    doc.text(`Data do evento: ${format(new Date(selectedEvent.date), "dd/MM/yyyy")}`, 14, 25);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 30);

    let y = 38;

    artistReports.forEach((report) => {
      if (y > 250) { doc.addPage(); y = 18; }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`${report.artistName}`, 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Tipo: ${report.isVariable ? "Variável" : "Fixo"}`, 14, y);
      y += 6;

      const rows: any[][] = [];

      if (report.isVariable) {
        rows.push(["Receita de Bilheteira (" + report.basisLabel + ")", formatCurrency(report.basis)]);
        report.categoryDeductionItems.forEach((item) => {
          rows.push(["  (-) " + item.label, formatCurrency(-item.amount)]);
        });
        if (report.fixedPct > 0) {
          rows.push(["  (-) Dedução Fixa (" + report.fixedPct + "%)", formatCurrency(-report.fixedPctAmount)]);
        }
        rows.push(["Total Deduções", formatCurrency(-report.totalDeduction)]);
        rows.push(["Base de Cálculo", formatCurrency(report.baseForCalc)]);
        rows.push(["Percentagem do Artista (" + report.pct + "%)", ""]);
        rows.push(["Cachê Bruto", formatCurrency(report.cacheAmount)]);
      } else {
        rows.push(["Cachê Fixo", formatCurrency(report.cacheAmount)]);
      }

      if (report.extras.length > 0) {
        rows.push(["", ""]);
        rows.push(["CUSTOS EXTRAS A DESCONTAR", ""]);
        report.extras.forEach((ex: any) => {
          rows.push(["  (-) " + ex.description, formatCurrency(-Number(ex.amount))]);
        });
        rows.push(["Total Extras", formatCurrency(-report.extrasTotal)]);
      }

      rows.push(["CACHÊ LÍQUIDO A PAGAR", formatCurrency(report.netCache)]);

      autoTable(doc, {
        startY: y,
        head: [["Descrição", "Valor"]],
        body: rows,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
        styles: { fontSize: 8 },
        columnStyles: { 1: { halign: "right" } },
        didParseCell: (data: any) => {
          const text = data.cell.raw as string;
          if (text === "CACHÊ LÍQUIDO A PAGAR" || text === "Cachê Bruto" || text === "CUSTOS EXTRAS A DESCONTAR") {
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 12;
    });

    doc.save(`cache-artista-${selectedEvent.name.replace(/\s+/g, "_")}.pdf`);
  };

  // Filter to only show events that have parent or simple type (not child)
  const selectableEvents = events.filter((e) => e.event_type !== "child");

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Select value={selectedEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue placeholder="Selecione o evento" />
          </SelectTrigger>
          <SelectContent>
            {selectableEvents.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name} — {format(new Date(e.date), "dd/MM/yyyy")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {artistReports.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportToPDF} className="gap-1">
            <FileText className="h-4 w-4" /> PDF
          </Button>
        )}
      </div>

      {!selectedEventId && (
        <p className="text-muted-foreground text-sm py-8 text-center">Selecione um evento para visualizar o relatório de cachê.</p>
      )}

      {selectedEventId && artistReports.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">Nenhum cachê configurado para este evento.</p>
      )}

      {artistReports.map((report, idx) => (
        <Card key={idx} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Music className="h-5 w-5 text-primary" />
                {report.artistName}
              </CardTitle>
              <Badge variant={report.isVariable ? "default" : "secondary"}>
                {report.isVariable ? "Variável" : "Fixo"}
              </Badge>
              {report.isFinalized && (
                <Badge variant="outline" className="border-success/50 text-success">Finalizado</Badge>
              )}
              {report.isUsingMinimum && (
                <Badge variant="outline" className="border-accent text-accent-foreground">Mín. Garantido</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70%]">Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Variable calculation breakdown */}
                {report.isVariable && (
                  <>
                    <TableRow>
                      <TableCell className="font-medium">Receita de Bilheteira ({report.basisLabel})</TableCell>
                      <TableCell className="text-right">{formatCurrency(report.basis)}</TableCell>
                    </TableRow>

                    {report.categoryDeductionItems.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="pl-8 text-muted-foreground">(-) {item.label}</TableCell>
                        <TableCell className="text-right text-destructive">{formatCurrency(-item.amount)}</TableCell>
                      </TableRow>
                    ))}

                    {report.fixedPct > 0 && (
                      <TableRow>
                        <TableCell className="pl-8 text-muted-foreground">(-) Dedução Fixa ({report.fixedPct}%)</TableCell>
                        <TableCell className="text-right text-destructive">{formatCurrency(-report.fixedPctAmount)}</TableCell>
                      </TableRow>
                    )}

                    {(report.categoryDeductionItems.length > 0 || report.fixedPct > 0) && (
                      <TableRow className="bg-muted/30">
                        <TableCell className="pl-8 font-medium">Total Deduções</TableCell>
                        <TableCell className="text-right font-medium text-destructive">{formatCurrency(-report.totalDeduction)}</TableCell>
                      </TableRow>
                    )}

                    <TableRow className="bg-muted/50">
                      <TableCell className="font-medium">Base de Cálculo</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(report.baseForCalc)}</TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell className="text-muted-foreground">Percentagem do Artista</TableCell>
                      <TableCell className="text-right">{report.pct}%</TableCell>
                    </TableRow>
                  </>
                )}

                {/* Cache bruto */}
                <TableRow className="bg-primary/5 border-t-2 border-primary/20">
                  <TableCell className="font-semibold">
                    {report.isVariable ? "Cachê Bruto" : "Cachê Fixo"}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(report.cacheAmount)}</TableCell>
                </TableRow>

                {/* Extras */}
                {report.extras.length > 0 && (
                  <>
                    <TableRow>
                      <TableCell colSpan={2} className="font-semibold text-xs uppercase tracking-wider text-muted-foreground pt-4">
                        Custos Extras a Descontar
                      </TableCell>
                    </TableRow>
                    {report.extras.map((ex: any) => (
                      <TableRow key={ex.id}>
                        <TableCell className="pl-8 text-muted-foreground">
                          (-) {ex.description}
                          {ex.notes && <span className="ml-2 text-xs opacity-60">({ex.notes})</span>}
                        </TableCell>
                        <TableCell className="text-right text-destructive">{formatCurrency(-Number(ex.amount))}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30">
                      <TableCell className="pl-8 font-medium">Total Extras</TableCell>
                      <TableCell className="text-right font-medium text-destructive">{formatCurrency(-report.extrasTotal)}</TableCell>
                    </TableRow>
                  </>
                )}

                {/* Net */}
                <TableRow className="bg-primary/10 border-t-2 border-primary/30">
                  <TableCell className="font-bold text-base">Cachê Líquido a Pagar</TableCell>
                  <TableCell className="text-right font-bold text-base">{formatCurrency(report.netCache)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
