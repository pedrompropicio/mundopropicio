import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import Index from "./pages/Index";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import Transactions from "./pages/Transactions";
import Reports from "./pages/Reports";
import IvaManagement from "./pages/IvaManagement";
import Suppliers from "./pages/Suppliers";
import Quotations from "./pages/Quotations";
import AccountCategories from "./pages/AccountCategories";
import UserManagement from "./pages/UserManagement";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
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

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 pl-16 lg:pl-56">
        <div className="mx-auto max-w-7xl p-4 lg:p-6">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/eventos" element={<Events />} />
            <Route path="/eventos/:id" element={<EventDetail />} />
            <Route path="/transacoes" element={<Transactions />} />
            <Route path="/plano-contas" element={<AccountCategories />} />
            <Route path="/contas-pagar" element={<PaymentLists />} />
            <Route path="/fornecedores" element={<Suppliers />} />
            <Route path="/cotacoes" element={<Quotations />} />
            <Route path="/relatorios" element={<Reports />} />
            <Route path="/iva" element={<IvaManagement />} />
            <Route path="/utilizadores" element={<UserManagement />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
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
