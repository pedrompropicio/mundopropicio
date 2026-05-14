import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useCompany,
  useUserMemberships,
  useSetActiveCompany,
} from "@/hooks/useCompany";

/**
 * Empresa ativa selector.
 * - Visible only to platform_admin (returns null for everyone else).
 * - Switching the company invalidates every query because data scope changes
 *   completely between tenants.
 */
export function CompanySwitcher() {
  const { company, companyId, isPlatformAdmin } = useCompany();
  const { data: memberships, isLoading } = useUserMemberships(true);
  const setActive = useSetActiveCompany();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const companies = (memberships ?? []).map((m) => ({
    id: m.company_id,
    display_name: m.display_name,
    legal_name: m.display_name,
    slug: m.slug,
  }));

  const visible = isPlatformAdmin || (memberships?.length ?? 0) >= 2;
  if (!visible) return null;

  const handleSelect = async (id: string) => {
    if (id === companyId) {
      setOpen(false);
      return;
    }
    try {
      await setActive.mutateAsync(id);
      const target = companies?.find((c) => c.id === id);
      toast({
        title: "Empresa alterada",
        description: target
          ? `A operar agora em ${target.display_name}.`
          : "Empresa ativa atualizada.",
      });
      setOpen(false);
      navigate("/", { replace: true });
    } catch (err: any) {
      toast({
        title: "Não foi possível trocar de empresa",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    }
  };

  const label = company?.display_name ?? "Selecionar empresa";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className="h-8 gap-2 max-w-[220px]"
          disabled={setActive.isPending}
        >
          {setActive.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          ) : (
            <Building2 className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate text-xs font-medium">{label}</span>
          <Badge variant="secondary" className="hidden lg:inline-flex h-4 px-1 text-[10px]">
            {isPlatformAdmin ? "admin" : `${memberships?.length ?? 0} empresas`}
          </Badge>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Procurar empresa..." className="h-9" />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                A carregar empresas…
              </div>
            ) : (
              <>
                <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
                <CommandGroup heading="Empresas ativas">
                  {(companies ?? []).map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.display_name} ${c.legal_name} ${c.slug}`}
                      onSelect={() => handleSelect(c.id)}
                      className="flex items-center gap-2"
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5",
                          c.id === companyId ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-sm">{c.display_name}</span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {c.legal_name}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
