// Canonical server guard imported by hermetic tests: preserve actual SDK types.
declare module "npm:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}

// Only the environment contract used by multiTenant.ts; tests stub it locally.
declare const Deno: {
  env: { get(name: string): string | undefined };
};