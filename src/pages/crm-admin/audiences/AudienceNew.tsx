import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MP_COMPANY_ID } from "../constants";
import AudienceBuilder from "./AudienceBuilder";
import AudiencePreviewCount from "./AudiencePreviewCount";
import { EMPTY_CRITERION, type Criterion } from "./audienceCriterion";

export default function AudienceNew() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [criterion, setCriterion] = useState<Criterion>(EMPTY_CRITERION);

  const mut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome obrigatório");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      const { data, error } = await (supabase as any)
        .from("audiences")
        .insert({
          company_id: MP_COMPANY_ID,
          name: name.trim(),
          description: description.trim() || null,
          criterion,
          created_by: uid,
          updated_by: uid,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Audience criada");
      nav(`/crm/audiences/${id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nova audience</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define filtros e guarda. Podes capturar snapshots depois.
        </p>
      </div>

      <Card className="p-4 space-y-4">
        <div>
          <Label htmlFor="name">Nome *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="desc">Descrição</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Filtros</h2>
        <AudienceBuilder criterion={criterion} onChange={setCriterion} />
        <AudiencePreviewCount criterion={criterion} />
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button asChild variant="outline">
          <Link to="/crm/audiences">Cancelar</Link>
        </Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "A guardar…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
