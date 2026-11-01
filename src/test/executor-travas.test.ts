import { describe, expect, it } from "vitest";
import { avaliarDespacho, caminhosProibidos, limiteDaValidade, mergeAutomaticoDe, type Comentario } from "@/lib/executor/travas";

const PEDRO = "pedrompropicio";
const agora = new Date("2026-11-02T10:00:00Z");

const autorizacao = (over: Partial<Record<string, string>> = {}) =>
  [
    `## Autorização — teste (Pedro, 2026-11-02 09:00 UTC, "Sim" no 0)`,
    "",
    "- **Âmbito:** Issue #900 · projecto mundopropicio",
    `- **Executor atual:** ${over.executor ?? "Claude Code"} · revisor por leitura: Codex`,
    `- **Classe:** ${over.classe ?? "R1"}`,
    `- **Capacidades libertadas:** ${over.caps ?? "`codigo+testes` = sim · `DDL` = não · `DML` = não · `edge functions` = não · `crons` = não · `envios externos` = não · `Publish` = não"}`,
    `- **Ambiente:** ${over.ambiente ?? "homolog"}`,
    `- **Validade:** ${over.validade ?? "até 2026-11-03"}`,
    ...(over.merge !== undefined ? [`- **Merge automático:** ${over.merge}`] : []),
  ].join("\n");

const reserva = (executor = "Claude Code, designado pelo Pedro; Codex revê") =>
  ["## Reserva — #900 · R1 · teste", "", "- **Lado · chat:** 0", `- **Executor:** ${executor}`].join("\n");

const despacho = "## Despacho — #900\n\nAcrescentar um teste em src/test para a função X e corrigir o caso Y.";

function base(extra: Comentario[] = []): Comentario[] {
  return [
    { id: 1, autor: PEDRO, criadoEm: "2026-11-02T09:00:00Z", corpo: autorizacao() },
    { id: 2, autor: PEDRO, criadoEm: "2026-11-02T09:01:00Z", corpo: reserva() },
    ...extra,
    { id: 9, autor: PEDRO, criadoEm: "2026-11-02T09:30:00Z", corpo: despacho },
  ];
}

describe("travas E2b (#417)", () => {
  it("aceita autorização R1 + reserva activa do Claude Code", () => {
    const d = avaliarDespacho(900, base(), 9, agora);
    expect(d.motivos).toEqual([]);
    expect(d.ok).toBe(true);
    expect(d.tarefa).toContain("Acrescentar um teste");
  });

  it("recusa sem autorização", () => {
    const cs = base().filter((c) => c.id !== 1);
    expect(avaliarDespacho(900, cs, 9, agora).motivos.join()).toMatch(/Autorização/);
  });

  it("recusa capacidade além de codigo+testes (DDL)", () => {
    const cs = base();
    cs[0].corpo = autorizacao({ caps: "`codigo+testes` = sim · `DDL` = sim", classe: "R2" });
    const m = avaliarDespacho(900, cs, 9, agora).motivos.join();
    expect(m).toMatch(/DDL/);
    expect(m).toMatch(/R1/);
  });

  it("recusa autorização expirada ou sem data", () => {
    const cs = base();
    cs[0].corpo = autorizacao({ validade: "até 2026-11-01 12:00" });
    expect(avaliarDespacho(900, cs, 9, agora).motivos.join()).toMatch(/expirada/);
    cs[0].corpo = autorizacao({ validade: "até ao fecho" });
    expect(avaliarDespacho(900, cs, 9, agora).motivos.join()).toMatch(/validade/);
  });

  it("recusa executor diferente e ambiente Live", () => {
    const cs = base();
    cs[0].corpo = autorizacao({ executor: "Codex", ambiente: "Live" });
    const m = avaliarDespacho(900, cs, 9, agora).motivos.join();
    expect(m).toMatch(/executor/);
    expect(m).toMatch(/Live/);
  });

  it("recusa reserva libertada, de outro executor ou duplicada", () => {
    const libertada = base([{ id: 3, autor: PEDRO, criadoEm: "2026-11-02T09:05:00Z", corpo: "## Reserva libertada — #900" }]);
    expect(avaliarDespacho(900, libertada, 9, agora).motivos.join()).toMatch(/Reserva/);
    const outra = base();
    outra[1].corpo = reserva("Codex");
    expect(avaliarDespacho(900, outra, 9, agora).motivos.join()).toMatch(/não é do Claude Code/);
    const dupla = base([{ id: 4, autor: PEDRO, criadoEm: "2026-11-02T09:06:00Z", corpo: reserva() }]);
    expect(avaliarDespacho(900, dupla, 9, agora).motivos.join()).toMatch(/2 reservas/);
  });

  it("ignora autorizações e despachos de outros autores", () => {
    const cs = base();
    cs[0].autor = "outra-pessoa";
    expect(avaliarDespacho(900, cs, 9, agora).ok).toBe(false);
    const cs2 = base();
    cs2[2].autor = "outra-pessoa";
    expect(avaliarDespacho(900, cs2, 9, agora).motivos.join()).toMatch(/autor do despacho/);
  });

  it("autorização posterior ao despacho não conta", () => {
    const cs = base();
    cs[0].criadoEm = "2026-11-02T09:40:00Z";
    expect(avaliarDespacho(900, cs, 9, agora).ok).toBe(false);
  });

  it("despacho para outra Issue é recusado", () => {
    const cs = base();
    cs[2].corpo = despacho.replace("#900", "#901");
    expect(avaliarDespacho(900, cs, 9, agora).motivos.join()).toMatch(/#900/);
  });

  it("validade: data sem hora vale até ao fim do dia UTC", () => {
    expect(limiteDaValidade("até 2026-11-03")?.toISOString()).toBe("2026-11-03T23:59:59.000Z");
    expect(limiteDaValidade("2026-11-03 18:30 UTC")?.toISOString()).toBe("2026-11-03T18:30:59.000Z");
  });

  it("caminhos proibidos: workflows, supabase, drizzle, .lovable, .env", () => {
    expect(
      caminhosProibidos([
        "src/lib/a.ts",
        ".github/workflows/ci.yml",
        "supabase/migrations/x.sql",
        "supabase/functions/f/index.ts",
        "drizzle/migrations/0300.sql",
        ".lovable/memory/x.md",
        ".env",
        "docs/x.md",
      ]),
    ).toEqual([
      ".github/workflows/ci.yml",
      "supabase/migrations/x.sql",
      "supabase/functions/f/index.ts",
      "drizzle/migrations/0300.sql",
      ".lovable/memory/x.md",
      ".env",
    ]);
  });

  it("merge automático: sim por defeito, não só quando explícito", () => {
    expect(avaliarDespacho(900, base(), 9, agora).mergeAutomatico).toBe(true);
    const nao = base();
    nao[0].corpo = autorizacao({ merge: "não" });
    expect(avaliarDespacho(900, nao, 9, agora).mergeAutomatico).toBe(false);
    const sim = base();
    sim[0].corpo = autorizacao({ merge: "sim" });
    expect(avaliarDespacho(900, sim, 9, agora).mergeAutomatico).toBe(true);
    expect(mergeAutomaticoDe("`não` (rever antes)")).toBe(false);
    expect(mergeAutomaticoDe("Nao")).toBe(false);
    expect(mergeAutomaticoDe(undefined)).toBe(true);
  });
});
