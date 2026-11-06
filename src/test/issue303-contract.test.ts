import { describe, expect, it } from "vitest";
import { ALL_FEATURE_KEYS, FEATURES, FEATURE_LABELS } from "@/lib/features";
import {
  isTicketOfficeStatementsV2Enabled, parseTicketlineStatementAmountCents,
  validateTicketlineStatement, TicketlineStatementContractError,
  TICKETLINE_STATEMENT_CONTRACT_VERSION, TICKETLINE_STATEMENT_LINE_TYPES,
  type TicketlineStatementContext,
} from "@/lib/ticketline-statement-contract";
import * as shared from "../../supabase/functions/_shared/ticketline-statement-contract";
import {
  issue303Config, issue303Feature, issue303Context, issue303OpeningContext,
  issue303Statement, issue303OpeningStatement,
} from "./fixtures/issue303-statement";

const capability = (patch: Partial<Parameters<typeof isTicketOfficeStatementsV2Enabled>[0]> = {}) =>
  isTicketOfficeStatementsV2Enabled({ feature: issue303Feature, config: issue303Config, financialAccountId: "account-a", ...patch });
const account = { financial_account_id: "account-a", enabled: true, contract_version: 2 };
const withLine = (index: number, patch: Record<string, unknown>) => {
  const statement = issue303Statement();
  return { ...statement, lines: statement.lines.map((line, i) => i === index ? { ...line, ...patch } : line) };
};
function refuses(input: unknown, code: string, context: TicketlineStatementContext = issue303Context) {
  try {
    validateTicketlineStatement(input, context);
    expect.fail(`Expected contract refusal: ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(TicketlineStatementContractError);
    expect((error as TicketlineStatementContractError).code).toBe(code);
  }
}

describe("#303 R1 — capacidade por conta, desligada por omissão", () => {
  it("regista só a chave genérica e partilha o contrato sem duplicar implementação", () => {
    expect(FEATURES.TICKET_OFFICE_STATEMENTS_V2).toBe("ticket-office-statements-v2");
    expect(ALL_FEATURE_KEYS).toContain(FEATURES.TICKET_OFFICE_STATEMENTS_V2);
    expect(FEATURE_LABELS[FEATURES.TICKET_OFFICE_STATEMENTS_V2].label).toBeTruthy();
    expect(validateTicketlineStatement).toBe(shared.validateTicketlineStatement);
    expect(isTicketOfficeStatementsV2Enabled).toBe(shared.isTicketOfficeStatementsV2Enabled);
  });

  it("exige empresa e conta explicitamente activas na versão corrente", () => {
    expect(capability()).toBe(true);
    expect(capability({ financialAccountId: "account-b" })).toBe(false);
    expect(capability({ financialAccountId: "account-absent" })).toBe(false);
    expect(capability({ feature: { ...issue303Feature, enabled: false } })).toBe(false);
    expect(capability({ config: { accounts: [{ ...account, enabled: false }] } })).toBe(false);
    // Canonical identifiers are supplied data, with no tenant/provider selector.
    expect(capability({ financialAccountId: "another-canonical-account", config: {
      accounts: [{ ...account, financial_account_id: "another-canonical-account" }],
    } })).toBe(true);
  });

  it.each([undefined, null, false, true, "enabled", {}, [],
    { enabled: true }, { feature_key: issue303Feature.feature_key },
    { ...issue303Feature, enabled: "true" }, { ...issue303Feature, enabled: 1 },
    { ...issue303Feature, feature_key: "another-feature" },
  ])("recusa feature omissa ou inválida: %j", (feature) => {
    expect(capability({ feature })).toBe(false);
  });

  it.each([undefined, null, false, "{}", {}, [], { accounts: null }, { accounts: {} }, { accounts: [] },
    { accounts: [null] }, { accounts: [account, null] },
    { accounts: [{ enabled: true, contract_version: 2 }] },
    { accounts: [{ ...account, financial_account_id: " " }] },
    { accounts: [{ ...account, financial_account_id: 1 }] },
    { accounts: [{ financial_account_id: "account-a", contract_version: 2 }] },
    { accounts: [{ ...account, enabled: "true" }] }, { accounts: [{ ...account, enabled: 1 }] },
    { accounts: [{ financial_account_id: "account-a", enabled: true }] },
    ...[1, 3, "2", null].map((contract_version) => ({ accounts: [{ ...account, contract_version }] })),
    { accounts: [account, account] },
    { accounts: [account, { ...account, enabled: false }] },
  ])("recusa config omisso ou inválido: %j", (config) => {
    expect(capability({ config })).toBe(false);
  });

  it.each([undefined, null, "", " ", 1, {}])("recusa identidade de conta inválida: %j", (financialAccountId) => {
    expect(capability({ financialAccountId })).toBe(false);
  });

  it.each([new Error("synthetic read failure"), { message: "unavailable" }, "failed", false])(
    "um erro de leitura prevalece sobre configuração válida: %j", (readError) => {
      expect(capability({ readError })).toBe(false);
    },
  );

  it("não habilita sem argumentos e recusa falhas ao interpretar dados", () => {
    expect(isTicketOfficeStatementsV2Enabled({})).toBe(false);
    expect(capability({ config: { get accounts() { throw new Error("synthetic read failure"); } } })).toBe(false);
    expect(capability({ readError: null })).toBe(true);
  });
});

describe("#303 R1 — precisão antes de coerção, sem arredondar", () => {
  it.each([
    ["0", 0], ["-0.00", 0], ["1", 100], ["1.2", 120], ["0.29", 29],
    ["-1050.00", -105000], ["90071992547409.91", Number.MAX_SAFE_INTEGER],
    [0.29, 29], [1.01, 101], [-1.23, -123],
  ])("converte %j em %i cêntimos exactos", (value, expected) => {
    expect(parseTicketlineStatementAmountCents(value)).toBe(expected);
  });

  it.each(["1.001", "1.230", "0.000", "-1.999", 1.001, 0.1 + 0.2,
    "1e2", "1,20", "1.000,00", " 1.00 ", "", ".5", "1.", "NaN", "Infinity",
    NaN, Infinity, -Infinity, undefined, null, false, {}, [],
    "90071992547409.92", Number.MAX_SAFE_INTEGER,
  ])("recusa precisão/formato/intervalo inválido: %j", (value) => {
    expect(() => parseTicketlineStatementAmountCents(value)).toThrow(TicketlineStatementContractError);
  });
});

describe("#303 R1 — contrato documental puro", () => {
  it("reconcilia −105000 por linhas e por quotas independentes", () => {
    const input = issue303Statement();
    const before = JSON.stringify(input);
    const result = validateTicketlineStatement(input, issue303Context);
    expect(result).toEqual({ contract_version: 2, total_cents: -105000, event_quotas: [
      { event_id: "event-a", quota_line_id: "sales-a", amount_cents: 70000 },
      { event_id: "event-b", quota_line_id: "sales-b", amount_cents: 120000 },
      { event_id: "event-c", quota_line_id: "sales-c", amount_cents: 50000 },
    ] });
    expect(-40000 + 70000 + 120000 + 50000 - 5000 - 200000 - 100000).toBe(result.total_cents);
    expect(new Set(input.lines.map((l) => l.document_line_type))).toEqual(new Set(TICKETLINE_STATEMENT_LINE_TYPES.filter((t) => t !== "opening_balance")));
    expect(JSON.stringify(input)).toBe(before);
    expect(validateTicketlineStatement({ ...input, lines: [...input.lines].reverse() }, issue303Context).total_cents).toBe(-105000);
  });

  it.each([undefined, null, 1, 3, "2"])("recusa contrato sem versão v2: %j", (contract_version) => {
    expect(TICKETLINE_STATEMENT_CONTRACT_VERSION).toBe(2);
    refuses({ ...issue303Statement(), contract_version }, "invalid_version");
  });

  it("recusa um evento repetido no documento, mesmo com outra linha", () => {
    refuses(withLine(1, { event_id: "event-a" }), "duplicate_or_invalid_event");
  });

  it("recusa um segundo fecho de evento já confirmado, preservando a factura tardia", () => {
    refuses(issue303Statement(), "duplicate_or_invalid_event", { ...issue303Context, confirmed_event_ids: ["event-a"] });
    expect(validateTicketlineStatement(issue303Statement(), issue303Context).total_cents).toBe(-105000);
  });

  it.each([0, 1, 200000])("recusa sinal de repasse inválido: %i", (amount_cents) => {
    refuses(withLine(7, { amount_cents }), "invalid_sign");
  });

  it("recusa venda e retenção de sinal inválido", () => {
    refuses(withLine(0, { amount_cents: -100000 }), "invalid_sign");
    refuses(withLine(0, { event_gross_cents: -1 }), "invalid_sign");
    refuses(withLine(0, { event_retained_cents: -1 }), "invalid_sign");
    refuses(withLine(0, { event_retained_cents: 102000 }), "invalid_sign");
  });

  it("recusa custos positivos sem prova do sinal, permitindo crédito documentado", () => {
    refuses(withLine(4, { amount_cents: 5000 }), "invalid_sign");
    refuses(withLine(5, { amount_cents: 20000 }), "invalid_sign");
    expect(validateTicketlineStatement({ ...withLine(4, { amount_cents: 5000,
      positive_sign_evidence: "synthetic credit note" }), document_total_cents: -95000 }, issue303Context).total_cents).toBe(-95000);
  });

  it.each([1.001, "100000", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("recusa cêntimos não inteiros/seguros: %j", (amount_cents) => {
    refuses(withLine(0, { amount_cents }), "invalid_cents");
  });

  it("valida precisão no total, bruto, retido e líquido declarado", () => {
    refuses({ ...issue303Statement(), document_total_cents: -105000.1 }, "invalid_cents");
    for (const field of ["event_gross_cents", "event_retained_cents", "declared_event_net_cents"]) {
      refuses(withLine(0, { [field]: 1.1 }), "invalid_cents");
    }
  });

  it("recusa divergência de um cêntimo no total, quota e decomposição", () => {
    refuses({ ...issue303Statement(), document_total_cents: -104999 }, "document_total_mismatch");
    refuses(withLine(0, { declared_event_net_cents: 70001 }), "quota_mismatch");
    refuses(withLine(0, { event_gross_cents: 101001 }), "sales_mismatch");
  });

  it("recusa referências a quota inexistente, histórica ou de outro evento", () => {
    refuses(withLine(3, { quota_line_id: "missing" }), "invalid_quota_reference");
    refuses(withLine(3, { quota_line_id: "sales-previous" }), "invalid_quota_reference");
    refuses(withLine(3, { event_id: "event-b" }), "invalid_quota_reference");
  });

  it("repasses e transitados ficam na conta sem referências a evento ou quota", () => {
    for (const index of [7, 9]) {
      for (const field of ["event_id", "quota_line_id", "ticket_office_settlement_id"]) {
        refuses(withLine(index, { [field]: "synthetic-link" }), "forbidden_reference");
      }
    }
  });

  it("exige uma única origem de factura e origem do repasse", () => {
    refuses(withLine(3, { invoice_group_id: "group-a" }), "invalid_invoice_source");
    refuses(withLine(3, { transaction_id: null }), "invalid_invoice_source");
    refuses(withLine(7, { transaction_id: null }), "invalid_advance_source");
    expect(validateTicketlineStatement(withLine(3, { transaction_id: null, invoice_group_id: "group-a" }), issue303Context).total_cents).toBe(-105000);
  });

  it("exige motivo e documento/linha originais no acerto tardio", () => {
    refuses(withLine(4, { adjustment_reason: "" }), "invalid_adjustment");
    refuses(withLine(4, { adjusts_line_id: null }), "invalid_adjustment");
    refuses(withLine(4, { adjusts_statement_id: "statement-current" }), "invalid_adjustment");
  });

  it("recusa pendências, tipos desconhecidos e identificadores de linha repetidos", () => {
    refuses(withLine(0, { pending_document: true }), "pending_document");
    refuses(withLine(0, { document_line_type: "event_right" }), "invalid_line_type");
    refuses(withLine(1, { id: "sales-a" }), "duplicate_or_invalid_line");
  });

  it("exige predecessor depois do primeiro documento, mesmo com saldo zero", () => {
    refuses({ ...issue303Statement(), predecessor_statement_id: null }, "invalid_predecessor");
    refuses(withLine(9, { previous_statement_id: "another-predecessor" }), "invalid_carry_over");
    expect(validateTicketlineStatement({ ...withLine(9, { amount_cents: 0 }), document_total_cents: -65000 }, issue303Context).total_cents).toBe(-65000);
  });

  it("recusa transitado duplicado e overflow na soma sem arredondamento", () => {
    const statement = issue303Statement();
    refuses({ ...statement, lines: [...statement.lines, { ...statement.lines[9], id: "carry-copy" }] }, "invalid_carry_over");
    const opening = issue303OpeningStatement();
    refuses({ ...opening, lines: [
      { ...opening.lines[0], amount_cents: Number.MAX_SAFE_INTEGER },
      { ...opening.lines[1], amount_cents: 1, event_gross_cents: 1, declared_event_net_cents: 1 },
    ] }, "invalid_cents", issue303OpeningContext);
  });

  it.each([null, [], false])("recusa documento malformado: %j", (input) => {
    refuses(input, "invalid_statement");
  });
  it("recusa contexto ausente ou incompleto sem inferir primeiro documento", () => {
    expect(() => validateTicketlineStatement(issue303Statement(), undefined)).toThrow("invalid_context");
    refuses(issue303Statement(), "invalid_context", {} as TicketlineStatementContext);
  });
});

describe("#303 R1 — abertura única Q2", () => {
  it("reconcilia a fixture independente em −10000 cêntimos", () => {
    const statement = issue303OpeningStatement();
    const before = JSON.stringify(statement);
    const result = validateTicketlineStatement(statement, issue303OpeningContext);
    expect(result.total_cents).toBe(-40000 + 50000 - 20000);
    expect(result.event_quotas).toEqual([{ event_id: "event-opening", quota_line_id: "opening-sales", amount_cents: 50000 }]);
    expect(JSON.stringify(statement)).toBe(before);
  });

  it("recusa abertura fora do primeiro documento, mesmo com nota e aprovação", () => {
    refuses({ ...issue303OpeningStatement(), predecessor_statement_id: "opening-predecessor" }, "invalid_opening_position", {
      ...issue303OpeningContext, is_first_statement: false,
    });
  });

  it("recusa segunda abertura e predecessor fictício no primeiro documento", () => {
    const statement = issue303OpeningStatement();
    refuses({ ...statement, lines: [...statement.lines, { ...statement.lines[0], id: "opening-copy" }] }, "invalid_opening_position", issue303OpeningContext);
    refuses({ ...statement, predecessor_statement_id: "invented-predecessor" }, "invalid_predecessor", issue303OpeningContext);
  });

  it.each([{}, { note: " " }, { created_by: "" }, { created_at: "invalid-date" },
    { admin_approval: null }, { admin_approval: { approved: false } },
    { admin_approval: { approved: true, approved_by: "admin-a", approved_at: "invalid-date" } },
  ])("exige nota, autoria, data e aprovação explícita: %j", (patch) => {
    const statement = issue303OpeningStatement();
    const line = statement.lines[0];
    if (line.document_line_type !== "opening_balance") throw new Error("invalid fixture");
    const opening = Object.keys(patch).length ? { ...line.opening, ...patch } : null;
    refuses({ ...statement, lines: [{ ...line, opening }, ...statement.lines.slice(1)] }, "invalid_opening_evidence", issue303OpeningContext);
  });

  it("permite primeiro documento sem abertura, sem a criar pela diferença", () => {
    const statement = issue303OpeningStatement();
    const result = validateTicketlineStatement({ ...statement, document_total_cents: 30000,
      lines: statement.lines.slice(1) }, issue303OpeningContext);
    expect(result.total_cents).toBe(30000);
    refuses({ ...statement, document_total_cents: -10000, lines: statement.lines.slice(1) }, "document_total_mismatch", issue303OpeningContext);
  });
});
