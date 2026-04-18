import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FilterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Events
  selectedEventIds: Set<string>;
  setSelectedEventIds: (s: Set<string>) => void;
  // Accounts
  selectedAccountIds: Set<string>;
  setSelectedAccountIds: (s: Set<string>) => void;
  // Suppliers
  selectedSupplierIds: Set<string>;
  setSelectedSupplierIds: (s: Set<string>) => void;
  // Toggles
  viewMode: "open" | "paid";
  onlyPending: boolean;
  setOnlyPending: (v: boolean) => void;
  onlyNoDueDate: boolean;
  setOnlyNoDueDate: (v: boolean) => void;
  onlyGrouped: boolean;
  setOnlyGrouped: (v: boolean) => void;
  showHidden: boolean;
  setShowHidden: (v: boolean) => void;
  isAdmin: boolean;
  onClearAll: () => void;
}

interface MultiSelectListProps {
  items: { id: string; name: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  searchPlaceholder: string;
}

function MultiSelectList({ items, selected, onToggle, onToggleAll, searchPlaceholder }: MultiSelectListProps) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const term = q.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(term));
  }, [items, q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-md border border-border bg-background pl-8 pr-7 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={onToggleAll}
          className="text-xs text-primary hover:underline"
        >
          {selected.size === items.length && items.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
        </button>
        {selected.size > 0 && (
          <span className="text-xs text-muted-foreground">{selected.size} selecionado(s)</span>
        )}
      </div>
      <ScrollArea className="h-56 rounded-md border border-border/50">
        <div className="p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nada encontrado.</p>
          ) : (
            filtered.map((i) => (
              <div
                key={i.id}
                onClick={() => onToggle(i.id)}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox checked={selected.has(i.id)} onCheckedChange={() => onToggle(i.id)} />
                <span className="truncate">{i.name}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export function TransactionFiltersPanel(props: FilterPanelProps) {
  const {
    open, onOpenChange,
    selectedEventIds, setSelectedEventIds,
    selectedAccountIds, setSelectedAccountIds,
    selectedSupplierIds, setSelectedSupplierIds,
    viewMode,
    onlyPending, setOnlyPending,
    onlyNoDueDate, setOnlyNoDueDate,
    onlyGrouped, setOnlyGrouped,
    showHidden, setShowHidden,
    isAdmin,
    onClearAll,
  } = props;

  const { data: events = [] } = useQuery({
    queryKey: ["events-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financial-accounts-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("financial_accounts").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-list-filter"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const toggleAll = (items: { id: string }[], current: Set<string>, setter: (s: Set<string>) => void) => {
    if (current.size === items.length) setter(new Set());
    else setter(new Set(items.map((i) => i.id)));
  };

  const ToggleChip = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium transition-all border",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );

  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn(
            "fixed inset-y-0 right-0 z-50 h-full w-full sm:max-w-md border-l border-border bg-background p-6 shadow-2xl",
            "overflow-y-auto",
            "transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            "data-[state=closed]:duration-300 data-[state=open]:duration-500",
          )}
        >
          <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar</span>
          </SheetPrimitive.Close>

          <SheetHeader>
            <SheetTitle>Filtros de Transações</SheetTitle>
            <SheetDescription>Refine os resultados com critérios combinados.</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Quick toggles */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estado rápido</h3>
              <div className="flex flex-wrap gap-2">
                {viewMode === "open" && (
                  <>
                    <ToggleChip active={onlyPending} onClick={() => setOnlyPending(!onlyPending)} label="Aprovação pendente" />
                    <ToggleChip active={onlyNoDueDate} onClick={() => setOnlyNoDueDate(!onlyNoDueDate)} label="Sem vencimento" />
                  </>
                )}
                <ToggleChip active={onlyGrouped} onClick={() => setOnlyGrouped(!onlyGrouped)} label="Agrupadas por fatura" />
                {isAdmin && (
                  <ToggleChip active={showHidden} onClick={() => setShowHidden(!showHidden)} label="Mostrar ocultas" />
                )}
              </div>
            </section>

            {/* Suppliers */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fornecedor</h3>
              <MultiSelectList
                items={suppliers as any}
                selected={selectedSupplierIds}
                onToggle={(id) => toggle(selectedSupplierIds, id, setSelectedSupplierIds)}
                onToggleAll={() => toggleAll(suppliers as any, selectedSupplierIds, setSelectedSupplierIds)}
                searchPlaceholder="Procurar fornecedor…"
              />
            </section>

            {/* Events */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evento</h3>
              <MultiSelectList
                items={events as any}
                selected={selectedEventIds}
                onToggle={(id) => toggle(selectedEventIds, id, setSelectedEventIds)}
                onToggleAll={() => toggleAll(events as any, selectedEventIds, setSelectedEventIds)}
                searchPlaceholder="Procurar evento…"
              />
            </section>

            {/* Accounts */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conta financeira</h3>
              <MultiSelectList
                items={accounts as any}
                selected={selectedAccountIds}
                onToggle={(id) => toggle(selectedAccountIds, id, setSelectedAccountIds)}
                onToggleAll={() => toggleAll(accounts as any, selectedAccountIds, setSelectedAccountIds)}
                searchPlaceholder="Procurar conta…"
              />
            </section>
          </div>

          <SheetFooter className="mt-6 flex-row gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={onClearAll} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Limpar tudo
            </Button>
            <Button size="sm" onClick={() => onOpenChange(false)}>Aplicar</Button>
          </SheetFooter>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
