import { builtinEnvironments } from 'vitest/environments';
// Capture Node HTTP constructors before jsdom replaces browser globals.
const HTTPFormData = globalThis.FormData;
const HTTPFile = globalThis.File;
export default {
  name: 'issue333-dom-http', transformMode: 'web' as const,
  async setup(global: typeof globalThis, options: any) {
    const environment = await builtinEnvironments.jsdom.setup(global, options);
    global.FormData = HTTPFormData;
    global.File = HTTPFile;
    return environment;
  },
};