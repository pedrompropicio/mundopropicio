import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { relativeFromNow, formatDateTime } from "../lib/relativeTime";
import ContactDetailsSheet from "../contactos/ContactDetailsSheet";

interface Props {
  leadId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function truncate(s: string | null | undefined, n = 30) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function CopyableId({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      title={value}
      className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground text-muted-foreground"
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success("Copiado");
      }}
    >
      {truncate(value)} <Copy className="h-3 w-3" />
    </button>
  );
}

export default function LeadDetailsSheet({ leadId, open, onOpenChange }: Props) {
  const [contactOpen, setContactOpen] = useState<string | null>(null);

  const { data: lead } = useQuery({
    enabled: !!leadId && open,
    queryKey: ["crm-lead", leadId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("leads")
        .select(`
          *,
          contact:contacts(id, name, email, phone_e164),
          event:events(id, name)
        `)
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Badge variant="outline">{lead?.kind ?? "lead"}</Badge>
            </SheetTitle>
            <SheetDescription>{relativeFromNow(lead?.created_at)}</SheetDescription>
          </SheetHeader>

          {!lead && <p className="text-sm text-muted-foreground mt-6">A carregar…</p>}

          {lead && (
            <div className="space-y-6 mt-6">
              <section>
                <h3 className="text-sm font-semibold mb-2">Origem</h3>
                <Card className="p-3 text-xs space-y-1">
                  <Row label="source" value={lead.source ?? "—"} />
                  <Row label="utm_source" value={lead.utm_source ?? "—"} />
                  <Row label="utm_medium" value={lead.utm_medium ?? "—"} />
                  <Row label="utm_campaign" value={lead.utm_campaign ?? "—"} />
                  <Row label="utm_content" value={lead.utm_content ?? "—"} />
                </Card>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Identificadores</h3>
                <Card className="p-3 text-xs space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">mp_click_id</span>
                    <CopyableId value={lead.mp_click_id} />
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">fbc</span>
                    <CopyableId value={lead.fbc} />
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">fbp</span>
                    <CopyableId value={lead.fbp} />
                  </div>
                </Card>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Contacto</h3>
                <Card className="p-3 text-xs">
                  {lead.contact ? (
                    <div className="space-y-1">
                      <div className="font-medium">{lead.contact.name ?? "—"}</div>
                      <div className="text-muted-foreground">
                        {lead.contact.email ?? "—"}
                        {lead.contact.phone_e164 ? ` · ${lead.contact.phone_e164}` : ""}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => setContactOpen(lead.contact.id)}
                      >
                        Ver contacto
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Lead anónimo</span>
                  )}
                </Card>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Evento</h3>
                <Card className="p-3 text-xs">
                  {lead.event ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{lead.event.name}</span>
                      <Link
                        to={`/crm/eventos/${lead.event.id}`}
                        className="text-emerald-600 hover:underline inline-flex items-center gap-1"
                      >
                        Ver marketing <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Card>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Técnico</h3>
                <Card className="p-3 text-xs font-mono text-muted-foreground space-y-1">
                  <div>IP: {lead.ip_inet ?? "—"}</div>
                  <div className="break-all">UA: {lead.user_agent ?? "—"}</div>
                </Card>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Meta</h3>
                <Card className="p-3">
                  <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-64 overflow-auto">
                    {lead.meta ? JSON.stringify(lead.meta, null, 2) : "—"}
                  </pre>
                </Card>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ContactDetailsSheet
        contactId={contactOpen}
        open={!!contactOpen}
        onOpenChange={(v) => !v && setContactOpen(null)}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right truncate">{value}</span>
    </div>
  );
}
