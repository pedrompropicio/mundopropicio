// Experimental policy ONLY. Does not replace the ERP component.
import { subscribeToNewVersion, applyUpdate } from '@/lib/versionCheck';
import { subscribeToPWAControllerChange } from '@/lib/pwa';
import { useEffect } from 'react';
export function PWAUpdateManager() {
  const state = globalThis.__updateLab;
  function offer(buildId) {
    const banner = document.querySelector('#update');
    banner.hidden = false;
    const blocked = state.busy || state.dirty || document.querySelector('[role="dialog"][data-state="open"]');
    document.querySelector('#update-now').disabled = Boolean(blocked);
    document.querySelector('#update-help').textContent = blocked
      ? 'Conclua ou guarde o trabalho antes de atualizar.'
      : 'A versão só será aplicada quando escolher atualizar.';
    state.action = async () => {
      // Re-check at click time, not merely when the banner was displayed.
      if (state.busy || state.dirty || document.querySelector('[role="dialog"][data-state="open"]')) return;
      await applyUpdate(buildId);
    };
  }
  useEffect(() => subscribeToNewVersion(offer), []);
  useEffect(() => subscribeToPWAControllerChange(() => offer()), []);
}
