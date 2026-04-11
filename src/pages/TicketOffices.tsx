import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Phone, Mail, Building2, Pencil, Trash2, Landmark, ToggleLeft, ToggleRight, Upload, ChevronDown, ChevronRight, ArrowRightLeft, Banknote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TicketOfficeFormModal } from "@/components/TicketOfficeFormModal";
import { TicketImportModal } from "@/components/TicketUploadModals";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { TicketOfficeBalancePanel } from "@/components/TicketOfficeBalancePanel";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function TicketOffices() {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin, hasPermission } = useAuth();
  const canManage = isAdmin || hasPermission("manage_accounts");

  // Query financial_accounts with type ticket_office
  const { data: offices = [], isLoading } = useQuery({
    queryKey: ["ticket_offices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_accounts")
        .select("*")
        .eq("type", "ticket_office")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const officeIds = offices.map((o: any) => o.id);

  // Fetch ticket sales per office
  const { data: officeSales = [] } = useQuery({
    queryKey: ["ticket_office_sales_all", officeIds],
    enabled: officeIds.length > 0,
    queryFn: async () => {
      const { data: assignments, error: aErr } = await supabase
        .from("event_ticket_office_assignments")
        .select("financial_account_id, event_id")
        .in("financial_account_id", officeIds);
      if (aErr) throw aErr;
      if (!assignments || assignments.length === 0) return [];

      const eventIds = [...new Set(assignments.map((a: any) => a.event_id))];
      const { data: zones, error: zErr } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id")
        .in("event_id", eventIds);
      if (zErr) throw zErr;
      if (!zones || zones.length === 0) return [];

      const zoneIds = zones.map((z: any) => z.id);
      const { data: sales, error: sErr } = await supabase
        .from("ticket_sales")
        .select("zone_id, quantity, unit_price, financial_account_id")
        .in("zone_id", zoneIds);
      if (sErr) throw sErr;
      return sales || [];
    },
  });

  // Fetch transactions on financial accounts
  const { data: txnSums = [] } = useQuery({
    queryKey: ["ticket_office_balances", officeIds],
    enabled: officeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, amount, paid_amount, status, event_id")
        .in("account_id", officeIds);
      if (error) throw error;
      return data;
    },
  });

  // Fetch assignments
  const { data: allAssignments = [] } = useQuery({
    queryKey: ["ticket_office_assignments_all", officeIds],
    enabled: officeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("financial_account_id, event_id")
        .in("financial_account_id", officeIds);
      if (error) throw error;
      return data;
    },
  });

  const assignmentEventIds = [...new Set(allAssignments.map((a: any) => a.event_id))];
  const { data: allZones = [] } = useQuery({
    queryKey: ["ticket_office_zones_all", assignmentEventIds],
    enabled: assignmentEventIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_zones")
        .select("id, event_id")
        .in("event_id", assignmentEventIds);
      if (error) throw error;
      return data || [];
    },
  });

  const officeBalances = useMemo(() => {
    const map: Record<string, { retained: number; transferred: number; bankBalance: number }> = {};

    const officeEventMap: Record<string, Set<string>> = {};
    allAssignments.forEach((a: any) => {
      if (!officeEventMap[a.financial_account_id]) officeEventMap[a.financial_account_id] = new Set();
      officeEventMap[a.financial_account_id].add(a.event_id);
    });

    const zoneEventMap: Record<string, string> = {};
    allZones.forEach((z: any) => { zoneEventMap[z.id] = z.event_id; });

    const salesByOffice: Record<string, number> = {};
    offices.forEach((o: any) => {
      const assignedEvents = officeEventMap[o.id] || new Set();
      let total = 0;
      officeSales.forEach((s: any) => {
        const saleEventId = zoneEventMap[s.zone_id];
        if (saleEventId && assignedEvents.has(saleEventId)) {
          if (!s.financial_account_id || s.financial_account_id === o.id) {
            total += s.quantity * Number(s.unit_price);
          }
        }
      });
      salesByOffice[o.id] = total;
    });

    const expensesByAccount: Record<string, number> = {};
    const transfersByAccount: Record<string, number> = {};
    txnSums.forEach((t: any) => {
      if (t.type === "expense") {
        const paid = Number(t.paid_amount || 0);
        if (t.event_id) {
          expensesByAccount[t.account_id] = (expensesByAccount[t.account_id] || 0) + paid;
        } else {
          transfersByAccount[t.account_id] = (transfersByAccount[t.account_id] || 0) + paid;
        }
      }
    });

    offices.forEach((o: any) => {
      const sales = salesByOffice[o.id] || 0;
      const expenses = expensesByAccount[o.id] || 0;
      const transfers = transfersByAccount[o.id] || 0;
      map[o.id] = {
        retained: sales - expenses - transfers,
        transferred: transfers,
        bankBalance: Number(o.initial_balance || 0) +
          txnSums.filter((t: any) => t.account_id === o.id)
            .reduce((sum: number, t: any) => {
              const paid = Number(t.paid_amount || 0);
              return t.type === "income" ? sum + paid : sum - paid;
            }, 0),
      };
    });

    return map;
  }, [offices, officeSales, txnSums, allAssignments, allZones]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Check for transactions first
      const { data: txns } = await supabase
        .from("transactions")
        .select("id")
        .eq("account_id", id)
        .limit(1);
      if (txns && txns.length > 0) throw new Error("Não é possível eliminar: existem transações associadas");
      const { error } = await supabase.from("financial_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_offices"] });
      queryClient.invalidateQueries({ queryKey: ["financial_accounts"] });
      setDeletingId(null);
      toast.success("Bilheteira eliminada");
    },
    onError: (err: any) => {
      toast.error("Erro ao eliminar", { description: err.message });
      setDeletingId(null);
    },
  });

  const filtered = useMemo(() => {
    return offices.filter((o: any) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.contact_name && o.contact_name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [offices, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">Bilheteiras <HelpTooltip text={helpTexts.ticketOffices} /></h1>
          <p className="text-sm text-muted-foreground">Gestão de bilheteiras e pontos de venda</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80"
            >
              <Upload className="h-4 w-4" /> Importar Vendas
            </button>
            <button
              onClick={() => { setEditingOffice(null); setIsOpen(true); }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground glow-primary"
            >
              <Plus className="h-4 w-4" /> Nova Bilheteira
            </button>
          </div>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar bilheteiras..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">A carregar…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Nenhuma bilheteira encontrada.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((office: any) => {
            const bal = officeBalances[office.id];
            const retained = bal?.retained ?? 0;
            const transferred = bal?.transferred ?? 0;
            const bankBalance = bal?.bankBalance ?? 0;
            return (
              <div
                key={office.id}
                className="glass rounded-xl p-5 space-y-3 group relative"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{office.name}</h3>
                    {office.contact_name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3" /> {office.contact_name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {office.is_active ? (
                      <ToggleRight className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  {office.email_contact && (
                    <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {office.email_contact}</p>
                  )}
                  {office.phone && (
                    <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {office.phone}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="rounded-lg bg-secondary/40 px-2 py-1.5 text-center">
                      <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-0.5">
                        <Landmark className="h-2.5 w-2.5" /> Retido
                      </p>
                      <p className={`text-xs font-mono font-semibold ${retained >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {formatCurrency(retained)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-2 py-1.5 text-center">
                      <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-0.5">
                        <ArrowRightLeft className="h-2.5 w-2.5" /> Transferido
                      </p>
                      <p className="text-xs font-mono font-semibold text-amber-500">
                        {formatCurrency(transferred)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-2 py-1.5 text-center">
                      <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-0.5">
                        <Banknote className="h-2.5 w-2.5" /> Movimentado
                      </p>
                      <p className={`text-xs font-mono font-semibold ${bankBalance >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {formatCurrency(bankBalance)}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedId(expandedId === office.id ? null : office.id)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-secondary/20 px-3 py-1 hover:bg-secondary/40 transition-colors text-xs text-muted-foreground"
                  >
                    {expandedId === office.id ? "Ocultar detalhe" : "Ver detalhe"}
                    {expandedId === office.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                </div>

                {expandedId === office.id && (
                  <TicketOfficeBalancePanel
                    officeId={office.id}
                    officeName={office.name}
                  />
                )}

                {office.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{office.description}</p>
                )}

                {canManage && (
                  <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditingOffice(office); setIsOpen(true); }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingId(office.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isOpen && (
        <TicketOfficeFormModal
          office={editingOffice}
          onClose={() => { setIsOpen(false); setEditingOffice(null); }}
        />
      )}

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar bilheteira?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível e só é possível se não existirem transações associadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TicketImportModal open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
