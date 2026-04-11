import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Phone, Mail, Building2, Pencil, Trash2, Landmark, ToggleLeft, ToggleRight, Upload, ArrowRightLeft, Banknote, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TicketOfficeFormModal } from "@/components/TicketOfficeFormModal";
import { TicketImportModal } from "@/components/TicketUploadModals";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
import { TicketOfficeBalancePanel } from "@/components/TicketOfficeBalancePanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TicketOfficeTicketingTab } from "@/components/TicketOfficeTicketingTab";
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
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { isAdmin, hasPermission } = useAuth();
  const canManage = isAdmin || hasPermission("manage_accounts");

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

  const selectedOffice = offices.find((o: any) => o.id === selectedOfficeId);

  // Detail view for a selected office
  if (selectedOffice) {
    const bal = officeBalances[selectedOffice.id];
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedOfficeId(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight truncate">{selectedOffice.name}</h1>
            <p className="text-sm text-muted-foreground">Gestão completa da bilheteira</p>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditingOffice(selectedOffice); setIsOpen(true); }}
                className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/80"
              >
                <Pencil className="h-4 w-4" /> Editar
              </button>
            </div>
          )}
        </div>

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="liquidez">Liquidez</TabsTrigger>
            <TabsTrigger value="vendas">Vendas / Bilhetes</TabsTrigger>
          </TabsList>

          <TabsContent value="dados">
            <div className="glass rounded-xl p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Informações</h3>
                  {selectedOffice.contact_name && (
                    <p className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /> {selectedOffice.contact_name}</p>
                  )}
                  {selectedOffice.email_contact && (
                    <p className="text-sm flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {selectedOffice.email_contact}</p>
                  )}
                  {selectedOffice.phone && (
                    <p className="text-sm flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {selectedOffice.phone}</p>
                  )}
                  <p className="text-sm flex items-center gap-2">
                    {selectedOffice.is_active ? (
                      <><ToggleRight className="h-4 w-4 text-emerald-500" /> Ativa</>
                    ) : (
                      <><ToggleLeft className="h-4 w-4 text-muted-foreground" /> Inativa</>
                    )}
                  </p>
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Resumo Financeiro</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-secondary/40 px-3 py-2 text-center">
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Landmark className="h-3 w-3" /> Retido</p>
                      <p className={`text-sm font-mono font-semibold ${(bal?.retained ?? 0) >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {formatCurrency(bal?.retained ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-3 py-2 text-center">
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><ArrowRightLeft className="h-3 w-3" /> Transferido</p>
                      <p className="text-sm font-mono font-semibold text-amber-500">{formatCurrency(bal?.transferred ?? 0)}</p>
                    </div>
                    <div className="rounded-lg bg-secondary/40 px-3 py-2 text-center">
                      <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-0.5"><Banknote className="h-3 w-3" /> Movimentado</p>
                      <p className={`text-sm font-mono font-semibold ${(bal?.bankBalance ?? 0) >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                        {formatCurrency(bal?.bankBalance ?? 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {selectedOffice.description && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notas</h3>
                  <p className="text-sm text-muted-foreground">{selectedOffice.description}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="liquidez">
            <TicketOfficeBalancePanel officeId={selectedOffice.id} officeName={selectedOffice.name} />
          </TabsContent>

          <TabsContent value="vendas">
            <TicketOfficeTicketingTab officeId={selectedOffice.id} officeName={selectedOffice.name} />
          </TabsContent>
        </Tabs>

        {isOpen && (
          <TicketOfficeFormModal
            office={editingOffice}
            onClose={() => { setIsOpen(false); setEditingOffice(null); }}
          />
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">Bilheteiras <HelpTooltip text={helpTexts.ticketOffices} /></h1>
          <p className="text-sm text-muted-foreground">Gestão de bilheteiras, liquidez e vendas</p>
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
        <Input placeholder="Pesquisar bilheteiras..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
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
                onClick={() => setSelectedOfficeId(office.id)}
                className="glass rounded-xl p-5 space-y-3 group relative cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
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

                {canManage && (
                  <div className="flex items-center gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingOffice(office); setIsOpen(true); }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingId(office.id); }}
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
