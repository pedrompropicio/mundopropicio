import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Leitura do Manual de Orientação a partir da base (fase 3).
 *
 * O conteúdo NÃO vive no código: a fonte são os ficheiros `docs/manual/*.md`,
 * levados à base pela edge function `manual-sync` (botão "Sincronizar manual"
 * no Admin). Estes hooks só leem — nada aqui escreve.
 */

export interface HelpArticleListItem {
  id: string;
  slug: string;
  title: string;
  module: string | null;
  routes: string[];
  updated_on: string | null;
  sources: string[];
}

export interface HelpSectionRow {
  id: string;
  anchor_id: string;
  heading: string;
  position: number;
  tooltip: string | null;
  body_md: string;
  sources: string[];
  profiles: string[];
}

export interface HelpArticleFull extends HelpArticleListItem {
  sections: HelpSectionRow[];
}

/** Rótulos por módulo. Novos módulos caem no próprio identificador. */
export const HELP_MODULE_LABELS: Record<string, string> = {
  erp: "MP Gestão (ERP)",
  crm: "MP CRM",
  operacao: "MP Operação",
  audience: "MP Audience",
};

export function helpModuleLabel(module: string | null | undefined): string {
  if (!module) return "Outros";
  return HELP_MODULE_LABELS[module] ?? module;
}

const ONE_HOUR = 60 * 60 * 1000;

/** Lista de artigos para o índice e para o casamento por rota. */
export function useHelpArticles() {
  return useQuery({
    queryKey: ["help-articles"],
    staleTime: ONE_HOUR,
    gcTime: ONE_HOUR,
    queryFn: async (): Promise<HelpArticleListItem[]> => {
      const { data, error } = await supabase
        .from("help_articles")
        .select("id, slug, title, module, routes, updated_on, sources")
        .order("module", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        module: a.module,
        routes: a.routes ?? [],
        updated_on: a.updated_on,
        sources: a.sources ?? [],
      }));
    },
  });
}

/** Um artigo com as secções ordenadas por `position`. */
export function useHelpArticle(slug: string | null | undefined) {
  return useQuery({
    queryKey: ["help-article", slug],
    enabled: !!slug,
    staleTime: ONE_HOUR,
    gcTime: ONE_HOUR,
    queryFn: async (): Promise<HelpArticleFull | null> => {
      const { data: article, error } = await supabase
        .from("help_articles")
        .select("id, slug, title, module, routes, updated_on, sources")
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw error;
      if (!article) return null;

      const { data: sections, error: secErr } = await supabase
        .from("help_sections")
        .select("id, anchor_id, heading, position, tooltip, body_md, sources, profiles")
        .eq("article_id", article.id)
        .order("position", { ascending: true });
      if (secErr) throw secErr;

      return {
        id: article.id,
        slug: article.slug,
        title: article.title,
        module: article.module,
        routes: article.routes ?? [],
        updated_on: article.updated_on,
        sources: article.sources ?? [],
        sections: (sections ?? []).map((s) => ({
          id: s.id,
          anchor_id: s.anchor_id,
          heading: s.heading,
          position: s.position,
          tooltip: s.tooltip,
          body_md: s.body_md ?? "",
          sources: s.sources ?? [],
          profiles: s.profiles ?? [],
        })),
      };
    },
  });
}

export interface HelpAnchorInfo {
  anchor_id: string;
  heading: string;
  tooltip: string | null;
  article_slug: string;
  article_title: string;
}

/**
 * Uma âncora (para os tooltips). Cache longa: o manual muda por sync manual,
 * não durante a sessão.
 */
export function useHelpAnchor(anchor: string | null | undefined) {
  return useQuery({
    queryKey: ["help-anchor", anchor],
    enabled: !!anchor,
    staleTime: ONE_HOUR,
    gcTime: ONE_HOUR,
    retry: 1,
    queryFn: async (): Promise<HelpAnchorInfo | null> => {
      const { data, error } = await supabase
        .from("help_sections")
        .select("anchor_id, heading, tooltip, help_articles!help_sections_article_id_fkey(slug, title)")
        .eq("anchor_id", anchor!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const art = (data as unknown as { help_articles: { slug: string; title: string } | null }).help_articles;
      return {
        anchor_id: data.anchor_id,
        heading: data.heading,
        tooltip: data.tooltip,
        article_slug: art?.slug ?? "",
        article_title: art?.title ?? "",
      };
    },
  });
}

/**
 * Casa a rota atual com `help_articles.routes` por prefixo:
 * `/eventos/:id` cobre `/eventos/<qualquer>`. Ganha o padrão mais específico.
 */
export function matchArticleForRoute(
  articles: HelpArticleListItem[],
  pathname: string,
): HelpArticleListItem | null {
  let best: { article: HelpArticleListItem; score: number } | null = null;
  for (const article of articles) {
    for (const route of article.routes) {
      const base = route.split("/:")[0].replace(/\/$/, "");
      if (!base) continue;
      if (pathname === base || pathname.startsWith(base + "/")) {
        const score = base.length;
        if (!best || score > best.score) best = { article, score };
      }
    }
  }
  return best?.article ?? null;
}
