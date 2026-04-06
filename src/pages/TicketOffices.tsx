import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Phone, Mail, Building2, Pencil, Trash2, Landmark, ToggleLeft, ToggleRight, Upload, ChevronDown, ChevronRight, ArrowRightLeft, Banknote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TicketOfficeFormModal } from "@/components/TicketOfficeFormModal";
import { TicketOfficeSalesImport } from "@/components/TicketOfficeSalesImport";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { TicketOfficeBalancePanel } from "@/components/TicketOfficeBalancePanel";
import {
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
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

  const { data: offices = [], isLoading } = useQuery({
    queryKey: ["ticket_offices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_offices")
        .select("*, financial_accounts(id, name, initial_balance)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch ticket sales per office to calculate real revenue
  const officeIds = offices.map((o: any) => o.id);
  const { data: officeSales = [] } = useQuery({
    queryKey: ["ticket_office_sales_all", officeIds],
    enabled: officeIds.length > 0,
    queryFn: async () => {
      // Get all assignments for these offices
      const { data: assignments, error: aErr } = await supabase
        .from("event_ticket_office_assignments")
        .select("ticket_office_id, event_id")
        .in("ticket_office_id", officeIds);
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
        .select("zone_id, quantity, unit_price, ticket_office_id")
        .in("zone_id", zoneIds);
      if (sErr) throw sErr;
      return sales || [];
    },
  });

  // Fetch transactions on financial accounts (expenses + transfers out)
  const accountIds = offices.map((o: any) => o.financial_account_id).filter(Boolean);
  const { data: txnSums = [] } = useQuery({
    queryKey: ["ticket_office_balances", accountIds],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, amount, paid_amount, status, event_id")
        .in("account_id", accountIds);
      if (error) throw error;
      return data;
    },
  });

  // Fetch assignments separately for proper mapping
  const { data: allAssignments = [] } = useQuery({
    queryKey: ["ticket_office_assignments_all", officeIds],
    enabled: officeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_ticket_office_assignments")
        .select("ticket_office_id, event_id")
        .in("ticket_office_id", officeIds);
      if (error) throw error;
      return data;
    },
  });

  // Build zone -> event_id map for sales attribution
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

    // Build office -> event_ids mapping from assignments
    const officeEventMap: Record<string, Set<string>> = {};
    allAssignments.forEach((a: any) => {
      if (!officeEventMap[a.ticket_office_id]) officeEventMap[a.ticket_office_id] = new Set();
      officeEventMap[a.ticket_office_id].add(a.event_id);
    });

    // Build zone -> event_id mapping
    const zoneEventMap: Record<string, string> = {};
    allZones.forEach((z: any) => { zoneEventMap[z.id] = z.event_id; });

    // Sum ticket sales per office using the same logic as TicketOfficeBalancePanel:
    // Sales belong to an office if: the sale's zone belongs to an event assigned to the office
    // AND (ticket_office_id is null OR matches the office)
    const salesByOffice: Record<string, number> = {};
    offices.forEach((o: any) => {
      const assignedEvents = officeEventMap[o.id] || new Set();
      let total = 0;
      officeSales.forEach((s: any) => {
        const saleEventId = zoneEventMap[s.zone_id];
        if (saleEventId && assignedEvents.has(saleEventId)) {
          if (!s.ticket_office_id || s.ticket_office_id === o.id) {
            total += s.quantity * Number(s.unit_price);
          }
        }
      });
      salesByOffice[o.id] = total;
    });

    // Sum expenses (with event_id) and transfers (without event_id) per account
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
      if (o.financial_account_id) {
        const sales = salesByOffice[o.id] || 0;
        const expenses = expensesByAccount[o.financial_account_id] || 0;
        const transfers = transfersByAccount[o.financial_account_id] || 0;
        map[o.financial_account_id] = {
          retained: sales - expenses - transfers,
          transferred: transfers,
          bankBalance: Number(o.financial_accounts?.initial_balance || 0) +
            txnSums.filter((t: any) => t.account_id === o.financial_account_id)
              .reduce((sum: number, t: any) => {
                const paid = Number(t.paid_amount || 0);
                return t.type === "income" ? sum + paid : sum - paid;
              }, 0),
        };
      }
    });

    return map;
  }, [offices, officeSales, txnSums, allAssignments, allZones]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ticket_offices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_offices"] });
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
            const bal = office.financial_account_id ? officeBalances[office.financial_account_id] : null;
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
                  {office.email && (
                    <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {office.email}</p>
                  )}
                  {office.phone && (
                    <p className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {office.phone}</p>
                  )}
                </div>

                {office.financial_account_id && (
                  <div className="space-y-1.5">
                    {/* Three balance indicators */}
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

                    {/* Expand button */}
                    <button
                      onClick={() => setExpandedId(expandedId === office.id ? null : office.id)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-secondary/20 px-3 py-1 hover:bg-secondary/40 transition-colors text-xs text-muted-foreground"
                    >
                      {expandedId === office.id ? "Ocultar detalhe" : "Ver detalhe"}
                      {expandedId === office.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                  </div>
                )}

                {expandedId === office.id && office.financial_account_id && (
                  <TicketOfficeBalancePanel
                    officeId={office.id}
                    officeName={office.name}
                    financialAccountId={office.financial_account_id}
                  />
                )}

                {office.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{office.notes}</p>
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
              Esta ação é irreversível. A conta financeira associada não será eliminada.
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

      <TicketOfficeSalesImport open={showImport} onClose={() => setShowImport(false)} />
    </div>
  );
}
