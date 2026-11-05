import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FinancialPositionAccess } from "@/components/financial-position/FinancialPositionAccess";
import { TreasuryBridgeView } from "@/components/treasury/TreasuryBridgeView";
import { useTreasuryBridge } from "@/hooks/useTreasuryBridge";
import { useCompany } from "@/hooks/useCompany";
import { useCompanyLocale } from "@/hooks/useCompanyLocale";
import { treasuryPeriod, treasuryPeriodLabel, TREASURY_NOTES, type TreasuryPeriod } from "@/lib/treasury-bridge";

function TreasuryContent() {
  const [params, setParams] = useSearchParams();
  const hasDates = params.has("de") || params.has("ate");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const { companyId } = useCompany();
  const locale = useCompanyLocale();
  let period: TreasuryPeriod = { from: null, to: null };
  let periodError = "";
  try { period = treasuryPeriod(params); } catch (error) { periodError = (error as Error).message; }
  const query = useTreasuryBridge(period, !periodError);
  const periodMode = hasDates;
  const setDate = (key: "de" | "ate", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    // Um marcador vazio mantém o modo Período no URL, sem inventar uma data.
    if (!next.has("de") && !next.has("ate")) next.set("de", "");
    setParams(next);
  };
  const exportPdf = async () => {
    if (!query.bridge || !companyId || locale.status !== "available") return;
    setExporting(true); setExportError("");
    try {
      const { exportTreasuryPdf } = await import("@/lib/export-treasury-pdf");
      await exportTreasuryPdf({ companyId, bridge: query.bridge, period, periodMode, locale });
    } catch { setExportError("Não foi possível gerar o PDF."); }
    finally { setExporting(false); }
  };
  return <main className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Tesouraria</h1><p className="text-muted-foreground">Onde está o dinheiro · {treasuryPeriodLabel(period, periodMode)}</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => { void query.refresh(); }} disabled={query.refreshing}>Atualizar</Button><Button onClick={() => { void exportPdf(); }} disabled={!query.bridge || query.refreshing || exporting || locale.status !== "available"}>{exporting ? "A gerar PDF…" : "Exportar PDF"}</Button></div>
    </header>
    <div className="space-y-3"><div role="group" aria-label="Modo de consulta" className="flex gap-2">
      <Button variant={periodMode ? "outline" : "default"} aria-pressed={!periodMode} onClick={() => {
        const next = new URLSearchParams(params); next.delete("de"); next.delete("ate"); setParams(next);
      }}>Tempo real</Button>
      <Button variant={periodMode ? "default" : "outline"} aria-pressed={periodMode} onClick={() => {
        const next = new URLSearchParams(params); if (!hasDates) next.set("de", ""); setParams(next);
      }}>Período</Button>
    </div>
      {periodMode && <div className="flex flex-wrap gap-4"><div><label htmlFor="treasury-from" className="text-sm">De</label><DatePicker id="treasury-from" aria-label="De" value={params.get("de") ?? ""} onChange={(date) => setDate("de", date)} clearable /></div><div><label htmlFor="treasury-to" className="text-sm">Até</label><DatePicker id="treasury-to" aria-label="Até" value={params.get("ate") ?? ""} onChange={(date) => setDate("ate", date)} clearable /></div></div>}
    </div>
    <aside className="space-y-1 rounded-lg bg-muted p-4 text-sm text-muted-foreground">{TREASURY_NOTES.map((note) => <p key={note}>{note}</p>)}<p>Inclui eventos em planeamento, em curso, em fecho e fechados. O retido é atribuído pelos eventos das bilheteiras, sem distribuir saldos sem evento.</p></aside>
    {periodError && <p role="alert">{periodError}</p>}
    {query.error && <p role="alert">Tesouraria incompleta: {query.error instanceof Error ? query.error.message : "uma leitura falhou"}. Atualize para tentar novamente.</p>}
    {!query.error && !periodError && query.loading && <p role="status">A carregar Tesouraria · resultados: {query.loaded}/{query.total} eventos</p>}
    {locale.status === "unavailable" && <p role="alert">{locale.message}</p>}
    {exportError && <p role="alert">{exportError}</p>}
    {!periodError && !query.error && query.bridge && locale.status === "available" && <TreasuryBridgeView bridge={query.bridge} locale={locale} />}
  </main>;
}

export default function Treasury() {
  return <FinancialPositionAccess><TreasuryContent /></FinancialPositionAccess>;
}
