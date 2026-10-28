import { createContext, useContext, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Info, HelpCircle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatPositionAmount as eur } from "@/lib/financial-position";
import { reconcile, type Breakdown } from "@/lib/financial-position-explain";
import guide from "../../../docs/guias/guia-posicao-financeira.md?raw";

const GuideContext = createContext<(anchor?: string) => void>(() => {});
const sheetClass = (mobile: boolean) => `flex flex-col gap-0 p-0 ${mobile ? "max-h-[85dvh] rounded-t-lg pb-[env(safe-area-inset-bottom)]" : "w-full sm:max-w-md"}`;

export function FinancialPositionGuideProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<string | undefined>();
  const mobile = useIsMobile();
  const show = (a?: string) => { setAnchor(a); setOpen(true); };
  return <GuideContext.Provider value={show}>{children}
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side={mobile ? "bottom" : "right"} className={sheetClass(mobile)} onOpenAutoFocus={e => {
        if (!anchor) return; e.preventDefault(); requestAnimationFrame(() => document.getElementById(`guia-${anchor}`)?.scrollIntoView({ block: "start" }));
      }}>
        <SheetHeader className="shrink-0 border-b border-border p-4 pr-12 text-left"><SheetTitle>Guia da Posição Financeira</SheetTitle><SheetDescription>Como ler cada número</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-relaxed [&_h1]:hidden [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2 [&_p]:text-muted-foreground">
          <ReactMarkdown components={{ h2: ({ children: c }) => { const text = String(Array.isArray(c) ? c.join("") : c); const m = text.match(/\{#([\w-]+)\}\s*$/); return <h2 id={m ? `guia-${m[1]}` : undefined}>{text.replace(/\s*\{#[\w-]+\}\s*$/, "")}</h2>; } }}>{guide}</ReactMarkdown>
        </div>
      </SheetContent>
    </Sheet>
  </GuideContext.Provider>;
}
export const useOpenGuide = () => useContext(GuideContext);

export function GuideButton() {
  const open = useOpenGuide();
  return <Button variant="outline" size="icon" aria-label="Guia da Posição Financeira" onClick={() => open()}><HelpCircle /></Button>;
}

/** ⓘ por toque: abre uma folha com fórmula, parcelas e reconciliação. */
export function ExplainButton({ breakdown: b }: { breakdown: Breakdown }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const openGuide = useOpenGuide();
  const rec = reconcile(b);
  return <>
    <button type="button" aria-label={`Composição: ${b.title}`} onClick={() => setOpen(true)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Info className="h-4 w-4" /></button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side={mobile ? "bottom" : "right"} className={sheetClass(mobile)}>
        <SheetHeader className="shrink-0 border-b border-border p-4 pr-12 text-left"><SheetTitle>{b.title}</SheetTitle><SheetDescription>{b.formula}</SheetDescription></SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          <dl className="divide-y divide-border">{b.parts.length === 0 ? <p className="py-1 text-muted-foreground">Sem parcelas</p> : b.parts.map((p, i) => <div key={`${p.label}-${i}`} className="flex justify-between gap-3 py-1.5"><dt className="min-w-0 break-words text-muted-foreground">{p.sign === -1 ? "− " : ""}{p.label}</dt><dd className="font-mono tabular-nums">{eur(p.value)}</dd></div>)}</dl>
          <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold"><span>Total{b.clampZero ? " (nunca negativo)" : ""}</span><span className="font-mono tabular-nums">{eur(b.total)}</span></div>
          {rec.reconciled ? <p className="text-xs text-muted-foreground" role="status">Reconciliado (±0,01)</p>
            : <p className="text-xs text-warning" role="status">Não reconciliado{rec.diff !== null ? ` · diferença ${eur(rec.diff)}` : " · faltam valores"}</p>}
          {b.groups?.map((g, i) => <details key={`${g.label}-${i}`} className="rounded-md border border-border p-2"><summary className="cursor-pointer font-medium">{g.label}</summary><dl className="mt-1">{g.rows.map(r => <div key={r.label} className="flex justify-between gap-3 py-0.5"><dt className="text-muted-foreground">{r.label}</dt><dd className="font-mono tabular-nums">{eur(r.value)}</dd></div>)}</dl></details>)}
          <Button variant="link" className="h-auto p-0" onClick={() => { setOpen(false); openGuide(b.guideAnchor); }}>Ver guia</Button>
        </div>
      </SheetContent>
    </Sheet>
  </>;
}
