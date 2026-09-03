/**
 * D17 — campo de N documentos de um item de cartão.
 *
 * Funciona nos dois momentos:
 *  - item ainda não existe (criação): os ficheiros ficam em fila (`pending`) e o
 *    formulário sobe-os depois do insert com `uploadCardItemDocument`;
 *  - item já existe: lista os anexos gravados, com abrir e remover.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Paperclip, Loader2, Trash2, ExternalLink, Upload } from "lucide-react";
import { HEIC_ACCEPT } from "@/lib/image-upload";
import { useAuth } from "@/contexts/AuthContext";
import {
  deleteCardItemDocument,
  fetchCardItemDocuments,
  openCardItemDocument,
  uploadCardItemDocument,
  type CardItemDoc,
} from "@/lib/card-item-documents";

interface Props {
  sessionId: string;
  /** Quando presente, os uploads são imediatos neste item. */
  itemId?: string | null;
  /** Fila de ficheiros para itens que ainda não existem. */
  pending: File[];
  onPendingChange: (files: File[]) => void;
  disabled?: boolean;
}

export function CardItemDocumentsField({ sessionId, itemId, pending, onPendingChange, disabled }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<CardItemDoc[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    if (!itemId) {
      setDocs([]);
      return;
    }
    try {
      setDocs(await fetchCardItemDocuments(itemId));
    } catch {
      setDocs([]);
    }
  };

  useEffect(() => {
    void reload();
  }, [itemId]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = "";
    if (files.length === 0) return;
    if (!itemId) {
      onPendingChange([...pending, ...files]);
      return;
    }
    setBusy(true);
    try {
      for (const f of files) await uploadCardItemDocument(sessionId, itemId, f, user?.id ?? null);
      await reload();
      toast({ title: files.length === 1 ? "Documento anexado" : `${files.length} documentos anexados` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Anexo não foi gravado", description: err?.message });
    } finally {
      setBusy(false);
    }
  };

  const total = docs.length + pending.length;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          Documentos <span className="text-muted-foreground">({total})</span>
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Anexar
        </Button>
      </div>

      {total === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Sem documento — é preciso justificar a aprovação sem comprovativo.
        </p>
      )}

      <ul className="space-y-1">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1 text-xs">
            <span className="min-w-0 flex-1 truncate">
              <Paperclip className="mr-1 inline h-3 w-3" />
              {d.file_name ?? "documento"}
            </span>
            <button
              type="button"
              title="Abrir"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => void openCardItemDocument(d).catch((e) => toast({ variant: "destructive", title: "Erro", description: e.message }))}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            {!disabled && (
              <button
                type="button"
                title="Remover"
                className="rounded p-1 text-destructive hover:bg-destructive/10"
                onClick={async () => {
                  try {
                    await deleteCardItemDocument(d);
                    await reload();
                  } catch (e: any) {
                    toast({ variant: "destructive", title: "Erro", description: e.message });
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
        {pending.map((f, idx) => (
          <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 rounded border border-dashed border-primary/40 bg-primary/5 px-2 py-1 text-xs">
            <span className="min-w-0 flex-1 truncate">
              <Paperclip className="mr-1 inline h-3 w-3" />
              {f.name} <span className="text-muted-foreground">(a enviar)</span>
            </span>
            <button
              type="button"
              title="Remover"
              className="rounded p-1 text-destructive hover:bg-destructive/10"
              onClick={() => onPendingChange(pending.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        accept={`image/*,application/pdf,${HEIC_ACCEPT}`}
        onChange={pick}
      />
    </div>
  );
}

export default CardItemDocumentsField;
