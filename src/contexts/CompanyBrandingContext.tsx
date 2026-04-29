import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useCompany } from "@/hooks/useCompany";

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
