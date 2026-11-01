import { useEffect, useSyncExternalStore } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { clearDirty, markDirty, WORK_KEY_DIALOG, WORK_KEY_MUTATIONS } from "@/lib/pending-work";
import { updater } from "@/lib/updater";

function hasOpenDialog() {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

/** Liga mutações em curso e dialogs abertos ao registo de trabalho pendente. */
function useSystemPendingWork() {
  const activeMutations = useIsMutating();

  useEffect(() => {
    if (activeMutations > 0) markDirty(WORK_KEY_MUTATIONS);
    else clearDirty(WORK_KEY_MUTATIONS);
  }, [activeMutations]);

  useEffect(() => {
    let timer: number | null = null;
    const sync = () => {
      timer = null;
      if (hasOpenDialog()) markDirty(WORK_KEY_DIALOG);
      else clearDirty(WORK_KEY_DIALOG);
    };
    const schedule = () => {
      if (timer === null) timer = window.setTimeout(sync, 150);
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
      clearDirty(WORK_KEY_DIALOG);
    };
  }, []);

  useEffect(
    () => () => {
      clearDirty(WORK_KEY_MUTATIONS);
    },
    [],
  );
}

/**
 * Aviso persistente de versão nova (sem botão de fechar). Nunca recarrega
 * sozinho: o reload só acontece ao clicar «Atualizar», e só sem trabalho
 * pendente (revalidado dentro do actualizador antes de navegar).
 */
export function PWAUpdateManager() {
  useSystemPendingWork();
  const view = useSyncExternalStore(updater.subscribe, updater.getView, updater.getView);

  if (!view.available) return null;

  const message =
    view.reason === "chunk-error"
      ? "Não foi possível carregar uma parte da aplicação — provavelmente há uma versão nova."
      : "Nova versão disponível.";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pwa-update-banner"
      className="fixed bottom-4 left-1/2 z-[100] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-2 rounded-md border bg-background p-4 shadow-lg"
    >
      <p className="text-sm font-medium">{message}</p>
      {view.blockers.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="pwa-update-blockers">
          Para não perder trabalho, só pode atualizar quando terminar: {view.blockers.join("; ")}.
        </p>
      )}
      <Button
        size="sm"
        className="self-end"
        disabled={!view.canApply}
        onClick={() => void updater.apply()}
      >
        {view.applying ? "A atualizar…" : "Atualizar"}
      </Button>
    </div>
  );
}
