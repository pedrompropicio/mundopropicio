import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";
import { chunkArticle, parseHelpArticle } from "../help-manual-parser";
import { loadManualArticles, loadManualSyncPayload } from "../help-manual-source";
import helpManual, { type HelpSection } from "../help-manual";
import helpTexts from "../help-texts";
import legacyFixture from "./fixtures/issue581-legado-b.json";

const directory = resolve("docs/manual");
const legacy: HelpSection[] = legacyFixture;
const specs = [
  {
    legacyId: "events", slug: "eventos", routes: [],
    anchors: ["eventos.criar", "eventos.estados", "eventos.tipos", "eventos.wizard", "eventos.pago-por-socio", "eventos.bilheteira"],
  },
  {
    legacyId: "transactions", slug: "transacoes", routes: [],
    anchors: [
      "transacoes.criar", "transacoes.ciclo-de-vida", "transacoes.aprovacao-em-lote", "transacoes.reembolsos",
      "transacoes.pago-por-socio", "transacoes.pagamentos-parciais", "transacoes.transferencias",
      "transacoes.documentos", "transacoes.auditoria", "transacoes.listas-pagamento",
    ],
  },
  {
    legacyId: "recurring", slug: "transacoes-recorrentes", routes: ["/recorrentes"],
    anchors: ["recorrentes.configurar"],
  },
  {
    legacyId: "quotations", slug: "cotacoes", routes: ["/cotacoes"],
    anchors: ["cotacoes.fluxo"],
  },
];
const migrated = specs.map((spec, index) => {
  const filename = `${spec.slug}.md`;
  const raw = readFileSync(resolve(directory, filename), "utf8");
  return { ...spec, raw, article: parseHelpArticle(raw, filename), group: legacy[index] };
});
const chapters = readdirSync(directory)
  .filter((name) => name.endsWith(".md"))
  .map((name) => parseHelpArticle(readFileSync(resolve(directory, name), "utf8"), name));

function normalize(content: string): string {
  return content.replace(/^\s*[-•] /gm, "").replace(/`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
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

describe("#581 lote B — migração literal dos quatro grupos legados (R1)", () => {
  it("T1/C1: lê os quatro capítulos e os 18 anchors pelo parser e pelo glob de produção", () => {
    const loaded = loadManualArticles();
    const payload = loadManualSyncPayload();
    expect(migrated.flatMap(({ article }) => article.sections)).toHaveLength(18);
    for (const { article, raw, slug, routes, anchors, group } of migrated) {
      expect(article).toMatchObject({
        slug, title: group.title, module: "erp", updated_on: "2026-11-04",
        profiles: [], routes, content_md: raw,
      });
      expect(loaded).toContainEqual(article);
      expect(article.sources.length).toBeGreaterThan(0);
      expect(raw.replace(/^---\n[\s\S]*?\n---\n/, "")).toMatch(/^\s*## /);
      expect(raw.match(/^## /gm)).toHaveLength(anchors.length);
      expect(raw.match(/^```ajuda$/gm)).toHaveLength(article.sections.length);
      expect(raw.match(/^perfis: \[\]$/gm)).toHaveLength(anchors.length + 1);
      expect(article.sections.map((section) => section.anchor_id)).toEqual(anchors);
      expect(article.sections.map((section) => section.position)).toEqual(anchors.map((_, index) => index + 1));
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

  it("T2/C2/C3: fixa a fixture original e conserva cada título e palavra dos 18 tópicos", () => {
    // HEAD ec8d82306207befb462652a843a9d9c9d642370a, capturado antes de editar.
    // Grupos originais na ordem events, transactions, recurring, quotations.
    expect(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"))
      .toBe("5017a08bdf9e1ba0c46086bf14ffb16b3b29ec74ea5019af33447659be08fb2f");
    expect(legacy.map((group) => group.id)).toEqual(specs.map((spec) => spec.legacyId));
    expect(legacy.find((group) => group.id === "events")?.image).toBe("event-lifecycle");
    expect(legacy.find((group) => group.id === "transactions")?.image).toBe("transaction-lifecycle");
    expect(helpManual).toHaveLength(0);
    expect(helpManual.map((group) => group.id)).toEqual([]);
    // JSON.stringify do legado vazio após o lote D (#581).
    expect(createHash("sha256").update(JSON.stringify(helpManual)).digest("hex"))
      .toBe("4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
    expect(helpManual.some((group) => specs.some((spec) => spec.legacyId === group.id))).toBe(false);
    for (const { article, group } of migrated) {
      expect(article.sections).toHaveLength(group.topics.length);
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
      ...legacy.flatMap((group) => group.topics.map((topic) => topic.title)),
      "lockdown", "split", "pago por sócio", "iban", "transferência", "transaction_audit_log", "rendas", "cotações",
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

  it("T4/C1: garante unicidade no corpus, fontes existentes e resolução dos dois links autorizados", () => {
    const slugs = chapters.map((chapter) => chapter.slug);
    const anchors = chapters.flatMap((chapter) => chapter.sections.map((section) => section.anchor_id));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const { article, raw } of migrated) {
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
      const links: { text: string; href: string }[] = [];
      const images: string[] = [];
      marked.walkTokens(marked.lexer(raw), (token) => {
        if (token.type === "link") links.push({ text: token.text, href: token.href });
        if (token.type === "image") images.push(token.href);
      });
      expect(links).toEqual(article.slug === "transacoes" ? [
        { text: "'Notas de Reembolso'", href: "/ajuda?artigo=notas-de-reembolso#reembolsos.o-que-sao" },
        { text: "'Despesas Pagas por Sócio'", href: "/ajuda?artigo=eventos#eventos.pago-por-socio" },
      ] : []);
      for (const { href } of links) {
        expect(href).toMatch(/^\/ajuda\?artigo=[^#]+#.+$/);
        const url = new URL(href, "https://manual.invalid");
        const target = chapters.find((chapter) => chapter.slug === url.searchParams.get("artigo"));
        expect(target, href).toBeDefined();
        expect(target!.sections.some((section) => section.anchor_id === decodeURIComponent(url.hash.slice(1))), href).toBe(true);
      }
      // event-lifecycle.jpg e transaction-lifecycle.jpg não são suportados pelo renderizador.
      expect(images).toEqual([]);
    }
  });

  it("T5/C4: liga os quatro h1 com reserva e conserva literalmente os tooltips", () => {
    const bindings = [
      { page: "Events", key: "events", anchor: "eventos.criar" },
      { page: "Transactions", key: "transactions", anchor: "transacoes.criar" },
      { page: "RecurringTransactions", key: "recurringTransactions", anchor: "recorrentes.configurar" },
      { page: "Quotations", key: "quotations", anchor: "cotacoes.fluxo" },
    ] as const;
    const sections = migrated.flatMap(({ article }) => article.sections);
    for (const { page, key, anchor } of bindings) {
      const source = readFileSync(`src/pages/${page}.tsx`, "utf8");
      const headings = source.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) ?? [];
      expect(headings, page).toHaveLength(1);
      const escapedAnchor = anchor.replace(/\./g, "\\.");
      expect(headings[0]).toMatch(new RegExp(`<HelpTooltip\\b[^>]*anchor="${escapedAnchor}"[^>]*text=\\{helpTexts\\.${key}\\}`));
      expect(sections.find((section) => section.anchor_id === anchor)?.tooltip).toBe(helpTexts[key]);
    }
    for (const { article, group } of migrated) {
      for (const [index, section] of article.sections.entries()) {
        if (bindings.some(({ anchor }) => anchor === section.anchor_id)) continue;
        const firstSentence = group.topics[index].content.match(/^.*?[.!?](?=\s|$)/)?.[0];
        expect(firstSentence, section.anchor_id).toBeDefined();
        expect(section.tooltip, section.anchor_id).toBe(firstSentence);
      }
    }
  });
});
