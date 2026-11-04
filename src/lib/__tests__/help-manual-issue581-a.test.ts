import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";
import { chunkArticle, parseHelpArticle } from "../help-manual-parser";
import { loadManualArticles, loadManualSyncPayload } from "../help-manual-source";
import helpManual, { type HelpSection } from "../help-manual";
import helpTexts from "../help-texts";
import legacyFixture from "./fixtures/issue581-legado-a.json";

const directory = resolve("docs/manual");
const legacy: HelpSection[] = legacyFixture;
const specs = [
  {
    legacyId: "getting-started", slug: "primeiros-passos", routes: ["/erp"],
    anchors: ["primeiros-passos.visao-geral", "primeiros-passos.perfis", "primeiros-passos.navegacao"],
  },
  {
    legacyId: "interface", slug: "interface", routes: [],
    anchors: ["interface.tema", "interface.pesquisa", "interface.ajuda-contextual", "interface.timeout"],
  },
  {
    legacyId: "admin", slug: "administracao", routes: ["/admin/utilizadores", "/admin/seguranca", "/admin/backups"],
    anchors: ["administracao.utilizadores", "administracao.seguranca", "administracao.backups", "administracao.permissoes"],
  },
  {
    legacyId: "calendar", slug: "calendario", routes: ["/calendario"],
    anchors: ["calendario.vistas", "calendario.reservas"],
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
  "primeiros-passos.navegacao": [
    {
      "antigo": "No desktop, o menu mostra ícones e texto; no mobile, apenas ícones.",
      "novo": "No desktop, o menu mostra ícones e, em ecrãs largos, texto; no mobile, abre num painel com ícones e texto.",
      "prova": {
        "ficheiro": "src/components/AppSidebar.tsx",
        "trecho": "const labelCls = isPanel ? \"block\" : \"hidden lg:block\";"
      }
    }
  ],
  "interface.ajuda-contextual": [
    {
      "antigo": "O botão flutuante (📖) no canto inferior direito abre o manual na secção relevante à página atual.",
      "novo": "O botão flutuante com ícone de livro, visível em ecrãs de largura média ou superior, no canto inferior direito abre o manual na secção relevante à página atual.",
      "prova": {
        "ficheiro": "src/components/help/HelpFloatingButton.tsx",
        "trecho": "className=\"fixed bottom-5 right-5 z-40 hidden h-11 w-11 items-center justify-center rounded-full border border-border bg-card/95 text-primary shadow-lg backdrop-blur transition-colors hover:bg-accent md:flex\"\n    >\n      <BookOpen className=\"h-5 w-5\" />"
      }
    }
  ],
  "administracao.permissoes": [
    {
      "antigo": "Admin e Manager — acesso total",
      "novo": "Admin e Manager — acesso sujeito às permissões do perfil e às permissões individuais, que podem recusar ações",
      "prova": {
        "ficheiro": "src/lib/permissions.ts",
        "trecho": "for (const o of overrides.filter((x) => x.company_id === companyId)) {\n    if (o.granted) base.add(o.permission); else base.delete(o.permission);\n  }"
      }
    },
    {
      "antigo": "Partner — acesso read-only via Portal do Parceiro",
      "novo": "Partner — consulta via Portal do Parceiro; a edição do BP exige autorização para o evento e permissão para editar BP aprovado, fora da vista Master e da inspeção de administrador",
      "prova": {
        "ficheiro": "src/pages/PartnerEventDetail.tsx",
        "trecho": "  const canEditBpHere = !isAdminView && !!activeEventId && !isMasterView\n    && canEditBpForActive(activeEventId)\n    && hasPermission(\"edit_approved_bp\");"
      }
    }
  ],
  "primeiros-passos.perfis": [
    {
      "antigo": "Existem 6 perfis: Admin (acesso total), Gerente (gestão operacional e financeira), Editor (registo de dados com restrições de edição), Viewer (apenas consulta), User (perfil base) e Parceiro (acesso read-only a eventos autorizados via Portal do Parceiro).",
      "novo": "O sistema distingue 12 perfis: Administrador, Manager, Produtor, Produtor de Campo, Editor, Viewer, Utilizador, Parceiro, Super-Admin, Gestor de Marketing, Gestor de Conteúdo e Contabilista.",
      "prova": {
        "ficheiro": "src/contexts/AuthContext.tsx",
        "trecho": "  admin: \"Administrador\",\n  manager: \"Manager\",\n  producer: \"Produtor\",\n  field_producer: \"Produtor de Campo\",\n  editor: \"Editor\",\n  viewer: \"Viewer\",\n  user: \"Utilizador\",\n  partner: \"Parceiro\",\n  platform_admin: \"Super-Admin\",\n  marketing_manager: \"Gestor de Marketing\",\n  content_manager: \"Gestor de Conteúdo\",\n  accountant: \"Contabilista\",\n};\n"
      }
    }
  ],
  "interface.pesquisa": [
    {
      "antigo": "Use o ícone de lupa no cabeçalho para pesquisar rapidamente por eventos, transações, fornecedores ou cotações em qualquer parte do sistema.",
      "novo": "Use o ícone de lupa no cabeçalho para pesquisar eventos, transações, fornecedores e páginas do sistema.",
      "prova": {
        "ficheiro": "src/components/GlobalSearch.tsx",
        "trecho": "\n          <CommandGroup heading=\"Páginas\">\n            {PAGES.map((page) => (\n              <CommandItem\n                key={page.path}\n                onSelect={() => go(page.path)}\n                className=\"gap-3\"\n              >"
      }
    }
  ],
  "calendario.vistas": [
    {
      "antigo": "Semanal: detalhe dia a dia com eventos e reservas.",
      "novo": "Mensal: eventos e reservas organizados por dia no mês.\n\nSemanal: detalhe dia a dia com eventos e reservas.",
      "prova": {
        "ficheiro": "src/pages/EventCalendar.tsx",
        "trecho": "      <div className=\"flex items-center gap-1 glass rounded-lg p-1 w-fit\">\n        {([\n          { mode: \"month\" as const, icon: LayoutGrid, label: \"Mês\" },\n          { mode: \"week\" as const, icon: Calendar, label: \"Semana\" },\n          { mode: \"agenda\" as const, icon: List, label: \"Lista\" },\n          { mode: \"year\" as const, icon: CalendarDays, label: \"Ano\" },\n        ]).map(({ mode, icon: Icon, label }) => ("
      }
    }
  ],
  "administracao.backups": [
    {
      "antigo": "Gerencie backups da base de dados. Crie backups manuais antes de alterações importantes ou configure rotinas automáticas para proteção contínua.",
      "novo": "Gira os backups da base de dados. Crie backups manuais antes de alterações importantes e consulte a informação sobre o backup diário automático.",
      "prova": {
        "ficheiro": "src/pages/DatabaseBackups.tsx",
        "trecho": "      <div className=\"glass rounded-xl p-4\">\n        <h3 className=\"text-sm font-semibold mb-2 flex items-center gap-2\">\n          <RefreshCw className=\"h-4 w-4 text-primary\" />\n          Backup Automático\n        </h3>\n        <p className=\"text-xs text-muted-foreground\">\n          O sistema cria automaticamente um backup diário às 3h da manhã.\n          São mantidos os últimos 30 backups. Backups antigos são eliminados automaticamente.\n        </p>"
      }
    }
  ]
};

function applyRevisions(content: string, anchor: string): string {
  return (revisions[anchor] ?? []).reduce((revised, { antigo, novo }) => revised.replace(antigo, novo), content);
}

describe("#581 lote A — migração literal dos quatro grupos legados (R1)", () => {
  it("T1/C1: lê os quatro capítulos e os 13 anchors pelo parser e pelo glob de produção", () => {
    const loaded = loadManualArticles();
    const payload = loadManualSyncPayload();
    expect(migrated.flatMap(({ article }) => article.sections)).toHaveLength(13);
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

  it("T2/C2/C3: fixa a fixture original e conserva cada título e palavra dos 13 tópicos", () => {
    // HEAD 7c87ea234ce20aa1cbfbcd70d588da3ce57a56e3, capturado antes de editar.
    // Grupos originais na ordem getting-started, interface, admin, calendar.
    expect(createHash("sha256").update(JSON.stringify(legacy)).digest("hex"))
      .toBe("be632157681ab3d91a7c8996b1b73a8201a8969574133e1f2450cf86adf99750");
    expect(legacy.map((group) => group.id)).toEqual(specs.map((spec) => spec.legacyId));
    expect(legacy.find((group) => group.id === "getting-started")?.image).toBe("user-roles");
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
      "perfil", "admin", "sidebar", "backups", "permissões", "reservas", "30 minutos", "lupa",
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
      expect(links).toEqual(article.slug === "primeiros-passos"
        ? ["/ajuda?artigo=administracao#administracao.utilizadores"] : []);
      // user-roles.jpg não é suportado pelo renderizador e não migra.
      expect(images).toEqual([]);
    }
  });

  it("T5/C4: liga os seis h1 com reserva e valida os tooltips com as revisões do T2", () => {
    const bindings = [
      { page: "Index", count: 2, key: "dashboard", anchor: "primeiros-passos.visao-geral" },
      { page: "EventCalendar", count: 1, key: "calendar", anchor: "calendario.vistas" },
      { page: "UserManagement", count: 1, key: "userManagement", anchor: "administracao.utilizadores" },
      { page: "SecurityDashboard", count: 1, key: "securityDashboard", anchor: "administracao.seguranca" },
      { page: "DatabaseBackups", count: 1, key: "databaseBackups", anchor: "administracao.backups" },
    ] as const;
    const sections = migrated.flatMap(({ article }) => article.sections);
    for (const { page, count, key, anchor } of bindings) {
      const source = readFileSync(`src/pages/${page}.tsx`, "utf8");
      const headings = source.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) ?? [];
      expect(headings, page).toHaveLength(count);
      const escapedAnchor = anchor.replace(/\./g, "\\.");
      for (const h1 of headings) expect(h1).toMatch(new RegExp(`<HelpTooltip\\b[^>]*anchor="${escapedAnchor}"[^>]*text=\\{helpTexts\\.${key}\\}`));
      expect(sections.find((section) => section.anchor_id === anchor)?.tooltip).toBe(helpTexts[key]);
    }
    for (const { article, group } of migrated) {
      for (const [index, section] of article.sections.entries()) {
        if (bindings.some(({ anchor }) => anchor === section.anchor_id)) continue;
        // A introdução das permissões termina em dois-pontos, sem frase pontuada.
        const content = applyRevisions(group.topics[index].content, section.anchor_id);
        const firstSentence = content.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? content.split("\n")[0];
        expect(section.tooltip, section.anchor_id).toBe(firstSentence);
      }
    }
  });
});
