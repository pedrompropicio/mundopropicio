/**
 * Indicador da vigia de bilheteira (D-ERP192 → D-ERP197). É o ÚNICO canal da vigia: não há email,
 * WhatsApp nem lembrete. Lê get_ticketing_sync_status (todas as condições, mesma função que a
 * vigia usa — ticketing_sync_conditions) e get_ticketing_divergences (números de e/g), ambas
 * isoladas pela empresa activa.
 * Níveis: vermelho (a, b, d, f — o sync parou) · âmbar (e, g — divergência; g = fornecedor) ·
 * informativo (c — import desligado, é uma escolha). Sem condições não desenha nada.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, AlertOctagon, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface StatusRow {
  config_id: string | null;
  event_id: string | null;
  event_name: string;
  bilheteira: string;
  condicao: "a" | "b" | "c" | "d" | "e" | "f" | "g";
  nivel: "vermelho" | "ambar" | "info";
  detalhe: string;
  desde_quando: string;
}

interface DivRow {
  config_id: string;
  condicao: "e" | "g";
  our_qty: number | null;
  our_value: number | null;
  portal_qty: number | null;
  portal_value: number | null;
  diff_qty: number | null;
  diff_value: number | null;
  dias: number;
  last_read: string;
  sum_xlsx: number;
  sum_ours: number;
  sum_pdf: number;
}

export const CONDITION_LABELS: Record<StatusRow["condicao"], string> = {
  a: "Falha persistente — as 3 últimas corridas falharam",
  b: "Parado — sem sincronização com sucesso há mais de 6 horas",
  c: "Import desligado",
  d: "Captura horária da Ticketline parada há mais de 3 horas",
  e: "Variação do portal diferente da nossa há 3 dias",
  f: "6 corridas seguidas sem sucesso",
  g: "PDF do portal parado — problema do fornecedor",
};

const n = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-PT");
const eur = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function TicketingDivergenceIndicator() {
  const { companyId } = useCompany();
  const [open, setOpen] = useState(false);
  const { data: rows = [] } = useQuery({
    queryKey: ["ticketing_sync_status", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ticketing_sync_status" as any);
      if (error) throw error;
      return (data || []) as StatusRow[];
    },
  });
  const hasDiv = rows.some((r) => r.nivel === "ambar");
  const { data: divs = [] } = useQuery({
    queryKey: ["ticketing_divergences", companyId],
    enabled: !!companyId && hasDiv,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ticketing_divergences" as any);
      if (error) throw error;
      return (data || []) as DivRow[];
    },
  });

  if (rows.length === 0) return null;

  const red = rows.filter((r) => r.nivel === "vermelho");
  const amber = rows.filter((r) => r.nivel === "ambar");
  const info = rows.filter((r) => r.nivel === "info");
  const Icon = red.length ? AlertOctagon : amber.length ? AlertTriangle : Info;
  const tone = red.length ? "text-destructive" : amber.length ? "text-warning" : "text-muted-foreground";
  const title = red.length
    ? "Sincronização de bilheteira parada"
    : amber.length
      ? "Divergência com o portal de Produtores"
      : "Import de bilheteira desligado";

  const section = (label: string, list: StatusRow[], cls: string) =>
    list.length > 0 && (
      <div className="space-y-2">
        <p className={`text-xs font-semibold uppercase tracking-wider ${cls}`}>{label}</p>
        {list.map((r, i) => {
          const d = divs.find((x) => x.config_id === r.config_id && x.condicao === r.condicao);
          return (
            <div key={`${r.config_id ?? "all"}-${r.condicao}-${i}`} className="rounded-md border border-border p-3">
              <div className="font-medium">{r.event_name} — {r.bilheteira}</div>
              <p className={`mt-1 text-xs ${cls}`}>{CONDITION_LABELS[r.condicao]}</p>
              {r.condicao === "g" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  O Mapa de Ocupação (PDF) do portal está parado, enquanto o occupation.xlsx do mesmo evento
                  continua a mexer{d ? ` (últimos 3 dias: xlsx +${n(d.sum_xlsx)}, nossas +${n(d.sum_ours)}, PDF +${n(d.sum_pdf)})` : ""}.{" "}
                  <strong>É problema do fornecedor, não nosso</strong> — a nossa captura está a funcionar.
                </p>
              ) : r.condicao === "e" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  A variação diária do portal (xlsx) difere da nossa há 3 dias seguidos
                  {d ? ` (xlsx +${n(d.sum_xlsx)}, nossas +${n(d.sum_ours)})` : ""}. Pode faltar captura nossa.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.detalhe}{r.condicao !== "c" ? ` · último sucesso: ${r.desde_quando}` : ""}
                </p>
              )}
              {d && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Nossa plataforma</dt>
                  <dd>{n(d.our_qty)} bilhetes · {eur(d.our_value)}</dd>
                  <dt className="text-muted-foreground">Portal (PDF)</dt>
                  <dd>{n(d.portal_qty)} bilhetes · {eur(d.portal_value)}</dd>
                  <dt className="text-muted-foreground">Diferença</dt>
                  <dd>{n(d.diff_qty)} bilhetes · {eur(d.diff_value)}</dd>
                  <dt className="text-muted-foreground">Dura há</dt>
                  <dd>{d.dias} dia{d.dias === 1 ? "" : "s"}</dd>
                  <dt className="text-muted-foreground">Última leitura</dt>
                  <dd>{ddmmyyyy(d.last_read)}</dd>
                </dl>
              )}
            </div>
          );
        })}
      </div>
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center hover:opacity-80 ${tone}`}
        aria-label={`${title} (${rows.length})`}
        title={title}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Estado da sincronização de bilheteira</DialogTitle>
            <DialogDescription>
              Este indicador é o único aviso da vigia de bilheteira: não há email nem WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {section("Sync parado — problema nosso, urgente", red, "text-destructive")}
            {section("Divergências", amber, "text-warning")}
            {section("Informativo", info, "text-muted-foreground")}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
