import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Phone, Mail, Building2, Pencil, Trash2, Landmark, ToggleLeft, ToggleRight, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { TicketOfficeFormModal } from "@/components/TicketOfficeFormModal";
import { TicketOfficeSalesImport } from "@/components/TicketOfficeSalesImport";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/mock-data";
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

  // Fetch balances: for each office's financial_account, sum transactions
  const accountIds = offices.map((o: any) => o.financial_account_id).filter(Boolean);
  const { data: txnSums = [] } = useQuery({
    queryKey: ["ticket_office_balances", accountIds],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("account_id, type, amount, status")
        .in("account_id", accountIds);
      if (error) throw error;
      return data;
    },
  });

  const balanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    // Start with initial balances
    offices.forEach((o: any) => {
      if (o.financial_account_id && o.financial_accounts) {
        map[o.financial_account_id] = Number(o.financial_accounts.initial_balance || 0);
      }
    });
    // Add transaction effects
    txnSums.forEach((t: any) => {
      if (!map[t.account_id]) map[t.account_id] = 0;
      if (t.type === "income") map[t.account_id] += Number(t.amount);
      else map[t.account_id] -= Number(t.amount);
    });
    return map;
  }, [offices, txnSums]);

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
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Bilheteiras</h1>
          <p className="text-sm text-muted-foreground">Gestão de bilheteiras e pontos de venda</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setEditingOffice(null); setIsOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground glow-primary"
          >
            <Plus className="h-4 w-4" /> Nova Bilheteira
          </button>
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
            const balance = office.financial_account_id ? (balanceMap[office.financial_account_id] ?? 0) : 0;
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
                  <div className="flex items-center justify-between rounded-lg bg-secondary/40 px-3 py-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Landmark className="h-3 w-3" /> Saldo
                    </span>
                    <span className={`text-sm font-mono font-semibold ${balance >= 0 ? "text-emerald-500" : "text-red-400"}`}>
                      {formatCurrency(balance)}
                    </span>
                  </div>
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
    </div>
  );
}
