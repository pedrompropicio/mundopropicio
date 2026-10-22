/**
 * #335 fase 3b — detalhe só de leitura de um encontro de contas + estorno integral (só admin).
 * O estorno de uma perna isolada continua recusado no servidor (reverse_entire_group /
 * managed_operation_required); este é o único caminho de estorno de um encontro.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";
import { canReverseOffset, type OffsetControlRow } from "@/lib/offset-plan/contracts";
import { newRequestId, reverseOffsetGroup, type OffsetFailure, type OffsetRpcClient } from "@/lib/offset-plan/rpc";
import { OFFSET_GROUP_STATUS_LABEL, useOffsetControl, useOffsetGroupDetail, type OffsetGroupDetail } from "@/lib/offset-plan/groups";
import { invalidateAfterOffset } from "@/lib/offset-plan/load";

interface Props {
  groupId: string;
  onClose: () => void;
  /** Injecção para testes. */
  detail?: OffsetGroupDetail | null;
  control?: OffsetControlRow;
  client?: OffsetRpcClient;
  reverse?: typeof reverseOffsetGroup;
}

export function OffsetGroupDetailDialog({ groupId, onClose, detail: detailOverride, control: controlOverride, client, reverse }: Props) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const q = useOffsetGroupDetail(detailOverride === undefined ? groupId : null);
  const ctlQ = useOffsetControl();
  const detail = detailOverride !== undefined ? detailOverride : q.data;
  const control = controlOverride ?? ctlQ.data ?? { enabled: false, reverse_enabled: false };
  const allowReverse = canReverseOffset(role ? [role] : [], control) && detail?.status === "applied";

  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<OffsetFailure | null>(null);
  const [done, setDone] = useState(false);
  const sendingRef = useRef(false);
  const pendingRef = useRef<string | null>(null);

  const doReverse = async () => {
    if (sendingRef.current || !allowReverse || !ack || !reason.trim()) return;
    sendingRef.current = true;
    setSending(true);
    setFailure(null);
    try {
      if (!pendingRef.current) pendingRef.current = newRequestId();
      const r = await (reverse ?? reverseOffsetGroup)(client ?? (supabase as any), {
        groupId,
        requestId: pendingRef.current,
        reason,
      });
      if (r.ok) {
        pendingRef.current = null;
        setDone(true);
        invalidateAfterOffset(qc);
        return;
      }
      const f = r as OffsetFailure;
      setFailure(f);
      if (!f.uncertain) pendingRef.current = null;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="manual-modal-shell mobile-dialog-content sm:max-w-2xl p-0 gap-0">
        <DialogHeader className="manual-modal-header border-b p-4">
          <DialogTitle>Encontro de contas</DialogTitle>
          <DialogDescription>
            {detail ? `${formatDatePT(detail.operation_date)} · ${detail.supplier_name ?? ""} · ${formatCurrency(detail.movement_amount)}` : "A carregar…"}
          </DialogDescription>
        </DialogHeader>
        <div className="manual-modal-body space-y-3 p-4 text-sm">
          {detail && (
            <>
              <div>
                Estado: <Badge variant="secondary">{OFFSET_GROUP_STATUS_LABEL[detail.status] ?? detail.status}</Badge>
                {detail.reversal_reason ? ` · motivo do estorno: ${detail.reversal_reason}` : ""}
              </div>
              {detail.bank_line && (
                <p className="text-xs text-muted-foreground">
                  Linha do banco: {formatDatePT(detail.bank_line.booking_date ?? "")} · {detail.bank_line.description} ·{" "}
                  {formatCurrency(detail.bank_line.amount)}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="text-left">Documento</th>
                      <th className="text-right">Em aberto</th>
                      <th className="text-right">Dinheiro</th>
                      <th className="text-right">Compensação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((i) => (
                      <tr key={i.id} data-testid="group-item">
                        <td>
                          {i.type === "income" ? "Receita" : "Despesa"} · {i.invoice_ref || i.description || "transação"}
                          {i.forecast_id ? " (do BP)" : ""}
                        </td>
                        <td className="text-right font-mono">{formatCurrency(i.open_amount)}</td>
                        <td className="text-right font-mono">{formatCurrency(i.cash_amount)}</td>
                        <td className="text-right font-mono">{formatCurrency(i.compensation_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {allowReverse && !done && (
            <div className="space-y-2 rounded border border-destructive/50 p-3" data-testid="reverse-section">
              <p className="font-medium">Estornar o encontro inteiro</p>
              <p className="text-xs text-muted-foreground">
                Reverte todas as pernas deste encontro e desfaz o vínculo à linha do banco. Pernas isoladas não se estornam.
              </p>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (obrigatório)" aria-label="Motivo do estorno" />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} aria-label="Confirmo o estorno integral" />
                Confirmo o estorno integral deste encontro.
              </label>
              {failure && <p role="alert" className="text-destructive">{failure.message}</p>}
              <Button type="button" variant="destructive" disabled={!ack || !reason.trim() || sending} onClick={doReverse}>
                {sending ? "A estornar…" : failure?.uncertain ? "Repetir o mesmo pedido" : "Estornar encontro"}
              </Button>
            </div>
          )}
          {done && <p role="status">Encontro estornado.</p>}
        </div>
        <div className="manual-modal-header flex justify-end border-t p-4">
          <Button type="button" variant="ghost" disabled={sending} onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
