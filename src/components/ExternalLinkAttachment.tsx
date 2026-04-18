import { useState } from "react";
import { ExternalLink, Trash2, BookOpen, FileText, Image as ImageIcon, Cloud } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export interface ExternalDocLike {
  id: string;
  name: string;
  file_url: string; // expected to start with "ref://http"
  is_accounting: boolean;
  uploaded_by: string;
  uploaded_at: string;
}

interface Props {
  doc: ExternalDocLike;
  uploadedAtFormatted: string;
  onToggleAccounting: () => void;
  onDelete: () => void;
}

type Provider = {
  key: string;
  label: string;
  Icon: typeof Cloud;
  /** Try to extract a Google Drive file id for thumbnail */
  driveFileId?: string;
};

function detectProvider(url: string): Provider {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    // Google Drive — try to grab fileId for thumbnail
    if (host.includes("drive.google.com") || host.includes("docs.google.com")) {
      // Patterns: /file/d/{ID}/... or ?id={ID}
      const m = u.pathname.match(/\/(?:file|d)\/(?:d\/)?([a-zA-Z0-9_-]{10,})/);
      const idFromPath = m?.[1];
      const idFromQuery = u.searchParams.get("id") || undefined;
      const fileId = idFromPath || idFromQuery;
      return { key: "drive", label: "Google Drive", Icon: Cloud, driveFileId: fileId };
    }
    if (host.includes("dropbox.com")) return { key: "dropbox", label: "Dropbox", Icon: Cloud };
    if (host.includes("onedrive.live.com") || host.includes("1drv.ms") || host.includes("sharepoint.com"))
      return { key: "onedrive", label: "OneDrive", Icon: Cloud };
    if (host.includes("box.com")) return { key: "box", label: "Box", Icon: Cloud };
    if (/\.(jpe?g|png|gif|webp)(\?|$)/i.test(u.pathname)) return { key: "image", label: "Imagem", Icon: ImageIcon };
    if (/\.pdf(\?|$)/i.test(u.pathname)) return { key: "pdf", label: "PDF", Icon: FileText };
    return { key: "other", label: host.replace(/^www\./, ""), Icon: ExternalLink };
  } catch {
    return { key: "other", label: "Link externo", Icon: ExternalLink };
  }
}

function extractUrl(fileUrl: string): string {
  return fileUrl.startsWith("ref://") ? fileUrl.slice("ref://".length) : fileUrl;
}

export default function ExternalLinkAttachment({ doc, uploadedAtFormatted, onToggleAccounting, onDelete }: Props) {
  const url = extractUrl(doc.file_url);
  const provider = detectProvider(url);
  const Icon = provider.Icon;

  // Level 2 thumbnail: only attempt for Google Drive when we have a fileId
  const thumbnailUrl = provider.driveFileId
    ? `https://drive.google.com/thumbnail?id=${provider.driveFileId}&sz=w400`
    : null;

  const [thumbFailed, setThumbFailed] = useState(false);

  const row = (
    <div className="flex items-center gap-3 rounded-lg bg-accent/40 px-3 py-2.5 border border-accent/60 hover:border-primary/40 transition-colors">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{doc.name || provider.label}</p>
          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {provider.label}
          </span>
          {doc.is_accounting && (
            <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success" title="Documento contábil">
              Contábil
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate" title={url}>
          {doc.uploaded_by} · {uploadedAtFormatted}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleAccounting}
          className={`rounded-lg p-1.5 transition-colors ${doc.is_accounting ? "text-primary hover:bg-primary/15" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          title={doc.is_accounting ? "Remover marcação contábil" : "Marcar como contábil"}
          type="button"
        >
          <BookOpen className="h-3.5 w-3.5" />
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title="Abrir em nova aba"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <button
          onClick={onDelete}
          className="rounded-lg p-1.5 text-destructive hover:bg-destructive/15 transition-colors"
          title="Remover"
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  // Wrap with HoverCard only when we can attempt a thumbnail
  if (!thumbnailUrl || thumbFailed) {
    return row;
  }

  return (
    <HoverCard openDelay={300} closeDelay={100}>
      <HoverCardTrigger asChild>{row}</HoverCardTrigger>
      <HoverCardContent side="top" className="w-72 p-2">
        <div className="space-y-1.5">
          <img
            src={thumbnailUrl}
            alt={doc.name}
            className="w-full h-auto rounded-md object-cover bg-muted"
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
          <p className="text-[11px] text-muted-foreground text-center">
            Pré-visualização do {provider.label}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
