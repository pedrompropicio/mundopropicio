import { vi } from "vitest";
vi.stubGlobal("fetch", () => { throw new Error("#333 isolated validation: external egress prohibited"); });
