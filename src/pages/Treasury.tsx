import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FinancialPositionAccess } from "@/components/financial-position/FinancialPositionAccess";
import { TreasuryBridgeView } from "@/components/treasury/TreasuryBridgeView";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useTreasuryBridge } from "@/hooks/useTreasuryBridge";
import { useCompanyLocale } from "@/hooks/useCompanyLocale";
import { formatMoney } from "@/lib/company-locale";
import { exportTreasuryPdf } from "@/lib/export-treasury-pdf";
import { TREASURY_CURRENT_STATE, TREASURY_DIAGNOSTIC, TREASURY_LIVE_PARTNERS } from "@/lib/treasury-bridge";

const validDate = (s: string) => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const dateLabel = (s: string) => s ? s.split("-").reverse().join("/") : "sem limite";

function TreasuryContent() {
  const [search, setSearch] = useSearchParams();
  const period = search.has("de") || search.has("ate");
  const from = search.get("de") ?? "";
  const to = search.get("ate") ?? "";
  const valid = validDate(from) && validDate(to) && (!from || !to || from <= to);
  const query = useTreasuryBridge(period ? from || null : null, period ? to || null : null, valid);
  const locale = useCompanyLocale();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const periodLabel = period ? `Período: ${dateLabel(from)} a ${dateLabel(to)}` : "Tempo real · acumulado";
  const setDate = (key: "de" | "ate", value: string) => {
    setSearch(previous => { const next = new URLSearchParams(previous); next.set(key, value); return next; });
  };
  const ready = valid && query.data && !query.error && !query.companyMissing && locale.status === "available" && !locale.isLoading && !locale.isError;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Tesouraria</h1>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={query.isFetching || query.companyMissing} onClick={() => void query.refresh()}>Atualizar</Button>
        <Button disabled={!ready || query.isFetching || exporting} onClick={async () => {
          if (!ready || !query.data || !query.companyId || locale.status !== "available") return;
          setExporting(true); setExportError(false);
          try { await exportTreasuryPdf({ companyId: query.companyId, data: query.data, locale, periodLabel, retainedOutside: query.retainedOutside ?? 0 }); }
          catch { setExportError(true); }
          finally { setExporting(false); }
        }}>{exporting ? "A gerar PDF…" : "Exportar PDF"}</Button>
      </div>
    </header>
    <p className="rounded-md border border-warning/50 bg-warning/5 p-3">{TREASURY_DIAGNOSTIC}</p>
    <div className="space-y-2 text-sm text-muted-foreground"><p>{TREASURY_CURRENT_STATE}</p><p>{TREASURY_LIVE_PARTNERS}</p><p>Históricos e cancelados excluídos. Sub-eventos herdam a linha de negócio do Master. Caixa e retido só se combinam na ponte.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <div role="group" aria-label="Horizonte da Tesouraria" className="flex gap-2">
        <Button variant={period ? "outline" : "default"} aria-pressed={!period} onClick={() => setSearch(previous => { const next = new URLSearchParams(previous); next.delete("de"); next.delete("ate"); return next; })}>Tempo real</Button>
        <Button variant={period ? "default" : "outline"} aria-pressed={period} onClick={() => { if (!period) setDate("de", ""); }}>Período</Button>
      </div>
      {period && <><div><label htmlFor="treasury-from">De</label><DatePicker id="treasury-from" aria-label="De" clearable value={from} onChange={v => setDate("de", v)} /></div>
        <div><label htmlFor="treasury-to">Até</label><DatePicker id="treasury-to" aria-label="Até" clearable value={to} onChange={v => setDate("ate", v)} /></div></>}
    </div>
    <p className="text-sm">{periodLabel}</p>
    {!valid ? <p role="alert">Período inválido. Use datas válidas e De anterior ou igual a Até.</p>
      : query.error || query.companyMissing || locale.isError ? <p role="alert">Tesouraria indisponível: {query.companyMissing ? "empresa não identificada" : String((query.error as Error)?.message ?? "erro na leitura da empresa")}. Nenhum total parcial é apresentado.</p>
      : query.isLoading || !query.data || locale.isLoading ? <p role="status">A carregar Tesouraria… Masters: {query.progress.done}/{query.progress.total}</p>
      : locale.status !== "available" ? <p role="alert">{locale.message}</p>
      : <><TreasuryBridgeView data={query.data} money={v => v === null ? "—" : formatMoney(v, locale)} />
        <p className="text-sm text-muted-foreground">Retido fora dos eventos incluídos / sem atribuição: {formatMoney(query.retainedOutside, locale)}. Não distribuído pela ponte.</p></>}
    {query.isFetching && query.data && <p role="status">A atualizar Tesouraria… Masters: {query.progress.done}/{query.progress.total}</p>}
    {exportError && <p role="alert">Não foi possível gerar o PDF.</p>}
  </div>;
}

export default function Treasury() {
  return <FinancialPositionAccess><TreasuryContent /></FinancialPositionAccess>;
}
