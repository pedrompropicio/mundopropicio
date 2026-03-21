import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, CalendarIcon, RefreshCw, Landmark, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";


interface FinancialOperationsTabProps {
  accounts: any[];
  isAdmin: boolean;
}

const DESCRIPTION_SUGGESTIONS = [
  { label: "Taxa/Comissão Bancária", type: "expense" },
  { label: "Juros Pagos", type: "expense" },
  { label: "Juros Recebidos", type: "income" },
  { label: "Parcela de Empréstimo/Financiamento", type: "expense" },
  { label: "Seguros", type: "expense" },
  { label: "Impostos/Encargos", type: "expense" },
  { label: "Outro Custo Não Operacional", type: "expense" },
  { label: "Outra Receita Não Operacional", type: "income" },
];

interface OpForm {
  account_id: string;
  amount: string;
  description: string;
  date: Date | undefined;
  category_id: string;
  is_recurring: boolean;
  recurring_day: string;
  recurring_end: Date | undefined;
}

const emptyForm: OpForm = {
  account_id: "",
  amount: "",
  description: "",
  date: new Date(),
  category_id: "",
  is_recurring: false,
  recurring_day: "1",
  recurring_end: undefined,
};

export default function FinancialOperationsTab({ accounts, isAdmin }: FinancialOperationsTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<OpForm>(emptyForm);
  const [dateOpen, setDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Fetch group 10 categories (non-operational)
  const { data: categories = [] } = useQuery({
    queryKey: ["fin-op-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_categories")
        .select("*")
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data;
    },
  });

  // Filter to group 10 categories (code starts with "10")
  const group10Root = categories.find((c: any) => c.code === "10" && !c.parent_id);
  const group10Categories = categories.filter((c: any) => {
    if (!group10Root) return c.code.startsWith("10");
    // Include the root and all descendants
    return c.code.startsWith("10");
  });

  // Build hierarchical options for select - only leaf categories (L3)
  const leafCategories = group10Categories.filter((c: any) => {
    // A leaf has no children
    return !group10Categories.some((other: any) => other.parent_id === c.id);
  });

  // Group by L2 parent for better organization
  const groupedCategories = (() => {
    const groups: { parent: any; children: any[] }[] = [];
    const l2s = group10Categories.filter((c: any) => {
      const parent = group10Categories.find((p: any) => p.id === c.parent_id);
      return parent && !parent.parent_id || (parent && group10Categories.find((pp: any) => pp.id === parent?.parent_id) && !group10Categories.find((pp: any) => pp.id === parent?.parent_id)?.parent_id);
    });

    // Simpler approach: group leaves by their direct parent
    const parentMap = new Map<string, { parent: any; children: any[] }>();
    leafCategories.forEach((leaf: any) => {
      const parent = group10Categories.find((c: any) => c.id === leaf.parent_id);
      if (parent) {
        if (!parentMap.has(parent.id)) {
          parentMap.set(parent.id, { parent, children: [] });
        }
        parentMap.get(parent.id)!.children.push(leaf);
      } else {
        // Leaf is a direct child of root or standalone
        if (!parentMap.has("root")) {
          parentMap.set("root", { parent: { name: "Geral", code: "10" }, children: [] });
        }
        parentMap.get("root")!.children.push(leaf);
      }
    });

    return Array.from(parentMap.values()).sort((a, b) => a.parent.code.localeCompare(b.parent.code));
  })();

  // Recent financial operations (last 50 transactions in group 10 categories)
  const group10Ids = group10Categories.map((c: any) => c.id);
  const { data: recentOps = [] } = useQuery({
    queryKey: ["fin-ops-recent", group10Ids],
    queryFn: async () => {
      if (group10Ids.length === 0) return [];
      const { data, error } = await supabase
        .from("transactions")
        .select("*, financial_accounts(name), account_categories(name, code), suppliers(name)")
        .in("category_id", group10Ids)
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: group10Ids.length > 0,
  });

  const matchedSuggestion = DESCRIPTION_SUGGESTIONS.find((s) => s.label === form.description);
  const transactionType = matchedSuggestion?.type ?? "expense";

  const activeAccounts = accounts.filter((a: any) => a.is_active);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.account_id || !form.amount || !form.description || !form.date || !form.category_id) {
        throw new Error("Preencha todos os campos obrigatórios");
      }

      const amount = parseFloat(form.amount);
      if (isNaN(amount) || amount <= 0) throw new Error("Valor inválido");

      const dateStr = format(form.date, "yyyy-MM-dd");

      if (form.is_recurring && form.recurring_end) {
        // Create recurring template + generate transactions
        const endDateStr = format(form.recurring_end, "yyyy-MM-dd");
        const day = parseInt(form.recurring_day) || 1;

        const { data: template, error: tplErr } = await supabase
          .from("recurring_transactions")
          .insert({
            description: form.description,
            type: transactionType,
            amount,
            category_id: form.category_id,
            account_id: form.account_id,
            frequency: "monthly",
            day_of_month: day,
            start_date: dateStr,
            end_date: endDateStr,
            iva_rate: 0,
            is_active: true,
            created_by: user?.email ?? "system",
          })
          .select()
          .single();
        if (tplErr) throw tplErr;

        // Generate transactions for the period
        const startDate = new Date(form.date);
        const endDate = new Date(form.recurring_end);
        const transactions: any[] = [];
        let current = new Date(startDate.getFullYear(), startDate.getMonth(), day);
        if (current < startDate) {
          current.setMonth(current.getMonth() + 1);
        }

        let idx = 0;
        while (current <= endDate) {
          const txDate = new Date(current.getFullYear(), current.getMonth(), Math.min(day, new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()));
            transactions.push({
              description: form.description,
              type: transactionType,
              amount,
              category_id: form.category_id,
              account_id: form.account_id,
              date: format(txDate, "yyyy-MM-dd"),
              status: "approved",
              iva_rate: 0,
              paid_amount: 0,
            });
          current.setMonth(current.getMonth() + 1);
          idx++;
          if (idx > 120) break; // safety limit
        }

        if (transactions.length > 0) {
          const { error: txErr } = await supabase.from("transactions").insert(transactions);
          if (txErr) throw txErr;
        }

        return { count: transactions.length, recurring: true };
      } else {
        // Single transaction
        const { error } = await supabase.from("transactions").insert({
          description: form.description,
          type: transactionType,
          amount,
          category_id: form.category_id,
          account_id: form.account_id,
          date: dateStr,
          status: "approved",
          iva_rate: 0,
          paid_amount: 0,
        });
        if (error) throw error;

        return { count: 1, recurring: false };
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["fin-ops-recent"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts-tx-summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });

      if (result.recurring) {
        toast({ title: `${result.count} transações recorrentes criadas!` });
      } else {
        toast({ title: "Operação financeira registada!" });
      }

      setForm(emptyForm);
      setShowForm(false);
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const [showSuggestions, setShowSuggestions] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (descriptionRef.current && !descriptionRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSuggestions = DESCRIPTION_SUGGESTIONS.filter((s) =>
    s.label.toLowerCase().includes(form.description.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Registe taxas bancárias, juros, parcelas de empréstimos e outros custos não operacionais
          </p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova Operação</span>
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Operações (mês)</p>
          <p className="mt-1 text-2xl font-bold">
            {recentOps.filter((o: any) => {
              const d = new Date(o.date);
              const now = new Date();
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }).length}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Custos Não Operacionais (mês)</p>
          <p className="mt-1 text-2xl font-bold text-warning">
            {formatCurrency(
              recentOps
                .filter((o: any) => {
                  const d = new Date(o.date);
                  const now = new Date();
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && o.type === "expense";
                })
                .reduce((s: number, o: any) => s + Number(o.amount), 0)
            )}
          </p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Receitas Não Operacionais (mês)</p>
          <p className="mt-1 text-2xl font-bold text-success">
            {formatCurrency(
              recentOps
                .filter((o: any) => {
                  const d = new Date(o.date);
                  const now = new Date();
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && o.type === "income";
                })
                .reduce((s: number, o: any) => s + Number(o.amount), 0)
            )}
          </p>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowForm(false)}>
          <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Nova Operação Financeira</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}
              className="space-y-4"
            >
              {/* Account - first field */}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Conta *</label>
                <select
                  value={form.account_id}
                  onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Selecionar conta…</option>
                  {activeAccounts.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Description with suggestions */}
              <div ref={descriptionRef} className="relative">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição *</label>
                <input
                  value={form.description}
                  onChange={(e) => { setForm({ ...form, description: e.target.value }); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: Taxa bancária, Juros pagos…"
                  autoComplete="off"
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
                    {filteredSuggestions.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => { setForm({ ...form, description: s.label }); setShowSuggestions(false); }}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                      >
                        <span>{s.label}</span>
                        <Badge variant={s.type === "income" ? "default" : "secondary"} className="text-xs ml-2">
                          {s.type === "income" ? "Receita" : "Despesa"}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
                {matchedSuggestion && (
                  <div className="mt-1">
                    <Badge variant={transactionType === "income" ? "default" : "secondary"} className="text-xs">
                      {transactionType === "income" ? "Receita" : "Despesa"}
                    </Badge>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Categoria (Plano de Contas) *</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Selecionar categoria…</option>
                  {groupedCategories.map((group) => (
                    <optgroup key={group.parent.code} label={`${group.parent.code} — ${group.parent.name}`}>
                      {group.children.map((cat: any) => (
                        <option key={cat.id} value={cat.id}>{cat.code} — {cat.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Recurring toggle */}
              <div className="glass rounded-lg p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                  />
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Lançamento Recorrente (Mensal)</span>
                </label>

                {form.is_recurring && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Dia do Mês</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={form.recurring_day}
                        onChange={(e) => setForm({ ...form, recurring_day: e.target.value })}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Data Fim *</label>
                      <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.recurring_end && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {form.recurring_end ? format(form.recurring_end, "dd/MM/yyyy") : "Selecionar…"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={form.recurring_end}
                            onSelect={(d) => { setForm({ ...form, recurring_end: d }); setEndDateOpen(false); }}
                            locale={pt}
                            initialFocus
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "A guardar…" : form.is_recurring ? "Criar Operação Recorrente" : "Registar Operação"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* Recent operations table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm font-medium">Últimas Operações Financeiras</p>
        </div>
        {recentOps.length === 0 ? (
          <div className="p-8 text-center">
            <Landmark className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhuma operação financeira registada.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOps.map((op: any) => (
                <TableRow key={op.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Date(op.date).toLocaleDateString("pt-PT")}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {op.type === "income" ? (
                        <ArrowUpCircle className="h-4 w-4 text-success flex-shrink-0" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-warning flex-shrink-0" />
                      )}
                      <span className="text-sm">{op.description}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {op.account_categories?.code} — {op.account_categories?.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(op as any).financial_accounts?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={op.status === "paid" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {op.status === "paid" ? "Pago" : op.status === "approved" ? "Aprovado" : op.status === "overdue" ? "Atrasado" : "Aguardando"}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm font-semibold ${op.type === "income" ? "text-success" : "text-warning"}`}>
                    {op.type === "income" ? "+" : "-"}{formatCurrency(Number(op.amount))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
