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

// Revisões do T2: o T5 aplica o mesmo mapa ao conteúdo legado antes de extrair a primeira frase.
const revisions: Record<string, { antigo: string; novo: string; prova: { ficheiro: string; trecho: string } }[]> = {
  "transacoes.ciclo-de-vida": [
    {
      "antigo": "Bloqueio de eliminação e de alteração de valores financeiros, categorias e eventos.",
      "novo": "Bloqueio de eliminação. A permissão de aprovação permite ajustes administrativos nos campos, sujeitos às restrições específicas da transação.",
      "prova": {
        "ficheiro": "src/components/TransactionEditModal.tsx",
        "trecho": "const paidLocked = isPaid && !canApprove;"
      }
    },
    {
      "antigo": "Apenas 'Especificação' e 'Fornecedor' podem ser editados por Admins ou Editores.",
      "novo": "Sem permissão de aprovação, podem ser alterados 'Especificação', 'Fornecedor', 'Nº Fatura' e 'Método de Pagamento', entre outros campos permitidos; os valores e o evento ficam bloqueados, e os gestores podem alterar a categoria.",
      "prova": {
        "ficheiro": "src/components/TransactionEditModal.tsx",
        "trecho": "const allowedFields = (paidLocked\n        ? [\"specification\", \"supplier_id\", \"is_transitory\", \"is_confidential\", \"excluded_from_partner_settlement\", \"exclude_from_result\", \"shared_cost_account_id\", \"shared_cost_counterparty_id\", \"invoice_ref\", \"payment_method\", \"payment_entity\", \"payment_reference\", \"operation_key\", \"ordering_partner_id\", \"paying_partner_id\", \"event_settlement_id\", \"held_by_supplier_id\",\n           ...(canReallocBpWhenPaid ? [\"category_id\"] : [])]"
      }
    }
  ],
  "eventos.wizard": [
    {
      "antigo": "Para eventos do tipo 'Múltiplos Dias', o sistema oferece um assistente avançado que permite configurar a hierarquia completa de cidades (eventos Split), datas extra e múltiplas sessões num único fluxo atómico. Ao finalizar o wizard, toda a estrutura é criada de uma só vez.",
      "novo": "Para eventos do tipo 'Múltiplos Dias', o assistente permite configurar cidades (eventos Split), datas extra e múltiplas sessões. Ao finalizar o wizard, o Master é criado primeiro e os eventos Split são criados em operações sucessivas; uma falha pode deixar a estrutura parcialmente criada.",
      "prova": {
        "ficheiro": "src/pages/Events.tsx",
        "trecho": "\n      if (data.event_type === \"festival\" && data.festival_dates.length > 0) {\n        const datesToInsert = data.festival_dates.map(d => ({\n          event_id: parentId,\n          date: d,\n        }));\n        const { error: dErr } = await supabase.from(\"event_dates\" as any).insert(datesToInsert);\n        if (dErr) throw dErr;\n      }\n\n      // Create sessions for simple/festival events\n      if (data.event_type !== \"multi_day\" && data.sessions.length > 0) {\n        const sessionsToInsert = data.sessions.map((sess, i) => ({\n          event_id: parentId,\n          date: sess.date || data.date,\n          label: sess.label || `Sessão ${i + 1}`,\n          start_time: sess.start_time || null,\n          sort_order: i + 1,\n        }));\n        const { error: sessErr } = await supabase.from(\"event_sessions\" as any).insert(sessionsToInsert);\n        if (sessErr) throw sessErr;\n      }\n\n      if (data.event_type === \"multi_day\") {\n        const validSubs = data.sub_events.filter(s => s.name && s.date);\n        for (const s of validSubs) {\n          await createSubEventInTour({\n            parentId,\n            parentStatus: data.status,\n            parentEventNature: data.event_nature as EventNature,\n            sub: s,\n            venuesMap,\n            citiesMap,\n          });\n        }\n      }\n    },\n    onSuccess: async () => {"
      }
    }
  ],
  "eventos.pago-por-socio": [
    {
      "antigo": "Quando um sócio/parceiro paga uma despesa diretamente do seu bolso (sem usar contas da empresa), utilize o toggle '🤝 Pago por Sócio' no formulário de transação. O toggle aparece automaticamente quando o evento selecionado tem sócios.",
      "novo": "Para registar uma despesa paga por um sócio/parceiro, associe-a ao sócio no modal de pagamento ou no painel 'Despesas Pagas por Sócios' do evento.",
      "prova": {
        "ficheiro": "src/components/TransactionFormModal.tsx",
        "trecho": "  // \"Pago por Sócio\" NÃO existe no lançamento (decisão de produto): o vínculo a sócio\n  // nasce na liquidação (modal de pagamento) ou no painel \"Despesas Pagas por Sócios\".\n  // Constantes inertes mantidas para as condições de UI/estado a jusante.\n  const isPaidByPartner = false as boolean;"
      }
    },
    {
      "antigo": "Ao ativar:",
      "novo": "Na liquidação por sócio:",
      "prova": {
        "ficheiro": "src/components/TransactionPaymentModal.tsx",
        "trecho": "      // ===== Fluxo \"Pago pelo Sócio\" =====\n      if (partnerMode) {\n        if (!isExpense) throw new Error(\"Só despesas podem ser pagas por um sócio.\");\n        if (!partnerEventId) throw new Error(\"A transação não está associada a um evento com sócios.\");\n        if (!partnerId) throw new Error(\"Selecione o sócio que pagou.\");\n        if (existingPartnerLink) throw new Error(\"Esta transação já tem um vínculo a sócio.\");"
      }
    },
    {
      "antigo": "O campo 'Conta Destino' desaparece (não há movimentação em contas da empresa)",
      "novo": "A liquidação por sócio fica sem conta financeira da empresa",
      "prova": {
        "ficheiro": "src/components/TransactionPaymentModal.tsx",
        "trecho": "        if (canApprovePartnerPaid) {\n          const { error: txError } = await supabase\n            .from(\"transactions\")\n            .update({\n              status: \"paid\",\n              paid_amount: amount,\n              payment_date: partnerPaidDateStr,\n              account_id: null,\n            })\n            .eq(\"id\", transaction.id);\n          if (txError) throw txError;"
      }
    },
    {
      "antigo": "Aparece o seletor 'Sócio que pagou' para indicar qual parceiro pagou",
      "novo": "Selecione o sócio que pagou",
      "prova": {
        "ficheiro": "src/components/TransactionPaymentModal.tsx",
        "trecho": "      if (partnerMode) {\n        if (!isExpense) throw new Error(\"Só despesas podem ser pagas por um sócio.\");\n        if (!partnerEventId) throw new Error(\"A transação não está associada a um evento com sócios.\");\n        if (!partnerId) throw new Error(\"Selecione o sócio que pagou.\");\n        if (existingPartnerLink) throw new Error(\"Esta transação já tem um vínculo a sócio.\");"
      }
    },
    {
      "antigo": "A despesa é criada normalmente e segue o ciclo de aprovação padrão (Aguardando → Aprovada → Paga)",
      "novo": "O vínculo pode ficar aprovado ou pendente de aprovação; quando aprovado, a transação é marcada como paga",
      "prova": {
        "ficheiro": "src/components/TransactionPaymentModal.tsx",
        "trecho": "        const status = canApprovePartnerPaid ? \"approved\" : \"pending_approval\";\n        const { error: linkError } = await (supabase as any).from(\"partner_paid_expenses\").insert({\n          transaction_id: transaction.id,\n          partner_id: partnerId,\n          event_id: partnerEventId,\n          paid_date: partnerPaidDateStr,\n          status,\n          proposed_by: user?.id ?? null,\n          approved_by: canApprovePartnerPaid ? user?.id ?? null : null,\n          approved_at: canApprovePartnerPaid ? new Date().toISOString() : null,\n        });\n        if (linkError) throw linkError;\n\n        if (canApprovePartnerPaid) {\n          const { error: txError } = await supabase\n            .from(\"transactions\")\n            .update({\n              status: \"paid\",\n              paid_amount: amount,\n              payment_date: partnerPaidDateStr,\n              account_id: null,\n            })\n            .eq(\"id\", transaction.id);\n          if (txError) throw txError;"
      }
    }
  ],
  "transacoes.pago-por-socio": [
    {
      "antigo": "Para despesas pagas diretamente por um sócio/parceiro, active o toggle '🤝 Pago por Sócio' no formulário.",
      "novo": "O registo de um valor pago por sócio faz-se no modal de pagamento ou no painel 'Despesas Pagas por Sócios' do evento.",
      "prova": {
        "ficheiro": "src/components/TransactionFormModal.tsx",
        "trecho": "  // \"Pago por Sócio\" NÃO existe no lançamento (decisão de produto): o vínculo a sócio\n  // nasce na liquidação (modal de pagamento) ou no painel \"Despesas Pagas por Sócios\".\n  // Constantes inertes mantidas para as condições de UI/estado a jusante.\n  const isPaidByPartner = false as boolean;"
      }
    },
    {
      "antigo": "A despesa segue o ciclo normal de aprovação e fica vinculada ao sócio para efeitos de encontro de contas.",
      "novo": "O vínculo pode ser aprovado ou ficar pendente de aprovação; quando aprovado, a despesa fica paga e vinculada ao sócio para efeitos de encontro de contas.",
      "prova": {
        "ficheiro": "src/components/TransactionPaymentModal.tsx",
        "trecho": "        const status = canApprovePartnerPaid ? \"approved\" : \"pending_approval\";\n        const { error: linkError } = await (supabase as any).from(\"partner_paid_expenses\").insert({\n          transaction_id: transaction.id,\n          partner_id: partnerId,\n          event_id: partnerEventId,\n          paid_date: partnerPaidDateStr,\n          status,\n          proposed_by: user?.id ?? null,\n          approved_by: canApprovePartnerPaid ? user?.id ?? null : null,\n          approved_at: canApprovePartnerPaid ? new Date().toISOString() : null,\n        });\n        if (linkError) throw linkError;\n\n        if (canApprovePartnerPaid) {\n          const { error: txError } = await supabase\n            .from(\"transactions\")\n            .update({\n              status: \"paid\",\n              paid_amount: amount,\n              payment_date: partnerPaidDateStr,\n              account_id: null,\n            })\n            .eq(\"id\", transaction.id);\n          if (txError) throw txError;"
      }
    }
  ],
  "cotacoes.fluxo": [
    {
      "antigo": "Solicite cotações a fornecedores para serviços de eventos. Compare propostas lado a lado.",
      "novo": "Registe cotações de fornecedores para serviços de eventos.",
      "prova": {
        "ficheiro": "src/pages/Quotations.tsx",
        "trecho": "  const createMutation = useMutation({\n    mutationFn: async (q: {\n      event_id: string; supplier_id: string; description: string;\n      amount: number; iva_rate: number; valid_until?: string; notes?: string;\n    }) => {\n      const { error } = await supabase.from(\"quotations\").insert(q);\n      if (error) throw error;\n    },"
      }
    },
    {
      "antigo": "Ao aprovar uma cotação, pode convertê-la diretamente numa transação no BP do evento.",
      "novo": "Ao aprovar uma cotação, o sistema cria automaticamente uma transação de despesa em estado pendente, associada ao evento, sem criar uma linha no BP.",
      "prova": {
        "ficheiro": "src/pages/Quotations.tsx",
        "trecho": "      if (status === \"approved\") {\n        const quotation = quotations.find((q) => q.id === id);\n        if (quotation) {\n          const { error: txError } = await supabase.from(\"transactions\").insert({\n            event_id: quotation.event_id,\n            supplier_id: quotation.supplier_id,\n            description: quotation.description,\n            amount: quotation.amount,\n            iva_rate: quotation.iva_rate,\n            type: \"expense\",\n            date: new Date().toISOString().split(\"T\")[0],\n            status: \"pending\",\n          });\n          if (txError) throw txError;\n        }\n      }\n    },\n    onSuccess: (_, { status }) => {\n      queryClient.invalidateQueries({ queryKey: [\"quotations\"] });\n      queryClient.invalidateQueries({ queryKey: [\"transactions\"] });"
      }
    }
  ],
  "recorrentes.configurar": [
    {
      "antigo": "Crie modelos de transações que se repetem periodicamente (rendas, seguros, serviços mensais).",
      "novo": "Crie modelos de transações periódicas (rendas, seguros, serviços mensais), definindo frequência, dia do mês, início e fim opcional.",
      "prova": {
        "ficheiro": "src/pages/RecurringTransactions.tsx",
        "trecho": "      const startDate = `${sy}-${String(sm).padStart(2, \"0\")}-${String(startDay).padStart(2, \"0\")}`;\n\n      const payload: any = {\n        description: form.description,\n        type: form.type,\n        amount: Number(form.amount),\n        iva_rate: noIva ? 0 : form.iva_rate,\n        category_id: form.category_id || null,\n        event_id: form.event_id || null,\n        supplier_id: form.supplier_id || null,\n        account_id: form.account_id || null,\n        specification: form.specification || null,\n        frequency: form.frequency,\n        day_of_month: form.day_of_month,\n        start_date: startDate,\n        end_date: computeEndDate(),\n        created_by: user?.email ?? \"system\",\n      };"
      }
    },
    {
      "antigo": "Defina a frequência, dia do mês, data de início e fim.",
      "novo": "Sem data de fim, este fluxo não gera transações.",
      "prova": {
        "ficheiro": "src/pages/RecurringTransactions.tsx",
        "trecho": "  // Generate all transactions for the entire recurrence period\n  const generateAllTransactions = async (rec: {\n    description: string; type: string; amount: number; iva_rate: number;\n    category_id: string | null; event_id: string | null; supplier_id: string | null;\n    account_id: string | null; specification: string | null;\n    frequency: string; day_of_month: number; start_date: string; end_date: string | null;\n    id: string;\n  }) => {\n    if (!rec.end_date) return 0;"
      }
    },
    {
      "antigo": "O sistema gera automaticamente as transações na data definida.",
      "novo": "Ao criar um modelo com data de fim, o sistema tenta gerar de imediato as transações de todo o período; editar o modelo não volta a gerar as transações.",
      "prova": {
        "ficheiro": "src/pages/RecurringTransactions.tsx",
        "trecho": "      if (editId) {\n        const { error } = await supabase.from(\"recurring_transactions\").update(payload).eq(\"id\", editId);\n        if (error) throw error;\n      } else {\n        const { data, error } = await supabase.from(\"recurring_transactions\").insert(payload).select(\"id\").single();\n        if (error) throw error;\n        recId = data.id;\n\n        // Auto-generate transactions on creation\n        try {\n          const count = await generateAllTransactions({\n            ...payload,\n            id: recId!,\n          });\n          if (count > 0) {\n            toast.success(`${count} transação(ões) gerada(s) automaticamente`);\n          } else {\n            toast.warning(\"Template criado, mas nenhuma transação gerada. Verifique as datas.\");\n          }\n        } catch (genErr: any) {\n          console.error(\"Erro ao gerar transações:\", genErr);\n          toast.error(`Template criado, mas erro ao gerar transações: ${genErr.message || \"desconhecido\"}`);\n        }\n      }\n    },"
      }
    }
  ]
};

function applyRevisions(content: string, anchor: string): string {
  return (revisions[anchor] ?? []).reduce((revised, { antigo, novo }) => revised.replace(antigo, novo), content);
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

  it("T5/C4: liga os quatro h1 com reserva e valida os tooltips com as revisões do T2", () => {
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
        const content = applyRevisions(group.topics[index].content, section.anchor_id);
        const firstSentence = content.match(/^.*?[.!?](?=\s|$)/)?.[0];
        expect(firstSentence, section.anchor_id).toBeDefined();
        expect(section.tooltip, section.anchor_id).toBe(firstSentence);
      }
    }
  });
});
