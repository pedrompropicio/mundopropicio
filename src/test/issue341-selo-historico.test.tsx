import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionRow } from "@/components/TransactionRow";
import { useCompany, type Company } from "@/hooks/useCompany";
import { HISTORICAL_PAID_LABEL, isHistoricalImportedPaid } from "@/lib/historical-paid";
import { useTxIdsWithPayments } from "@/hooks/useTxIdsWithPayments";

const fixture = vi.hoisted(() => ({
  options: undefined as undefined | { queryKey: string[]; staleTime: number; queryFn: () => Promise<Set<string>> },
  pages: undefined as undefined | { id: string; transaction_id: string }[],
  ranges: [] as number[][],
  error: null as Error | null,
}));

vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: typeof fixture.options) => { fixture.options = options; return { data: undefined, isLoading: false }; },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "transaction_payments" || !fixture.pages) throw new Error("#341: serviço proibido na fixture UI");
      return { select: (columns: string) => {
        expect(columns).toBe("id, transaction_id");
        return { order: (column: string, options: unknown) => {
          expect([column, options]).toEqual(["id", { ascending: true }]);
          return { range: async (from: number, to: number) => {
            fixture.ranges.push([from, to]);
            return { data: fixture.pages!.slice(from, to + 1), error: fixture.error };
          } };
        } };
      } };
    },
  },
}));
vi.mock("@/components/TransactionOffsetsBlock", () => ({ OffsetPaidBadge: () => null }));
vi.mock("@/components/ReimbursementNoteRefBadge", () => ({ ReimbursementNoteRefBadge: () => null }));
vi.mock("@/components/AccountantReviewBadge", () => ({ AccountantReviewRowBadge: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));

const noop = () => {};
const transaction = {
  id: "fixture-tx", description: "Despesa sintética MP", type: "expense", amount: 100,
  iva_rate: 23, paid_amount: 123, status: "paid", payment_date: "2026-01-02",
  due_date: "2026-01-01", event_id: "fixture-event", split_percentage: null,
  events: { name: "Evento sintético", historical_at: null as string | null },
  created_at: "2026-01-01T12:00:00Z", updated_at: "2026-01-02T12:00:00Z",
};
function Row({ tx = transaction, historicalImportedPaid }: { tx?: typeof transaction; historicalImportedPaid?: boolean }) {
  return <table><tbody><TransactionRow transaction={tx} canApprove={false} historicalImportedPaid={historicalImportedPaid}
    onEdit={noop} onApprove={noop} onPayment={noop} onDocs={noop} onAudit={noop} onDelete={noop} /></tbody></table>;
}
beforeEach(() => {
  fixture.pages = undefined; fixture.ranges = []; fixture.error = null; fixture.options = undefined;
  vi.mocked(useCompany).mockReturnValue({ company: { id: "fixture-mp", country: "PT", currency: "EUR" } as Company,
    companyId: "fixture-mp", isLoading: false, isError: false, error: null, isPlatformAdmin: false, refetch: vi.fn() });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#341: rede proibida na fixture UI"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("#341 selo histórico", () => {
  it("congela antes da alteração o DOM MP PT/EUR com IVA e sem a prop nova", () => {
    const { container } = render(<Row />);
    const dom = container.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
    expect(createHash("sha256").update(dom).digest("hex")).toMatchInlineSnapshot(`"a284be13d7f8ad125c465b34c789b88ec2a147aa7552a5ec6c6f7716f91ff142"`);
    expect(screen.getByText("Pago")).toBeInTheDocument();
    expect(container.textContent).toContain("IVA 23%");
  });

  it.each([
    ["histórico pago sem linhas", "paid", "2026-10-27T12:00:00Z", new Set<string>(), true],
    ["Set por carregar", "paid", "2026-10-27T12:00:00Z", undefined, false],
    ["histórico com qualquer linha, mesmo reversed/planned", "paid", "2026-10-27T12:00:00Z", new Set(["fixture-tx"]), false],
    ["não histórico", "paid", null, new Set<string>(), false],
    ["histórico aprovado", "approved", "2026-10-27T12:00:00Z", new Set<string>(), false],
    ["histórico pendente", "pending", "2026-10-27T12:00:00Z", new Set<string>(), false],
  ] as const)("%s", (_name, status, historical_at, ids, expected) => {
    const tx = { ...transaction, status, events: { ...transaction.events, historical_at } };
    const eligible = isHistoricalImportedPaid(tx, ids);
    expect(eligible).toBe(expected);
    render(<Row tx={tx} historicalImportedPaid={eligible} />);
    if (expected) {
      expect(screen.getByText(HISTORICAL_PAID_LABEL)).toHaveAttribute("title", expect.stringContaining("declarativos"));
      expect(screen.getByText(HISTORICAL_PAID_LABEL)).toHaveClass("bg-success/15", "text-success");
    } else expect(screen.queryByText(HISTORICAL_PAID_LABEL)).not.toBeInTheDocument();
  });

  it("não herda o carimbo do master nem exige o selo nos consumidores sem prop", () => {
    const child = { ...transaction, events: { ...transaction.events, parent_event_id: "historical-master" } };
    expect(isHistoricalImportedPaid(child, new Set())).toBe(false);
    expect(isHistoricalImportedPaid({ ...transaction, events: null }, new Set())).toBe(false);
    render(<Row tx={{ ...transaction, events: { ...transaction.events, historical_at: "2026-10-27" } }} />);
    expect(screen.getByText("Pago")).toBeInTheDocument();
    expect(screen.queryByText(HISTORICAL_PAID_LABEL)).not.toBeInTheDocument();
  });

  it("o Set confirmado sem histórico produz exactamente o DOM dos consumidores sem prop", () => {
    const first = render(<Row />);
    const before = first.container.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
    first.unmount();
    const second = render(<Row historicalImportedPaid={isHistoricalImportedPaid(transaction, new Set())} />);
    expect(second.container.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).toBe(before);
  });

  it("pagina além de 1000 linhas, deduplica ids e não trunca no limite de segurança", async () => {
    fixture.pages = Array.from({ length: 20_001 }, (_, i) => ({ id: String(i), transaction_id: i < 20_000 ? "existing" : "last-page" }));
    useTxIdsWithPayments();
    const options = fixture.options!;
    expect(options.queryKey).toEqual(["transactions-with-payments"]);
    expect(options.staleTime).toBe(60_000);
    expect(await options.queryFn()).toEqual(new Set(["existing", "last-page"]));
    expect(fixture.ranges).toHaveLength(21);
    expect(fixture.ranges.at(-1)).toEqual([20_000, 20_999]);
  });

  it("propaga falhas de leitura em vez de confirmar ausência de linhas", async () => {
    fixture.pages = []; fixture.error = new Error("fixture read failed");
    useTxIdsWithPayments();
    await expect(fixture.options!.queryFn()).rejects.toThrow("fixture read failed");
  });

  it("a lista pede o carimbo próprio e passa o predicado sem substituir Set pendente por vazio", () => {
    const source = readFileSync("src/pages/Transactions.tsx", "utf8");
    expect(source).toContain("events(name, status, parent_event_id, event_type, historical_at)");
    expect(source).toContain("const { data: txIdsWithPayments } = useTxIdsWithPayments()");
    expect(source).toContain("historicalImportedPaid={isHistoricalImportedPaid(t, txIdsWithPayments)}");
  });
});
