import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import logoMundoPropicio from "@/assets/logo-horizontal.png";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
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
import TicketManagement from "./pages/TicketManagement";
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
import DatabaseBackups from "./pages/DatabaseBackups";
import RecurringTransactions from "./pages/RecurringTransactions";
import SecurityDashboard from "./pages/SecurityDashboard";
import AdminPanel from "./pages/AdminPanel";
import Unsubscribe from "./pages/Unsubscribe";
import TicketOffices from "./pages/TicketOffices";
import HelpCenter from "./pages/HelpCenter";
import FloatingHelpButton from "./components/FloatingHelpButton";
import NotFound from "./pages/NotFound";


const queryClient = new QueryClient();

function ProtectedLayout() {
  const { user, loading } = useAuth();

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

  useInactivityTimeout();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-sidebar px-4 lg:px-6">
        <img
          src={logoMundoPropicio}
          alt="Mundo Propício Entretenimento"
          className="h-9 object-contain"
        />
        <div className="flex items-center gap-2">
          <GlobalSearch />
          <NotificationBell />
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
              <Route path="/bilhetes" element={<TicketManagement />} />
              <Route path="/bilheteiras" element={<TicketOffices />} />
              <Route path="/iva" element={<IvaManagement />} />
              <Route path="/recorrentes" element={<RecurringTransactions />} />
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
              </Route>
              
              
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/admin/utilizadores" element={<UserManagement />} />
              <Route path="/admin/backups" element={<DatabaseBackups />} />
              <Route path="/admin/seguranca" element={<SecurityDashboard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <FloatingHelpButton />
          </div>
        </main>
      </div>
    </div>
  );
}

const App = () => (
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
            <Route path="/*" element={<ProtectedLayout />} />
            <Route path="/*" element={<ProtectedLayout />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

export default App;
