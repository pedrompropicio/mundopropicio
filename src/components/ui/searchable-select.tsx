import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;
  indent?: boolean;
  icon?: string;
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

  const filtered = search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

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
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed",
            !selectedOption && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="flex items-center border-b border-border px-3 py-2">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[200px] overflow-y-auto p-1">
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
              {g.items.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onValueChange(opt.value); setOpen(false); setSearch(""); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                    opt.value === value && "bg-accent/50",
                    opt.indent && "pl-6"
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", opt.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{opt.icon ? `${opt.icon} ` : ""}{opt.label}</span>
                </button>
              ))}
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
