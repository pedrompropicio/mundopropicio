import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useFinancialPositionP5 } from "@/hooks/useFinancialPositionP5";
import { useRetainedComposition, type RetainedComposition } from "@/hooks/useRetainedComposition";
import { formatPositionAmount as eur, formatPositionDate as date, type FinancialPosition } from "@/lib/financial-position";
import { cacheArtistDisplayName, cacheArtistLabel, retainedRowsToShow, type Caches } from "@/lib/financial-position-p6b";
import type { FinancialPositionP5 } from "@/lib/financial-position-p5";

const line = (label: string, value: number | null, muted = false) => (
  <div className="flex flex-wrap justify-between gap-2 py-1 text-sm"><span className={muted ? "text-muted-foreground" : ""}>{label}</span><span className="font-mono tabular-nums">{eur(value)}</span></div>
);

/** P6b: cachês aprovados por pagar (filhas com evento). Informativo: já incluído no total a pagar. */
export function CachesView({ caches, names, explain }: { caches: Caches; names: Record<string, string>; explain?: React.ReactNode }) {
  return <div className="mt-5 border-l-2 border-primary pl-4" aria-label="Cachês aprovados por pagar">
    <h3 className="flex flex-wrap justify-between gap-2 font-medium"><span>Cachês aprovados por pagar · já incluídos no total</span><span className="flex items-center gap-1"><span className="font-mono tabular-nums">{eur(caches.total)}</span>{explain}</span></h3>
    {caches.por_artista.length === 0 ? <p className="text-sm text-muted-foreground">Sem cachês por pagar</p> : caches.por_artista.map(a => {
      const label = cacheArtistLabel(a.artist_supplier_id ? names[a.artist_supplier_id] ?? null : null, a.artista);
      return <div key={a.artist_supplier_id ?? label} className="mt-3">
        {line(label, a.total)}
        <div className="ml-3 border-l border-border pl-3">
          {a.por_evento.map(e => <div key={e.evento_id}>{line(e.evento ?? "—", e.total, true)}</div>)}
          {a.retencao_irs > 0 && line("Retenção IRS (não é custo do evento)", a.retencao_irs, true)}
        </div>
      </div>;
    })}
    {caches.retencao_irs_total > 0 && <div className="mt-3">{line("Dos quais retenção IRS (não é custo do evento)", caches.retencao_irs_total, true)}</div>}
    {caches.sem_contrato.n > 0 && line(`Outros cachês sem contrato · ${caches.sem_contrato.n} transações`, caches.sem_contrato.total, true)}
    <p className="mt-2 text-xs text-muted-foreground">{caches.nota}</p>
  </div>;
}

export function useCacheArtistNames() {
  const { companyId } = useCompany();
  return useQuery({
    queryKey: ["financial-position-cache-names", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("event_cache_configs").select("supplier_id, artist_name").eq("company_id", companyId);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const r of data || []) { const n = cacheArtistDisplayName(r.artist_name); if (r.supplier_id && n && !out[r.supplier_id]) out[r.supplier_id] = n; }
      return out;
    },
  });
}

type RetidoRow = FinancialPosition["retido"]["visivel"][number];
/** P6b: composição por bilheteira, com a fórmula do painel da bilheteira; nunca rateia o pool. */
export function RetainedCompositionView({ rows, compositions, visible }: { rows: RetidoRow[]; compositions: RetainedComposition[] | null; visible: boolean }) {
  if (!visible) return null;
  const byId = new Map((compositions ?? []).map(c => [c.accountId, c]));
  return <div className="mt-6" aria-label="Composição do retido">
    <h3 className="font-medium">Composição do retido por bilheteira</h3>
    <div className="mt-2 grid gap-x-10 gap-y-5 lg:grid-cols-2">{rows.map(r => {
      const c = byId.get(r.account_id); const dcp = c?.decomposition;
      const diff = c && r.saldo !== null ? Math.round((c.globalBalance - r.saldo) * 100) / 100 : 0;
      return <div key={r.account_id} className="min-w-0">
        <h4 className="flex flex-wrap justify-between gap-2 text-sm font-semibold"><span>{r.name}</span><span className="font-mono tabular-nums">{eur(r.saldo)}</span></h4>
        {!c ? <p className="text-sm text-muted-foreground">A carregar…</p> : !dcp ? <>
          {line("Sem apuramento: vendas e movimentos da bilheteira", c.globalBalance, true)}
        </> : <>
          {line(`Posição do apuramento n.º ${dcp.statement.number ?? "—"}${dcp.statement.status === "draft" ? " (rascunho)" : ""} · ${date(dcp.statement.statement_date ?? null)}`, dcp.position, true)}
          {line(`+ Vendas de eventos sem fecho (${dcp.openEvents.length})`, dcp.openTotal, true)}
          {line("+ Por conciliar (repasses posteriores ao apuramento)", dcp.residual, true)}
          <p className="mt-1 text-xs text-muted-foreground">Composição baseada no apuramento n.º {dcp.statement.number ?? "—"} de {date(dcp.statement.statement_date ?? null)}; muda quando houver novo apuramento. A bilheteira não reparte por evento antes do fecho.</p>
        </>}
        {c && Math.abs(diff) >= 0.01 && <p role="alert" className="mt-1 text-xs text-warning">Composição não fecha com o Saldo Geral (dif. {eur(diff)})</p>}
      </div>;
    })}</div>
    <p className="mt-3 text-xs text-muted-foreground">O retido não soma ao caixa (D-ERP27).</p>
  </div>;
}

export function RetainedCompositionSection({ data }: { data: FinancialPosition }) {
  const rows = retainedRowsToShow([...data.retido.visivel, ...data.retido.ocultas]);
  const q = useRetainedComposition(rows.map(r => r.account_id), data.meta.balances_visible);
  if (q.isError) return <p role="alert" className="mt-6 text-sm text-warning">Composição do retido indisponível neste momento.</p>;
  return <RetainedCompositionView rows={rows} compositions={q.data ?? null} visible={data.meta.balances_visible} />;
}

export function ResultadoMpView({ data }: { data: FinancialPositionP5 | null }) {
  const r = data?.resultado_mp_ano ?? null;
  if (!data || !r) return <p className="text-sm text-muted-foreground">Indisponível neste momento{data?.meta.incompleto ? " (cálculo incompleto)" : ""}.</p>;
  const part = r.participacoes.cloudscape;
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="rounded-md bg-muted/30 p-4"><p className="text-sm text-muted-foreground">Resultado da MP · sem estrutura</p><p className="text-xl font-semibold tabular-nums">{eur(r.sem_estrutura)}</p></div>
    <div className="rounded-md bg-muted/30 p-4"><p className="text-sm text-muted-foreground">Resultado da MP · com estrutura</p><p className="text-xl font-semibold tabular-nums">{eur(r.com_estrutura)}</p></div>
    <div className="rounded-md bg-muted/30 p-4"><p className="text-sm text-muted-foreground">Participação na Cloudscape (Coala)</p><p className="text-xl font-semibold tabular-nums">{eur(part.valor)}</p></div>
    <div className="rounded-md border border-primary/40 bg-muted/30 p-4"><p className="text-sm text-muted-foreground">Resultado total da MP</p><p className="text-xl font-semibold tabular-nums">{eur(r.total_mp)}</p></div>
    <p className="text-xs text-muted-foreground sm:col-span-2">Só eventos em fecho e fechados; eventos em curso ficam fora (projeção). A participação na Cloudscape ({part.linhas} {part.linhas === 1 ? "linha" : "linhas"}) já está dentro do caixa — soma só ao resultado, não ao Saldo Geral.</p>
  </div>;
}

export function ResultadoMpSection({ year }: { year: number | null }) {
  const q = useFinancialPositionP5(year);
  if (q.isLoading) return <p role="status" className="text-sm text-muted-foreground">A carregar resultado da MP…</p>;
  return <ResultadoMpView data={q.isError ? null : q.data ?? null} />;
}
