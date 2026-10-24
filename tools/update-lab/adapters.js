// Deliberately small hook/notification adapters. No React/ERP runtime is loaded.
const state = globalThis.__updateLab = {
  busy: false, dirty: false, effects: [], rerender: () => {}, action: null,
};
export function useCallback(callback) { return callback; }
export function useEffect(effect) { state.effects.push(effect() || (() => {})); }
export function useIsMutating() { return state.busy ? 1 : 0; }
export function toast(message, options) {
  state.action = options.action.onClick;
  document.querySelector('#update').hidden = false;
  document.querySelector('#update-help').textContent = 'Atualização pendente neste separador.';
  document.querySelector('#update-now').disabled = false;
}
export function rerender(manager) {
  state.effects.splice(0).forEach(cleanup => cleanup());
  manager();
}
