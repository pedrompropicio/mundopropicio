import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Building2, UserPlus, Copy, Plus, Pencil, Upload, Trash2 } from "lucide-react";

interface CompanyRow {
  id: string;
  legal_name: string;
  display_name: string;
  slug: string;
  country: string;
  currency: string;
  status: string;
  contact_email: string | null;
  logo_url: string | null;
  theme_config: { primary_color?: string } | null;
  created_at: string;
}

export default function Companies() {
  const { isPlatformAdmin, isLoading: companyLoading } = useCompany();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState<CompanyRow | null>(null);
  const [editOpen, setEditOpen] = useState<CompanyRow | null>(null);

  const { data: companies, isLoading } = useQuery({
    queryKey: ["admin-companies"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CompanyRow[];
    },
  });

  if (companyLoading) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Empresas
          </h1>
          <p className="text-sm text-muted-foreground">Gestão multi-empresa — visível apenas para super-admin.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Nova empresa
            </Button>
          </DialogTrigger>
          <CreateCompanyDialog
            onCreated={() => {
              setCreateOpen(false);
              qc.invalidateQueries({ queryKey: ["admin-companies"] });
            }}
          />
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading && <div className="text-muted-foreground">A carregar…</div>}
        {companies?.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-2">
                <span>{c.display_name}</span>
                <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground font-mono">{c.slug}</p>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="text-muted-foreground">{c.legal_name}</div>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline">{c.country}</Badge>
                <Badge variant="outline">{c.currency}</Badge>
              </div>
              {c.contact_email && <div className="text-xs text-muted-foreground">{c.contact_email}</div>}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => setInviteOpen(c)}
              >
                <UserPlus className="h-3.5 w-3.5 mr-2" /> Convidar admin
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {inviteOpen && (
        <InviteAdminDialog
          company={inviteOpen}
          onClose={() => setInviteOpen(null)}
        />
      )}
    </div>
  );
}

function CreateCompanyDialog({ onCreated }: { onCreated: () => void }) {
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [taxId, setTaxId] = useState("");
  const [country, setCountry] = useState("PT");
  const [currency, setCurrency] = useState("EUR");
  const [contactEmail, setContactEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Auto-derive slug from display name
  useEffect(() => {
    if (!slug && displayName) {
      const auto = displayName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      setSlug(auto);
    }
  }, [displayName, slug]);

  const handleSubmit = async () => {
    if (!legalName || !displayName || !slug) {
      toast({ title: "Preenche nome legal, nome de apresentação e slug", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-company", {
        body: {
          legal_name: legalName,
          display_name: displayName,
          slug,
          tax_id: taxId || undefined,
          country,
          currency,
          contact_email: contactEmail || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Empresa criada", description: displayName });
      onCreated();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nova empresa</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label>Nome legal *</Label>
          <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="ex: Cloudscape Lda" />
        </div>
        <div>
          <Label>Nome de apresentação *</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="ex: Coala Portugal" />
        </div>
        <div>
          <Label>Slug *</Label>
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="coala-portugal" />
        </div>
        <div>
          <Label>NIF / Tax ID</Label>
          <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>País</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PT">Portugal</SelectItem>
                <SelectItem value="BR">Brasil</SelectItem>
                <SelectItem value="ES">Espanha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Moeda</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="BRL">BRL</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Email de contacto</Label>
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "A criar…" : "Criar empresa"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function InviteAdminDialog({ company, onClose }: { company: CompanyRow; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "manager">("admin");
  const [submitting, setSubmitting] = useState(false);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-company-admin", {
        body: { company_id: company.id, email, role },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const url = (data as any)?.accept_url as string | undefined;
      const fullUrl = url ? `${window.location.origin}${url}` : null;
      setAcceptUrl(fullUrl);
      toast({ title: "Convite criado", description: "Copia e envia o link." });
    } catch (e: any) {
      toast({ title: "Erro ao convidar", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar admin — {company.display_name}</DialogTitle>
        </DialogHeader>
        {!acceptUrl ? (
          <div className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "A enviar…" : "Gerar convite"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Convite criado. Envia este link ao utilizador (válido 7 dias):</p>
            <div className="flex gap-2">
              <Input readOnly value={acceptUrl} className="font-mono text-xs" />
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(acceptUrl);
                  toast({ title: "Copiado" });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
