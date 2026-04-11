import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, FileText, Phone, Mail, Building2, Pencil, Trash2, LayoutGrid, List, ArrowUpDown, ChevronDown, EyeOff, Eye } from "lucide-react";
import { SupplierTransactions } from "@/components/SupplierTransactions";
import { SupplierCreditsPanel } from "@/components/SupplierCreditsPanel";
import { Input } from "@/components/ui/input";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import HelpTooltip from "@/components/HelpTooltip";
import helpTexts from "@/lib/help-texts";

type ViewMode = "grid" | "list";
type SortField = "name" | "trade_name";
type SortDir = "asc" | "desc";

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creditsExpandedId, setCreditsExpandedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [hidePartners, setHidePartners] = useState(false);
  const queryClient = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setDeletingId(null);
      toast.success("Fornecedor eliminado");
    },
    onError: (err: any) => {
      toast.error("Erro ao eliminar", { description: err.message });
      setDeletingId(null);
    },
  });

  const filtered = useMemo(() => {
    let list = suppliers.filter((s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.trade_name && s.trade_name.toLowerCase().includes(search.toLowerCase())) ||
      (s.nif && s.nif.includes(search)) ||
      (s.category && s.category.toLowerCase().includes(search.toLowerCase()))
    );
    if (hidePartners) list = list.filter((s) => !s.is_partner);
    list.sort((a, b) => {
      const valA = (sortField === "trade_name" ? (a.trade_name || a.name) : a.name).toLowerCase();
      const valB = (sortField === "trade_name" ? (b.trade_name || b.name) : b.name).toLowerCase();
      return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
    return list;
  }, [suppliers, search, sortField, sortDir]);

  const toggleSort = () => setSortDir((d) => (d === "asc" ? "desc" : "asc"));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl flex items-center gap-2">Fornecedores / Parceiros <HelpTooltip text={helpTexts.suppliers} /></h1>
          <p className="text-sm text-muted-foreground">Gestão de fornecedores e parceiros</p>
        </div>
        <button
          onClick={() => { setEditingSupplier(null); setIsOpen(true); }}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground glow-primary"
        >
          <Plus className="h-4 w-4" /> Novo Fornecedor <HelpTooltip text={helpTexts.newSupplier} size={13} className="text-primary-foreground/60 hover:text-primary-foreground" />
        </button>
      </div>

      <SupplierFormModal
        key={editingSupplier?.id ?? "new"}
        open={isOpen}
        onOpenChange={setIsOpen}
        editingSupplier={editingSupplier}
      />

      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeletingId(null)}>
          <div className="glass w-full max-w-sm rounded-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Eliminar Fornecedor?</h3>
            <p className="text-sm text-muted-foreground">
              Esta ação não pode ser desfeita. O fornecedor será removido permanentemente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteMutation.mutate(deletingId)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-lg bg-destructive py-2.5 text-sm font-medium text-destructive-foreground disabled:opacity-50"
              >
                {deleteMutation.isPending ? "A eliminar…" : "Eliminar"}
              </button>
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 rounded-lg bg-secondary py-2.5 text-sm font-medium text-secondary-foreground"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Pesquisar por nome, NIF ou categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
            <SelectTrigger className="w-[160px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nome Entidade</SelectItem>
              <SelectItem value="trade_name">Nome Fantasia</SelectItem>
            </SelectContent>
          </Select>
          <button
            onClick={toggleSort}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 h-9 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title={sortDir === "asc" ? "A → Z" : "Z → A"}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortDir === "asc" ? "A→Z" : "Z→A"}
          </button>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              title="Vista em grelha"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              title="Vista em lista"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">Nenhum fornecedor encontrado</div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.id} className="glass rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-foreground">{s.name}</h3>
                  {s.trade_name && <p className="text-xs text-foreground/70">{s.trade_name}</p>}
                  {s.category && <span className="text-xs text-muted-foreground">{s.category}</span>}
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <button
                    onClick={() => { setEditingSupplier(s); setIsOpen(true); }}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeletingId(s.id)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                {s.nif && <p className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> NIF: {s.nif}</p>}
                {s.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {s.email}</p>}
                {s.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {s.phone}</p>}
                {s.contact_name && <p className="flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> {s.contact_name}</p>}
                {s.iban && <p className="text-xs truncate">IBAN: {s.iban}</p>}
                {s.swift_bic && <p className="text-xs">SWIFT: {s.swift_bic}</p>}
              </div>
              {s.payment_terms && (
                <p className="text-xs text-muted-foreground">Pagamento: {s.payment_terms}</p>
              )}
              <SupplierTransactions
                supplierId={s.id}
                isOpen={expandedId === s.id}
                onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
              />
              <SupplierCreditsPanel
                supplierId={s.id}
                isOpen={creditsExpandedId === s.id}
                onToggle={() => setCreditsExpandedId(creditsExpandedId === s.id ? null : s.id)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="glass rounded-xl p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Nome Entidade</th>
                  <th className="hidden pb-3 text-left font-medium sm:table-cell">Nome Fantasia</th>
                  <th className="hidden pb-3 text-left font-medium md:table-cell">NIF</th>
                  <th className="hidden pb-3 text-left font-medium md:table-cell">Categoria</th>
                  <th className="hidden pb-3 text-left font-medium lg:table-cell">Email</th>
                  <th className="hidden pb-3 text-left font-medium lg:table-cell">Telefone</th>
                  <th className="pb-3 text-center font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
              {filtered.map((s) => (
                <React.Fragment key={s.id}>
                  <tr className="hover:bg-secondary/20 transition-colors">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{s.trade_name}</p>
                    </td>
                    <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">{s.trade_name || "—"}</td>
                    <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{s.nif || "—"}</td>
                    <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">{s.category || "—"}</td>
                    <td className="hidden py-3 pr-4 text-muted-foreground lg:table-cell truncate max-w-[180px]">{s.email || "—"}</td>
                    <td className="hidden py-3 pr-4 text-muted-foreground lg:table-cell">{s.phone || "—"}</td>
                    <td className="py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                          className={`rounded-lg p-1.5 transition-colors ${expandedId === s.id ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                          title="Ver contratações"
                        >
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${expandedId === s.id ? "rotate-180" : ""}`} />
                        </button>
                        <button
                          onClick={() => { setEditingSupplier(s); setIsOpen(true); }}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingId(s.id)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === s.id && (
                    <tr>
                      <td colSpan={8} className="px-4 pb-4">
                        <SupplierTransactions
                          supplierId={s.id}
                          isOpen={true}
                          onToggle={() => setExpandedId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
