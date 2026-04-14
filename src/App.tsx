import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import logoMundoPropicio from "@/assets/logo-horizontal.png";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { AppSidebar } from "@/components/AppSidebar";
import { Sun, Moon } from "lucide-react";
import Index from "./pages/Index";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import Transactions from "./pages/Transactions";
import IvaManagement from "./pages/IvaManagement";
import Suppliers from "./pages/Suppliers";
import Quotations from "./pages/Quotations";
import AccountCategories from "./pages/AccountCategories";
import FinancialAccounts from "./pages/FinancialAccounts";
import UserManagement from "./pages/UserManagement";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
// TicketManagement now embedded in TicketOffices module
import EventCalendar from "./pages/EventCalendar";
import Reports from "./pages/Reports";
import ReportDREPage from "./pages/ReportDREPage";
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
import RecurringTransactions from "./pages/RecurringTransactions";
import SecurityDashboard from "./pages/SecurityDashboard";
import AdminPanel from "./pages/AdminPanel";
import Unsubscribe from "./pages/Unsubscribe";
import TicketOffices from "./pages/TicketOffices";
import HelpCenter from "./pages/HelpCenter";
import Reimbursements from "./pages/Reimbursements";
import EventImplementations from "./pages/EventImplementations";
import EventImplementationDetail from "./pages/EventImplementationDetail";
import UserActivityLog from "./pages/UserActivityLog";

import TrashPage from "./pages/Trash";
import NotFound from "./pages/NotFound";
import { PartnerLayout } from "./components/PartnerLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedLayout() {
  const { user, loading, isPartner, signOut } = useAuth();

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

  // Partner users are redirected to their dedicated layout
  if (isPartner) {
    return <Navigate to="/parceiro" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-sidebar shadow-sm px-4 lg:px-6">
        <img
          src={logoMundoPropicio}
          alt="MP Gestão Eventos Entretenimento"
          className="h-9 object-contain"
        />
        <div className="flex items-center gap-2">
          <GlobalSearch />
          <NotificationBell />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex pt-14">
        <AppSidebar />
        <main className="flex-1 pl-16 lg:pl-56">
          <div className="mx-auto max-w-7xl p-4 lg:p-6">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/calendario" element={<EventCalendar />} />
              <Route path="/eventos" element={<Events />} />
              <Route path="/eventos/:id" element={<EventDetail />} />
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
              <Route path="/relatorios" element={<Reports />}>
                <Route index element={<Navigate to="/relatorios/dre" replace />} />
                <Route path="dre" element={<ReportDREPage />} />
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
              </Route>
              
              
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/utilizadores" element={<UserManagement />} />
              <Route path="/admin/backups" element={<DatabaseBackups />} />
              <Route path="/admin/seguranca" element={<SecurityDashboard />} />
              <Route path="/admin/lixeira" element={<TrashPage />} />
              <Route path="/admin/implantacao" element={<EventImplementations />} />
              <Route path="/admin/implantacao/:id" element={<EventImplementationDetail />} />
              <Route path="/admin/atividade" element={<UserActivityLog />} />
              <Route path="*" element={<NotFound />} />
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

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<AuthRoute />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/parceiro/*" element={<PartnerLayout />} />
              <Route path="/*" element={<ProtectedLayout />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

function AuthRoute() {
  const { user, loading, isPartner } = useAuth();
  if (loading) return null;
  // Don't redirect if user is in the middle of password recovery flow
  const isRecoveryFlow = sessionStorage.getItem("recovery_in_progress") === "true";
  if (user && !isRecoveryFlow) return <Navigate to={isPartner ? "/parceiro" : "/"} replace />;
  return <Auth />;
}

export default App;
