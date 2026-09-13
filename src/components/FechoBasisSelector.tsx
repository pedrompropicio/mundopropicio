import { Settings2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { FechoBasis, FechoExpenseSource } from "@/hooks/useFechoBasis";

/**
 * Seletor de critério do Fecho (IVA · base da despesa · overhead).
 * Escolha livre do utilizador; o critério selecionado é o que sai no PDF.
 */
export function FechoBasisSelector({ basis }: { basis: FechoBasis }) {
  const chips = [
    basis.withVat ? "c/IVA" : "s/IVA",
    basis.expenseSource === "committed" ? "Previsto + excedido" : "Realizado",
    basis.includeOverhead ? "+OH" : "s/OH",
  ].filter(Boolean) as string[];

  return (
    <div className="flex items-center gap-1.5">
      {chips.map((c) => (
        <span key={c} className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {c}
        </span>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            <Settings2 className="h-3.5 w-3.5" /> Critério
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs">IVA nas despesas</DropdownMenuLabel>
          <div className="px-2 pb-1 text-[11px] leading-snug text-muted-foreground">
            {basis.withVat ? "Com IVA (bruto)" : "Sem IVA (base líquida)"} — vem do critério
            contratual do evento; altera-se na ficha do evento.
          </div>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Base da despesa</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={basis.expenseSource}
            onValueChange={(v) => basis.setExpenseSource(v as FechoExpenseSource)}
          >
            <DropdownMenuRadioItem value="realized" disabled={!basis.canEditBasis}>
              Realizado (transações)
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem
              value="committed"
              disabled={!basis.canEditBasis}
              title="previsto no BP mais o que já foi gasto acima do previsto, rubrica a rubrica"
            >
              Previsto + excedido
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Composição</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={basis.includeOverhead}
            disabled={!basis.canEditBasis}
            onCheckedChange={(v) => basis.setIncludeOverhead(!!v)}
            onSelect={(e) => e.preventDefault()}
          >
            Incluir overhead
          </DropdownMenuCheckboxItem>
          <div className="px-2 pt-1 text-[11px] leading-snug text-muted-foreground">
            O critério é gravado no evento — vale para todos e em qualquer computador.
          </div>

        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
