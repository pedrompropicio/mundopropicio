import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Loader2, FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  generateOperationalReport,
  type ReportDetail,
  type ReportGroupBy,
} from "@/lib/operacao/operationalReportPdf";
import { PHASE_LABELS, PHASE_ORDER, type EtapaPhase } from "@/lib/operacao/inferEtapaPhase";

const ALL_STATUSES = [
  { key: "pending", label: "Pendente" },
  { key: "in_progress", label: "Em curso" },
  { key: "blocked", label: "Bloqueada" },
  { key: "done", label: "Concluída" },
  { key: "cancelled", label: "Cancelada" },
];

interface Props {
  eventId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function OperationalReportDialog({ eventId, open, onOpenChange }: Props) {
  const [phases, setPhases] = useState<EtapaPhase[]>([...PHASE_ORDER]);
  const [statuses, setStatuses] = useState<string[]>([
    "pending",
    "in_progress",
    "blocked",
    "done",
  ]);
  const [detail, setDetail] = useState<ReportDetail>("medium");
  const [includePhotos, setIncludePhotos] = useState(false);
  const [groupBy, setGroupBy] = useState<ReportGroupBy>("frente");
  const [busy, setBusy] = useState(false);

  const togglePhase = (p: EtapaPhase) =>
    setPhases((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const toggleStatus = (s: string) =>
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const handleGenerate = async () => {
    if (!phases.length) {
      toast({ title: "Seleciona pelo menos uma fase", variant: "destructive" });
      return;
    }
    if (!statuses.length) {
      toast({ title: "Seleciona pelo menos um status", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await generateOperationalReport({
        eventId,
        phases,
        statuses,
        detail,
        groupBy,
        includePhotos: (detail !== "compact" || groupBy === "day") && includePhotos,
      });
      toast({ title: "Relatório gerado" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao gerar", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Relatório Operacional</DialogTitle>
          <DialogDescription>
            PDF agrupado por Zonas e Serviços, com etapas filtradas por fase e status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Fases */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fases</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {PHASE_ORDER.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={phases.includes(p)} onCheckedChange={() => togglePhase(p)} />
                  {PHASE_LABELS[p]}
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Status</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {ALL_STATUSES.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={statuses.includes(s.key)}
                    onCheckedChange={() => toggleStatus(s.key)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          {/* Agrupamento */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Agrupamento
            </Label>
            <RadioGroup
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as ReportGroupBy)}
              className="mt-2 space-y-1.5"
            >
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="frente" className="mt-0.5" />
                <span>
                  <span className="font-medium">Por Zona / Serviço → Etapa</span>
                  <span className="block text-xs text-muted-foreground">
                    Estrutural: cada frente com as suas etapas.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="day" className="mt-0.5" />
                <span>
                  <span className="font-medium">Cronológico (dia a dia)</span>
                  <span className="block text-xs text-muted-foreground">
                    Timeline diária dos registos, com zona/serviço e etapa em cada item.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* Detalhe */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Nível de detalhe
            </Label>
            <RadioGroup
              value={detail}
              onValueChange={(v) => setDetail(v as ReportDetail)}
              className="mt-2 space-y-1.5"
            >
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="compact" className="mt-0.5" />
                <span>
                  <span className="font-medium">Compacto</span>
                  <span className="block text-xs text-muted-foreground">
                    1 linha por etapa (nome, status, datas, responsável).
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="medium" className="mt-0.5" />
                <span>
                  <span className="font-medium">Médio</span>
                  <span className="block text-xs text-muted-foreground">
                    + escopo, fornecedor e responsável de cada etapa.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="full" className="mt-0.5" />
                <span>
                  <span className="font-medium">Completo</span>
                  <span className="block text-xs text-muted-foreground">
                    + registos cronológicos (notas/observações). Pode incluir fotos.
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {/* Fotos */}
          {(detail === "full" || groupBy === "day") && (
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <Label className="text-sm">Incluir registos fotográficos</Label>
                <p className="text-xs text-muted-foreground">
                  Embute fotos dos registos abaixo de cada etapa (mais lento).
                </p>
              </div>
              <Switch checked={includePhotos} onCheckedChange={setIncludePhotos} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> A gerar…
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-1" /> Gerar PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
