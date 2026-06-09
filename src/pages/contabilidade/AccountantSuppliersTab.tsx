import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Paperclip, Eye, ArrowDownUp, ChevronRight } from "lucide-react";
import { SupplierViewModal, type SupplierRow } from "./SupplierViewModal";
import { SupplierTransactions } from "@/components/SupplierTransactions";

export function AccountantSuppliersTab() {
  const { companyId } = useCompany();
  const [nameSearch, setNameSearch] = useState("");
  const [nifSearch, setNifSearch] = useState("");
  const [attachmentsFilter, setAttachmentsFilter] = useState<"all" | "with" | "without">("all");
  const [sortBy, setSortBy] = useState<{ k: "name" | "nif"; dir: "asc" | "desc" }>({ k: "name", dir: "asc" });
  const [viewing, setViewing] = useState<SupplierRow | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["accountant-suppliers", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("suppliers")
        .select("id, name, trade_name, nif, email, phone, address, contact_name, category, payment_terms, iban, iban_2, iban_3, swift_bic, swift_bic_2, swift_bic_3, notes, is_partner")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const ids = (rows ?? []).map((r: any) => r.id);
      const counts = new Map<string, number>();
      if (ids.length) {
        const { data: docs } = await (supabase as any)
          .from("supplier_documents")
          .select("supplier_id")
          .in("supplier_id", ids);
        for (const d of docs ?? []) counts.set(d.supplier_id, (counts.get(d.supplier_id) ?? 0) + 1);
      }
      return (rows ?? []).map((r: any) => ({ ...r, doc_count: counts.get(r.id) ?? 0 })) as (SupplierRow & { doc_count: number })[];
    },
  });

  const rows = useMemo(() => {
    let r = data ?? [];
    if (nameSearch.trim()) {
      const s = nameSearch.trim().toLowerCase();
      r = r.filter((x) => (x.name ?? "").toLowerCase().includes(s) || (x.trade_name ?? "").toLowerCase().includes(s));
    }
    if (nifSearch.trim()) {
      const s = nifSearch.trim().toLowerCase();
      r = r.filter((x) => (x.nif ?? "").toLowerCase().includes(s));
    }
    if (attachmentsFilter === "with") r = r.filter((x) => x.doc_count > 0);
    else if (attachmentsFilter === "without") r = r.filter((x) => x.doc_count === 0);
    const dir = sortBy.dir === "asc" ? 1 : -1;
    r = [...r].sort((a, b) => {
      const va = ((a as any)[sortBy.k] ?? "").toString().toLowerCase();
      const vb = ((b as any)[sortBy.k] ?? "").toString().toLowerCase();
      if (va === vb) return 0;
      return va > vb ? dir : -dir;
    });
    return r;
  }, [data, nameSearch, nifSearch, attachmentsFilter, sortBy]);

  const totals = useMemo(() => ({
    total: rows.length,
    withDocs: rows.filter((r) => r.doc_count > 0).length,
  }), [rows]);

  function toggleSort(k: "name" | "nif") {
    setSortBy((p) => p.k === k ? { k, dir: p.dir === "asc" ? "desc" : "asc" } : { k, dir: "asc" });
  }

  function ibanCell(s: SupplierRow) {
    const all = [s.iban, s.iban_2, s.iban_3].filter((x) => x && x.trim());
    if (all.length === 0) return <span className="text-muted-foreground">—</span>;
    const first = all[0]!;
    if (all.length === 1) return <span className="font-mono text-xs">{first}</span>;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="font-mono text-xs underline decoration-dotted cursor-help">{first} +{all.length - 1}</span>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            {all.map((x, i) => <div key={i} className="font-mono text-xs">{x}</div>)}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totals.total}</span> fornecedores ·{" "}
          <span className="font-semibold text-foreground">{totals.withDocs}</span> com anexos
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar por nome…" value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} className="w-56 h-9" />
        <Input placeholder="Buscar por NIF…" value={nifSearch} onChange={(e) => setNifSearch(e.target.value)} className="w-44 h-9" />
        <Select value={attachmentsFilter} onValueChange={(v) => setAttachmentsFilter(v as any)}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anexos: Todos</SelectItem>
            <SelectItem value="with">Com anexos</SelectItem>
            <SelectItem value="without">Sem anexos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-left">
                <th className="p-2 w-8"></th>
                <th className="p-2 cursor-pointer" onClick={() => toggleSort("name")}>Nome <ArrowDownUp className="inline h-3 w-3" /></th>
                <th className="p-2 cursor-pointer" onClick={() => toggleSort("nif")}>NIF <ArrowDownUp className="inline h-3 w-3" /></th>
                <th className="p-2">IBAN</th>
                <th className="p-2">Email</th>
                <th className="p-2">Telefone</th>
                <th className="p-2">Morada</th>
                <th className="p-2">Anexos</th>
                <th className="p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />A carregar…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Sem fornecedores.</td></tr>
              ) : rows.map((s) => (
                <>
                  <tr key={s.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 align-top">
                      <button onClick={() => toggleExpand(s.id)} className="p-1 hover:bg-muted rounded" aria-label="Expandir transações">
                        <ChevronRight className={`h-4 w-4 transition-transform ${expanded.has(s.id) ? "rotate-90" : ""}`} />
                      </button>
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{s.name}</div>
                      {s.trade_name && <div className="text-xs text-muted-foreground">{s.trade_name}</div>}
                    </td>
                    <td className="p-2 whitespace-nowrap">{s.nif ?? "—"}</td>
                    <td className="p-2">{ibanCell(s)}</td>
                    <td className="p-2 max-w-[200px] truncate">{s.email ?? "—"}</td>
                    <td className="p-2 whitespace-nowrap">{s.phone ?? "—"}</td>
                    <td className="p-2 max-w-[220px] truncate">{s.address ?? "—"}</td>
                    <td className="p-2">
                      {s.doc_count > 0 ? <Badge variant="secondary"><Paperclip className="h-3 w-3 mr-1" />{s.doc_count}</Badge> : "—"}
                    </td>
                    <td className="p-2">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(s)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                      </Button>
                    </td>
                  </tr>
                  {expanded.has(s.id) && (
                    <tr key={s.id + "-tx"} className="bg-muted/10">
                      <td></td>
                      <td colSpan={8} className="p-3">
                        <SupplierTransactions supplierId={s.id} isOpen={true} onToggle={() => toggleExpand(s.id)} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SupplierViewModal supplier={viewing} open={!!viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

export default AccountantSuppliersTab;
