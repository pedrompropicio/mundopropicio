import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole, ROLE_LABELS, ROLE_COLORS } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, User, UserPlus, Loader2, Trash2, MailCheck, Eye, Pencil, Briefcase, Settings2, Handshake, ArrowLeft, Megaphone, HardHat } from "lucide-react";
import { useNavigate } from "react-router-dom";
import UserPermissionsModal from "@/components/UserPermissionsModal";
import { logAudit, getAuditUser } from "@/lib/audit";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import { useCompany } from "@/hooks/useCompany";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ROLE_ICONS: Record<AppRole, React.ElementType> = {
  admin: ShieldCheck,
  manager: Briefcase,
  producer: HardHat,
  field_producer: HardHat,
  editor: Pencil,
  viewer: Eye,
  user: User,
  partner: Handshake,
  platform_admin: ShieldCheck,
  marketing_manager: Megaphone,
  content_manager: Pencil,
};

const ASSIGNABLE_ROLES: AppRole[] = ["admin", "manager", "producer", "field_producer", "editor", "viewer", "partner", "content_manager"];

export default function UserManagement() {
  const { isAdmin, user } = useAuth();
  const { companyId, company } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("editor");
  const [permModalUser, setPermModalUser] = useState<{ id: string; name: string; role: AppRole } | null>(null);
  const [attachConfirm, setAttachConfirm] = useState<{ existingName: string } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-with-roles", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // 1) Memberships na empresa ativa
      const { data: companyRoles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("company_id", companyId!);
      if (rErr) throw rErr;

      // 2) Platform_admins (acesso global) — sempre presentes na lista
      const { data: paRoles, error: paErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "platform_admin");
      if (paErr) throw paErr;

      const companyUserIds = new Set((companyRoles ?? []).map((r) => r.user_id));
      const paUserIds = new Set((paRoles ?? []).map((r) => r.user_id));
      const allUserIds = Array.from(new Set([...companyUserIds, ...paUserIds]));
      if (allUserIds.length === 0) return [];

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, created_at, company_id")
        .in("id", allUserIds);
      if (pErr) throw pErr;

      const priority: Record<string, number> = {
        platform_admin: 0, admin: 1, manager: 2, producer: 3, field_producer: 3, editor: 4, partner: 5, viewer: 6, user: 7,
      };
      const roleByUser = new Map<string, AppRole>();
      for (const row of companyRoles ?? []) {
        const cur = roleByUser.get(row.user_id);
        if (!cur || (priority[row.role] ?? 99) < (priority[cur] ?? 99)) {
          roleByUser.set(row.user_id, row.role as AppRole);
        }
      }

      return (profiles ?? [])
        .map((p) => {
          const hasCompanyRole = companyUserIds.has(p.id);
          const isPlatformAdminFallback = !hasCompanyRole && paUserIds.has(p.id);
          const role: AppRole = hasCompanyRole
            ? (roleByUser.get(p.id) ?? ("user" as AppRole))
            : ("platform_admin" as AppRole);
          return { ...p, role, isPlatformAdminFallback };
        })
        .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole, oldRole, userName }: { userId: string; newRole: AppRole; oldRole: AppRole; userName: string }) => {
      // Apenas mexe nas memberships desta empresa (multi-tenant)
      const { error: dErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", companyId!);
      if (dErr) throw dErr;
      const { error: iErr } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, company_id: companyId!, role: newRole });
      if (iErr) throw iErr;
      await logAudit({
        entity_type: "user_role",
        entity_id: userId,
        action: "update",
        changed_by: getAuditUser(user),
        old_data: { role: oldRole, company_id: companyId },
        new_data: { role: newRole, company_id: companyId },
        metadata: { user_name: userName },
      });
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
    mutationFn: async (opts?: { skipDryRun?: boolean }) => {
      // dry_run primeiro (a menos que já tenhamos confirmado attach)
      if (!opts?.skipDryRun) {
        const { data: dryData, error: dryErr } = await supabase.functions.invoke("create-user", {
          body: { email: newEmail, full_name: newName, role: newRole, dry_run: true },
        });
        if (dryErr) throw dryErr;
        if (dryData?.status === "already_member") {
          throw new Error(dryData.error || "Este utilizador já tem acesso a esta empresa.");
        }
        if (dryData?.status === "will_attach") {
          setAttachConfirm({ existingName: dryData.existing_full_name || newEmail });
          return { __pendingAttach: true } as any;
        }
        if (dryData?.error) throw new Error(dryData.error);
      }
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: { email: newEmail, full_name: newName, role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.__pendingAttach) return;
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      const status = data?.status;
      if (status === "attached") {
        toast({ title: "Utilizador adicionado à empresa." });
      } else if (status === "created") {
        toast({ title: "Utilizador criado", description: "Email de definição de senha enviado." });
      } else {
        toast({ title: "Utilizador criado!", description: data?.message });
      }
      setShowForm(false);
      setNewEmail("");
      setNewName("");
      setNewRole("editor");
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar utilizador", description: err.message, variant: "destructive" });
    },
  });

  const resendResetMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        throw new Error("Sessão expirada. Faça login novamente antes de reenviar o email.");
      }
      if (!session?.access_token) {
        throw new Error("Sessão expirada. Faça login novamente antes de reenviar o email.");
      }

      const { data, error } = await supabase.functions.invoke("resend-reset-email", {
        body: { email },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (error) {
        const context = (error as any).context;
        if (context?.json) {
          const payload = await context.json().catch(() => null);
          if (payload?.error) throw new Error(payload.error);
        }
        throw error;
      }
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

  // Multi-tenant: remove apenas a membership na empresa ativa.
  // Se sobrar zero memberships, apaga o user globalmente (delete-user edge fn).
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error: rErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", companyId!);
      if (rErr) throw rErr;

      await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", companyId!);

      const { count } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if ((count ?? 0) === 0) {
        const { data, error } = await supabase.functions.invoke("delete-user", {
          body: { user_id: userId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return { fullyDeleted: true };
      }
      return { fullyDeleted: false };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast({
        title: res?.fullyDeleted ? "Utilizador eliminado!" : "Acesso removido desta empresa.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao remover utilizador", description: err.message, variant: "destructive" });
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
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">
            <button onClick={() => navigate("/admin")} className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent transition-colors"><ArrowLeft className="h-4 w-4" /></button>
            Gestão de Utilizadores <HelpTooltip text={helpTexts.userManagement} />
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerir acessos e permissões {company?.display_name ? `— ${company.display_name}` : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 glow-primary"
        >
          <UserPlus className="h-4 w-4" />
          Novo Utilizador
        </button>
      </div>

      {/* Role legend */}
      <div className="glass rounded-xl p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Níveis de Permissão</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ASSIGNABLE_ROLES.map((r) => {
            const Icon = ROLE_ICONS[r];
            return (
              <div key={r} className="flex items-start gap-2 rounded-lg border border-border/50 p-3">
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{ROLE_LABELS[r]}</p>
                  <p className="text-xs text-muted-foreground">
                    {r === "admin" && "Acesso total ao sistema"}
                    {r === "manager" && "Cria, edita, vê relatórios e saldos"}
                    {r === "producer" && "Gere operação de eventos (sem acesso a Gestão/financeiro)"}
                    {r === "editor" && "Cria e edita, configurável por utilizador"}
                    {r === "viewer" && "Apenas visualização"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showForm && (
        <div className="glass rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">Adicionar Utilizador a esta empresa</h2>
          <p className="text-xs text-muted-foreground">
            Se o email já existir noutra empresa, será apenas anexado a esta — sem novo email de senha.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createUserMutation.mutate(undefined);
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
                onChange={(e) => setNewRole(e.target.value as AppRole)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                type="submit"
                disabled={createUserMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
              >
                {createUserMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Adicionar
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
          <p className="py-8 text-center text-muted-foreground">Sem utilizadores nesta empresa.</p>
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
                {users.map((u) => {
                  const Icon = ROLE_ICONS[u.role] || User;
                  const isPaFallback = (u as any).isPlatformAdminFallback === true;
                  const paTooltip = "Super-Admin tem acesso global. Para gerir, contactar suporte.";
                  return (
                    <tr key={u.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-3 pr-4 font-medium">{u.full_name || "—"}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{u.email}</td>
                      <td className="py-3 text-center">
                        {u.id === user?.id || isPaFallback ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role]}`}
                            title={isPaFallback ? paTooltip : undefined}
                          >
                            <Icon className="h-3 w-3" />
                            {isPaFallback ? "Super-Admin" : ROLE_LABELS[u.role]}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) => changeRoleMutation.mutate({ userId: u.id, newRole: e.target.value as AppRole, oldRole: u.role, userName: u.full_name || u.email })}
                            disabled={changeRoleMutation.isPending}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-3 text-center">
                        {u.id !== user?.id && !isPaFallback && (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setPermModalUser({ id: u.id, name: u.full_name || u.email, role: u.role })}
                              className="rounded-lg p-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                              title="Configurar permissões individuais"
                            >
                              <Settings2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => resendResetMutation.mutate({ email: u.email })}
                              disabled={resendResetMutation.isPending}
                              className="rounded-lg p-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                              title="Reenviar email de definição de senha"
                            >
                              <MailCheck className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Remover o acesso de ${u.full_name || u.email} a esta empresa?`)) {
                                  deleteUserMutation.mutate(u.id);
                                }
                              }}
                              disabled={deleteUserMutation.isPending}
                              className="rounded-lg p-1.5 text-xs text-destructive hover:bg-destructive/15 transition-colors disabled:opacity-50"
                              title="Remover acesso a esta empresa"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                        {isPaFallback && (
                          <span className="text-xs text-muted-foreground" title={paTooltip}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {permModalUser && (
        <UserPermissionsModal
          open={!!permModalUser}
          onOpenChange={(open) => !open && setPermModalUser(null)}
          userId={permModalUser.id}
          userName={permModalUser.name}
          userRole={permModalUser.role}
        />
      )}

      <AlertDialog open={!!attachConfirm} onOpenChange={(o) => { if (!o) setAttachConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Utilizador já existe noutra empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um utilizador com este email
              {attachConfirm?.existingName ? ` (${attachConfirm.existingName})` : ""}.
              Adicionar a <strong>{company?.display_name ?? "esta empresa"}</strong> como{" "}
              <strong>{ROLE_LABELS[newRole]}</strong>? Não será enviado novo email de senha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAttachConfirm(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAttachConfirm(null);
                createUserMutation.mutate({ skipDryRun: true });
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
