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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useFreezeBPVersion } from "@/hooks/useBPVersions";
import { Snowflake } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  isMaster: boolean;
}

export function FreezeBPVersionModal({ open, onOpenChange, eventId, isMaster }: Props) {
  const [mode, setMode] = useState<"draft" | "active" | "scenario">("draft");
  const [description, setDescription] = useState("");
  const [scenarioLabel, setScenarioLabel] = useState("");
  const [pubEstimado, setPubEstimado] = useState("");
  const [ticketMedio, setTicketMedio] = useState("");
  const [ocupacao, setOcupacao] = useState("");
  const [scenarioNotes, setScenarioNotes] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  const freeze = useFreezeBPVersion();

  const reset = () => {
    setMode("draft");
    setDescription("");
    setScenarioLabel("");
    setPubEstimado("");
    setTicketMedio("");
    setOcupacao("");
    setScenarioNotes("");
    setIsPinned(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (mode === "scenario" && !scenarioLabel.trim()) return;

    const assumptions =
      mode === "scenario"
        ? {
            publico_estimado: pubEstimado ? Number(pubEstimado) : null,
            ticket_medio: ticketMedio ? Number(ticketMedio) : null,
            ocupacao_pct: ocupacao ? Number(ocupacao) : null,
            notas: scenarioNotes || null,
          }
        : null;

    await freeze.mutateAsync({
      eventId,
      description: description.trim() || null,
      approveImmediately: mode === "active",
      scenarioLabel: mode === "scenario" ? scenarioLabel.trim() : null,
      scenarioAssumptions: assumptions,
      isPinnedScenario: mode === "scenario" ? isPinned : false,
    });
    handleClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-primary" />
            Congelar nova versão do BP
          </DialogTitle>
          <DialogDescription>
            Cria uma fotografia imutável do Business Plan atual.
            {isMaster && " Os Splits desta turnê recebem automaticamente uma versão equivalente."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tipo de versão</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)}>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="draft" id="mode-draft" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="mode-draft" className="font-medium cursor-pointer">
                    Rascunho
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Snapshot guardado mas não substitui a versão ativa.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="active" id="mode-active" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="mode-active" className="font-medium cursor-pointer">
                    Aprovar imediatamente (versão ativa)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Substitui a versão ativa atual. Vira referência oficial para sócios e relatórios.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="scenario" id="mode-scenario" className="mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="mode-scenario" className="font-medium cursor-pointer">
                    Cenário (paralelo, para análise)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Snapshot nomeado (ex: "Pessimista 12k") para comparar com a versão ativa sem promover.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {mode === "scenario" ? (
            <div className="space-y-3 rounded-md border border-dashed p-3 bg-muted/20">
              <div className="space-y-1.5">
                <Label htmlFor="scenario-label">Nome do cenário *</Label>
                <Input
                  id="scenario-label"
                  placeholder="ex: Pessimista 12k"
                  value={scenarioLabel}
                  onChange={(e) => setScenarioLabel(e.target.value)}
                  maxLength={60}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pub-est" className="text-xs">Público estimado</Label>
                  <Input id="pub-est" type="number" inputMode="numeric" value={pubEstimado} onChange={(e) => setPubEstimado(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ticket-med" className="text-xs">Ticket médio (€)</Label>
                  <Input id="ticket-med" type="number" inputMode="decimal" step="0.01" value={ticketMedio} onChange={(e) => setTicketMedio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ocup" className="text-xs">Ocupação (%)</Label>
                  <Input id="ocup" type="number" inputMode="numeric" min={0} max={100} value={ocupacao} onChange={(e) => setOcupacao(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scenario-notes" className="text-xs">Notas</Label>
                <Textarea id="scenario-notes" rows={2} value={scenarioNotes} onChange={(e) => setScenarioNotes(e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-md bg-background/50 p-2">
                <div>
                  <Label htmlFor="pin-scenario" className="text-sm cursor-pointer">Fixar para multi-comparação</Label>
                  <p className="text-[11px] text-muted-foreground">Aparece sempre na comparação (máx 4 por evento)</p>
                </div>
                <Switch id="pin-scenario" checked={isPinned} onCheckedChange={setIsPinned} />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="changelog">Descrição / changelog (opcional)</Label>
              <Textarea
                id="changelog"
                rows={3}
                placeholder="ex: v3 — ajuste após reunião com cliente"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={freeze.isPending || (mode === "scenario" && !scenarioLabel.trim())}
          >
            {freeze.isPending
              ? "A congelar..."
              : mode === "active"
                ? "Aprovar e ativar"
                : mode === "scenario"
                  ? "Criar cenário"
                  : "Guardar rascunho"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
