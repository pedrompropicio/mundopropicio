import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, User, UserPlus, Loader2, Trash2, MailCheck } from "lucide-react";

export default function UserManagement() {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-with-roles"],
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, created_at")
        .order("created_at", { ascending: true });
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      return (profiles ?? []).map((p) => ({
        ...p,
        role: roles?.find((r) => r.user_id === p.id)?.role ?? "user",
      }));
    },
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ userId, currentRole }: { userId: string; currentRole: string }) => {
      const newRole = currentRole === "admin" ? "user" : "admin";
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast({ title: "Permissão atualizada!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao alterar permissão", description: err.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email: newEmail, full_name: newName, role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast({ title: "Utilizador criado!", description: data.message });
      setShowForm(false);
      setNewEmail("");
      setNewName("");
      setNewRole("user");
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar utilizador", description: err.message, variant: "destructive" });
    },
  });

  const resendResetMutation = useMutation({
    mutationFn: async ({ email, name }: { email: string; name: string }) => {
      const { data, error } = await supabase.functions.invoke("resend-reset-email", {
        body: { email },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Email reenviado!", description: "O utilizador receberá um novo email para definir a senha." });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao reenviar email", description: err.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast({ title: "Utilizador eliminado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao eliminar utilizador", description: err.message, variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Gestão de Utilizadores</h1>
          <p className="text-sm text-muted-foreground">Gerir acessos e permissões</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
        >
          <UserPlus className="h-4 w-4" />
          Novo Utilizador
        </button>
      </div>

      {showForm && (
        <div className="glass rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">Criar Novo Utilizador</h2>
          <p className="text-xs text-muted-foreground">
            O utilizador receberá um email para definir a sua senha.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createUserMutation.mutate();
            }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome completo</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="João Silva"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="email@exemplo.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nível de acesso</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="user">Utilizador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={createUserMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {createUserMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="glass rounded-xl p-5">
        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">A carregar…</p>
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">Sem utilizadores registados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Nome</th>
                  <th className="pb-3 text-left font-medium">Email</th>
                  <th className="pb-3 text-center font-medium">Nível</th>
                  <th className="pb-3 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-3 pr-4 font-medium">{u.full_name || "—"}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{u.email}</td>
                    <td className="py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        u.role === "admin"
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary text-secondary-foreground"
                      }`}>
                        {u.role === "admin" ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        {u.role === "admin" ? "Admin" : "Utilizador"}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      {u.id !== user?.id && (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => toggleRoleMutation.mutate({ userId: u.id, currentRole: u.role })}
                            disabled={toggleRoleMutation.isPending}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors disabled:opacity-50"
                          >
                            {u.role === "admin" ? "Remover Admin" : "Tornar Admin"}
                          </button>
                          <button
                            onClick={() => resendResetMutation.mutate({ email: u.email, name: u.full_name })}
                            disabled={resendResetMutation.isPending}
                            className="rounded-lg p-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                            title="Reenviar email de definição de senha"
                          >
                            <MailCheck className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Eliminar o utilizador ${u.full_name || u.email}?`)) {
                                deleteUserMutation.mutate(u.id);
                              }
                            }}
                            disabled={deleteUserMutation.isPending}
                            className="rounded-lg p-1.5 text-xs text-destructive hover:bg-destructive/15 transition-colors disabled:opacity-50"
                            title="Eliminar utilizador"
                          >
                            <Trash2 className="h-4 w-4" />
                           </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
