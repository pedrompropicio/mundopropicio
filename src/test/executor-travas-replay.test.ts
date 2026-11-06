import { describe, expect, it } from "vitest";
import { avaliarDespacho, caminhosGithubDe, caminhosProibidosReplay, repoAlvoDe, type Comentario } from "@/lib/executor/travas";

// #753: a E2b também serve o repo privado mundopropicio-replay, por campo «Repositório» na Autorização.

const PEDRO = "pedrompropicio";
const agora = new Date("2026-11-02T10:00:00Z");

const autorizacao = (over: { repositorio?: string; merge?: string } = {}) =>
  [
    `## Autorização — teste (Pedro, 2026-11-02 09:00 UTC, "Sim" no 0)`,
    "",
    "- **Âmbito:** Issue #900",
    "- **Executor atual:** Codex",
    "- **Classe:** R1",
    "- **Capacidades libertadas:** `codigo+testes` = sim · `DDL` = não · `DML` = não · `edge functions` = não · `crons` = não · `envios externos` = não · `Publish` = não",
    "- **Ambiente:** homolog",
    "- **Validade:** até 2026-11-03",
    ...(over.merge !== undefined ? [`- **Merge automático:** ${over.merge}`] : []),
    ...(over.repositorio !== undefined ? [`- **Repositório:** ${over.repositorio}`] : []),
  ].join("\n");

const reserva = "## Reserva — #900 · R1 · teste\n\n- **Executor:** Codex";
const despacho = "## Despacho — #900\n\nAcrescentar um teste em tools/ para a função X e corrigir o caso Y.";

function cenario(over: { repositorio?: string; merge?: string } = {}, corpoDespacho = despacho): Comentario[] {
  return [
    { id: 1, autor: PEDRO, criadoEm: "2026-11-02T09:00:00Z", corpo: autorizacao(over) },
    { id: 2, autor: PEDRO, criadoEm: "2026-11-02T09:01:00Z", corpo: reserva },
    { id: 9, autor: PEDRO, criadoEm: "2026-11-02T09:30:00Z", corpo: corpoDespacho },
  ];
}

describe("repositório-alvo da E2b (#753)", () => {
  it("campo ausente → mundopropicio, tudo como antes", () => {
    const d = avaliarDespacho(900, cenario(), 9, agora);
    expect(d.ok).toBe(true);
    expect(d.repoAlvo).toBe("mundopropicio");
    expect(d.caminhosGithub).toEqual([]);
    expect(d.mergeAutomatico).toBe(true);
    expect(repoAlvoDe(undefined)).toBe("mundopropicio");
  });

  it("mundopropicio explícito é aceite e mantém o merge automático", () => {
    const d = avaliarDespacho(900, cenario({ repositorio: "`mundopropicio`" }), 9, agora);
    expect(d.ok).toBe(true);
    expect(d.repoAlvo).toBe("mundopropicio");
    expect(d.mergeAutomatico).toBe(true);
  });

  it("mundopropicio-replay é aceite", () => {
    const d = avaliarDespacho(900, cenario({ repositorio: "mundopropicio-replay" }), 9, agora);
    expect(d.ok).toBe(true);
    expect(d.motivos).toEqual([]);
    expect(d.repoAlvo).toBe("mundopropicio-replay");
    expect(repoAlvoDe("`mundopropicio-replay`")).toBe("mundopropicio-replay");
  });

  it.each(["pedrompropicio/mundopropicio-replay", "mundopropicio-replay2", "Mundopropicio-Replay", "outro", ""])(
    "qualquer outro valor é recusado (%s)",
    (valor) => {
      expect(repoAlvoDe(valor)).toBeNull();
      const d = avaliarDespacho(900, cenario({ repositorio: valor }), 9, agora);
      expect(d.ok).toBe(false);
      expect(d.repoAlvo).toBe("mundopropicio");
      expect(d.motivos.some((m) => m.startsWith("repositório não permitido"))).toBe(true);
    },
  );

  it("merge automático forçado a não no replay, mesmo com «sim» explícito", () => {
    expect(avaliarDespacho(900, cenario({ repositorio: "mundopropicio-replay" }), 9, agora).mergeAutomatico).toBe(false);
    const d = avaliarDespacho(900, cenario({ repositorio: "mundopropicio-replay", merge: "sim" }), 9, agora);
    expect(d.ok).toBe(true);
    expect(d.mergeAutomatico).toBe(false);
  });

  it("as outras travas mantêm-se no replay (sem reserva, autor estranho)", () => {
    const sem = cenario({ repositorio: "mundopropicio-replay" }).filter((c) => c.id !== 2);
    expect(avaliarDespacho(900, sem, 9, agora).motivos).toContain("não há «## Reserva» activa nesta Issue");
    const estranho = cenario({ repositorio: "mundopropicio-replay" });
    estranho[2].autor = "outra-conta";
    expect(avaliarDespacho(900, estranho, 9, agora).ok).toBe(false);
  });

  it("caminhos .github do Despacho só no replay e só em .github/workflows/*.yml", () => {
    const comCampo = "## Despacho — #900\n\n- **Caminhos .github do replay:** `.github/workflows/homolog-g2-748.yml`\n\nCriar o workflow G2-748 e os testes locais.";
    const ok = avaliarDespacho(900, cenario({ repositorio: "mundopropicio-replay" }, comCampo), 9, agora);
    expect(ok.ok).toBe(true);
    expect(ok.caminhosGithub).toEqual([".github/workflows/homolog-g2-748.yml"]);
    const principal = avaliarDespacho(900, cenario({}, comCampo), 9, agora);
    expect(principal.ok).toBe(false);
    expect(principal.caminhosGithub).toEqual([]);
    expect(caminhosGithubDe("`.github/workflows/../x.yml`, `.github/actions/a.yml`, .github/workflows/b.yaml").invalidos)
      .toEqual([".github/workflows/../x.yml", ".github/actions/a.yml"]);
    expect(caminhosGithubDe(".github/workflows/a.yml, .github/workflows/b.yaml").caminhos)
      .toEqual([".github/workflows/a.yml", ".github/workflows/b.yaml"]);
    const mau = comCampo.replace("homolog-g2-748.yml", "../../x.yml");
    expect(avaliarDespacho(900, cenario({ repositorio: "mundopropicio-replay" }, mau), 9, agora).ok).toBe(false);
  });

  it("caminhos proibidos no replay: .github fora da lista, .env e segmentos relativos", () => {
    expect(
      caminhosProibidosReplay(
        [
          "g2/catalog-queries.json",
          "tools/g2_748/compare.py",
          "supabase/baseline/x.sql",
          ".github/workflows/homolog-g2-748.yml",
          ".github/workflows/homolog-delta-748.yml",
          ".github/CODEOWNERS",
          "tools/.env",
          "tools/../.github/workflows/x.yml",
        ],
        [".github/workflows/homolog-g2-748.yml"],
      ),
    ).toEqual([".github/workflows/homolog-delta-748.yml", ".github/CODEOWNERS", "tools/.env", "tools/../.github/workflows/x.yml"]);
    expect(caminhosProibidosReplay([".github/workflows/homolog-g2-748.yml"])).toEqual([".github/workflows/homolog-g2-748.yml"]);
  });
});
