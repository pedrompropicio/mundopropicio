import { describe, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateScannerAnalysis, scannerAnalysisWire, assertScannerDocument } from "../../supabase/functions/_shared/scanner-analysis";
import { scannerRequest, parseScannerContent, SCANNER_MODEL, SCANNER_SYSTEM_PROMPT } from "../../supabase/functions/_shared/scanner-extraction";
import { validateAnalysisReport } from "../../supabase/functions/_shared/data-entry-analysis";
import { durableProviderControl, type ControlRecord } from "../../supabase/functions/_shared/issue333-ai/control";
import { analyzeDocument } from "../../supabase/functions/data-entry/analysis-service";
import { sha256, stagingPath } from "../../supabase/functions/_shared/data-entry-core";
import { applyAnalysisCandidate } from "@/lib/data-entry-analysis";

const extracted = { supplier_name: "Fornecedor local", supplier_nif: "GB-AB001234", invoice_number: "AB-0001", document_date: "2026-10-19", currency: "EUR", total_amount: 100, iva_amount: 23, confidence: "high", paid_by_partner_id: "injected", quote: "invented", sql: "injected" };
const context = { document_id: "d", document_sha256: "a".repeat(64), company_id: "c", company_tax: "PT500000001" };
const form = { supplier_name: "", supplier_nif: "", invoice_number: "", invoice_date: "", total: "", iva: "", customer_nif: "", payer: "human", notes: "human-notes" };
async function pdf(pages = 1) { const doc = await PDFDocument.create(); for (let i = 0; i < pages; i++) doc.addPage(); return doc.save(); }
const input = async () => ({ bytes: await pdf(), mime: "application/pdf" as const, message: "local", history: [], signal: new AbortController().signal });
const transport = () => ({ beforePost: vi.fn(async () => {}), received: vi.fn(), completed: vi.fn() });
const success = (value: unknown = extracted) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value), reasoning: "private" } }], metadata: "private" }));
function control() {
  let state: ControlRecord = { revision: "6", state: "ready", enabled: true, reviewed: true, claim: null, stage: "idle", reason: "none", status: null };
  const transition = vi.fn(async (op, claim, revision, outcome, status) => {
    if (op === "read") return { ...state };
    expect(revision).toBe(state.revision);
    const n = String(Number(state.revision) + 1);
    if (op === "claim") state = { ...state, revision: n, claim, stage: "claimed" };
    if (op === "post") state = { ...state, revision: n, stage: "post_started" };
    if (op === "finish") state = { ...state, revision: n, reason: outcome, status: status ?? null,
      state: outcome === "credit_denied" ? "paused_credit" : outcome === "provider_denied" ? "denied_provider" : outcome === "provider_unavailable" ? "unavailable" : "ready",
      claim: ["transport_uncertain", "cancelled_after_post"].includes(outcome) ? claim : null,
      stage: ["transport_uncertain", "cancelled_after_post"].includes(outcome) ? "uncertain" : "idle" };
    return { ...state };
  });
  return { store: { transition }, state: () => state };
}
describe("#333 scanner94 local integration", () => {
  it("shares the unchanged scanner model, legacy request shape and JSON recovery", () => {
    const request = scannerRequest("local", "image/jpeg");
    expect(request.model).toBe(SCANNER_MODEL);
    expect(request.messages[0].content).toBe(SCANNER_SYSTEM_PROMPT);
    expect(request).not.toHaveProperty("max_tokens");
    expect(request.messages[1].content).toEqual([{ type: "text", text: "Extrai os dados deste talão de camarim." }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,local" } }]);
    expect(parseScannerContent('```json\n{"invoice_number":"AB-0001"}\n```')).toEqual({ invoice_number: "AB-0001" });
    expect(parseScannerContent('prefix {"invoice_number":"AB-0001"} suffix')).toEqual({ invoice_number: "AB-0001" });
  });
  it("preserves AB-0001 exactly through extraction, validation and human review", () => {
    const report = validateAnalysisReport(scannerAnalysisWire(extracted), context);
    const candidate = report.candidates.find(c => c.field === "invoice_number");
    expect(candidate?.value).toBe("AB-0001");
    if (!candidate) throw new Error("candidate absent");
    expect(applyAnalysisCandidate(form, candidate)).toBe(form);
    expect(applyAnalysisCandidate(form, candidate, true)).toEqual({ ...form, invoice_number: "AB-0001" });
  });
  it("preserves alphanumeric VAT and never supplies quotes, pages or field confidence", () => {
    const report = validateAnalysisReport(scannerAnalysisWire(extracted), context);
    const nif = report.candidates.find(c => c.field === "supplier_nif");
    expect(nif?.value).toBe("GB-AB001234"); expect(nif?.reviewable).toBe(true);
    expect(report.candidates.every(c => c.quote === null && c.page === null && c.confidence === null && !c.usable)).toBe(true);
    expect(report.candidates.map(c => c.field)).not.toContain("paid_by_partner_id");
    expect(report.candidates.find(c => c.field === "customer_nif")?.value).toBeNull();
    expect(report.candidates.find(c => c.field === "customer_nif")?.reviewable).toBe(false);
  });
  it("amount review never changes payer/notes and cannot fabricate missing IVA", () => {
    const report = validateAnalysisReport(scannerAnalysisWire({ ...extracted, iva_amount: null }), context);
    const total = report.candidates.find(c => c.field === "total_amount");
    if (!total) throw new Error("total absent");
    expect(applyAnalysisCandidate(form, total, true)).toEqual({ ...form, total: "100" });
    expect(report.candidates.find(c => c.field === "iva_amount")?.reviewable).toBe(false);
  });
  it.each([null, "USD"])("missing/foreign currency %s blocks monetary transfer", currency => {
    const report = validateAnalysisReport(scannerAnalysisWire({ ...extracted, currency }), context);
    expect(report.candidates.filter(c => c.field.endsWith("amount")).every(c => c.reviewable === false)).toBe(true);
  });
  it("IVA greater than total is blocked without automatic correction", () => {
    const report = validateAnalysisReport(scannerAnalysisWire({ ...extracted, iva_amount: 101 }), context);
    expect(report.candidates.filter(c => c.field.endsWith("amount")).every(c => !c.reviewable)).toBe(true);
    expect(report.candidates.find(c => c.field === "iva_amount")?.value).toBe("101");
  });
  it("multipage PDF is explicitly refused before headers, transport or model", async () => {
    const data = { ...await input(), bytes: await pdf(2) }, t = transport(), send = vi.fn();
    await expect(generateScannerAnalysis(data, "local-mock", t, send)).rejects.toThrow("várias páginas");
    expect(t.beforePost).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
    await expect(assertScannerDocument(await pdf(), "application/pdf")).resolves.toBeUndefined();
  });
  it("end-to-end service uses actual scanner adapter and control with mocks, hash-bound output and one POST", async () => {
    const i = await input(), c = control(), hash = await sha256(i.bytes), send = vi.fn<typeof fetch>(async () => success());
    const company = "11111111-1111-4111-8111-111111111111", session = "22222222-2222-4222-8222-222222222222";
    const state = { session: { id: session, owner_id: "u", company_id: company }, company: { id: company, tax_id: "PT500000001" }, documents: [{ id: "d", sha256: hash, path: stagingPath(company, session, hash), size_bytes: i.bytes.length, mime: i.mime, name: "local.pdf" }] };
    const deps = { enabled: true, providerReady: true, control: durableProviderControl(c.store), scope: async () => ({ user: "u", company, role: "manager", preparation: true }), load: async () => state, download: async () => i.bytes, generate: (data, lifecycle) => generateScannerAnalysis(data, "local-mock", lifecycle, send) };
    const report = await analyzeDocument(deps, { session, document: "d", message: "Extrai", history: [], signal: i.signal });
    expect(report.document_sha256).toBe(hash); expect(report.company_id).toBe(company); expect(send).toHaveBeenCalledTimes(1);
    expect(c.state().reason).toBe("success"); expect(c.state().claim).toBeNull();
    expect(JSON.stringify(report)).not.toContain("private");
    const request = JSON.parse(String(send.mock.calls[0]?.[1]?.body));
    expect(request.max_tokens).toBe(6000); expect(request.model).toBe(SCANNER_MODEL); expect(request).not.toHaveProperty("tools");
    deps.enabled = false; await expect(analyzeDocument(deps, { session, document: "d", message: "Extrai", history: [], signal: i.signal })).rejects.toMatchObject({ status: 503 });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([[402, "credit_denied"], [403, "provider_denied"], [404, "provider_unavailable"], [429, "http_failure"]])("HTTP%s is sanitized, audited and never retried", async (status, reason) => {
    const c = control(), data = await input(), send = vi.fn(async () => new Response("private-token", { status: Number(status) }));
    await expect(durableProviderControl(c.store).run(data.signal, async () => {}, t => generateScannerAnalysis(data, "local-mock", t, send))).rejects.toMatchObject({ status });
    expect(c.state().reason).toBe(reason); expect(send).toHaveBeenCalledTimes(1);
  });
  it("invalid successful JSON cannot become success or a retry", async () => {
    const c = control(), data = await input(), send = vi.fn(async () => new Response('{"choices":[{"message":{"content":"private-invalid"}}]}'));
    await expect(durableProviderControl(c.store).run(data.signal, async () => {}, t => generateScannerAnalysis(data, "local-mock", t, send))).rejects.toThrow("campos válidos");
    expect(c.state().reason).toBe("invalid_response"); expect(send).toHaveBeenCalledTimes(1);
  });
  it("Stop after POST remains uncertain; no retry", async () => {
    const caller = new AbortController(), c = control(), data = { ...await input(), signal: caller.signal };
    const send = vi.fn(async () => { caller.abort(); throw new DOMException("private", "AbortError"); });
    await expect(durableProviderControl(c.store).run(caller.signal, async () => {}, t => generateScannerAnalysis(data, "local-mock", t, send))).rejects.toMatchObject({ status: 499 });
    expect(c.state().stage).toBe("uncertain"); expect(c.state().claim).not.toBeNull(); expect(send).toHaveBeenCalledTimes(1);
  });
  it("Stop before POST does not create headers or call the model", async () => {
    const caller = new AbortController(); caller.abort(); const t = transport(), send = vi.fn();
    await expect(generateScannerAnalysis({ ...await input(), signal: caller.signal }, "local-mock", t, send)).rejects.toMatchObject({ status: 499 });
    expect(t.beforePost).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("malformed NIF and date remain editable manually, never transferable", () => {
    const report = validateAnalysisReport(scannerAnalysisWire({ ...extracted, supplier_nif: "<sql>", document_date: "2026-02-30" }), context);
    expect(report.candidates.find(c => c.field === "supplier_nif")?.reviewable).toBe(false);
    expect(report.candidates.find(c => c.field === "invoice_date")?.reviewable).toBe(false);
  });
});
import { normalizeScannerDate, normalizeScannerCurrency, SCANNER333_INSTRUCTIONS } from "../../supabase/functions/_shared/scanner-analysis";
describe("#333 fecho95 adapter corrections (synthetic)", () => {
  const base = { supplier_name: "Fornecedor sintético", supplier_nif: "GB-AB001234", invoice_number: "AB-0001", total_amount: 100, iva_amount: 23 };
  const report = (v: Record<string, unknown>) => validateAnalysisReport(scannerAnalysisWire(v), context);
  const get = (r: ReturnType<typeof report>, f: string) => r.candidates.find((c) => c.field === f)!;
  it("asks explicitly for currency and literal identifiers without assuming EUR; legacy default untouched", () => {
    expect(SCANNER333_INSTRUCTIONS).toMatch(/Nunca assumir EUR/);
    expect(SCANNER333_INSTRUCTIONS).toMatch(/hífens/);
    expect(scannerRequest("x", "image/png").messages[0].content).toBe(SCANNER_SYSTEM_PROMPT);
  });
  it("explicit EUR (code or €) keeps amounts reviewable", () => {
    for (const currency of ["EUR", "€", "euros"]) { const r = report({ ...base, currency, document_date: "2026-10-16" }); expect(get(r, "currency").value).toBe("EUR"); expect(get(r, "total_amount").reviewable).toBe(true); expect(r.warnings).toHaveLength(0); }
  });
  it("absent or ambiguous currency blocks amounts with one clear notice", () => {
    for (const currency of [null, "$"]) { const r = report({ ...base, currency }); expect(get(r, "currency").value).toBeNull(); expect(get(r, "total_amount").reviewable).toBe(false); expect(get(r, "iva_amount").reviewable).toBe(false); expect(r.warnings).toEqual(["A moeda não aparece claramente no documento. Confirma e introduz o total e o IVA manualmente."]); }
  });
  it("non-EUR currency is shown, never converted, and amounts stay manual", () => {
    const r = report({ ...base, currency: "USD" });
    expect(get(r, "currency").value).toBe("USD"); expect(get(r, "currency").reviewable).toBe(true);
    expect(get(r, "total_amount").reviewable).toBe(false); expect(r.warnings[0]).toMatch(/USD/);
  });
  it("keeps the reference literal, with or without hyphen", () => {
    expect(get(report({ ...base, currency: "EUR" }), "invoice_number").value).toBe("AB-0001");
    expect(get(report({ ...base, invoice_number: "AB 0001", currency: "EUR" }), "invoice_number").value).toBe("AB 0001");
  });
  it("converts textual dates deterministically; ambiguous ones stay for manual review", () => {
    expect(normalizeScannerDate("October 16, 2026")).toBe("2026-10-16");
    expect(normalizeScannerDate("16 de outubro de 2026")).toBe("2026-10-16");
    expect(normalizeScannerDate("Oct 16th 2026")).toBe("2026-10-16");
    expect(normalizeScannerDate("16/10/2026")).toBe("2026-10-16");
    expect(normalizeScannerDate("05/10/2026")).toBeNull();
    expect(normalizeScannerDate("February 30, 2026")).toBeNull();
    expect(normalizeScannerDate("next friday")).toBeNull();
    const r = report({ ...base, currency: "EUR", document_date: "October 16, 2026" });
    expect(get(r, "invoice_date").value).toBe("2026-10-16"); expect(get(r, "invoice_date").reviewable).toBe(true);
    expect(get(report({ ...base, currency: "EUR", document_date: "05/10/2026" }), "invoice_date").value).toBeNull();
    expect(normalizeScannerCurrency("gbp")).toBe("GBP");
  });
});
