import { treasuryColumns, type TreasuryNode } from "@/lib/treasury-bridge";

export function treasuryDisplayRows(node: TreasuryNode): { label: string; without: number | null; with: number | null }[] {
  const columns = treasuryColumns(node.amounts);
  const labels = ["1. Resultado do evento", "2. Timing (comprometido ± pendentes)", "3. Retido na bilheteira", "4. Caixa cedido ao pool", "5. Sócios externos por liquidar", "6. Disponibilidade real"];
  return labels.map((label, index) => {
    const unavailable = node.kind === "cash" && [0, 4, 5].includes(index);
    return {
      label,
      without: unavailable ? null : (index === 5 ? columns.withoutPending.available : columns.withoutPending.rows[index]),
      with: unavailable ? null : (index === 5 ? columns.withPending.available : columns.withPending.rows[index]),
    };
  });
}

function BridgeTable({ node, money }: { node: TreasuryNode; money: (value: number | null) => string }) {
  return <div className="space-y-2">
    {node.origin && <p className="text-sm text-muted-foreground">Resultado: <strong>{node.origin}</strong></p>}
    {node.kind === "cash" && <p className="text-sm text-muted-foreground">Só movimentos de caixa e retido; resultado e sócios apurados no Master. Comuns ficam fora das linhas de negócio e do total de eventos.</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={`Ponte · ${node.name}`}>
      <thead><tr className="border-b"><th scope="col" className="p-2 text-left">Onde está o dinheiro</th><th scope="col" className="p-2 text-right">Sem pendentes</th><th scope="col" className="p-2 text-right">Com pendentes</th></tr></thead>
      <tbody>{treasuryDisplayRows(node).map((row, i) => <tr key={row.label} className={i === 5 ? "border-t font-semibold" : "border-b border-border/40"}>
        <th scope="row" className="p-2 text-left font-normal">{row.label}</th><td className="p-2 text-right tabular-nums whitespace-nowrap">{money(row.without)}</td><td className="p-2 text-right tabular-nums whitespace-nowrap">{money(row.with)}</td>
      </tr>)}</tbody>
    </table></div>
    {node.participation !== undefined && <p className="text-sm">7. Participação da empresa: {new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 4 }).format(node.participation)}% (informativa)</p>}
    <p className="text-sm text-muted-foreground">8. Pendentes: {money(node.amounts.pending)} — incluídos apenas no timing da coluna «Com pendentes».</p>
  </div>;
}

function Branch({ node, money }: { node: TreasuryNode; money: (value: number | null) => string }) {
  return <details className="rounded-md border p-3">
    <summary className="cursor-pointer font-medium">{node.name}</summary>
    <div className="mt-3 space-y-3"><BridgeTable node={node} money={money} />
      {node.children.map(child => <Branch key={child.id} node={child} money={money} />)}
    </div>
  </details>;
}

export function TreasuryBridgeView({ data, money }: { data: { company: TreasuryNode; common: TreasuryNode }; money: (value: number | null) => string }) {
  return <div className="space-y-5">
    <section aria-label="Ponte da empresa" className="space-y-3"><h2 className="text-xl font-semibold">Empresa · eventos</h2><BridgeTable node={data.company} money={money} />
      {data.company.children.map(line => <Branch key={line.id} node={line} money={money} />)}
    </section>
    <section aria-label="Comuns" className="space-y-3 border-t pt-4"><h2 className="text-xl font-semibold">Comuns</h2><BridgeTable node={data.common} money={money} /></section>
  </div>;
}
