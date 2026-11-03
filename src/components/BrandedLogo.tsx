import { useCompanyBranding } from "@/contexts/CompanyBrandingContext";
import { useCompany } from "@/hooks/useCompany";
import logoMundoPropicio from "@/assets/logo-horizontal.png";

interface Props {
  className?: string;
  alt?: string;
}

/**
 * Renders the active company's logo or name. Before a company is loaded,
 * retains the default Mundo Propício horizontal logo.
 */
export function BrandedLogo({ className = "h-9 object-contain", alt }: Props) {
  const { logoUrl, displayName } = useCompanyBranding();
  const { company } = useCompany();
  if (!logoUrl && company) {
    return <span className={`inline-flex items-center ${className}`}>{displayName}</span>;
  }
  return (
    <img
      src={logoUrl ?? logoMundoPropicio}
      alt={alt ?? `${displayName} — MP Gestão Eventos`}
      className={className}
    />
  );
}
