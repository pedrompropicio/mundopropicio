// A laboratory adapter, NOT Vite/Workbox's generated registration helper.
export function registerSW(options) {
  let registration;
  navigator.serviceWorker.register('/sw.js').then(result => {
    registration = result;
    options.onRegisteredSW?.('/sw.js', result);
    result.addEventListener('updatefound', () => {
      const worker = result.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) options.onNeedRefresh?.();
      });
    });
  }).catch(error => options.onRegisterError?.(error));
  return async () => registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
