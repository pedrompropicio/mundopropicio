// Inert fixtures only: no credentials, network, external SQL or deployment.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const f = vi.hoisted(() => ({
  read: { status: "legacy", statements: [] } as any, readError: false,
  rows: {} as Record<string, any[]>, rpc: vi.fn(), pdf: new Uint8Array(),
}));
vi.mock("@/hooks/useTicketOfficeStatements", () => ({
  useTicketOfficeStatements: () => ({ data: f.read, isError: f.readError, isLoading: false }),
  loadTicketOfficeStatements: async () => { if (f.readError) throw new Error("Falha de leitura"); return f.read; },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "synthetic@example.invalid" }, isAdmin: true, hasPermission: () => true,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...args: any[]) => f.rpc(...args),
  from: (table: string) => {
    const filters: [string, any][] = []; let single = false;
    const q: any = {
      select: () => q, order: () => q, range: () => q,
      eq: (k: string, v: any) => { filters.push([k, v]); return q; },
      in: (k: string, v: any) => { filters.push([k, v]); return q; },
      single: () => { single = true; return q; }, maybeSingle: () => { single = true; return q; },
      then: (resolve: any, reject: any) => {
        const rows = (f.rows[table] ?? []).filter(row => filters.every(([k,v]) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null, count: rows.length }).then(resolve, reject);
      },
    }; return q;
  },
} }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TransactionFormModal", () => ({ TransactionFormModal: () => null }));
vi.mock("@/components/QuickAdvanceModal", () => ({ QuickAdvanceModal: () => null }));
vi.mock("@/lib/export-header", async (original) => ({
  ...await original<typeof import("@/lib/export-header")>(),
  fetchExportBranding: async () => ({ displayName: "Empresa sintética", logoDataUrl: null }),
}));
vi.mock("jspdf", async (original) => {
  const { default: RealPdf } = await original<typeof import("jspdf")>();
  return { default: class extends RealPdf {
    constructor(...args: ConstructorParameters<typeof RealPdf>) {
      super(...args);
      // Only nondeterministic PDF metadata is pinned; all rendering is real.
      this.setFileId("30330330330330330330330330330330");
      this.setCreationDate(new Date("2026-11-06T12:00:00Z"));
      this.save = (() => { f.pdf = new Uint8Array(this.output("arraybuffer")); return this; }) as unknown as typeof this.save;
    }
  } };
});

import { TicketOfficeSettlementsPanel } from "@/components/TicketOfficeSettlementsPanel";
import { TicketOfficeSettlementModal } from "@/components/TicketOfficeSettlementModal";
import { SettlementReadContent } from "@/components/TicketOfficeSettlementViewDialog";
import { buildSettlementView } from "@/lib/ticket-office-settlement-view";
import { exportTicketOfficeSettlementPdf } from "@/lib/export-ticket-office-settlement-pdf";
import { settlementEventRight, fetchSettlementView } from "@/lib/ticket-office-settlement-view";
import { PGlite } from "@electric-sql/pglite";
import { PositionHarness, uid, q, sales, opening } from "./issue303-position.test";

// jsdom 20's Blob lacks arrayBuffer(), required by PGlite's local initdb tar.
// Use Node's implementation only in this test environment; no fetch fallback.
const browserBlob = globalThis.Blob, browserFile = globalThis.File;
beforeAll(() => { globalThis.Blob = NodeBlob as unknown as typeof Blob; globalThis.File = NodeFile as unknown as typeof File; });
afterAll(() => { globalThis.Blob = browserBlob; globalThis.File = browserFile; });

const hash = (x: string | Uint8Array) => createHash("sha256").update(x).digest("hex");
const legacy = {
  id: "settlement-a", company_id: "company-a", financial_account_id: "office-a", event_id: "event-a", status: "confirmed",
  events: { id: "event-a", name: "Evento sintético", date: "2026-11-01" }, settlement_date: "2026-11-02", created_at: "2026-11-02T12:00:00Z",
  gross_revenue: 100, total_deductions: 10, net_calculated: 75, net_adjusted: null, net_transferred: 30,
  venue_retained_amount: 5, venue_retained_notes: "Retenção sintética", venue_invoice_remainder_paid: true,
  venue_invoice_remainder_amount: 10, notes: "Notas sintéticas", closed_at: "2026-11-02T12:00:00Z",
};
const legacyView = () => buildSettlementView(legacy, "Bilheteira sintética", {
  deductions: [{ id: "t-a", description: "Comissão", supplier: "Fornecedor sintético", value: 10 }],
  statementNumber: null, closedByName: "Utilizador sintético",
});
let client: QueryClient;
function mount(ui: React.ReactNode) { return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>); }
beforeEach(() => {
  f.read = { status: "legacy", statements: [] }; f.readError = false;
  f.rows = { ticket_office_settlements: [structuredClone(legacy)] }; f.rpc.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-06T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#303: rede proibida"); }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("#303 R8 — bytes legados fixados antes das alterações de produção (f9c85d7)", () => {
  it("conserva o objecto e o DOM da vista sem pertença", () => {
    const view = legacyView(); const { container } = render(<SettlementReadContent v={view} />);
    expect(hash(JSON.stringify(view))).toBe("88fec084d14b8918b1c0e9abaa3f5f3b398dae6eddc79b92d6ec67a991664bc1");
    expect(hash(container.innerHTML)).toBe("23716ba416dc994a1229a38c68949a216dd1b01b0f44047e7f9c8d765cb6d0c9");
  });
  it("conserva o DOM do cartão sem pertença", async () => {
    const { container } = mount(<TicketOfficeSettlementsPanel officeId="office-a" officeName="Bilheteira sintética" />);
    await screen.findByText("Evento sintético");
    expect(hash(container.innerHTML)).toBe("f65d50dfe6ca77c155898c725b9889382469f4c8fe1bd16b2fd43c792f38db57");
  });
  it("conserva os bytes do PDF sem pertença", async () => {
    await exportTicketOfficeSettlementPdf(legacyView());
    expect(hash(f.pdf)).toBe("c9dd7c13d5ba1fe3a1ca64989ab91a6ebbd74b89441b7e7fc821471a907b6ea2");
  });
});

function withMembership() {
  const quota = { id: "quota-a", document_line_type: "event_sales", event_id: "event-a", amount: "95.00",
    event_gross_amount: "100.00", event_retained_amount: "5.00", declared_event_net: "82.00", document_page: 2, document_line_ref: "Q1" };
  const statement = { id: "statement-a", number: "SYN/1", status: "confirmed", company_id: "company-a", financial_account_id: "office-a",
    ticket_office_statement_lines: [quota,
      { id: "invoice-a", document_line_type: "ticketline_invoice", quota_line_id: quota.id, description: "Comissão documental", amount: "-10.00" },
      { id: "venue-a", document_line_type: "venue_settlement", quota_line_id: quota.id, description: "Acerto de sala", amount: "-3.00" },
      { id: "advance-a", document_line_type: "advance", amount: "-200.00" }],
  };
  f.read = { status: "v2", confirmedStatements: [statement], draftStatements: [], legacyStatements: [],
    provenance: { eventMemberships: [{ event_id: "event-a", company_id: "company-a", financial_account_id: "office-a",
      statement_id: statement.id, quota_line_id: quota.id }] } };
  return statement;
}
describe("#303 R8 — direito documental único e leitura sem comandos", () => {
  it("cartão usa a quota do PDF, mostra decomposição/origem e não oferece escrita nem crédito", async () => {
    withMembership();
    f.rows.ticket_office_settlements[0] = { ...legacy, transfer_transaction_id: "out" };
    f.rows.transactions = [{ id: "out", status: "pending", amount: 30 }];
    mount(<TicketOfficeSettlementsPanel officeId="office-a" officeName="Bilheteira sintética" />);
    const block = await screen.findByTestId("settlement-event-right");
    expect(block).toHaveTextContent("82,00"); expect(block).toHaveTextContent("Congelado");
    expect(block).toHaveTextContent("Comissão documental: -10,00"); expect(block).toHaveTextContent("Acerto de sala: -3,00");
    expect(screen.getByRole("link", { name: "ver apuramento" })).toHaveAttribute("href", "/bilheteiras?conta=office-a&separador=apuramentos#apuramento-statement-a");
    expect(screen.queryByTitle("Editar")).toBeNull(); expect(screen.queryByTitle("Estornar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirmar crédito" })).toBeNull();
    expect(screen.queryByText(/líquido a transferir/i)).toBeNull(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("modal de um fecho com pertença contém apenas leitura, mesmo para admin", async () => {
    withMembership();
    mount(<TicketOfficeSettlementModal open onClose={vi.fn()} officeId="office-a" officeName="Bilheteira sintética" existingSettlement={legacy} />);
    expect(await screen.findByTestId("settlement-event-right")).toHaveTextContent("82,00");
    expect(screen.getByRole("dialog").querySelectorAll("input,select,textarea")).toHaveLength(0);
    for (const name of [/Guardar rascunho/, /Confirmar fecho/, /Estornar/, /Confirmar crédito/]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("vista e PDF acrescentam direito/origem congelados e separam a transferência", async () => {
    withMembership(); const view = await fetchSettlementView(legacy, "Bilheteira sintética");
    expect(view.netFinal).toBe(82); expect(view.netTransferred).toBe(30);
    render(<SettlementReadContent v={view} />); expect(screen.getByTestId("settlement-event-right")).toHaveTextContent("página 2 · Q1");
    await exportTicketOfficeSettlementPdf(view);
    // Inspect the real PDF stream, not mocked drawing calls.
    const pdf = new TextDecoder("latin1").decode(f.pdf);
    expect(pdf).toContain("SYN/1"); expect(pdf).toContain("quota documental do PDF");
    expect(pdf).toContain("Comiss"); expect(pdf).toContain("82,00"); expect(pdf).toContain("30,00");
  });
  it("rascunho/acerto posterior não substitui a quota congelada e outra conta não a herda", () => {
    const original = withMembership();
    f.read.draftStatements = [{ ...original, id: "draft-new", number: "SYN/2" }];
    f.read.confirmedStatements.unshift({ ...original, id: "adjustment-new", number: "SYN/3", ticket_office_statement_lines: [
      { id: "adjustment", amount: "-1.00", event_id: "event-a", adjusts_statement_id: original.id, adjusts_line_id: "quota-a" },
    ] });
    expect(settlementEventRight(f.read, legacy)?.amount).toBe(82);
    expect(settlementEventRight(f.read, { ...legacy, financial_account_id: "other-office" })).toBeUndefined();
    expect(settlementEventRight(f.read, { ...legacy, company_id: "other-company" })).toBeUndefined();
    Object.assign(original.ticket_office_statement_lines[0], { declared_event_net: "82.01" });
    expect(() => settlementEventRight(f.read, legacy)).toThrow("não reconciliada");
  });
  it.each(["v2_unavailable", "error"])("falha %s bloqueia comandos e não fabrica um direito", async status => {
    f.read = status === "error" ? undefined : { status }; f.readError = status === "error";
    mount(<TicketOfficeSettlementsPanel officeId="office-a" officeName="Bilheteira sintética" />);
    await screen.findByText("Evento sintético");
    expect(screen.getByRole("status")).toHaveTextContent("Escrita bloqueada");
    expect(screen.queryByTitle("Editar")).toBeNull(); expect(screen.queryByTitle("Estornar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Novo Fecho" })).toBeNull();
  });
});

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("drizzle/migrations/0348_issue303_event_guards.sql");
const rollbackFile = read("supabase/manual/rollback_0348_issue303_event_guards_comentado.sql");
const rollback = rollbackFile.split("-- >>> ROLLBACK\n")[1].split("-- <<< ROLLBACK")[0]
  .split("\n").filter(Boolean).map(l => l.slice(3)).join("\n");
const id = (n: number) => `${n.toString(16).padStart(8, "0")}-3030-4000-8000-000000000000`;
const CO = id(1), AC = id(2), BANK = id(3), EV = id(4), ST = id(5), USER = id(6), OTHER = id(7), FREE = id(8), FOREIGN = id(9);
const insertSettlement = (sid = ST, event = EV, office = AC, company = CO) => `INSERT INTO ticket_office_settlements
  (id,company_id,financial_account_id,event_id,status,gross_revenue,total_deductions,net_calculated,net_transferred)
  VALUES (${q(sid)},${q(company)},${q(office)},${q(event)},'confirmed',100,10,90,0)`;
const fn = (source: string, name: string) => {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS (\\$(?:\\w+)?\\$)[\\s\\S]*?\\1;`));
  if (!match) throw new Error(`Definição ausente: ${name}`); return match[0];
};
const body = (sql: string) => sql.slice(sql.indexOf("BEGIN;") + 6, sql.lastIndexOf("COMMIT;"));

class GuardHarness {
  db!: PGlite;
  async value<T = any>(sql: string): Promise<T> { return Object.values((await this.db.query<Record<string, T>>(sql)).rows[0])[0]; }
  async fails(sql: string, code = "55000", message = "issue303_event_frozen") {
    await this.db.exec("SAVEPOINT failure");
    try { await expect(this.db.exec(sql)).rejects.toMatchObject({ code, message: expect.stringContaining(message) }); }
    finally { await this.db.exec("ROLLBACK TO failure; RELEASE SAVEPOINT failure"); }
  }
  async actor() { await this.db.exec("SET SESSION AUTHORIZATION authenticated"); }
  async owner() { await this.db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE"); }
  async init(patch314: boolean, index313: boolean) {
    globalThis.Blob = NodeBlob as unknown as typeof Blob; globalThis.File = NodeFile as unknown as typeof File;
    this.db = new PGlite();
    // Faithful columns for the real legacy RPCs, deliberately without R3's
    // broader pre-existing source guard, to measure exactly the R8 increment.
    await this.db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
      CREATE SCHEMA auth; CREATE SCHEMA issue303_private;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${USER}'::uuid $$;
      CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${CO}'::uuid $$;
      CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION is_platform_admin(uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1=current_company_id() $$;
      CREATE SEQUENCE fixture_id;
      CREATE TABLE financial_accounts(id uuid PRIMARY KEY,company_id uuid,name text);
      CREATE TABLE events(id uuid PRIMARY KEY,company_id uuid);
      CREATE TABLE ticket_office_settlements(
        id uuid PRIMARY KEY DEFAULT ('00000000-0000-4000-8000-' || lpad(nextval('fixture_id')::text,12,'0'))::uuid,
        company_id uuid,financial_account_id uuid,event_id uuid,status text,settlement_date date,
        gross_revenue numeric,total_deductions numeric,net_calculated numeric,net_adjusted numeric,net_transferred numeric,
        transfer_transaction_id uuid,transfer_account_id uuid,adjustment_notes text,gross_adjustment_notes text,
        forma_liquidacao_manual text,forma_liquidacao_manual_notes text,document_url text,document_name text,notes text,
        venue_retained_amount numeric,venue_retained_invoice_id uuid,venue_retained_notes text,venue_retained_payment_id uuid,
        venue_invoice_remainder_paid boolean,venue_invoice_remainder_amount numeric,venue_invoice_remainder_payment_id uuid,
        closed_at timestamptz,closed_by uuid,created_by uuid,reversed_at timestamptz,reversed_by uuid,reversal_reason text);
      CREATE TABLE transactions(
        id uuid PRIMARY KEY DEFAULT ('00000000-0000-4000-8000-' || lpad(nextval('fixture_id')::text,12,'0'))::uuid,
        company_id uuid,event_id uuid,type text,category_id uuid,description text,amount numeric,iva_rate numeric,date date,
        status text,paid_amount numeric,payment_date date,account_id uuid,payment_method text,exclude_from_result boolean,
        currency text,settlement_id uuid,operation_key text,reversed_at timestamptz,reversal_kind text);
      CREATE TABLE transaction_payments(id uuid DEFAULT gen_random_uuid(),transaction_id uuid,amount numeric,payment_date date,
        payment_method text,account_id uuid,notes text,created_by text);
      CREATE TABLE transaction_audit_log(transaction_id uuid,changed_by text,field_name text,old_value text,new_value text);
      CREATE TABLE event_ticket_office_assignments(event_id uuid,financial_account_id uuid,is_conciliated boolean,conciliated_at timestamptz,conciliated_by text);
      CREATE TABLE event_ticket_office_advances(id uuid,settlement_id uuid);
      CREATE TABLE system_audit_log(entity_type text,entity_id text,action text,changed_by text,metadata jsonb,company_id uuid);
      CREATE TABLE ticket_office_statements(id uuid PRIMARY KEY,company_id uuid,financial_account_id uuid,status text);
      CREATE TABLE ticket_office_statement_events(event_id uuid PRIMARY KEY,company_id uuid,financial_account_id uuid,statement_id uuid);
      INSERT INTO financial_accounts VALUES ('${AC}','${CO}','Bilheteira sintética'),('${OTHER}','${CO}','Outra bilheteira'),('${BANK}','${CO}','Banco');
      INSERT INTO events VALUES ('${EV}','${CO}'),('${FREE}','${CO}');
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT USAGE ON SEQUENCE fixture_id TO authenticated;`);
    await this.db.exec(read("supabase/migrations/20260912193941_e33bfb5f-eba7-440a-a815-f8e6b4f43651.sql"));
    await this.db.exec(read("drizzle/migrations/0094_derp_296_triggers_own_invoice_paid.sql"));
    await this.db.exec(fn(read("drizzle/migrations/0067_derp219_delete_cascade_settlement_reverse_forecast_amount_rateio.sql"), "reverse_ticket_office_settlement"));
    await this.db.exec("GRANT EXECUTE ON FUNCTION reverse_ticket_office_settlement(uuid,text,text) TO authenticated");
    if (patch314) await this.db.exec(read("drizzle/migrations/0323_issue314_fecho_entrada_sem_conta.sql"));
    if (index313) await this.db.exec(read("drizzle/migrations/0317_issue313_settlements_unique_active.sql"));
  }
  transfer(sid = ST, bank: string | null = BANK, credited = false) { return `SELECT create_settlement_transfer(${q(sid)},${q(AC)},${q(bank)},20,'2026-11-01',${credited})`; }
  save(sid: string | null = ST, event = EV, account = AC, venue = false) {
    const payload = { financial_account_id: account, event_id: event, settlement_date: "2026-11-01", gross_revenue: 100,
      total_deductions: 10, net_calculated: 90, ...(venue ? { venue_retained_amount: 5, venue_retained_invoice_id: id(20),
        venue_invoice_remainder_paid: true, venue_invoice_remainder_amount: 15 } : {}) };
    return `SELECT save_ticket_office_settlement(${q(sid)},${q(JSON.stringify(payload))}::jsonb,true,'[]',NULL,'Retido','Restante','Teste')`;
  }
  async snapshot() { return this.value(`SELECT jsonb_build_object(
    'settlements',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM ticket_office_settlements s),
    'transactions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t),
    'payments',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM transaction_payments p),
    'assignments',(SELECT jsonb_agg(to_jsonb(a)) FROM event_ticket_office_assignments a),
    'audit',(SELECT jsonb_agg(to_jsonb(a)) FROM system_audit_log a))`); }
  async catalog() { return this.value(`SELECT jsonb_build_object('functions',(
    SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl) ORDER BY p.oid::regprocedure::text)
    FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'issue303_private'::regnamespace)),
    'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE NOT tgisinternal))`); }
}

describe.each([[false,false],[true,false],[false,true],[true,true]])("#303 0348 — RPCs reais, 0323=%s / 0317=%s", (patch314,index313) => {
  const h = new GuardHarness();
  beforeAll(() => h.init(patch314,index313), 30000);
  afterAll(async () => { await h.db.close(); });
  beforeEach(async () => {
    await h.owner(); await h.db.exec(`BEGIN; ALTER SEQUENCE fixture_id RESTART WITH 100; ${insertSettlement()};
      ${insertSettlement(id(10),FREE)};
      INSERT INTO ticket_office_statements VALUES ('${id(11)}','${CO}','${AC}','confirmed');
      INSERT INTO ticket_office_statement_events VALUES ('${EV}','${CO}','${AC}','${id(11)}');
      INSERT INTO event_ticket_office_assignments VALUES ('${EV}','${AC}',true,now(),'synthetic');`);
  });
  afterEach(async () => { await h.db.exec("ROLLBACK"); await h.owner(); });

  it("recusa INSERT, todos os valores protegidos, estorno, DELETE e as RPCs sem efeitos parciais", async () => {
    await h.db.exec(`INSERT INTO transactions(id,company_id,event_id,settlement_id,type,amount,status,paid_amount,account_id)
      VALUES ('${id(40)}','${CO}','${EV}','${ST}','expense',10,'paid',10,'${AC}');
      INSERT INTO transaction_payments(id,transaction_id,amount) VALUES ('${id(41)}','${id(40)}',10);
      INSERT INTO event_ticket_office_advances VALUES ('${id(42)}','${ST}');`);
    await h.db.exec(body(migration)); const before = await h.snapshot(); await h.actor();
    await h.fails(insertSettlement(id(12)));
    for (const patch of ["gross_revenue=101", "total_deductions=11", "net_calculated=91", "net_adjusted=91", "net_transferred=1",
      `transfer_account_id='${BANK}'`, `transfer_transaction_id='${id(13)}'`, "status='reversed'", "status='draft'",
      "venue_retained_amount=1", "venue_invoice_remainder_amount=1", "notes='Acerto indevido'",
      `event_id='${FREE}'`, `financial_account_id='${OTHER}'`, `company_id='${FOREIGN}'`]) {
      await h.fails(`UPDATE ticket_office_settlements SET ${patch} WHERE id='${ST}'`);
    }
    await h.fails(`DELETE FROM ticket_office_settlements WHERE id='${ST}'`);
    await h.fails(h.save()); await h.fails(h.save(null)); await h.fails(h.transfer());
    await h.fails(`SELECT reverse_ticket_office_settlement('${ST}','Acerto indevido','Teste')`);
    expect(await h.snapshot()).toEqual(before);
  });
  it("protege também a entrada sem settlement_id e a conversão directa de operação", async () => {
    await h.db.exec(body(migration)); await h.actor();
    const key = `TRF-FECHO-${ST.slice(0,8).toUpperCase()}`;
    for (const type of ["expense","income"]) await h.fails(`INSERT INTO transactions(company_id,event_id,type,operation_key)
      VALUES ('${CO}','${EV}','${type}','${key}')`);
    await h.db.exec(`INSERT INTO transactions(id,company_id,event_id,type) VALUES ('${id(21)}','${CO}','${EV}','income')`);
    await h.fails(`UPDATE transactions SET operation_key='${key}' WHERE id='${id(21)}'`);
  });
  it("sem pertença, outra conta, outro tenant e pertença draft conservam comportamento anterior", async () => {
    await h.db.exec(`INSERT INTO financial_accounts VALUES ('${id(30)}','${FOREIGN}','Conta estrangeira');
      INSERT INTO events VALUES ('${id(31)}','${FOREIGN}');`);
    await h.db.exec(body(migration)); await h.actor();
    await h.db.exec(`${insertSettlement(id(22),EV,OTHER)}; ${insertSettlement(id(23),id(31),id(30),FOREIGN)};`);
    await h.db.exec(`UPDATE ticket_office_settlements SET gross_revenue=111 WHERE id='${id(22)}';
      DELETE FROM ticket_office_settlements WHERE id='${id(23)}'; ${h.save(id(10),FREE)}; ${h.transfer(id(10))};`);
    expect(await h.value(`SELECT net_transferred FROM ticket_office_settlements WHERE id='${id(10)}'`)).toBe("20");
    await h.owner(); await h.db.exec(`UPDATE ticket_office_statements SET status='draft';`); await h.actor();
    await h.db.exec(`UPDATE ticket_office_settlements SET net_calculated=91 WHERE id='${ST}'`);
  });
  it("reaplicação é idempotente, ACL fica privada e rollback repõe o catálogo anterior", async () => {
    const before = await h.catalog();
    await h.db.exec(body(migration)); const installed = await h.catalog(); await h.db.exec(body(migration));
    expect(await h.catalog()).toEqual(installed);
    for (const signature of ["assert_event_unfrozen(uuid,uuid,uuid,text)", "event_settlement_guard()", "event_transfer_guard()"]) {
      for (const role of ["anon","authenticated","service_role"]) expect(await h.value(`SELECT has_function_privilege('${role}','issue303_private.${signature}','EXECUTE')`)).toBe(false);
      expect(await h.value(`SELECT NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid='issue303_private.${signature}'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')`)).toBe(true);
    }
    await h.db.exec(body(rollback)); expect(await h.catalog()).toEqual(before);
    await h.actor(); await h.db.exec(h.transfer());
  });
  it("regras de repasse #314 e pagamentos de sala têm os mesmos resultados antes/depois", async () => {
    const run = async () => {
      await h.db.exec("SAVEPOINT baseline");
      try {
        await h.db.exec(`INSERT INTO transactions(id,company_id,amount,type) VALUES ('${id(20)}','${CO}',20,'expense')`);
        await h.actor(); await h.db.exec(h.save(id(10),FREE,AC,true));
        if (patch314) await h.db.exec(h.transfer(id(10),null,false));
        else await h.fails(h.transfer(id(10),null,false),"22023","Contas de origem e destino");
        const value = await h.value(`SELECT jsonb_build_object('payments',(
          SELECT jsonb_agg(jsonb_build_array(amount,payment_method,account_id) ORDER BY amount) FROM transaction_payments),
          'legs',(SELECT jsonb_agg(jsonb_build_array(type,amount,status,paid_amount,account_id) ORDER BY type) FROM transactions WHERE operation_key LIKE 'TRF-FECHO-%'))`);
        return value;
      } finally { await h.owner(); await h.db.exec("ROLLBACK TO baseline; RELEASE SAVEPOINT baseline; ALTER SEQUENCE fixture_id RESTART WITH 100"); }
    };
    const before = await run(); await h.db.exec(body(migration)); expect(await run()).toEqual(before);
  });
});

describe("#303 R8 — integração com 0345–0347 e acerto Q4", () => {
  const h = new PositionHarness();
  beforeAll(async () => {
    globalThis.Blob = NodeBlob as unknown as typeof Blob; globalThis.File = NodeFile as unknown as typeof File;
    await h.init(); await h.db.exec("ALTER TABLE transactions ADD COLUMN operation_key text"); await h.db.exec(migration);
  },30000);
  afterAll(async () => { await h.db?.close(); });
  beforeEach(() => h.begin()); afterEach(() => h.end());
  it("confirma pertença real; novo documento referencia o original e conserva fecho, recibo e pertença", async () => {
    const original = await h.draft({ lines: [sales(), opening(-10000)] }); await h.confirm(original.s,true); await h.owner();
    const snapshot = await h.snapshot();
    const receipt = await h.value(`SELECT confirmation_receipt FROM ticket_office_statements WHERE id=${q(original.s.statement_id)}`);
    const memberships = await h.value("SELECT jsonb_agg(to_jsonb(e)) FROM ticket_office_statement_events e");
    const oldLine = (original.payload.lines[0] as Record<string, unknown>).id;
    const source = await h.advance(100,"2026-10-02",{ event_id: uid(1000) });
    const adjustment = { ...source.line, id: uid(8000), document_line_type: "ticketline_invoice", description: "Acerto posterior documentado",
      event_id: uid(1000), adjusts_statement_id: original.s.statement_id, adjusts_line_id: oldLine,
      adjustment_reason: "Correcção documental posterior", notes: "Acerto sem fatura, provado pelo PDF" };
    const next = await h.draft({ lines: [adjustment], date: "2026-10-03", predecessor: original.s.statement_id });
    const beforeConfirm = await h.snapshot(); await h.actor(); await h.confirm(next.s); await h.owner();
    // The independent late invoice was explicitly added above; confirmation
    // itself must leave every financial record (including the original) intact.
    expect((await h.snapshot() as any).settlements).toEqual((snapshot as any).settlements);
    expect(await h.snapshot()).toEqual(beforeConfirm);
    expect(await h.value(`SELECT confirmation_receipt FROM ticket_office_statements WHERE id=${q(original.s.statement_id)}`)).toEqual(receipt);
    expect(await h.value("SELECT jsonb_agg(to_jsonb(e)) FROM ticket_office_statement_events e")).toEqual(memberships);
    expect(await h.value(`SELECT adjusts_statement_id FROM ticket_office_statement_lines WHERE id=${q(adjustment.id)}`)).toBe(original.s.statement_id);
    await h.fails(`UPDATE ticket_office_settlements SET net_calculated=99 WHERE id=${q(uid(2000))}`,"issue303_event_frozen","55000");
    await h.fails(`DELETE FROM ticket_office_settlements WHERE id=${q(uid(2000))}`,"issue303_event_frozen","55000");
  });
  it("documenta sem alargar a guarda R8: guardas R3 anteriores continuam exactamente iguais", async () => {
    await h.enable();
    const baseline = await h.value(`SELECT pg_get_functiondef('public._issue303_source_write_guard()'::regprocedure)`);
    await h.fails(`UPDATE ticket_office_settlements SET net_calculated=99 WHERE id=${q(uid(2000))}`,"issue303_frozen_source_or_legacy_writer","42501");
    expect(await h.value(`SELECT pg_get_functiondef('public._issue303_source_write_guard()'::regprocedure)`)).toBe(baseline);
  });
});

it("0348 tem cópia exacta, cabeçalho, ordem e rollback exclusivamente comentado", () => {
  expect(read("supabase/manual/0348_issue303_event_guards.sql")).toBe(migration);
  expect(migration).toContain("PREPARADA, NÃO APLICADA");
  expect(migration).toContain("0323 → 0317 → 0345 → 0346 → 0347 → 0348");
  expect(migration).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION public\.(?:save_ticket_office_settlement|create_settlement_transfer|reverse_ticket_office_settlement)/);
  expect(rollbackFile.split("\n").filter(l => l.trim()).every(l => l.startsWith("--"))).toBe(true);
});
