import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { FieldStaffSection } from "@/components/operacao/equipa/FieldStaffSection";

export default function StaffList() {
  const navigate = useNavigate();
  return (
    <div className="p-4 pb-24 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Voltar
      </button>
      <FieldStaffSection />
    </div>
  );
}
