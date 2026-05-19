import { useEffect, useRef, useState } from "react";
import { Navigate, Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft } from "lucide-react";
import { FrenteTeamEditor } from "@/components/operacao/desktop/FrenteTeamEditor";
import { EtapasTable } from "@/components/operacao/desktop/EtapasTable";

const PALETTE = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#6b7280"];

const STATUS_OPTS = [
  { value: "active", label: "Ativa" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
];

export default function FrenteManage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isAdmin, hasPermission } = useAuth();
  const qc = useQueryClient();

  const canEdit = isAdmin || hasPermission("manage_operacao_frentes");

  // Mobile redirect
  useEffect(() => {
    if (isMobile && id) {
      toast({ title: "Editor disponível só em desktop" });
      navigate(`/operacao/frente/${id}`, { replace: true });
    }
  }, [isMobile, id, navigate]);

  // Permission redirect
  useEffect(() => {
    if (!isMobile && !canEdit && id) {
      toast({ title: "Sem permissão para editar", variant: "destructive" });
      navigate(`/operacao/frente/${id}`, { replace: true });
    }
  }, [isMobile, canEdit, id, navigate]);

  const { data: frente, isLoading } = useQuery({
    queryKey: ["op-frente-manage", id],
    enabled: !!id && !isMobile && canEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operacao_frentes")
        .select("id,name,description,color,status,type,event_id,company_id, events:event_id(id,name,company_id)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PALETTE[5]);
  const [status, setStatus] = useState("active");
  const [type, setType] = useState<"zone" | "service">("zone");

  useEffect(() => {
    if (!frente) return;
    setName(frente.name ?? "");
    setDescription(frente.description ?? "");
    setColor(frente.color ?? PALETTE[5]);
    setStatus(frente.status ?? "active");
    setType(((frente as any).type ?? "zone") as "zone" | "service");
  }, [frente]);

  // Debounced autosave on blur
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = (patch: Record<string, any>) => {
    if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from("operacao_frentes").update(patch as any).eq("id", id);
      if (error) {
        toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
      } else {
        qc.invalidateQueries({ queryKey: ["op-frente-manage", id] });
        qc.invalidateQueries({ queryKey: ["op-my-frentes"] });
      }
    }, 800);
  };

  const saveNow = async (patch: Record<string, any>) => {
    if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const { error } = await supabase.from("operacao_frentes").update(patch as any).eq("id", id);
    if (error) toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
    else {
      qc.invalidateQueries({ queryKey: ["op-frente-manage", id] });
      qc.invalidateQueries({ queryKey: ["op-my-frentes"] });
    }
  };

  if (!id) return <Navigate to="/operacao" replace />;
  if (isMobile || !canEdit) return null;
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">A carregar…</div>;
  if (!frente) return <div className="p-6 text-sm text-muted-foreground">Zona/Serviço não encontrada.</div>;

  const companyId = (frente as any).company_id ?? (frente as any).events?.company_id;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          <Link to="/operacao" className="hover:underline">Operação</Link>
          <span className="mx-1">›</span>
          <Link to={`/operacao/frente/${id}`} className="hover:underline">{frente.name}</Link>
          <span className="mx-1">›</span>
          <span>Gerir</span>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate(`/operacao/frente/${id}`)}>
          <ChevronLeft className="h-3 w-3 mr-1" /> Voltar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 space-y-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">Detalhes da Frente</h2>

          <div>
            <Label className="text-xs">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name !== frente.name && saveNow({ name: name.trim() })}
            />
          </div>

          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (frente.description ?? "") && saveNow({ description: description.trim() || null })}
            />
          </div>

          <div>
            <Label className="text-xs">Cor</Label>
            <div className="flex gap-2 flex-wrap mt-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setColor(c); queueSave({ color: c }); }}
                  className={"h-7 w-7 rounded-full border-2 " + (color === c ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={(v) => { setType(v as any); saveNow({ type: v }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="zone">Zona</SelectItem>
                <SelectItem value="service">Serviço</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Zona = setor físico. Serviço = função transversal.
            </p>
          </div>

          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={status} onValueChange={(v) => { setStatus(v); saveNow({ status: v }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {companyId && (
            <div className="pt-2 border-t">
              <FrenteTeamEditor frenteId={id} companyId={companyId} canEdit={canEdit} />
            </div>
          )}
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-3">Etapas</h2>
          {companyId && (
            <EtapasTable frenteId={id} companyId={companyId} canEdit={canEdit} />
          )}
        </Card>
      </div>
    </div>
  );
}
