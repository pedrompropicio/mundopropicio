import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useGlobalModalScrollLock } from "@/hooks/useGlobalModalScrollLock";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
// Logo agora vem de BrandedLogo (suporta multi-empresa)
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";
import { ApprovedPaymentListReminder } from "@/components/ApprovedPaymentListReminder";
import ScrollToTop from "@/components/ScrollToTop";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { CompanyBrandingProvider } from "@/contexts/CompanyBrandingContext";
import { useCompany } from "@/hooks/useCompany";
import { BrandedLogo } from "@/components/BrandedLogo";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { ModuleSwitcherButton } from "@/components/ModuleSwitcherButton";
import { MfaRequiredGate } from "@/components/MfaRequiredGate";
import { AppSidebar } from "@/components/AppSidebar";
import { Sun, Moon } from "lucide-react";
import Index from "./pages/Index";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import EventSimulator from "./pages/EventSimulator";
import EventSimulatorDemo from "./pages/EventSimulatorDemo";
import Transactions from "./pages/Transactions";
import IvaManagement from "./pages/IvaManagement";
import Suppliers from "./pages/Suppliers";
import Quotations from "./pages/Quotations";
import AccountCategories from "./pages/AccountCategories";
import FinancialAccounts from "./pages/FinancialAccounts";
import UserManagement from "./pages/UserManagement";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import LegalPrivacy from "./pages/legal/Privacy";
import LegalTerms from "./pages/legal/Terms";
import LegalAbout from "./pages/legal/About";
// TicketManagement now embedded in TicketOffices module
import EventCalendar from "./pages/EventCalendar";
import Reports from "./pages/Reports";
import ReportDREPage from "./pages/ReportDREPage";
import ReportDREEmpresarialPage from "./pages/ReportDREEmpresarialPage";
import ReportDREBrasilPage from "./pages/ReportDREBrasilPage";
import ReportPLPage from "./pages/ReportPLPage";
import ReportBankStatementPage from "./pages/ReportBankStatementPage";
import ReportCashFlowPage from "./pages/ReportCashFlowPage";
import ReportContasPagarPage from "./pages/ReportContasPagarPage";
import ReportPaymentListsPage from "./pages/ReportPaymentListsPage";
import ReportSuppliersPage from "./pages/ReportSuppliersPage";
import ReportAccountCategoriesPage from "./pages/ReportAccountCategoriesPage";
import ReportMovementReconciliationPage from "./pages/ReportMovementReconciliationPage";
import ReportTicketOfficeAuditPage from "./pages/ReportTicketOfficeAuditPage";
import ReportArtistCachePage from "./pages/ReportArtistCachePage";
import ReportDocumentPendenciesPage from "./pages/ReportDocumentPendenciesPage";
import ReportAccountingExportPage from "./pages/ReportAccountingExportPage";
import ReportPartnerExpensesPage from "./pages/ReportPartnerExpensesPage";
import ReportBPTransactionsPage from "./pages/ReportBPTransactionsPage";
import ReportForecastPayablesPage from "./pages/ReportForecastPayablesPage";
import ReportProfitabilityPage from "./pages/ReportProfitabilityPage";
import ReportMonthlyEvolutionPage from "./pages/ReportMonthlyEvolutionPage";
import ReportBudgetDeviationPage from "./pages/ReportBudgetDeviationPage";
import ReportAgingPage from "./pages/ReportAgingPage";
import ReportSupplierConcentrationPage from "./pages/ReportSupplierConcentrationPage";
import ReportTreasuryProjectionPage from "./pages/ReportTreasuryProjectionPage";
import ReportOccupancyRatePage from "./pages/ReportOccupancyRatePage";
import ReportSalesCurvePage from "./pages/ReportSalesCurvePage";
import ReportSalesComparisonPage from "./pages/ReportSalesComparisonPage";
import ReportRevenueMixPage from "./pages/ReportRevenueMixPage";
import ReportPartnerSettlementPage from "./pages/ReportPartnerSettlementPage";
import ReportPendencyIndexPage from "./pages/ReportPendencyIndexPage";
import ReportIvaAuditPage from "./pages/ReportIvaAuditPage";
import DatabaseBackups from "./pages/DatabaseBackups";
import RecurringTransactions from "./pages/RecurringTransactions";
import SecurityDashboard from "./pages/SecurityDashboard";
import AdminPanel from "./pages/AdminPanel";
import AuditoriaContas from "./pages/AuditoriaContas";
import FormalidadeAudit from "./pages/FormalidadeAudit";
import ReconciliacaoBpTx from "./pages/ReconciliacaoBpTx";
import Unsubscribe from "./pages/Unsubscribe";
import TicketOffices from "./pages/TicketOffices";
import HelpCenter from "./pages/HelpCenter";
import Reimbursements from "./pages/Reimbursements";
import EventImplementations from "./pages/EventImplementations";
import EventImplementationDetail from "./pages/EventImplementationDetail";
import UserActivityLog from "./pages/UserActivityLog";
import Camarim from "./pages/Camarim";
import CamarimSessionDetail from "./pages/CamarimSessionDetail";
import CamarimEquipa from "./pages/CamarimEquipa";
import OperacaoLayout from "./pages/operacao/OperacaoLayout";
import FrenteDetail from "./pages/operacao/FrenteDetail";
import EtapaDetail from "./pages/operacao/EtapaDetail";
import MeusChamados from "./pages/operacao/MeusChamados";
import EtapasList from "./pages/operacao/EtapasList";
import ZonasList from "./pages/operacao/ZonasList";
import ChamadosList from "./pages/operacao/ChamadosList";
import ChamadoNovo from "./pages/operacao/ChamadoNovo";
import ChamadoDetail from "./pages/operacao/ChamadoDetail";
import Atividade from "./pages/operacao/Atividade";
import MinhasTarefas from "./pages/operacao/MinhasTarefas";
import StaffList from "./pages/operacao/StaffList";
import PessoaDetail from "./pages/operacao/PessoaDetail";
import EquipaView from "./pages/operacao/EquipaView";
import AcceptInvite from "./pages/operacao/AcceptInvite";
import OperacaoOnboarding from "./pages/operacao/Onboarding";
import OperacaoHome from "./pages/operacao/OperacaoHome";
import CampoView from "./pages/operacao/CampoView";
import OperacaoDashboard from "./pages/operacao/Dashboard";
import FrenteManage from "./pages/operacao/FrenteManage";
import EventHub from "./pages/operacao/EventHub";


import TrashPage from "./pages/Trash";
import NotFound from "./pages/NotFound";
import AcceptInvitation from "./pages/AcceptInvitation";
import Companies from "./pages/admin/Companies";
import Reminders from "./pages/admin/Reminders";
import RlsLegacyAudit from "./pages/admin/RlsLegacyAudit";
import UploadCoalaFotos from "./pages/admin/UploadCoalaFotos";
import CoalaSync from "./pages/admin/CoalaSync";
import FeverSync from "./pages/admin/FeverSync";
import TicketlineSync from "./pages/admin/TicketlineSync";
import SyncHealth from "./pages/admin/SyncHealth";
import Notifications from "./pages/admin/Notifications";
import DiagnosisTest from "./pages/admin/DiagnosisTest";
import IbanDuplicates from "./pages/admin/IbanDuplicates";
import AuditDownloads from "./pages/admin/AuditDownloads";
import AccountantHome from "./pages/contabilidade/AccountantHome";


import UserSettings from "./pages/UserSettings";
import CrmConnections from "./pages/crm/Connections";
import CrmCampaigns from "./pages/crm/Campaigns";
import CrmPixels from "./pages/crm/Pixels";
import CrmInsights from "./pages/crm/Insights";
import CrmAdAccounts from "./pages/crm/AdAccounts";
import CrmSetup from "./pages/crm/Setup";
import CrmStrategies from "./pages/crm/Strategies";
import CrmStrategyNew from "./pages/crm/StrategyNew";
import CrmStrategyRedesign from "./pages/crm/StrategyRedesign";
import CrmStrategyNewDesign from "./pages/crm/StrategyNewDesign";
import CrmStrategyView from "./pages/crm/StrategyView";
import CrmStrategyPrint from "./pages/crm/StrategyPrint";
import AudiencePrint from "@/pages/crm/AudiencePrint";
import CrmCreatives from "./pages/crm/Creatives";
import CrmCreativeNew from "./pages/crm/CreativeNew";
import CrmCreativeView from "./pages/crm/CreativeView";
import CrmCampaignView from "./pages/crm/CampaignView";
import CrmAudit from "./pages/crm/Audit";
import CrmFunnelTest from "./pages/crm/FunnelTest";
import ModuleSelector from "./pages/ModuleSelector";
import PostLoginRedirect from "./components/PostLoginRedirect";
import { AudienceLayout } from "./components/layout/AudienceLayout";
import { CrmLayout } from "./components/layout/CrmLayout";
import { PartnerLayout } from "./components/PartnerLayout";
import CrmDashboard from "./pages/crm-admin/CrmDashboard";
import ContactosList from "./pages/crm-admin/contactos/ContactosList";
import LeadsList from "./pages/crm-admin/leads/LeadsList";
import AudiencesList from "./pages/crm-admin/audiences/AudiencesList";
import AudienceNew from "./pages/crm-admin/audiences/AudienceNew";
import AudienceEditor from "./pages/crm-admin/audiences/AudienceEditor";
import EventosList from "./pages/crm-admin/eventos/EventosList";
import EventMarketingEditor from "./pages/crm-admin/eventos/EventMarketingEditor";
import NewEventoPage from "./pages/crm-admin/eventos/NewEventoPage";
import EndossarEventoPage from "./pages/crm-admin/eventos/EndossarEventoPage";
import EndorsementEditor from "./pages/crm-admin/eventos/EndorsementEditor";
import BlogList from "./pages/crm-admin/blog/BlogList";
import BlogEditor from "./pages/crm-admin/blog/BlogEditor";
import PaginasList from "./pages/crm-admin/paginas/PaginasList";
import PaginaEditor from "./pages/crm-admin/paginas/PaginaEditor";
import VideosList from "./pages/crm-admin/videos/VideosList";
import PressList from "./pages/crm-admin/press/PressList";
import PortalSettings from "./pages/crm-admin/portal-settings/PortalSettings";
import MetaCapiMonitor from "./pages/crm-admin/meta-capi/MetaCapiMonitor";
import MetaAudiencesList from "./pages/crm-admin/meta-audiences/MetaAudiencesList";
import { useLocation } from "react-router-dom";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedLayout() {
  const { user, loading, isPartner, isAdmin, isManager, hasPermission, role, signOut } = useAuth();
  const { companyId, isLoading: companyLoading, isError: companyError, error: companyErrorObj, isPlatformAdmin, refetch: refetchCompany } = useCompany();
  const queryClient = useQueryClient();
  const previousCompanyIdRef = useRef<string | null>(null);
  const isSwitchingCompany = useIsMutating({ mutationKey: ["set-active-company"] }) > 0;
  const location = useLocation();
  // Camarim-only = utilizador de campo: tem APENAS camarim_team e nenhuma
  // permissão de gestão (nem sequer camarim_manage). Editores que gerem o
  // camarim ou outras áreas continuam a ver o dashboard normal.
  const MANAGEMENT_PERMS = [
    "camarim_manage",
    "manage_events",
    "view_events",
    "manage_transactions",
    "manage_suppliers",
    "manage_quotations",
    "manage_accounts",
    "view_balances",
    "manage_tickets",
    "manage_ticket_offices",
    "manage_payment_lists",
    "manage_iva",
    "manage_categories",
    "manage_calendar",
    "manage_recurring",
    "view_reports",
    "edit_approved_bp",
  ] as const;
  const hasAnyManagement = MANAGEMENT_PERMS.some((p) => hasPermission(p));
  const isCamarimOnly =
    !isAdmin && !isManager && hasPermission("camarim_team") && !hasAnyManagement;

  // Hook must be called unconditionally (Rules of Hooks)
  useInactivityTimeout(!loading && !!user);
  useActivityTracker();

  // If recovery is in progress and user somehow landed here, force sign out
  useEffect(() => {
    if (!loading && user && sessionStorage.getItem("recovery_in_progress") === "true") {
      signOut().then(() => {
        sessionStorage.removeItem("recovery_in_progress");
      });
    }
  }, [loading, user, signOut]);

  // App icon badge: count of payment lists awaiting approval (admins/managers only).
  // Refresh on mount, on tab focus, and whenever payment_lists changes via realtime.
  useEffect(() => {
    if (loading || !user) return;
    if (!isAdmin && !isManager) return;

    let cancelled = false;
    const run = async () => {
      const { refreshBadgeFromDB } = await import("@/lib/app-badge");
      if (cancelled) return;
      void refreshBadgeFromDB();
    };
    void run();

    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    const channel = supabaseClient
      .channel("badge-payment-lists")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_lists" },
        () => void run(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      void supabaseClient.removeChannel(channel);
    };
  }, [loading, user, isAdmin, isManager]);

  useEffect(() => {
    if (!isPlatformAdmin || !companyId) return;
    const previousCompanyId = previousCompanyIdRef.current;
    previousCompanyIdRef.current = companyId;
    if (!previousCompanyId || previousCompanyId === companyId) return;

    void queryClient.resetQueries({
      predicate: (query) => {
        const rootKey = query.queryKey[0];
        return rootKey !== "current-company" && rootKey !== "companies-list";
      },
    });
  }, [companyId, isPlatformAdmin, queryClient]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">A carregar…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isPlatformAdmin && (companyLoading || isSwitchingCompany)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">A sincronizar empresa ativa…</p>
        <button
          type="button"
          onClick={() => signOut()}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Sair
        </button>
      </div>
    );
  }

  if (isPlatformAdmin && companyError && !companyId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-destructive font-medium">Não foi possível resolver a empresa ativa.</p>
        <p className="text-xs text-muted-foreground max-w-md break-words">
          {companyErrorObj?.message ?? "Erro desconhecido"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => refetchCompany()}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Tentar novamente
          </button>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  // Partner users are redirected to their dedicated layout
  if (isPartner) {
    return <Navigate to="/parceiro" replace />;
  }

  // Camarim-only users (team members with no management access) go to the
  // compact PWA-like camarim-equipa view. Bloqueia acesso a QUALQUER rota
  // do dashboard administrativo — só podem ver /camarim-equipa.
  if (isCamarimOnly) {
    return <Navigate to="/camarim-equipa" replace />;
  }

  // content_manager só tem acesso ao MP CRM — bloqueia qualquer rota do ERP
  // (inclui reabertura da PWA no último URL guardado).
  if ((role as any) === "content_manager") {
    return <Navigate to="/crm" replace />;
  }

  // accountant → portal de contabilidade dedicado, read-only
  if ((role as any) === "accountant") {
    return <Navigate to="/contabilidade" replace />;
  }


  // Preferência opcional: admin/manager com permissão camarim_team pode
  // optar por que a rota raiz "/" abra direto a vista compacta de equipa.
  try {
    const path = typeof window !== "undefined" ? window.location.pathname : "/";
    const prefersCamarim =
      typeof window !== "undefined" &&
      localStorage.getItem("camarim_team_default_landing") === "1";
    if (prefersCamarim && hasPermission("camarim_team") && (path === "/" || path === "")) {
      return <Navigate to="/camarim-equipa" replace />;
    }
  } catch {}

  // Post-login routing for "/": let PostLoginRedirect decide based on perms
  // (ModuleSelector for users with both modules, direct redirect otherwise).
  const currentPath = location.pathname;
  if (currentPath === "/") {
    return <PostLoginRedirect />;
  }
  // Rota dedicada ao seletor de módulos: bypassa o PostLoginRedirect para que
  // utilizadores de campo (Operação) também consigam abrir o seletor.
  if (currentPath === "/modulos") {
    return <ModuleSelector />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ApprovedPaymentListReminder />
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-border bg-sidebar shadow-sm px-4 lg:px-6"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          height: "calc(3.5rem + env(safe-area-inset-top))",
        }}
      >
        <BrandedLogo />
        <div className="flex items-center gap-2">
          <ModuleSwitcherButton />
          <CompanySwitcher />
          <GlobalSearch />
          <NotificationBell />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex" style={{ paddingTop: "calc(3.5rem + env(safe-area-inset-top))" }}>
        <AppSidebar />
        <main className="flex-1 pl-16 lg:pl-56">
          <div className="mx-auto max-w-7xl p-4 lg:p-6">
            {/* MFA gate temporariamente desativado — reativar envolvendo <Routes> com <MfaRequiredGate> */}
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/erp" element={<Index />} />
              <Route path="/calendario" element={<EventCalendar />} />
              <Route path="/eventos" element={<Events />} />
              <Route path="/eventos/:id" element={<EventDetail />} />
              <Route path="/eventos/:id/simulador" element={<EventSimulator />} />
              <Route path="/demo/simulador" element={<EventSimulatorDemo />} />
              <Route path="/transacoes" element={<Transactions />} />
              <Route path="/plano-contas" element={<AccountCategories />} />
              <Route path="/contas" element={<FinancialAccounts />} />
              <Route path="/fornecedores" element={<Suppliers />} />
              <Route path="/cotacoes" element={<Quotations />} />
              <Route path="/bilhetes" element={<Navigate to="/bilheteiras" replace />} />
              <Route path="/bilheteiras" element={<TicketOffices />} />
              <Route path="/iva" element={<IvaManagement />} />
              <Route path="/recorrentes" element={<RecurringTransactions />} />
              <Route path="/reembolsos" element={<Reimbursements />} />
              <Route path="/ajuda" element={<HelpCenter />} />
              <Route path="/camarim" element={<Camarim />} />
              <Route path="/camarim/:id" element={<CamarimSessionDetail />} />
              <Route path="/operacao" element={<OperacaoLayout />}>
                <Route index element={<OperacaoHome />} />
                <Route path=":eventId" element={<EventHub />} />
                <Route path="campo" element={<CampoView />} />
                <Route path="dashboard" element={<OperacaoDashboard />} />

                <Route path="equipa" element={<EquipaView />} />
                <Route path="equipa/pessoa/:id" element={<PessoaDetail />} />
                <Route path="atividade" element={<Atividade />} />
                <Route path="minhas-tarefas" element={<MinhasTarefas />} />
                <Route path="staff" element={<Navigate to="/operacao/equipa?tab=staff" replace />} />
                <Route path="frente/:id" element={<FrenteDetail />} />
                <Route path="frente/:id/manage" element={<FrenteManage />} />
                <Route path="etapa/:id" element={<EtapaDetail />} />
                <Route path="etapas" element={<EtapasList />} />
                <Route path="zonas" element={<ZonasList />} />
                <Route path="chamados" element={<ChamadosList />} />
                {/* Redirects da rota antiga "Pessoas" */}
                <Route path="pessoas" element={<Navigate to="/operacao/equipa" replace />} />
                <Route path="pessoa/:id" element={<Navigate to="/operacao/equipa" replace />} />
                <Route path="meus-chamados" element={<MeusChamados />} />
                <Route path="chamado/novo" element={<ChamadoNovo />} />
                <Route path="chamado/:id" element={<ChamadoDetail />} />
              </Route>
              <Route path="/relatorios" element={<Reports />}>
                <Route index element={<Navigate to="/relatorios/dre" replace />} />
                <Route path="dre" element={<ReportDREPage />} />
                <Route path="dre-empresarial" element={<ReportDREEmpresarialPage />} />
                <Route path="dre-brasil" element={<ReportDREBrasilPage />} />
                <Route path="pl" element={<ReportPLPage />} />
                <Route path="fluxo-caixa" element={<ReportCashFlowPage />} />
                <Route path="extrato" element={<ReportBankStatementPage />} />
                <Route path="contas-pagar" element={<ReportContasPagarPage />} />
                <Route path="listas-pagamento" element={<ReportPaymentListsPage />} />
                <Route path="fornecedores" element={<ReportSuppliersPage />} />
                <Route path="plano-contas" element={<ReportAccountCategoriesPage />} />
                <Route path="movimentacoes" element={<ReportMovementReconciliationPage />} />
                <Route path="bilheteiras" element={<ReportTicketOfficeAuditPage />} />
                <Route path="cache-artista" element={<ReportArtistCachePage />} />
                <Route path="pendencias-documentais" element={<ReportDocumentPendenciesPage />} />
                <Route path="exportacao-contabil" element={<ReportAccountingExportPage />} />
                <Route path="despesas-socios" element={<ReportPartnerExpensesPage />} />
                <Route path="bp-transacoes" element={<ReportBPTransactionsPage />} />
                <Route path="exposicao-financeira" element={<ReportForecastPayablesPage />} />
                <Route path="rentabilidade" element={<ReportProfitabilityPage />} />
                <Route path="evolucao-mensal" element={<ReportMonthlyEvolutionPage />} />
                <Route path="desvio-orcamental" element={<ReportBudgetDeviationPage />} />
                <Route path="aging" element={<ReportAgingPage />} />
                <Route path="concentracao-fornecedores" element={<ReportSupplierConcentrationPage />} />
                <Route path="projecao-tesouraria" element={<ReportTreasuryProjectionPage />} />
                <Route path="taxa-ocupacao" element={<ReportOccupancyRatePage />} />
                <Route path="curva-vendas" element={<ReportSalesCurvePage />} />
                <Route path="comparativo-vendas" element={<ReportSalesComparisonPage />} />
                <Route path="mix-receitas" element={<ReportRevenueMixPage />} />
                <Route path="acerto-socios" element={<ReportPartnerSettlementPage />} />
                <Route path="indice-pendencias" element={<ReportPendencyIndexPage />} />
                <Route path="auditoria-iva" element={<ReportIvaAuditPage />} />
              </Route>
              
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/utilizadores" element={<UserManagement />} />
              <Route path="/admin/backups" element={<DatabaseBackups />} />
              <Route path="/admin/seguranca" element={<SecurityDashboard />} />
              <Route path="/admin/lixeira" element={<TrashPage />} />
              <Route path="/admin/implantacao" element={<EventImplementations />} />
              <Route path="/admin/implantacao/:id" element={<EventImplementationDetail />} />
              <Route path="/admin/atividade" element={<UserActivityLog />} />
              <Route path="/admin/auditoria-contas" element={<AuditoriaContas />} />
              <Route path="/admin/formalidade" element={<FormalidadeAudit />} />
              <Route path="/admin/reconciliacao-bp-tx" element={<ReconciliacaoBpTx />} />
              <Route path="/admin/empresas" element={<Companies />} />
              <Route path="/admin/lembretes" element={<Reminders />} />
              <Route path="/admin/auditoria-rls" element={<RlsLegacyAudit />} />
              <Route path="/admin/upload-coala-fotos" element={<UploadCoalaFotos />} />
              <Route path="/admin/sync-health" element={<SyncHealth />} />
              <Route path="/admin/sync-coala" element={<CoalaSync />} />
              <Route path="/admin/fever-sync" element={<FeverSync />} />
              <Route path="/admin/ticketline-sync" element={<TicketlineSync />} />
              <Route path="/admin/notifications" element={<Notifications />} />
              <Route path="/admin/diagnosis-test" element={<DiagnosisTest />} />
              <Route path="/admin/iban-duplicados" element={<IbanDuplicates />} />
              <Route path="/admin/audit-downloads" element={<AuditDownloads />} />


              <Route path="/perfil" element={<UserSettings />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={theme === "dark" ? "Modo claro" : "Modo escuro"}
    >
      {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </button>
  );
}

function App() {
  useGlobalModalScrollLock();

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AuthProvider>
            <CompanyBrandingProvider>
              <BrowserRouter>
                <ScrollToTop />
                <Routes>
                  <Route path="/login" element={<AuthRoute />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/privacy" element={<LegalPrivacy />} />
                  <Route path="/terms" element={<LegalTerms />} />
                  <Route path="/about" element={<LegalAbout />} />
                  <Route path="/unsubscribe" element={<Unsubscribe />} />
                  <Route path="/accept-invitation" element={<AcceptInvitation />} />
                  <Route path="/operacao/accept-invite" element={<AcceptInvite />} />
                  <Route path="/operacao/onboarding" element={<OperacaoOnboarding />} />
                  <Route path="/camarim-equipa" element={<CamarimEquipa />} />
                  <Route path="/contabilidade" element={<AccountantGate />} />
                  <Route path="/parceiro/*" element={<PartnerLayout />} />

                  <Route path="/audience" element={<AudienceLayout />}>
                    <Route index element={<Navigate to="/audience/dashboard" replace />} />
                    <Route path="dashboard" element={<CrmCampaigns />} />
                    <Route path="campaigns/:id" element={<CrmCampaignView />} />
                    <Route path="connections" element={<CrmConnections />} />
                    <Route path="pixels" element={<CrmPixels />} />
                    <Route path="insights" element={<CrmInsights />} />
                    <Route path="ad-accounts" element={<CrmAdAccounts />} />
                    <Route path="setup" element={<CrmSetup />} />
                    <Route path="strategies" element={<CrmStrategies />} />
                    <Route path="strategies/new" element={<CrmStrategyNew />} />
                    <Route path="strategies/redesign/:campaignId" element={<CrmStrategyRedesign />} />
                    <Route path="strategies/new-design/:campaignId" element={<CrmStrategyNewDesign />} />
                    <Route path="strategies/:id" element={<CrmStrategyView />} />
                    <Route path="creatives" element={<CrmCreatives />} />
                    <Route path="creatives/new" element={<CrmCreativeNew />} />
                    <Route path="creatives/:id" element={<CrmCreativeView />} />
                    <Route path="audit/funnel-test" element={<CrmFunnelTest />} />
                    <Route path="audit/:contextType/:contextId" element={<CrmAudit />} />
                    <Route path="audit/:contextType" element={<CrmAudit />} />
                  </Route>
                  <Route path="/audience/strategies/:id/print" element={<CrmStrategyPrint />} />
                  <Route path="/audience/print/:type" element={<AudiencePrint />} />
                  <Route path="/crm" element={<CrmLayout />}>
                    <Route index element={<CrmDashboard />} />
                    <Route path="eventos" element={<EventosList />} />
                    <Route path="eventos/novo" element={<NewEventoPage />} />
                    <Route path="eventos/endossar" element={<EndossarEventoPage />} />
                    <Route path="eventos/endorsement/:eventId" element={<EndorsementEditor />} />
                    <Route path="eventos/:eventId" element={<EventMarketingEditor />} />
                    <Route path="contactos" element={<ContactosList />} />
                    <Route path="leads" element={<LeadsList />} />
                    <Route path="audiences" element={<AudiencesList />} />
                    <Route path="audiences/novo" element={<AudienceNew />} />
                    <Route path="audiences/:id" element={<AudienceEditor />} />
                    <Route path="blog" element={<BlogList />} />
                    <Route path="blog/novo" element={<BlogEditor mode="new" />} />
                    <Route path="blog/:id" element={<BlogEditor mode="edit" />} />
                    <Route path="paginas" element={<PaginasList />} />
                    <Route path="paginas/:slug" element={<PaginaEditor />} />
                    <Route path="videos" element={<VideosList />} />
                    <Route path="press" element={<PressList />} />
                    <Route path="portal-settings" element={<PortalSettings />} />
                    <Route path="meta-capi" element={<MetaCapiMonitor />} />
                    <Route path="meta-audiences" element={<MetaAudiencesList />} />
                  </Route>
                  <Route path="/*" element={<ProtectedLayout />} />
                </Routes>
              </BrowserRouter>
            </CompanyBrandingProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function AuthRoute() {
  const { user, loading, isPartner, isAdmin, isManager, hasPermission, role } = useAuth();
  if (loading) return null;
  // Don't redirect if user is in the middle of password recovery flow
  const isRecoveryFlow = sessionStorage.getItem("recovery_in_progress") === "true";
  // Aguarda resolução do role antes de decidir destino (evita race que
  // mandava content_manager para /erp enquanto role ainda era null).
  if (user && !isRecoveryFlow && role === null) return null;
  if (user && !isRecoveryFlow) {
    if (isPartner) return <Navigate to="/parceiro" replace />;
    const MANAGEMENT_PERMS = [
      "camarim_manage",
      "manage_events",
      "view_events",
      "manage_transactions",
      "manage_suppliers",
      "manage_quotations",
      "manage_accounts",
      "view_balances",
      "manage_tickets",
      "manage_ticket_offices",
      "manage_payment_lists",
      "manage_iva",
      "manage_categories",
      "manage_calendar",
      "manage_recurring",
      "view_reports",
      "edit_approved_bp",
    ];
    const hasAnyManagement = MANAGEMENT_PERMS.some((p) => hasPermission(p));
    const isCamarimOnly =
      !isAdmin && !isManager && hasPermission("camarim_team") && !hasAnyManagement;
    if (isCamarimOnly) return <Navigate to="/camarim-equipa" replace />;
    // marketing_manager-only → módulo MP Audience direto
    if ((role as any) === "marketing_manager") {
      return <Navigate to="/audience/dashboard" replace />;
    }
    // content_manager → admin do MP CRM (edição de conteúdo)
    if ((role as any) === "content_manager") {
      return <Navigate to="/crm" replace />;
    }
    // accountant → portal de contabilidade dedicado
    if ((role as any) === "accountant") {
      return <Navigate to="/contabilidade" replace />;
    }
    // Preferência opcional: admin/manager pode forçar entrada direta na vista compacta
    try {
      const prefersCamarim =
        typeof window !== "undefined" &&
        localStorage.getItem("camarim_team_default_landing") === "1";
      if (prefersCamarim && hasPermission("camarim_team")) {
        return <Navigate to="/camarim-equipa" replace />;
      }
    } catch {}
    return <Navigate to="/" replace />;
  }
  return <Auth />;
}

function AccountantGate() {
  const { user, loading, role, isAdmin } = useAuth();
  if (loading || (user && role === null)) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><p className="text-muted-foreground">A carregar…</p></div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  const isAccountant = (role as any) === "accountant";
  if (!isAccountant && !isAdmin && (role as any) !== "platform_admin") {
    return <Navigate to="/" replace />;
  }
  return <AccountantHome />;
}

export default App;

