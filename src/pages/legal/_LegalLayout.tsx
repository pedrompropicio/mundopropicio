import { ReactNode } from "react";

export function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
            MP Gestão Eventos
          </a>
        </div>
        <article className="prose prose-neutral dark:prose-invert lg:prose-lg max-w-none prose-headings:scroll-mt-20">
          {children}
        </article>
        <LegalFooter />
      </div>
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="mt-16 pt-8 border-t border-border text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <a href="/" className="hover:text-foreground">← MP Gestão Eventos</a>
        <div className="flex gap-4">
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
          <a href="/terms" className="hover:text-foreground">Terms</a>
          <a href="/about" className="hover:text-foreground">About</a>
        </div>
      </div>
      <p className="text-xs mt-4">© 2026 Mundo Propício Entretenimento, Lda.</p>
    </footer>
  );
}
