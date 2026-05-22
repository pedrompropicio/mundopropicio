import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useOperacaoEvent } from "@/contexts/OperacaoEventContext";

function fmtDate(d?: string | null): string {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return d;
  }
}

export function OperacaoEventSwitcher() {
  const { activeEventId, setActiveEventId, events, isLoading } = useOperacaoEvent();
  const [open, setOpen] = useState(false);
  const active = useMemo(
    () => events.find((e) => e.id === activeEventId) ?? null,
    [events, activeEventId],
  );

  if (isLoading && events.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled className="h-8 min-w-[200px] justify-start">
        <CalendarIcon className="h-3.5 w-3.5 mr-2 opacity-50" />
        <span className="text-muted-foreground text-xs">A carregar eventos…</span>
      </Button>
    );
  }

  if (events.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled className="h-8 min-w-[200px] justify-start">
        <CalendarIcon className="h-3.5 w-3.5 mr-2 opacity-50" />
        <span className="text-muted-foreground text-xs">Sem eventos</span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-8 min-w-[220px] justify-between gap-2"
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="truncate">
              {active ? active.name : "Escolher evento…"}
            </span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Procurar evento…" />
          <CommandList>
            <CommandEmpty>Sem resultados.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => {
                  setActiveEventId(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5 mr-2",
                    !activeEventId ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="text-muted-foreground italic">Todos os eventos</span>
              </CommandItem>
              {events.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.name} ${e.id}`}
                  onSelect={() => {
                    setActiveEventId(e.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        activeEventId === e.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{e.name}</span>
                  </div>
                  {e.date && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {fmtDate(e.date)}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
