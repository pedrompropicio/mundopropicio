import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import { ChevronDown, CheckCircle2, Clock, AlertCircle, Paperclip, ExternalLink, Download } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { fetchAccountantTxDocs, fetchAccountantDocCountsBatch } from "@/lib/accountant-tx-docs";

interface SupplierTransactionsProps {
  supplierId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function SupplierTransactions({ supplierId, isOpen, onToggle }: SupplierTransactionsProps) {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["supplier-transactions", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description, amount, paid_amount, status, type, date, due_date, specification, event_id, events(name)")
        .eq("supplier_id", supplierId)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const txIds = transactions.map((t) => t.id);
  const { data: docCounts = {} } = useQuery({
    queryKey: ["supplier-tx-doc-counts", supplierId, txIds.length],
    enabled: isOpen && txIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("transaction_id")
        .in("transaction_id", txIds);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const d of data ?? []) m[d.transaction_id] = (m[d.transaction_id] ?? 0) + 1;
      return m;
    },
  });

  const paid = transactions.filter((t) => t.status === "paid");
  const unpaid = transactions.filter((t) => t.status !== "paid");

  const totalAmount = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const totalPaid = transactions.reduce((s, t) => s + Number(t.paid_amount ?? 0), 0);

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        {isOpen ? "Recolher contratações" : "Ver contratações"}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">A carregar…</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma contratação encontrada.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
                  {transactions.length} contratação{transactions.length !== 1 ? "ões" : ""}
                </span>
                <span className="rounded-full bg-success/15 px-2.5 py-1 font-medium text-success">
                  Liquidado: {formatCurrency(totalPaid)}
                </span>
                <span className={`rounded-full px-2.5 py-1 font-medium ${totalAmount - totalPaid > 0 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
                  Em aberto: {formatCurrency(totalAmount - totalPaid)}
                </span>
              </div>

              {unpaid.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-warning mb-1.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Não liquidados ({unpaid.length})
                  </h4>
                  <div className="space-y-1">
                    {unpaid.map((t) => (
                      <TransactionLine key={t.id} tx={t} docCount={docCounts[t.id] ?? 0} />
                    ))}
                  </div>
                </div>
              )}

              {paid.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-success mb-1.5 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Liquidados ({paid.length})
                  </h4>
                  <div className="space-y-1">
                    {paid.map((t) => (
                      <TransactionLine key={t.id} tx={t} docCount={docCounts[t.id] ?? 0} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TransactionLine({ tx, docCount }: { tx: any; docCount: number }) {
  const isPaid = tx.status === "paid";
  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue = !isPaid && tx.due_date && tx.due_date.slice(0, 10) < todayStr;

  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground truncate">{tx.description}</p>
        <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
          <span>{format(new Date(tx.date), "dd/MM/yyyy")}</span>
          {tx.events?.name && <span className="text-primary">🎤 {tx.events.name}</span>}
          {tx.specification && <span>· {tx.specification}</span>}
          {isOverdue && (
            <span className="flex items-center gap-0.5 text-destructive font-medium">
              <AlertCircle className="h-3 w-3" /> Vencido
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-3 shrink-0">
        {docCount > 0 && <TxAttachmentsPopover txId={tx.id} count={docCount} />}
        <div className="text-right">
          <p className={`font-mono font-medium ${tx.type === "income" ? "text-success" : "text-foreground"}`}>
            {formatCurrency(Number(tx.amount))}
          </p>
          {!isPaid && Number(tx.paid_amount) > 0 && (
            <p className="text-[10px] text-success">Pago: {formatCurrency(Number(tx.paid_amount))}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TxAttachmentsPopover({ txId, count }: { txId: string; count: number }) {
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["tx-docs-list", txId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transaction_documents")
        .select("id, file_name, file_path, created_at")
        .eq("transaction_id", txId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function open(path: string, download = false) {
    // Suporta refs externas (ex.: ref://http(s)://...)
    if (path?.startsWith("ref://")) {
      const url = path.slice(6);
      window.open(url, "_blank");
      return;
    }
    const { data, error } = await supabase.storage
      .from("transaction-documents")
      .createSignedUrl(path, 3600, download ? { download: true } : undefined);
    if (error || !data?.signedUrl) {
      toast({ title: "Erro", description: "Não foi possível abrir o anexo.", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
          <Paperclip className="h-3 w-3" />
          <span className="text-[11px]">{count}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="end">
        {isLoading ? (
          <p className="text-xs text-muted-foreground p-2">A carregar…</p>
        ) : docs.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">Sem anexos.</p>
        ) : (
          <div className="space-y-1">
            {docs.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded hover:bg-muted/50 px-2 py-1.5">
                <span className="text-xs truncate flex-1" title={d.file_name}>{d.file_name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => open(d.file_path, false)} title="Abrir">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => open(d.file_path, true)} title="Baixar">
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
