// Parser puro dos artigos-fonte do Manual de Orientação (docs/manual/*.md).
// Sem I/O: recebe texto, devolve estrutura pronta para a base (help_articles,
// help_sections, help_chunks). Ver docs/INDEX.md, secção "Manual de Orientação".

export interface ParsedSection {
  anchor_id: string;
  heading: string;
  position: number;
  tooltip: string | null;
  screens: string[];
  profiles: string[];
  sources: string[];
  body_md: string;
}

export interface ParsedArticle {
  slug: string;
  title: string;
  module: string;
  updated_on: string;
  profiles: string[];
  routes: string[];
  sources: string[];
  content_md: string;
  sections: ParsedSection[];
}

export interface HelpChunk {
  anchor_id: string;
  position: number;
  content: string;
}

export const CHUNK_TARGET_CHARS = 800;

const MARKDOWN_IMAGE_LINE = /^\s*!\[[^\]]*\]\([^\n)]+\)\s*$/gm;

function stripQuotes(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length > 1) ||
    (t.startsWith("'") && t.endsWith("'") && t.length > 1)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function parseList(v: string): string[] {
  const t = v.trim();
  if (!t.startsWith("[")) return t ? [stripQuotes(t)] : [];
  return t
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((s) => stripQuotes(s))
    .filter(Boolean);
}

/** Pares chave: valor de um bloco YAML simples (uma linha por chave). */
function parseKeyValues(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

export function parseHelpArticle(raw: string, fileLabel = "artigo"): ParsedArticle {
  const text = raw.replace(/\r\n/g, "\n");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fm) {
    throw new Error(`${fileLabel}: falta o frontmatter YAML no topo do ficheiro.`);
  }
  const meta = parseKeyValues(fm[1]);
  const body = text.slice(fm[0].length);

  const slug = stripQuotes(meta.capitulo ?? "");
  const title = stripQuotes(meta.titulo ?? "");
  const module = stripQuotes(meta.modulo ?? "");
  const updated_on = stripQuotes(meta.atualizado ?? "");
  if (!slug) throw new Error(`${fileLabel}: frontmatter sem "capitulo".`);
  if (!title) throw new Error(`${fileLabel}: frontmatter sem "titulo".`);
  if (!module) throw new Error(`${fileLabel}: frontmatter sem "modulo".`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated_on)) {
    throw new Error(`${fileLabel}: frontmatter sem "atualizado" no formato AAAA-MM-DD.`);
  }

  // Cortar por secções "## " (só no início de linha, fora de blocos de código).
  const lines = body.split("\n");
  const starts: number[] = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("```")) inFence = !inFence;
    if (!inFence && /^##\s+\S/.test(line)) starts.push(i);
  });
  if (starts.length === 0) {
    throw new Error(`${fileLabel}: nenhuma secção "## " encontrada.`);
  }

  const sections: ParsedSection[] = [];
  starts.forEach((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
    const heading = lines[start].replace(/^##\s+/, "").trim();
    const rest = lines.slice(start + 1, end).join("\n");

    const ajuda = rest.match(/^\s*```ajuda\n([\s\S]*?)\n```/);
    if (!ajuda) {
      throw new Error(
        `${fileLabel}: a secção "${heading}" não tem bloco \`\`\`ajuda logo depois do título.`,
      );
    }
    const a = parseKeyValues(ajuda[1]);
    const anchor_id = stripQuotes(a.id ?? "");
    if (!anchor_id) {
      throw new Error(`${fileLabel}: a secção "${heading}" tem bloco \`\`\`ajuda sem "id".`);
    }

    const body_md = rest
      .slice((ajuda.index ?? 0) + ajuda[0].length)
      .replace(/^\n+/, "")
      .replace(/\s+$/, "")
      // separador horizontal final do capítulo não é conteúdo
      .replace(/\n*-{3,}\s*$/, "")
      .trim();

    sections.push({
      anchor_id,
      heading,
      position: idx + 1,
      tooltip: a.tooltip ? stripQuotes(a.tooltip) : null,
      screens: parseList(a.ecras ?? ""),
      profiles: parseList(a.perfis ?? ""),
      sources: parseList(a.fontes ?? ""),
      body_md,
    });
  });

  return {
    slug,
    title,
    module,
    updated_on,
    profiles: parseList(meta.perfis ?? ""),
    routes: parseList(meta.rotas ?? ""),
    sources: parseList(meta.fontes ?? ""),
    content_md: text,
    sections,
  };
}

/** Parte o body_md de cada secção em pedaços de ~800 caracteres, sem cortar parágrafos. */
export function chunkArticle(article: ParsedArticle): HelpChunk[] {
  const chunks: HelpChunk[] = [];
  for (const section of article.sections) {
    const prefix = `${article.title} › ${section.heading}`;
    const searchableBody = section.body_md.replace(MARKDOWN_IMAGE_LINE, "").trim();
    const paragraphs = searchableBody
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const buckets: string[] = [];
    let current = "";
    for (const p of paragraphs) {
      if (!current) {
        current = p;
      } else if (current.length + 2 + p.length <= CHUNK_TARGET_CHARS) {
        current = `${current}\n\n${p}`;
      } else {
        buckets.push(current);
        current = p;
      }
    }
    if (current) buckets.push(current);
    if (buckets.length === 0) buckets.push("");
    buckets.forEach((b, i) => {
      chunks.push({
        anchor_id: section.anchor_id,
        position: i + 1,
        content: `${prefix}\n\n${b}`.trim(),
      });
    });
  }
  return chunks;
}
