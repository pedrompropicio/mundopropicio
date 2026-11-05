import { Button } from "@/components/ui/button";
import { formatMoney, type CompanyLocale } from "@/lib/company-locale";
import { treasuryColumns, treasuryDateLabel, type TreasuryBridge, type TreasuryConferenceRow } from "@/lib/treasury-bridge";
import type { loadTreasuryConference } from "@/hooks/useTreasuryBridge";

export type TreasuryConferenceData = Awaited<ReturnType<typeof loadTreasuryConference>>;
const scopeIds = (row: TreasuryConferenceRow) => new Set([row.id, ...row.children.map((child) => child.id)]);
function transactionsFor(row: TreasuryConferenceRow, data?: TreasuryConferenceData) {
  const ids = scopeIds(row);
  return data?.transactions.filter((transaction) => transaction.event_id && ids.has(transaction.event_id)) ?? [];
}
function accountLabel(id: string | null, data?: TreasuryConferenceData) {
  return id ? `${data?.accounts.find((account) => account.id === id)?.name ?? "Conta"} (${id})` : "Sem conta";
}
function rpcReason(transaction: TreasuryConferenceData["transactions"][number], data?: TreasuryConferenceData) {
  const account = data?.accounts.find((item) => item.id === transaction.account_id);
  if (!account || !["bank", "cash", "prepaid_card"].includes(account.type) || account.skip_balance_check) return "Conta fora do RPC caixa";
  if (transaction.status === "partially_paid") return "Saldo excluído de committed pelo RPC · R2 pendente";
  if (transaction.status === "approved") return "Saldo em committed do RPC caixa";
  if (transaction.status === "pending") return "Montante em pending do RPC caixa (linha 8)";
  return transaction.status === "paid" ? "Pago · sem saldo comprometido" : "Estado fora de committed e pending; conferir realized no RPC";
}
function paymentText(payment: TreasuryConferenceData["payments"][number], data?: TreasuryConferenceData) {
  return `Pagamento ${payment.id} · ${accountLabel(payment.account_id, data)} · montante ${payment.amount} · retenção ${payment.withholding_amount} · crédito ${payment.credit_amount} · data ${payment.payment_date} · ${payment.status}${payment.reversed_at ? " · revertido" : ""}`;
}
function transactionText(transaction: TreasuryConferenceData["transactions"][number], data?: TreasuryConferenceData) {
  return `${transaction.id} · ${transaction.type} · ${transaction.status} · ${accountLabel(transaction.account_id, data)} · montante ${transaction.amount} · pago ${transaction.paid_amount} · saldo ${transaction.amount - transaction.paid_amount} · data DRE ${transaction.payment_date ?? transaction.due_date ?? transaction.date} · ${rpcReason(transaction, data)}${data?.payments.filter((payment) => payment.transaction_id === transaction.id).map((payment) => " | " + paymentText(payment, data)).join("") ?? ""}`;
}

/** Os Masters consolidam filhos; as linhas de detalhe nunca se voltam a somar. */
export function treasuryConferenceCsv(bridge: TreasuryBridge, data?: TreasuryConferenceData): string {
  const header = ["Evento ID", "Evento", "Master ID", "Âmbito", "Estágio", "Incluído", "Motivo", "Linha de negócio", "Fonte L1", "Receita no resultado", "Bilheteira no resultado", "Base de custos", "L1", "L2", "L3", "L4", "L5", "L6 sem pendentes", "L6 com pendentes", "RPC committed próprio", "RPC realized próprio", "RPC pending próprio", "Retido bruto", "Retido fora da ponte", "Motivo retido", "Bilheteiras", "Transações individuais"];
  const rows: unknown[][] = [];
  const add = (row: TreasuryConferenceRow, child = false) => {
    const values = treasuryColumns(row.amounts);
    rows.push([row.id, row.name, row.masterId, child ? "Detalhe (não somar ao Master)" : "Master consolidado", row.stage, row.included ? "sim" : "não", row.reason, row.businessLine,
      child ? "No Master" : row.source ?? "Fora do perímetro", row.revenue?.net, row.revenue?.ticketingNet, row.revenue?.expenseSource,
      ...values.withoutPending.map((value, index) => !row.included || child && [0, 4, 5].includes(index) ? "" : value),
      row.included && !child ? values.withPending[5] : "", row.rawCash.committed, row.rawCash.realized, row.rawCash.pending,
      row.retainedRaw, row.retainedExcluded, row.retainedReason,
      row.offices.map((office) => `${office.name} (${office.accountId}): ${office.retained}`).join(" | "), transactionsFor(row, data).map((transaction) => transactionText(transaction, data)).join(" | ")]);
    row.children.forEach((item) => add(item, true));
  };
  bridge.conference?.forEach((row) => add(row));
  const common = bridge.common.amounts;
  rows.push(["common", "Comuns", "", "Fora do total de eventos", "", "não", "Sem evento", "", "", "", "", "", "", common.committed, "", -common.realized, "", "", "", common.committed, common.realized, common.pending, "", "", "", "", data?.transactions.filter((transaction) => !transaction.event_id).map((transaction) => transactionText(transaction, data)).join(" | ")]);
  const cell = (value: unknown) => {
    // Texto externo nunca se torna fórmula ao abrir o CSV numa folha de cálculo.
    const raw = value == null ? "" : String(value);
    const safe = typeof value === "string" && /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
}

function downloadCsv(bridge: TreasuryBridge, data?: TreasuryConferenceData) {
  const url = URL.createObjectURL(new Blob([treasuryConferenceCsv(bridge, data)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "tesouraria-conferencia.csv"; link.click();
  URL.revokeObjectURL(url);
}

function ConferenceTable({ rows, locale, data, detail = false }: { rows: TreasuryConferenceRow[]; locale: CompanyLocale; data?: TreasuryConferenceData; detail?: boolean }) {
  const money = (value: number | null) => formatMoney(value, locale);
  return <div className="overflow-x-auto"><table aria-label={detail ? "Conferência dos sub-eventos" : "Conferência por Master"} className="w-full text-sm">
    <thead><tr>{["Evento / fonte", "Estágio", "Incluído / motivo", "Linha de negócio", "1. Resultado", "2. Timing", "3. Retido", "4. Caixa", "5. Sócios", "6. Disponibilidade", "RPC próprio (cru)", "Retido por bilheteira"].map((label) => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead>
    <tbody>{rows.map((row) => {
      const values = treasuryColumns(row.amounts).withoutPending;
      return <tr key={row.id} className="border-t align-top">
        <th scope="row" className="p-3 text-left font-normal"><strong>{row.name}</strong><p className="break-all text-xs">{row.id}</p>
          <p>{detail ? "Resultado e sócios no Master" : row.source ?? "Resultado fora do perímetro"}</p>
          {row.revenue && <p>Receita no resultado: {money(row.revenue.net)} · Bilheteira: {money(row.revenue.ticketingNet)} ({row.revenue.ticketingSource}) · Custos: {row.revenue.expenseSource}</p>}
          {!detail && <p>Master consolidado; não somar o detalhe dos filhos.</p>}
          {row.children.length > 0 && <details><summary className="cursor-pointer">Sub-eventos de {row.name}</summary><ConferenceTable rows={row.children} locale={locale} data={data} detail /></details>}
          {data && <details><summary className="cursor-pointer">Transações de {row.name}</summary><p>Detalhes individuais; receita anual agregada e perímetro DRE na SQL. Data DRE = pagamento, vencimento ou data. Valores sem IVA.</p>
            {transactionsFor(row, data).map((transaction) => <div key={transaction.id} className="my-2 font-normal"><p>{transaction.id} · {transaction.type} · {transaction.status} · {accountLabel(transaction.account_id, data)}</p>
              <p>Montante: {money(transaction.amount)} · Pago: {money(transaction.paid_amount)} · Saldo: {money(transaction.amount - transaction.paid_amount)} · Data DRE: {treasuryDateLabel(transaction.payment_date ?? transaction.due_date ?? transaction.date)}</p>
              {data.payments.filter((payment) => payment.transaction_id === transaction.id).map((payment) => <p key={payment.id}>Pagamento {payment.id} · {accountLabel(payment.account_id, data)} · Montante: {money(payment.amount)} · Retenção: {money(payment.withholding_amount)} · Crédito: {money(payment.credit_amount)} · {treasuryDateLabel(payment.payment_date)} · {payment.status}{payment.reversed_at ? " · revertido" : ""}</p>)}
              <p>{rpcReason(transaction, data)}{transaction.reversed_at || transaction.is_hidden || transaction.is_transitory || transaction.exclude_from_result ? " · Com flags de exclusão do resultado; conferir SQL" : ""}</p>
            </div>)}
          </details>}
        </th>
        <td className="p-3">{row.stage}</td><td className="p-3">{row.reason}</td><td className="p-3">{row.businessLine}</td>
        {values.map((value, index) => <td key={index} className="p-3 whitespace-nowrap">{money(!row.included || detail && [0, 4, 5].includes(index) ? null : value)}<p className="text-xs text-muted-foreground">{index === 0 ? row.source : index === 1 || index === 3 ? "RPC caixa" : index === 2 ? "bilheteira" : index === 4 ? "base corrente · contratos" : "Σ linhas 1–5"}</p></td>)}
        <td className="p-3 whitespace-nowrap">committed: {money(row.rawCash.committed)}<br />realized: {money(row.rawCash.realized)}<br />pending: {money(row.rawCash.pending)}<p className="whitespace-normal">RPC caixa · do próprio evento; filhos em detalhe. Contas e ajustes nos pagamentos e transações.</p></td>
        <td className="p-3"><p>Bruto: {money(row.retainedRaw)} · Fora da ponte: {money(row.retainedExcluded)}</p><p>{row.retainedReason}</p>
          {row.offices.map((office) => <p key={office.accountId}>bilheteira · {office.name} ({office.accountId}): {money(office.retained)}</p>)}
        </td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export function TreasuryConferenceView({ bridge, locale, data, loading, error, periodMode = false }: {
  bridge: TreasuryBridge; locale: CompanyLocale; data?: TreasuryConferenceData; loading?: boolean; error?: unknown; periodMode?: boolean;
}) {
  const rows = bridge.conference ?? [];
  return <section aria-label="Conferência da Tesouraria" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Conferência por evento</h2><Button variant="outline" disabled={!data || loading || !!error} onClick={() => downloadCsv(bridge, data)}>Exportar CSV</Button></div>
    <p>As leituras do ecrã são independentes. Use Atualizar e compare com a SQL da mesma data, que usa um único snapshot.</p>
    <p>A linha 1 é resultado dos Masters elegíveis, com todos os seus filhos; a DRE Empresarial anual mostra receitas de todos os estágios. A base de custos não determina a fonte da receita: vendas reais substituem o BP por rubrica.</p>
    {periodMode && <p role="note">Modo Período: só realized é filtrado. A SQL e a Posição Financeira são de tempo real; volte a Tempo real para conferir.</p>}
    {loading && <p role="status">A carregar contas, transações e Posição Financeira…</p>}
    {!!error && <p role="alert">Conferência incompleta: {error instanceof Error ? error.message : "uma leitura falhou"}. Atualize para tentar novamente.</p>}
    <ConferenceTable rows={rows.filter((row) => row.included)} locale={locale} data={data} />
    <section aria-label="Eventos fora do perímetro"><h3 className="font-semibold">Fora do perímetro da ponte</h3><p>Históricos, cancelados e Masters sem estágio elegível; caixa e retido abaixo são informativos e não entram nas linhas 1–5.</p><ConferenceTable rows={rows.filter((row) => !row.included)} locale={locale} data={data} /></section>
    <p>Comuns à parte · RPC caixa: committed {formatMoney(bridge.common.amounts.committed, locale)}, realized {formatMoney(bridge.common.amounts.realized, locale)}, pending {formatMoney(bridge.common.amounts.pending, locale)}. Sem distribuição pelos eventos.</p>
    <aside className="space-y-2 rounded-lg bg-muted p-4 text-sm">
      <p>A linha 6 soma as linhas 1–5; não corresponde ao saldo bancário nem ao Saldo Geral da Posição Financeira. Para conferir caixa e cartões: saldos iniciais das contas líquidas − linha 4 da empresa + realized dos eventos excluídos + realized de Comuns. A SQL mede a diferença para posicao.caixa_e_cartoes, com os cortes das contas; uma diferença exige conferir os movimentos do RPC.</p>
      <p>O realized do RPC usa paid_amount na conta de origem da transação e soma withholding_amount + credit_amount das pernas em contas líquidas, com os respectivos cortes. Os detalhes mostram ambas as contas; os pagamentos não são somados de novo no cliente.</p>
      <p>O retido da Posição Financeira confere com os saldos canónicos das bilheteiras (incluindo o resíduo sem evento). A linha 3 inclui apenas o retido dedutível dos eventos elegíveis. Caixa e retido apresentam-se à parte.</p>
      {data && <><p>Posição Financeira · {treasuryDateLabel(data.position.meta.reference_date)} · Caixa e cartões: {formatMoney(data.position.posicao.caixa_e_cartoes, locale)} · Retido visível: {formatMoney(data.position.retido.total_visiveis, locale)} · Retido oculto: {formatMoney(data.position.retido.total_ocultas, locale)}</p>
        <p>Saldo inicial, diferenças e retido sem evento: conferir os agregados da SQL executada na mesma data. Esta vista não corrige o RPC que omite os saldos partially_paid.</p></>}
    </aside>
  </section>;
}
