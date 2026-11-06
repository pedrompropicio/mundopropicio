import { readFileSync } from "node:fs";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const original = readFileSync("supabase/migrations/20260909195352_eb89ddd4-b732-41fa-8162-3fd51a6b9871.sql", "utf8");
const migration = readFileSync("drizzle/migrations/0342_issue646_committed_partially_paid.sql", "utf8");
const manual = readFileSync("supabase/manual/0342_issue646_committed_partially_paid.sql");
const rollback = readFileSync("supabase/manual/rollback_0342_issue646_committed_partially_paid_comentado.sql", "utf8");
const invariant = readFileSync("supabase/migrations/20260909203309_b453670a-bc9a-4a4d-a0c3-a74f8fd05d9f.sql", "utf8");
const conference = readFileSync("docs/testes/issue646/conferencia-d2.sql", "utf8");
const proof = readFileSync("docs/testes/issue646/prova-janela-0342.sql", "utf8");
const oldFilter = "WHERE tx.status = 'approved'";
const newFilter = "WHERE tx.status IN ('approved', 'partially_paid')";
const beforeName = "get_event_cash_position_before_0342";
const beforeFunction = original.replace("public.get_event_cash_position(", `public.${beforeName}(`);
const withoutComments = (sql: string) => sql.replace(/--[^\n]*/g, "").trim();
const proofStatements = withoutComments(proof).split(";").map((sql) => sql.trim()).filter(Boolean);
const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const company = id(1), otherCompany = id(2), expenseEvent = id(10), incomeEvent = id(11), childEvent = id(12);
const bank = id(100), cash = id(101), prepaid = id(102), skipped = id(103), office = id(104), foreignBank = id(105);

type CashRow = {
  level: string; event_id: string | null; master_event_id: string | null; parent_event_id: string | null;
  event_name: string; event_date: string | null; is_sub: boolean;
  committed: string; realized: string; pending: string;
};
type Transaction = {
  event?: string | null; account?: string | null; type?: string; status?: string;
  amount?: number; paid?: number | null; date?: string; paymentDate?: string | null; companyId?: string;
};
let db: PGlite;
let nextTransaction = 1000;
const noNetwork = vi.fn(() => { throw new Error("#646 D2-f: sem rede"); });

beforeAll(async () => {
  vi.stubGlobal("fetch", noNetwork);
  // jsdom Blob não tem arrayBuffer. O bundle WASM vem do disco, sem fetch.
  vi.stubGlobal("Blob", NodeBlob); vi.stubGlobal("File", NodeFile);
  db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
  // DDL/DML só na fixture efémera em memória, sem serviços ou bases MP.
  await db.exec(`
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid, name text, parent_event_id uuid, business_line_id uuid, date date, st text);
    CREATE TABLE business_lines(id uuid, company_id uuid, name text);
    CREATE TABLE financial_accounts(id uuid PRIMARY KEY, company_id uuid, name text, type text, initial_balance numeric, initial_balance_date date, skip_balance_check boolean, balance numeric);
    CREATE TABLE account_categories(id uuid, code text);
    CREATE TABLE event_settlements(id uuid, parent_id uuid);
    CREATE TABLE transactions(id uuid PRIMARY KEY, company_id uuid, event_id uuid, account_id uuid, type text,
      status text CHECK (status IN ('pending','approved','paid','overdue','partially_paid')),
      amount numeric, paid_amount numeric, date date, payment_date date, due_date date, reversed_at timestamptz,
      is_hidden boolean, is_transitory boolean, exclude_from_result boolean, event_settlement_id uuid, category_id uuid);
    CREATE TABLE transaction_payments(transaction_id uuid, account_id uuid, payment_date date, withholding_amount numeric, credit_amount numeric);
    CREATE TABLE bank_statements(financial_account_id uuid, company_id uuid, period_from date);
    CREATE TABLE event_ticket_zones(id uuid, event_id uuid);
    CREATE TABLE event_ticket_lots(id uuid, zone_id uuid, iva_rate integer);
    CREATE TABLE ticket_sales(zone_id uuid, lot_id uuid, financial_account_id uuid, quantity numeric, unit_price numeric, total_value numeric, sale_date date);
    CREATE TABLE event_ticket_office_assignments(event_id uuid, financial_account_id uuid);
    CREATE TABLE event_ticket_office_advances(event_id uuid, financial_account_id uuid, amount numeric, transaction_id uuid, settlement_id uuid);
    CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${company}'::uuid $$;
    CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION event_stage_list() RETURNS TABLE(event_id uuid, stage text) LANGUAGE sql AS $$ SELECT id, st FROM events WHERE company_id = current_company_id() $$;
    CREATE FUNCTION ticket_office_balances(uuid[]) RETURNS TABLE(account_id uuid, balance numeric) LANGUAGE sql AS $$ SELECT id, balance FROM financial_accounts WHERE id = ANY($1) $$;
    CREATE FUNCTION get_ticket_office_sales(uuid) RETURNS TABLE(event_id uuid, quantity numeric, revenue numeric) LANGUAGE sql AS $$ SELECT NULL::uuid, 0::numeric, 0::numeric WHERE false $$;
    CREATE FUNCTION get_financial_position_base(uuid, integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"posicao":{"caixa_e_cartoes":0},"meta":{"reference_date":"2026-11-05"}}'::jsonb $$;
    INSERT INTO events VALUES
      ('${expenseEvent}','${company}','Despesa',null,null,'2026-11-01','em_curso'),
      ('${incomeEvent}','${company}','Receita',null,null,'2027-01-01','planeamento'),
      ('${childEvent}','${company}','Cidade','${incomeEvent}',null,'2027-01-02','planeamento');
    INSERT INTO financial_accounts VALUES
      ('${bank}','${company}','Banco','bank',1000,'2026-08-31',false,0),
      ('${cash}','${company}','Caixa','cash',100,null,false,0),
      ('${prepaid}','${company}','Cartão','prepaid_card',50,null,null,0),
      ('${skipped}','${company}','Sem saldo','bank',0,null,true,0),
      ('${office}','${company}','Bilheteira','ticket_office',0,null,false,0),
      ('${foreignBank}','${otherCompany}','Outra empresa','bank',0,null,false,0);
  ` + beforeFunction + migration + invariant + invariant
    .replaceAll("get_event_cash_position_invariant", "get_event_cash_position_invariant_before_0342")
    .replace("public.get_event_cash_position(", `public.${beforeName}(`));
}, 45000);

beforeEach(async () => {
  await db.exec("TRUNCATE transactions, transaction_payments;");
  nextTransaction = 1000;
});
afterAll(async () => {
  try { await db?.close(); expect(noNetwork).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

async function insertTransaction(tx: Transaction = {}) {
  const transactionId = id(nextTransaction++);
  await db.query(`INSERT INTO transactions
    (id, company_id, event_id, account_id, type, status, amount, paid_amount, date, payment_date)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [transactionId, tx.companyId ?? company, tx.event === undefined ? expenseEvent : tx.event,
    tx.account === undefined ? bank : tx.account, tx.type ?? "expense", tx.status ?? "partially_paid",
    tx.amount ?? 100, tx.paid === undefined ? 40 : tx.paid, tx.date ?? "2026-11-01",
    tx.paymentDate === undefined ? "2026-11-01" : tx.paymentDate]);
  return transactionId;
}
async function rows(before = false, from: string | null = null, to: string | null = null) {
  return (await db.query<CashRow>(`SELECT * FROM public.${before ? beforeName : "get_event_cash_position"}($1,$2,$3)`, [company, from, to])).rows;
}
async function runConference() {
  return (await db.query<Record<string, unknown>>(conference.replaceAll(":company_id", "$1"), [company])).rows;
}
async function runProof(section: number, snapshot?: unknown) {
  return (await db.query<Record<string, any>>(proofStatements[section]
    .replaceAll(":company_id", "$1").replaceAll(":before_0342", "$2"),
  snapshot === undefined ? [company] : [company, JSON.stringify(snapshot)])).rows;
}

describe("#646 D2-f — critério 1, artefactos preparados", () => {
  it("preserva assinatura, atributos e corpo literal, excepto a única linha de committed_agg", () => {
    const definition = migration.match(/CREATE OR REPLACE FUNCTION public\.get_event_cash_position\([\s\S]*?\$function\$;/)![0];
    const normalize = (sql: string) => sql.trim().split("\n").map((line) => line.trim());
    const oldLines = normalize(original), newLines = normalize(definition);
    expect(newLines).toHaveLength(oldLines.length);
    expect(newLines.flatMap((line, index) => line === oldLines[index] ? [] : [[oldLines[index], line]]))
      .toEqual([[oldFilter, newFilter]]);
    expect(definition.replace(newFilter, oldFilter)).toBe(original.trim());
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    // BEGIN/END internos pertencem ao corpo PL/pgSQL, não são um wrapper de transação.
    const outsideFunction = withoutComments(migration.replace(definition, ""));
    expect(outsideFunction).not.toMatch(/\b(BEGIN|COMMIT|GRANT|REVOKE)\b/i);
    expect(outsideFunction).toMatch(/^COMMENT ON FUNCTION public\.get_event_cash_position\(uuid, date, date\) IS\s+'Issue #646 D2-f:[^']*';$/);
    expect(migration).not.toContain("WATCHED_TABLES_BEGIN");
  });
  it("tem cópia manual byte a byte e rollback só comentado que recupera o corpo antigo", () => {
    expect(manual.equals(Buffer.from(migration))).toBe(true);
    expect(rollback.split("\n").every((line) => line === "" || line.startsWith("--"))).toBe(true);
    const restored = rollback.split("\n").slice(2).map((line) => line.replace(/^-- ?/, "")).join("\n");
    expect(restored.trim()).toBe(original.trim());
  });
  it("o pacote de janela contém cinco SELECTs parametrizados e nenhum verbo de escrita", () => {
    expect(proofStatements).toHaveLength(5);
    for (const statement of proofStatements) {
      expect(statement).toMatch(/^(WITH|SELECT)\b/);
      expect(statement).toContain(":company_id::uuid");
      expect(statement.replace(/'(?:''|[^'])*'/g, "''"))
        .not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MERGE|CALL|DO|COPY|GRANT|REVOKE|BEGIN|COMMIT)\b/i);
    }
  });
});

describe("#646 D2-f — critério 2, estados, sinais e contas", () => {
  it.each(["approved", "pending", "paid", "overdue"].flatMap((status) => ["income", "expense"].map((type) => ({ status, type }))))
    ("$status / $type mantém committed, pending e realized", async ({ status, type }) => {
      await insertTransaction({ status, type });
      const after = await rows();
      expect(after).toEqual(await rows(true));
      const sign = type === "income" ? 1 : -1;
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({ committed: (status === "approved" ? sign * 60 : 0).toFixed(2),
        pending: (status === "pending" ? sign * 100 : 0).toFixed(2), realized: (sign * 40).toFixed(2) });
    });
  it.each(["income", "expense"])("partially_paid / %s altera só committed pelo saldo 100 − 40", async (type) => {
    await insertTransaction({ type });
    const before = await rows(true), after = await rows();
    expect(before[0].committed).toBe("0.00");
    expect(after).toEqual(before.map((row) => ({ ...row, committed: type === "income" ? "60.00" : "-60.00" })));
  });
  it.each([bank, cash, prepaid])("inclui saldo parcial na conta líquida %s", async (account) => {
    await insertTransaction({ account });
    expect((await rows())[0].committed).toBe("-60.00");
  });
  it.each([skipped, office, null])("exclui a conta %s antes e depois", async (account) => {
    await insertTransaction({ account });
    expect(await rows()).toEqual([]);
    expect(await rows(true)).toEqual([]);
  });
  it("mantém isolamento da empresa e a recusa por sessão de outra empresa", async () => {
    await insertTransaction({ account: foreignBank, companyId: otherCompany });
    expect(await rows()).toEqual([]);
    await expect(db.query("SELECT * FROM get_event_cash_position($1)", [otherCompany])).rejects.toThrow("forbidden: company mismatch");
  });
  it("atribui saldo parcial sem evento à linha common", async () => {
    await insertTransaction({ event: null, type: "income" });
    expect(await rows()).toEqual((await rows(true)).map((row) => ({ ...row, committed: "60.00" })));
    expect((await rows())[0]).toMatchObject({ level: "common", event_id: null, event_name: "Comuns", master_event_id: null });
  });
  it.each(["approved", "partially_paid"])("%s com paid_amount NULL não soma nem altera realized/pending", async (status) => {
    await insertTransaction({ status, paid: null });
    const after = await rows();
    expect(after).toEqual(await rows(true));
    expect(after[0]).toMatchObject({ committed: "0.00", realized: "0.00", pending: "0.00" });
    await insertTransaction({ status, type: "income", paid: 40 });
    expect((await rows())[0].committed).toBe("60.00");
  });
  it("não limita o saldo parcial a valores positivos nem corta committed pelas datas", async () => {
    await insertTransaction({ paid: 140, date: "2026-08-01", paymentDate: "2026-08-01" });
    expect((await rows(false, "2026-11-01", "2026-11-30"))[0])
      .toMatchObject({ committed: "40.00", realized: "0.00", pending: "0.00" });
  });
});

describe("#646 D2-f — critérios 3 e 4, paridade integral e invariante", () => {
  it("sem partially_paid mantém todas as linhas e a ordem, com ambos, um ou nenhum limite", async () => {
    for (const tx of [
      { event: incomeEvent, status: "paid", type: "income", paid: 100, paymentDate: "2027-01-01" },
      { event: childEvent, status: "approved", type: "income", paymentDate: null },
      { event: expenseEvent, status: "pending", account: cash },
      { event: expenseEvent, status: "overdue", paymentDate: "2026-08-01" },
      { event: null, status: "approved", account: prepaid },
      { status: "approved", paid: null },
      { status: "paid", account: skipped },
      { status: "pending", account: office },
    ]) await insertTransaction(tx);
    for (const [from, to, expectedOrder] of [
      [null, null, [expenseEvent, incomeEvent, childEvent, null]],
      ["2026-11-01", "2026-11-30", [expenseEvent, childEvent, null]],
      ["2027-01-01", null, [expenseEvent, incomeEvent, childEvent, null]],
      [null, "2026-10-31", [expenseEvent, childEvent, null]],
    ] as const) {
      const after = await rows(false, from, to);
      expect(after).toEqual(await rows(true, from, to));
      expect(after.map((row) => row.event_id)).toEqual(expectedOrder);
      expect(after.find((row) => row.event_id === childEvent)).toMatchObject({ master_event_id: incomeEvent, parent_event_id: incomeEvent, is_sub: true });
    }
  });
  it("o invariante canónico continua is_balanced, com cortes, ajustes, Comuns e parciais", async () => {
    const txId = await insertTransaction();
    await insertTransaction({ event: incomeEvent, type: "income", status: "approved" });
    await insertTransaction({ event: null, account: cash, type: "income" });
    await insertTransaction({ status: "pending", paid: 0 });
    await insertTransaction({ status: "paid", paid: 100, date: "2026-08-01", paymentDate: "2026-08-31" });
    await insertTransaction({ account: skipped });
    await insertTransaction({ account: office });
    await insertTransaction({ paid: null });
    await db.query("INSERT INTO transaction_payments VALUES ($1,$2,'2026-11-05',5,10), ($1,$2,'2026-08-31',700,300), ($1,$3,'2026-11-05',100,100)", [txId, bank, office]);
    const after = (await db.query("SELECT * FROM get_event_cash_position_invariant($1)", [company])).rows;
    const before = (await db.query("SELECT * FROM get_event_cash_position_invariant_before_0342($1)", [company])).rows;
    expect(after).toEqual(before);
    expect(after).toEqual([{ sum_realized: "55.00", sum_initial: "1150.00", lhs: "1205.00", rhs_computebalance: "1205.00", diff: "0.00", is_balanced: true }]);
  });
});

describe("#646 D2-f — critério 5, conferência e prova de janela completas", () => {
  it("a conferência compara a coluna antiga com a função antiga e a coluna 0342 com o parcial −60", async () => {
    await insertTransaction();
    await insertTransaction({ event: incomeEvent, type: "income", status: "approved", paid: 0 });
    await insertTransaction({ event: childEvent, status: "approved", paid: null });
    await insertTransaction({ event: null, account: skipped });
    await db.exec(original);
    let before: Record<string, unknown>[];
    try { before = await runConference(); }
    finally { await db.exec(migration); }
    const after = await runConference();
    const partialBefore = before.find((row) => row.id === expenseEvent)!;
    const partialAfter = after.find((row) => row.id === expenseEvent)!;
    expect(Number(partialBefore.rpc_committed)).toBe(0);
    expect(Number(partialBefore.rpc_committed)).toBe(Number(partialBefore.committed_expected_rpc));
    expect(Number(partialAfter.rpc_committed)).toBe(-60);
    expect(Number(partialAfter.rpc_committed)).toBe(Number(partialAfter.committed_expected_rpc_0342));
    expect(after.find((row) => row.id === childEvent)!.committed_expected_rpc_0342).toBe("0");
    // As colunas anteriores e todos os valores alheios a rpc_committed conservam-se.
    const withoutCommitted = (data: Record<string, unknown>[]) => data.map(({ rpc_committed: _, ...row }) => row);
    expect(withoutCommitted(after)).toEqual(withoutCommitted(before));
    expect(after.every((row) => Number(row.rpc_committed) === Number(row.committed_expected_rpc_0342))).toBe(true);
  });
  it("executa todos os SELECTs de janela e mede a diferença real antes/depois sem escrita na prova", async () => {
    await insertTransaction();
    await insertTransaction({ status: "approved", paid: 20 });
    await insertTransaction({ status: "pending", paid: 0 });
    await insertTransaction({ event: incomeEvent, paid: null });
    await insertTransaction({ account: skipped });
    await db.exec(original);
    let snapshot: unknown;
    try {
      expect((await runProof(0))[0]).toMatchObject({ same_company: true, approved_only: true, without_partially_paid: true, por_aplicar: true });
      expect((await runProof(1)).every((row) => row.matches_before)).toBe(true);
      const before = (await runProof(2))[0];
      expect(before.is_balanced).toBe(true);
      snapshot = before.snapshot_0342;
      expect((await runProof(4))[0]).toEqual({ partially_paid_null_paid_amount: 1, in_liquid_accounts: 1 });
    } finally { await db.exec(migration); }
    expect((await runProof(0))[0]).toMatchObject({ same_company: true, approved_only: false, without_partially_paid: false, por_aplicar: false });
    expect((await runProof(1)).every((row) => row.matches_after)).toBe(true);
    expect((await runProof(2))[0].is_balanced).toBe(true);
    expect((await runProof(4))[0]).toEqual({ partially_paid_null_paid_amount: 1, in_liquid_accounts: 1 });
    const comparisons = await runProof(3, snapshot);
    expect(comparisons).toHaveLength(2);
    for (const row of comparisons) expect(row).toMatchObject({ same_company: true, realized_pending_unchanged: true,
      invariant_before_balanced: true, invariant_after_balanced: true, committed_total_difference: "-60.00", expected_total_difference: "-60", total_difference_matches: true });
    const wrongCompanySnapshot = { ...(snapshot as object), company_id: otherCompany };
    expect((await runProof(3, wrongCompanySnapshot)).every((row) => row.same_company === false)).toBe(true);
  });
});
