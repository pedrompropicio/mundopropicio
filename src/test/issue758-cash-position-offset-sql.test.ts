// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const name = "0349_issue758_cash_position_offset_payments.sql";
const migration = readFileSync(`drizzle/migrations/${name}`, "utf8");
const previous = readFileSync("drizzle/migrations/0342_issue646_committed_partially_paid.sql", "utf8");
const manual = readFileSync(`supabase/manual/${name}`);
const rollback = readFileSync("supabase/manual/rollback_0349_issue758_cash_position_offset_payments_comentado.sql", "utf8");
const definition = (sql: string) => sql.match(/CREATE OR REPLACE FUNCTION public\.get_event_cash_position\([\s\S]*?\$function\$;/)![0];
// Cópia literal da definição canónica, incluindo issue335-balance-v2l. Só esta
// função é carregada na fixture; nenhum wrapper/DML do ficheiro fonte é executado.
const balanceDefinition = readFileSync("supabase/manual/20261021_issue335_offset_balance.INERTE.sql", "utf8")
  .match(/CREATE OR REPLACE FUNCTION public\._account_true_balance_raw\(_account_id uuid\)[\s\S]*?\$function\$;/)![0];
const beforeName = "get_event_cash_position_before_0349";
const id = (n: number) => `75800000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const company = id(1), otherCompany = id(2);
const event = id(10), otherEvent = id(11), childEvent = id(12);
const bank = id(100), cash = id(101), prepaid = id(102), skipped = id(103), office = id(104), foreignBank = id(105);

type CashRow = {
  level: string; event_id: string | null; master_event_id: string | null; parent_event_id: string | null;
  event_name: string; event_date: string | null; is_sub: boolean;
  realized: string; committed: string; pending: string;
};
type Transaction = {
  companyId?: string; event?: string | null; account?: string | null; type?: string; status?: string;
  amount?: number; paid?: number; date?: string | null; paymentDate?: string | null;
};
type Payment = {
  account?: string | null; amount?: number; method?: string; status?: string; reversedAt?: string | null;
  paymentDate?: string | null; withholding?: number | null; credit?: number | null;
  group?: string | null; item?: string | null;
};
let db: PGlite;
let nextId = 1000;
const noNetwork = vi.fn(() => { throw new Error("#758: fixture sem rede"); });

beforeAll(async () => {
  vi.stubGlobal("fetch", noNetwork);
  db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
  // Tabelas mínimas próprias, exclusivamente na base efémera em memória.
  await db.exec(`
    CREATE TABLE financial_accounts(id uuid PRIMARY KEY, company_id uuid, type text,
      initial_balance numeric, initial_balance_date date, skip_balance_check boolean);
    CREATE TABLE events(id uuid PRIMARY KEY, name text, date date, parent_event_id uuid);
    CREATE TABLE transactions(id uuid PRIMARY KEY, company_id uuid, event_id uuid, account_id uuid,
      type text, status text, amount numeric, paid_amount numeric, date date, payment_date date);
    CREATE TABLE transaction_offset_groups(id uuid PRIMARY KEY, company_id uuid, status text);
    CREATE TABLE transaction_offset_items(id uuid PRIMARY KEY, company_id uuid, group_id uuid, transaction_id uuid);
    CREATE TABLE transaction_payments(id uuid PRIMARY KEY, transaction_id uuid, account_id uuid,
      amount numeric, payment_method text, status text, reversed_at timestamptz, payment_date date,
      withholding_amount numeric, credit_amount numeric, offset_group_id uuid, offset_item_id uuid);
    CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS
      $$ SELECT current_setting('issue758.company', true)::uuid $$;
    CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql AS
      $$ SELECT COALESCE(current_setting('issue758.admin', true)::boolean, false) $$;
    INSERT INTO financial_accounts VALUES
      ('${bank}','${company}','bank',1000,'2026-10-10',false),
      ('${cash}','${company}','cash',100,NULL,false),
      ('${prepaid}','${company}','prepaid_card',50,'2026-10-20',NULL),
      ('${skipped}','${company}','bank',9000,NULL,true),
      ('${office}','${company}','ticket_office',8000,NULL,false),
      ('${foreignBank}','${otherCompany}','bank',7000,NULL,false);
    INSERT INTO events VALUES
      ('${event}','Evento','2026-11-01',NULL),
      ('${otherEvent}','Outro','2026-11-02',NULL),
      ('${childEvent}','Cidade','2026-11-03','${event}');
  `);
  await db.exec(definition(previous).replace("public.get_event_cash_position(", `public.${beforeName}(`));
  await db.exec(balanceDefinition);
  await db.exec(migration);
}, 45000);

beforeEach(async () => {
  await db.exec("TRUNCATE transactions, transaction_payments, transaction_offset_items, transaction_offset_groups;");
  await db.query("SELECT set_config('issue758.company', $1, false), set_config('issue758.admin', 'false', false)", [company]);
  nextId = 1000;
});
afterAll(async () => {
  try { await db?.close(); expect(noNetwork).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); }
});

async function transaction(tx: Transaction = {}) {
  const txId = id(nextId++);
  await db.query(`INSERT INTO transactions VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [txId, tx.companyId ?? company, tx.event === undefined ? event : tx.event,
      tx.account === undefined ? bank : tx.account, tx.type ?? "income", tx.status ?? "paid",
      tx.amount ?? 100, tx.paid ?? 100, tx.date === undefined ? "2026-10-01" : tx.date,
      tx.paymentDate === undefined ? "2026-10-13" : tx.paymentDate]);
  return txId;
}
async function payment(txId: string, p: Payment = {}) {
  const paymentId = id(nextId++);
  await db.query(`INSERT INTO transaction_payments VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [paymentId, txId, p.account === undefined ? bank : p.account, p.amount ?? 70,
      p.method ?? "transfer", p.status ?? "paid", p.reversedAt ?? null,
      p.paymentDate === undefined ? "2026-10-13" : p.paymentDate,
      p.withholding === undefined ? 0 : p.withholding, p.credit === undefined ? 0 : p.credit,
      p.group ?? null, p.item ?? null]);
  return paymentId;
}
async function offset(tx: Transaction = {}, p: Payment = {}, status = "applied") {
  const txId = await transaction({ account: null, ...tx });
  const group = id(nextId++), item = id(nextId++);
  await db.query("INSERT INTO transaction_offset_groups VALUES ($1,$2,$3)", [group, tx.companyId ?? company, status]);
  await db.query("INSERT INTO transaction_offset_items VALUES ($1,$2,$3,$4)", [item, tx.companyId ?? company, group, txId]);
  const paymentId = await payment(txId, { group, item, ...p });
  return { txId, group, item, paymentId };
}
async function rows(from: string | null = null, to: string | null = null, before = false) {
  return (await db.query<CashRow>(`SELECT * FROM public.${before ? beforeName : "get_event_cash_position"}($1,$2,$3)`, [company, from, to])).rows;
}
async function realized(from: string | null = null, to: string | null = null) {
  return (await rows(from, to)).reduce((sum, row) => sum + Number(row.realized), 0);
}
async function invariant() {
  return (await db.query<{ initial: string; realized: string; lhs: string; rhs: string; diff: string }>(`
    WITH liquid AS (
      SELECT * FROM financial_accounts WHERE company_id = $1
        AND type IN ('bank','cash','prepaid_card') AND NOT COALESCE(skip_balance_check, false)
    ), totals AS (
      SELECT (SELECT SUM(initial_balance) FROM liquid) AS initial,
        (SELECT COALESCE(SUM(realized),0) FROM get_event_cash_position($1)) AS realized,
        (SELECT SUM(public._account_true_balance_raw(id)) FROM liquid) AS rhs
    ) SELECT *, initial + realized AS lhs, initial + realized - rhs AS diff FROM totals
  `, [company])).rows[0];
}

describe("#758 — artefactos preparados, sem aplicação externa", () => {
  it("preserva byte a byte a 0342 fora de paid_agg e dos filtros de adj_agg", () => {
    const unchanged = (sql: string) => definition(sql)
      .replace(/  paid_agg AS \([\s\S]*?(?=  adj_agg AS \()/, "PAID_AGG\n")
      .replace("      AND p.status = 'paid' AND p.reversed_at IS NULL\n", "");
    expect(unchanged(migration)).toBe(unchanged(previous));
    expect(migration).toMatch(/^-- PREPARADA, NÃO APLICADA — #758\n/);
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    const withoutBody = migration.replace(definition(migration), "").replace(/--[^\n]*/g, "").trim();
    expect(withoutBody).toMatch(/^COMMENT ON FUNCTION public\.get_event_cash_position\(uuid, date, date\) IS\s+'Issue #758:[^']*';$/);
    expect(migration.replace(/--[^\n]*/g, "")).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|GRANT|REVOKE|COMMIT)\b|ALTER\s+OWNER/i);
    expect(balanceDefinition).toContain("-- issue335-balance-v2l");
  });
  it("tem cópia manual idêntica e rollback integralmente comentado que repõe a 0342 literal", () => {
    expect(manual.equals(Buffer.from(migration))).toBe(true);
    expect(rollback.split("\n").every((line) => line === "" || line.startsWith("--"))).toBe(true);
    const restored = rollback.split("\n").slice(2).map((line) => line.replace(/^-- ?/, "")).join("\n");
    expect(restored).toBe(previous.slice(previous.indexOf("CREATE OR REPLACE FUNCTION")));
  });
  it("o rollback executável apenas na fixture repõe a função e o comentário da 0342", async () => {
    const restored = rollback.split("\n").slice(2).map((line) => line.replace(/^-- ?/, "")).join("\n");
    try {
      await db.exec(restored);
      await offset();
      expect(await rows()).toEqual(await rows(null, null, true));
      expect(await realized()).toBe(0);
    } finally { await db.exec(migration); }
    expect(await realized()).toBe(70);
  });
});

describe("#758 — pagamentos de encontro de contas", () => {
  it.each([null, office, skipped, bank])("(a) conta própria %s não impede a transferência para banco líquido", async (account) => {
    await offset({ account });
    expect((await rows())[0]).toMatchObject({ event_id: event, level: "event", realized: "70.00" });
    // paid_amount = 100 não é contado além da perna de 70, mesmo com conta própria líquida.
    expect(await realized()).toBe(70);
  });
  it.each(["preparing", "applied", "reversing"])("grupo %s é gerido uma única vez", async (status) => {
    const { txId, group, item } = await offset({}, {}, status);
    await payment(txId, { amount: 30, group, item });
    expect(await realized()).toBe(100);
  });
  it("(b) compensação isolada não entra e a receita não duplica paid_amount", async () => {
    await offset({ account: bank }, { amount: 100, method: "compensation" });
    expect(await realized()).toBe(0);
    expect(Number((await invariant()).diff)).toBe(0);
  });
  it.each([
    { groupStatus: "cancelled", paymentStatus: "paid", reversedAt: null },
    { groupStatus: "applied", paymentStatus: "paid", reversedAt: "2026-10-14T00:00:00Z" },
    { groupStatus: "applied", paymentStatus: "pending", reversedAt: null },
  ])("(c) grupo $groupStatus / pagamento $paymentStatus / estorno $reversedAt não entra", async ({ groupStatus, paymentStatus, reversedAt }) => {
    await offset({}, { status: paymentStatus, reversedAt }, groupStatus);
    expect(await realized()).toBe(0);
    expect(Number((await invariant()).diff)).toBe(0);
  });
  it.each([
    { status: "pending", reversedAt: null },
    { status: "paid", reversedAt: "2026-10-14T00:00:00Z" },
  ])("perna cash $status / estorno $reversedAt fica fora mesmo com outra perna que mantém managed", async ({ status, reversedAt }) => {
    const { txId } = await offset({ account: bank }, { method: "compensation", amount: 30 });
    await payment(txId, { amount: 70, status, reversedAt });
    expect(await realized()).toBe(0);
    expect(Number((await invariant()).diff)).toBe(0);
  });
  it("grupo cancelado conserva o caminho normal de paid_amount quando a conta própria é líquida", async () => {
    await offset({ account: bank }, {}, "cancelled");
    expect(await realized()).toBe(100);
    expect(await rows()).toEqual(await rows(null, null, true));
    expect(Number((await invariant()).diff)).toBe(0);
  });
  it.each(["offset_group_id", "offset_item_id", "transaction_id"])("managed exige correspondência exacta de %s", async (column) => {
    const { paymentId } = await offset();
    await db.query(`UPDATE transaction_payments SET ${column} = $1 WHERE id = $2`, [id(999), paymentId]);
    expect(await realized()).toBe(0);
  });
  it("managed exige que item e grupo pertençam à mesma empresa", async () => {
    const { item } = await offset();
    await db.query("UPDATE transaction_offset_items SET company_id = $1 WHERE id = $2", [otherCompany, item]);
    expect(await realized()).toBe(0);
  });
  it("conta todas as pernas cash da transacção gerida, incluindo pagamentos sem referência de encontro", async () => {
    const { txId } = await offset({}, { method: "compensation", amount: 30 });
    await payment(txId, { amount: 60, account: cash });
    await payment(txId, { amount: 10, account: prepaid, paymentDate: "2026-10-21" });
    expect(await realized()).toBe(70);
    expect(Number((await invariant()).diff)).toBe(0);
  });
  it.each([office, skipped, foreignBank, null])("pagamento para conta excluída %s fica fora do pool", async (account) => {
    await offset({}, { account });
    expect(await realized()).toBe(0);
  });
  it("isola empresa da transacção mesmo quando a conta do pagamento pertence à sessão", async () => {
    await offset({ companyId: otherCompany });
    expect(await rows()).toEqual([]);
    await expect(db.query("SELECT * FROM get_event_cash_position($1)", [otherCompany])).rejects.toThrow("forbidden: company mismatch");
    await db.query("SELECT set_config('issue758.admin', 'true', false)");
    await expect(db.query("SELECT * FROM get_event_cash_position($1)", [otherCompany])).resolves.toMatchObject({ rows: [] });
  });
});

describe("#758 — paridade, ajustes e invariante", () => {
  it("(d) transacções normais mantêm todas as colunas, níveis e ordem da 0342 com/sem filtros", async () => {
    await transaction({ type: "expense", status: "partially_paid", amount: 130, paid: 40 });
    const txId = await transaction({ event: childEvent, status: "approved", amount: 300, paid: 80, paymentDate: "2026-11-02" });
    await payment(txId, { paymentDate: "2026-11-02", withholding: 5, credit: 3 });
    await transaction({ event: otherEvent, type: "expense", status: "pending", paid: 0 });
    await transaction({ event: null, account: cash, paid: 20 });
    await transaction({ account: bank, paid: 500, paymentDate: "2026-10-10" });
    await transaction({ account: skipped });
    await transaction({ account: office });
    for (const [from, to] of [[null, null], ["2026-10-13", "2026-10-13"], ["2026-11-01", null], [null, "2026-10-13"]]) {
      expect(await rows(from, to)).toEqual(await rows(from, to, true));
    }
    expect((await rows()).map((row) => row.event_id)).toEqual([event, otherEvent, childEvent, null]);
    expect((await rows())[2]).toMatchObject({ is_sub: true, master_event_id: event, parent_event_id: event });
  });
  it.each([
    { status: "paid", reversedAt: null, expected: 15 },
    { status: "pending", reversedAt: null, expected: 0 },
    { status: "paid", reversedAt: "2026-10-14T00:00:00Z", expected: 0 },
  ])("adj_agg conta retenção/crédito apenas $status sem estorno $reversedAt", async ({ status, reversedAt, expected }) => {
    const txId = await transaction({ account: null, paid: 0 });
    await payment(txId, { withholding: 5, credit: 10, status, reversedAt });
    expect(await realized()).toBe(expected);
    expect(Number((await invariant()).diff)).toBe(0);
  });
  it("(e) saldos iniciais + realizado de eventos, sub-eventos e Comuns = saldo canónico de todas as contas líquidas", async () => {
    await offset({}, { amount: 70, withholding: 5, credit: 2 });
    const { txId } = await offset({ account: bank, event: childEvent, type: "expense", paid: 90 }, { account: cash, amount: 45 });
    await payment(txId, { account: cash, amount: 45, method: "compensation" });
    await offset({ event: null }, { account: prepaid, amount: 30, paymentDate: "2026-10-21" });
    await offset({}, { amount: 800, paymentDate: "2026-10-10" });
    await offset({}, { amount: 900, reversedAt: "2026-10-14T00:00:00Z" });
    await offset({}, { amount: 1000 }, "cancelled");
    await offset({}, { account: skipped, amount: 2000 });
    await transaction({ event: otherEvent, paid: 60 });
    await transaction({ event: null, account: cash, type: "expense", paid: 10 });
    await transaction({ paid: 500, paymentDate: "2026-10-10" });
    await transaction({ account: office, paid: 3000 });
    expect((await rows()).map((row) => [row.level, row.event_id, row.realized])).toEqual([
      ["event", event, "77.00"], ["event", otherEvent, "60.00"],
      ["event", childEvent, "-45.00"], ["common", null, "20.00"],
    ]);
    expect(await invariant()).toEqual({ initial: "1150", realized: "112.00", lhs: "1262.00", rhs: "1262", diff: "0.00" });
    // A fixture reproduz o defeito: a 0342 diverge do saldo canónico.
    expect((await rows(null, null, true)).reduce((sum, row) => sum + Number(row.realized), 0)).not.toBe(112);
  });
});

describe("#758 — datas do pagamento e corte da conta que recebe", () => {
  it("(f) aplica limites inclusivos a p.payment_date e soma cada pagamento só no seu período", async () => {
    const { txId } = await offset({ paymentDate: "2026-01-01" }, { amount: 10, paymentDate: "2026-10-12" });
    await payment(txId, { amount: 20, paymentDate: "2026-10-13" });
    await payment(txId, { amount: 40, paymentDate: "2026-10-14" });
    expect(await realized("2026-10-13", "2026-10-13")).toBe(20);
    expect(await realized("2026-10-13", null)).toBe(60);
    expect(await realized(null, "2026-10-13")).toBe(30);
    expect(await realized("2026-10-15", "2026-10-16")).toBe(0);
    expect(await realized()).toBe(70);
  });
  it.each([
    { paymentDate: "2026-10-19", expected: 0 },
    { paymentDate: "2026-10-20", expected: 0 },
    { paymentDate: "2026-10-21", expected: 70 },
  ])("(f) corte usa a conta do pagamento (20/10), data $paymentDate → $expected", async ({ paymentDate, expected }) => {
    await offset({ account: bank, date: "2026-10-25", paymentDate: "2026-10-25" }, { account: prepaid, paymentDate });
    expect(await realized()).toBe(expected);
    expect(Number((await invariant()).diff)).toBe(0);
  });
  it("data da transacção anterior ao corte não elimina pagamento posterior ao corte", async () => {
    await offset({ account: bank, date: "2026-01-01", paymentDate: "2026-01-01" });
    expect(await realized()).toBe(70);
    expect(Number((await invariant()).diff)).toBe(0);
  });
  it("pagamento sem data conta sem período, como no saldo, e não herda a data da transacção nos filtros", async () => {
    await offset({}, { paymentDate: null });
    expect(await realized()).toBe(70);
    expect(await realized("2026-10-13", null)).toBe(0);
    expect(await realized(null, "2026-10-13")).toBe(0);
    expect(Number((await invariant()).diff)).toBe(0);
  });
  it("conta sem corte aceita pagamento antigo; committed/pending conservam-se fora do período", async () => {
    await offset({ account: bank, status: "partially_paid", amount: 150 }, { account: cash, paymentDate: "2026-01-01" });
    await transaction({ event: otherEvent, status: "pending", amount: 90, paid: 0 });
    expect(await realized()).toBe(70);
    expect((await rows("2027-01-01", "2027-01-31")).map((row) => [row.event_id, row.realized, row.committed, row.pending]))
      .toEqual([[event, "0.00", "50.00", "0.00"], [otherEvent, "0.00", "0.00", "90.00"]]);
  });
});
