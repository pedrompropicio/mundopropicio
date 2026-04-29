import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useCompany } from "@/hooks/useCompany";

/** Convert "#RRGGBB" or "#RGB" → "H S% L%" string for CSS HSL variables. Returns null if invalid. */
function hexToHslString(hex: string): string | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: hue = ((b - r) / d + 2); break;
      case b: hue = ((r - g) / d + 4); break;
    }
    hue *= 60;
  }
  return `${Math.round(hue)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

interface BrandingContextValue {
  logoUrl: string | null;
  displayName: string;
}

const BrandingContext = createContext<BrandingContextValue>({
  logoUrl: null,
  displayName: "MP Gestão Eventos",
});

export function CompanyBrandingProvider({ children }: { children: ReactNode }) {
  const { company } = useCompany();
  const theme = (company?.theme_config ?? {}) as Record<string, any>;
  const logoUrl = company?.logo_url ?? null;
  const faviconUrl = company?.favicon_url ?? null;

  // Apply CSS variable overrides from theme_config.
  // Two formats are supported:
  //  - HSL strings (e.g. "210 80% 50%") under keys: primary, primary_foreground, accent, sidebar.
  //  - Hex string under `primary_color` (e.g. "#5e30eb") — converted to HSL and applied to --primary + --ring.
  useEffect(() => {
    const root = document.documentElement;
    const overrideKeys: Array<[string, string]> = [
      ["primary", "--primary"],
      ["primary_foreground", "--primary-foreground"],
      ["accent", "--accent"],
      ["sidebar", "--sidebar-background"],
    ];
    const cleanupKeys: string[] = [];
    overrideKeys.forEach(([cfgKey, cssVar]) => {
      const v = theme?.[cfgKey];
      if (typeof v === "string" && v.trim()) {
        root.style.setProperty(cssVar, v.trim());
        cleanupKeys.push(cssVar);
      }
    });

    // Hex `primary_color` from the company editor → applies to --primary, --ring, --sidebar-primary.
    const hex = typeof theme?.primary_color === "string" ? theme.primary_color.trim() : "";
    const hsl = hexToHslString(hex);
    if (hsl) {
      const hexVars = ["--primary", "--ring", "--sidebar-primary"];
      hexVars.forEach((cssVar) => {
        root.style.setProperty(cssVar, hsl);
        cleanupKeys.push(cssVar);
      });
    }

    return () => {
      cleanupKeys.forEach((k) => root.style.removeProperty(k));
    };
  }, [theme]);

  // Apply favicon override
  useEffect(() => {
    if (!faviconUrl) return;
    const link =
      (document.querySelector("link[rel='icon']") as HTMLLinkElement) ??
      Object.assign(document.createElement("link"), { rel: "icon" });
    const previous = link.href;
    link.href = faviconUrl;
    if (!link.parentNode) document.head.appendChild(link);
    return () => {
      if (previous) link.href = previous;
    };
  }, [faviconUrl]);

  return (
    <BrandingContext.Provider
      value={{
        logoUrl,
        displayName: company?.display_name ?? "MP Gestão Eventos",
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useCompanyBranding() {
  return useContext(BrandingContext);
}
