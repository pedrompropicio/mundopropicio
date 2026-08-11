import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signedCompanyUrl } from "@/lib/storage";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";
import { creditRemaining, isCreditExpired, expireStaleCredits } from "@/lib/supplier-credits";
import { NewSupplierCreditModal } from "@/components/supplier-credits/NewSupplierCreditModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Plus, FileText, Search } from "lucide-react";
import { toast } from "sonner";

type Row = any;

/** Aba "Créditos" — gestão de créditos de fornecedor por fornecedor. */
export function SupplierCreditsTab() {
  const { isAdmin, isManager } = useAuth();
  const canManage = isAdmin || isManager;
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlyActive, setOnlyActive] = useState(true);

  useEffect(() => { void expireStaleCredits(); }, []);

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ["supplier-credits-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_credits" as any)
        .select("*, suppliers:supplier_id(name, trade_name), events:origin_event_id(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: usages = [] } = useQuery({
    queryKey: ["supplier-credit-usages-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_credit_usages")
        .select("id, credit_id, amount, used_by, created_at, transaction_id, transactions:transaction_id(description, invoice_ref, events:event_id(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const usagesByCredit = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const u of usages) {
      const arr = m.get(u.credit_id) ?? [];
      arr.push(u);
      m.set(u.credit_id, arr);
    }
    return m;
  }, [usages]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return credits.filter((c) => {
      if (onlyActive && c.status !== "active") return false;
      if (!term) return true;
      return (
        (c.suppliers?.name ?? "").toLowerCase().includes(term) ||
        (c.suppliers?.trade_name ?? "").toLowerCase().includes(term) ||
        (c.reason ?? "").toLowerCase().includes(term) ||
        (c.document_ref ?? "").toLowerCase().includes(term)
      );
    });
  }, [credits, search, onlyActive]);

  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; rows: Row[] }>();
    for (const c of filtered) {
      const key = c.supplier_id;
      const entry = m.get(key) ?? { name: c.suppliers?.name ?? "Fornecedor", rows: [] };
      entry.rows.push(c);
      m.set(key, entry);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [filtered]);

  const totalAvailable = filtered
    .filter((c) => c.status === "active" && !isCreditExpired(c.valid_until))
    .reduce((s, c) => s + creditRemaining(c), 0);

  const openFile = async (path: string) => {
    const { data } = await signedCompanyUrl("supplier-credit-documents", path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Erro ao abrir anexo");
  };

  const statusLabel = (c: Row) => {
    if (c.status === "exhausted") return { text: "Esgotado", cls: "bg-muted text-muted-foreground" };
    if (c.status === "expired" || isCreditExpired(c.valid_until)) return { text: "Expirado", cls: "bg-destructive/15 text-destructive" };
    return { text: "Ativo", cls: "bg-primary/15 text-primary" };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar fornecedor, motivo, nº da nota…" className="pl-8" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          Só ativos
        </label>
        {canManage && (
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo crédito
          </Button>
        )}
      </div>

      <div className="glass rounded-xl p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Créditos disponíveis</p>
        <p className="mt-1 text-2xl font-bold text-primary">{formatCurrency(totalAvailable)}</p>
        <p className="text-xs text-muted-foreground">em {grouped.length} fornecedor{grouped.length === 1 ? "" : "es"}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum crédito registado.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([supplierId, g]) => (
            <div key={supplierId} className="glass rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{g.name}</p>
                <span className="text-xs font-mono text-primary">
                  {formatCurrency(g.rows.filter((c) => c.status === "active" && !isCreditExpired(c.valid_until)).reduce((s, c) => s + creditRemaining(c), 0))} disponível
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {g.rows.map((c) => {
                  const st = statusLabel(c);
                  const rows = usagesByCredit.get(c.id) ?? [];
                  const isOpen = expanded === c.id;
                  return (
                    <div key={c.id} className="py-2 text-xs space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setExpanded(isOpen ? null : c.id)} className="text-muted-foreground hover:text-foreground">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                        <span className="font-medium">{c.reason}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}>{st.text}</span>
                        {c.document_ref && <span className="text-muted-foreground">NC {c.document_ref}</span>}
                        {c.events?.name && <span className="text-muted-foreground">Origem: {c.events.name}</span>}
                        {c.valid_until && (
                          <span className={isCreditExpired(c.valid_until) ? "text-destructive" : "text-muted-foreground"}>
                            Válido até {formatDatePT(c.valid_until)}
                          </span>
                        )}
                        {c.file_url && (
                          <button onClick={() => openFile(c.file_url)} className="text-primary hover:underline inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" /> anexo
                          </button>
                        )}
                        <span className="ml-auto font-mono font-semibold">
                          {formatCurrency(creditRemaining(c))} / {formatCurrency(Number(c.amount))}
                        </span>
                      </div>
                      {isOpen && (
                        <div className="ml-6 rounded-md border border-border/50 bg-muted/20 p-2 space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Histórico de usos ({rows.length})</p>
                          {rows.length === 0 ? (
                            <p className="text-muted-foreground">Ainda sem abates.</p>
                          ) : (
                            rows.map((u) => (
                              <div key={u.id} className="flex items-center justify-between gap-2">
                                <span className="truncate">
                                  {formatDatePT(u.created_at)} · {u.transactions?.description ?? "Transação"}
                                  {u.transactions?.invoice_ref ? ` (${u.transactions.invoice_ref})` : ""}
                                  {u.transactions?.events?.name ? ` · ${u.transactions.events.name}` : ""}
                                </span>
                                <span className="font-mono shrink-0">{formatCurrency(Number(u.amount))}</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <NewSupplierCreditModal open={showNew} onOpenChange={setShowNew} />
    </div>
  );
}
