import { useCallback, useEffect } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { toast } from "sonner";
import { subscribeToPWAControllerChange } from "@/lib/pwa";
import { applyUpdate, claimReloadGuard, subscribeToNewVersion } from "@/lib/versionCheck";

const UPDATE_TOAST_ID = "pwa-update-available";

function hasOpenDialog() {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

export function PWAUpdateManager() {
  const activeMutations = useIsMutating();

  const isBusy = activeMutations > 0 || hasOpenDialog();

  // Ponto ÚNICO de decisão: recarrega agora, ou oferece o toast.
  const requestReload = useCallback(
    (reload: () => void) => {
      if (!isBusy) {
        reload();
        return;
      }

      toast("Nova versão disponível", {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        action: {
          label: "Atualizar",
          onClick: reload,
        },
      });
    },
    [isBusy],
  );

  // Service worker: os assets já estão frescos, basta um reload simples.
  useEffect(() => {
    return subscribeToPWAControllerChange(() =>
      requestReload(() => {
        if (claimReloadGuard()) {
          window.location.reload();
        }
      }),
    );
  }, [requestReload]);

  // Poller do version.json: precisa do cache-busting agressivo.
  useEffect(() => {
    return subscribeToNewVersion((buildId) => requestReload(() => void applyUpdate(buildId)));
  }, [requestReload]);

  return null;
}

