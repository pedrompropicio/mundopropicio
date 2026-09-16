// Origem do conteúdo do Manual de Orientação: os próprios ficheiros
// docs/manual/*.md, carregados em bruto pelo Vite e passados pelo parser.
import { parseHelpArticle, type ParsedArticle } from "./help-manual-parser";

const files = import.meta.glob("/docs/manual/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function loadManualArticles(): ParsedArticle[] {
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, raw]) => parseHelpArticle(raw, path.split("/").pop() ?? path));
}

export function manualFileCount(): number {
  return Object.keys(files).length;
}
