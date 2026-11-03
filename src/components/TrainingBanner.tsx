import { useCompany } from "@/hooks/useCompany";

export function TrainingBanner() {
  const { company } = useCompany();
  if (!company?.is_training) return null;
  return (
    <div
      role="status"
      className="fixed left-0 right-0 z-50 flex h-12 items-center justify-center bg-amber-400 px-2 text-center text-xs font-bold text-black sm:text-sm"
      style={{ top: "calc(3.5rem + env(safe-area-inset-top))" }}
    >
      AMBIENTE DE TREINO — nada aqui é real
    </div>
  );
}
