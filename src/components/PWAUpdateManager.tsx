import { useCallback, useEffect } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { toast } from "sonner";
import { subscribeToPWAControllerChange } from "@/lib/pwa";
import { applyUpdate, subscribeToNewVersion } from "@/lib/versionCheck";

const UPDATE_TOAST_ID = "pwa-update-available";

function hasOpenDialog() {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

export function PWAUpdateManager() {
  const activeMutations = useIsMutating();

  // Ponto ÚNICO de decisão de recarregamento: tanto o service worker como o
  // poller do version.json passam por aqui.
  const handleNewVersion = useCallback(
    (buildId?: string) => {
      if (activeMutations === 0 && !hasOpenDialog()) {
        void applyUpdate(buildId);
        return;
      }

      toast("Nova versão disponível", {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        action: {
          label: "Atualizar",
          onClick: () => void applyUpdate(buildId),
        },
      });
    },
    [activeMutations],
  );

  useEffect(() => {
    return subscribeToPWAControllerChange(() => handleNewVersion());
  }, [handleNewVersion]);

  useEffect(() => {
    return subscribeToNewVersion((buildId) => handleNewVersion(buildId));
  }, [handleNewVersion]);

  return null;
}
