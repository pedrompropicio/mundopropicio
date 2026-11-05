import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useBusinessLines, useSaveBusinessLine } from "@/hooks/useBusinessLines";

export function BusinessLinesCard() {
  const { isAdmin, isManager } = useAuth();
  const canEdit = isAdmin || isManager;
  const { data: lines = [], isLoading, isError } = useBusinessLines();
  const save = useSaveBusinessLine();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");
  const disabled = isLoading || isError || save.isPending;

  const move = (index: number, delta: number) => {
    const ordered = [...lines];
    [ordered[index], ordered[index + delta]] = [ordered[index + delta], ordered[index]];
    save.mutate({ kind: "reorder", rows: ordered.map((line, i) => ({ id: line.id, sort_order: i })) });
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Linhas de negócio</CardTitle>
        <CardDescription>
          Lista da empresa activa para agrupar eventos. Uma linha em uso pode ser desactivada.
          {!canEdit && " Só admin ou manager podem alterar."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p role="status" className="text-sm text-muted-foreground">A carregar linhas de negócio…</p>}
        {isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar as linhas de negócio.</p>}
        {!isLoading && !isError && lines.length === 0 && <p className="text-sm text-muted-foreground">Ainda não existem linhas de negócio.</p>}
        <ul className="space-y-2">
          {lines.map((line, index) => (
            <li key={line.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
              {canEdit && editing === line.id ? (
                <form className="flex w-full flex-wrap gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  if (editedName.trim()) save.mutate({ kind: "update", id: line.id, values: { name: editedName } }, {
                    onSuccess: () => setEditing(null),
                  });
                }}>
                  <Input aria-label={`Novo nome de ${line.name}`} value={editedName}
                    onChange={(e) => setEditedName(e.target.value)} disabled={disabled} className="min-w-32 flex-1" />
                  <Button type="submit" size="sm" disabled={disabled || !editedName.trim()}>Guardar</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={() => setEditing(null)}>Cancelar</Button>
                </form>
              ) : (
                <>
                  <span className="min-w-24 flex-1 text-sm">{line.name}{!line.is_active && " (inactiva)"}</span>
                  {canEdit && <>
                    <Button type="button" size="icon" variant="ghost" aria-label={`Subir ${line.name}`}
                      disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" aria-label={`Descer ${line.name}`}
                      disabled={disabled || index === lines.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant="outline" disabled={disabled}
                      aria-label={`Renomear ${line.name}`} onClick={() => { setEditing(line.id); setEditedName(line.name); }}>Renomear</Button>
                    <Button type="button" size="sm" variant="outline" disabled={disabled}
                      aria-label={`${line.is_active ? "Desactivar" : "Activar"} ${line.name}`}
                      onClick={() => save.mutate({ kind: "update", id: line.id, values: { is_active: !line.is_active } })}>
                      {line.is_active ? "Desactivar" : "Activar"}
                    </Button>
                  </>}
                </>
              )}
            </li>
          ))}
        </ul>
        {canEdit && <form className="flex flex-wrap gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate({ kind: "create", name, sort_order: Math.max(-1, ...lines.map((line) => line.sort_order)) + 1 }, {
            onSuccess: () => setName(""),
          });
        }}>
          <Input aria-label="Nome da nova linha de negócio" placeholder="Nome da linha de negócio" value={name}
            onChange={(e) => setName(e.target.value)} disabled={disabled} className="min-w-32 flex-1" />
          <Button type="submit" disabled={disabled || !name.trim()}>Criar linha</Button>
        </form>}
      </CardContent>
    </Card>
  );
}
