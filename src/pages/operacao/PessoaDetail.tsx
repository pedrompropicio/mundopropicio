import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default function PessoaDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Button>
      <Card className="p-6 space-y-2">
        <h1 className="text-lg font-semibold">Pessoa</h1>
        <p className="text-sm text-muted-foreground">
          Drill-down em construção. Pode ser implementado depois do Coala.
        </p>
        <p className="text-xs text-muted-foreground font-mono break-all">profile_id: {id}</p>
      </Card>
    </div>
  );
}
