// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FN_VERSION, FN_VERSION_HEADER } from "../../supabase/functions/ticketing-sync-health/version";

describe("#317 — marcador de versão sem efeitos", () => {
  it("exporta o nome do cabeçalho e uma versão legível no formato acordado (critério 1)", () => {
    expect(FN_VERSION_HEADER).toBe("x-fn-version");
    expect(FN_VERSION).toMatch(/^ticketing-sync-health@\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("marca o único construtor de respostas e preserva o 403 antes dos RPCs (critério 2)", () => {
    const source = readFileSync("supabase/functions/ticketing-sync-health/index.ts", "utf8");
    expect(source).toContain('import { FN_VERSION, FN_VERSION_HEADER } from "./version.ts";');
    expect(source.match(/new Response\(/g)).toHaveLength(1);
    expect(source).toMatch(
      /const json = \(b: unknown, s = 200\) =>\s*new Response\(JSON\.stringify\(b\), \{ status: s, headers: \{ "Content-Type": "application\/json", \[FN_VERSION_HEADER\]: FN_VERSION \} \}\);/,
    );

    const forbidden = source.indexOf('return json({ error: "forbidden" }, 403)');
    expect(forbidden).toBeGreaterThan(-1);
    expect(source.indexOf("admin.rpc(")).toBeGreaterThan(forbidden);
  });

  it("regista a expiração confirmada do PAT e o lembrete de renovação (critério 3)", () => {
    const index = readFileSync("docs/INDEX.md", "utf8");
    expect(index).toContain("Validade do PAT `claude-mp-issues`: expira a **09/10/2027**");
    expect(index).toContain("lembrete de renovação a 09/09/2027");
    expect(index).not.toContain("Validade do PAT: **por confirmar**");
  });
});
