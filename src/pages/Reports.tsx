import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, ClipboardList, Receipt, TrendingUp, Landmark } from "lucide-react";
import ReportDRE from "@/components/ReportDRE";
import ReportPL from "@/components/ReportPL";
import PaymentListsTab from "@/components/PaymentListsTab";
import ReportContasPagar from "@/components/ReportContasPagar";
import ReportBankStatement from "@/components/ReportBankStatement";

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Relatórios & Consultas</h1>
        <p className="text-sm text-muted-foreground">Consulte relatórios financeiros e gerencie listas de pagamento</p>
      </div>

      <Tabs defaultValue="dre" className="w-full">
        <TabsList className="w-full justify-start flex-wrap">
          <TabsTrigger value="dre" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Relatório DRE</span>
            <span className="sm:hidden">DRE</span>
          </TabsTrigger>
          <TabsTrigger value="pl" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Relatório P&L</span>
            <span className="sm:hidden">P&L</span>
          </TabsTrigger>
          <TabsTrigger value="extrato" className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            <span className="hidden sm:inline">Extrato Bancário</span>
            <span className="sm:hidden">Extrato</span>
          </TabsTrigger>
          <TabsTrigger value="contas-pagar" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Contas a Pagar</span>
            <span className="sm:hidden">C. Pagar</span>
          </TabsTrigger>
          <TabsTrigger value="payment-lists" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Listas de Pagamento</span>
            <span className="sm:hidden">Listas</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dre" className="mt-4">
          <ReportDRE />
        </TabsContent>

        <TabsContent value="pl" className="mt-4">
          <ReportPL />
        </TabsContent>

        <TabsContent value="extrato" className="mt-4">
          <ReportBankStatement />
        </TabsContent>

        <TabsContent value="contas-pagar" className="mt-4">
          <ReportContasPagar />
        </TabsContent>

        <TabsContent value="payment-lists" className="mt-4">
          <PaymentListsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
