import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { parseEffectivePermissions, onActiveCompanyChanged } from "@/lib/permissions";

export type AppRole = "admin" | "manager" | "producer" | "field_producer" | "editor" | "viewer" | "user" | "partner" | "platform_admin" | "marketing_manager" | "content_manager" | "accountant";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  permissions: string[];
  isAdmin: boolean;
  isManager: boolean;
  isPartner: boolean;
  isAccountant: boolean;
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
  isAccountant: false,
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
  marketing_manager: "Gestor de Marketing",
  content_manager: "Gestor de Conteúdo",
  accountant: "Contabilista",
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
  accountant: "bg-teal-500/15 text-teal-600",
};

export const ALL_PERMISSIONS = [
  { key: "view_balances", label: "Ver Saldos", group: "Geral" },
  { key: "view_financial_position", label: "Ver posição financeira", group: "Geral" },
  { key: "view_confidential", label: "Ver contas e movimentos confidenciais", group: "Geral" },
  { key: "manage_bp", label: "Editar Business Plan do Evento", group: "Operacional" },
  { key: "view_reports", label: "Ver Relatórios (geral)", group: "Geral" },
  { key: "view_events", label: "Ver Eventos (Resumo + Bilheteira)", group: "Geral" },
  { key: "view_bp", label: "Ver Business Plan do Evento", group: "Geral" },
  { key: "view_partner_realized", label: "Ver Realizados do Evento", group: "Geral" },
  { key: "view_sponsorship", label: "Ver Patrocínios do Evento", group: "Geral" },
  { key: "view_ab", label: "Ver A&B do Evento", group: "Geral" },
  { key: "view_simulator", label: "Ver Simulador do Evento", group: "Geral" },
  { key: "manage_events", label: "Gerir Eventos", group: "Operacional" },
  { key: "manage_transactions", label: "Gerir Transações", group: "Operacional" },
  { key: "approve_transactions", label: "Aprovar transações", group: "Operacional" },
  { key: "raise_budget", label: "Elevar verba do BP", group: "Operacional" },
  { key: "delete_transaction_documents", label: "Apagar anexos de transações", group: "Operacional" },
  { key: "admin_cost_override", label: "Excepção à janela administrativa", group: "Operacional" },
  { key: "manage_recurring", label: "Gerir Recorrentes", group: "Operacional" },
  { key: "manage_suppliers", label: "Gerir Entidades / Beneficiários", group: "Operacional" },
  { key: "manage_quotations", label: "Gerir Cotações", group: "Operacional" },
  { key: "manage_accounts", label: "Gerir Contas", group: "Operacional" },
  { key: "manage_bank_reconciliation", label: "Conciliação Bancária", group: "Operacional" },
  { key: "manage_tickets", label: "Gerir Bilhetes", group: "Operacional" },
  { key: "manage_ticket_offices", label: "Gerir Bilheteiras", group: "Operacional" },
  { key: "manage_payment_lists", label: "Gerir Listas de Pagamento", group: "Operacional" },
  { key: "manage_iva", label: "Gerir IVA", group: "Operacional" },
  { key: "manage_categories", label: "Gerir Plano de Contas", group: "Operacional" },
  { key: "manage_calendar", label: "Gerir Calendário", group: "Operacional" },
  { key: "reopen_event", label: "Reabrir evento concluído", group: "Operacional" },
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
  { key: "view_partner_transactions", label: "Portal Sócio — Ver Transações Reais", group: "Portal Sócio" },
  { key: "view_partner_documents", label: "Portal Sócio — Ver Faturas/Anexos", group: "Portal Sócio" },
  { key: "camarim_team", label: "Camarim — Equipa de Montagem", group: "Operacional" },
  { key: "camarim_manage", label: "Camarim — Gerir Sessões (criar/aprovar/fechar)", group: "Operacional" },
  { key: "card_team", label: "Cartões — Produtor (submeter despesas)", group: "Operacional" },
  { key: "card_manage", label: "Cartões — Gerir Sessões (abrir/aprovar/fechar)", group: "Operacional" },
  { key: "crm.audience.view", label: "MP Audience — Ver Dashboards", group: "MP Audience" },
  { key: "crm.audience.export", label: "MP Audience — Exportar Públicos", group: "MP Audience" },
  { key: "crm.campaign.create", label: "MP Audience — Criar Campanhas", group: "MP Audience" },
  { key: "crm.campaign.publish", label: "MP Audience — Publicar Campanhas", group: "MP Audience" },
  { key: "crm.campaign.set_budget", label: "MP Audience — Definir Orçamentos", group: "MP Audience" },
  { key: "crm.attribution.view", label: "MP Audience — Ver Atribuição", group: "MP Audience" },
  // #311 F2a — acesso a módulos e configurações por permissão por empresa.
  { key: "module.erp", label: "Módulo ERP (gestão financeira)", group: "Módulos" },
  { key: "module.operacao", label: "Módulo Operação", group: "Módulos" },
  { key: "module.crm", label: "Módulo MP CRM", group: "Módulos" },
  { key: "module.audience", label: "Módulo MP Audience", group: "Módulos" },
  { key: "module.accounting", label: "Módulo Contabilidade", group: "Módulos" },
  { key: "module.partner_portal", label: "Portal do Sócio", group: "Módulos" },
  { key: "settings.admin", label: "Painel de administração", group: "Configurações" },
  { key: "settings.users", label: "Gerir utilizadores", group: "Configurações" },
  { key: "settings.permissions", label: "Gerir permissões", group: "Configurações" },
  { key: "settings.backups", label: "Cópias de segurança", group: "Configurações" },
  { key: "settings.security", label: "Segurança", group: "Configurações" },
  { key: "settings.audit_log", label: "Registos de actividade e downloads", group: "Configurações" },
  { key: "settings.trash", label: "Lixeira (restaurar)", group: "Configurações" },
  { key: "settings.diagnostics", label: "Diagnósticos e auditorias técnicas", group: "Configurações" },
  { key: "settings.notifications", label: "Lembretes e notificações", group: "Configurações" },
  { key: "settings.integrations.ticketing", label: "Integrações de bilheteira (Coala, Fever, Ticketline, BOL)", group: "Configurações" },
  { key: "settings.integrations.meta", label: "Integração Meta", group: "Configurações" },
  { key: "settings.integrations.google", label: "Integração Google", group: "Configurações" },
  { key: "settings.integrations.tiktok", label: "Integração TikTok", group: "Configurações" },
  { key: "settings.portal", label: "Marca e portal", group: "Configurações" },
  { key: "settings.email", label: "Email da empresa", group: "Configurações" },
  { key: "settings.bp_tools", label: "Ferramentas de BP (implantação, formalidade, reconciliação)", group: "Configurações" },
  { key: "settings.accounts", label: "Configurar contas financeiras", group: "Configurações" },
  { key: "settings.chart_of_accounts", label: "Configurar plano de contas", group: "Configurações" },
  { key: "settings.ticket_offices", label: "Configurar bilheteiras", group: "Configurações" },
  { key: "settings.audit_accounts", label: "Auditoria de contas", group: "Configurações" },
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  /**
   * (g9c · #167) Estanqueidade da cache entre utilizadores: qualquer troca de
   * identidade no mesmo separador limpa TODA a cache do react-query. As chaves
   * do Portal são ainda prefixadas pelo id do utilizador (defesa em profundidade).
   */
  const cacheIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = user?.id ?? null;
    if (cacheIdentityRef.current !== null && cacheIdentityRef.current !== uid) {
      queryClient.clear();
    }
    cacheIdentityRef.current = uid;
  }, [user?.id, queryClient]);

  const fetchRoleAndPermissions = useCallback(async (userId: string) => {
    // #311 F2a: papel e permissões resolvidos NO SERVIDOR pela empresa activa
    // (fonte única com has_permission). platform_admin tem todas as chaves;
    // excepções negadas continuam a valer (#105).
    const { data, error } = await supabase.rpc("my_effective_permissions" as any, {
      p_universe: ALL_PERMISSIONS.map((p) => p.key),
    } as any);
    if (userIdRef.current && userIdRef.current !== userId) return; // troca de utilizador entretanto
    if (error) {
      console.error("[AuthContext] my_effective_permissions", error);
      setRole("user" as AppRole);
      setPermissions([]);
      return;
    }
    const eff = parseEffectivePermissions(data);
    setRole(eff.role as AppRole);
    setPermissions(eff.permissions);
  }, []);

  // #311 F2a: trocar de empresa recarrega papel e permissões (não só no login).
  useEffect(() => onActiveCompanyChanged(() => {
    const uid = userIdRef.current;
    if (uid) void fetchRoleAndPermissions(uid);
  }), [fetchRoleAndPermissions]);

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

        // (#237) A cache de empresa do storage é por sessão/utilizador — se o
        // utilizador mudou (login de outro utilizador, SIGNED_OUT), limpar para
        // não herdar o prefixo de empresa do utilizador anterior.
        const newUserId = updatedSession?.user?.id ?? null;
        if (newUserId !== userIdRef.current) {
          void import("@/lib/storage").then((m) => m.clearCompanyCache());
        }

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
    // (#237) limpar a cache de empresa do storage — não pode sobreviver ao logout.
    try {
      const { clearCompanyCache } = await import("@/lib/storage");
      clearCompanyCache();
    } catch {
      /* best-effort */
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setPermissions([]);
    // (g9c · #167) nada do utilizador anterior fica em cache.
    cacheIdentityRef.current = null;
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{
      user, session, role, permissions,
      isAdmin: role === "admin" || role === ("platform_admin" as AppRole),
      isManager: role === "manager",
      isPartner: role === "partner",
      isAccountant: role === ("accountant" as AppRole),
      loading, hasPermission, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
