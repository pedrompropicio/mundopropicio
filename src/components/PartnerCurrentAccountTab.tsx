import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { formatCurrency } from "@/lib/mock-data";
import { formatDatePT } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import {
  PARTNER_ACCOUNT_ID,
  PARTNER_PROFILE_ID,
  computePartnerTotals,
  exportPartnerCurrentAccountToExcel,
  type PartnerCurrentAccountData,
} from "@/lib/partner-current-account";

/**
 * Conta corrente do sócio (#193) — ecrã SÓ DE LEITURA.
 * Não escreve nada: nenhum INSERT/UPDATE/DELETE em nenhuma tabela.
 */

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function monthLabel(date: string) {
  const m = Number(date.slice(5, 7)) - 1;
  return `${MONTHS_PT[m] ?? date.slice(5, 7)} de ${date.slice(0, 4)}`;
}

export default function PartnerCurrentAccountTab() {
  const { companyId } = useCompany();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["partner-current-account", year, companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<PartnerCurrentAccountData> => {
      const [txRes, invRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, type, date, payment_date, description, paid_amount")
          .eq("account_id", PARTNER_ACCOUNT_ID)
          .is("reversed_at", null)
          .order("date", { ascending: true }),
        supabase
          .from("standalone_invoices")
          .select("id, supplier_name, invoice_number, invoice_date, total_amount")
          .eq("company_id", companyId as string)
          .eq("paid_by_partner_id", PARTNER_PROFILE_ID)
          .gte("invoice_date", from)
          .lt("invoice_date", to)
          .order("invoice_date", { ascending: true }),
      ]);
      if (txRes.error) throw txRes.error;
      if (invRes.error) throw invRes.error;

      const txs = (txRes.data ?? [])
        .map((t: any) => ({
          id: t.id as string,
          type: t.type as string,
          date: String(t.payment_date ?? t.date).slice(0, 10),
          description: (t.description ?? null) as string | null,
          amount: Number(t.paid_amount ?? 0),
        }))
        .filter((t) => t.date >= from && t.date < to)
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        withdrawals: txs.filter((t) => t.type === "income"),
        payroll: txs.filter((t) => t.type === "expense"),
        invoices: (invRes.data ?? []).map((i: any) => ({
          id: i.id as string,
          supplier_name: (i.supplier_name ?? null) as string | null,
          invoice_number: (i.invoice_number ?? null) as string | null,
          invoice_date: (i.invoice_date ?? null) as string | null,
          amount: Number(i.total_amount ?? 0),
        })),
      };
    },
  });

  const totals = useMemo(
    () => computePartnerTotals(data ?? { withdrawals: [], payroll: [], invoices: [] }),
    [data],
  );

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) list.push(y);
    return list;
  }, [currentYear]);

  const toggle = (key: string) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> A calcular…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="glass rounded-xl p-4 text-sm text-destructive">
        Não foi possível ler os movimentos: {(error as Error)?.message}
      </div>
    );
  }

  const d = data ?? { withdrawals: [], payroll: [], invoices: [] };

  const Section = ({
    id,
    title,
    count,
    total,
    children,
  }: {
    id: string;
    title: string;
    count: number;
    total: number;
    children: React.ReactNode;
  }) => (
    <div className="glass rounded-xl">
      <button
        type="button"
        onClick={() => toggle(id)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2">
          {open[id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-medium">{title}</span>
          <span className="text-xs text-muted-foreground">{count} movimentos</span>
        </div>
        <span className="font-semibold">{formatCurrency(total)}</span>
      </button>
      {open[id] && <div className="border-t border-border/50 p-2 overflow-x-auto">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Conta corrente do sócio</h2>
          <p className="text-sm text-muted-foreground">
            Não é um acerto financeiro: mede quanto das retiradas do sócio ainda não está
            justificado por folha de vencimentos ou por faturas no NIF da empresa.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => exportPartnerCurrentAccountToExcel(year, d, totals)}
          >
            <Download className="mr-1.5 h-4 w-4" /> Exportar Excel
          </Button>
        </div>
      </div>

      {/* Número grande */}
      <div className="glass rounded-xl p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Por justificar em {year}
        </p>
        <p
          className={`mt-1 text-3xl font-bold lg:text-4xl ${
            totals.unjustified > 0 ? "text-destructive" : "text-success"
          }`}
        >
          {formatCurrency(totals.unjustified)}
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {totals.unjustified > 0
            ? "Este valor é o que o sócio recebeu da empresa sem justificação contabilística. Se ficar assim a 31 de dezembro, é tratado como distribuição de lucros e paga imposto."
            : "Neste momento não há valor em falta: tudo o que o sócio recebeu está justificado."}
        </p>
      </div>

      {/* Parcelas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Retiradas</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(totals.withdrawals)}</p>
          <p className="text-[11px] text-muted-foreground">{d.withdrawals.length} movimentos</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Folha de vencimentos (bruto)
          </p>
          <p className="mt-1 text-2xl font-bold">− {formatCurrency(totals.payroll)}</p>
          <p className="text-[11px] text-muted-foreground">{d.payroll.length} movimentos</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Faturas pagas pelo sócio
          </p>
          <p className="mt-1 text-2xl font-bold">− {formatCurrency(totals.invoices)}</p>
          <p className="text-[11px] text-muted-foreground">{d.invoices.length} faturas</p>
        </div>
      </div>

      {/* Aviso do saldo */}
      <div className="glass rounded-xl border-l-4 border-amber-500 p-4 text-sm">
        <span className="font-medium">Atenção ao saldo da conta.</span>{" "}
        O saldo que a página de Contas mostra para a Conta Corrente do sócio não é este número:
        fica sempre acima do real pelo valor das faturas avulsas, porque as faturas nunca tocam
        contas financeiras.
      </div>

      {/* Aviso de completude */}
      <div className="glass rounded-xl p-4 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="space-y-1">
            <p className="font-medium">Este número só é verdadeiro com tudo lançado.</p>
            <p className="text-muted-foreground">
              Retiradas lançadas até{" "}
              <span className="font-medium text-foreground">
                {totals.lastWithdrawalDate ? formatDatePT(totals.lastWithdrawalDate) : "nenhuma em " + year}
              </span>
              . Folha lançada até{" "}
              <span className="font-medium text-foreground">
                {totals.lastPayrollDate ? monthLabel(totals.lastPayrollDate) : "nenhum mês em " + year}
              </span>
              . O que ainda não entrou não está aqui contado.
            </p>
          </div>
        </div>
      </div>

      {/* Listas */}
      <div className="space-y-3">
        <Section id="withdrawals" title="Retiradas" count={d.withdrawals.length} total={totals.withdrawals}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right w-[130px]">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.withdrawals.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>{formatDatePT(w.date)}</TableCell>
                  <TableCell className="text-xs">{w.description ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(w.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section id="payroll" title="Folha de vencimentos" count={d.payroll.length} total={totals.payroll}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Mês</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right w-[130px]">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.payroll.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="capitalize">{monthLabel(p.date)}</TableCell>
                  <TableCell className="text-xs">{p.description ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>

        <Section id="invoices" title="Faturas pagas pelo sócio" count={d.invoices.length} total={totals.invoices}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="w-[160px]">Nº fatura</TableHead>
                <TableHead className="w-[110px]">Data</TableHead>
                <TableHead className="text-right w-[130px]">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-xs">{i.supplier_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{i.invoice_number ?? "—"}</TableCell>
                  <TableCell>{i.invoice_date ? formatDatePT(i.invoice_date) : "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(i.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>
    </div>
  );
}
