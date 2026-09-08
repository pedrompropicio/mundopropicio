import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Check, X } from "lucide-react";
import { useRenameBPVersion } from "@/hooks/useBPVersions";

interface Props {
  eventId: string;
  versionId: string;
  /** "label" = scenario_label (obrigatório), "description" = description (pode ficar vazia) */
  field: "label" | "description";
  value: string | null;
  canManage: boolean;
  placeholder?: string;
  /** Conteúdo a mostrar quando não está em edição (fallback: o valor) */
  children?: React.ReactNode;
}

/**
 * Lápis + edição inline do nome de uma versão do BP (description) ou de um
 * cenário (scenario_label). Só visível a admin/manager. Guarda via RPC
 * `rename_bp_version`.
 */
export function InlineVersionNameEdit({
  eventId,
  versionId,
  field,
  value,
  canManage,
  placeholder,
  children,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const rename = useRenameBPVersion(eventId);

  const isLabel = field === "label";
  const isEmpty = draft.trim().length === 0;
  const disabled = rename.isPending || (isLabel && isEmpty);

  const save = async () => {
    await rename.mutateAsync({
      versionId,
      newLabel: isLabel ? draft.trim() : null,
      newDescription: isLabel ? null : draft.trim(),
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        {children ?? <span className="truncate">{value ?? "—"}</span>}
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setDraft(value ?? "");
              setEditing(true);
            }}
            title={isLabel ? "Renomear cenário" : "Editar nome da versão"}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder ?? (isLabel ? "Nome do cenário" : "Nome da versão")}
        className="h-7 w-[220px] text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) void save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        disabled={disabled}
        title={isLabel && isEmpty ? "Um cenário tem sempre de ter nome" : "Guardar"}
        onClick={() => void save()}
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={() => setEditing(false)}
        title="Cancelar"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      {isLabel && isEmpty && (
        <span className="text-[10px] text-muted-foreground">Um cenário tem sempre de ter nome.</span>
      )}
    </span>
  );
}
