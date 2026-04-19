/**
 * Pre-import dialog: lets the user pick what an XLSX import should do before
 * the file picker opens.
 *
 *   - "full": current behaviour. Create/update BP rows with values, categories, IVA
 *     and links — full BP import.
 *   - "links": don't touch existing BP. Only attach the G–K external links to
 *     matching rows.
 *   - "dryrun": parse the file but show a preview without writing anything.
 *
 * Optional free-text "instructions" are forwarded to the AI category matcher to
 * give context about the file (e.g. "ignorar aba Resumo", "valores em milhares",
 * "CUSTOS LISBOA são da turnê de 07/02").
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileSpreadsheet, Link2, Eye, Sparkles } from "lucide-react";

export type BPImportMode = "full" | "links" | "dryrun";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called when the user confirms a mode. The parent should then open its file picker. */
  onConfirm: (mode: BPImportMode, instructions: string) => void;
}

const OPTIONS: Array<{
  key: BPImportMode;
  title: string;
  desc: string;
  Icon: typeof FileSpreadsheet;
}> = [
  {
    key: "full",
    title: "BP completo",
    desc: "Cria ou atualiza linhas com valores, categorias, IVA e links. Use quando o ficheiro tem mudanças significativas.",
    Icon: FileSpreadsheet,
  },
  {
    key: "links",
    title: "Só links/anexos",
    desc: "Não toca em valores nem descrições. Apenas anexa os links das colunas G–K às linhas correspondentes do BP existente.",
    Icon: Link2,
  },
  {
    key: "dryrun",
    title: "Validar (dry run)",
    desc: "Lê o ficheiro e mostra o que iria acontecer, sem gravar nada. Útil para conferir antes de importar.",
    Icon: Eye,
  },
];

export default function BPImportModeDialog({ open, onOpenChange, onConfirm }: Props) {
  const [mode, setMode] = useState<BPImportMode>("full");
  const [instructions, setInstructions] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Business Plan</DialogTitle>
          <DialogDescription>
            Escolhe o que pretendes importar a partir do ficheiro XLSX.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {OPTIONS.map(({ key, title, desc, Icon }) => {
            const selected = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`flex w-full gap-3 rounded-lg border p-3 text-left transition-colors ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-border/50 hover:border-border bg-secondary/20 hover:bg-secondary/40"
                }`}
              >
                <div
                  className={`shrink-0 rounded-md p-2 ${
                    selected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${selected ? "text-primary" : ""}`}>{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <div
                  className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                    selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                  }`}
                />
              </button>
            );
          })}
        </div>

        {mode !== "links" && (
          <div className="space-y-1.5">
            <Label htmlFor="bp-import-instructions" className="flex items-center gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Instruções para a IA <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Textarea
              id="bp-import-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={`Ex.: "A aba CUSTOS LISBOA é da data de 07/02. Valores estão em milhares. Categoria 'Cabos' é Som e Luz."`}
              className="min-h-[80px] text-xs"
              maxLength={1000}
            />
            <p className="text-[10px] text-muted-foreground">
              Este texto é enviado à IA de classificação para melhorar o mapeamento de categorias e o tratamento das linhas. {instructions.length}/1000
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirm(mode, instructions.trim());
              onOpenChange(false);
            }}
          >
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
