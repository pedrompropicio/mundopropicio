// Helpers partilhados entre as páginas Google Ads (Audience dashboard,
// Google Conversões e Google Audiences). Extraídos do antigo GoogleAdsAdmin
// para evitar duplicação.

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export const microsToEur = (m: number | null | undefined) => ((m ?? 0) / 1_000_000);

export const fmtEur = (eur: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(eur);

export const fmtNum = (n: number | null | undefined) =>
  new Intl.NumberFormat("pt-PT").format(Number(n ?? 0));

export const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;

// Badge de status genérico para campanhas / grupos / keywords.
export function statusBadge(status: string | null | undefined) {
  const s = (status ?? "").toUpperCase();
  if (s === "ENABLED") return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (s === "PAUSED") return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (s === "REMOVED") return "bg-red-500/15 text-red-500 border border-red-500/30";
  return "bg-muted text-muted-foreground";
}

// Badge de status para conversões offline.
export function statusBadgeConv(status: string) {
  if (status === "sent") return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (status === "pending") return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (status === "failed") return "bg-red-500/15 text-red-500 border border-red-500/30";
  return "bg-muted text-muted-foreground";
}

// Badge de status para user lists (Customer Match).
export function listStatusBadge(s: string) {
  if (s === "active") return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (s === "draft") return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (s === "error") return "bg-red-500/15 text-red-500 border border-red-500/30";
  return "bg-muted text-muted-foreground";
}

// Badge de status para jobs.
export function jobStatusBadge(s: string) {
  if (s === "completed" || s === "success") return "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30";
  if (s === "pending" || s === "running") return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
  if (s === "failed" || s === "error") return "bg-red-500/15 text-red-500 border border-red-500/30";
  return "bg-muted text-muted-foreground";
}

export function truncate(s: string, n = 14): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// Extrai mensagem de erro de uma edge function invocation (Supabase).
export async function extractEdgeError(error: any): Promise<string> {
  let detail = error?.message ?? String(error);
  const ctx = error?.context;
  if (ctx) {
    try {
      const b = await (ctx.clone ? ctx.clone() : ctx).json();
      detail = b?.message || b?.detail || b?.error || detail;
    } catch {}
  }
  return detail;
}

// ----- KpiCard reutilizável (mesmo padrão do Dashboard Meta) -----
export function KpiCard({
  label,
  big,
  subtitle,
  accent = "default",
}: {
  label: string;
  big: string;
  subtitle?: string;
  accent?: "default" | "primary";
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        accent === "primary" &&
          "border-emerald-500/40 bg-gradient-to-br from-emerald-500/[0.04] to-transparent",
      )}
    >
      <CardContent className="p-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </div>
        <div className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{big}</div>
        {subtitle && <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}
