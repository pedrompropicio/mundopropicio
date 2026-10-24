import { PWAUpdateManager } from '/manager.js';
import { startVersionCheck } from '@/lib/versionCheck';
import { registerPWA } from '@/lib/pwa';
import { rerender } from '/adapters.js';

const state = globalThis.__updateLab;
const params = new URLSearchParams(location.search);
const proposal = params.get('mode') === 'proposal';
const boots = Number(sessionStorage.getItem('lab_boots') || 0) + 1;
sessionStorage.setItem('lab_boots', String(boots));
document.querySelector('#boots').textContent = String(boots);
document.querySelector('#mode').textContent = proposal ? 'Proposta' : 'Atual (baseline)';
document.querySelector('#version').textContent = '__LAB_BUILD__';
document.querySelector(`a[href="/?mode=${proposal ? 'proposal' : 'baseline'}"]`).setAttribute('aria-current', 'page');
const render = () => rerender(PWAUpdateManager);
state.rerender = render;
document.querySelector('#draft').addEventListener('input', () => {
  state.dirty = true;
  document.querySelector('#draft-status').textContent = 'Alterações por guardar (dados fictícios).';
  render();
});
document.querySelector('#save').addEventListener('click', () => {
  state.dirty = false;
  document.querySelector('#draft-status').textContent = 'Simulação guardada; nenhuma escrita fora desta página.';
  render();
});
document.querySelector('#mutation').addEventListener('change', event => { state.busy = event.target.checked; render(); });
document.querySelector('#update-now').addEventListener('click', () => state.action?.());
document.querySelector('#deploy').addEventListener('click', async () => {
  const response = await fetch('/__lab/deploy', { method: 'POST' });
  const result = await response.json();
  document.querySelector('#publication').textContent = `Versão ${result.buildId} disponível apenas no laboratório.`;
  // Exercise the REAL version check focus callback, without waiting five minutes.
  window.dispatchEvent(new Event('focus'));
});
document.querySelector('#open-modal').addEventListener('click', () => {
  const modal = document.querySelector('#modal');
  modal.dataset.state = 'open'; modal.showModal(); render();
});
document.querySelector('#close-modal').addEventListener('click', () => {
  const modal = document.querySelector('#modal');
  modal.dataset.state = 'closed'; modal.close(); render();
});
document.querySelector('#modal').addEventListener('cancel', () => {
  document.querySelector('#modal').dataset.state = 'closed'; render();
});
render();
if (params.get('channel') === 'sw') registerPWA();
startVersionCheck();
