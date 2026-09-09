import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { toast } from "@/hooks/use-toast";
import { invalidateCardSessionQueries } from "@/lib/card-session-helpers";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, X, Landmark, CreditCard, Wallet, Banknote, Eye, EyeOff, Save, FileText, Ticket, Users, Trash2, Flag } from "lucide-react";
import AccountAccessModal from "@/components/AccountAccessModal";
import AccountBalanceImplantModal from "@/components/AccountBalanceImplantModal";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FinancialOperationsTab from "@/components/FinancialOperationsTab";
import { SupplierCreditsSummaryCard } from "@/components/supplier-credits/SupplierCreditsSummaryCard";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { fetchAccountCashAdjustments, computeAccountBalance, buildAccountCutoffs } from "@/lib/account-balance";
import { computeTicketOfficeBalance } from "@/lib/ticket-office-balance";
import { formatDatePT } from "@/lib/utils";

const ACCOUNT_TYPES = [
  { value: "bank", label: "Conta Bancária", icon: Landmark },
  { value: "ticket_office", label: "Bilheteira", icon: Ticket },
  { value: "credit_card", label: "Cartão de Crédito", icon: CreditCard },
  { value: "debit_card", label: "Cartão de Débito", icon: CreditCard },
  { value: "prepaid_card", label: "Cartão Pré-Pago", icon: CreditCard },
  { value: "cash", label: "Caixa", icon: Banknote },
  { value: "other", label: "Outra", icon: Wallet },
];

function getTypeInfo(type: string) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[4];
}

interface AccountForm {
  name: string;
  type: string;
  description: string;
  initial_balance: string;
  balance_visible_to_all: boolean;
  is_active: boolean;
  iban: string;
  card_number: string;
  skip_balance_check: boolean;
  withholds_revenue: boolean;
  is_hidden: boolean;
  is_accounting: boolean;
}

const emptyForm: AccountForm = {
  name: "",
  type: "bank",
  description: "",
  initial_balance: "0",
  balance_visible_to_all: false,
  is_active: true,
  iban: "",
  card_number: "",
  skip_balance_check: false,
  withholds_revenue: false,
  is_hidden: false,
  is_accounting: true,
};

export default function FinancialAccounts() {
  const { isAdmin, isManager } = useAuth();
  // Admin + Manager podem criar/editar contas (incl. Saldo Inicial). Visibilidade de saldos permanece só admin.
  const canManageAccounts = isAdmin || isManager;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [accessModalAccount, setAccessModalAccount] = useState<{ id: string; name: string } | null>(null);
  const [implantAccount, setImplantAccount] = useState<any | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<{ id: string; name: string } | null>(null);

  // Check if account has transactions
  function accountHasTransactions(accountId: string) {
    return txSummary.some((t: any) => t.account_id === accountId);
  }

  const deleteMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.from("financial_accounts").delete().eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
      toast({ title: "Conta eliminada com sucesso!" });
      setDeletingAccount(null);
    },
    onError: (err: any) => {
      toast({ title: "Erro ao eliminar", description: err.message, variant: "destructive" });
    },
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["financial-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("*")
        .order("type")
        .order("name");
      if (error) throw error;
      // Sort by ACCOUNT_TYPES order, then by name
      const typeOrder = ACCOUNT_TYPES.map(t => t.value);
      return (data || []).sort((a, b) => {
        const ai = typeOrder.indexOf(a.type); 
        const bi = typeOrder.indexOf(b.type);
        const ta = ai >= 0 ? ai : typeOrder.length;
        const tb = bi >= 0 ? bi : typeOrder.length;
        if (ta !== tb) return ta - tb;
        return a.name.localeCompare(b.name);
      });
    },
  });

  // Fetch transactions grouped by account for balance calculation
  const { data: txSummary = [] } = useQuery({
    queryKey: ["financial-accounts-tx-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, amount, paid_amount, status, date, payment_date")
        .not("account_id", "is", null);
      if (error) throw error;
      return data;
    },
  });

  // Data de corte do saldo inicial, por conta.
  const cutoffs = buildAccountCutoffs(accounts as any);

  // Adjustments for IRS withholding and supplier credits (non-cash deductions
  // already embedded in transactions.paid_amount). Added back to the gross
  // balance so the displayed value reflects the real cash position.
  const { data: cashAdjustments } = useQuery({
    queryKey: ["financial-accounts-cash-adjustments", (accounts as any[]).map((a) => `${a.id}:${a.initial_balance_date ?? ""}`).join(",")],
    queryFn: () => fetchAccountCashAdjustments(undefined, cutoffs),
  });

  // ---- Bilheteiras: fonte própria (D-ERP15) ----------------------------------
  // A receita de bilhetes vive em `ticket_sales`, não em `transactions`; com a
  // fórmula bancária a conta só vê as saídas. O saldo retido calcula-se com
  // computeTicketOfficeBalance, exactamente como no ecrã de Bilheteiras.
  const officeIds = useMemo(
    () => (accounts as any[]).filter((a) => a.type === "ticket_office").map((a) => a.id),
    [accounts]
  );

  const { data: officeAssignments = [] } = useQuery({
    queryKey: ["fa-office-assignments", officeIds],
    enabled: officeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("financial_account_id, event_id")
        .in("financial_account_id", officeIds);
      if (error) throw error;
      return data || [];
    },
  });

  const officeEventIds = useMemo(
    () => [...new Set((officeAssignments as any[]).map((a) => a.event_id))],
    [officeAssignments]
  );

  const { data: officeZones = [] } = useQuery({
    queryKey: ["fa-office-zones", officeEventIds],
    enabled: officeEventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id")
        .in("event_id", officeEventIds);
      if (error) throw error;
      return data || [];
    },
  });

  const officeZoneIds = useMemo(() => (officeZones as any[]).map((z) => z.id), [officeZones]);

  const { data: officeSales = [] } = useQuery({
    queryKey: ["fa-office-sales", officeZoneIds],
    enabled: officeZoneIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_sales")
        .select("zone_id, quantity, unit_price, total_value, financial_account_id")
        .in("zone_id", officeZoneIds);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: officeTxns = [] } = useQuery({
    queryKey: ["fa-office-txns", officeIds],
    enabled: officeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, paid_amount, status, event_id, reversed_at, is_hidden")
        .in("account_id", officeIds);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: officeAdvances = [] } = useQuery({
    queryKey: ["fa-office-advances", officeIds],
    enabled: officeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("event_ticket_office_advances")
        .select("financial_account_id, event_id, amount, transaction_id, settlement_id")
        .in("financial_account_id", officeIds);
      if (error) throw error;
      return data || [];
    },
  });

  const ticketOfficeBalances = useMemo(() => {
    const map: Record<string, number> = {};
    if (officeIds.length === 0) return map;
    const officeEventMap: Record<string, string[]> = {};
    (officeAssignments as any[]).forEach((a) => {
      if (!officeEventMap[a.financial_account_id]) officeEventMap[a.financial_account_id] = [];
      officeEventMap[a.financial_account_id].push(a.event_id);
    });
    const zoneEventMap: Record<string, string> = {};
    (officeZones as any[]).forEach((z) => { zoneEventMap[z.id] = z.event_id; });
    const salesWithEvent = (officeSales as any[]).map((s) => ({ ...s, event_id: zoneEventMap[s.zone_id] }));

    officeIds.forEach((id: string) => {
      const { total } = computeTicketOfficeBalance({
        officeId: id,
        assignedEventIds: officeEventMap[id] || [],
        sales: salesWithEvent,
        transactions: officeTxns as any[],
        advances: (officeAdvances as any[]).filter((a) => a.financial_account_id === id),
      });
      map[id] = total;
    });
    return map;
  }, [officeIds, officeAssignments, officeZones, officeSales, officeTxns, officeAdvances]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name,
        type: form.type,
        description: form.description || null,
        initial_balance: parseFloat(form.initial_balance) || 0,
        balance_visible_to_all: form.balance_visible_to_all,
        is_active: form.is_active,
        iban: (form.type === "bank" || form.type === "prepaid_card") ? (form.iban.trim() || null) : null,
        card_number: form.type === "prepaid_card" ? (form.card_number.trim() || null) : null,
        skip_balance_check: form.skip_balance_check,
        withholds_revenue: form.withholds_revenue,
        is_hidden: form.is_hidden,
        is_accounting: form.is_accounting,
      };

      if (editingId) {
        const { error } = await supabase
          .from("financial_accounts")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("financial_accounts")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts-tx-summary"] });
      queryClient.invalidateQueries({ queryKey: ["financial-accounts-cash-adjustments"] });
      // Contas de cartão alimentam o módulo Cartões (saldo disponível na sessão)
      invalidateCardSessionQueries(queryClient);
      toast({ title: editingId ? "Conta atualizada!" : "Conta criada com sucesso!" });
      resetForm();
    },

    onError: (err: any) => {
      toast({ title: "Erro ao guardar", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(account: any) {
    setForm({
      name: account.name,
      type: account.type,
      description: account.description ?? "",
      initial_balance: String(account.initial_balance),
      balance_visible_to_all: account.balance_visible_to_all,
      is_active: account.is_active,
      iban: account.iban ?? "",
      card_number: account.card_number ?? "",
      skip_balance_check: account.skip_balance_check ?? false,
      withholds_revenue: account.withholds_revenue ?? false,
      is_hidden: account.is_hidden ?? false,
      is_accounting: account.is_accounting ?? true,
    });
    setEditingId(account.id);
    setShowForm(true);
  }

  function computeBalance(account: any): number | null {
    // Bilheteira: fonte própria (D-ERP15) — a fórmula bancária ignoraria a
    // receita de bilhetes, que vive em ticket_sales.
    if (account.type === "ticket_office") {
      if (account.skip_balance_check) return null;
      return ticketOfficeBalances[account.id] ?? 0;
    }
    return computeAccountBalance(account, txSummary as any, cashAdjustments);
  }

  function canSeeBalance(account: any) {
    return isAdmin || account.balance_visible_to_all;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  const activeAccounts = accounts.filter((a: any) => a.is_active);
  const inactiveAccounts = accounts.filter((a: any) => !a.is_active);

  // SALDO TOTAL é caixa, e só caixa: banco, caixa e cartão pré-pago, apenas com
  // controlo de saldo. Bilheteiras (dinheiro retido por terceiros) e contas de
  // acerto (valores a receber/pagar) têm cartões próprios e nunca somam ao caixa.
  const CASH_TYPES = ["bank", "cash", "prepaid_card"];
  const totalBalance = activeAccounts.reduce((sum: number, acc: any) => {
    if (!CASH_TYPES.includes(acc.type)) return sum;
    if (!canSeeBalance(acc) || acc.skip_balance_check) return sum;
    return sum + (computeBalance(acc) ?? 0);
  }, 0);

  const uncontrolledCashNames = activeAccounts
    .filter((a: any) => CASH_TYPES.includes(a.type) && a.skip_balance_check)
    .map((a: any) => a.name);

  const ticketOfficeRetained = activeAccounts.reduce((sum: number, acc: any) => {
    if (acc.type !== "ticket_office" || acc.skip_balance_check) return sum;
    return sum + (ticketOfficeBalances[acc.id] ?? 0);
  }, 0);

  const settlementAccounts = activeAccounts.filter((a: any) => a.type === "other");
  const settlementTotal = settlementAccounts.reduce(
    (sum: number, acc: any) => sum + (acc.skip_balance_check ? 0 : computeBalance(acc) ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">Contas de Movimentação <HelpTooltip text={helpTexts.financialAccounts} /></h1>
        <p className="text-sm text-muted-foreground">Gerencie contas bancárias, cartões e operações financeiras</p>
      </div>

      <Tabs defaultValue="accounts" className="space-y-6">
        <TabsList>
          <TabsTrigger value="accounts">Contas</TabsTrigger>
          <TabsTrigger value="operations">Operações Financeiras</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-6">
      <div className="flex items-center justify-end">
        {canManageAccounts && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Conta</span>
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Contas Ativas</p>
          <p className="mt-1 text-2xl font-bold">{activeAccounts.length}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Saldo Total</p>
          <p className={`mt-1 text-2xl font-bold ${totalBalance >= 0 ? "text-success" : "text-destructive"}`}>
            {isAdmin ? formatCurrency(totalBalance) : "—"}
          </p>
          {!isAdmin && <p className="text-xs text-muted-foreground">Visível apenas para contas autorizadas</p>}
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipos</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {ACCOUNT_TYPES.filter((t) => activeAccounts.some((a: any) => a.type === t.value)).map((t) => (
              <Badge key={t.value} variant="secondary" className="text-xs">{t.label}</Badge>
            ))}
          </div>
        </div>
        <SupplierCreditsSummaryCard />
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => resetForm()}>
          <div className="glass w-full max-w-lg rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingId ? "Editar Conta" : "Nova Conta"}</h2>
              <button onClick={resetForm} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: Conta BPI Principal"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {(form.type === "bank" || form.type === "prepaid_card") && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">IBAN</label>
                  <input
                    value={form.iban}
                    onChange={(e) => setForm({ ...form, iban: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Ex: PT50 0000 0000 0000 0000 0000 0"
                  />
                </div>
              )}

              {form.type === "prepaid_card" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Número do Cartão</label>
                  <input
                    value={form.card_number}
                    onChange={(e) => setForm({ ...form, card_number: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Ex: 1234 5678 9012 3456"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ex: Conta corrente para operações"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Saldo Inicial (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.initial_balance}
                  onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
                  disabled={!isAdmin}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
                  placeholder="0.00"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {isAdmin
                    ? "Para definir o saldo a uma data (data de corte), use o botão de implantar saldo na lista."
                    : "Só um administrador pode alterar o saldo inicial."}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm font-medium">Saldo visível para todos</Label>
                  <p className="text-xs text-muted-foreground">Se desligado, só admins veem o saldo</p>
                </div>
                <Switch
                  checked={form.balance_visible_to_all}
                  onCheckedChange={(v) => setForm({ ...form, balance_visible_to_all: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm font-medium">Conta ativa</Label>
                  <p className="text-xs text-muted-foreground">Contas inativas não aparecem nas transações</p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 p-3">
                <div>
                  <Label className="text-sm font-medium">Ignorar controlo de saldo</Label>
                  <p className="text-xs text-muted-foreground">Permite pagamentos mesmo com saldo insuficiente</p>
                </div>
                <Switch
                  checked={form.skip_balance_check}
                  onCheckedChange={(v) => setForm({ ...form, skip_balance_check: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm font-medium">Retém receita de bilheteira</Label>
                  <p className="text-xs text-muted-foreground">
                    Para salas/recintos que retêm a receita das bilheteiras e fazem o acerto final.
                    Nos fechos, em vez de criar uma transferência, gera um valor a receber.
                  </p>
                </div>
                <Switch
                  checked={form.withholds_revenue}
                  onCheckedChange={(v) => setForm({ ...form, withholds_revenue: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm font-medium">Ocultar de seletores</Label>
                  <p className="text-xs text-muted-foreground">
                    A conta deixa de aparecer ao criar transações, movimentos de camarim, reembolsos
                    ou adiantamentos. Continua disponível em relatórios e fluxos administrativos.
                    Útil para contas de uso restrito (ex.: "Eventos Históricos").
                  </p>
                </div>
                <Switch
                  checked={form.is_hidden}
                  onCheckedChange={(v) => setForm({ ...form, is_hidden: v })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm font-medium">Conta contábil</Label>
                  <p className="text-xs text-muted-foreground">
                    Desligue para contas puramente gerenciais (ex.: pagamentos feitos fora de
                    Portugal por um sócio). Os movimentos e documentos dessa conta deixam de entrar
                    nas exportações para a contabilidade. Saldos e extratos não são afetados.
                  </p>
                </div>
                <Switch
                  checked={form.is_accounting}
                  onCheckedChange={(v) => setForm({ ...form, is_accounting: v })}
                />
              </div>

              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {saveMutation.isPending ? "A guardar…" : editingId ? "Guardar Alterações" : "Criar Conta"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Accounts table */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">A carregar…</p>
      ) : activeAccounts.length === 0 && inactiveAccounts.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <Landmark className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nenhuma conta cadastrada.</p>
          {canManageAccounts && <p className="text-xs text-muted-foreground mt-1">Clique em "Nova Conta" para começar.</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {activeAccounts.length > 0 && (
            <div className="glass rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conta</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Saldo Inicial</TableHead>
                    <TableHead className="text-right">Saldo Atual</TableHead>
                    <TableHead className="text-center">Visibilidade</TableHead>
                    {canManageAccounts && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeAccounts.map((acc: any) => {
                    const typeInfo = getTypeInfo(acc.type);
                    const Icon = typeInfo.icon;
                    const balance = computeBalance(acc);
                    const showBalance = canSeeBalance(acc);

                    return (
                      <TableRow key={acc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-primary" />
                            <div>
                              <p className="font-medium text-sm flex items-center gap-1.5">
                                {acc.name}
                                {acc.is_accounting === false && (
                                  <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                    Não contábil
                                  </Badge>
                                )}
                              </p>
                              {acc.description && <p className="text-xs text-muted-foreground">{acc.description}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{typeInfo.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {acc.skip_balance_check ? (
                            <span className="text-xs text-muted-foreground italic">Sem controlo de saldo</span>
                          ) : showBalance ? (
                            <>
                              {formatCurrency(Number(acc.initial_balance))}
                              {acc.initial_balance_date && (
                                <p className="text-[10px] text-muted-foreground">a {formatDatePT(acc.initial_balance_date)}</p>
                              )}
                            </>
                          ) : "••••••"}
                        </TableCell>
                        <TableCell className="text-right">
                          {balance === null ? (
                            <span className="text-xs text-muted-foreground italic">Sem controlo de saldo</span>
                          ) : showBalance ? (
                            <span className={`font-mono text-sm font-semibold ${balance >= 0 ? "text-success" : "text-destructive"}`}>
                              {formatCurrency(balance)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">••••••</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {acc.balance_visible_to_all ? (
                            <Eye className="h-4 w-4 text-success mx-auto" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-muted-foreground mx-auto" />
                          )}
                        </TableCell>
                        {canManageAccounts && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => navigate(`/relatorios/extrato?conta=${acc.id}`)}
                                className="rounded-lg p-1.5 hover:bg-secondary transition-colors"
                                title="Ver extrato"
                              >
                                <FileText className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setAccessModalAccount({ id: acc.id, name: acc.name })}
                                className="rounded-lg p-1.5 hover:bg-secondary transition-colors"
                                title="Gerir acessos"
                              >
                                <Users className="h-4 w-4" />
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => setImplantAccount(acc)}
                                  className="rounded-lg p-1.5 hover:bg-secondary transition-colors"
                                  title="Implantar saldo (data de corte)"
                                >
                                  <Flag className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={() => startEdit(acc)}
                                className="rounded-lg p-1.5 hover:bg-secondary transition-colors"
                                title="Editar"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {!accountHasTransactions(acc.id) && (
                                <button
                                  onClick={() => setDeletingAccount({ id: acc.id, name: acc.name })}
                                  className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors text-destructive"
                                  title="Eliminar conta"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {inactiveAccounts.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Contas Inativas</p>
              <div className="glass rounded-xl overflow-hidden opacity-60">
                <Table>
                  <TableBody>
                    {inactiveAccounts.map((acc: any) => {
                      const typeInfo = getTypeInfo(acc.type);
                      const Icon = typeInfo.icon;
                      return (
                        <TableRow key={acc.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{acc.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{typeInfo.label}</Badge>
                          </TableCell>
                          {canManageAccounts && (
                            <TableCell className="text-right">
                              <button onClick={() => startEdit(acc)} className="rounded-lg p-1.5 hover:bg-secondary transition-colors">
                                <Pencil className="h-4 w-4" />
                              </button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
        </TabsContent>

        <TabsContent value="operations">
          <FinancialOperationsTab accounts={accounts} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>

      {accessModalAccount && (
        <AccountAccessModal
          accountId={accessModalAccount.id}
          accountName={accessModalAccount.name}
          onClose={() => setAccessModalAccount(null)}
        />
      )}

      {implantAccount && isAdmin && (
        <AccountBalanceImplantModal
          account={implantAccount}
          onClose={() => setImplantAccount(null)}
        />
      )}



      {deletingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeletingAccount(null)}>
          <div className="glass w-full max-w-sm rounded-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Eliminar Conta</h2>
            <p className="text-sm text-muted-foreground">
              Tem a certeza que deseja eliminar a conta <strong>{deletingAccount.name}</strong>? Esta ação é irreversível.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingAccount(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deletingAccount.id)}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "A eliminar…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
