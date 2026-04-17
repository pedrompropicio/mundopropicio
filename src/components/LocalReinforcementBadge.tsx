import { Lock, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  className?: string;
}

export function LocalReinforcementBadge({ className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase bg-blue-500/15 text-blue-400">
            <Lock className="h-2.5 w-2.5" />
            Custo Isolado
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-60">
          Despesa exclusiva deste sub-evento, não consome verba do BP Master
        </TooltipContent>
      </Tooltip>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors focus:outline-none"
            aria-label="Saber mais sobre Custo Isolado"
            onClick={(e) => e.stopPropagation()}
          >
            <HelpCircle className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-80 p-4 text-xs leading-relaxed space-y-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold text-sm flex items-center gap-1.5 text-blue-400">
            <Lock className="h-3.5 w-3.5" />
            Custo Isolado
          </div>
          <p className="text-muted-foreground">
            Esta despesa pertence a um <strong className="text-foreground">sub-evento de uma turnê</strong> e
            foi marcada como <strong className="text-foreground">exclusiva desta praça</strong>, sem relação
            com o rateio do BP Master.
          </p>

          <div className="pt-1">
            <div className="font-medium text-foreground mb-1">📊 Relação com a Conta Master</div>
            <ul className="space-y-1 text-muted-foreground list-disc pl-4">
              <li>
                <strong className="text-foreground">Não consome</strong> a verba planeada na linha
                correspondente do BP Master.
              </li>
              <li>
                Aparece apenas no resultado (DRE/PL) <strong className="text-foreground">deste sub-evento</strong>.
              </li>
              <li>
                A linha do BP Master continua <strong className="text-foreground">intacta</strong> e disponível
                para outras despesas vinculadas.
              </li>
              <li>
                Não é considerada no <strong className="text-foreground">tracking de execução</strong> do BP da
                turnê (BP vs Real consolidado).
              </li>
            </ul>
          </div>

          <div className="pt-1">
            <div className="font-medium text-foreground mb-1">💡 Quando usar</div>
            <p className="text-muted-foreground">
              Custos contratados especificamente para esta praça (ex: artista de abertura local, reforço
              de mídia da cidade, equipamento extra exclusivo).
            </p>
          </div>

          <div className="pt-1 border-t border-border/50">
            <p className="text-muted-foreground text-[11px]">
              💬 Para reclassificar como despesa rateada da turnê, use o ícone{" "}
              <span className="inline-flex items-center justify-center rounded bg-secondary px-1 py-0.5">
                ⧉
              </span>{" "}
              na linha da transação e escolha <strong className="text-foreground">Vincular ao Rateio Master</strong>.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}
