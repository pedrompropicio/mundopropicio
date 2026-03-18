import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Star, FileText, Phone, Mail, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/mock-data";
import { SupplierFormModal } from "@/components/SupplierFormModal";

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


  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    ((s as any).trade_name && (s as any).trade_name.toLowerCase().includes(search.toLowerCase())) ||
    (s.nif && s.nif.includes(search)) ||
    (s.category && s.category.toLowerCase().includes(search.toLowerCase()))
  );


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">Gestão de fornecedores e parceiros</p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground glow-primary"
        >
          <Plus className="h-4 w-4" /> Novo Fornecedor
        </button>
        <SupplierFormModal open={isOpen} onOpenChange={setIsOpen} />
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
                {s.iban && <p className="text-xs truncate">IBAN: {s.iban}</p>}
                {(s as any).swift_bic && <p className="text-xs">SWIFT: {(s as any).swift_bic}</p>}
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