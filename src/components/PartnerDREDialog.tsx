import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/mock-data";
import { expandOverheadToSplits } from "@/lib/overhead-proration";
import {
  buildDREForExport,
  exportDREToPDF,
  getEffectiveTransactionsForExport,
} from "@/lib/export-dre";

interface PartnerDREDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventName: string;
}

/**
 * DRE Brasil simplificado para o portal do sócio.
 * Vista do sócio fixa (com overheads embutidos nas categorias) + botão Gerar PDF.
 * Sem qualquer controlo de configuração visível.
 */
export default function PartnerDREDialog({ open, onOpenChange, eventId, eventName }: PartnerDREDialogProps) {
  const enabled = open && !!eventId;

  const { data: bundle, isLoading } = useQuery({
    queryKey: ["partner_dre_bundle", eventId],
    enabled,
    queryFn: async () => {
      const eventsRes = await supabase.from("events").select("*");
      if (eventsRes.error) throw eventsRes.error;
      const events = eventsRes.data ?? [];
      // Universo de eventos relevante: o próprio + sub-eventos (turnê) + Master.
      const evt = events.find((e: any) => e.id === eventId);
      const dreEventIds = Array.from(
        new Set([
          eventId,
          ...(evt?.parent_event_id ? [evt.parent_event_id as string] : []),
          ...events.filter((e: any) => e.parent_event_id === eventId).map((e: any) => e.id as string),
        ]),
      );

      const [
        aggRes,
        catsRes,
        zonesRes,
        lotsRes,
        salesRes,
        partnersRes,
        overheadsRes,
      ] = await Promise.all([
        // O sócio não tem acesso à tabela `transactions`: agregados por
        // (evento, tipo, rubrica, taxa de IVA) via RPC SECURITY DEFINER.
        supabase.rpc("get_partner_event_tx_aggregates" as any, { p_event_ids: dreEventIds } as any),
        supabase.from("account_categories").select("*"),
        supabase.from("event_ticket_zones").select("*"),
        supabase.from("event_ticket_lots").select("*"),
        supabase.from("ticket_sales").select("*"),
        supabase.from("event_partners").select("*, suppliers(name)"),
        supabase
          .from("event_forecasts")
          .select("id, event_id, amount, description, category_id, iva_rate, account_categories(code, name)")
          .eq("is_overhead", true)
          .is("version_id", null),
      ]);
      if (aggRes.error) throw aggRes.error;
      if (catsRes.error) throw catsRes.error;
      const transactions = ((aggRes.data ?? []) as any[]).map((r: any) => ({
        id: `agg-${r.event_id}-${r.tx_type}-${r.category_id ?? "none"}-${r.iva_rate}`,
        event_id: r.event_id,
        type: r.tx_type,
        category_id: r.category_id,
        amount: Number(r.base_amount) || 0,
        iva_rate: Number(r.iva_rate) || 0,
        is_transitory: false,
        exclude_from_result: false,
      }));
      return {
        events,
        transactions,
        categories: catsRes.data ?? [],
        ticketZones: zonesRes.data ?? [],
        ticketLots: lotsRes.data ?? [],
        ticketSales: salesRes.data ?? [],
        eventPartners: partnersRes.data ?? [],
        overheadsRaw: overheadsRes.data ?? [],
      };
    },
  });


  // Overheads expandidos Master→Splits (÷N)
  const closingCosts = useMemo(
    () => (bundle ? expandOverheadToSplits(bundle.overheadsRaw as any, bundle.events as any) : []),
    [bundle],
  );

  const ticketCategoryId = useMemo(() => {
    if (!bundle) return null;
    return (
      bundle.categories.find((c: any) =>
        c.name.toLowerCase().includes("venda de bilhete") ||
        c.name.toLowerCase().includes("bilhetes") ||
        c.name.toLowerCase().includes("bilheteira"),
      )?.id ?? null
    );
  }, [bundle]);

  // Constrói uma lista de blocos: um DRE por cidade (sub-evento) + um resumo
  // consolidado da turnê no final. Para evento simples, devolve um único bloco.
  const dreBlocks = useMemo(() => {
    if (!bundle) return null;
    const evt = bundle.events.find((e: any) => e.id === eventId);
    if (!evt) return null;
    const children = bundle.events.filter((e: any) => e.parent_event_id === eventId);
    const blocksSource = children.length > 0 ? children : [evt];

    const blocks = blocksSource.map((child: any) => {
      const evtTx = getEffectiveTransactionsForExport(child.id, bundle.transactions, bundle.events);
      const lines = buildDREForExport(
        evtTx,
        bundle.categories,
        "ticket_sales",
        bundle.ticketZones,
        bundle.ticketLots,
        bundle.ticketSales,
        child.id,
        ticketCategoryId,
        bundle.eventPartners,
        bundle.events,
        true,
        closingCosts,
      );
      return { title: child.name, lines };
    });

    // Resumo consolidado (apenas se houver mais do que uma cidade)
    if (children.length > 1) {
      const allTx = children.flatMap((c: any) =>
        getEffectiveTransactionsForExport(c.id, bundle.transactions, bundle.events),
      );
      // Para o resumo, usa o eventId Master para que partners/closingCosts batam.
      const summaryLines = buildDREForExport(
        allTx,
        bundle.categories,
        "ticket_sales",
        bundle.ticketZones,
        bundle.ticketLots,
        bundle.ticketSales,
        eventId,
        ticketCategoryId,
        bundle.eventPartners,
        bundle.events,
        true,
        // Em consolidado, somar overheads de todas as cidades
        (closingCosts || []).map((cc: any) =>
          children.some((c: any) => c.id === cc.event_id) ? { ...cc, event_id: eventId } : cc,
        ),
      );
      blocks.push({ title: `Resumo — ${evt.name}`, lines: summaryLines });
    }

    return blocks;
  }, [bundle, eventId, ticketCategoryId, closingCosts]);

  const handlePDF = () => {
    if (!bundle) return;
    const evt = bundle.events.find((e: any) => e.id === eventId);
    if (!evt) return;
    // Se o evento é Master (turnê), exporta todos os sub-eventos para que o PDF
    // contenha DRE de cada cidade + página de Resumo da Turnê no final.
    // Caso contrário (evento simples / sub-evento isolado), exporta só o próprio.
    const children = bundle.events.filter((e: any) => e.parent_event_id === eventId);
    const eventsToExport = children.length > 0 ? children : [evt];
    exportDREToPDF(
      eventsToExport,
      bundle.transactions,
      bundle.categories,
      "ticket_sales",
      bundle.ticketZones,
      bundle.ticketLots,
      bundle.ticketSales,
      ticketCategoryId,
      bundle.eventPartners,
      bundle.events,
      true,
      closingCosts,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            DRE — {eventName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" onClick={handlePDF} disabled={!bundle || isLoading}>
            <FileText className="mr-1.5 h-4 w-4" /> Gerar PDF
          </Button>
        </div>

        {isLoading || !dreBlocks ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {dreBlocks.map((block, bIdx) => (
              <div key={bIdx} className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary border-b border-primary/30 pb-1">
                  {block.title}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rubrica</TableHead>
                      <TableHead className="text-right">Valor (€)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {block.lines.map((line: any, i: number) => {
                      const rowClass = line.isRetained
                        ? "border-t-2 border-accent/40 bg-accent/10"
                        : line.isGrandTotal
                        ? "border-t-2 border-primary/30 bg-primary/5"
                        : line.isTotal
                        ? "bg-secondary/20"
                        : line.isGroupHeader
                        ? "bg-secondary/10 border-t border-border/20"
                        : line.isDistribution
                        ? "bg-amber-500/5"
                        : "";
                      const labelClass = `${line.indent ? "pl-8" : line.isGroupHeader ? "pl-4" : ""} ${
                        line.isTotal || line.isGrandTotal || line.isRetained
                          ? "font-bold text-xs uppercase tracking-wider"
                          : line.isDistribution
                          ? "text-sm italic text-muted-foreground"
                          : line.isGroupHeader
                          ? "font-semibold text-sm"
                          : "text-sm"
                      }`;
                      const displayVal = line.isExpenseSide ? line.amountIncIva : line.amountExIva;
                      const formattedVal =
                        displayVal < 0
                          ? `-${formatCurrency(Math.abs(displayVal))}`
                          : formatCurrency(displayVal);
                      const valClass = `text-right font-mono ${
                        line.isRetained || line.isGrandTotal
                          ? `text-base font-bold ${displayVal >= 0 ? "text-success" : "text-destructive"}`
                          : line.isDistribution
                          ? "text-sm text-amber-500"
                          : line.isTotal
                          ? "font-semibold"
                          : line.isGroupHeader
                          ? "font-semibold text-sm"
                          : "text-muted-foreground"
                      }`;
                      return (
                        <TableRow key={i} className={rowClass}>
                          <TableCell className={labelClass}>{line.label}</TableCell>
                          <TableCell className={valClass}>{formattedVal}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
