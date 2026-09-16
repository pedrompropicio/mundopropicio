import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renderizador único do Manual de Orientação.
 *
 * Nunca renderiza HTML cru (sem `rehype-raw`): o conteúdo vem da base e é
 * markdown por desenho. Parágrafos que começam por ⚠️ ficam realçados em âmbar.
 */
export default function HelpMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-muted-foreground", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 className="mt-4 text-base font-semibold text-foreground">{children}</h2>
          ),
          h2: ({ children }) => (
            <h3 className="mt-4 text-sm font-semibold text-foreground">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 text-sm font-semibold text-foreground">{children}</h4>
          ),
          p: ({ children }) => {
            const raw = Array.isArray(children) ? children : [children];
            const first = raw.find((c) => typeof c === "string") as string | undefined;
            const isWarning = typeof first === "string" && first.trimStart().startsWith("⚠️");
            if (isWarning) {
              return (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 dark:text-amber-200">
                  {children}
                </p>
              );
            }
            return <p>{children}</p>;
          },
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="ml-5 list-disc space-y-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1.5">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          hr: () => <hr className="my-4 border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 italic">{children}</blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2 hover:no-underline"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noreferrer" : undefined}
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 text-[11px]">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-b border-border/60 px-3 py-2 align-top">{children}</td>,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
