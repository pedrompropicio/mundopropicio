import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BrandedLogo } from "@/components/BrandedLogo";
import { PeriodSelector, PRESETS, type Period } from "./PeriodSelector";
import { AccountantDocumentsTab } from "./AccountantDocumentsTab";
import { AccountantReportsTab } from "./AccountantReportsTab";
import { AccountantSuppliersTab } from "./AccountantSuppliersTab";
import { LogOut } from "lucide-react";

export default function AccountantHome() {
  const { signOut } = useAuth();
  const [search, setSearch] = useSearchParams();
  const defaultPeriod = PRESETS[0].range();
  const [period, setPeriod] = useState<Period>(() => ({
    from: search.get("from") || defaultPeriod.from,
    to: search.get("to") || defaultPeriod.to,
  }));

  useEffect(() => {
    setSearch((s) => {
      s.set("from", period.from);
      s.set("to", period.to);
      return s;
    }, { replace: true });
  }, [period, setSearch]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-sidebar px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandedLogo />
          <div className="hidden md:block">
            <h1 className="text-base font-semibold">Portal Contabilidade</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CompanySwitcher />
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl p-4 lg:p-6">
        <Tabs defaultValue="documents" className="w-full">
          <TabsList>
            <TabsTrigger value="documents">Documentos</TabsTrigger>
            <TabsTrigger value="standalone">Faturas Avulsas</TabsTrigger>
            <TabsTrigger value="reports">Relatórios</TabsTrigger>
            <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
          </TabsList>
          <TabsContent value="documents" className="mt-4">
            <AccountantDocumentsTab period={period} />
          </TabsContent>
          <TabsContent value="standalone" className="mt-4">
            <AccountantStandaloneInvoicesTab />
          </TabsContent>
          <TabsContent value="reports" className="mt-4">
            <AccountantReportsTab />
          </TabsContent>
          <TabsContent value="suppliers" className="mt-4">
            <AccountantSuppliersTab period={period} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t bg-muted/30 px-4 lg:px-6 py-3 flex items-center justify-between">
        <Badge variant="secondary">Acesso de Contabilista — Read Only</Badge>
        <Button size="sm" variant="ghost" onClick={() => signOut()}>
          <LogOut className="h-4 w-4 mr-1.5" /> Sair
        </Button>
      </footer>
    </div>
  );
}
