import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/mock-data";
import { X, FileText, Calendar, Building2, Wallet } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface Props {
  onClose: () => void;
  eventId: string;
  artistName: string;
  amount: number;
  cacheConfigId: string;
}

export function CacheTransactionModal({
  onClose,
  eventId,
  artistName,
  amount,
  cacheConfigId,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [dueDate, setDueDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [specification, setSpecification] = useState("");

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

  // Fetch cache-related category (look for "Cachê" or similar in expense categories)
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

  // Check if transaction already exists for this cache config
  const { data: existingTx } = useQuery({
    queryKey: ["cache_transaction_check", cacheConfigId],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, description, amount, status")
        .eq("event_id", eventId)
        .ilike("description", `%Cachê%${artistName}%`)
        .limit(1);
      return data?.[0] ?? null;
    },
  });

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const description = `Cachê — ${artistName}`;

      const { error } = await supabase.from("transactions").insert({
        description,
        type: "expense",
        amount,
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
      queryClient.invalidateQueries({ queryKey: ["cache_transaction_check", cacheConfigId] });
      toast({
        title: "Transação criada",
        description: `Transação de cachê para ${artistName} no valor de ${formatCurrency(amount)} criada com sucesso.`,
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
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Gerar Transação de Cachê</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Existing transaction warning */}
          {existingTx && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <p className="text-xs font-medium text-warning">
                Já existe uma transação de cachê para este artista
              </p>
              <p className="text-[10px] text-warning/80 mt-1">
                "{existingTx.description}" — {formatCurrency(Number(existingTx.amount))} ({existingTx.status})
              </p>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Artista</p>
            <p className="font-semibold text-foreground">{artistName}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Valor do Cachê</span>
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
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!dueDate || createMutation.isPending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {createMutation.isPending ? "Criando..." : "Criar Transação"}
          </button>
        </div>
      </div>
    </div>
  );
}
