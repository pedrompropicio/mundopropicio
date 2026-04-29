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

  // Apply CSS variable overrides from theme_config (HSL strings, e.g. "210 80% 50%").
  // Keys understood: primary, primary_foreground, accent, sidebar.
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
