import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";

function initials(n?: string | null): string {
  if (!n) return "?";
  return n
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

const PROFILE_TYPE_LABEL: Record<string, string> = {
  admin: "Admin",
  platform_admin: "Admin",
  producer: "Produtor",
  field_staff: "Staff",
  viewer: "Diretor",
  accountant: "Contas",
};

export interface PessoaListRowData {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  profile_type: string | null;
  counts: {
    zonas_lead: number;
    zonas_team: number;
    etapas_owner: number;
    etapas_helper: number;
    chamados_abertos: number;
  };
  frentes_nomes: string[];
}

interface Props {
  pessoa: PessoaListRowData;
  onClick: () => void;
}

export function PessoaListRow({ pessoa, onClick }: Props) {
  const c = pessoa.counts;
  const parts: string[] = [];
  if (c.zonas_lead > 0)
    parts.push(`Lead em ${c.zonas_lead} ${c.zonas_lead === 1 ? "zona" : "zonas"}`);
  if (c.zonas_team > 0)
    parts.push(`Equipa de ${c.zonas_team} ${c.zonas_team === 1 ? "zona" : "zonas"}`);
  const etapasTotal = c.etapas_owner + c.etapas_helper;
  if (c.etapas_owner > 0)
    parts.push(`Owner em ${c.etapas_owner} ${c.etapas_owner === 1 ? "etapa" : "etapas"}`);
  else if (etapasTotal > 0)
    parts.push(`${etapasTotal} ${etapasTotal === 1 ? "etapa" : "etapas"}`);
  if (c.chamados_abertos > 0)
    parts.push(`${c.chamados_abertos} ${c.chamados_abertos === 1 ? "chamado" : "chamados"} aberto${c.chamados_abertos === 1 ? "" : "s"}`);

  const frentesVis = pessoa.frentes_nomes.slice(0, 3);
  const extra = pessoa.frentes_nomes.length - frentesVis.length;

  const typeLabel = pessoa.profile_type ? PROFILE_TYPE_LABEL[pessoa.profile_type] ?? pessoa.profile_type : null;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 text-left cursor-pointer border-b last:border-b-0 transition-colors"
    >
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="text-xs">{initials(pessoa.full_name ?? pessoa.email)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">
            {pessoa.full_name?.trim() || pessoa.email || <span className="italic text-muted-foreground">(sem nome)</span>}
          </p>
          {typeLabel && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
              {typeLabel}
            </Badge>
          )}
        </div>
        {parts.length > 0 && (
          <p className="text-[11px] text-muted-foreground truncate">
            {parts.join(" · ")}
          </p>
        )}
        {frentesVis.length > 0 && (
          <p className="text-[11px] text-muted-foreground/80 truncate">
            {frentesVis.join(" · ")}
            {extra > 0 ? ` · +${extra}` : ""}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
