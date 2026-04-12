import React, { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_active: boolean;
  event_required: boolean;
}

interface CategoryFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, opens in edit mode */
  editingCategory?: Category | null;
  /** Called after successful create/edit with the category id */
  onSuccess?: (categoryId: string) => void;
  /** Pre-select parent when creating */
  defaultParentId?: string;
  /** Pre-select type when creating */
  defaultType?: "income" | "expense";
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

export default function CategoryFormModal({
  open,
  onOpenChange,
  editingCategory,
  onSuccess,
  defaultParentId,
  defaultType = "expense",
}: CategoryFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!editingCategory;

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>(defaultType);
  const [parentId, setParentId] = useState<string>("");
  const [eventRequired, setEventRequired] = useState(true);

  const { data: categories = [] } = useQuery({
    queryKey: ["account-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_categories").select("*");
      if (error) throw error;
      return data.sort((a, b) => compareCategoryCodes(a.code, b.code));
    },
  });

  // Build hierarchical list for parent selection (L1 and L2 only)
  const parentOptions = useMemo(() => {
    const items: { id: string; code: string; name: string; level: number; type: string; hasChildren: boolean }[] = [];
    const l1 = categories.filter(c => !c.parent_id).sort((a, b) => compareCategoryCodes(a.code, b.code));
    for (const cat1 of l1) {
      const children1 = categories.filter(c => c.parent_id === cat1.id);
      items.push({ id: cat1.id, code: cat1.code, name: cat1.name, level: 1, type: cat1.type, hasChildren: children1.length > 0 });
      const l2 = children1.sort((a, b) => compareCategoryCodes(a.code, b.code));
      for (const cat2 of l2) {
        const children2 = categories.filter(c => c.parent_id === cat2.id);
        items.push({ id: cat2.id, code: cat2.code, name: cat2.name, level: 2, type: cat2.type, hasChildren: children2.length > 0 });
      }
    }
    return items;
  }, [categories]);

  // Auto-suggest next code when parent changes
  const suggestedCode = useMemo(() => {
    if (!parentId || isEditing) return "";
    const parent = categories.find(c => c.id === parentId);
    if (!parent) return "";

    const siblings = categories
      .filter(c => c.parent_id === parentId)
      .map(c => {
        const parts = c.code.split(".");
        return parseInt(parts[parts.length - 1]) || 0;
      });

    const nextNum = siblings.length > 0 ? Math.max(...siblings) + 1 : 1;
    const padded = String(nextNum).padStart(2, "0");
    return `${parent.code}.${padded}`;
  }, [parentId, categories, isEditing]);

  // Reset form when opening
  useEffect(() => {
    if (open) {
      if (editingCategory) {
        setCode(editingCategory.code);
        setName(editingCategory.name);
        setType(editingCategory.type);
        setParentId(editingCategory.parent_id || "");
        setEventRequired(editingCategory.event_required);
      } else {
        setCode("");
        setName("");
        setType(defaultType);
        setParentId(defaultParentId || "");
        setEventRequired(true);
      }
    }
  }, [open, editingCategory, defaultParentId, defaultType]);

  // Apply suggested code
  useEffect(() => {
    if (suggestedCode && !isEditing) {
      setCode(suggestedCode);
    }
  }, [suggestedCode, isEditing]);

  // Auto-set type from parent
  useEffect(() => {
    if (parentId && !isEditing) {
      const parent = categories.find(c => c.id === parentId);
      if (parent) setType(parent.type);
    }
  }, [parentId, categories, isEditing]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("account_categories").insert({
        code,
        name,
        type,
        parent_id: parentId || null,
        event_required: !parentId ? eventRequired : true,
      }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["account-categories"] });
      queryClient.invalidateQueries({ queryKey: ["impl-categories"] });
      toast.success("Conta criada com sucesso");
      onOpenChange(false);
      onSuccess?.(id);
    },
    onError: (err: any) => toast.error("Erro ao criar conta: " + err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingCategory) return;
      const updateData: any = { code, name, type, parent_id: parentId || null };
      if (!parentId) updateData.event_required = eventRequired;
      const { error } = await supabase.from("account_categories").update(updateData).eq("id", editingCategory.id);
      if (error) throw error;
      return editingCategory.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["account-categories"] });
      queryClient.invalidateQueries({ queryKey: ["impl-categories"] });
      toast.success("Conta atualizada com sucesso");
      onOpenChange(false);
      onSuccess?.(id!);
    },
    onError: (err: any) => toast.error("Erro ao atualizar conta: " + err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      toast.error("Preencha código e descrição");
      return;
    }
    if (isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg z-[200]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Conta" : "Nova Conta"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          {/* Parent selector with full hierarchy */}
          <div className="grid gap-2">
            <Label>Conta-Pai</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhuma (raiz)" />
              </SelectTrigger>
              <SelectContent className="z-[250] max-h-[300px]">
                <SelectItem value="__none__" className="text-xs text-muted-foreground">
                  Nenhuma (raiz)
                </SelectItem>
                {parentOptions.map((item) => (
                  <SelectItem
                    key={item.id}
                    value={item.id}
                    className={`text-xs ${item.level === 2 ? "pl-8" : "pl-4 font-semibold"}`}
                  >
                    {item.code} {item.name}
                    {item.level === 1 && (
                      <span className="ml-1 text-muted-foreground">
                        ({item.type === "income" ? "Receita" : "Despesa"})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Código *</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="2.3.05"
                required
                className="font-mono"
              />
              {suggestedCode && !isEditing && (
                <p className="text-[10px] text-muted-foreground">Sugestão automática</p>
              )}
            </div>
            <div className="col-span-2 grid gap-2">
              <Label>Descrição *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Tipo *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[250]">
                  <SelectItem value="income">Receita</SelectItem>
                  <SelectItem value="expense">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!parentId && (
            <div className="space-y-2 rounded-lg border border-border/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">Obrigatoriedade (apenas para nível 1)</p>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="cat_event_required"
                  checked={eventRequired}
                  onChange={(e) => setEventRequired(e.target.checked)}
                  className="rounded border-border"
                />
                <Label htmlFor="cat_event_required" className="text-sm">Evento obrigatório</Label>
              </div>
            </div>
          )}

          <Button type="submit" disabled={isPending} className="mt-2 w-full">
            {isPending ? "A guardar…" : isEditing ? "Guardar Alterações" : "Criar Conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
