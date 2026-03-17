import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, ClipboardList } from "lucide-react";
import ReportDRE from "@/components/ReportDRE";
import PaymentListsTab from "@/components/PaymentListsTab";

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
          <TabsTrigger value="payment-lists" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Contas a Pagar do Dia</span>
            <span className="sm:hidden">Contas a Pagar</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dre" className="mt-4">
          <ReportDRE />
        </TabsContent>

        <TabsContent value="payment-lists" className="mt-4">
          <PaymentListsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
