import { formatMoney, type CompanyLocale } from "@/lib/company-locale";
import { treasuryColumns, treasuryDisplayRows, type TreasuryBridge, type TreasuryNode } from "@/lib/treasury-bridge";

export function TreasuryBridgeTable({ node, locale }: { node: TreasuryNode; locale: CompanyLocale }) {
  return <div className="overflow-x-auto"><table aria-label={`Ponte — ${node.name}`} className="w-full text-sm">
    <thead><tr className="border-b"><th className="p-3 text-left">Onde está o dinheiro</th><th className="p-3 text-right">Sem pendentes</th><th className="p-3 text-right">Com pendentes</th></tr></thead>
    <tbody>{treasuryDisplayRows(node).map((row, index) => <tr key={row.label} className={`border-b ${index === 5 ? "bg-muted font-semibold" : ""}`}>
      <th scope="row" className="p-3 text-left font-inherit">{row.label}</th>
      <td className="p-3 text-right tabular-nums whitespace-nowrap">{formatMoney(row.withoutPending, locale)}</td>
      <td className="p-3 text-right tabular-nums whitespace-nowrap">{formatMoney(row.withPending, locale)}</td>
    </tr>)}</tbody>
    <tfoot><tr><th scope="row" className="p-3 text-left">7. % de participação da empresa</th><td colSpan={2} className="p-3 text-right">{node.housePct === undefined ? "—" : `${new Intl.NumberFormat(locale.locale, { maximumFractionDigits: 4 }).format(node.housePct)}%`}</td></tr>
      <tr><td colSpan={3} className="p-3 text-muted-foreground">8. Pendentes (nota): {formatMoney(node.amounts.pending, locale)}. Incluídos apenas no timing da coluna «Com pendentes».</td></tr></tfoot>
  </table></div>;
}

function TreasuryBranch({ node, locale }: { node: TreasuryNode; locale: CompanyLocale }) {
  const columns = treasuryColumns(node.amounts);
  return <details className="rounded-lg border p-3">
    <summary className="cursor-pointer p-1">
      <span className="font-medium">{node.name}</span>
      {node.source && <span className="ml-2 text-xs text-muted-foreground">{node.source}</span>}
      {!node.cashDetail && <span className="ml-3 text-sm tabular-nums text-muted-foreground">Sem pendentes: {formatMoney(columns.withoutPending[5], locale)} · Com pendentes: {formatMoney(columns.withPending[5], locale)}</span>}
    </summary>
    {node.cashDetail && <p className="px-3 pt-3 text-sm text-muted-foreground">Detalhe de timing, retido, caixa e pendentes. O resultado e os sócios são apurados no Master.</p>}
    <TreasuryBridgeTable node={node} locale={locale} />
    {node.children.length > 0 && <div className="mt-3 space-y-3 pl-3">{node.children.map((child) => <TreasuryBranch key={child.id} node={child} locale={locale} />)}</div>}
  </details>;
}

export function TreasuryBridgeView({ bridge, locale }: { bridge: TreasuryBridge; locale: CompanyLocale }) {
  return <div className="space-y-5">
    <section aria-label="Ponte da empresa" className="rounded-lg border"><h2 className="px-3 pt-4 text-lg font-semibold">Empresa · Onde está o dinheiro</h2><TreasuryBridgeTable node={bridge.company} locale={locale} /></section>
    <section aria-label="Linhas de negócio" className="space-y-3"><h2 className="text-lg font-semibold">Por linha de negócio</h2>
      {bridge.company.children.length ? bridge.company.children.map((line) => <TreasuryBranch key={line.id} node={line} locale={locale} />) : <p className="text-muted-foreground">Sem eventos nos estágios elegíveis.</p>}
    </section>
    <section aria-label="Movimentos comuns" className="rounded-lg border"><h2 className="px-3 pt-4 text-lg font-semibold">Comuns</h2><p className="px-3 pt-2 text-sm text-muted-foreground">Movimentos sem evento, fora das linhas de negócio e do total dos eventos.</p><TreasuryBridgeTable node={bridge.common} locale={locale} /></section>
  </div>;
}
