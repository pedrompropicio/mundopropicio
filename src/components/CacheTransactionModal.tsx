import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { X, FileText, Calendar, Building2, Wallet, ArrowDown, Check, Minus } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

interface Props {
  onClose: () => void;
  eventId: string;
  artistName: string;
  amount: number;
  cacheConfigId: string;
  configSupplierId?: string | null;
}

export function CacheTransactionModal({
  onClose,
  eventId,
  artistName,
  amount,
  cacheConfigId,
  configSupplierId,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dueDate, setDueDate] = useState("");
  const [supplierId, setSupplierId] = useState(configSupplierId || "");
  const [accountId, setAccountId] = useState("");
  const [specification, setSpecification] = useState("");
  const [selectedAdvanceIds, setSelectedAdvanceIds] = useState<Set<string>>(new Set());

  // Fetch suppliers
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers_active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  // Fetch financial accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["financial_accounts_active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("financial_accounts")
        .select("id, name, type")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
  });

  // Fetch cache-related category
  const { data: cacheCategory } = useQuery({
    queryKey: ["cache_category_lookup"],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_categories")
        .select("id, code, name, parent_id")
        .eq("is_active", true)
        .eq("type", "expense")
        .ilike("name", "%cach%")
        .order("code")
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  // Fetch existing transactions in the cache category for this event (advances, partial payments)
  const { data: artistTransactions = [] } = useQuery({
    queryKey: ["cache_artist_transactions", eventId, cacheCategory?.id],
    enabled: !!cacheCategory?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, description, amount, paid_amount, status, date, due_date, specification, supplier_id, suppliers(name)")
        .eq("event_id", eventId)
        .eq("type", "expense")
        .eq("category_id", cacheCategory!.id)
        .order("date", { ascending: true });
      return (data ?? []) as any[];
    },
  });

  const totalAdvances = useMemo(() => {
    return artistTransactions
      .filter((tx: any) => selectedAdvanceIds.has(tx.id))
      .reduce((sum: number, tx: any) => sum + Number(tx.amount), 0);
  }, [artistTransactions, selectedAdvanceIds]);

  const finalAmount = Math.max(0, amount - totalAdvances);

  const supplierOptions = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: s.name })),
    [suppliers]
  );

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.name} (${a.type})`,
      })),
    [accounts]
  );

  const toggleAdvance = (id: string) => {
    setSelectedAdvanceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const advanceNote = totalAdvances > 0
        ? ` (deduzidos ${formatCurrency(totalAdvances)} em adiantamentos)`
        : "";
      const description = `Cachê — ${artistName}${advanceNote}`;

      const { error } = await supabase.from("transactions").insert({
        description,
        type: "expense",
        amount: finalAmount,
        iva_rate: 0,
        event_id: eventId,
        category_id: cacheCategory?.id || null,
        supplier_id: supplierId || null,
        account_id: accountId || null,
        specification: specification.trim() || null,
        date: new Date().toISOString().split("T")[0],
        due_date: dueDate || null,
        status: "approved",
        paid_amount: 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["cache_artist_transactions", eventId, cacheCategory?.id] });
      toast({
        title: "Transação criada",
        description: `Transação de cachê para ${artistName} no valor de ${formatCurrency(finalAmount)} criada com sucesso.`,
      });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Erro ao criar transação",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Gerar Transação de Cachê</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Summary */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Artista</p>
            <p className="font-semibold text-foreground">{artistName}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Valor Total do Cachê</span>
              <span className="font-mono font-bold text-lg text-primary">
                {formatCurrency(amount)}
              </span>
            </div>
            {cacheCategory && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Categoria: {cacheCategory.code} — {cacheCategory.name}
              </p>
            )}
          </div>

          {/* Existing transactions / advances section */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Lançamentos existentes — Adiantamentos
              </span>
            </div>

            {artistTransactions.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                <p className="text-xs text-muted-foreground">
                  Nenhum lançamento encontrado para este artista neste evento.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-background overflow-hidden">
                <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
                  {artistTransactions.map((tx: any) => {
                    const isSelected = selectedAdvanceIds.has(tx.id);
                    const paidAmount = Number(tx.paid_amount) || 0;
                    const txAmount = Number(tx.amount);
                    const statusLabel =
                      tx.status === "paid" ? "Pago" :
                      tx.status === "approved" ? "Aprovado" :
                      tx.status === "pending" ? "Pendente" : tx.status;

                    return (
                      <label
                        key={tx.id}
                        className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/30 ${
                          isSelected ? "bg-primary/5" : ""
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleAdvance(tx.id)}
                          className="mt-0.5 h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {tx.description}
                          </p>
                          {tx.specification && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {tx.specification}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {tx.date ? format(new Date(tx.date), "dd/MM/yyyy") : "—"}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              tx.status === "paid"
                                ? "bg-success/10 text-success"
                                : tx.status === "approved"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {statusLabel}
                            </span>
                            {tx.suppliers?.name && (
                              <span className="text-[10px] text-muted-foreground">
                                {tx.suppliers.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-xs font-semibold text-foreground">
                            {formatCurrency(txAmount)}
                          </p>
                          {paidAmount > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              pago: {formatCurrency(paidAmount)}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Advances total */}
                {totalAdvances > 0 && (
                  <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Total adiantamentos selecionados
                    </span>
                    <span className="font-mono text-xs font-bold text-destructive">
                      − {formatCurrency(totalAdvances)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Final amount calculation */}
          {totalAdvances > 0 && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Cachê total</span>
                <span className="font-mono">{formatCurrency(amount)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-destructive">
                <span>Adiantamentos</span>
                <span className="font-mono">− {formatCurrency(totalAdvances)}</span>
              </div>
              <div className="border-t border-primary/20 pt-1.5 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Valor a pagar</span>
                <span className="font-mono font-bold text-lg text-primary">
                  {formatCurrency(finalAmount)}
                </span>
              </div>
            </div>
          )}

          {/* Due Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Data de Vencimento *
            </label>
            <DatePicker value={dueDate} onChange={setDueDate} />
          </div>

          {/* Supplier */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Fornecedor (escritório do artista)
            </label>
            <SearchableSelect
              options={supplierOptions}
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder="Selecionar fornecedor..."
            />
          </div>

          {/* Account */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" />
              Conta Financeira
            </label>
            <SearchableSelect
              options={accountOptions}
              value={accountId}
              onValueChange={setAccountId}
              placeholder="Selecionar conta..."
            />
          </div>

          {/* Specification */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Especificação (opcional)
            </label>
            <input
              type="text"
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              className={inputClass}
              placeholder="Ex: Acordo final pós-evento"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4 shrink-0">
          <div className="text-xs text-muted-foreground">
            {totalAdvances > 0 && (
              <span>Valor final: <strong className="text-foreground">{formatCurrency(finalAmount)}</strong></span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!dueDate || createMutation.isPending || finalAmount <= 0}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? "Criando..." : `Criar Transação (${formatCurrency(finalAmount)})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
