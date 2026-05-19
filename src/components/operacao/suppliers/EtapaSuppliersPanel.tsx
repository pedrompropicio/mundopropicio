import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Phone, MessageCircle, Mail, Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { AddSupplierToEtapaDialog } from "./AddSupplierToEtapaDialog";
import { EditEtapaSupplierDialog } from "./EditEtapaSupplierDialog";
import { toast } from "@/hooks/use-toast";

interface Props {
  etapaId: string;
  canEdit: boolean;
  /** Hide the title/header (e.g. when rendered inside a popover) */
  compact?: boolean;
}

const cleanPhone = (p: string) => p.replace(/[^\d+]/g, "");
const waPhone = (p: string) => p.replace(/[^\d]/g, "");
const initials = (n?: string | null) =>
  (n ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
const fmtEur = (v: number | null | undefined) =>
  v == null ? null : new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);

export function EtapaSuppliersPanel({ etapaId, canEdit, compact }: Props) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: rows } = useQuery({
    queryKey: ["op-etapa-suppliers", etapaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_etapa_suppliers")
        .select("*, supplier:suppliers(id,name)")
        .eq("etapa_id", etapaId)
        .order("role", { ascending: true }) // principal first alphabetically
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const remove = async (id: string) => {
    if (!confirm("Remover este fornecedor da etapa?")) return;
    const { error } = await supabase.from("operacao_etapa_suppliers").delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Removido" });
      qc.invalidateQueries({ queryKey: ["op-etapa-suppliers", etapaId] });
      qc.invalidateQueries({ queryKey: ["op-etapas-table"] });
      qc.invalidateQueries({ queryKey: ["op-etapa", etapaId] });
    }
  };

  const list = rows ?? [];

  return (
    <Card className={compact ? "p-2 space-y-2 border-0 shadow-none" : "p-4 space-y-3"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">🏗️ Fornecedores e contactos</h3>
        </div>
      )}

      {list.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          Nenhum fornecedor atribuído.{canEdit ? " Toca em + para adicionar." : ""}
        </p>
      )}

      <ul className="space-y-2">
        {list.map((r: any) => {
          const isPrincipal = r.role === "principal";
          return (
            <li key={r.id} className="rounded-md border bg-card p-2 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{r.supplier?.name ?? "—"}</span>
                    <Badge
                      variant="outline"
                      className={
                        isPrincipal
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] uppercase"
                          : "text-[10px] uppercase text-muted-foreground"
                      }
                    >
                      {isPrincipal ? "Principal" : "Secundário"}
                    </Badge>
                  </div>
                  {r.decided_amount != null && (
                    <p className="text-xs text-muted-foreground">{fmtEur(Number(r.decided_amount))}</p>
                  )}
                </div>
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(r)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => remove(r.id)} className="text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {(r.contact_name || r.contact_phone || r.contact_email) && (
                <div className="flex items-start gap-2 pt-1 border-t border-border/50">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                    {initials(r.contact_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    {r.contact_name && (
                      <p className="text-xs font-medium leading-tight">
                        {r.contact_name}
                        {r.contact_role && <span className="text-muted-foreground font-normal"> · {r.contact_role}</span>}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {r.contact_phone && (
                        <>
                          <a href={`tel:${cleanPhone(r.contact_phone)}`}>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1">
                              <Phone className="h-3 w-3" /> Chamar
                            </Button>
                          </a>
                          <a
                            href={`https://wa.me/${waPhone(r.contact_phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1">
                              <MessageCircle className="h-3 w-3" /> WhatsApp
                            </Button>
                          </a>
                        </>
                      )}
                      {r.contact_email && (
                        <a href={`mailto:${r.contact_email}`}>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1">
                            <Mail className="h-3 w-3" /> Email
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {r.notes && <p className="text-[11px] text-muted-foreground italic">{r.notes}</p>}
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar fornecedor
        </Button>
      )}

      {addOpen && (
        <AddSupplierToEtapaDialog
          etapaId={etapaId}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editing && (
        <EditEtapaSupplierDialog
          row={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
