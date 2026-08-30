import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Download, FileText } from "lucide-react";
import { calcIvaAmount, roundCents } from "@/lib/iva";
import { formatInCurrency, isSupportedCurrency, type CurrencyCode } from "@/lib/currency";
import { useEventHouseLabel } from "@/hooks/useEventHouseLabel";
import { downloadCsv } from "@/lib/crm/csv-export";
import HelpTooltip from "@/components/HelpTooltip";

/**
 * Vista SÓ DE LEITURA "Despesas pagas por sócio" (documento de trabalho para a
 * fatura de acerto). Fonte = BP (`event_forecasts` aprovadas, sem snapshot),
 * porque em co-produção a despesa do sócio muitas vezes não tem transação (D-ERP3).
 *
 * Nunca calcula nem sugere IVA: usa `event_forecasts.iva_rate` tal como está
 * (0% mostra-se 0%). Moedas diferentes ficam em grupos separados, sem conversão.
 */

interface Props {
  eventId: string;
  eventName: string;
}

interface Line {
  id: string;
  payerId: string | null;
  payerName: string;
  ivaRate: number;
  currency: CurrencyCode;
  base: number;
  iva: number;
  isOverhead: boolean;
  catCode: string;
  catName: string;
}

interface Bucket {
  n: number;
  base: number;
  iva: number;
  overheadCount: number;
}

const emptyBucket = (): Bucket => ({ n: 0, base: 0, iva: 0, overheadCount: 0 });

function add(b: Bucket, l: Line) {
  b.n += 1;
  b.base = roundCents(b.base + l.base);
  b.iva = roundCents(b.iva + l.iva);
  if (l.isOverhead) b.overheadCount += 1;
}

export function PartnerPaidExpensesBPView({ eventId, eventName }: Props) {
  const houseLabel = useEventHouseLabel(eventId);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["partner-paid-bp-view", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select(
          "id, amount, iva_rate, currency, is_overhead, paying_partner_id, category_id, account_categories(code, name), event_partners:paying_partner_id(id, suppliers(name))",
        )
        .eq("event_id", eventId)
        .eq("status", "approved")
        .is("version_id", null)
        .eq("type", "expense");
      if (error) throw error;
      return data ?? [];
    },
  });

  const lines: Line[] = useMemo(
    () =>
      (rows as any[]).map((r) => {
        const base = Number(r.amount) || 0;
        const rate = Number(r.iva_rate) || 0;
        const ccy = isSupportedCurrency(r.currency) ? (r.currency as CurrencyCode) : "EUR";
        return {
          id: r.id,
          payerId: r.paying_partner_id ?? null,
          payerName: r.paying_partner_id
            ? r.event_partners?.suppliers?.name || "Sócio"
            : houseLabel,
          ivaRate: rate,
          currency: ccy,
          base,
          iva: calcIvaAmount(base, rate),
          isOverhead: r.is_overhead === true,
          catCode: r.account_categories?.code || "—",
          catName: r.account_categories?.name || "Sem rubrica",
        };
      }),
    [rows, houseLabel],
  );

  const groups = useMemo(() => {
    const byPayer = new Map<
      string,
      {
        payerName: string;
        total: Bucket;
        rates: Map<
          string,
          { ivaRate: number; currency: CurrencyCode; total: Bucket; cats: Map<string, { code: string; name: string; b: Bucket }> }
        >;
      }
    >();
    for (const l of lines) {
      const pk = l.payerId ?? "__house__";
      if (!byPayer.has(pk)) byPayer.set(pk, { payerName: l.payerName, total: emptyBucket(), rates: new Map() });
      const p = byPayer.get(pk)!;
      add(p.total, l);
      const rk = `${l.currency}|${l.ivaRate}`;
      if (!p.rates.has(rk)) p.rates.set(rk, { ivaRate: l.ivaRate, currency: l.currency, total: emptyBucket(), cats: new Map() });
      const g = p.rates.get(rk)!;
      add(g.total, l);
      const ck = `${l.catCode}|${l.catName}`;
      if (!g.cats.has(ck)) g.cats.set(ck, { code: l.catCode, name: l.catName, b: emptyBucket() });
      add(g.cats.get(ck)!.b, l);
    }
    return Array.from(byPayer.entries()).map(([id, v]) => ({
      id,
      payerName: v.payerName,
      total: v.total,
      rates: Array.from(v.rates.entries())
        .map(([rk, r]) => ({
          key: rk,
          ivaRate: r.ivaRate,
          currency: r.currency,
          total: r.total,
          cats: Array.from(r.cats.values()).sort((a, b) => a.code.localeCompare(b.code)),
        }))
        .sort((a, b) => a.currency.localeCompare(b.currency) || b.ivaRate - a.ivaRate),
    }));
  }, [lines]);

  const grand = useMemo(() => {
    const byCcy = new Map<CurrencyCode, Bucket>();
    for (const l of lines) {
      if (!byCcy.has(l.currency)) byCcy.set(l.currency, emptyBucket());
      add(byCcy.get(l.currency)!, l);
    }
    return Array.from(byCcy.entries());
  }, [lines]);

  const money = (v: number, c: CurrencyCode) => formatInCurrency(v, c);
  const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

  const exportCsv = (g: (typeof groups)[number]) => {
    const header = ["Sócio", "Moeda", "Taxa IVA", "Rubrica (código)", "Rubrica", "Nº linhas", "Base s/IVA", "IVA", "Total c/IVA", "Overhead (nº linhas)"];
    const out = [`sep=;`, header.join(";")];
    for (const r of g.rates) {
      for (const c of r.cats) {
        out.push(
          [
            g.payerName,
            r.currency,
            `${r.ivaRate}%`,
            c.code,
            c.name,
            String(c.b.n),
            c.b.base.toFixed(2),
            c.b.iva.toFixed(2),
            roundCents(c.b.base + c.b.iva).toFixed(2),
            String(c.b.overheadCount),
          ]
            .map((x) => (/[";\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x))
            .join(";"),
        );
      }
    }
    downloadCsv(out.join("\r\n"), `despesas-pagas-${slug(eventName)}-${slug(g.payerName)}.csv`);
  };

  return (
    <div className="glass rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Despesas pagas por sócio (BP)</h3>
        <HelpTooltip text="Vista só de leitura sobre as linhas de despesa aprovadas do Business Plan, agrupadas por sócio pagador e taxa de IVA. Serve de documento de trabalho para a fatura de acerto. Não cria nem altera lançamentos." />
      </div>
      <p className="text-xs text-muted-foreground">
        Fonte: linhas de despesa aprovadas do BP (sem snapshots). A taxa de IVA é a registada na linha — nunca calculada.
        Moedas diferentes aparecem em grupos separados, sem conversão.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Sem linhas de despesa aprovadas no BP deste evento — nada a acertar por agora.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id} className="rounded-lg border border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{g.payerName}</span>
                  <Badge variant="secondary" className="text-[10px]">{g.total.n} linhas</Badge>
                  {g.id === "__house__" && <Badge variant="outline" className="text-[10px]">empresa do evento</Badge>}
                </div>
                <Button size="sm" variant="outline" onClick={() => exportCsv(g)}>
                  <Download className="h-3.5 w-3.5 mr-1" /> CSV detalhe
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Taxa de IVA</TableHead>
                    <TableHead className="text-right">Nº linhas</TableHead>
                    <TableHead className="text-right">Base s/IVA</TableHead>
                    <TableHead className="text-right">IVA</TableHead>
                    <TableHead className="text-right">Total c/IVA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.rates.map((r) => {
                    const k = `${g.id}|${r.key}`;
                    const isOpen = !!open[k];
                    return (
                      <Fragment key={k}>
                        <TableRow className="cursor-pointer" onClick={() => setOpen((o) => ({ ...o, [k]: !o[k] }))}>
                          <TableCell className="font-medium text-sm">
                            <span className="inline-flex items-center gap-1">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              {r.ivaRate}%
                              {r.currency !== "EUR" && (
                                <Badge variant="outline" className="ml-1 text-[10px]">{r.currency}</Badge>
                              )}
                              {r.total.overheadCount > 0 && (
                                <Badge variant="secondary" className="ml-1 text-[10px]">overhead: {r.total.overheadCount}</Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.total.n}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{money(r.total.base, r.currency)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{money(r.total.iva, r.currency)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{money(roundCents(r.total.base + r.total.iva), r.currency)}</TableCell>
                        </TableRow>
                        {isOpen &&
                          r.cats.map((c) => (
                            <TableRow key={`${k}|${c.code}|${c.name}`} className="bg-muted/10">
                              <TableCell className="pl-8 text-xs">
                                <span className="font-mono text-muted-foreground mr-1">{c.code}</span>
                                {c.name}
                                {c.b.overheadCount > 0 && (
                                  <Badge variant="secondary" className="ml-1 text-[10px]">overhead</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs">{c.b.n}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{money(c.b.base, r.currency)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{money(c.b.iva, r.currency)}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{money(roundCents(c.b.base + c.b.iva), r.currency)}</TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}
                  <TableRow className="border-t-2 border-border bg-muted/30">
                    <TableCell className="font-bold text-xs">Total {g.payerName}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-xs">{g.total.n}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-xs">
                      {g.rates.length > 0 && g.rates.every((r) => r.currency === g.rates[0].currency)
                        ? money(g.total.base, g.rates[0].currency)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-xs">
                      {g.rates.length > 0 && g.rates.every((r) => r.currency === g.rates[0].currency)
                        ? money(g.total.iva, g.rates[0].currency)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-xs">
                      {g.rates.length > 0 && g.rates.every((r) => r.currency === g.rates[0].currency)
                        ? money(roundCents(g.total.base + g.total.iva), g.rates[0].currency)
                        : "—"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ))}

          <div className="rounded-lg border border-border/60 p-3 space-y-1">
            <p className="text-xs font-semibold">Total geral</p>
            {grand.map(([ccy, b]) => (
              <div key={ccy} className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <span>{ccy} · {b.n} linhas</span>
                <span>
                  base {money(b.base, ccy)} · IVA {money(b.iva, ccy)} · total {money(roundCents(b.base + b.iva), ccy)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PartnerPaidExpensesBPView;
