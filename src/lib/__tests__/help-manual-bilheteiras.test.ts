import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";
import { chunkArticle, parseHelpArticle } from "../help-manual-parser";

const directory = resolve("docs/manual");
const filename = "bilheteiras.md";
const raw = readFileSync(resolve(directory, filename), "utf8");
const article = parseHelpArticle(raw, filename);
const chapters = readdirSync(directory)
  .filter((name) => name.endsWith(".md"))
  .map((name) => parseHelpArticle(readFileSync(resolve(directory, name), "utf8"), name));
const anchors = [
  "bilheteiras.consultar",
  "bilheteiras.saldos",
  "bilheteiras.apuramento",
  "bilheteiras.conciliacao",
  "bilheteiras.fecho",
  "bilheteiras.fecho-financeiro",
];

function sourcePath(source: string): string {
  return source.startsWith("src/") || source.startsWith("docs/")
    ? source
    : `.lovable/memory/features/${source}.md`;
}

describe("capítulo real Bilheteiras (#194, preparação R1)", () => {
  it("lê o frontmatter e todas as secções pelo parser de produção", () => {
    expect(article).toMatchObject({
      slug: "bilheteiras",
      title: "Bilheteiras",
      module: "erp",
      updated_on: "2026-11-02",
      profiles: ["manager", "admin"],
      routes: ["/bilheteiras"],
      content_md: raw,
    });
    expect(article.sections.map((section) => section.anchor_id)).toEqual(anchors);
    expect(article.sections.map((section) => section.position)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(raw.match(/^```ajuda$/gm)).toHaveLength(article.sections.length);
    for (const section of article.sections) {
      expect(section.tooltip, section.anchor_id).toBeTruthy();
      expect(section.screens.length, section.anchor_id).toBeGreaterThan(0);
      expect(section.profiles, section.anchor_id).toEqual(article.profiles);
      expect(section.sources.length, section.anchor_id).toBeGreaterThan(0);
      expect(section.terms.length, section.anchor_id).toBeGreaterThan(0);
      expect(section.body_md.length, section.anchor_id).toBeGreaterThan(100);
      expect(section.body_md).not.toMatch(/```ajuda|^tooltip:|^termos:/m);
    }
  });

  it("mantém slug e anchors únicos no corpus real completo", () => {
    expect(chapters.filter((chapter) => chapter.slug === article.slug)).toHaveLength(1);
    const allAnchors = chapters.flatMap((chapter) => chapter.sections.map((section) => section.anchor_id));
    for (const anchor of anchors) {
      expect(allAnchors.filter((value) => value === anchor), anchor).toHaveLength(1);
    }
    expect(new Set(allAnchors).size).toBe(allAnchors.length);
    expect(new Set(chapters.map((chapter) => chapter.slug)).size).toBe(chapters.length);
  });

  it("resolve todas as fontes declaradas para ficheiros locais existentes", () => {
    const sources = new Set([...article.sources, ...article.sections.flatMap((section) => section.sources)]);
    expect(sources.size).toBeGreaterThan(10);
    for (const source of sources) {
      const path = sourcePath(source);
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).isFile(), path).toBe(true);
      expect(readFileSync(path, "utf8").trim().length, path).toBeGreaterThan(0);
    }
  });

  it("resolve links de Fecho e qualquer recurso Markdown do artefacto real", () => {
    const links: string[] = [];
    const images: string[] = [];
    marked.walkTokens(marked.lexer(raw), (token) => {
      if (token.type === "link") links.push(token.href);
      if (token.type === "image") images.push(token.href);
    });
    expect(links).toEqual([
      "/ajuda?artigo=fecho-do-evento#fecho.ordem",
      "/ajuda?artigo=fecho-do-evento#fecho.encontro-de-contas",
      "/ajuda?artigo=fecho-do-evento#fecho.selar",
      "/ajuda?artigo=fecho-do-evento#fecho.concluir",
      "/ajuda?artigo=fecho-do-evento#fecho.bilheteira",
    ]);
    // A rota e os anchors são um contrato local; não se consulta a plataforma.
    expect(readFileSync("src/pages/HelpCenter.tsx", "utf8")).toContain('id={s.anchor_id}');
    for (const href of [...links, ...images]) {
      expect(href).not.toMatch(/^(?:https?:|data:|\/\/)/);
      if (href.startsWith("/ajuda?")) {
        const url = new URL(href, "https://manual.invalid");
        const target = chapters.find((chapter) => chapter.slug === url.searchParams.get("artigo"));
        expect(target, href).toBeDefined();
        expect(target!.sections.some((section) => section.anchor_id === decodeURIComponent(url.hash.slice(1))), href).toBe(true);
      } else {
        const [file, anchor] = href.split("#");
        const path = resolve(directory, file || filename);
        expect(path.startsWith(`${directory}/`), href).toBe(true);
        expect(existsSync(path), href).toBe(true);
        expect(statSync(path).isFile(), href).toBe(true);
        if (anchor) {
          const target = parseHelpArticle(readFileSync(path, "utf8"), path);
          expect(target.sections.some((section) => section.anchor_id === anchor), href).toBe(true);
        }
      }
    }
    // A tabela dispensa diagrama nesta entrega; não deve sobrar referência órfã.
    expect(images).toEqual([]);
  });

  it("produz chunks reais para todas as secções com termos e posições preservados", () => {
    const chunks = chunkArticle(article);
    expect(new Set(chunks.map((chunk) => chunk.anchor_id))).toEqual(new Set(anchors));
    for (const section of article.sections) {
      const sectionChunks = chunks.filter((chunk) => chunk.anchor_id === section.anchor_id);
      expect(sectionChunks.map((chunk) => chunk.position)).toEqual(sectionChunks.map((_, index) => index + 1));
      for (const chunk of sectionChunks) {
        expect(chunk.terms).toEqual(section.terms);
        expect(chunk.content.startsWith(`${article.title} › ${section.heading}\n\n`)).toBe(true);
        expect(chunk.content).not.toContain("```ajuda");
      }
      const reconstructed = sectionChunks
        .map((chunk) => chunk.content.slice(`${article.title} › ${section.heading}\n\n`.length))
        .join("\n\n");
      expect(reconstructed).toBe(section.body_md);
    }
  });
});
