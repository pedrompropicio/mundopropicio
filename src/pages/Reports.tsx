import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, ClipboardList, Receipt } from "lucide-react";
import ReportDRE from "@/components/ReportDRE";
import PaymentListsTab from "@/components/PaymentListsTab";
import ReportContasPagar from "@/components/ReportContasPagar";

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Relatórios & Consultas</h1>
        <p className="text-sm text-muted-foreground">Consulte relatórios financeiros e gerencie listas de pagamento</p>
      </div>

      <Tabs defaultValue="dre" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="dre" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Relatório DRE</span>
            <span className="sm:hidden">DRE</span>
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
