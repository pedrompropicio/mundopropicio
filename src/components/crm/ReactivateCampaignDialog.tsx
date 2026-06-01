import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ReactivateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignName?: string | null;
  /** Faz o toggle real (ACTIVE). reasonText vai para reason_text em meta_campaign_changes. */
  onConfirm: (reasonText?: string) => Promise<void>;
}

export function ReactivateCampaignDialog({
  open,
  onOpenChange,
  campaignName,
  onConfirm,
}: ReactivateCampaignDialogProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset do motivo sempre que a dialog abre.
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(reason.trim() || undefined);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reactivar campanha?</DialogTitle>
          <DialogDescription>
            <span className="block">{campaignName ?? ""}</span>
            <span className="block mt-1">Vai voltar a gastar verba do Meta. Confirmar?</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            Para ajustar verba diária antes, usa o botão de editar (✎) primeiro.
          </p>
          <div>
            <Label htmlFor="reactivate-reason" className="text-xs uppercase text-muted-foreground">
              Razão (opcional)
            </Label>
            <Input
              id="reactivate-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex: pausa terminada — retomar conversão pre-evento"
              disabled={loading}
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Reactivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
