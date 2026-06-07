import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "producer" | "field_producer" | "editor" | "viewer" | "user" | "partner" | "platform_admin" | "marketing_manager" | "content_manager";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  permissions: string[];
  isAdmin: boolean;
  isManager: boolean;
  isPartner: boolean;
  loading: boolean;
  hasPermission: (permission: string) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  permissions: [],
  isAdmin: false,
  isManager: false,
  isPartner: false,
  loading: true,
  hasPermission: () => false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  manager: "Manager",
  producer: "Produtor",
  field_producer: "Produtor de Campo",
  editor: "Editor",
  viewer: "Viewer",
  user: "Utilizador",
  partner: "Parceiro",
  platform_admin: "Super-Admin",
  marketing_manager: "Marketing Manager",
  content_manager: "Gestor de Conteúdo",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-primary/15 text-primary",
  manager: "bg-blue-500/15 text-blue-600",
  producer: "bg-orange-500/15 text-orange-600",
  field_producer: "bg-violet-500/15 text-violet-600",
  editor: "bg-amber-500/15 text-amber-600",
  viewer: "bg-emerald-500/15 text-emerald-600",
  user: "bg-secondary text-secondary-foreground",
  partner: "bg-indigo-500/15 text-indigo-600",
  platform_admin: "bg-rose-500/15 text-rose-600",
  marketing_manager: "bg-cyan-500/15 text-cyan-600",
  content_manager: "bg-pink-500/15 text-pink-600",
};

export const ALL_PERMISSIONS = [
  { key: "view_balances", label: "Ver Saldos", group: "Geral" },
  { key: "view_reports", label: "Ver Relatórios (geral)", group: "Geral" },
  { key: "view_events", label: "Ver Eventos (Resumo + Bilheteira)", group: "Geral" },
  { key: "view_bp", label: "Ver Business Plan do Evento", group: "Geral" },
  { key: "view_sponsorship", label: "Ver Patrocínios do Evento", group: "Geral" },
  { key: "view_ab", label: "Ver A&B do Evento", group: "Geral" },
  { key: "view_simulator", label: "Ver Simulador do Evento", group: "Geral" },
  { key: "manage_events", label: "Gerir Eventos", group: "Operacional" },
  { key: "manage_transactions", label: "Gerir Transações", group: "Operacional" },
  { key: "manage_recurring", label: "Gerir Recorrentes", group: "Operacional" },
  { key: "manage_suppliers", label: "Gerir Entidades / Beneficiários", group: "Operacional" },
  { key: "manage_quotations", label: "Gerir Cotações", group: "Operacional" },
  { key: "manage_accounts", label: "Gerir Contas", group: "Operacional" },
  { key: "manage_tickets", label: "Gerir Bilhetes", group: "Operacional" },
  { key: "manage_ticket_offices", label: "Gerir Bilheteiras", group: "Operacional" },
  { key: "manage_payment_lists", label: "Gerir Listas de Pagamento", group: "Operacional" },
  { key: "manage_iva", label: "Gerir IVA", group: "Operacional" },
  { key: "manage_categories", label: "Gerir Plano de Contas", group: "Operacional" },
  { key: "manage_calendar", label: "Gerir Calendário", group: "Operacional" },
  { key: "view_report_dre", label: "Relatório DRE", group: "Relatórios" },
  { key: "view_report_dre_brasil", label: "Relatório DRE Brasil", group: "Relatórios" },
  { key: "view_report_pl", label: "Relatório Business Plan", group: "Relatórios" },
  { key: "view_report_cashflow", label: "Relatório Fluxo de Caixa", group: "Relatórios" },
  { key: "view_report_bank_statement", label: "Relatório Extrato Bancário", group: "Relatórios" },
  { key: "view_report_contas_pagar", label: "Relatório Contas a Pagar", group: "Relatórios" },
  { key: "view_report_payment_lists", label: "Relatório Listas de Pagamento", group: "Relatórios" },
  { key: "view_report_suppliers", label: "Relatório Fornecedores", group: "Relatórios" },
  { key: "view_report_categories", label: "Relatório Plano de Contas", group: "Relatórios" },
  { key: "view_report_movements", label: "Relatório Movimentações", group: "Relatórios" },
  { key: "view_report_ticket_audit", label: "Relatório Auditoria Bilheteiras", group: "Relatórios" },
  { key: "view_report_document_pendencies", label: "Relatório Pendências Documentais", group: "Relatórios" },
  { key: "view_report_accounting_export", label: "Relatório Exportação Contábil", group: "Relatórios" },
  { key: "view_report_artist_cache", label: "Relatório Cachê do Artista", group: "Relatórios" },
  { key: "edit_approved_bp", label: "Editar BP Aprovado (Em Curso)", group: "Operacional" },
  { key: "camarim_team", label: "Camarim — Equipa de Montagem", group: "Operacional" },
  { key: "camarim_manage", label: "Camarim — Gerir Sessões (criar/aprovar/fechar)", group: "Operacional" },
  { key: "crm.audience.view", label: "MP Audience — Ver Dashboards", group: "MP Audience" },
  { key: "crm.audience.export", label: "MP Audience — Exportar Públicos", group: "MP Audience" },
  { key: "crm.campaign.create", label: "MP Audience — Criar Campanhas", group: "MP Audience" },
  { key: "crm.campaign.publish", label: "MP Audience — Publicar Campanhas", group: "MP Audience" },
  { key: "crm.campaign.set_budget", label: "MP Audience — Definir Orçamentos", group: "MP Audience" },
  { key: "crm.attribution.view", label: "MP Audience — Ver Atribuição", group: "MP Audience" },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  const fetchRoleAndPermissions = useCallback(async (userId: string) => {
    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    console.log("[AuthContext] fetchRoleAndPermissions", { userId, roleRows, rolesError });

    // Priority: platform_admin > admin > manager > accountant > editor > partner > viewer > user
    const priority: Record<string, number> = {
      platform_admin: 0, admin: 1, manager: 2, accountant: 3,
      marketing_manager: 4, content_manager: 4, editor: 4, producer: 4, field_producer: 4, partner: 5, viewer: 6, user: 7,
    };
    const roles = Array.from(new Set((roleRows ?? []).map((r: any) => r.role as AppRole)));
    roles.sort((a, b) => (priority[a] ?? 99) - (priority[b] ?? 99));
    const userRole = (roles[0] as AppRole) ?? "user";
    setRole(userRole);

    if (roles.includes("platform_admin") || roles.includes("admin")) {
      setPermissions(ALL_PERMISSIONS.map((p) => p.key));
      return;
    }

    const { data: rolePerms } = await supabase
      .from("role_permissions")
      .select("permission")
      .in("role", roles.length ? roles : [userRole]);

    const rolePermSet = new Set(rolePerms?.map((p) => p.permission) ?? []);

    const { data: userPerms } = await supabase
      .from("user_permissions")
      .select("permission, granted")
      .eq("user_id", userId);

    if (userPerms) {
      for (const up of userPerms) {
        if (up.granted) {
          rolePermSet.add(up.permission);
        } else {
          rolePermSet.delete(up.permission);
        }
      }
    }

    setPermissions(Array.from(rolePermSet));
  }, []);

  useEffect(() => {
    // 1. Restore session from storage FIRST
    supabase.auth.getSession().then(async ({ data: { session: restored } }) => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        setSession(restored);
        setUser(restored?.user ?? null);
        userIdRef.current = restored?.user?.id ?? null;
        if (restored?.user) {
          await fetchRoleAndPermissions(restored.user.id);
        }
        setLoading(false);
      }
    });

    // 2. Listen for subsequent changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, updatedSession) => {
        // Skip the INITIAL_SESSION event — we handle it via getSession above
        if (event === "INITIAL_SESSION") return;

        // For token refreshes, update session silently but don't re-fetch
        // role/permissions (they don't change). This keeps the session object
        // current without the heavier re-render cascade that closes modals.
        if (event === "TOKEN_REFRESHED") {
          if (updatedSession) {
            setSession(updatedSession);
            if (updatedSession.user.id !== userIdRef.current) {
              setUser(updatedSession.user);
              userIdRef.current = updatedSession.user.id;
            }
          }
          return;
        }

        setSession(updatedSession);
        setUser(updatedSession?.user ?? null);
        userIdRef.current = updatedSession?.user?.id ?? null;

        if (updatedSession?.user) {
          // Fire-and-forget to avoid blocking auth event processing
          setTimeout(() => fetchRoleAndPermissions(updatedSession.user.id), 0);
        } else {
          setRole(null);
          setPermissions([]);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchRoleAndPermissions]);

  const hasPermission = useCallback((permission: string) => permissions.includes(permission), [permissions]);

  const signOut = async () => {
    // Clear app icon badge on sign-out so the next user (or same user re-login)
    // doesn't inherit a stale count.
    try {
      const { clearBadge } = await import("@/lib/app-badge");
      await clearBadge();
    } catch {
      /* badge is best-effort */
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setPermissions([]);
  };

  return (
    <AuthContext.Provider value={{
      user, session, role, permissions,
      isAdmin: role === "admin" || role === ("platform_admin" as AppRole),
      isManager: role === "manager",
      isPartner: role === "partner",
      loading, hasPermission, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
