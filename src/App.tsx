import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/AppSidebar";
import Index from "./pages/Index";
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";
import Transactions from "./pages/Transactions";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex min-h-screen">
          <AppSidebar />
          <main className="flex-1 pl-16 lg:pl-56">
            <div className="mx-auto max-w-7xl p-4 lg:p-6">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/eventos" element={<Events />} />
                <Route path="/eventos/:id" element={<EventDetail />} />
                <Route path="/transacoes" element={<Transactions />} />
                <Route path="/relatorios" element={<Reports />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </main>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
