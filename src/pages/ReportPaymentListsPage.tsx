import PaymentListsTab from "@/components/PaymentListsTab";

export default function ReportPaymentListsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Listas de Pagamento</h1>
        <p className="text-sm text-muted-foreground">Gerencie e acompanhe listas de pagamento</p>
      </div>
      <PaymentListsTab />
    </div>
  );
}
