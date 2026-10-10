import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatLisbonDateTime } from "@/lib/date-lisbon";
import {
  STATEMENT_DOCUMENT_SOURCES,
  STATEMENT_DOCUMENT_SOURCE_LABEL,
  openStatementDocument,
  removeStatementDocument,
  sourceLabel,
  uploadStatementDocument,
  type StatementDocument,
  type StatementDocumentSource,
} from "@/lib/ticket-office-statement-documents";

interface Props {
  statementId: string;
  documents: StatementDocument[];
  canManage: boolean;
  userId?: string | null;
}

/** Documentos do apuramento: abrir sempre; carregar/remover só admin/manager (RLS). */
export function TicketOfficeStatementDocuments({ statementId, documents, canManage, userId }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<StatementDocumentSource>("apuramento");
  const [openError, setOpenError] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["ticket-office-statements"] });

  const upload = useMutation({
    mutationFn: (file: File) => uploadStatementDocument({ statementId, file, source, userId }),
    onSuccess: () => { toast.success("Documento carregado"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao carregar"),
  });
  const remove = useMutation({
    mutationFn: (d: StatementDocument) => removeStatementDocument(d),
    onSuccess: () => { toast.success("Documento removido"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao remover"),
  });

  const open = async (path: string) => {
    setOpenError(null);
    const err = await openStatementDocument(path);
    if (err) { setOpenError(err); toast.error(err); }
  };

  const sorted = [...documents].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  return (
    <div className="border-t border-border pt-3 space-y-2" data-testid="statement-documents">
      <p className="text-sm font-semibold">Documentos do apuramento</p>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem documentos.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {sorted.map((d) => (
            <li key={d.id} className="flex items-center gap-2">
              <button type="button" onClick={() => open(d.file_path)} className="flex items-center gap-1 text-left hover:underline min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{d.file_name}</span>
              </button>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{sourceLabel(d.document_source)}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{formatLisbonDateTime(d.created_at)}</span>
              {canManage && (
                <button
                  type="button"
                  aria-label={`Remover ${d.file_name}`}
                  disabled={remove.isPending}
                  onClick={() => { if (window.confirm(`Remover "${d.file_name}"?`)) remove.mutate(d); }}
                  className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {openError && <p role="alert" className="text-xs text-destructive">{openError}</p>}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={source} onValueChange={(v) => setSource(v as StatementDocumentSource)}>
            <SelectTrigger className="h-8 w-44" aria-label="Natureza do documento"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATEMENT_DOCUMENT_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>{STATEMENT_DOCUMENT_SOURCE_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload.mutate(f);
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
            {upload.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Carregar documento
          </Button>
        </div>
      )}
    </div>
  );
}
