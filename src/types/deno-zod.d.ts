// Edge handlers imported by local tests use Deno's versioned npm specifier.
// Preserve the actual Zod types rather than replacing the validator with any.
declare module 'npm:zod@3.23.8' {
 export { z } from 'zod';
}
declare module 'npm:zod@3' {
 export { z } from 'zod';
}
// Real SDK types for server modules exercised by local tests; no any shims.
declare module 'npm:ai@6' {
 export * from 'ai';
}
declare module 'npm:@ai-sdk/openai@3' {
 export * from '@ai-sdk/openai';
}