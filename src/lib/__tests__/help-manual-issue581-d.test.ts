import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";
import { chunkArticle, parseHelpArticle } from "../help-manual-parser";
import { loadManualArticles, loadManualSyncPayload } from "../help-manual-source";
import helpManual, { type HelpSection } from "../help-manual";
import helpTexts from "../help-texts";
import legacyFixture from "./fixtures/issue581-legado-d.json";

const directory = resolve("docs/manual");
const legacy: HelpSection[] = legacyFixture;
const specs = [
  {
    legacyId: "reports", slug: "relatorios", routes: ["/relatorios"],
    anchors: [
      "relatorios.dre", "relatorios.bp-consolidado", "relatorios.extrato", "relatorios.fluxo-caixa",
      "relatorios.contas-a-pagar", "relatorios.movimentacoes", "relatorios.cache-artista", "relatorios.despesas-socios",
      "relatorios.auditoria-bilheteiras", "relatorios.pendencias", "relatorios.listas-pagamento", "relatorios.exportar",
    ],
  },
  {
    legacyId: "iva", slug: "gestao-de-iva", routes: ["/iva"], anchors: ["iva.taxas"],
  },
  {
    legacyId: "accounting", slug: "contabilidade",
    routes: ["/relatorios/pendencias-documentais", "/relatorios/exportacao-contabil"],
    anchors: ["contabilidade.classificacao", "contabilidade.pendencias", "contabilidade.exportacoes"],
  },
  {
    legacyId: "partner-portal", slug: "portal-do-parceiro", routes: ["/parceiro"],
    anchors: ["parceiro.o-que-e", "parceiro.acesso", "parceiro.informacoes"],
  },
];
const migrated = specs.map((spec) => {
  const filename = `${spec.slug}.md`;
  const raw = readFileSync(resolve(directory, filename), "utf8");
  return { ...spec, raw, article: parseHelpArticle(raw, filename), group: legacy.find((group) => group.id === spec.legacyId)! };
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

// Revisões do T2: o T5 aplica o mesmo mapa ao conteúdo legado antes de extrair a primeira frase.
const revisions: Record<string, { antigo: string; novo: string; prova: { ficheiro: string; trecho: string } }[]> = {
  "parceiro.informacoes": [
    {
      "antigo": "Business Plan — receitas e despesas previstas",
      "novo": "Business Plan — receitas e despesas previstas, se tiver permissão para consultar o BP",
      "prova": {
        "ficheiro": "src/pages/PartnerEventDetail.tsx",
        "trecho": "{hasPermission(\"view_bp\") && (\n            <TabsTrigger value=\"bp\""
      }
    },
    {
      "antigo": "Transações — movimentos financeiros do evento",
      "novo": "Transações — movimentos financeiros do evento, se tiver permissão para consultar as transações do portal",
      "prova": {
        "ficheiro": "src/pages/PartnerEventDetail.tsx",
        "trecho": "{hasPermission(\"view_partner_transactions\") && (\n            <TabsTrigger value=\"transactions\""
      }
    },
    {
      "antigo": "Todos os dados são somente leitura — nenhum botão de criar, editar ou eliminar.",
      "novo": "A consulta é a regra; a edição do BP pode ser autorizada para um evento específico, com permissão para editar BP aprovado, fora da vista Master e da inspeção de administrador.",
      "prova": {
        "ficheiro": "src/pages/PartnerEventDetail.tsx",
        "trecho": "const canEditBpHere = !isAdminView && !!activeEventId && !isMasterView\n    && canEditBpForActive(activeEventId)\n    && hasPermission(\"edit_approved_bp\");"
      }
    },
    {
      "antigo": "Ao clicar num evento autorizado, o parceiro tem acesso read-only a 3 abas:",
      "novo": "Ao abrir um evento autorizado, o parceiro pode consultar Bilhetes; os separadores Business Plan e Transações dependem das respetivas permissões. A vista de administrador é read-only.",
      "prova": {
        "ficheiro": "src/pages/PartnerEventDetail.tsx",
        "trecho": "        <TabsList className=\"w-full\">\n          {hasPermission(\"view_bp\") && (\n            <TabsTrigger value=\"bp\" className=\"gap-1.5 flex-1\"><ClipboardList className=\"h-3.5 w-3.5\" /> BP</TabsTrigger>\n          )}\n          <TabsTrigger value=\"ticketing\" className=\"gap-1.5 flex-1\"><Ticket className=\"h-3.5 w-3.5\" /> Bilhetes</TabsTrigger>\n          {hasPermission(\"view_partner_transactions\") && (\n            <TabsTrigger value=\"transactions\" className=\"gap-1.5 flex-1\"><TrendingDown className=\"h-3.5 w-3.5\" /> Transações</TabsTrigger>\n          )}\n        </TabsList>"
      }
    }
  ],
  "iva.taxas": [
    {
      "antigo": "Consulte e configure as taxas de IVA aplicáveis (0%, 6%, 13%, 23%).",
      "novo": "Consulte as taxas de IVA apresentadas para Portugal Continental (0%, 6%, 13%, 23%) e acompanhe a previsão e o controlo do IVA.",
      "prova": {
        "ficheiro": "src/pages/IvaManagement.tsx",
        "trecho": "          <div className=\"text-sm\">\n            <p className=\"font-semibold mb-1\">Taxas de IVA em vigor — Portugal Continental</p>\n            <div className=\"grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground\">\n              <span><strong className=\"text-foreground\">23%</strong> — Taxa normal (serviços, bens gerais)</span>\n              <span><strong className=\"text-foreground\">13%</strong> — Taxa intermédia (alimentação, bebidas)</span>\n              <span><strong className=\"text-foreground\">6%</strong> — Taxa reduzida (espetáculos, bilheteira)</span>\n              <span><strong className=\"text-foreground\">0%</strong> — Isento (seguros, exportações)</span>\n            </div>"
      }
    }
  ],
  "relatorios.fluxo-caixa": [
    {
      "antigo": "Projeção de entradas e saídas futuras com base nas datas de vencimento.",
      "novo": "Consulte entradas e saídas liquidadas pelos valores pagos e pela data efetiva de pagamento, usando a data da transação quando não existe data de pagamento.",
      "prova": {
        "ficheiro": "src/components/ReportCashFlow.tsx",
        "trecho": "   * FONTE ÚNICA DE SALDO (D-ERP12/D-ERP25, #149): o Fluxo de Caixa lê os mesmos\n   * movimentos que `computeAccountBalance` — só transações liquidadas, por\n   * `paid_amount`, data efetiva COALESCE(payment_date, date), estornadas fora e\n   * saldo inicial com a data de corte respeitada. Sem limite de data na leitura:\n   * é o saldo de abertura do período que precisa do histórico anterior.\n   */\n  const { data: transactions = [], isLoading } = useQuery({"
      }
    }
  ],
  "relatorios.exportar": [
    {
      "antigo": "Todos os relatórios podem ser exportados para PDF (impressão) ou Excel (análise).",
      "novo": "As opções de exportação variam por relatório; o Fluxo de Caixa dispõe de consulta no ecrã, sem botões próprios de exportação para PDF ou Excel.",
      "prova": {
        "ficheiro": "src/pages/ReportCashFlowPage.tsx",
        "trecho": "export default function ReportCashFlowPage() {\n  return (\n    <div className=\"space-y-4\">\n      <div>\n        <h1 className=\"text-xl font-bold tracking-tight lg:text-2xl flex items-center gap-2\">Fluxo de Caixa <HelpTooltip text={helpTexts.reportCashFlow} /></h1>\n        <p className=\"text-sm text-muted-foreground\">Receitas vs despesas por período, com opção de separação por evento</p>\n      </div>\n      <ReportCashFlow />\n    </div>\n  );\n}"
      }
    }
  ],
  "parceiro.o-que-e": [
    {
      "antigo": "Utilizadores com perfil 'Parceiro' acedem a um layout simplificado e dedicado, sem acesso ao sistema principal.",
      "novo": "Utilizadores com perfil 'Parceiro' acedem a um layout dedicado para consultar eventos autorizados; a edição do BP exige autorização para o evento e permissão para editar BP aprovado, fora da vista Master e da inspeção de administrador.",
      "prova": {
        "ficheiro": "src/pages/PartnerEventDetail.tsx",
        "trecho": "  const canEditBpHere = !isAdminView && !!activeEventId && !isMasterView\n    && canEditBpForActive(activeEventId)\n    && hasPermission(\"edit_approved_bp\");"
      }
    }
  ]
};

function applyRevisions(content: string, anchor: string): string {
  return (revisions[anchor] ?? []).reduce((revised, { antigo, novo }) => revised.replace(antigo, novo), content);
}

describe("#581 lote D — migração literal dos quatro grupos legados (R1)", () => {
  it("T1/C1: lê os quatro capítulos e os 19 anchors pelo parser e pelo glob de produção", () => {
    const loaded = loadManualArticles();
    const payload = loadManualSyncPayload();
    expect(migrated.flatMap(({ article }) => article.sections)).toHaveLength(19);
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

  it("T2/C2/C3: fixa a fixture original e conserva cada título e palavra dos 19 tópicos", () => {
    // HEAD cac1982137d5ef7ffe4b1ddaf930875e3e830ce7, capturado antes de editar.
    // JSON.stringify dos quatro grupos originais, na ordem do legado.
    expect(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"))
      .toBe("cfa9d2b008844a094c4468f4b9abaf9a0609a4903604464020d18df2b5fabcb6");
    expect(legacy.map((group) => group.id)).toEqual(["reports", "partner-portal", "iva", "accounting"]);
    for (const { article, group } of migrated) {
      expect(article.sections).toHaveLength(group.topics.length);
      expect(article.sections.map((section) => section.heading)).toEqual(group.topics.map((topic) => topic.title));
      for (const [index, topic] of group.topics.entries()) {
        const section = article.sections[index];
        expect(section.heading).toBe(topic.title);
        for (const { antigo, prova } of revisions[section.anchor_id] ?? []) {
          expect(topic.content, section.anchor_id).toContain(antigo);
          expect(topic.content.split(antigo), section.anchor_id).toHaveLength(2);
          expect(readFileSync(prova.ficheiro, "utf8"), prova.ficheiro).toContain(prova.trecho);
        }
        expect(normalize(section.body_md), section.anchor_id)
          .toBe(normalize(applyRevisions(topic.content, section.anchor_id)));
      }
    }
  });

  it("T3/C2: conserva nos chunks todos os acertos da pesquisa antiga por títulos e termos", () => {
    const queries = [
      ...legacy.flatMap((group) => group.topics.map((topic) => topic.title)),
      "dre", "visão sócio", "cachê", "pdf", "excel", "partner_event_access", "read-only", "23%", "contábil",
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

  it("T4/C1: garante unicidade no corpus, fontes existentes e resolução do único link autorizado", () => {
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
      expect(links).toEqual(article.slug === "contabilidade" ? [
        { text: "Relatórios → Pendências Documentais", href: "/ajuda?artigo=relatorios#relatorios.pendencias" },
      ] : []);
      for (const { href } of links) {
        expect(href).toMatch(/^\/ajuda\?artigo=[^#]+#.+$/);
        const url = new URL(href, "https://manual.invalid");
        const target = chapters.find((chapter) => chapter.slug === url.searchParams.get("artigo"));
        expect(target, href).toBeDefined();
        expect(target!.sections.some((section) => section.anchor_id === decodeURIComponent(url.hash.slice(1))), href).toBe(true);
      }
      // O lote D não acrescenta imagens.
      expect(images).toEqual([]);
    }
  });

  it("T5/C4: liga os quatro h1 com reserva e valida os tooltips com as revisões do T2", () => {
    const bindings = [
      { page: "IvaManagement", key: "ivaManagement", anchor: "iva.taxas" },
      { page: "PartnerPortal", key: "partnerPortal", anchor: "parceiro.o-que-e" },
      { page: "ReportDocumentPendenciesPage", key: "reportDocumentPendencies", anchor: "contabilidade.pendencias" },
      { page: "ReportAccountingExportPage", key: "accountingExport", anchor: "contabilidade.exportacoes" },
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
        // Em Informações disponíveis, a frase introdutória termina em dois pontos antes da lista.
        const content = applyRevisions(group.topics[index].content, section.anchor_id);
        const firstSentence = content.match(/^.*?(?:[.!?](?=\s|$)|:(?=\n))/)?.[0];
        expect(firstSentence, section.anchor_id).toBeDefined();
        expect(section.tooltip, section.anchor_id).toBe(firstSentence);
      }
    }
  });

  it("T6/C3: esvazia o legado e mantém as duas guardas de renderização do Manual antigo", () => {
    expect(helpManual).toHaveLength(0);
    expect(helpManual.map((group) => group.id)).toEqual([]);
    expect(createHash("sha256").update(JSON.stringify(helpManual)).digest("hex"))
      .toBe("4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945");
    const source = readFileSync("src/pages/HelpCenter.tsx", "utf8");
    expect(source.match(/\{legacySections\.length > 0 && \(/g)).toHaveLength(2);
    expect(source).toContain("() => helpManual.filter((s) => !articles.some((a) => a.slug === s.id))");
  });
});
