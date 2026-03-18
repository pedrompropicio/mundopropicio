import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, TrendingUp, TrendingDown, ToggleLeft, ToggleRight, ChevronRight, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface Category {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_active: boolean;
  event_required: boolean;
  supplier_required: boolean;
  children?: Category[];
}

function buildTree(categories: Category[]): Category[] {
  const map = new Map<string, Category>();
  const roots: Category[] = [];

  categories.forEach((c) => map.set(c.id, { ...c, children: [] }));

  categories.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function CategoryRow({
  cat,
  level,
  isAdmin,
  toggleActive,
  onEdit,
  onDelete,
  expanded,
  onToggleExpand,
}: {
  cat: Category;
  level: number;
  isAdmin: boolean;
  toggleActive: (args: { id: string; is_active: boolean }) => void;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  const hasChildren = cat.children && cat.children.length > 0;
  const isExpanded = expanded.has(cat.id);
  const isLeaf = !hasChildren;
  const indent = level * 24;

  return (
    <>
      <tr className={`hover:bg-secondary/20 transition-colors ${!cat.is_active ? "opacity-50" : ""}`}>
        <td className="py-2.5 pr-4" style={{ paddingLeft: `${indent + 12}px` }}>
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <button
                onClick={() => onToggleExpand(cat.id)}
                className="rounded p-0.5 hover:bg-secondary text-muted-foreground"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <span className={`font-mono text-xs ${level === 0 ? "font-bold text-foreground" : level === 1 ? "font-semibold text-foreground/90" : "text-muted-foreground"}`}>
              {cat.code}
            </span>
          </div>
        </td>
        <td className={`py-2.5 pr-4 ${level === 0 ? "font-bold" : level === 1 ? "font-semibold" : "font-medium"}`}>
          {cat.name}
        </td>
        <td className="py-2.5 text-center">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            cat.type === "income" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
          }`}>
            {cat.type === "income" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {cat.type === "income" ? "Receita" : "Despesa"}
          </span>
        </td>
        <td className="py-2.5 text-center text-xs">{cat.is_active ? "Ativa" : "Inativa"}</td>
        <td className="py-2.5 text-center">
          <div className="flex items-center justify-center gap-1">
            {isLeaf && (
              <button
                onClick={() => toggleActive({ id: cat.id, is_active: !cat.is_active })}
                className="rounded p-1 hover:bg-secondary text-muted-foreground"
                title={cat.is_active ? "Desativar" : "Ativar"}
              >
                {cat.is_active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4" />}
              </button>
            )}
            {isAdmin && (
              <>
                <button
                  onClick={() => onEdit(cat)}
                  className="rounded p-1 hover:bg-secondary text-muted-foreground"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {isLeaf && (
                  <button
                    onClick={() => onDelete(cat)}
                    className="rounded p-1 hover:bg-secondary text-destructive/70 hover:text-destructive"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
      {hasChildren && isExpanded &&
        cat.children!.map((child) => (
          <CategoryRow
            key={child.id}
            cat={child}
            level={level + 1}
            isAdmin={isAdmin}
            toggleActive={toggleActive}
            onEdit={onEdit}
            onDelete={onDelete}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
          />
        ))
      }
    </>
  );
}

export default function AccountCategories() {
  const { isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [deletingCat, setDeletingCat] = useState<Category | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["account-categories"] });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const tree = useMemo(() => {
    const filtered = typeFilter === "all" ? categories : categories.filter((c) => c.type === typeFilter);
    return buildTree(filtered as Category[]);
  }, [categories, typeFilter]);

  // Auto-expand all on first load
  useMemo(() => {
    if (categories.length > 0 && expanded.size === 0) {
      const allIds = new Set(categories.filter((c) => c.parent_id === null || categories.some((child) => child.parent_id === c.id)).map((c) => c.id));
      setExpanded(allIds);
    }
  }, [categories]);

  const createMutation = useMutation({
    mutationFn: async (cat: { code: string; name: string; type: string; parent_id?: string }) => {
      const { error } = await supabase.from("account_categories").insert(cat);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setIsOpen(false);
      toast.success("Conta criada com sucesso");
    },
    onError: () => toast.error("Erro ao criar conta"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, code, name }: { id: string; code: string; name: string }) => {
      const { error } = await supabase.from("account_categories").update({ code, name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditingCat(null);
      toast.success("Conta atualizada com sucesso");
    },
    onError: () => toast.error("Erro ao atualizar conta"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // First nullify any transaction/forecast references
      await supabase.from("transactions").update({ category_id: null }).eq("category_id", id);
      await supabase.from("event_forecasts").update({ category_id: null }).eq("category_id", id);
      const { error } = await supabase.from("account_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setDeletingCat(null);
      toast.success("Conta excluída com sucesso");
    },
    onError: (err: any) => toast.error("Erro ao excluir conta", { description: err.message }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("account_categories").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });

  const onToggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(categories.map((c) => c.id)));
  const collapseAll = () => setExpanded(new Set());

  const incomeCount = categories.filter((c) => c.type === "income").length;
  const expenseCount = categories.filter((c) => c.type === "expense").length;
  const leafCount = categories.filter((c) => !categories.some((child) => child.parent_id === c.id)).length;

  const parentOptions = categories.filter((c) => {
    const depth = c.code.split(".").length;
    return depth <= 2;
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parentId = fd.get("parent_id") as string;
    createMutation.mutate({
      code: fd.get("code") as string,
      name: fd.get("name") as string,
      type: fd.get("type") as string,
      parent_id: parentId || undefined,
    });
  };

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCat) return;
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: editingCat.id,
      code: fd.get("code") as string,
      name: fd.get("name") as string,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Plano de Contas</h1>
          <p className="text-sm text-muted-foreground">Estrutura hierárquica de 3 níveis · {leafCount} contas de detalhe</p>
        </div>
        {isAdmin && (
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
                    <Input id="code" name="code" placeholder="2.3.05" required />
                  </div>
                  <div className="col-span-2 grid gap-2">
                    <Label htmlFor="name">Descrição *</Label>
                    <Input id="name" name="name" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Tipo *</Label>
                    <Select name="type" required>
                      <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Receita</SelectItem>
                        <SelectItem value="expense">Despesa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Conta-Pai</Label>
                    <Select name="parent_id">
                      <SelectTrigger><SelectValue placeholder="Nenhuma (raiz)" /></SelectTrigger>
                      <SelectContent>
                        {parentOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} - {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <button type="submit" className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground">
                  Criar Conta
                </button>
              </form>
            </DialogContent>
          </Dialog>
        )}
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
      <div className="flex items-center justify-between">
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
        <div className="flex gap-2">
          <button onClick={expandAll} className="rounded-lg px-3 py-2 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80">
            Expandir tudo
          </button>
          <button onClick={collapseAll} className="rounded-lg px-3 py-2 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80">
            Recolher tudo
          </button>
        </div>
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
              {tree.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  cat={cat}
                  level={0}
                  isAdmin={isAdmin}
                  toggleActive={toggleActive.mutate}
                  onEdit={setEditingCat}
                  onDelete={setDeletingCat}
                  expanded={expanded}
                  onToggleExpand={onToggleExpand}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingCat} onOpenChange={(open) => !open && setEditingCat(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Conta</DialogTitle>
          </DialogHeader>
          {editingCat && (
            <form onSubmit={handleEditSubmit} className="grid gap-4 py-2">
              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-code">Código *</Label>
                  <Input id="edit-code" name="code" defaultValue={editingCat.code} required />
                </div>
                <div className="col-span-2 grid gap-2">
                  <Label htmlFor="edit-name">Descrição *</Label>
                  <Input id="edit-name" name="name" defaultValue={editingCat.name} required />
                </div>
              </div>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {updateMutation.isPending ? "A guardar…" : "Guardar Alterações"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingCat} onOpenChange={(open) => !open && setDeletingCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja excluir a conta <strong>{deletingCat?.code} - {deletingCat?.name}</strong>?
              Transações associadas perderão a referência a esta categoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCat && deleteMutation.mutate(deletingCat.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "A excluir…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
