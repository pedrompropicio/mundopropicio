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
    basis.expenseSource === "committed" ? "BP ajustado" : "Realizado",
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
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs">IVA nas despesas</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={basis.withVat ? "com" : "sem"}
            onValueChange={(v) => basis.setWithVat(v === "com")}
          >
            <DropdownMenuRadioItem value="sem">Sem IVA (base líquida)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="com">Com IVA (bruto)</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Base da despesa</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={basis.expenseSource}
            onValueChange={(v) => basis.setExpenseSource(v as FechoExpenseSource)}
          >
            <DropdownMenuRadioItem value="realized">Realizado (transações)</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="committed" title="Maior valor entre previsto e realizado, por rubrica">
              BP ajustado
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Composição</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={basis.includeOverhead}
            onCheckedChange={(v) => basis.setIncludeOverhead(!!v)}
            onSelect={(e) => e.preventDefault()}
          >
            Incluir overhead
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
