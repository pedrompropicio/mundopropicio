import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, TrendingUp, TrendingDown, ToggleLeft, ToggleRight, ChevronRight, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";
import CategoryFormModal from "@/components/CategoryFormModal";

interface Category {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_active: boolean;
  event_required: boolean;
  children?: Category[];
}

function compareCategoryCodes(a: string, b: string) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
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
  const sortNodes = (nodes: Category[]) => {
    nodes.sort((a, b) => compareCategoryCodes(a.code, b.code));
    nodes.forEach((node) => {
      if (node.children?.length) sortNodes(node.children);
    });
  };
  sortNodes(roots);
  return roots;
}

function CategoryRow({
  cat, level, isAdmin, toggleActive, onEdit, onDelete, expanded, onToggleExpand,
}: {
  cat: Category; level: number; isAdmin: boolean;
  toggleActive: (args: { id: string; is_active: boolean }) => void;
  onEdit: (cat: Category) => void; onDelete: (cat: Category) => void;
  expanded: Set<string>; onToggleExpand: (id: string) => void;
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
              <button onClick={() => onToggleExpand(cat.id)} className="rounded p-0.5 hover:bg-secondary text-muted-foreground">
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
        {level === 0 && (
          <td className="py-2.5 text-center text-xs">
            <span className={cat.event_required ? "text-success" : "text-muted-foreground"}>{cat.event_required ? "Evento ✓" : "Evento ✗"}</span>
          </td>
        )}
        {level > 0 && <td className="py-2.5" />}
        <td className="py-2.5 text-center text-xs">{cat.is_active ? "Ativa" : "Inativa"}</td>
        <td className="py-2.5 text-center">
          <div className="flex items-center justify-center gap-1">
            {isLeaf && (
              <button onClick={() => toggleActive({ id: cat.id, is_active: !cat.is_active })} className="rounded p-1 hover:bg-secondary text-muted-foreground" title={cat.is_active ? "Desativar" : "Ativar"}>
                {cat.is_active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4" />}
              </button>
            )}
            {isAdmin && (
              <>
                <button onClick={() => onEdit(cat)} className="rounded p-1 hover:bg-secondary text-muted-foreground" title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {isLeaf && (
                  <button onClick={() => onDelete(cat)} className="rounded p-1 hover:bg-secondary text-destructive/70 hover:text-destructive" title="Excluir">
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
          <CategoryRow key={child.id} cat={child} level={level + 1} isAdmin={isAdmin} toggleActive={toggleActive} onEdit={onEdit} onDelete={onDelete} expanded={expanded} onToggleExpand={onToggleExpand} />
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
      const { data, error } = await supabase.from("account_categories").select("*");
      if (error) throw error;
      return data.sort((a, b) => compareCategoryCodes(a.code, b.code));
    },
  });

  const tree = useMemo(() => {
    const filtered = typeFilter === "all" ? categories : categories.filter((c) => c.type === typeFilter);
    return buildTree(filtered as Category[]);
  }, [categories, typeFilter]);

  useMemo(() => {
    if (categories.length > 0 && expanded.size === 0) {
      const allIds = new Set(categories.filter((c) => c.parent_id === null || categories.some((child) => child.parent_id === c.id)).map((c) => c.id));
      setExpanded(allIds);
    }
  }, [categories]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("transactions").update({ category_id: null }).eq("category_id", id);
      await supabase.from("event_forecasts").update({ category_id: null }).eq("category_id", id);
      const { error } = await supabase.from("account_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDeletingCat(null); toast.success("Conta excluída com sucesso"); },
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">Plano de Contas <HelpTooltip text={helpTexts.accountCategories} /></h1>
          <p className="text-sm text-muted-foreground">Estrutura hierárquica de 3 níveis · {leafCount} contas de detalhe</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground glow-primary"
          >
            <Plus className="h-4 w-4" /> Nova Conta
          </button>
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
                <th className="pb-3 text-center font-medium">Obrigatoriedade</th>
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

      {/* Create Modal */}
      <CategoryFormModal
        open={isOpen}
        onOpenChange={setIsOpen}
        onSuccess={() => invalidate()}
      />

      {/* Edit Modal */}
      <CategoryFormModal
        open={!!editingCat}
        onOpenChange={(open) => !open && setEditingCat(null)}
        editingCategory={editingCat}
        onSuccess={() => invalidate()}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingCat} onOpenChange={(open) => !open && setDeletingCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja excluir a conta <strong>{deletingCat?.code} {deletingCat?.name}</strong>?
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
