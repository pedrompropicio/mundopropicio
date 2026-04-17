import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Lock, Layers, HelpCircle } from "lucide-react";
import { useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  masterDescription: string;
  onConfirm: (choice: "local" | "master") => void;
}

export function LocalReinforcementDialog({ open, onOpenChange, categoryName, masterDescription, onConfirm }: Props) {
  const [choice, setChoice] = useState<"local" | "master">("local");

  const handleConfirm = () => {
    onConfirm(choice);
    setChoice("local");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" />
            Classificação da Despesa
          </DialogTitle>
          <DialogDescription className="text-sm">
            A categoria <strong className="text-foreground">{categoryName}</strong> tem rateio no BP Master
            {masterDescription && (
              <span className="text-muted-foreground"> ("{masterDescription}")</span>
            )}. Como pretende classificar esta despesa?
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={choice} onValueChange={(v) => setChoice(v as "local" | "master")} className="space-y-3 py-2">
          <label
            htmlFor="choice-local"
            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
              choice === "local" ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/30"
            }`}
          >
            <RadioGroupItem value="local" id="choice-local" className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 font-medium text-sm">
                <Lock className="h-3.5 w-3.5 text-blue-400" />
                Custo Isolado
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      className="inline-flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors focus:outline-none"
                      aria-label="Saber mais sobre Custo Isolado"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
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
                      é marcada como <strong className="text-foreground">exclusiva desta praça</strong>, sem relação
                      com o rateio do BP Master.
                    </p>
                    <div className="pt-1">
                      <div className="font-medium text-foreground mb-1">📊 Relação com a Conta Master</div>
                      <ul className="space-y-1 text-muted-foreground list-disc pl-4">
                        <li><strong className="text-foreground">Não consome</strong> a verba planeada na linha correspondente do BP Master.</li>
                        <li>Aparece apenas no resultado (DRE/PL) <strong className="text-foreground">deste sub-evento</strong>.</li>
                        <li>A linha do BP Master continua <strong className="text-foreground">intacta</strong> e disponível para outras despesas vinculadas.</li>
                        <li>Não é considerada no <strong className="text-foreground">tracking de execução</strong> do BP da turnê (BP vs Real consolidado).</li>
                      </ul>
                    </div>
                    <div className="pt-1">
                      <div className="font-medium text-foreground mb-1">💡 Quando usar</div>
                      <p className="text-muted-foreground">
                        Custos contratados especificamente para esta praça (ex: artista de abertura local, reforço
                        de mídia da cidade, equipamento extra exclusivo).
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Despesa exclusiva deste sub-evento (ex: artista local, reforço de mídia da cidade).
                <span className="block mt-1">
                  <strong className="text-foreground">Não consome</strong> a verba planeada no BP Master.
                </span>
              </p>
            </div>
          </label>

          <label
            htmlFor="choice-master"
            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
              choice === "master" ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/30"
            }`}
          >
            <RadioGroupItem value="master" id="choice-master" className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 font-medium text-sm">
                <Layers className="h-3.5 w-3.5 text-orange-400" />
                Vincular ao Rateio Master
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Esta despesa faz parte do custo rateado da turnê (vincula à linha Master)
              </p>
            </div>
          </label>
        </RadioGroup>

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-lg px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Confirmar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
