import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { FileDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ReportPartnerExpenses() {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: events = [] } = useQuery({
    queryKey: ["events-list-for-partner-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, name, date")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: allExpenses = [], isLoading } = useQuery({
    queryKey: ["partner-paid-expenses-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_paid_expenses")
        .select("*, event_partners(suppliers(name), percentage), transactions(description, amount, date, status, iva_rate, specification, account_categories(name, code)), events(name, date)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Unique partners from data
  const partnerOptions = useMemo(() => {
    const map = new Map<string, string>();
    allExpenses.forEach((pe: any) => {
      const pid = pe.partner_id;
      const name = pe.event_partners?.suppliers?.name;
      if (pid && name && !map.has(pid)) map.set(pid, name);
    });
    return Array.from(map, ([value, label]) => ({ value, label }));
  }, [allExpenses]);

  const filtered = useMemo(() => {
    let list = allExpenses;
    if (selectedEventId) list = list.filter((pe: any) => pe.event_id === selectedEventId);
    if (selectedPartnerId) list = list.filter((pe: any) => pe.partner_id === selectedPartnerId);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter((pe: any) => {
        const desc = pe.transactions?.description?.toLowerCase() || "";
        const spec = pe.transactions?.specification?.toLowerCase() || "";
        const event = pe.events?.name?.toLowerCase() || "";
        const partner = pe.event_partners?.suppliers?.name?.toLowerCase() || "";
        return desc.includes(s) || spec.includes(s) || event.includes(s) || partner.includes(s);
      });
    }
    return list;
  }, [allExpenses, selectedEventId, selectedPartnerId, searchTerm]);

  const total = useMemo(() => filtered.reduce((s: number, pe: any) => s + Number(pe.transactions?.amount || 0), 0), [filtered]);

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const title = "Relatório de Despesas Pagas por Sócios";
    doc.setFontSize(14);
    doc.text(title, 14, 18);
    doc.setFontSize(9);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 24);

    const filters: string[] = [];
    if (selectedEventId) {
      const ev = events.find((e: any) => e.id === selectedEventId);
      if (ev) filters.push(`Evento: ${ev.name}`);
    }
    if (selectedPartnerId) {
      const p = partnerOptions.find((p) => p.value === selectedPartnerId);
      if (p) filters.push(`Sócio: ${p.label}`);
    }
    if (filters.length > 0) {
      doc.text(filters.join(" | "), 14, 29);
    }

    const rows = filtered.map((pe: any) => {
      const tx = pe.transactions;
      const amount = Number(tx?.amount || 0);
      const iva = Number(tx?.iva_rate || 0);
      const totalWithIva = Math.round(amount * (1 + iva / 100) * 100) / 100;
      return [
        pe.events?.name || "—",
        pe.event_partners?.suppliers?.name || "—",
        `${pe.event_partners?.percentage || 0}%`,
        tx?.description || "—",
        tx?.account_categories?.name || "—",
        tx?.date ? format(new Date(tx.date), "dd/MM/yyyy") : "—",
        formatCurrency(amount),
        `${iva}%`,
        formatCurrency(totalWithIva),
      ];
    });

    const totalWithIva = filtered.reduce((s: number, pe: any) => {
      const amount = Number(pe.transactions?.amount || 0);
      const iva = Number(pe.transactions?.iva_rate || 0);
      return s + Math.round(amount * (1 + iva / 100) * 100) / 100;
    }, 0);

    autoTable(doc, {
      startY: filters.length > 0 ? 34 : 29,
      head: [["Evento", "Sócio", "%", "Descrição", "Categoria", "Data", "Base", "IVA", "Total"]],
      body: rows,
      foot: [["", "", "", "", "", "TOTAL", formatCurrency(total), "", formatCurrency(totalWithIva)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: "bold" },
    });

    doc.save(`despesas-socios-${format(new Date(), "yyyyMMdd")}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Evento</label>
          <SearchableSelect
            options={[{ value: "", label: "Todos" }, ...events.map((e: any) => ({ value: e.id, label: e.name }))]}
            value={selectedEventId}
            onValueChange={setSelectedEventId}
            placeholder="Todos os eventos"
            searchPlaceholder="Pesquisar…"
          />
        </div>
        <div className="w-48">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Sócio</label>
          <SearchableSelect
            options={[{ value: "", label: "Todos" }, ...partnerOptions]}
            value={selectedPartnerId}
            onValueChange={setSelectedPartnerId}
            placeholder="Todos os sócios"
            searchPlaceholder="Pesquisar…"
          />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Pesquisa</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Descrição, evento, sócio…"
              className="pl-8 h-9"
            />
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={exportPDF} disabled={filtered.length === 0}>
          <FileDown className="mr-1.5 h-3.5 w-3.5" /> PDF
        </Button>
      </div>

      {/* Summary */}
      <div className="flex gap-4">
        <div className="glass rounded-xl px-4 py-3">
          <p className="text-xs text-muted-foreground">Total de despesas</p>
          <p className="text-lg font-bold font-mono">{formatCurrency(total)}</p>
        </div>
        <div className="glass rounded-xl px-4 py-3">
          <p className="text-xs text-muted-foreground">Registos</p>
          <p className="text-lg font-bold font-mono">{filtered.length}</p>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">A carregar…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma despesa paga por sócios encontrada.</p>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Sócio</TableHead>
                <TableHead>%</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor Base</TableHead>
                <TableHead className="text-right">Total c/ IVA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((pe: any) => {
                const tx = pe.transactions;
                const amount = Number(tx?.amount || 0);
                const iva = Number(tx?.iva_rate || 0);
                const totalWithIva = Math.round(amount * (1 + iva / 100) * 100) / 100;
                return (
                  <TableRow key={pe.id}>
                    <TableCell className="text-sm">{pe.events?.name || "—"}</TableCell>
                    <TableCell className="text-sm font-medium">{pe.event_partners?.suppliers?.name || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{pe.event_partners?.percentage || 0}%</TableCell>
                    <TableCell>
                      <p className="text-sm">{tx?.description || "—"}</p>
                      {tx?.specification && <p className="text-xs text-muted-foreground">{tx.specification}</p>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{tx?.account_categories?.name || "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{tx?.date ? format(new Date(tx.date), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(amount)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatCurrency(totalWithIva)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
