import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { X, UserPlus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  accountId: string;
  accountName: string;
  onClose: () => void;
}

export default function AccountAccessModal({ accountId, accountName, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");

  // Fetch all profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch roles for display
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user-roles-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch current access for this account
  const { data: accessList = [] } = useQuery({
    queryKey: ["financial-account-access", accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_account_access")
        .select("id, user_id")
        .eq("account_id", accountId);
      if (error) throw error;
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("financial_account_access")
        .insert({ user_id: userId, account_id: accountId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-account-access", accountId] });
      toast({ title: "Acesso adicionado!" });
      setSelectedUserId("");
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (accessId: string) => {
      const { error } = await supabase
        .from("financial_account_access")
        .delete()
        .eq("id", accessId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial-account-access", accountId] });
      toast({ title: "Acesso removido!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const accessUserIds = new Set(accessList.map((a) => a.user_id));

  // Filter: only non-admin/non-manager users that don't have access yet
  const availableUsers = profiles.filter((p) => {
    if (accessUserIds.has(p.id)) return false;
    const role = userRoles.find((r) => r.user_id === p.id);
    // Admin and manager already see all accounts via RLS
    if (role?.role === "admin" || role?.role === "manager") return false;
    return true;
  });

  function getUserInfo(userId: string) {
    const profile = profiles.find((p) => p.id === userId);
    const role = userRoles.find((r) => r.user_id === userId);
    return { name: profile?.full_name || "—", email: profile?.email || "", role: role?.role || "user" };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass w-full max-w-md rounded-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Acessos à Conta</h2>
            <p className="text-sm text-muted-foreground">{accountName}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <p className="text-xs text-muted-foreground">Admins e Gerentes veem todas as contas automaticamente. Aqui configuras o acesso para outros utilizadores.</p>

        {/* Add user */}
        <div className="flex gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Selecionar utilizador…</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
            ))}
          </select>
          <button
            onClick={() => selectedUserId && addMutation.mutate(selectedUserId)}
            disabled={!selectedUserId || addMutation.isPending}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        </div>

        {/* Current access list */}
        <div className="space-y-2">
          {accessList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum acesso configurado. Apenas Admins e Gerentes veem esta conta.</p>
          ) : (
            accessList.map((access) => {
              const info = getUserInfo(access.user_id);
              return (
                <div key={access.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{info.name}</p>
                    <p className="text-xs text-muted-foreground">{info.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs capitalize">{info.role}</Badge>
                    <button
                      onClick={() => removeMutation.mutate(access.id)}
                      disabled={removeMutation.isPending}
                      className="rounded-lg p-1.5 hover:bg-destructive/10 text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
