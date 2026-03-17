import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, TrendingUp, TrendingDown, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function AccountCategories() {
  const [isOpen, setIsOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (cat: { code: string; name: string; type: string }) => {
      const { error } = await supabase.from("account_categories").insert(cat);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-categories"] });
      setIsOpen(false);
      toast.success("Conta criada com sucesso");
    },
    onError: () => toast.error("Erro ao criar conta"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("account_categories").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["account-categories"] }),
  });

  const filtered = typeFilter === "all" ? categories : categories.filter((c) => c.type === typeFilter);
  const incomeCount = categories.filter((c) => c.type === "income").length;
  const expenseCount = categories.filter((c) => c.type === "expense").length;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      code: fd.get("code") as string,
      name: fd.get("name") as string,
      type: fd.get("type") as string,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Plano de Contas</h1>
          <p className="text-sm text-muted-foreground">Categorias de receitas e despesas</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground glow-primary">
              <Plus className="h-4 w-4" /> Nova Conta
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Conta</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-4 py-2">
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="code">Código *</Label>
                  <Input id="code" name="code" placeholder="R07" required />
                </div>
                <div className="col-span-2 grid gap-2">
                  <Label htmlFor="name">Descrição *</Label>
                  <Input id="name" name="name" required />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Tipo *</Label>
                <Select name="type" required>
                  <SelectTrigger><SelectValue placeholder="Receita ou Despesa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Receita</SelectItem>
                    <SelectItem value="expense">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <button type="submit" className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground">
                Criar Conta
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="flex gap-4">
        <div className="glass rounded-xl px-5 py-3 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-success" />
          <div>
            <p className="text-2xl font-bold">{incomeCount}</p>
            <p className="text-xs text-muted-foreground">Receitas</p>
          </div>
        </div>
        <div className="glass rounded-xl px-5 py-3 flex items-center gap-3">
          <TrendingDown className="h-5 w-5 text-warning" />
          <div>
            <p className="text-2xl font-bold">{expenseCount}</p>
            <p className="text-xs text-muted-foreground">Despesas</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "income", "expense"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              typeFilter === f ? "bg-primary text-primary-foreground glow-primary" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {f === "all" ? "Todas" : f === "income" ? "Receitas" : "Despesas"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">A carregar...</div>
      ) : (
        <div className="glass rounded-xl p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 text-left font-medium">Código</th>
                <th className="pb-3 text-left font-medium">Descrição</th>
                <th className="pb-3 text-center font-medium">Tipo</th>
                <th className="pb-3 text-center font-medium">Estado</th>
                <th className="pb-3 text-center font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filtered.map((c) => (
                <tr key={c.id} className={`hover:bg-secondary/20 transition-colors ${!c.is_active ? "opacity-50" : ""}`}>
                  <td className="py-3 pr-4 font-mono font-semibold">{c.code}</td>
                  <td className="py-3 pr-4 font-medium">{c.name}</td>
                  <td className="py-3 text-center">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.type === "income" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                    }`}>
                      {c.type === "income" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {c.type === "income" ? "Receita" : "Despesa"}
                    </span>
                  </td>
                  <td className="py-3 text-center text-xs">{c.is_active ? "Ativa" : "Inativa"}</td>
                  <td className="py-3 text-center">
                    <button
                      onClick={() => toggleActive.mutate({ id: c.id, is_active: !c.is_active })}
                      className="rounded p-1 hover:bg-secondary text-muted-foreground"
                      title={c.is_active ? "Desativar" : "Ativar"}
                    >
                      {c.is_active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}