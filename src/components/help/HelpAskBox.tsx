import { useState, type ReactNode } from "react";
import { Loader2, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import QueryErrorState from "@/components/QueryErrorState";
import { useAuth } from "@/contexts/AuthContext";

export interface HelpCitation {
  n: number;
  anchor_id: string;
  article_slug: string;
  heading: string;
}

interface HelpAnswer {
  answered: boolean;
  answer: string;
  citations: HelpCitation[];
  confidence: "alta" | "media" | "baixa";
}

function answerWithCitationButtons(answer: string, citations: HelpCitation[], onOpen: (citation: HelpCitation) => void) {
  const citationByNumber = new Map(citations.map((citation) => [citation.n, citation]));
  return answer.split(/(\[\d+\])/g).map((part, index): ReactNode => {
    const match = part.match(/^\[(\d+)\]$/);
    const citation = match ? citationByNumber.get(Number(match[1])) : undefined;
    if (!citation) return part;
    return <button key={`${part}-${index}`} type="button" onClick={() => onOpen(citation)} className="mx-0.5 inline-flex rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{part}</button>;
  });
}

export default function HelpAskBox({ route, onOpenCitation, compact = false, showLegacyNote = false }: {
  route: string;
  onOpenCitation: (citation: HelpCitation) => void;
  compact?: boolean;
  showLegacyNote?: boolean;
}) {
  const { isAdmin } = useAuth();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [result, setResult] = useState<HelpAnswer | null>(null);

  const submit = async () => {
    if (question.trim().length < 5) return;
    setLoading(true); setError(null); setUnavailable(null); setResult(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("help-search", { body: { question: question.trim(), route } });
      if (invokeError) throw invokeError;
      // A função devolve 200 com error='search_unavailable' quando a pesquisa
      // ou o gateway AI falham: mostramos aviso e o detalhe só a admin.
      if (data?.error === "search_unavailable") {
        setUnavailable(typeof data.detail === "string" ? data.detail : "sem detalhe");
        return;
      }
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      setResult(data as HelpAnswer);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className={`space-y-3 border-primary/30 bg-primary/5 ${compact ? "p-3" : "max-w-3xl p-4"}`}>
      <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-semibold">Pergunte ao manual</h2><Badge variant="secondary" className="text-[10px]">AI</Badge></div>
      {showLegacyNote && <p className="text-xs text-muted-foreground">A pesquisa cobre os capítulos novos; o manual antigo consulta-se no índice.</p>}
      <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={compact ? 2 : 3} className="resize-none" placeholder="Descreva a sua dúvida…" onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void submit(); } }} />
      <div className="flex justify-end"><Button size="sm" disabled={loading || question.trim().length < 5} onClick={() => void submit()}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A pesquisar…</> : "Perguntar"}</Button></div>
      {error && <QueryErrorState title="Não foi possível pesquisar o manual" error={error} onRetry={() => void submit()} context="Manual — pergunta" />}
      {unavailable && (
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium">A pesquisa está indisponível</p>
          <p className="text-xs text-muted-foreground">Tente novamente dentro de alguns minutos. O manual continua disponível no índice.</p>
          {isAdmin && <p className="break-words font-mono text-[11px] text-muted-foreground">{unavailable}</p>}
          <Button size="sm" variant="outline" onClick={() => void submit()}>Tentar de novo</Button>
        </div>
      )}
      {result && !result.answered && <div className="rounded-lg border border-border bg-card p-3 text-sm">Não encontrei isto no manual. A pergunta ficou registada para o manual ser completado.</div>}
      {result?.answered && (
        <div className="space-y-3 border-t border-primary/20 pt-3">
          <p className="whitespace-pre-line text-sm leading-relaxed">{answerWithCitationButtons(result.answer, result.citations, onOpenCitation)}</p>
          <Badge variant={result.confidence === "alta" ? "default" : result.confidence === "media" ? "secondary" : "outline"}>Confiança: {result.confidence}</Badge>
          <div className="space-y-1"><p className="text-xs font-medium">Citações</p>{result.citations.map((citation) => <button key={`${citation.n}-${citation.anchor_id}`} type="button" onClick={() => onOpenCitation(citation)} className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-xs hover:bg-accent"><span>[{citation.n}] {citation.article_slug} › {citation.heading} — Abrir</span><ArrowRight className="h-3 w-3 text-primary" /></button>)}</div>
        </div>
      )}
    </Card>
  );
}