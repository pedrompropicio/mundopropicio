import { Card, CardContent } from "@/components/ui/card";

interface Props {
  title: string;
  description: string;
  phase: string;
}

export function CrmPlaceholder({ title, description, phase }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <p>
            Em desenvolvimento — <span className="text-emerald-600 font-medium">{phase}</span>.
          </p>
          <p className="mt-2">Esta secção será activada em sessão futura.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export const CrmEventosPlaceholder = () => (
  <CrmPlaceholder
    title="Eventos — Marketing"
    description="Editor de marketing de eventos (landing, lineup, FAQs, SEO, pixels)."
    phase="Fase 2"
  />
);

export const CrmContactosPlaceholder = () => (
  <CrmPlaceholder
    title="Contactos"
    description="Lista unificada de contactos com consentimentos e histórico."
    phase="Fase 5"
  />
);

export const CrmLeadsPlaceholder = () => (
  <CrmPlaceholder
    title="Leads"
    description="Leads capturados via portal, com origem, evento e estado."
    phase="Fase 5"
  />
);

export const CrmAudiencesPlaceholder = () => (
  <CrmPlaceholder
    title="Audiências"
    description="Segmentos dinâmicos de contactos para campanhas e exports."
    phase="Fase 6"
  />
);

export const CrmBlogPlaceholder = () => (
  <CrmPlaceholder
    title="Blog"
    description="Editor de posts do portal público (bilingue, draft/published)."
    phase="Fase 3"
  />
);

export const CrmPaginasPlaceholder = () => (
  <CrmPlaceholder
    title="Páginas estáticas"
    description="Editor de páginas institucionais do portal (about, privacy, terms, ...)."
    phase="Fase 4"
  />
);
