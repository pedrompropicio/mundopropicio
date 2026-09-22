import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider, useIsMutating, useQueryClient } from "@tanstack/react-query";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useGlobalModalScrollLock } from "@/hooks/useGlobalModalScrollLock";
import { useIsMobile } from "@/hooks/use-mobile";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
// Logo agora vem de BrandedLogo (suporta multi-empresa)
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";
import { ApprovedPaymentListReminder } from "@/components/ApprovedPaymentListReminder";
import { PWAUpdateManager } from "@/components/PWAUpdateManager";
import ScrollToTop from "@/components/ScrollToTop";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { CompanyBrandingProvider } from "@/contexts/CompanyBrandingContext";
import { HelpPanelProvider } from "@/contexts/HelpPanelContext";
import HelpSidePanel from "@/components/help/HelpSidePanel";
import HelpFloatingButton from "@/components/help/HelpFloatingButton";
import { ConfirmMetaActionProvider } from "@/components/crm/ConfirmMetaActionDialog";
import { useCompany } from "@/hooks/useCompany";
import { BrandedLogo } from "@/components/BrandedLogo";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { ModuleSwitcherButton } from "@/components/ModuleSwitcherButton";
import { MfaRequiredGate } from "@/components/MfaRequiredGate";
import { AppSidebar } from "@/components/AppSidebar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sun, Moon, Menu } from "lucide-react";
import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Eager: só o "shell" (ecrãs de entrada + layouts + guardas). Todo o resto é
// carregado a pedido via React.lazy — ver
// .lovable/memory/features/build-code-splitting.md
// ---------------------------------------------------------------------------
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Unsubscribe from "./pages/Unsubscribe";
import AcceptInvitation from "./pages/AcceptInvitation";
import ModuleSelector from "./pages/ModuleSelector";
import PostLoginRedirect from "./components/PostLoginRedirect";
import Reports from "./pages/Reports";
import OperacaoLayout from "./pages/operacao/OperacaoLayout";
import { AudienceLayout } from "./components/layout/AudienceLayout";
import { AudiencePrintGuard } from "./components/layout/AudiencePrintGuard";
import { CrmLayout } from "./components/layout/CrmLayout";
import { PartnerLayout } from "./components/PartnerLayout";

// --- Lazy: ERP ---
const Events = lazy(() => import("./pages/Events"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const EventSimulator = lazy(() => import("./pages/EventSimulator"));
const EventSimulatorDemo = lazy(() => import("./pages/EventSimulatorDemo"));
const Transactions = lazy(() => import("./pages/Transactions"));
const IvaManagement = lazy(() => import("./pages/IvaManagement"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Quotations = lazy(() => import("./pages/Quotations"));
const AccountCategories = lazy(() => import("./pages/AccountCategories"));
const FinancialAccounts = lazy(() => import("./pages/FinancialAccounts"));
const BankReconciliation = lazy(() => import("./pages/BankReconciliation"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const LegalPrivacy = lazy(() => import("./pages/legal/Privacy"));
const LegalTerms = lazy(() => import("./pages/legal/Terms"));
const LegalAbout = lazy(() => import("./pages/legal/About"));
const EventCalendar = lazy(() => import("./pages/EventCalendar"));

// --- Lazy: relatórios ---
const ReportDREPage = lazy(() => import("./pages/ReportDREPage"));
const ReportDREEmpresarialPage = lazy(() => import("./pages/ReportDREEmpresarialPage"));
const ReportDREBrasilPage = lazy(() => import("./pages/ReportDREBrasilPage"));
const ReportPLPage = lazy(() => import("./pages/ReportPLPage"));
const ReportBankStatementPage = lazy(() => import("./pages/ReportBankStatementPage"));
const ReportCashFlowPage = lazy(() => import("./pages/ReportCashFlowPage"));
const ReportContasPagarPage = lazy(() => import("./pages/ReportContasPagarPage"));
const ReportPaymentListsPage = lazy(() => import("./pages/ReportPaymentListsPage"));
const ReportSuppliersPage = lazy(() => import("./pages/ReportSuppliersPage"));
const ReportAccountCategoriesPage = lazy(() => import("./pages/ReportAccountCategoriesPage"));
const ReportMovementReconciliationPage = lazy(() => import("./pages/ReportMovementReconciliationPage"));
const ReportTicketOfficeAuditPage = lazy(() => import("./pages/ReportTicketOfficeAuditPage"));
const ReportArtistCachePage = lazy(() => import("./pages/ReportArtistCachePage"));
const ReportDocumentPendenciesPage = lazy(() => import("./pages/ReportDocumentPendenciesPage"));
const ReportAccountingExportPage = lazy(() => import("./pages/ReportAccountingExportPage"));
const ReportPartnerExpensesPage = lazy(() => import("./pages/ReportPartnerExpensesPage"));
const ReportBPTransactionsPage = lazy(() => import("./pages/ReportBPTransactionsPage"));
const ReportForecastPayablesPage = lazy(() => import("./pages/ReportForecastPayablesPage"));
const ReportProfitabilityPage = lazy(() => import("./pages/ReportProfitabilityPage"));
const ReportMonthlyEvolutionPage = lazy(() => import("./pages/ReportMonthlyEvolutionPage"));
const ReportBudgetDeviationPage = lazy(() => import("./pages/ReportBudgetDeviationPage"));
const ReportAgingPage = lazy(() => import("./pages/ReportAgingPage"));
const ReportSupplierConcentrationPage = lazy(() => import("./pages/ReportSupplierConcentrationPage"));
const ReportTreasuryProjectionPage = lazy(() => import("./pages/ReportTreasuryProjectionPage"));
const ReportOccupancyRatePage = lazy(() => import("./pages/ReportOccupancyRatePage"));
const ReportSalesCurvePage = lazy(() => import("./pages/ReportSalesCurvePage"));
const ReportDailySalesPage = lazy(() => import("./pages/ReportDailySalesPage"));
const ReportSalesComparisonPage = lazy(() => import("./pages/ReportSalesComparisonPage"));
const ReportRevenueMixPage = lazy(() => import("./pages/ReportRevenueMixPage"));
const ReportPartnerSettlementPage = lazy(() => import("./pages/ReportPartnerSettlementPage"));
const ReportPendencyIndexPage = lazy(() => import("./pages/ReportPendencyIndexPage"));
const ReportIvaAuditPage = lazy(() => import("./pages/ReportIvaAuditPage"));

// --- Lazy: administração ---
const DatabaseBackups = lazy(() => import("./pages/DatabaseBackups"));
const RecurringTransactions = lazy(() => import("./pages/RecurringTransactions"));
const SecurityDashboard = lazy(() => import("./pages/SecurityDashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const AuditoriaContas = lazy(() => import("./pages/AuditoriaContas"));
const FormalidadeAudit = lazy(() => import("./pages/FormalidadeAudit"));
const ReconciliacaoBpTx = lazy(() => import("./pages/ReconciliacaoBpTx"));
const Companies = lazy(() => import("./pages/admin/Companies"));
const Reminders = lazy(() => import("./pages/admin/Reminders"));
const RlsLegacyAudit = lazy(() => import("./pages/admin/RlsLegacyAudit"));
const ManualSync = lazy(() => import("./pages/admin/ManualSync"));
const ManualGaps = lazy(() => import("./pages/admin/ManualGaps"));
const InvoiceGroupAudit = lazy(() => import("./pages/admin/InvoiceGroupAudit"));
const InvariantMonitor = lazy(() => import("./pages/admin/InvariantMonitor"));
const UploadCoalaFotos = lazy(() => import("./pages/admin/UploadCoalaFotos"));
const CoalaSync = lazy(() => import("./pages/admin/CoalaSync"));
const FeverSync = lazy(() => import("./pages/admin/FeverSync"));
const TicketlineSync = lazy(() => import("./pages/admin/TicketlineSync"));
const BolSync = lazy(() => import("./pages/admin/BolSync"));
const SyncHealth = lazy(() => import("./pages/admin/SyncHealth"));
const Notifications = lazy(() => import("./pages/admin/Notifications"));
const DiagnosisTest = lazy(() => import("./pages/admin/DiagnosisTest"));
const IbanDuplicates = lazy(() => import("./pages/admin/IbanDuplicates"));
const AuditDownloads = lazy(() => import("./pages/admin/AuditDownloads"));
const TrashPage = lazy(() => import("./pages/Trash"));
const UserActivityLog = lazy(() => import("./pages/UserActivityLog"));
const EventImplementations = lazy(() => import("./pages/EventImplementations"));
const EventImplementationDetail = lazy(() => import("./pages/EventImplementationDetail"));

// --- Lazy: bilheteira, vendas, camarim, cartões ---
const TicketOffices = lazy(() => import("./pages/TicketOffices"));
const SalesBI = lazy(() => import("./pages/SalesBI"));
const SalesBIDetail = lazy(() => import("./pages/SalesBIDetail"));
const SalesBIEvent = lazy(() => import("./pages/SalesBIEvent"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const Reimbursements = lazy(() => import("./pages/Reimbursements"));
const StandaloneInvoiceScanner = lazy(() => import("./pages/StandaloneInvoiceScanner"));
const AdsInvoices = lazy(() => import("./pages/AdsInvoices"));
const AccountantPendencies = lazy(() => import("./pages/AccountantPendencies"));
const Camarim = lazy(() => import("./pages/Camarim"));
const CamarimSessionDetail = lazy(() => import("./pages/CamarimSessionDetail"));
const CamarimEquipa = lazy(() => import("./pages/CamarimEquipa"));
const CardSessions = lazy(() => import("./pages/CardSessions"));
const CardSessionDetail = lazy(() => import("./pages/CardSessionDetail"));
const CartaoEquipa = lazy(() => import("./pages/CartaoEquipa"));
const UserSettings = lazy(() => import("./pages/UserSettings"));
const AccountantHome = lazy(() => import("./pages/contabilidade/AccountantHome"));

// --- Lazy: Operação ---
const FrenteDetail = lazy(() => import("./pages/operacao/FrenteDetail"));
const EtapaDetail = lazy(() => import("./pages/operacao/EtapaDetail"));
const MeusChamados = lazy(() => import("./pages/operacao/MeusChamados"));
const EtapasList = lazy(() => import("./pages/operacao/EtapasList"));
const ZonasList = lazy(() => import("./pages/operacao/ZonasList"));
const ChamadosList = lazy(() => import("./pages/operacao/ChamadosList"));
const ChamadoNovo = lazy(() => import("./pages/operacao/ChamadoNovo"));
const ChamadoDetail = lazy(() => import("./pages/operacao/ChamadoDetail"));
const Atividade = lazy(() => import("./pages/operacao/Atividade"));
const MinhasTarefas = lazy(() => import("./pages/operacao/MinhasTarefas"));
const StaffList = lazy(() => import("./pages/operacao/StaffList"));
const PessoaDetail = lazy(() => import("./pages/operacao/PessoaDetail"));
const EquipaView = lazy(() => import("./pages/operacao/EquipaView"));
const AcceptInvite = lazy(() => import("./pages/operacao/AcceptInvite"));
const OperacaoOnboarding = lazy(() => import("./pages/operacao/Onboarding"));
const OperacaoHome = lazy(() => import("./pages/operacao/OperacaoHome"));
const CampoView = lazy(() => import("./pages/operacao/CampoView"));
const OperacaoDashboard = lazy(() => import("./pages/operacao/Dashboard"));
const FrenteManage = lazy(() => import("./pages/operacao/FrenteManage"));
const EventHub = lazy(() => import("./pages/operacao/EventHub"));

// --- Lazy: MP Audience (crm/*) ---
const CrmConnections = lazy(() => import("./pages/crm/Connections"));
const CrmCampaigns = lazy(() => import("./pages/crm/Campaigns"));
const CrmPixels = lazy(() => import("./pages/crm/Pixels"));
const CrmInsights = lazy(() => import("./pages/crm/Insights"));
const CrmAdAccounts = lazy(() => import("./pages/crm/AdAccounts"));
const CrmSetup = lazy(() => import("./pages/crm/Setup"));
const CrmStrategies = lazy(() => import("./pages/crm/Strategies"));
const CrmStrategyNew = lazy(() => import("./pages/crm/StrategyNew"));
const CrmStrategyRedesign = lazy(() => import("./pages/crm/StrategyRedesign"));
const CrmStrategyNewDesign = lazy(() => import("./pages/crm/StrategyNewDesign"));
const CrmStrategyView = lazy(() => import("./pages/crm/StrategyView"));
const CrmStrategyPrint = lazy(() => import("./pages/crm/StrategyPrint"));
const AudiencePrint = lazy(() => import("@/pages/crm/AudiencePrint"));
const CrmCreatives = lazy(() => import("./pages/crm/Creatives"));
const CrmCreativeNew = lazy(() => import("./pages/crm/CreativeNew"));
const CrmCreativeView = lazy(() => import("./pages/crm/CreativeView"));
const CrmCampaignView = lazy(() => import("./pages/crm/CampaignView"));
const CrmCampaignFromScratch = lazy(() => import("./pages/crm/CampaignFromScratch"));
const CrmDuelView = lazy(() => import("./pages/crm/DuelView"));
const CrmAudit = lazy(() => import("./pages/crm/Audit"));
const CrmFunnelTest = lazy(() => import("./pages/crm/FunnelTest"));
const AudienceGoogleAds = lazy(() => import("./pages/audience/AudienceGoogleAds"));

// --- Lazy: MP CRM (crm-admin/*) ---
const CrmDashboard = lazy(() => import("./pages/crm-admin/CrmDashboard"));
const ContactosList = lazy(() => import("./pages/crm-admin/contactos/ContactosList"));
const LeadsList = lazy(() => import("./pages/crm-admin/leads/LeadsList"));
const AudiencesList = lazy(() => import("./pages/crm-admin/audiences/AudiencesList"));
const AudienceNew = lazy(() => import("./pages/crm-admin/audiences/AudienceNew"));
const AudienceEditor = lazy(() => import("./pages/crm-admin/audiences/AudienceEditor"));
const EventosList = lazy(() => import("./pages/crm-admin/eventos/EventosList"));
const EventMarketingEditor = lazy(() => import("./pages/crm-admin/eventos/EventMarketingEditor"));
const NewEventoPage = lazy(() => import("./pages/crm-admin/eventos/NewEventoPage"));
const EndossarEventoPage = lazy(() => import("./pages/crm-admin/eventos/EndossarEventoPage"));
const EndorsementEditor = lazy(() => import("./pages/crm-admin/eventos/EndorsementEditor"));
const BlogList = lazy(() => import("./pages/crm-admin/blog/BlogList"));
const BlogEditor = lazy(() => import("./pages/crm-admin/blog/BlogEditor"));
const PaginasList = lazy(() => import("./pages/crm-admin/paginas/PaginasList"));
const PaginaEditor = lazy(() => import("./pages/crm-admin/paginas/PaginaEditor"));
const VideosList = lazy(() => import("./pages/crm-admin/videos/VideosList"));
const PressList = lazy(() => import("./pages/crm-admin/press/PressList"));
const PortalSettings = lazy(() => import("./pages/crm-admin/portal-settings/PortalSettings"));
const MetaCapiMonitor = lazy(() => import("./pages/crm-admin/meta-capi/MetaCapiMonitor"));
const MetaAudiencesList = lazy(() => import("./pages/crm-admin/meta-audiences/MetaAudiencesList"));
const CustomerMatchUpload = lazy(() => import("./pages/crm-admin/meta-audiences/CustomerMatchUpload"));
const GoogleAdsAdmin = lazy(() => import("./pages/crm-admin/google-ads/GoogleAdsAdmin"));

/** Mesmo aspecto do "A carregar…" do ProtectedLayout. */
function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-muted-foreground">A carregar…</p>
    </div>
  );
}

const FULL_WIDTH_ROUTES = ["/transacoes"];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function MobileNavSheet() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu de navegação"
          className="md:hidden shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-sidebar-accent md:h-9 md:w-9"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[17rem] px-0 pb-0 pt-[max(1.5rem,calc(env(safe-area-inset-top)+1rem))]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navegação</SheetTitle>
        </SheetHeader>
        <AppSidebar variant="panel" onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function ProtectedLayout() {
  const { user, loading, isPartner, isAdmin, isManager, hasPermission, role, signOut } = useAuth();
  const { companyId, isLoading: companyLoading, isError: companyError, error: companyErrorObj, isPlatformAdmin, refetch: refetchCompany } = useCompany();
  const queryClient = useQueryClient();
  const previousCompanyIdRef = useRef<string | null>(null);
  const isMobileViewport = useIsMobile();
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
    <HelpPanelProvider>
    <div className="flex min-h-screen flex-col">
      <ApprovedPaymentListReminder />
      <header
        className="fixed top-0 left-0 right-0 z-50 flex w-full items-center justify-between gap-1 md:gap-2 overflow-hidden border-b border-border bg-sidebar shadow-sm px-2 md:px-4 lg:px-6"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          height: "calc(3.5rem + env(safe-area-inset-top))",
        }}
      >
        <div className="flex shrink-0 items-center gap-1">
          <MobileNavSheet />
          {/* Em < md o logótipo sai do cabeçalho; a marca fica no menu lateral */}
          <BrandedLogo className="hidden md:block h-9 object-contain object-left" />
        </div>
        {/* Em < md o seletor de empresa cresce e mantém o nome legível */}
        <div className="flex flex-1 min-w-[150px] items-center md:hidden">
          <CompanySwitcher className="w-full min-w-0 max-w-none" />
        </div>
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <div className="hidden md:block">
            <ModuleSwitcherButton />
          </div>
          <div className="hidden md:block">
            <CompanySwitcher />
          </div>
          <GlobalSearch />
          <div className="md:hidden">
            <ModuleSwitcherButton />
          </div>
          <NotificationBell />
          {/* Em < sm o tema sai do cabeçalho; fica no menu lateral, junto a Preferências */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="flex" style={{ paddingTop: "calc(3.5rem + env(safe-area-inset-top))" }}>
        {!isMobileViewport && <AppSidebar />}
        <main className="min-w-0 flex-1 pl-0 md:pl-16 lg:pl-56">
          <div className={cn("mx-auto p-4 lg:p-6", FULL_WIDTH_ROUTES.some(r => location.pathname === r || location.pathname.startsWith(r + "/")) ? "max-w-none" : "max-w-7xl")}>
            {/* MFA gate temporariamente desativado — reativar envolvendo <Routes> com <MfaRequiredGate> */}
            <Suspense fallback={<RouteFallback />}>
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
              <Route path="/conciliacao-bancaria" element={<BankReconciliation />} />

              <Route path="/fornecedores" element={<Suppliers />} />
              <Route path="/cotacoes" element={<Quotations />} />
              <Route path="/bilhetes" element={<Navigate to="/bilheteiras" replace />} />
              <Route path="/bilheteiras" element={<TicketOffices />} />
              <Route path="/vendas" element={<SalesBI />} />
              <Route path="/vendas/:groupId" element={<SalesBIDetail />} />
              <Route path="/vendas/:groupId/:eventId" element={<SalesBIEvent />} />
              <Route path="/iva" element={<IvaManagement />} />
              <Route path="/recorrentes" element={<RecurringTransactions />} />
              <Route path="/reembolsos" element={<Reimbursements />} />
              <Route path="/scanner-faturas" element={<StandaloneInvoiceScanner />} />
              <Route path="/faturas-plataformas" element={<AdsInvoices />} />
              <Route path="/pendencias-contabilista" element={<AccountantPendencies />} />
              <Route path="/ajuda" element={<HelpCenter />} />
              <Route path="/camarim" element={<Camarim />} />
              <Route path="/camarim/:id" element={<CamarimSessionDetail />} />
              <Route path="/cartoes" element={<CardSessions />} />
              <Route path="/cartoes/:id" element={<CardSessionDetail />} />
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
                <Route path="vendas-diarias" element={<ReportDailySalesPage />} />
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
              <Route path="/admin/sincronizar-manual" element={<ManualSync />} />
              <Route path="/admin/lacunas-manual" element={<ManualGaps />} />
              <Route path="/admin/auditoria-grupos-fatura" element={<InvoiceGroupAudit />} />
              <Route path="/admin/invariantes" element={<InvariantMonitor />} />
              <Route path="/admin/invariantes-diarias" element={<Navigate to="/admin/invariantes" replace />} />
              <Route path="/admin/upload-coala-fotos" element={<UploadCoalaFotos />} />
              <Route path="/admin/sync-health" element={<SyncHealth />} />
              <Route path="/admin/sync-coala" element={<CoalaSync />} />
              <Route path="/admin/fever-sync" element={<FeverSync />} />
              <Route path="/admin/ticketline-sync" element={<TicketlineSync />} />
              <Route path="/admin/bol-sync" element={<BolSync />} />
              <Route path="/admin/notifications" element={<Notifications />} />
              <Route path="/admin/diagnosis-test" element={<DiagnosisTest />} />
              <Route path="/admin/iban-duplicados" element={<IbanDuplicates />} />
              <Route path="/admin/audit-downloads" element={<AuditDownloads />} />


              <Route path="/perfil" element={<UserSettings />} />
            </Routes>
            </Suspense>
          </div>
        </main>
      </div>
      <HelpFloatingButton />
      <HelpSidePanel />
    </div>
    </HelpPanelProvider>
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
          <PWAUpdateManager />
          <AuthProvider>
            <CompanyBrandingProvider>
              <ConfirmMetaActionProvider>
              <BrowserRouter>
                <ScrollToTop />
                <Suspense fallback={<RouteFallback />}>
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
                  <Route path="/cartao-equipa" element={<CartaoEquipa />} />
                  <Route path="/contabilidade" element={<AccountantGate />} />
                  <Route path="/parceiro/*" element={<PartnerLayout />} />

                  <Route path="/audience" element={<AudienceLayout />}>
                    <Route index element={<Navigate to="/audience/dashboard" replace />} />
                    <Route path="dashboard" element={<CrmCampaigns />} />
                    <Route path="campaigns/new" element={<CrmCampaignFromScratch />} />
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
                    <Route path="duels/:duel_id" element={<CrmDuelView />} />
                    <Route path="creatives" element={<CrmCreatives />} />
                    <Route path="creatives/new" element={<CrmCreativeNew />} />
                    <Route path="creatives/:id" element={<CrmCreativeView />} />
                    <Route path="google-ads" element={<AudienceGoogleAds />} />
                    <Route path="audit/funnel-test" element={<CrmFunnelTest />} />
                    <Route path="audit/:contextType/:contextId" element={<CrmAudit />} />
                    <Route path="audit/:contextType" element={<CrmAudit />} />
                  </Route>
                  {/* #216: fora do AudienceLayout (a impressão não tolera o chrome),
                      mas com a MESMA guarda de sessão/role via AudiencePrintGuard. */}
                  <Route element={<AudiencePrintGuard />}>
                    <Route path="/audience/strategies/:id/print" element={<CrmStrategyPrint />} />
                    <Route path="/audience/print/:type" element={<AudiencePrint />} />
                  </Route>
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
                    <Route path="meta-audiences/upload" element={<CustomerMatchUpload />} />
                    <Route path="google-ads" element={<GoogleAdsAdmin />} />
                  </Route>
                  <Route path="/*" element={<ProtectedLayout />} />
                </Routes>
                </Suspense>
              </BrowserRouter>
              </ConfirmMetaActionProvider>
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

