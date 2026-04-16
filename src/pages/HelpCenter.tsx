import { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, BookOpen, Sparkles, Loader2, ArrowRight } from "lucide-react";
import * as Icons from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import helpManual from "@/lib/help-manual";

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
  const [searchParams] = useSearchParams();
  const sectionFromUrl = searchParams.get("s") || "";
  const [search, setSearch] = useState("");

  // --- Pesquisa inteligente (AI) ---
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const topicRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const filtered = useMemo(() => {
    if (!search.trim()) return helpManual;
    const q = search.toLowerCase();
    return helpManual
      .map((section) => ({
        ...section,
        topics: section.topics.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.content.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.topics.length > 0);
  }, [search]);

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

  return (
    <div className="space-y-6 max-w-3xl">
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
      <Card className="p-4 space-y-3 border-primary/30 bg-primary/5">
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar no manual…"
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
    </div>
  );
}
