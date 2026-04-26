import { createContext, useContext, useState, useMemo, ReactNode, useEffect } from "react";

/**
 * Contexto partilhado para o cenário ativo num evento.
 *
 * Fornece o `selectedVersionId` (UUID de bp_versions ou null=Ativa) que é
 * sincronizado entre as abas BP, Bilheteira e Cachê do mesmo evento.
 *
 * Modelo: `null` = vista da versão Ativa em produção.
 *         `string (uuid)` = vista de um cenário sandbox (rascunho).
 */
interface EventScenarioContextValue {
  selectedVersionId: string | null;
  setSelectedVersionId: (versionId: string | null) => void;
  isScenarioMode: boolean;
}

const EventScenarioContext = createContext<EventScenarioContextValue | undefined>(undefined);

interface ProviderProps {
  /** ID do evento — usado apenas para resetar o cenário se mudar de evento. */
  eventId: string;
  children: ReactNode;
}

export function EventScenarioProvider({ eventId, children }: ProviderProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  // Reset ao mudar de evento (caso o provider seja reutilizado em SPA navigation)
  useEffect(() => {
    setSelectedVersionId(null);
  }, [eventId]);

  const value = useMemo<EventScenarioContextValue>(
    () => ({
      selectedVersionId,
      setSelectedVersionId,
      isScenarioMode: selectedVersionId !== null,
    }),
    [selectedVersionId]
  );

  return <EventScenarioContext.Provider value={value}>{children}</EventScenarioContext.Provider>;
}

/**
 * Hook que devolve o cenário ativo. Se chamado fora de um Provider, devolve
 * `null` (modo Ativa) — útil para usar em componentes que podem ser renderizados
 * fora do contexto de evento.
 */
export function useEventScenario(): EventScenarioContextValue {
  const ctx = useContext(EventScenarioContext);
  if (!ctx) {
    return {
      selectedVersionId: null,
      setSelectedVersionId: () => {},
      isScenarioMode: false,
    };
  }
  return ctx;
}
