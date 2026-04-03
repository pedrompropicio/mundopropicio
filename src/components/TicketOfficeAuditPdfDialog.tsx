import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TicketOfficeAuditPdfFormat = "synthetic" | "analytical-2" | "analytical-3";

type AnalyticalGroupBy = "event" | "type";

interface OfficeOption {
  id: string;
  name: string;
}

interface TicketOfficeAuditPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  format: TicketOfficeAuditPdfFormat;
  onFormatChange: (value: TicketOfficeAuditPdfFormat) => void;
  officeFilter: string;
  onOfficeFilterChange: (value: string) => void;
  analyticalGroupBy: AnalyticalGroupBy;
  onAnalyticalGroupByChange: (value: AnalyticalGroupBy) => void;
  offices: OfficeOption[];
  onConfirm: () => void;
}

export default function TicketOfficeAuditPdfDialog({
  open,
  onOpenChange,
  format,
  onFormatChange,
  officeFilter,
  onOfficeFilterChange,
  analyticalGroupBy,
  onAnalyticalGroupByChange,
  offices,
  onConfirm,
}: TicketOfficeAuditPdfDialogProps) {
  const isAnalytical = format !== "synthetic";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar PDF da auditoria</DialogTitle>
          <DialogDescription>
            Escolha o formato e a abrangência do relatório antes de gerar o PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Formato do PDF</p>
            <Select value={format} onValueChange={(value) => onFormatChange(value as TicketOfficeAuditPdfFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="synthetic">Sintético</SelectItem>
                <SelectItem value="analytical-2">Analítico — 2º nível</SelectItem>
                <SelectItem value="analytical-3">Analítico — 3º nível</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O 2º nível mostra totais por evento e categoria. O 3º nível inclui também o detalhe dos lançamentos.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Bilheteira</p>
            <Select value={officeFilter} onValueChange={onOfficeFilterChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Geral — todas as bilheteiras</SelectItem>
                {offices.map((office) => (
                  <SelectItem key={office.id} value={office.id}>
                    {office.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAnalytical && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Organização analítica</p>
              <Select value={analyticalGroupBy} onValueChange={(value) => onAnalyticalGroupByChange(value as AnalyticalGroupBy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="type">Por Categoria</SelectItem>
                  <SelectItem value="event">Por Evento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onConfirm}>Gerar PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
