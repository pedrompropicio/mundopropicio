import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowLeftRight, Landmark, Receipt, Timer, ClipboardList, FolderTree,
  AlertTriangle, FileOutput, FileWarning, Music, ArrowLeft, Loader2,
} from "lucide-react";

// Reuse existing Report components — already query by current_company_id() server-side.
const ReportCashFlow = lazy(() => import("@/components/ReportCashFlow"));
const ReportBankStatement = lazy(() => import("@/components/ReportBankStatement"));
const ReportContasPagar = lazy(() => import("@/components/ReportContasPagar"));
const ReportAging = lazy(() => import("@/components/ReportAging"));
const ReportIvaAudit = lazy(() => import("@/components/ReportIvaAudit"));
const ReportAccountingExport = lazy(() => import("@/components/ReportAccountingExport"));
const ReportDocumentPendencies = lazy(() => import("@/components/ReportDocumentPendencies"));
const ReportArtistCache = lazy(() => import("@/components/ReportArtistCache"));
const ReportPaymentLists = lazy(() => import("@/pages/ReportPaymentListsPage"));
const ReportAccountCategoriesPage = lazy(() => import("@/pages/ReportAccountCategoriesPage"));

type ReportKey =
  | "cashflow" | "bank" | "contas-pagar" | "aging"
  | "payment-lists" | "plano-contas"
  | "iva" | "accounting-export" | "pendencias"
  | "cache-artista";

interface ReportDef {
  key: ReportKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  render: () => JSX.Element;
}

const GROUPS: { label: string; items: ReportDef[] }[] = [
  {
    label: "Fluxo Financeiro",
    items: [
      { key: "cashflow", label: "Fluxo de Caixa", description: "Receitas vs despesas por período", icon: ArrowLeftRight,
        render: () => <ReportCashFlow /> },
      { key: "bank", label: "Extrato Bancário", description: "Movimentações por conta financeira", icon: Landmark,
        render: () => <ReportBankStatement /> },
      { key: "contas-pagar", label: "Contas a Pagar", description: "Despesas pendentes e vencidas", icon: Receipt,
        render: () => <ReportContasPagar /> },
      { key: "aging", label: "Aging de Contas a Pagar", description: "Distribuição por antiguidade", icon: Timer,
        render: () => <ReportAging /> },
    ],
  },
  {
    label: "Listas",
    items: [
      { key: "payment-lists", label: "Listas de Pagamento", description: "Lotes de pagamentos aprovados", icon: ClipboardList,
        render: () => <ReportPaymentLists /> },
      { key: "plano-contas", label: "Plano de Contas", description: "Estrutura analítica L1→L3", icon: FolderTree,
        render: () => <ReportAccountCategoriesPage /> },
    ],
  },
  {
    label: "Fiscal / Operacional",
    items: [
      { key: "iva", label: "Auditoria de IVA", description: "Consistência conforme Art.º 18.º CIVA", icon: AlertTriangle,
        render: () => <ReportIvaAudit /> },
      { key: "accounting-export", label: "Exportação Contábil", description: "Exporta transações + documentos fiscais", icon: FileOutput,
        render: () => <ReportAccountingExport /> },
      { key: "pendencias", label: "Pendências Documentais", description: "Transações sem documento contábil", icon: FileWarning,
        render: () => <ReportDocumentPendencies /> },
    ],
  },
  {
    label: "Outros",
    items: [
      { key: "cache-artista", label: "Cachê do Artista", description: "Demonstrativo analítico por artista", icon: Music,
        render: () => <ReportArtistCache /> },
    ],
  },
];

export function AccountantReportsTab() {
  const [selected, setSelected] = useState<ReportKey | null>(null);

  if (selected) {
    const def = GROUPS.flatMap((g) => g.items).find((i) => i.key === selected);
    if (!def) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{def.label}</h2>
            <p className="text-sm text-muted-foreground">{def.description}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar aos relatórios
          </Button>
        </div>
        <Suspense fallback={<div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />A carregar relatório…</div>}>
          <div>{def.render()}</div>
        </Suspense>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Selecione um relatório. Todos os relatórios listados são read-only e respeitam a empresa activa no seletor acima.
      </div>
      {GROUPS.map((g) => (
        <section key={g.label} className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((it) => (
              <Card
                key={it.key}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(it.key)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(it.key); }}
                className="p-4 hover:bg-accent/50 cursor-pointer transition-colors flex gap-3 items-start"
              >
                <it.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium">{it.label}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{it.description}</div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default AccountantReportsTab;
