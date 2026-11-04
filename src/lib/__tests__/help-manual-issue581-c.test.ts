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

// Revisões do T2: o T5 aplica o mesmo mapa ao conteúdo legado antes de extrair a primeira frase.
const revisions: Record<string, { antigo: string; novo: string; prova: { ficheiro: string; trecho: string } }[]> = {
  "reembolsos.fluxo": [
    {
      "antigo": "2. No módulo Notas de Reembolso, crie uma nova nota indicando o funcionário e notas adicionais.",
      "novo": "2. Antes de guardar a despesa, selecione ou crie uma Nota de Reembolso no formulário de transações; a vinculação à nota é automática, sem conta financeira associada.",
      "prova": {
        "ficheiro": "src/components/TransactionFormModal.tsx",
        "trecho": "if (form.is_reimbursement && !form.reimbursement_note_id && !showNewReimbursementNote) {\n      toast({ title: \"Selecione ou crie uma Nota de Reembolso\", variant: \"destructive\" });\n      return;\n    }"
      }
    },
    {
      "antigo": "3. Adicione as despesas de reembolso à nota. Cada item deve ter obrigatoriamente um documento contábil (fatura, recibo) anexado.",
      "novo": "3. Cada item deve ter obrigatoriamente um documento contábil (fatura, recibo) anexado.",
      "prova": {
        "ficheiro": "src/components/TransactionFormModal.tsx",
        "trecho": "A transação será vinculada automaticamente à nota de reembolso — sem conta financeira associada"
      }
    },
    {
      "antigo": "4. Aprove a nota (operação em lote que aprova todas as despesas vinculadas).",
      "novo": "4. Aprove a nota (operação em lote que aprova apenas as despesas vinculadas em estado pendente).",
      "prova": {
        "ficheiro": "src/components/ReimbursementNoteDetail.tsx",
        "trecho": ".filter((i: any) => i.transactions?.status === \"pending\")"
      }
    },
    {
      "antigo": "5. Ao pagar, o sistema gera automaticamente uma transação bancária vinculada à nota, garantindo rastreabilidade bidirecional.",
      "novo": "5. Use 'Gerar Transação para Pagamento' para criar uma transação aprovada, sem conta financeira e excluída do resultado; a nota passa a 'Aguarda Pagamento'. Liquide a transação no fluxo normal de pagamentos, escolhendo então a conta bancária; a nota e os itens passam automaticamente a pagos.",
      "prova": {
        "ficheiro": "src/components/ReimbursementNoteDetail.tsx",
        "trecho": "// Cria transação de pagamento APENAS aprovada (pendente de liquidação).\n      // A liquidação efetiva acontece pelo fluxo normal de pagamentos da TX,\n      // e o trigger reimbursement_propagate_payment marca a nota + itens como pagos.\n      // exclude_from_result: o custo do reembolso já está nos itens; o pagamento\n      // nunca entra no resultado (0286 — a trigger na nota também o garante)."
      }
    }
  ],
  "reembolsos.regras": [
    {
      "antigo": "A aprovação propaga o estado 'Aprovado' para todas as transações vinculadas.",
      "novo": "A aprovação propaga o estado 'Aprovado' apenas para as transações vinculadas em estado pendente.",
      "prova": {
        "ficheiro": "src/components/ReimbursementNoteDetail.tsx",
        "trecho": ".filter((i: any) => i.transactions?.status === \"pending\")"
      }
    },
    {
      "antigo": "A liquidação gera automaticamente uma transação bancária na conta selecionada.",
      "novo": "A geração do pagamento cria uma transação aprovada, sem conta financeira e excluída do resultado, e coloca a nota em 'Aguarda Pagamento'; a liquidação faz-se no fluxo normal de pagamentos e marca a nota e os itens como pagos.",
      "prova": {
        "ficheiro": "src/components/ReimbursementNoteDetail.tsx",
        "trecho": "status: \"approved\",\n          exclude_from_result: true,"
      }
    },
    {
      "antigo": "Os estados disponíveis são: Rascunho, Aprovada e Paga.",
      "novo": "Os estados disponíveis são: Rascunho, Aprovada, Aguarda Pagamento e Paga.",
      "prova": {
        "ficheiro": "src/pages/Reimbursements.tsx",
        "trecho": "const statusLabels: Record<string, string> = {\n  draft: \"Rascunho\",\n  approved: \"Aprovada\",\n  pending_payment: \"Aguarda Pagamento\",\n  paid: \"Paga\",\n};"
      }
    }
  ],
  "contas.o-que-sao": [
    {
      "antigo": "O saldo é calculado automaticamente a partir do saldo inicial + transações pagas (entradas) − transações pagas (saídas).",
      "novo": "Os saldos são calculados no servidor, separando caixa (contas bancárias, caixas e cartões pré-pagos), retido em bilheteiras (com fórmula própria) e acertos em curso. Os casos 'Não controlado' e 'Sem permissão' não são apresentados como saldo zero.",
      "prova": {
        "ficheiro": "src/hooks/useAccountBalanceCards.ts",
        "trecho": "* - caixa: contas `bank`, `cash`, `prepaid_card` com controlo de saldo\n *   → `account_true_balances_asof(ids, null)`\n * - retido em bilheteiras: contas `ticket_office`\n *   → `ticket_office_balances(ids)` — fórmula própria (D-ERP15), NÃO converge\n *     com a bancária\n * - acertos em curso: contas `other`\n *\n * Regra de apresentação: onde não há permissão nunca se mostra zero."
      }
    }
  ],
  "contas.acesso": [
    {
      "antigo": "Utilizadores sem acesso não verão a conta nem o seu saldo.",
      "novo": "Utilizadores sem permissão para consultar o saldo veem o nome da conta e 'Sem permissão' no saldo.",
      "prova": {
        "ficheiro": "src/pages/FinancialAccounts.tsx",
        "trecho": "<span className=\"text-xs text-muted-foreground italic\">Sem permissão</span>"
      }
    }
  ],
  "reembolsos.o-que-sao": [
    {
      "antigo": "As Notas de Reembolso permitem agrupar despesas pagas do bolso de um funcionário e processá-las num único pagamento.",
      "novo": "As Notas de Reembolso agrupam despesas pagas do bolso de um funcionário para reembolso através de uma transação aprovada, gerada antes da liquidação.",
      "prova": {
        "ficheiro": "src/components/ReimbursementNoteDetail.tsx",
        "trecho": "          <h3 className=\"text-sm font-semibold\">Gerar Transação para Pagamento</h3>\n          <p className=\"text-xs text-muted-foreground\">\n            Será criada uma transação de saída de {formatCurrency(grossTotal)} (c/ IVA) no estado <strong>Aprovada</strong>, vinculada a esta nota.\n            A nota passa a <strong>Aguarda Pagamento</strong>. Quando liquidares essa transação no fluxo normal de pagamentos, a nota e todas as despesas-filhas ficam automaticamente marcadas como Pagas.\n          </p>\n          {supplierData && (\n            <SupplierBankDetails supplier={supplierData} defaultExpanded />\n          )}\n          <p className=\"text-[11px] text-muted-foreground\">\n            A conta bancária de saída será escolhida no momento da liquidação da transação."
      }
    }
  ],
  "plano-contas.eventos": [
    {
      "antigo": "Categorias operacionais (grupos 1 a 4) exigem associação a um evento nas transações.",
      "novo": "A obrigatoriedade de associar um evento é definida na categoria raiz e herdada pelas subcategorias.",
      "prova": {
        "ficheiro": "src/components/TransactionFormModal.tsx",
        "trecho": "  const getRootFlags = (categoryId: string) => {\n    if (!categoryId) return { event_required: false };\n    let cat = categories.find((c: any) => c.id === categoryId);\n    while (cat && cat.parent_id) {\n      cat = categories.find((c: any) => c.id === cat!.parent_id);\n    }\n    return { event_required: cat?.event_required ?? true };\n  };"
      }
    },
    {
      "antigo": "O grupo 10 (Administrativo/Financeiro) trata de custos fixos e estruturais sem essa exigência.",
      "novo": "O código do grupo, incluindo o Grupo 10 (Administrativo/Financeiro), não determina por si só essa exigência; a opção 'Evento obrigatório' é configurada no nível 1.",
      "prova": {
        "ficheiro": "src/components/CategoryFormModal.tsx",
        "trecho": "          {!effectiveParentId && (\n            <div className=\"space-y-2 rounded-lg border border-border/50 p-3\">\n              <p className=\"text-xs font-medium text-muted-foreground\">Obrigatoriedade (apenas para nível 1)</p>\n              <div className=\"flex items-center gap-2\">\n                <input\n                  type=\"checkbox\"\n                  id=\"cat_event_required\"\n                  checked={eventRequired}\n                  onChange={(e) => setEventRequired(e.target.checked)}\n                  className=\"rounded border-border\"\n                />\n                <Label htmlFor=\"cat_event_required\" className=\"text-sm\">Evento obrigatório</Label>\n              </div>\n            </div>\n          )}\n"
      }
    }
  ]
};

function applyRevisions(content: string, anchor: string): string {
  return (revisions[anchor] ?? []).reduce((revised, { antigo, novo }) => revised.replace(antigo, novo), content);
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

  it("T5/C4: liga os dois h1 com reserva e valida os tooltips com as revisões do T2", () => {
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
        const content = applyRevisions(group.topics[index].content, section.anchor_id);
        const firstSentence = content.match(/^(?:\d+\.\s)?[^.!?]*[.!?]/)?.[0];
        expect(section.tooltip, section.anchor_id).toBe(firstSentence);
      }
    }
  });
});
