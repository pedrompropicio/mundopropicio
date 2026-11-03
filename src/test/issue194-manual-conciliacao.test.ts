import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";
import { chunkArticle, parseHelpArticle } from "@/lib/help-manual-parser";
import { loadManualArticles, loadManualSyncPayload } from "@/lib/help-manual-source";

const directory = resolve("docs/manual");
const filename = "conciliacao-bancaria.md";
const raw = readFileSync(resolve(directory, filename), "utf8");
const article = parseHelpArticle(raw, filename);
const chapters = readdirSync(directory)
  .filter((name) => name.endsWith(".md"))
  .map((name) => parseHelpArticle(readFileSync(resolve(directory, name), "utf8"), name));
const anchors = [
  "conciliacao.consultar",
  "conciliacao.importar",
  "conciliacao.automatica",
  "conciliacao.saldos-e-corte",
  "conciliacao.manual",
  "conciliacao.lancar",
  "conciliacao.regras-e-taxas",
  "conciliacao.encontro-de-contas",
  "conciliacao.documentos-e-ignoradas",
];

describe("#194 — capítulo real Conciliação Bancária (R1)", () => {
  it("C1: lê frontmatter e metadados completos de cada secção no parser real", () => {
    expect(article).toMatchObject({
      slug: "conciliacao-bancaria", title: "Conciliação Bancária", module: "erp",
      updated_on: "2026-11-03", profiles: ["manager", "admin"],
      routes: ["/conciliacao-bancaria"], content_md: raw,
    });
    expect(article.sources.length).toBeGreaterThan(0);
    expect(article.sections.map((section) => section.anchor_id)).toEqual(anchors);
    expect(raw.match(/^## /gm)).toHaveLength(anchors.length);
    expect(raw.match(/^```ajuda$/gm)).toHaveLength(anchors.length);
    for (const [index, section] of article.sections.entries()) {
      expect(section.position).toBe(index + 1);
      expect(section.tooltip?.trim(), section.anchor_id).toBeTruthy();
      for (const values of [section.screens, section.profiles, section.sources, section.terms]) {
        expect(values.length, section.anchor_id).toBeGreaterThan(0);
        expect(values.every((value) => value.trim().length > 0), section.anchor_id).toBe(true);
      }
      expect(section.profiles.every((profile) => article.profiles.includes(profile))).toBe(true);
      expect(section.body_md.length, section.anchor_id).toBeGreaterThan(100);
      expect(section.body_md).not.toMatch(/```ajuda|^tooltip:|^termos:/m);
    }
  });

  it("C1: mantém slugs e todos os anchors únicos no corpus completo", () => {
    const slugs = chapters.map((chapter) => chapter.slug);
    const allAnchors = chapters.flatMap((chapter) => chapter.sections.map((section) => section.anchor_id));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(allAnchors).size).toBe(allAnchors.length);
    for (const anchor of anchors) expect(allAnchors.filter((id) => id === anchor), anchor).toHaveLength(1);
  });

  it("C1: inclui o capítulo pelo glob de produção e produz chunks sem perder conteúdo", () => {
    expect(loadManualArticles()).toContainEqual(article);
    const chunks = chunkArticle(article);
    expect(loadManualSyncPayload().find((chapter) => chapter.slug === article.slug)?.chunks).toEqual(chunks);
    expect(new Set(chunks.map((chunk) => chunk.anchor_id))).toEqual(new Set(anchors));
    for (const section of article.sections) {
      const prefix = `${article.title} › ${section.heading}\n\n`;
      const parts = chunks.filter((chunk) => chunk.anchor_id === section.anchor_id);
      for (const [index, part] of parts.entries()) {
        expect(part.position).toBe(index + 1);
        expect(part.terms).toEqual(section.terms);
        expect(part.content.startsWith(prefix)).toBe(true);
        expect(part.content).not.toContain("```ajuda");
      }
      expect(parts.map((part) => part.content.slice(prefix.length)).join("\n\n")).toBe(section.body_md);
    }
  });

  it("C2: resolve fontes do frontmatter e de todas as secções para ficheiros existentes", () => {
    const sources = new Set([...article.sources, ...article.sections.flatMap((section) => section.sources)]);
    for (const source of sources) {
      const path = source.startsWith("src/") || source.startsWith("docs/")
        ? source : `.lovable/memory/features/${source}.md`;
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).isFile(), path).toBe(true);
      expect(readFileSync(path, "utf8").trim().length, path).toBeGreaterThan(0);
    }
  });

  it("C2: resolve links e recursos Markdown contra os artigos reais", () => {
    const links: string[] = [];
    const images: string[] = [];
    marked.walkTokens(marked.lexer(raw), (token) => {
      if (token.type === "link") links.push(token.href);
      if (token.type === "image") images.push(token.href);
    });
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href, href).toMatch(/^\/ajuda\?artigo=[^#]+#.+$/);
      const url = new URL(href, "https://manual.invalid");
      const target = chapters.find((chapter) => chapter.slug === url.searchParams.get("artigo"));
      expect(target, href).toBeDefined();
      expect(target!.sections.some((section) => section.anchor_id === decodeURIComponent(url.hash.slice(1))), href).toBe(true);
    }
    for (const href of images) {
      const path = resolve(directory, href);
      expect(path.startsWith(`${directory}/img/`), href).toBe(true);
      expect(existsSync(path), href).toBe(true);
      expect(statSync(path).isFile(), href).toBe(true);
    }
  });

  it("C4: liga o h1 da conciliação e o h1 de Bilheteiras com texto de reserva", () => {
    for (const [path, anchor, fallback] of [
      ["src/pages/BankReconciliation.tsx", "conciliacao.consultar", /\btext="[^"]+"/],
      ["src/pages/TicketOffices.tsx", "bilheteiras.consultar", /\btext=\{helpTexts\.ticketOffices\}/],
    ] as const) {
      const source = readFileSync(path, "utf8");
      const headings = [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((match) => match[1]);
      const tooltip = headings.flatMap((heading) => heading.match(/<HelpTooltip\b[^>]*\/>/g) ?? [])
        .find((tag) => tag.includes(`anchor="${anchor}"`));
      expect(tooltip, `${path} h1`).toBeDefined();
      expect(tooltip).toMatch(fallback);
      expect(chapters.flatMap((chapter) => chapter.sections).some((section) => section.anchor_id === anchor), anchor).toBe(true);
    }
  });
});
