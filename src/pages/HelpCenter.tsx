import { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, BookOpen, Sparkles, Loader2, ArrowRight, ChevronRight, Archive } from "lucide-react";
import * as Icons from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import helpManual from "@/lib/help-manual";
import HelpMarkdown from "@/components/help/HelpMarkdown";
import QueryErrorState from "@/components/QueryErrorState";
import { helpModuleLabel, useHelpArticle, useHelpArticles } from "@/hooks/useHelpManual";

interface AiTopicHit {
  sectionId: string;
  topicIndex: number;
  sectionTitle: string;
  topicTitle: string;
}

interface AiResult {
  answer: string;
  hits: AiTopicHit[];
  confidence: "alta" | "media" | "baixa";
}

import imgEventLifecycle from "@/assets/help/event-lifecycle.jpg";
import imgTransactionLifecycle from "@/assets/help/transaction-lifecycle.jpg";
import imgBpWorkflow from "@/assets/help/bp-workflow.jpg";
import imgUserRoles from "@/assets/help/user-roles.jpg";
import imgAccountsFlow from "@/assets/help/accounts-flow.jpg";

const sectionImages: Record<string, string> = {
  "event-lifecycle": imgEventLifecycle,
  "transaction-lifecycle": imgTransactionLifecycle,
  "bp-workflow": imgBpWorkflow,
  "user-roles": imgUserRoles,
  "accounts-flow": imgAccountsFlow,
};

function SectionIcon({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!Icon || typeof Icon !== "function") return null;
  return <Icon className="h-5 w-5 text-primary shrink-0" />;
}

export default function HelpCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = searchParams.get("s") || "";
  const articleFromUrl = searchParams.get("artigo") || "";
  const [search, setSearch] = useState("");

  // --- Manual novo (base de dados) ---
  const articlesQ = useHelpArticles();
  const articles = articlesQ.data ?? [];
  const activeSlug = articleFromUrl || (!sectionFromUrl ? articles[0]?.slug ?? "" : "");
  const articleQ = useHelpArticle(activeSlug || null);
  const article = articleQ.data ?? null;
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const groupedArticles = useMemo(() => {
    const map = new Map<string, typeof articles>();
    for (const a of articles) {
      const key = a.module ?? "outros";
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [articles]);

  // Tópicos do manual antigo que ainda não têm capítulo novo (por slug do artigo).
  const legacySections = useMemo(
    () => helpManual.filter((s) => !articles.some((a) => a.slug === s.id)),
    [articles],
  );

  function openArticle(slug: string, anchor?: string) {
    const next = new URLSearchParams(searchParams);
    next.delete("s");
    next.set("artigo", slug);
    setSearchParams(next, { replace: false });
    if (anchor) {
      setTimeout(() => scrollToAnchor(anchor), 250);
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function scrollToAnchor(anchor: string) {
    const el = sectionRefs.current[anchor];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-primary");
    setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
  }

  // Deep-link com âncora: /ajuda?artigo=<slug>#<anchor_id>
  useEffect(() => {
    if (!article) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const t = setTimeout(() => scrollToAnchor(hash), 300);
    return () => clearTimeout(t);
  }, [article]);

  // --- Pesquisa inteligente (AI) ---
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const topicRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const filtered = useMemo(() => {
    if (!search.trim()) return legacySections;
    const q = search.toLowerCase();
    return legacySections
      .map((section) => ({
        ...section,
        topics: section.topics.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.content.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.topics.length > 0);
  }, [search, legacySections]);

  const [openSections, setOpenSections] = useState<string[]>(() => {
    if (sectionFromUrl) return [sectionFromUrl];
    return [];
  });

  // Quando muda a pesquisa textual e fica só uma secção, abre-a
  useEffect(() => {
    if (search.trim() && filtered.length === 1) {
      setOpenSections((prev) =>
        prev.includes(filtered[0].id) ? prev : [...prev, filtered[0].id],
      );
    }
  }, [search, filtered]);

  async function handleAiSearch() {
    const q = aiQuestion.trim();
    if (q.length < 5) {
      toast.error("Descreva a sua dúvida com um pouco mais de detalhe.");
      return;
    }
    setAiLoading(true);
    setAiResult(null);
    try {
      const topicsIndex = helpManual.flatMap((s) =>
        s.topics.map((t, idx) => ({
          id: `${s.id}::${idx}`,
          section: s.title,
          title: t.title,
          excerpt: t.content.replace(/\s+/g, " ").slice(0, 200),
        })),
      );

      const { data, error } = await supabase.functions.invoke("help-search", {
        body: { question: q, topics: topicsIndex },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const hits: AiTopicHit[] = (data?.relevantTopicIds || [])
        .map((id: string) => {
          const [sectionId, idxStr] = id.split("::");
          const idx = parseInt(idxStr, 10);
          const section = helpManual.find((s) => s.id === sectionId);
          const topic = section?.topics[idx];
          if (!section || !topic) return null;
          return {
            sectionId,
            topicIndex: idx,
            sectionTitle: section.title,
            topicTitle: topic.title,
          };
        })
        .filter(Boolean) as AiTopicHit[];

      setAiResult({
        answer: data.answer || "Sem resposta.",
        hits,
        confidence: data.confidence || "media",
      });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Erro ao pesquisar.";
      toast.error(msg);
    } finally {
      setAiLoading(false);
    }
  }

  function scrollToTopic(hit: AiTopicHit) {
    const key = `${hit.sectionId}::${hit.topicIndex}`;
    // Garantir que a secção está aberta
    setOpenSections((prev) =>
      prev.includes(hit.sectionId) ? prev : [...prev, hit.sectionId],
    );
    // Limpar pesquisa textual para não esconder a secção
    if (search.trim()) setSearch("");
    // Aguardar render do conteúdo do accordion antes de fazer scroll
    setTimeout(() => {
      const el = topicRefs.current[key];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
      }
    }, 350);
  }

  const indexPanel = (
    <nav className="space-y-4">
      {articlesQ.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar capítulos…
        </p>
      )}
      {articlesQ.isError && (
        <QueryErrorState
          error={articlesQ.error}
          context="Manual — índice de capítulos"
          onRetry={() => articlesQ.refetch()}
        />
      )}
      {!articlesQ.isLoading && !articlesQ.isError && articles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ainda não há capítulos sincronizados. Use o manual antigo, em baixo.
        </p>
      )}

      {groupedArticles.map(([module, list]) => (
        <div key={module} className="space-y-1">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {helpModuleLabel(module)}
          </p>
          {list.map((a) => (
            <button
              key={a.slug}
              type="button"
              onClick={() => openArticle(a.slug)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                a.slug === activeSlug
                  ? "bg-primary/10 font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="truncate">{a.title}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </button>
          ))}
        </div>
      ))}

      {legacySections.length > 0 && (
        <div className="space-y-1 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Archive className="h-3 w-3" /> Manual antigo
          </p>
          {legacySections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("artigo");
                next.set("s", s.id);
                setSearchParams(next, { replace: false });
                setOpenSections((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]));
                setTimeout(() => {
                  document.getElementById("manual-antigo")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 100);
              }}
              className="w-full truncate rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
    </nav>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          Manual de Orientação
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consulte orientações detalhadas sobre todos os módulos e funcionalidades do sistema.
        </p>
      </div>

      {/* Pesquisa inteligente */}
      <Card className="p-4 space-y-3 border-primary/30 bg-primary/5 max-w-3xl">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Pesquisa inteligente</h2>
          <Badge variant="secondary" className="text-[10px]">AI</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Descreva o problema ou dúvida em linguagem natural. A AI lê o manual e devolve a orientação certa.
        </p>
        <Textarea
          placeholder="Ex: Lancei uma despesa de táxi em Lisboa mas a categoria só existe no BP da turnê. O que fazer?"
          value={aiQuestion}
          onChange={(e) => setAiQuestion(e.target.value)}
          rows={3}
          className="resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAiSearch();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            Dica: Ctrl/⌘ + Enter para enviar
          </span>
          <Button
            onClick={handleAiSearch}
            disabled={aiLoading || aiQuestion.trim().length < 5}
            size="sm"
          >
            {aiLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                A pesquisar…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Obter orientação
              </>
            )}
          </Button>
        </div>

        {aiResult && (
          <div className="space-y-3 pt-2 border-t border-primary/20">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                  {aiResult.answer}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Confiança:
                  </span>
                  <Badge
                    variant={
                      aiResult.confidence === "alta"
                        ? "default"
                        : aiResult.confidence === "media"
                        ? "secondary"
                        : "outline"
                    }
                    className="text-[10px] capitalize"
                  >
                    {aiResult.confidence}
                  </Badge>
                </div>
              </div>
            </div>

            {aiResult.hits.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">
                  Tópicos relacionados:
                </p>
                <div className="space-y-1">
                  {aiResult.hits.map((hit) => (
                    <button
                      key={`${hit.sectionId}::${hit.topicIndex}`}
                      onClick={() => scrollToTopic(hit)}
                      className="w-full text-left flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-card hover:bg-accent text-xs transition-colors border border-border"
                    >
                      <span className="flex-1">
                        <span className="text-muted-foreground">
                          {hit.sectionTitle} ›{" "}
                        </span>
                        <span className="font-medium text-foreground">
                          {hit.topicTitle}
                        </span>
                      </span>
                      <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Índice (mobile: seletor no topo) */}
      <div className="lg:hidden space-y-3">
        {articles.length > 0 && (
          <Select value={activeSlug} onValueChange={(v) => openArticle(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Escolher capítulo" />
            </SelectTrigger>
            <SelectContent>
              {articles.map((a) => (
                <SelectItem key={a.slug} value={a.slug}>
                  {a.title} · {helpModuleLabel(a.module)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Índice (desktop) */}
        <aside className="hidden w-64 shrink-0 lg:block lg:sticky lg:top-24">{indexPanel}</aside>

        {/* Artigo */}
        <div className="min-w-0 flex-1 space-y-6">
          {articleQ.isError && (
            <QueryErrorState
              error={articleQ.error}
              context="Manual — artigo"
              onRetry={() => articleQ.refetch()}
            />
          )}
          {activeSlug && articleQ.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar o capítulo…
            </p>
          )}
          {activeSlug && !articleQ.isLoading && !articleQ.isError && !article && (
            <p className="text-sm text-muted-foreground">
              Capítulo não encontrado no manual.
            </p>
          )}

          {article && (
            <article className="space-y-6">
              <header className="space-y-2">
                <h2 className="text-xl font-bold text-foreground">{article.title}</h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  {article.updated_on && (
                    <Badge variant="secondary" className="text-[10px]">
                      Atualizado {article.updated_on}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {helpModuleLabel(article.module)}
                  </Badge>
                  {article.sources.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px] font-normal text-muted-foreground">
                      {s}
                    </Badge>
                  ))}
                </div>
              </header>

              {article.sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este capítulo ainda não tem secções.</p>
              ) : (
                article.sections.map((s) => (
                  <div
                    key={s.anchor_id}
                    id={s.anchor_id}
                    ref={(el) => {
                      sectionRefs.current[s.anchor_id] = el;
                    }}
                    className="scroll-mt-24 space-y-3 rounded-lg border border-border bg-card p-4 transition-all"
                  >
                    <h3 className="text-base font-semibold text-foreground">{s.heading}</h3>
                    <HelpMarkdown>{s.body_md}</HelpMarkdown>
                    {s.sources.length > 0 && (
                      <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
                        Fontes: {s.sources.join(", ")}
                      </p>
                    )}
                  </div>
                ))
              )}
            </article>
          )}

          {/* Manual antigo */}
          {legacySections.length > 0 && (
            <section id="manual-antigo" className="space-y-4 border-t border-border pt-6">
              <div className="flex items-center gap-2">
                <Archive className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Manual antigo</h2>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar no manual antigo…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum resultado encontrado para "{search}".
                </p>
              ) : (
                <Accordion
                  type="multiple"
                  value={openSections}
                  onValueChange={setOpenSections}
                  className="space-y-2"
                >
                  {filtered.map((section) => (
                    <AccordionItem
                      key={section.id}
                      value={section.id}
                      className="border rounded-lg px-4 bg-card"
                    >
                      <AccordionTrigger className="hover:no-underline gap-3">
                        <span className="flex items-center gap-3 text-left">
                          <SectionIcon name={section.icon} />
                          <span className="font-semibold">{section.title}</span>
                          <span className="text-xs text-muted-foreground font-normal">
                            ({section.topics.length} {section.topics.length === 1 ? "tópico" : "tópicos"})
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-1">
                          {section.image && sectionImages[section.image] && (
                            <img
                              src={sectionImages[section.image]}
                              alt={`Diagrama: ${section.title}`}
                              loading="lazy"
                              className="w-full rounded-lg border border-border"
                            />
                          )}
                          {section.topics.map((topic, idx) => (
                            <div
                              key={idx}
                              ref={(el) => {
                                topicRefs.current[`${section.id}::${idx}`] = el;
                              }}
                              className="space-y-2 rounded-md transition-all p-2 -m-2"
                            >
                              <h3 className="text-sm font-semibold text-foreground">{topic.title}</h3>
                              {topic.image && sectionImages[topic.image] && (
                                <img
                                  src={sectionImages[topic.image]}
                                  alt={`Diagrama: ${topic.title}`}
                                  loading="lazy"
                                  className="w-full rounded-lg border border-border"
                                />
                              )}
                              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                {topic.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
