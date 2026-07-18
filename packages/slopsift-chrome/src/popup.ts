import { DEFAULT_SETTINGS, type ExtensionSettings } from './protocol.js';

const enabled = document.querySelector<HTMLInputElement>('#enabled')!;
const minimumSeverity = document.querySelector<HTMLSelectElement>('#minimumSeverity')!;
const status = document.querySelector<HTMLElement>('#status')!;

void chrome.storage.local.get(DEFAULT_SETTINGS).then((stored) => {
  const settings = { ...DEFAULT_SETTINGS, ...stored } as ExtensionSettings;
  enabled.checked = settings.enabled;
  minimumSeverity.value = settings.minimumSeverity;
  status.textContent = settings.enabled ? 'Watching editable text' : 'Paused';
});

enabled.addEventListener('change', () => {
  void chrome.storage.local.set({ enabled: enabled.checked });
  status.textContent = enabled.checked ? 'Watching editable text' : 'Paused';
});

minimumSeverity.addEventListener('change', () => {
  void chrome.storage.local.set({ minimumSeverity: minimumSeverity.value });
});
