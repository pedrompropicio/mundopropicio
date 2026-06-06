import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Mail, MessageCircle, ExternalLink } from "lucide-react";
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

interface Props {
  contactId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function ContactDetailsSheet({ contactId, open, onOpenChange }: Props) {
  const qc = useQueryClient();

  const { data: contact } = useQuery({
    enabled: !!contactId && open,
    queryKey: ["crm-contact", contactId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: leads } = useQuery({
    enabled: !!contactId && open,
    queryKey: ["crm-contact-leads", contactId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("leads")
        .select("id, kind, source, utm_source, created_at, event:events(id, name)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: audiences } = useQuery({
    enabled: !!contactId && open,
    queryKey: ["crm-contact-audiences", contactId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audience_members")
        .select("added_at, snapshot:audience_snapshots(id, captured_at, audience:audiences(id, name))")
        .eq("contact_id", contactId)
        .order("added_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const map = new Map<string, { id: string; name: string; lastAt: string }>();
      for (const row of (data ?? []) as any[]) {
        const aud = row.snapshot?.audience;
        if (!aud) continue;
        const cur = map.get(aud.id);
        const at = row.snapshot.captured_at;
        if (!cur || at > cur.lastAt) map.set(aud.id, { id: aud.id, name: aud.name, lastAt: at });
      }
      return Array.from(map.values());
    },
  });

  const updateMut = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await (supabase as any)
        .from("contacts")
        .update(patch)
        .eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contact", contactId] });
      qc.invalidateQueries({ queryKey: ["crm-contactos-list"] });
      toast.success("Contacto actualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleConsent = (field: "consent_email" | "consent_whatsapp") => {
    if (!contact) return;
    const next = !contact[field];
    const atField = field === "consent_email" ? "consent_email_at" : "consent_whatsapp_at";
    updateMut.mutate({ [field]: next, [atField]: next ? new Date().toISOString() : contact[atField] });
  };

  const toggleActive = () => {
    if (!contact) return;
    updateMut.mutate({ is_active: !contact.is_active });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{contact?.name ?? contact?.email ?? "Contacto"}</SheetTitle>
          <SheetDescription>
            {contact?.email ?? "—"} {contact?.phone_e164 ? `· ${contact.phone_e164}` : ""}
          </SheetDescription>
        </SheetHeader>

        {!contact && <p className="text-sm text-muted-foreground mt-6">A carregar…</p>}

        {contact && (
          <div className="space-y-6 mt-6">
            <section>
              <h3 className="text-sm font-semibold mb-2">Identidade</h3>
              <Card className="p-3 text-xs space-y-1">
                <Row label="Nome" value={contact.name ?? "—"} />
                <Row label="Email" value={contact.email ?? "—"} />
                <Row label="Telefone" value={contact.phone_e164 ?? "—"} />
                <Row label="Source" value={contact.source ?? "—"} />
                <Row label="1ª vez vista" value={formatDateTime(contact.first_seen_at)} />
                <Row label="Última actividade" value={formatDateTime(contact.last_activity_at)} />
                <Row label="Criado" value={formatDateTime(contact.created_at)} />
              </Card>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">Consents</h3>
              <Card className="p-3 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>Email</span>
                    <Badge className={contact.consent_email ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                      {contact.consent_email ? "Activo" : "Revogado"}
                    </Badge>
                    {contact.consent_email_at && (
                      <span className="text-muted-foreground">{formatDateTime(contact.consent_email_at)}</span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toggleConsent("consent_email")} disabled={updateMut.isPending}>
                    {contact.consent_email ? "Revogar" : "Reactivar"}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    <span>WhatsApp</span>
                    <Badge className={contact.consent_whatsapp ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                      {contact.consent_whatsapp ? "Activo" : "Revogado"}
                    </Badge>
                    {contact.consent_whatsapp_at && (
                      <span className="text-muted-foreground">{formatDateTime(contact.consent_whatsapp_at)}</span>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toggleConsent("consent_whatsapp")} disabled={updateMut.isPending}>
                    {contact.consent_whatsapp ? "Revogar" : "Reactivar"}
                  </Button>
                </div>
                <div className="pt-2 border-t">
                  <Button size="sm" variant={contact.is_active ? "outline" : "default"} onClick={toggleActive} disabled={updateMut.isPending}>
                    {contact.is_active ? "Marcar inactivo" : "Reactivar contacto"}
                  </Button>
                </div>
              </Card>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">
                Leads associados {leads ? `(${leads.length})` : ""}
              </h3>
              {leads && leads.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem leads.</p>
              )}
              <div className="space-y-1">
                {(leads ?? []).map((l: any) => (
                  <Card key={l.id} className="p-2 text-xs flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{l.kind}</Badge>
                        <span className="text-muted-foreground truncate">
                          {l.utm_source ?? l.source ?? "—"}
                        </span>
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        {l.event?.name ?? "Sem evento"} · {relativeFromNow(l.created_at)}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              {leads && leads.length > 0 && (
                <Link
                  to={`/crm/leads?contact=${contactId}`}
                  className="text-xs text-emerald-600 hover:underline inline-flex items-center gap-1 mt-2"
                >
                  Ver todos os leads <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">
                Audiências {audiences ? `(${audiences.length})` : ""}
              </h3>
              {audiences && audiences.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem audiências.</p>
              )}
              <div className="space-y-1">
                {(audiences ?? []).map((a) => (
                  <Link
                    key={a.id}
                    to={`/crm/audiences/${a.id}`}
                    className="block"
                  >
                    <Card className="p-2 text-xs hover:bg-muted/40 transition-colors">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-muted-foreground">
                        última vez em snapshot de {formatDateTime(a.lastAt)}
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
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
