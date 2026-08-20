import { useEffect } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { toast } from "sonner";
import { subscribeToPWAControllerChange } from "@/lib/pwa";

const UPDATE_TOAST_ID = "pwa-update-available";

function hasOpenDialog() {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

export function PWAUpdateManager() {
  const activeMutations = useIsMutating();

  useEffect(() => {
    return subscribeToPWAControllerChange(() => {
      if (activeMutations === 0 && !hasOpenDialog()) {
        window.location.reload();
        return;
      }

      toast("Nova versão disponível", {
        id: UPDATE_TOAST_ID,
        duration: Infinity,
        action: {
          label: "Atualizar",
          onClick: () => window.location.reload(),
        },
      });
    });
  }, [activeMutations]);

  return null;
}