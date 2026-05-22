import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveOperacaoMediaUrl } from "@/lib/operacao-media";

interface Props {
  companyId: string;
  eventId: string;
  registroId: string;
  value: string | null;
  onChange: (audioPath: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function AudioRecorder({ companyId, eventId, registroId, value, onChange, onBusyChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onBusyChange?.(recording || uploading);
  }, [recording, uploading, onBusyChange]);

  useEffect(() => {
    if (!value) { setPreviewUrl(null); return; }
    resolveOperacaoMediaUrl({ path: value, registroId }).then((signedUrl) => {
      if (signedUrl) setPreviewUrl(signedUrl);
    });
  }, [value]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        const blob = new Blob(chunksRef.current, { type: mime });
        await upload(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error("Mic error", err);
      alert("Não foi possível aceder ao microfone.");
    }
  };

  const stop = () => {
    setRecording(false);
    recorderRef.current?.stop();
  };

  const upload = async (blob: Blob) => {
    setUploading(true);
    try {
      const path = `${companyId}/${eventId}/${registroId}/${crypto.randomUUID()}.webm`;
      const { error } = await supabase.storage
        .from("operacao-media")
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) { console.error(error); return; }
      onChange(path);
    } finally {
      setUploading(false);
    }
  };

  const removeAudio = () => {
    if (value) supabase.storage.from("operacao-media").remove([value]).catch(() => {});
    onChange(null);
  };

  if (value && previewUrl) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded">
        <audio controls src={previewUrl} className="flex-1 h-8" />
        <Button type="button" size="icon" variant="ghost" onClick={removeAudio}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant={recording ? "destructive" : "outline"}
      className="w-full"
      onClick={recording ? stop : start}
      disabled={uploading}
    >
      {uploading ? (
        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />A enviar áudio...</>
      ) : recording ? (
        <>
          <Square className="h-4 w-4 mr-2" />
          <span className="h-2 w-2 rounded-full bg-white mr-2 animate-pulse" />
          Parar ({seconds}s)
        </>
      ) : (
        <><Mic className="h-4 w-4 mr-2" />Gravar áudio</>
      )}
    </Button>
  );
}
