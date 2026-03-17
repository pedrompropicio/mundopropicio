import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Star, FileText, Phone, Mail, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDate } from "@/lib/mock-data";

const supplierCategories = [
  "Som e Iluminação", "Palcos e Estruturas", "Catering", "Segurança",
  "Transportes", "Alojamento", "Marketing", "Artistas/Agências",
  "Decoração", "Limpeza", "Seguros", "Outro",
];

export default function Suppliers() {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (supplier: {
      name: string; nif?: string; contact_name?: string; email?: string;
      phone?: string; address?: string; iban?: string; swift_bic?: string;
      payment_terms?: string; category?: string; notes?: string;
    }) => {
      const { error } = await supabase.from("suppliers").insert(supplier);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setIsOpen(false);
      toast.success("Fornecedor criado com sucesso");
    },
    onError: () => toast.error("Erro ao criar fornecedor"),
  });

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.nif && s.nif.includes(search)) ||
    (s.category && s.category.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name") as string,
      nif: (fd.get("nif") as string) || undefined,
      contact_name: (fd.get("contact_name") as string) || undefined,
      email: (fd.get("email") as string) || undefined,
      phone: (fd.get("phone") as string) || undefined,
      address: (fd.get("address") as string) || undefined,
      iban: (fd.get("iban") as string) || undefined,
      swift_bic: (fd.get("swift_bic") as string) || undefined,
      payment_terms: (fd.get("payment_terms") as string) || undefined,
      category: (fd.get("category") as string) || undefined,
      notes: (fd.get("notes") as string) || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">Gestão de fornecedores e parceiros</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground glow-primary">
              <Plus className="h-4 w-4" /> Novo Fornecedor
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo Fornecedor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nif">NIF</Label>
                  <Input id="nif" name="nif" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Select name="category">
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {supplierCategories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="contact_name">Pessoa de contacto</Label>
                  <Input id="contact_name" name="contact_name" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" name="phone" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="payment_terms">Condições pgto</Label>
                  <Input id="payment_terms" name="payment_terms" placeholder="ex: 30 dias" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">Morada</Label>
                <Input id="address" name="address" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input id="iban" name="iban" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="swift_bic">SWIFT/BIC</Label>
                  <Input id="swift_bic" name="swift_bic" placeholder="ex: CGDIPTPL" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" rows={2} />
              </div>
              <button type="submit" className="mt-2 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground">
                Criar Fornecedor
              </button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Pesquisar por nome, NIF ou categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">Nenhum fornecedor encontrado</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <div key={s.id} className="glass rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{s.name}</h3>
                  {s.category && <span className="text-xs text-muted-foreground">{s.category}</span>}
                </div>
                {s.rating && (
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                    <span className="text-xs font-medium">{s.rating}/5</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5 text-sm text-muted-foreground">
                {s.nif && <p className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> NIF: {s.nif}</p>}
                {s.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {s.email}</p>}
                {s.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {s.phone}</p>}
                {s.contact_name && <p className="flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> {s.contact_name}</p>}
              </div>
              {s.payment_terms && (
                <p className="text-xs text-muted-foreground">Pagamento: {s.payment_terms}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}