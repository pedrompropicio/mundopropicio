import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { previewCount } from "./audienceSnapshot";
import type { Criterion } from "./audienceCriterion";

interface Props {
  criterion: Criterion;
}

export default function AudiencePreviewCount({ criterion }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const n = await previewCount(criterion);
        setCount(n);
      } catch (e: any) {
        setError(e?.message ?? "erro");
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [JSON.stringify(criterion)]);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm bg-emerald-500/10 border-emerald-500/30 text-emerald-700">
      {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      {error ? (
        <span className="text-destructive">Erro: {error}</span>
      ) : count == null ? (
        <span>A calcular…</span>
      ) : (
        <span>{count.toLocaleString("pt-PT")} contactos correspondem</span>
      )}
    </div>
  );
}
