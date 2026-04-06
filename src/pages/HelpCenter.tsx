import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, BookOpen } from "lucide-react";
import * as Icons from "lucide-react";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import helpManual, { type HelpSection } from "@/lib/help-manual";

function SectionIcon({ name }: { name: string }) {
  const Icon = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!Icon) return null;
  return <Icon className="h-5 w-5 text-primary shrink-0" />;
}

export default function HelpCenter() {
  const [searchParams] = useSearchParams();
  const sectionFromUrl = searchParams.get("s") || "";
  const [search, setSearch] = useState("");

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

  const defaultOpen = sectionFromUrl
    ? [sectionFromUrl]
    : filtered.length === 1
    ? [filtered[0].id]
    : [];

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
        <Accordion type="multiple" defaultValue={defaultOpen} className="space-y-2">
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
                  {section.topics.map((topic, idx) => (
                    <div key={idx} className="space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">{topic.title}</h3>
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
