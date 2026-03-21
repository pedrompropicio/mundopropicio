import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/mock-data";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Calendar,
  ArrowUpDown,
  Users,
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  Landmark,
  FileCheck,
  Receipt,
  Ticket,
  BarChart3,
  Search,
} from "lucide-react";

const PAGES = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Calendário", path: "/calendario", icon: CalendarDays },
  { label: "Eventos", path: "/eventos", icon: Calendar },
  { label: "Transações", path: "/transacoes", icon: ArrowUpDown },
  { label: "Plano de Contas", path: "/plano-contas", icon: BookOpen },
  { label: "Contas Financeiras", path: "/contas", icon: Landmark },
  { label: "Fornecedores", path: "/fornecedores", icon: Users },
  { label: "Cotações", path: "/cotacoes", icon: FileCheck },
  { label: "Gestão IVA", path: "/iva", icon: Receipt },
  { label: "Gestão Bilhetes", path: "/bilhetes", icon: Ticket },
  { label: "Relatórios — DRE", path: "/relatorios/dre", icon: BarChart3 },
  { label: "Relatórios — P&L", path: "/relatorios/pl", icon: BarChart3 },
  { label: "Relatórios — Fluxo de Caixa", path: "/relatorios/fluxo-caixa", icon: BarChart3 },
  { label: "Relatórios — Extrato", path: "/relatorios/extrato", icon: BarChart3 },
  { label: "Relatórios — Contas a Pagar", path: "/relatorios/contas-pagar", icon: BarChart3 },
  { label: "Relatórios — Fornecedores", path: "/relatorios/fornecedores", icon: BarChart3 },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { data: events = [] } = useQuery({
    queryKey: ["search-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("events")
        .select("id, name, date, status")
        .order("date", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["search-transactions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("id, description, amount, type, status, date")
        .order("date", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["search-suppliers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name, nif, category")
        .eq("is_active", true)
        .order("name")
        .limit(50);
      return data ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate]
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border/50 bg-sidebar-accent/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Pesquisar...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border/50 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Pesquisar eventos, transações, fornecedores, páginas..." />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

          <CommandGroup heading="Páginas">
            {PAGES.map((page) => (
              <CommandItem
                key={page.path}
                onSelect={() => go(page.path)}
                className="gap-3"
              >
                <page.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>

          {events.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Eventos">
                {events.map((evt) => (
                  <CommandItem
                    key={evt.id}
                    value={`evento ${evt.name} ${evt.status}`}
                    onSelect={() => go(`/eventos/${evt.id}`)}
                    className="gap-3"
                  >
                    <Calendar className="h-4 w-4 shrink-0 text-primary" />
                    <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{evt.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(evt.date).toLocaleDateString("pt-PT")}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {transactions.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Transações">
                {transactions.map((tx) => (
                  <CommandItem
                    key={tx.id}
                    value={`transacao ${tx.description} ${tx.type} ${tx.status}`}
                    onSelect={() => go("/transacoes")}
                    className="gap-3"
                  >
                    <ArrowUpDown
                      className={`h-4 w-4 shrink-0 ${
                        tx.type === "income" ? "text-success" : "text-warning"
                      }`}
                    />
                    <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{tx.description}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {formatCurrency(Number(tx.amount))}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {suppliers.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Fornecedores">
                {suppliers.map((sup) => (
                  <CommandItem
                    key={sup.id}
                    value={`fornecedor ${sup.name} ${sup.nif ?? ""} ${sup.category ?? ""}`}
                    onSelect={() => go("/fornecedores")}
                    className="gap-3"
                  >
                    <Users className="h-4 w-4 shrink-0 text-accent-foreground" />
                    <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{sup.name}</span>
                      {sup.category && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {sup.category}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
