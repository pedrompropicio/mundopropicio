import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { parseXlsxPL, type ParsedRow } from "@/lib/import-pl-xlsx";
import { useToast } from "@/hooks/use-toast";

export interface XlsxRowForGeneration {
  description: string;
  baseAmount: number;
  ivaRate: number;
  status: string; // raw value of column F
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  approvedCount: number;
  isGenerating: boolean;
  onConfirm: (xlsxRows: XlsxRowForGeneration[] | null) => void;
}

const PAID_TOKENS = ["pago", "liquidado", "ok", "✓"];
function isPaidStatus(raw: string): boolean {
  const n = (raw || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!n) return false;
  return PAID_TOKENS.some((tok) => n === tok || n.includes(tok));
}

export function GenerateHistoricalModal({ open, onOpenChange, approvedCount, isGenerating, onConfirm }: Props) {
  const { toast } = useToast();
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [xlsxRows, setXlsxRows] = useState<XlsxRowForGeneration[]>([]);
  const [paidCount, setPaidCount] = useState(0);

  const reset = () => {
    setFileName(null);
    setXlsxRows([]);
    setPaidCount(0);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const sheets = parseXlsxPL(buf);
      const flat: XlsxRowForGeneration[] = [];
      let paid = 0;
      for (const sh of sheets) {
        for (const r of sh.rows as ParsedRow[]) {
          const rawStatus = r.rawValues?.status ?? "";
          if (isPaidStatus(rawStatus)) paid++;
          flat.push({
            description: r.description,
            baseAmount: r.baseAmount,
            ivaRate: r.ivaRate,
            status: rawStatus,
          });
        }
      }
      setFileName(file.name);
      setXlsxRows(flat);
      setPaidCount(paid);
      toast({ title: `Ficheiro analisado`, description: `${flat.length} linha(s), ${paid} marcadas como Pago` });
    } catch (err: any) {
      toast({ title: "Erro ao analisar ficheiro", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
    }
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar transações históricas</DialogTitle>
          <DialogDescription>
            {approvedCount} previsão(ões) aprovada(s) sem transação serão geradas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs space-y-1">
              <p><strong>Sem ficheiro:</strong> todas as transações são criadas como <em>Aprovadas</em> (não liquidadas).</p>
              <p><strong>Com ficheiro XLSX:</strong> as linhas com coluna F = <em>Pago / Liquidado / OK / ✓</em> serão liquidadas na conta "Eventos Históricos". As restantes ficam Aprovadas.</p>
            </AlertDescription>
          </Alert>

          <div className="rounded-lg border border-dashed border-border p-4">
            {!fileName ? (
              <label className="flex flex-col items-center gap-2 cursor-pointer">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {parsing ? "A analisar…" : "Carregar XLSX original do BP (opcional)"}
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFile}
                  disabled={parsing || isGenerating}
                />
              </label>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <FileSpreadsheet className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {xlsxRows.length} linha(s) · <CheckCircle2 className="inline h-3 w-3 text-primary" /> {paidCount} marcadas Pago
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={reset} disabled={isGenerating}>
                  Trocar
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={isGenerating}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(xlsxRows.length > 0 ? xlsxRows : null)} disabled={isGenerating || parsing}>
            {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {fileName ? "Gerar com matching" : "Gerar como Aprovadas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
