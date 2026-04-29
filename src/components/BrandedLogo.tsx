import { useCompanyBranding } from "@/contexts/CompanyBrandingContext";
import logoMundoPropicio from "@/assets/logo-horizontal.png";

interface Props {
  className?: string;
  alt?: string;
}

/**
 * Renders the active company logo when available, falling back to the default
 * Mundo Propício horizontal logo. The app name "MP Gestão Eventos" is fixed.
 */
export function BrandedLogo({ className = "h-9 object-contain", alt }: Props) {
  const { logoUrl, displayName } = useCompanyBranding();
  return (
    <img
      src={logoUrl ?? logoMundoPropicio}
      alt={alt ?? `${displayName} — MP Gestão Eventos`}
      className={className}
    />
  );
}
