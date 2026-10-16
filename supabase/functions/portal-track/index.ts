// portal-track (#254/#322) — entrada Deno. Lógica em handler.ts (testável com fetch/geo injetados).
// verify_jwt = false (config.toml) — ABERTA por desenho.
import { isPrivateOrInvalid, lookupIpGeo } from "../_shared/geo.ts";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler({ fetch: (...a) => fetch(...a), env: (k) => Deno.env.get(k), lookupIpGeo, isPrivateOrInvalid }));
