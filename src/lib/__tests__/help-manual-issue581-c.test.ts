import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";
import { chunkArticle, parseHelpArticle } from "../help-manual-parser";
import { loadManualArticles, loadManualSyncPayload } from "../help-manual-source";
import helpManual, { type HelpSection } from "../help-manual";
import helpTexts from "../help-texts";
import legacyFixture from "./fixtures/issue581-legado-c.json";

const directory = resolve("docs/manual");
const legacy: HelpSection[] = legacyFixture;
const specs = [
  {
    legacyId: "reimbursements", slug: "notas-de-reembolso", routes: ["/reembolsos"],
    anchors: ["reembolsos.o-que-sao", "reembolsos.fluxo", "reembolsos.regras"],
  },
  {
    legacyId: "accounts", slug: "contas-de-movimentacao", routes: [],
    anchors: ["contas.o-que-sao", "contas.acesso", "contas.operacoes-financeiras"],
  },
  {
    legacyId: "categories", slug: "plano-de-contas", routes: ["/plano-contas"],
    anchors: ["plano-contas.estrutura", "plano-contas.eventos", "plano-contas.relatorios"],
  },
];
const migrated = specs.map((spec, index) => {
  const filename = `${spec.slug}.md`;
  const raw = readFileSync(resolve(directory, filename), "utf8");
  return { ...spec, filename, raw, article: parseHelpArticle(raw, filename), group: legacy[index] };
});
const chapters = readdirSync(directory)
  .filter((name) => name.endsWith(".md"))
  .map((name) => parseHelpArticle(readFileSync(resolve(directory, name), "utf8"), name));

function normalize(content: string): string {
  return content.replace(/^\s*[-•] /gm, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

// Mesmo filtro do useMemo de HelpCenter: substring minúscula no título/conteúdo do tópico.
function legacySearch(search: string): HelpSection[] {
  if (!search.trim()) return legacy;
  const q = search.toLowerCase();
  return legacy
    .map((section) => ({
      ...section,
      topics: section.topics.filter(
        (t) => t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.topics.length > 0);
}

describe("#581 lote C — migração literal dos três grupos legados (R1)", () => {
  it("T1/C1: lê os três capítulos e os nove anchors pelo parser e pelo glob de produção", () => {
    const loaded = loadManualArticles();
    const payload = loadManualSyncPayload();
    expect(migrated.flatMap(({ article }) => article.sections)).toHaveLength(9);
    for (const { article, raw, slug, routes, anchors, group } of migrated) {
      expect(article).toMatchObject({
        slug, title: group.title, module: "erp", updated_on: "2026-11-04",
        profiles: [], routes, content_md: raw,
      });
      expect(loaded).toContainEqual(article);
      expect(article.sources.length).toBeGreaterThan(0);
      expect(raw.replace(/^---\n[\s\S]*?\n---\n/, "")).toMatch(/^\s*## /);
      expect(raw.match(/^## /gm)).toHaveLength(3);
      expect(raw.match(/^```ajuda$/gm)).toHaveLength(article.sections.length);
      expect(raw.match(/^perfis: \[\]$/gm)).toHaveLength(4);
      expect(article.sections.map((section) => section.anchor_id)).toEqual(anchors);
      expect(article.sections.map((section) => section.position)).toEqual([1, 2, 3]);
      for (const [index, section] of article.sections.entries()) {
        expect(section.profiles, section.anchor_id).toEqual([]);
        expect(section.tooltip?.trim(), section.anchor_id).toBeTruthy();
        for (const values of [section.screens, section.sources, section.terms]) {
          expect(values.length, section.anchor_id).toBeGreaterThan(0);
          expect(values.every((value) => value.trim().length > 0), section.anchor_id).toBe(true);
        }
        const vocabulary = `${group.topics[index].title}\n${group.topics[index].content}`.toLowerCase();
        for (const term of section.terms) expect(vocabulary, term).toContain(term.toLowerCase());
        expect(section.body_md).not.toMatch(/```ajuda|^tooltip:|^termos:/m);
      }
      const chunks = chunkArticle(article);
      expect(payload.find((chapter) => chapter.slug === slug)?.chunks).toEqual(chunks);
      expect(new Set(chunks.map((chunk) => chunk.anchor_id))).toEqual(new Set(anchors));
      for (const section of article.sections) {
        const prefix = `${article.title} › ${section.heading}\n\n`;
        const parts = chunks.filter((chunk) => chunk.anchor_id === section.anchor_id);
        expect(parts.map((part) => part.position)).toEqual(parts.map((_, index) => index + 1));
        for (const part of parts) {
          expect(part.content.startsWith(prefix)).toBe(true);
          expect(part.terms).toEqual(section.terms);
        }
        expect(parts.map((part) => part.content.slice(prefix.length)).join("\n\n")).toBe(section.body_md);
      }
    }
  });

  it("T2/C2/C3: fixa a fixture original e conserva cada título e palavra dos nove tópicos", () => {
    // main 3d697d4174cc5ac5cfe65d8c68ec4eaf4e26acb5, capturado antes de editar.
    expect(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"))
      .toBe("a75af6d46daf20c71169dc78eaa149c10007e97bbdfe492d5f3be5fd388c75f0");
    expect(legacy.map((group) => group.id)).toEqual(specs.map((spec) => spec.legacyId));
    expect(legacy.find((group) => group.id === "accounts")?.image).toBe("accounts-flow");
    expect(helpManual).toHaveLength(0);
    expect(helpManual.some((group) => specs.some((spec) => spec.legacyId === group.id))).toBe(false);
    for (const { article, group } of migrated) {
      expect(group.topics).toHaveLength(3);
      expect(article.sections.map((section) => section.heading)).toEqual(group.topics.map((topic) => topic.title));
      for (const [index, topic] of group.topics.entries()) {
        const section = article.sections[index];
        expect(section.heading).toBe(topic.title);
        expect(normalize(section.body_md), section.anchor_id).toBe(normalize(topic.content));
      }
    }
  });

  it("T3/C2: conserva nos chunks todos os acertos da pesquisa antiga por títulos e termos", () => {
    const queries = [
      ...legacy.flatMap((group) => [group.title, ...group.topics.map((topic) => topic.title)]),
      "reembolso", "R-001/2026", "saldo", "Grupo 10", "código", "evento",
    ];
    const covered = new Set<string>();
    for (const query of queries) {
      const results = legacySearch(query);
      expect(results.length, query).toBeGreaterThan(0);
      for (const result of results) {
        const target = migrated.find(({ legacyId }) => legacyId === result.id)!;
        const chunks = chunkArticle(target.article);
        for (const topic of result.topics) {
          const section = target.article.sections.find((candidate) => candidate.heading === topic.title)!;
          expect(section, `${query}: ${topic.title}`).toBeDefined();
          covered.add(section.anchor_id);
          expect(chunks.some((chunk) => chunk.anchor_id === section.anchor_id
            && chunk.content.toLowerCase().includes(query.toLowerCase())), `${query}: ${section.anchor_id}`).toBe(true);
        }
      }
    }
    expect([...covered].sort()).toEqual(specs.flatMap((spec) => spec.anchors).sort());
  });

  it("T4/C1: garante unicidade no corpus, fontes existentes e resolução de links e recursos", () => {
    const slugs = chapters.map((chapter) => chapter.slug);
    const anchors = chapters.flatMap((chapter) => chapter.sections.map((section) => section.anchor_id));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const { article, raw, filename } of migrated) {
      for (const section of article.sections) {
        expect(anchors.filter((anchor) => anchor === section.anchor_id)).toHaveLength(1);
      }
      const sources = new Set([...article.sources, ...article.sections.flatMap((section) => section.sources)]);
      for (const source of sources) {
        expect(source).toMatch(/^src\//);
        expect(existsSync(source), source).toBe(true);
        expect(statSync(source).isFile(), source).toBe(true);
        expect(readFileSync(source, "utf8").trim().length, source).toBeGreaterThan(0);
      }
      const links: string[] = [];
      const images: string[] = [];
      marked.walkTokens(marked.lexer(raw), (token) => {
        if (token.type === "link") links.push(token.href);
        if (token.type === "image") images.push(token.href);
      });
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
      // Este lote não acrescenta links nem migra accounts-flow.jpg.
      expect(links).toEqual([]);
      expect(images).toEqual([]);
    }
  });

  it("T5/C4: liga os dois h1 com reserva e conserva literalmente os tooltips", () => {
    const bindings = [
      { page: "Reimbursements", key: "reimbursements", anchor: "reembolsos.o-que-sao" },
      { page: "AccountCategories", key: "accountCategories", anchor: "plano-contas.estrutura" },
    ] as const;
    const sections = migrated.flatMap(({ article }) => article.sections);
    for (const { page, key, anchor } of bindings) {
      const source = readFileSync(`src/pages/${page}.tsx`, "utf8");
      const h1 = source.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/)?.[0];
      expect(h1).toBeDefined();
      const escapedAnchor = anchor.replace(/\./g, "\\.");
      expect(h1).toMatch(new RegExp(`<HelpTooltip\\b[^>]*anchor="${escapedAnchor}"[^>]*text=\\{helpTexts\\.${key}\\}`));
      expect(sections.find((section) => section.anchor_id === anchor)?.tooltip).toBe(helpTexts[key]);
    }
    for (const { article, group } of migrated) {
      for (const [index, section] of article.sections.entries()) {
        if (bindings.some(({ anchor }) => anchor === section.anchor_id)) continue;
        // O número de um passo pertence à frase; não é um fim de frase.
        const firstSentence = group.topics[index].content.match(/^(?:\d+\.\s)?[^.!?]*[.!?]/)?.[0];
        expect(section.tooltip, section.anchor_id).toBe(firstSentence);
      }
    }
  });
});
