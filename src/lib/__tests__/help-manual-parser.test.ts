import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseHelpArticle, chunkArticle, CHUNK_TARGET_CHARS } from "../help-manual-parser";

const rateios = readFileSync("docs/manual/rateios.md", "utf8");

describe("parseHelpArticle", () => {
  it("lê o frontmatter do capítulo rateios", () => {
    const a = parseHelpArticle(rateios, "rateios.md");
    expect(a.slug).toBe("rateios");
    expect(a.title).toBe("Rateios");
    expect(a.module).toBe("erp");
    expect(a.updated_on).toBe("2026-09-16");
    expect(a.profiles).toContain("manager");
    expect(a.routes).toContain("/transacoes");
    expect(a.sources).toContain("D-ERP76");
    expect(a.content_md).toBe(rateios);
  });

  it("devolve as 7 secções com os anchor_id esperados", () => {
    const a = parseHelpArticle(rateios, "rateios.md");
    expect(a.sections.map((s) => s.anchor_id)).toEqual([
      "rateios.escolher",
      "rateios.master",
      "rateios.varios-eventos",
      "rateios.terceiros",
      "rateios.faturas-ads",
      "rateios.overhead",
      "rateios.erros-comuns",
    ]);
    expect(a.sections.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("tira o bloco ajuda do body_md e guarda os metadados", () => {
    const a = parseHelpArticle(rateios, "rateios.md");
    const master = a.sections.find((s) => s.anchor_id === "rateios.master")!;
    expect(master.heading).toBe("1. Master de várias cidades");
    expect(master.body_md).not.toContain("```ajuda");
    expect(master.body_md).not.toContain("tooltip:");
    expect(master.tooltip).toContain("Custo da tour inteira");
    expect(master.screens).toContain("nova-transacao.evento-master");
    expect(master.profiles).toEqual(["editor", "manager", "admin"]);
    expect(master.sources).toContain("D-ERP76");
    expect(master.body_md.length).toBeGreaterThan(50);
    expect(master.body_md).toContain("![Rateio igual de um custo lançado no Master](img/rateios-master.svg)");
  });

  it("recusa ficheiro sem frontmatter", () => {
    expect(() => parseHelpArticle("# X\n\n## A\n\ntexto", "x.md")).toThrow(/frontmatter/);
  });

  it("recusa secção sem bloco ajuda, dizendo qual", () => {
    const raw = [
      "---",
      "capitulo: teste",
      "titulo: Teste",
      "modulo: erp",
      "atualizado: 2026-09-16",
      "---",
      "",
      "## Secção Solta",
      "",
      "texto sem metadados",
    ].join("\n");
    expect(() => parseHelpArticle(raw, "t.md")).toThrow(/Secção Solta/);
  });
});

describe("chunkArticle", () => {
  it("cria pedaços prefixados e sem cortar parágrafos", () => {
    const a = parseHelpArticle(rateios, "rateios.md");
    const chunks = chunkArticle(a);
    expect(chunks.length).toBeGreaterThanOrEqual(7);
    for (const c of chunks) {
      expect(c.content.startsWith("Rateios › ")).toBe(true);
      expect(c.position).toBeGreaterThanOrEqual(1);
    }
    // cada secção tem pelo menos um pedaço
    const anchors = new Set(chunks.map((c) => c.anchor_id));
    expect(anchors.size).toBe(7);
    // sem parágrafos cortados: nenhum pedaço acaba a meio de uma frase por corte
    const oversize = chunks.filter((c) => c.content.length > CHUNK_TARGET_CHARS * 3);
    expect(oversize).toEqual([]);
  });

  it("mantém imagens no body_md mas exclui-as e o texto alternativo da pesquisa", () => {
    const a = parseHelpArticle(rateios, "rateios.md");
    expect(a.sections.some((section) => section.body_md.includes("!["))).toBe(true);

    const content = chunkArticle(a).map((chunk) => chunk.content).join("\n");
    expect(content).not.toContain("img/rateios-");
    expect(content).not.toContain("Rateio igual de um custo lançado no Master");
  });
});
