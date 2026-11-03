import { describe, expect, it } from "vitest";
import { avaliarDespacho, caminhosProibidos, executorDe, limiteDaValidade, mergeAutomaticoDe, textoRecusa, type Comentario } from "@/lib/executor/travas";

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
    ...(over.operador !== undefined ? [`- **Operador:** ${over.operador}`] : []),
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
  it.each([
    ["Claude Code · revisor: Codex", "claude-code"],
    ["  CLÁUDE CODE, designado pelo Pedro", "claude-code"],
    ["Codex, designado pelo Pedro", "codex"],
    ["ChatGPT/Codex · revisor: Claude Code", "codex"],
    ["chatgpt codex", "codex"],
    ["OPENAI CODEX", "codex"],
    ["outro motor · revisor: Codex", null],
    ["", null],
  ])("executorDe reconhece %s pelo início", (texto, esperado) => {
    expect(executorDe(texto)).toBe(esperado);
  });

  it("aceita autorização Codex com reserva Codex designada pelo Pedro", () => {
    const cs = base();
    cs[0].corpo = autorizacao({ executor: "Codex" });
    cs[1].corpo = reserva("Codex, designado pelo Pedro; Claude Code revê");
    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(true);
    expect(d.motivos).toEqual([]);
    expect(d.executor).toBe("codex");
  });

  it("recusa motor desconhecido sem escolher o revisor ou um motor por omissão", () => {
    const cs = base();
    cs[0].corpo = autorizacao({ executor: "Gemini" });
    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.executor).toBeNull();
    expect(d.motivos).toContain("a autorização não designa um executor suportado (Claude Code ou Codex)");
  });

  it("aceita o campo Executor alternativo e recusa reserva de outro motor", () => {
    const cs = base();
    cs[0].corpo = autorizacao({ executor: "OpenAI Codex" }).replace("Executor atual", "Executor");
    cs[1].corpo = reserva("ChatGPT/Codex");
    expect(avaliarDespacho(900, cs, 9, agora).executor).toBe("codex");
    expect(avaliarDespacho(900, cs, 9, agora).ok).toBe(true);
    cs[1].corpo = reserva();
    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.motivos).toContain("a reserva activa não é do executor designado (codex)");
  });

  it("aceita autorização R1 + reserva activa do Claude Code", () => {
    const d = avaliarDespacho(900, base(), 9, agora);
    expect(d.motivos).toEqual([]);
    expect(d.ok).toBe(true);
    expect(d.executor).toBe("claude-code");
    expect(d.tarefa).toContain("Acrescentar um teste");
    expect(d.preparacaoR2).toBe(false);
  });

  it.each(["R1", "R2"])("aceita %s com capacidade de preparação explícita", (classe) => {
    const cs = base();
    cs[0].corpo = autorizacao({ classe }).replace("`codigo+testes` = sim", "`codigo+testes` = sim · `ficheiros de migração` = sim");
    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(true);
    expect(d.preparacaoR2).toBe(true);
  });

  it("recusa R2 sem capacidade e publica o motivo explícito", () => {
    const cs = base();
    cs[0].corpo = autorizacao({ classe: "R2" });
    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.preparacaoR2).toBe(false);
    expect(textoRecusa(900, d.motivos, "run-local")).toContain(
      "classe R2 só com `ficheiros de migração` = sim (preparação sem aplicar)",
    );
  });

  it.each(["DDL", "DML", "edge functions", "crons", "envios externos", "Publish", "desconhecida"])(
    "preparação não liberta %s", (cap) => {
      const cs = base();
      cs[0].corpo = autorizacao({ classe: "R2", caps: "`codigo+testes` = sim · `ficheiros de migração` = sim · `" + cap + "` = sim" });
      expect(avaliarDespacho(900, cs, 9, agora).ok).toBe(false);
    },
  );

  it("preparação só abre os caminhos e extensões autorizados", () => {
    const permitidos = ["drizzle/migrations/0304_x.sql", "supabase/manual/0304_x.sql", "supabase/functions/x/index.ts", "supabase/functions/x/deno.json", "supabase/functions/x/README.md"];
    const proibidos = ["drizzle/migrations/meta/_journal.json", "supabase/migrations/x.sql", ".github/workflows/a.yml", "supabase/config.toml", ".lovable/x.md", ".env", "scripts/foo-live.txt", "supabase/functions/x/.env.ts", "supabase/functions/x/test.sql", "supabase/functions/../config.json", "drizzle/migrations/meta/x.sql", "supabase/manual/sub/x.sql"];
    expect(caminhosProibidos([...permitidos, ...proibidos], { preparacaoR2: true })).toEqual(proibidos);
    expect(caminhosProibidos(permitidos)).toEqual(permitidos);
    expect(caminhosProibidos(permitidos, { preparacaoR2: false })).toEqual(permitidos);
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
    expect(m).toContain("classe R2 só com `ficheiros de migração` = sim (preparação sem aplicar)");
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
    expect(avaliarDespacho(900, outra, 9, agora).motivos).toContain("a reserva activa não é do executor designado (claude-code)");
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

describe("operador nomeado na Autorização vigente (#521)", () => {
  const OPERADOR = "mplabs-dev";

  it.each(["mplabs-dev", "@mplabs-dev", "`mplabs-dev`", "`@mplabs-dev`"])(
    "aceita despacho e Reserva do operador nomeado como %s pelo Pedro", (operador) => {
      const cs = base();
      cs[0].corpo = autorizacao({ operador });
      cs[1].autor = OPERADOR;
      cs[2].autor = OPERADOR;

      const d = avaliarDespacho(900, cs, 9, agora);
      expect(d.ok).toBe(true);
      expect(d.motivos).toEqual([]);
    },
  );

  it("recusa despacho do operador sem campo Operador na Autorização", () => {
    const cs = base();
    cs[2].autor = OPERADOR;

    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.motivos).toEqual(["autor do despacho não autorizado (mplabs-dev)"]);
  });

  it.each([OPERADOR, "outra-pessoa"])("ignora Autorização escrita por %s", (autor) => {
    const cs = base();
    cs[0].autor = autor;
    cs[0].corpo = autorizacao({ operador: OPERADOR });
    cs[2].autor = OPERADOR;

    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.motivos).toEqual([
      "autor do despacho não autorizado (mplabs-dev)",
      "não há «## Autorização» do Pedro nesta Issue",
    ]);
  });

  it("ignora uma Autorização posterior do operador e mantém a do Pedro", () => {
    const cs = base([{
      id: 3, autor: OPERADOR, criadoEm: "2026-11-02T09:05:00Z",
      corpo: autorizacao({ operador: "outro-user", classe: "R0" }),
    }]);
    cs[0].corpo = autorizacao({ operador: OPERADOR });
    cs[3].autor = OPERADOR;

    expect(avaliarDespacho(900, cs, 9, agora).ok).toBe(true);
  });

  it.each([
    ["outro-user", "outro-user"],
    ["`@outro-user`", "outro-user"],
    [PEDRO, PEDRO],
    ["", ""],
  ])("recusa Operador fora da lista: %s", (operador, login) => {
    const cs = base();
    cs[0].corpo = autorizacao({ operador });

    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.motivos).toEqual([`operador não autorizado (${login})`]);
  });

  it("recusa despacho de login fora da lista mesmo quando nomeado", () => {
    const cs = base();
    cs[0].corpo = autorizacao({ operador: "outro-user" });
    cs[2].autor = "outro-user";

    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.motivos).toContain("autor do despacho não autorizado (outro-user)");
    expect(d.motivos).toContain("operador não autorizado (outro-user)");
  });

  it("ignora Reserva do operador anterior à Autorização vigente mesmo com nomeação anterior", () => {
    const cs = base([{
      id: 3, autor: PEDRO, criadoEm: "2026-11-02T09:10:00Z",
      corpo: autorizacao({ operador: OPERADOR }),
    }]);
    cs[0].corpo = autorizacao({ operador: OPERADOR });
    cs[1].autor = OPERADOR;
    cs[3].autor = OPERADOR;

    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.motivos).toEqual(["não há «## Reserva» activa nesta Issue"]);
  });

  it("aceita libertação pelo operador de uma Reserva do Pedro", () => {
    const cs = base([{
      id: 3, autor: OPERADOR, criadoEm: "2026-11-02T09:05:00Z",
      corpo: "## Reserva libertada — #900",
    }]);
    cs[0].corpo = autorizacao({ operador: OPERADOR });

    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.motivos).toEqual(["não há «## Reserva» activa nesta Issue"]);
  });

  it("ignora libertação do operador anterior à Autorização vigente", () => {
    const cs = base([
      { id: 3, autor: OPERADOR, criadoEm: "2026-11-02T09:05:00Z", corpo: "## Reserva libertada — #900" },
      { id: 4, autor: PEDRO, criadoEm: "2026-11-02T09:10:00Z", corpo: autorizacao({ operador: OPERADOR }) },
    ]);
    cs[0].corpo = autorizacao({ operador: OPERADOR });
    cs[4].autor = OPERADOR;

    expect(avaliarDespacho(900, cs, 9, agora).motivos).toEqual([]);
  });

  it.each(["## Reserva — #900\n- **Executor:** Claude Code", "## Reserva libertada — #900"])(
    "sem Operador, ignora comentário do operador: %s", (corpo) => {
      const cs = base([{ id: 3, autor: OPERADOR, criadoEm: "2026-11-02T09:05:00Z", corpo }]);

      expect(avaliarDespacho(900, cs, 9, agora)).toEqual(avaliarDespacho(900, base(), 9, agora));
    },
  );

  it("uma nova Autorização do Pedro sem Operador revoga a nomeação anterior", () => {
    const cs = base([{
      id: 3, autor: PEDRO, criadoEm: "2026-11-02T09:10:00Z", corpo: autorizacao(),
    }]);
    cs[0].corpo = autorizacao({ operador: OPERADOR });
    cs[3].autor = OPERADOR;

    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.motivos).toEqual(["autor do despacho não autorizado (mplabs-dev)"]);
  });

  it("nomeação posterior ao despacho não autoriza o operador", () => {
    const cs = base([{
      id: 3, autor: PEDRO, criadoEm: "2026-11-02T09:40:00Z", corpo: autorizacao({ operador: OPERADOR }),
    }]);
    cs[3].autor = OPERADOR;

    const d = avaliarDespacho(900, cs, 9, agora);
    expect(d.ok).toBe(false);
    expect(d.motivos).toEqual(["autor do despacho não autorizado (mplabs-dev)"]);
  });

  it.each(["## Reserva — #900\n- **Executor:** Claude Code", "## Reserva libertada — #900"])(
    "ignora comentário de outro login mesmo com operador nomeado: %s", (corpo) => {
      const cs = base([{ id: 3, autor: "outra-pessoa", criadoEm: "2026-11-02T09:05:00Z", corpo }]);
      cs[0].corpo = autorizacao({ operador: OPERADOR });

      expect(avaliarDespacho(900, cs, 9, agora).motivos).toEqual([]);
    },
  );
});
