import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, User } from "lucide-react";

export default function UserManagement() {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();

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

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Gestão de Utilizadores</h1>
        <p className="text-sm text-muted-foreground">Gerir acessos e permissões</p>
      </div>

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
                        <button
                          onClick={() => toggleRoleMutation.mutate({ userId: u.id, currentRole: u.role })}
                          disabled={toggleRoleMutation.isPending}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors disabled:opacity-50"
                        >
                          {u.role === "admin" ? "Remover Admin" : "Tornar Admin"}
                        </button>
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
