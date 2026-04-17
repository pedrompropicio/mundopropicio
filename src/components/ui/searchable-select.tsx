import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;
  indent?: boolean;
  icon?: string;
  /** Secondary text shown below the label */
  description?: string;
  /** Extra text to match during search (not displayed) */
  searchText?: string;
  /** If true, the option is shown but not selectable (used for hierarchy headers) */
  isHeader?: boolean;
  /** Indentation level for hierarchy (0=root, 1=child, 2=grandchild) */
  indentLevel?: number;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Selecionar…",
  searchPlaceholder = "Pesquisar…",
  emptyMessage = "Nenhum resultado.",
  className,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedOption = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    // Find which non-header items match
    const matchIndices = new Set<number>();
    options.forEach((o, i) => {
      if (o.isHeader) return;
      const haystack = [o.label, o.searchText, o.description].filter(Boolean).join(" ").toLowerCase();
      if (haystack.includes(q)) matchIndices.add(i);
    });
    // Keep matched items and any preceding headers
    const result: SearchableSelectOption[] = [];
    const pendingHeaders: SearchableSelectOption[] = [];
    for (let i = 0; i < options.length; i++) {
      const o = options[i];
      if (o.isHeader) {
        // Track headers at each indent level
        const lvl = o.indentLevel ?? 0;
        pendingHeaders.length = lvl; // trim deeper pending headers
        pendingHeaders[lvl] = o;
        continue;
      }
      if (matchIndices.has(i)) {
        // Flush any pending headers
        pendingHeaders.forEach(h => { if (h && !result.includes(h)) result.push(h); });
        pendingHeaders.length = 0;
        result.push(o);
      }
    }
    return result;
  }, [options, search]);

  // Group options
  const groups: { group: string | null; items: SearchableSelectOption[] }[] = [];
  filtered.forEach((opt) => {
    const g = opt.group ?? null;
    const existing = groups.find((gr) => gr.group === g);
    if (existing) existing.items.push(opt);
    else groups.push({ group: g, items: [opt] });
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed",
              !selectedOption && "text-muted-foreground",
              selectedOption && "pr-16"
            )}
          >
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        {selectedOption && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onValueChange("");
            }}
            aria-label="Limpar seleção"
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <PopoverContent
        className="min-w-[280px] w-[--radix-popover-trigger-width] max-w-[min(500px,95vw)] p-0 z-[200] flex flex-col max-h-[min(70vh,var(--radix-popover-content-available-height,70vh))]"
        align="start"
        collisionPadding={12}
        avoidCollisions
      >
        <div className="flex items-center border-b border-border px-3 py-2 shrink-0">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1">
          {/* Empty option */}
          <button
            type="button"
            onClick={() => { onValueChange(""); setOpen(false); setSearch(""); }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
              !value && "bg-accent/50"
            )}
          >
            <Check className={cn("h-3.5 w-3.5", value ? "opacity-0" : "opacity-100")} />
            <span className="text-muted-foreground italic">{placeholder}</span>
          </button>
          {groups.map((g, gi) => (
            <React.Fragment key={gi}>
              {g.group && (
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  {g.group}
                </div>
              )}
              {g.items.map((opt) => {
                const paddingLeft = opt.indentLevel ? `${(opt.indentLevel * 16) + 8}px` : opt.indent ? '24px' : undefined;
                if (opt.isHeader) {
                  return (
                    <div
                      key={opt.value}
                      className={cn(
                        "px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider select-none",
                        opt.indentLevel === 1 && "font-semibold normal-case tracking-normal text-foreground/70"
                      )}
                      style={paddingLeft ? { paddingLeft } : undefined}
                    >
                      {opt.label}
                    </div>
                  );
                }
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onValueChange(opt.value); setOpen(false); setSearch(""); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                      opt.value === value && "bg-accent/50",
                    )}
                    style={paddingLeft ? { paddingLeft } : undefined}
                  >
                    <Check className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", opt.value === value ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0">
                      <span className="truncate block">{opt.icon ? `${opt.icon} ` : ""}{opt.label}</span>
                      {opt.description && <span className="text-[10px] text-muted-foreground truncate block">{opt.description}</span>}
                    </div>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
