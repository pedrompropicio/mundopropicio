import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "editor" | "viewer" | "user";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  permissions: string[];
  isAdmin: boolean;
  isManager: boolean;
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
  loading: true,
  hasPermission: () => false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  manager: "Manager",
  editor: "Editor",
  viewer: "Viewer",
  user: "Utilizador",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-primary/15 text-primary",
  manager: "bg-blue-500/15 text-blue-600",
  editor: "bg-amber-500/15 text-amber-600",
  viewer: "bg-emerald-500/15 text-emerald-600",
  user: "bg-secondary text-secondary-foreground",
};

export const ALL_PERMISSIONS = [
  { key: "view_balances", label: "Ver Saldos", group: "Geral" },
  { key: "view_reports", label: "Ver Relatórios (geral)", group: "Geral" },
  { key: "view_events", label: "Ver Eventos", group: "Geral" },
  { key: "manage_events", label: "Gerir Eventos", group: "Operacional" },
  { key: "manage_transactions", label: "Gerir Transações", group: "Operacional" },
  { key: "manage_suppliers", label: "Gerir Fornecedores", group: "Operacional" },
  { key: "manage_quotations", label: "Gerir Cotações", group: "Operacional" },
  { key: "manage_accounts", label: "Gerir Contas", group: "Operacional" },
  { key: "manage_tickets", label: "Gerir Bilhetes", group: "Operacional" },
  { key: "manage_iva", label: "Gerir IVA", group: "Operacional" },
  { key: "manage_categories", label: "Gerir Plano de Contas", group: "Operacional" },
  { key: "manage_calendar", label: "Gerir Calendário", group: "Operacional" },
  { key: "view_report_dre", label: "Relatório DRE", group: "Relatórios" },
  { key: "view_report_pl", label: "Relatório Business Plan", group: "Relatórios" },
  { key: "view_report_cashflow", label: "Relatório Fluxo de Caixa", group: "Relatórios" },
  { key: "view_report_bank_statement", label: "Relatório Extrato Bancário", group: "Relatórios" },
  { key: "view_report_contas_pagar", label: "Relatório Contas a Pagar", group: "Relatórios" },
  { key: "view_report_payment_lists", label: "Relatório Listas de Pagamento", group: "Relatórios" },
  { key: "view_report_suppliers", label: "Relatório Fornecedores", group: "Relatórios" },
  { key: "view_report_categories", label: "Relatório Plano de Contas", group: "Relatórios" },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const fetchRoleAndPermissions = useCallback(async (userId: string) => {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .single();

    const userRole = (roleData?.role as AppRole) ?? "user";
    setRole(userRole);

    const { data: rolePerms } = await supabase
      .from("role_permissions")
      .select("permission")
      .eq("role", userRole);

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
    supabase.auth.getSession().then(({ data: { session: restored } }) => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        setSession(restored);
        setUser(restored?.user ?? null);
        if (restored?.user) {
          fetchRoleAndPermissions(restored.user.id);
        }
        setLoading(false);
      }
    });

    // 2. Listen for subsequent changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, updatedSession) => {
        // Skip the INITIAL_SESSION event — we handle it via getSession above
        if (event === "INITIAL_SESSION") return;

        setSession(updatedSession);
        setUser(updatedSession?.user ?? null);

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
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setPermissions([]);
  };

  return (
    <AuthContext.Provider value={{
      user, session, role, permissions,
      isAdmin: role === "admin",
      isManager: role === "manager",
      loading, hasPermission, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
