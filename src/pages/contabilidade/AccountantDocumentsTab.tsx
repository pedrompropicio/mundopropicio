import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Download, Paperclip, ArrowDownUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Period } from "./PeriodSelector";

interface Tx {
  id: string;
  type: string;
  payment_date: string | null;
  description: string;
  amount: number;
  invoice_ref: string | null;
  supplier_id: string | null;
  account_id: string | null;
  status: string;
  paid_amount: number;
  supplier_name: string | null;
  supplier_nif: string | null;
  doc_count: number;
}

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n ?? 0);

export function AccountantDocumentsTab({ period }: { period: Period }) {
  const { companyId } = useCompany();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<"all" | "expense" | "income">("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [attachmentsFilter, setAttachmentsFilter] = useState<"all" | "with" | "without">("all");
  const [sortBy, setSortBy] = useState<{ k: "payment_date" | "amount" | "supplier_name"; dir: "asc" | "desc" }>({
    k: "payment_date", dir: "desc",
  });
  const [zipLoading, setZipLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["accountant-documents", companyId, period.from, period.to, typeFilter, accountFilter],
    enabled: !!companyId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("transactions")
        .select("id, type, payment_date, description, amount, invoice_ref, supplier_id, account_id, status, paid_amount, suppliers:supplier_id(name, nif)")
        .eq("company_id", companyId)
        .gte("payment_date", period.from)
        .lte("payment_date", period.to)
        .or("status.eq.paid,paid_amount.gt.0")
        .order("payment_date", { ascending: false })
        .limit(2000);
      if (typeFilter !== "all") q = q.eq("type", typeFilter);
      if (accountFilter !== "all") q = q.eq("account_id", accountFilter);

      const { data: rows, error } = await q;
      if (error) throw error;
      const ids = (rows ?? []).map((r: any) => r.id);
      let counts = new Map<string, number>();
      if (ids.length) {
        const { data: docs } = await (supabase as any)
          .from("transaction_documents")
          .select("transaction_id")
          .in("transaction_id", ids);
        for (const d of docs ?? []) counts.set(d.transaction_id, (counts.get(d.transaction_id) ?? 0) + 1);
      }
      return (rows ?? []).map((r: any): Tx => ({
        ...r,
        supplier_name: r.suppliers?.name ?? null,
        supplier_nif: r.suppliers?.nif ?? null,
        doc_count: counts.get(r.id) ?? 0,
      }));
    },
  });

  const { data: accounts } = useQuery({
    queryKey: ["accountant-accounts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("financial_accounts")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const rows = useMemo(() => {
    let r = data ?? [];
    if (attachmentsFilter === "with") r = r.filter((x) => x.doc_count > 0);
    else if (attachmentsFilter === "without") r = r.filter((x) => x.doc_count === 0);
    if (supplierSearch.trim()) {
      const s = supplierSearch.trim().toLowerCase();
      r = r.filter((x) => (x.supplier_name ?? "").toLowerCase().includes(s));
    }
    const dir = sortBy.dir === "asc" ? 1 : -1;
    r = [...r].sort((a, b) => {
      const va = (a as any)[sortBy.k] ?? "";
      const vb = (b as any)[sortBy.k] ?? "";
      if (va === vb) return 0;
      return va > vb ? dir : -dir;
    });
    return r;
  }, [data, attachmentsFilter, supplierSearch, sortBy]);

  const totals = useMemo(() => ({
    tx: rows.length,
    docs: rows.reduce((s, r) => s + r.doc_count, 0),
    amount: rows.reduce((s, r) => s + Number(r.amount ?? 0), 0),
  }), [rows]);

  const downloadOne = useMutation({
    mutationFn: async (tx: Tx) => {
      const { data: docs } = await (supabase as any)
        .from("transaction_documents")
        .select("name, file_url")
        .eq("transaction_id", tx.id);
      if (!docs?.length) throw new Error("Sem anexos");
      // For a single doc → direct signed URL. For multiple, fallback to ZIP via edge for the day.
      if (docs.length === 1) {
        const { data: signed, error } = await supabase.storage
          .from("transaction-documents")
          .createSignedUrl(docs[0].file_url, 60 * 60);
        if (error || !signed) throw error ?? new Error("signed url falhou");
        await supabase.rpc("record_document_download" as any, {
          p_resource_type: "transaction_document",
          p_resource_id: tx.id,
          p_bucket: "transaction-documents",
          p_file_path: docs[0].file_url,
          p_file_name: docs[0].name,
        } as any);
        window.open(signed.signedUrl, "_blank");
        return;
      }
      // Many docs for one tx → use edge to build mini-ZIP scoped to that day+supplier
      const { data, error } = await supabase.functions.invoke("generate-accountant-zip", {
        body: {
          company_id: companyId,
          period: { from: tx.payment_date, to: tx.payment_date },
          filters: { supplier_ids: tx.supplier_id ? [tx.supplier_id] : [] },
        },
      });
      if (error) throw error;
      if ((data as any)?.url) window.open((data as any).url, "_blank");
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" }),
  });

  async function downloadAll() {
    setZipLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-accountant-zip", {
        body: {
          company_id: companyId,
          period,
          filters: {
            type: typeFilter,
            account_ids: accountFilter !== "all" ? [accountFilter] : [],
            has_attachments: attachmentsFilter,
          },
        },
      });
      if (error) throw new Error(error.message);
      const r = data as any;
      if (r?.error) throw new Error(r.error);
      toast({ title: "ZIP pronto", description: `${r.transaction_count} transações · ${r.document_count} anexos · ${r.total_size_mb} MB` });
      if (r.url) window.open(r.url, "_blank");
    } catch (e: any) {
      toast({ title: "Erro ao gerar ZIP", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setZipLoading(false);
    }
  }

  function toggleSort(k: "payment_date" | "amount" | "supplier_name") {
    setSortBy((p) => p.k === k ? { k, dir: p.dir === "asc" ? "desc" : "asc" } : { k, dir: "desc" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totals.tx}</span> transações ·{" "}
          <span className="font-semibold text-foreground">{totals.docs}</span> anexos ·{" "}
          <span className="font-semibold text-foreground">{fmtEUR(totals.amount)}</span>
        </div>
        <Button onClick={downloadAll} disabled={zipLoading || !companyId}>
          {zipLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
          Descarregar Tudo (ZIP)
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tipo: Todos</SelectItem>
            <SelectItem value="expense">Despesa</SelectItem>
            <SelectItem value="income">Receita</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Conta: Todas</SelectItem>
            {(accounts ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Buscar fornecedor…" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} className="w-56 h-9" />
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
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-left">
                <th className="p-2 cursor-pointer" onClick={() => toggleSort("payment_date")}>Data Pagto <ArrowDownUp className="inline h-3 w-3" /></th>
                <th className="p-2">Descrição</th>
                <th className="p-2 cursor-pointer" onClick={() => toggleSort("supplier_name")}>Fornecedor</th>
                <th className="p-2">NIF</th>
                <th className="p-2 text-right cursor-pointer" onClick={() => toggleSort("amount")}>Valor</th>
                <th className="p-2">Nº Doc</th>
                <th className="p-2">Anexos</th>
                <th className="p-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />A carregar…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sem transações no período.</td></tr>
              ) : rows.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="p-2 whitespace-nowrap">{t.payment_date ? format(new Date(t.payment_date), "dd/MM/yyyy") : "—"}</td>
                  <td className="p-2 max-w-xs">
                    {t.description?.length > 40 ? (
                      <Tooltip>
                        <TooltipTrigger asChild><span className="cursor-help">{t.description.slice(0, 40)}…</span></TooltipTrigger>
                        <TooltipContent className="max-w-md">{t.description}</TooltipContent>
                      </Tooltip>
                    ) : t.description}
                  </td>
                  <td className="p-2">{t.supplier_name ?? "—"}</td>
                  <td className="p-2">{t.supplier_nif ?? "—"}</td>
                  <td className="p-2 text-right whitespace-nowrap">{fmtEUR(Number(t.amount))}</td>
                  <td className="p-2">{t.invoice_ref ?? "—"}</td>
                  <td className="p-2">
                    {t.doc_count > 0 ? <Badge variant="secondary"><Paperclip className="h-3 w-3 mr-1" />{t.doc_count}</Badge> : "—"}
                  </td>
                  <td className="p-2">
                    {t.doc_count > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => downloadOne.mutate(t)} disabled={downloadOne.isPending}>
                        <Download className="h-3.5 w-3.5 mr-1" />ZIP
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
