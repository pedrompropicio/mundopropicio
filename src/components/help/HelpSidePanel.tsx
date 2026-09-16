import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import QueryErrorState from "@/components/QueryErrorState";
import HelpMarkdown from "@/components/help/HelpMarkdown";
import { useHelpPanel } from "@/contexts/HelpPanelContext";
import {
  helpModuleLabel,
  matchArticleForRoute,
  useHelpArticle,
  useHelpArticles,
} from "@/hooks/useHelpManual";

/**
 * Painel lateral do Manual de Orientação — montado uma vez no layout.
 * Só lê da base; o conteúdo vem de `docs/manual/*.md` via `manual-sync`.
 */
export default function HelpSidePanel() {
  const { open, setOpen, slug: requestedSlug, anchor, openHelp } = useHelpPanel();
  const location = useLocation();
  const articlesQ = useHelpArticles();
  const articles = articlesQ.data ?? [];

  // Sem slug pedido: artigo da rota atual; com âncora: o artigo dessa âncora
  // resolve-se pelo prefixo do anchor_id (ex.: "rateios.master" → "rateios").
  const anchorSlug = anchor?.includes(".") ? anchor.split(".")[0] : null;
  const routeArticle = useMemo(
    () => matchArticleForRoute(articles, location.pathname),
    [articles, location.pathname],
  );
  const slug = requestedSlug ?? anchorSlug ?? routeArticle?.slug ?? null;

  const articleQ = useHelpArticle(open ? slug : null);
  const article = articleQ.data ?? null;

  const [openSections, setOpenSections] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (anchor) setOpenSections([anchor]);
    else if (article?.sections.length) setOpenSections([article.sections[0].anchor_id]);
  }, [open, anchor, article]);

  useEffect(() => {
    if (!open || !anchor) return;
    const t = setTimeout(() => {
      document.getElementById(`help-panel-${anchor}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => clearTimeout(t);
  }, [open, anchor, article]);

  function toggle(id: string) {
    setOpenSections((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[420px]">
        <SheetHeader className="sticky top-0 z-10 border-b border-border bg-background px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary" />
            {article?.title ?? "Manual de Orientação"}
          </SheetTitle>
          {article && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {article.updated_on && (
                <Badge variant="secondary" className="text-[10px]">
                  Atualizado {article.updated_on}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {helpModuleLabel(article.module)}
              </Badge>
            </div>
          )}
        </SheetHeader>

        <div className="space-y-3 px-5 py-4">
          {articlesQ.isError && (
            <QueryErrorState
              error={articlesQ.error}
              context="Manual — lista de artigos"
              onRetry={() => articlesQ.refetch()}
            />
          )}

          {articleQ.isError && (
            <QueryErrorState
              error={articleQ.error}
              context="Manual — artigo no painel"
              onRetry={() => articleQ.refetch()}
            />
          )}

          {(articlesQ.isLoading || (slug && articleQ.isLoading)) && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar o manual…
            </p>
          )}

          {/* Sem artigo para a rota → índice */}
          {!articlesQ.isLoading && !articlesQ.isError && !slug && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Este ecrã ainda não tem capítulo próprio no manual. Escolha um capítulo:
              </p>
              {articles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  O manual ainda não tem capítulos sincronizados.
                </p>
              ) : (
                articles.map((a) => (
                  <button
                    key={a.slug}
                    type="button"
                    onClick={() => openHelp({ slug: a.slug })}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-medium text-foreground">{a.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{helpModuleLabel(a.module)}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {article && article.sections.length === 0 && (
            <p className="text-sm text-muted-foreground">Este capítulo ainda não tem secções.</p>
          )}

          {article?.sections.map((s) => {
            const isOpen = openSections.includes(s.anchor_id);
            const highlighted = anchor === s.anchor_id;
            return (
              <Collapsible key={s.anchor_id} open={isOpen} onOpenChange={() => toggle(s.anchor_id)}>
                <div
                  id={`help-panel-${s.anchor_id}`}
                  className={cn(
                    "rounded-lg border bg-card transition-colors",
                    highlighted ? "border-primary ring-1 ring-primary/50" : "border-border",
                  )}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                    <span className="text-sm font-semibold text-foreground">{s.heading}</span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 px-3 pb-3">
                    <HelpMarkdown>{s.body_md}</HelpMarkdown>
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <Link to={`/ajuda?artigo=${article.slug}#${s.anchor_id}`} onClick={() => setOpen(false)}>
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Abrir artigo completo
                      </Link>
                    </Button>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
