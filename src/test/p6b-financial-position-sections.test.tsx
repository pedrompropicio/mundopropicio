import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { decomposeTicketOfficeRetained } from "@/lib/ticket-office-balance";
import { cachesSchema, cacheArtistDisplayName, cacheArtistLabel, retainedRowsToShow } from "@/lib/financial-position-p6b";
import { CachesView, RetainedCompositionView, ResultadoMpView } from "@/components/financial-position/P6bSections";
import { formatPositionAmount as eur } from "@/lib/financial-position";

const RG = "00000000-0000-0000-0000-0000000000a1";
const SIM = "00000000-0000-0000-0000-0000000000b1";
const DEI = "00000000-0000-0000-0000-0000000000b2";
const ev = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;

const caches = cachesSchema.parse({
  total: 168364.76, retencao_irs_total: 23544.46, sem_retencao_total: 144820.30,
  por_artista: [
    { artist_supplier_id: DEI, artista: "NON STOP PRODUCOES LTDA", total: 22944.57, retencao_irs: 2294.46, sem_retencao: 20650.11,
      por_evento: [{ evento_id: ev(1), evento: "Deive Leonardo - Braga", total: 7639.93, retencao_irs: 763.99 }, { evento_id: ev(2), evento: "Deive Leonardo - Lisboa", total: 15304.64, retencao_irs: 1530.47 }] },
    { artist_supplier_id: SIM, artista: "SIMONE MENDES PRODUCOES MUSICAIS LTDA", total: 145420.19, retencao_irs: 21250, sem_retencao: 124170.19,
      por_evento: [{ evento_id: ev(3), evento: "SM - Lisboa", total: 58926.15, retencao_irs: 9424.01 }, { evento_id: ev(4), evento: "SM - Porto", total: 86494.04, retencao_irs: 11825.99 }] },
  ],
  sem_contrato: { total: 0, n: 0 }, nota: "Informativo",
});

describe("P6b cachês", () => {
  it("sum of artist lines and of event lines equals the total (no mother double count)", () => {
    const art = caches.por_artista.reduce((s, a) => s + a.total, 0);
    const evs = caches.por_artista.flatMap(a => a.por_evento).reduce((s, e) => s + e.total, 0);
    expect(Math.round(art * 100) / 100).toBe(168364.76);
    expect(Math.round(evs * 100) / 100).toBe(168364.76);
  });
  it("Simone and Deive in separate lines with contract name and supplier; withholding shown apart", () => {
    render(<CachesView caches={caches} names={{ [DEI]: "Deive Leonardo", [SIM]: "Simone Mendes" }} />);
    expect(screen.getByText("Deive Leonardo (NON STOP PRODUCOES LTDA)")).toBeDefined();
    expect(screen.getByText("Simone Mendes (SIMONE MENDES PRODUCOES MUSICAIS LTDA)")).toBeDefined();
    expect(screen.getAllByText("Retenção IRS (não é custo do evento)")).toHaveLength(2);
    expect(screen.getByText(eur(145420.19), { normalizer: t => t })).toBeDefined();
    expect(screen.getByText(eur(22944.57), { normalizer: t => t })).toBeDefined();
  });
  it("display names from cache configs", () => {
    expect(cacheArtistDisplayName("Cachê Simone Mendes")).toBe("Simone Mendes");
    expect(cacheArtistDisplayName("DEIVE LEONARDO")).toBe("Deive Leonardo");
    expect(cacheArtistLabel(null, "X LDA")).toBe("X LDA");
  });
  it("schema is strict and the block is optional", () => {
    expect(cachesSchema.safeParse({ ...caches, extra: 1 }).success).toBe(false);
  });
});

describe("P6b composição do retido", () => {
  it("Ticketline reproduces 170.842,41 = RG 279.893,00 − apuramento 49.050,59 − repasse 60.000,00", () => {
    const d = decomposeTicketOfficeRetained({
      globalBalance: 170842.41,
      events: [{ id: RG, name: "Raphael Ghanem", balance: 279893.0 }, { id: ev(5), name: "No apuramento", balance: 1000 }],
      statements: [{ number: "3163/2026", status: "draft", statement_date: "2026-10-08", document_total: -49050.59, ticket_office_statement_lines: [{ position: 1, amount: 1000, event_id: ev(5) }] }],
      settledEventIds: [],
    })!;
    expect(d.position).toBe(-49050.59);
    expect(d.openEvents.map(e => e.id)).toEqual([RG]);
    expect(d.openTotal).toBe(279893.0);
    expect(d.residual).toBe(-60000.0);
    expect(Math.round((d.position + d.openTotal + d.residual) * 100) / 100).toBe(170842.41);
  });
  it("settled events are not open; no statement → null", () => {
    expect(decomposeTicketOfficeRetained({ globalBalance: 5, events: [{ id: RG, balance: 5 }], statements: [], settledEventIds: [] })).toBeNull();
    const d = decomposeTicketOfficeRetained({ globalBalance: 5, events: [{ id: RG, balance: 5 }], statements: [{ document_total: 0 }], settledEventIds: [RG] })!;
    expect(d.openEvents).toHaveLength(0); expect(d.residual).toBe(5);
  });
  it("shows ECI/Ticketline/BOL always; Fever/Blueticket only when non-zero", () => {
    const rows = [{ account_id: "1", name: "ECI (El Corte Inglés)", saldo: 1 }, { account_id: "2", name: "Ticketline", saldo: 0 }, { account_id: "3", name: "BOL", saldo: 0 },
      { account_id: "4", name: "Fever", saldo: 0 }, { account_id: "5", name: "Blueticket", saldo: 3 }];
    expect(retainedRowsToShow(rows).map(r => r.account_id)).toEqual(["1", "2", "3", "5"]);
  });
  it("draft label, change note and mismatch warning", () => {
    const rows = [{ account_id: "00000000-0000-0000-0000-0000000000c1", name: "Ticketline", saldo: 170842.41 }];
    const comp = [{ accountId: rows[0].account_id, globalBalance: 170842.40, decomposition: decomposeTicketOfficeRetained({ globalBalance: 170842.40, events: [{ id: RG, name: "RG", balance: 279893 }], statements: [{ number: "3163/2026", status: "draft", statement_date: "2026-10-08", document_total: -49050.59 }], settledEventIds: [] }) as any }];
    render(<RetainedCompositionView rows={rows} compositions={comp} visible />);
    expect(screen.getByText(/apuramento n\.º 3163\/2026 \(rascunho\)/)).toBeDefined();
    expect(screen.getByText(/muda quando houver novo apuramento/)).toBeDefined();
    expect(screen.getByRole("alert").textContent).toMatch(/não fecha com o Saldo Geral/);
  });
  it("hidden balances render nothing", () => {
    const { container } = render(<RetainedCompositionView rows={[]} compositions={[]} visible={false} />);
    expect(container.textContent).toBe("");
  });
});

describe("P6b Resultado da MP", () => {
  it("shows with and without structure from p5-v3", () => {
    render(<ResultadoMpView data={{ resultado_mp_ano: { sem_estrutura: 1234.5, com_estrutura: -100,
      participacoes: { cloudscape: { valor: 0, linhas: 0, origem: "transactions 1.3.05 (participação Cloudscape)" } }, total_mp: -100 }, meta: { incompleto: false } } as any} />);
    expect(screen.getByText(eur(1234.5), { normalizer: t => t })).toBeDefined();
    expect(screen.getAllByText(eur(-100), { normalizer: t => t })).toHaveLength(2);
  });
  it("shows Cloudscape participation line and MP total", () => {
    render(<ResultadoMpView data={{ resultado_mp_ano: { sem_estrutura: 500, com_estrutura: 400,
      participacoes: { cloudscape: { valor: 154130.29, linhas: 1, origem: "transactions 1.3.05 (participação Cloudscape)" } }, total_mp: 154530.29 }, meta: { incompleto: false } } as any} />);
    expect(screen.getByText("Participação na Cloudscape (Coala)")).toBeDefined();
    expect(screen.getByText("Resultado total da MP")).toBeDefined();
    expect(screen.getByText(eur(154130.29), { normalizer: t => t })).toBeDefined();
    expect(screen.getByText(eur(154530.29), { normalizer: t => t })).toBeDefined();
  });
  it("incomplete → unavailable, never zero", () => {
    render(<ResultadoMpView data={{ resultado_mp_ano: null, meta: { incompleto: true } } as any} />);
    expect(screen.getByText(/Indisponível.*incompleto/)).toBeDefined();
  });
});
