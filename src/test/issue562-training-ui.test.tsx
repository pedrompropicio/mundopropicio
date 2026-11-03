import React from "react";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { buildPain001, type SepaFileInput } from "@/lib/sepa/pain001";
import { TrainingBanner } from "@/components/TrainingBanner";
import SepaExportModal from "@/components/SepaExportModal";
import ReportAccountingExport from "@/components/ReportAccountingExport";

const fixture = vi.hoisted(() => ({ training: false, queries: {} as Record<string, any>, writes: [] as { table: string; data: any }[], download: vi.fn(), downloadNames: [] as string[] }));
vi.mock("@/hooks/useCompany", () => ({
  useCompany: () => ({ company: { id: "real", display_name: "Empresa sintética", country: "PT", currency: "EUR", is_training: fixture.training }, companyId: "real", isPlatformAdmin: true }),
  useUserMemberships: () => ({ data: [], isLoading: false }),
  useCompaniesList: () => ({ data: [{ id: "real", display_name: "Empresa sintética", legal_name: "Sintética", slug: "sintetica", is_training: fixture.training }], isLoading: false }),
  useSetActiveCompany: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useProfileActiveCompanyId: () => ({ data: "real" }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: fixture.queries[queryKey[0]], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: any) => ({ mutateAsync: options.mutationFn, isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { email: "fixture@example.invalid" } } }) },
  from: (table: string) => ({ insert: (data: any) => {
    fixture.writes.push({ table, data });
    return { select: async () => ({ data: [{ id: "synthetic" }], error: null }) };
  } }),
  functions: { invoke: async () => ({ data: null, error: null }) },
  storage: { from: () => ({ download: async () => ({ data: new Blob(["synthetic document"]), error: null }) }) },
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { email: "fixture@example.invalid" }, role: "platform_admin" }) }));
vi.mock("@/lib/sepa/pain001", async original => ({ ...await original<typeof import("@/lib/sepa/pain001")>(), downloadXml: fixture.download,
  // Deliberately invalid bank identifier: these tests exercise isolation, not IBAN validation.
  checkSepaIban: (iban: string) => ({ ok: true, iban }),
}));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/ui/calendar", () => ({ Calendar: ({ onSelect }: any) => <button onClick={() => onSelect(new Date("2026-11-03T12:00:00Z"))}>Dia sintético</button> }));
vi.mock("@/components/ui/overlay-layer", () => ({ OverlayLayer: ({ children, ...props }: any) => <div {...props}>{children}</div> }));
beforeEach(() => {
  fixture.training = false;
  fixture.writes = [];
  fixture.downloadNames = [];
  fixture.download.mockClear();
  fixture.queries = {
    "sepa-debtor-accounts": [{ id: "account", name: "Fixture", iban: "PT00SYNTHETIC" }],
    "accounting-export-tx": [{ id: "tx", date: "2026-11-03", description: "Fixture", amount: 12.34 }],
    "accounting-export-docs": { tx: { count: 1, files: [{ url: "synthetic/file", name: "fixture.pdf" }] } },
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sepa: SepaFileInput = {
  listId: "synthetic", listTitle: "Exercicio", debtorName: "Sintetica",
  debtorIban: "PT50000000000000000000000", debtorBic: "TESTPTPL",
  executionDate: "2026-11-04", listDate: "2026-11-03", now: new Date("2026-11-03T12:00:00Z"),
  rows: [{ transactionId: "synthetic", creditorName: "Fixture", iban: "PT50000000000000000000000", amount: 12.34, remittance: "Exercicio" }],
};
it("#562 mantém hashes DOM e SEPA capturados antes da alteração", () => {
  fixture.training = false;
  const { container } = render(<MemoryRouter><TrainingBanner /><CompanySwitcher /></MemoryRouter>);
  const out = buildPain001(sepa);
  expect(hash(container.innerHTML)).toBe("7401f2377806af9879fb4af8f2d4063ea8da90738920d05f3b741028d7d7ae15");
  expect(out.fileName).toBe("transferencias_exercicio_20261104.xml");
  expect(out.msgId).toBe("PAGAMENTOS-MP-03112026-03111200");
  expect(hash(out.xml)).toBe("f9faeae50f64509027ea188a9268efe99cdfc34b96ffbe209e17a4aee2a4e4c3");
});
it("#562 faixa e selo aparecem só em treino", () => {
  const view = render(<MemoryRouter><TrainingBanner /><CompanySwitcher /></MemoryRouter>);
  expect(screen.queryByText(/AMBIENTE DE TREINO/)).toBeNull();
  expect(screen.queryByText("TREINO")).toBeNull();
  fixture.training = true;
  view.rerender(<MemoryRouter><TrainingBanner /><CompanySwitcher /></MemoryRouter>);
  expect(screen.getByRole("status")).toHaveTextContent("AMBIENTE DE TREINO — nada aqui é real");
  expect(screen.getByText("TREINO")).toBeInTheDocument();
});
it("#562 marca MsgId/nome de treino e mantém limites ISO", () => {
  const out = buildPain001({ ...sepa, isTraining: true });
  expect(out.fileName).toBe("transferencias_exercicio_20261104_TREINO.xml");
  expect(out.msgId).toBe("TREINO-PAGAMENTOS-MP-03112026-03111200".slice(0, 35));
  expect(out.msgId.length).toBeLessThanOrEqual(35);
  expect(out.xml).toContain(`<MsgId>${out.msgId}</MsgId>`);
  expect(out.xml).toContain("<PmtInfId>TREINO-");
});
it.each([true, false])("#562 SEPA treino=%s: download e efeitos verificados", async training => {
  fixture.training = training;
  const onExported = vi.fn();
  render(<SepaExportModal listId="fixture" listTitle="Exercicio" listStatus="approved" paymentDate="2026-11-04" companyName="Sintetica"
    candidates={[{ transactionId: "tx", creditorName: "Fixture", iban: "PT00SYNTHETIC", amount: 12.34, description: "Fixture", isReimbursement: false }]}
    onClose={vi.fn()} onExported={onExported} />);
  fireEvent.click(screen.getByRole("button", { name: /Gerar ficheiro/i }));
  await waitFor(() => expect(fixture.download).toHaveBeenCalledOnce());
  expect(fixture.writes.some(w => w.table === "payment_list_sepa_exports")).toBe(!training);
  expect(onExported).toHaveBeenCalledTimes(training ? 0 : 1);
  expect(fixture.download.mock.calls[0][1].includes("TREINO")).toBe(training);
});
it.each([true, false])("#562 contabilístico treino=%s: sem registo real em treino", async training => {
  fixture.training = training;
  const objectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const revokeUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:synthetic" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { fixture.downloadNames.push(this.download); });
  try {
  render(<ReportAccountingExport />);
  fireEvent.click(screen.getAllByRole("button", { name: /Selecionar/ })[0]);
  fireEvent.click(screen.getByText("Dia sintético"));
  fireEvent.click(screen.getByRole("button", { name: /Selecionar/ }));
  fireEvent.click(screen.getByText("Dia sintético"));
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  fireEvent.click(screen.getByRole("button", { name: /Exportar mapa CSV/ }));
  expect(fixture.downloadNames).toEqual([`${training ? "TREINO_" : ""}mapa-contabilidade_2026-11-03_2026-11-03.csv`]);
  expect(fixture.writes).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: /Exportar.*documento/ }));
  await waitFor(() => expect(fixture.downloadNames).toHaveLength(2));
  expect(fixture.downloadNames[1]).toBe(`${training ? "TREINO_" : ""}fixture.pdf`);
  await waitFor(() => expect(fixture.writes.filter(w => w.table === "accounting_exports")).toHaveLength(training ? 0 : 1));
  } finally {
    if (objectUrl) Object.defineProperty(URL, "createObjectURL", objectUrl); else Reflect.deleteProperty(URL, "createObjectURL");
    if (revokeUrl) Object.defineProperty(URL, "revokeObjectURL", revokeUrl); else Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});
