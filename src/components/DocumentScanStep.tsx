import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Crop, ImageOff, RotateCcw, RefreshCw } from "lucide-react";
import {
  CornerPoints,
  defaultCorners,
  detectCorners,
  extractDocument,
  fileToImage,
  imageToCanvas,
  loadScanner,
} from "@/lib/document-scan";

type CornerKey = keyof CornerPoints;
const KEYS: CornerKey[] = ["topLeftCorner", "topRightCorner", "bottomRightCorner", "bottomLeftCorner"];

interface Props {
  /** Foto original (já normalizada de HEIC). */
  file: File;
  /** Confirmado com o ficheiro processado (JPEG). */
  onConfirm: (processed: File) => void;
  /** Seguir com a foto crua, como antes. */
  onUseOriginal: () => void;
  /** Repetir a captura (reabre câmera), mantendo campos preenchidos. */
  onRetake: () => void;
  onCancel: () => void;
}

export function DocumentScanStep({ file, onConfirm, onUseOriginal, onRetake, onCancel }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scannerRef = useRef<any>(null);

  const [state, setState] = useState<"loading" | "ready" | "failed" | "processing">("loading");
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [corners, setCorners] = useState<CornerPoints | null>(null);
  const [autoFailed, setAutoFailed] = useState(false);
  const [dragging, setDragging] = useState<CornerKey | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const img = await fileToImage(file);
        if (cancelled) return;
        const canvas = imageToCanvas(img);
        imgCanvasRef.current = canvas;
        setDims({ w: canvas.width, h: canvas.height });
        setPreviewUrl(canvas.toDataURL("image/jpeg", 0.85));

        const scanner = await loadScanner();
        if (cancelled) return;
        scannerRef.current = scanner;
        const detected = detectCorners(scanner, canvas);
        setAutoFailed(!detected);
        setCorners(detected ?? defaultCorners(canvas.width, canvas.height));
        setState("ready");
      } catch (err) {
        console.error("[scan] falhou", err);
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const toImageCoords = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * dims.w;
    const y = ((clientY - rect.top) / rect.height) * dims.h;
    return {
      x: Math.min(dims.w, Math.max(0, x)),
      y: Math.min(dims.h, Math.max(0, y)),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !corners) return;
    e.preventDefault();
    setCorners({ ...corners, [dragging]: toImageCoords(e.clientX, e.clientY) });
  };

  const confirm = async () => {
    if (!corners || !imgCanvasRef.current || !scannerRef.current) return;
    setState("processing");
    try {
      const processed = await extractDocument(scannerRef.current, imgCanvasRef.current, corners, file.name);
      onConfirm(processed);
    } catch (err: any) {
      console.error(err);
      setState("ready");
    }
  };

  if (state === "failed") {
    return (
      <Card>
        <CardContent className="p-4 space-y-3 text-center">
          <ImageOff className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            O enquadramento automático não está disponível agora.
          </p>
          <Button className="w-full h-12" onClick={onUseOriginal}>Usar foto original</Button>
          <Button variant="ghost" className="w-full" onClick={onCancel}>Cancelar</Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "loading") {
    return (
      <Card>
        <CardContent className="p-4 space-y-3 text-center">
          <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">A preparar o enquadramento…</p>
          <Button variant="outline" className="w-full h-12" onClick={onUseOriginal}>
            Usar foto original
          </Button>
        </CardContent>
      </Card>
    );
  }

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const poly = corners
    ? KEYS.map((k) => `${pct(corners[k].x, dims.w)} ${pct(corners[k].y, dims.h)}`).join(", ")
    : "";

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          {autoFailed
            ? "Não detetei os contornos — arrasta os 4 cantos para enquadrar."
            : "Confirma o enquadramento (podes arrastar os cantos)."}
        </p>

        <div
          ref={wrapRef}
          className="relative w-full touch-none select-none rounded-md overflow-hidden bg-muted"
          onPointerMove={onPointerMove}
          onPointerUp={() => setDragging(null)}
          onPointerLeave={() => setDragging(null)}
        >
          {previewUrl && (
            <img src={previewUrl} alt="Foto a enquadrar" className="w-full block" draggable={false} />
          )}
          <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="none">
            {corners && (
              <polygon
                points={KEYS.map((k) => `${corners[k].x},${corners[k].y}`).join(" ")}
                className="fill-primary/15 stroke-primary"
                strokeWidth={Math.max(2, dims.w / 250)}
              />
            )}
          </svg>
          {corners &&
            KEYS.map((k) => (
              <button
                key={k}
                type="button"
                aria-label={`Canto ${k}`}
                onPointerDown={(e) => {
                  e.currentTarget.releasePointerCapture?.(e.pointerId);
                  setDragging(k);
                }}
                className="absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background/70"
                style={{ left: pct(corners[k].x, dims.w), top: pct(corners[k].y, dims.h) }}
              />
            ))}
          <span className="sr-only">{poly}</span>
        </div>

        <div className="grid gap-2">
          <Button className="w-full h-14 text-base" onClick={confirm} disabled={state === "processing"}>
            {state === "processing" ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Crop className="h-5 w-5 mr-2" />
            )}
            Confirmar enquadramento
          </Button>
          <Button variant="secondary" className="w-full h-12" onClick={onRetake} disabled={state === "processing"}>
            <RefreshCw className="h-4 w-4 mr-2" /> Repetir foto
          </Button>
          <Button variant="outline" className="w-full" onClick={onUseOriginal} disabled={state === "processing"}>
            Usar foto original
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => imgCanvasRef.current && setCorners(defaultCorners(dims.w, dims.h))}
            disabled={state === "processing"}
          >
            <RotateCcw className="h-3 w-3 mr-2" /> Reiniciar cantos
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
