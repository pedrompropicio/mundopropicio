import PaymentListsTab from "@/components/PaymentListsTab";

export default function ReportPaymentListsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Listas de Pagamento</h1>
        <p className="text-sm text-muted-foreground">Gerencie e acompanhe listas de pagamento</p>
      </div>
      <PaymentListsTab />
    </div>
  );
}
