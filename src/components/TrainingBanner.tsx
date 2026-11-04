import type { Company } from "@/hooks/useCompany";

export function TrainingBanner({ company }: { company: Pick<Company, "is_training"> | null }) {
  if (!company?.is_training) return null;
  return <div role="status" className="border border-amber-500 bg-amber-100 px-4 py-2 text-center font-semibold text-amber-950">AMBIENTE DE TREINO — nada aqui é real</div>;
}
