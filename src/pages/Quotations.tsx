import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/lib/mock-data";
import { SupplierFormModal } from "@/components/SupplierFormModal";

export default function Quotations() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const queryClient = useQueryClient();

  const { data: quotations = [], isLoading } = useQuery({
    queryKey: ["quotations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("*, suppliers(name), events(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (q: {
      event_id: string; supplier_id: string; description: string;
      amount: number; iva_rate: number; valid_until?: string; notes?: string;
    }) => {
      const { error } = await supabase.from("quotations").insert(q);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      setIsOpen(false);
      toast.success("Cotação criada com sucesso");
    },
    onError: () => toast.error("Erro ao criar cotação"),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("quotations").update({ status }).eq("id", id);
      if (error) throw error;

      // When approved, create a transaction from the quotation
      if (status === "approved") {
        const quotation = quotations.find((q) => q.id === id);
        if (quotation) {
          const { error: txError } = await supabase.from("transactions").insert({
            event_id: quotation.event_id,
            supplier_id: quotation.supplier_id,
            description: quotation.description,
            amount: quotation.amount,
            iva_rate: quotation.iva_rate,
            type: "expense",
            date: new Date().toISOString().split("T")[0],
            status: "pending",
          });
          if (txError) throw txError;
        }
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(status === "approved" ? "Cotação aprovada e transação criada" : "Estado atualizado");
    },
  });

  const filtered = statusFilter === "all" ? quotations : quotations.filter((q) => q.status === statusFilter);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      event_id: fd.get("event_id") as string,
      supplier_id: fd.get("supplier_id") as string,
      description: fd.get("description") as string,
      amount: parseFloat(fd.get("amount") as string),
      iva_rate: parseInt(fd.get("iva_rate") as string),
      valid_until: (fd.get("valid_until") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  const statusColors: Record<string, string> = {
    pending: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
  };
  const statusLabels: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovada",
    rejected: "Rejeitada",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Cotações</h1>
          <p className="text-sm text-muted-foreground">Cotações de fornecedores por evento</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground glow-primary">
              <Plus className="h-4 w-4" /> Nova Cotação
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova Cotação</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label>Evento *</Label>
                <Select name="event_id" required>
                  <SelectTrigger><SelectValue placeholder="Selecionar evento" /></SelectTrigger>
                  <SelectContent>
                    {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Fornecedor *</Label>
                <Select name="supplier_id" required>
                  <SelectTrigger><SelectValue placeholder="Selecionar fornecedor" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Descrição *</Label>
                <Input id="description" name="description" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="amount">Valor (€) *</Label>
                  <Input id="amount" name="amount" type="number" step="0.01" required />
                </div>
                <div className="grid gap-2">
                  <Label>Taxa IVA</Label>
                  <Select name="iva_rate" defaultValue="23">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="23">23%</SelectItem>
                      <SelectItem value="13">13%</SelectItem>
                      <SelectItem value="6">6%</SelectItem>
                      <SelectItem value="0">Isento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="valid_until">Válida até</Label>
                <Input id="valid_until" name="valid_until" type="date" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
              <button type="submit" className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground">
                Criar Cotação
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2">
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              statusFilter === f ? "bg-primary text-primary-foreground glow-primary" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {f === "all" ? "Todas" : statusLabels[f]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">Nenhuma cotação encontrada</div>
      ) : (
        <div className="glass rounded-xl p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Fornecedor</th>
                  <th className="hidden pb-3 text-left font-medium sm:table-cell">Evento</th>
                  <th className="pb-3 text-left font-medium">Descrição</th>
                  <th className="hidden pb-3 text-center font-medium md:table-cell">IVA</th>
                  <th className="pb-3 text-right font-medium">Valor</th>
                  <th className="pb-3 text-center font-medium">Estado</th>
                  <th className="pb-3 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filtered.map((q) => (
                  <tr key={q.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{(q.suppliers as any)?.name}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{(q.events as any)?.name}</p>
                    </td>
                    <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">{(q.events as any)?.name}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{q.description}</td>
                    <td className="hidden py-3 text-center md:table-cell">
                      <span className="inline-flex h-6 w-10 items-center justify-center rounded bg-primary/15 text-xs font-bold text-primary">{q.iva_rate}%</span>
                    </td>
                    <td className="py-3 text-right font-mono font-semibold whitespace-nowrap">{formatCurrency(q.amount)}</td>
                    <td className="py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[q.status]}`}>
                        {statusLabels[q.status]}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      {q.status === "pending" && (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => updateStatus.mutate({ id: q.id, status: "approved" })} className="rounded p-1 hover:bg-success/20 text-success" title="Aprovar">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => updateStatus.mutate({ id: q.id, status: "rejected" })} className="rounded p-1 hover:bg-destructive/20 text-destructive" title="Rejeitar">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}