import { useCompanyBranding } from "@/contexts/CompanyBrandingContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useCompany } from "@/hooks/useCompany";
import logoMundoPropicio from "@/assets/logo-horizontal.png";

interface Props {
  className?: string;
  alt?: string;
  variant?: "square" | "horizontal";
}

/**
 * Renders the active company's logo or name. Before a company is loaded,
 * retains the default Mundo Propício horizontal logo.
 */
export function BrandedLogo({ className = "h-9 object-contain", alt, variant = "square" }: Props) {
  const { logoUrl, logoDarkUrl, logoHorizontalUrl, logoHorizontalDarkUrl, displayName } = useCompanyBranding();
  const { theme } = useTheme();
  const { company } = useCompany();
  const squareUrl = theme === "dark" ? logoDarkUrl ?? logoUrl : logoUrl;
  const selectedUrl = variant === "horizontal"
    ? (theme === "dark" ? logoHorizontalDarkUrl ?? logoHorizontalUrl : logoHorizontalUrl) ?? squareUrl
    : squareUrl;
  if (!selectedUrl && company) {
    return <span className={`inline-flex items-center ${className}`}>{displayName}</span>;
  }
  return (
    <img
      src={selectedUrl ?? logoMundoPropicio}
      alt={alt ?? `${displayName} — MP Gestão Eventos`}
      className={className}
    />
  );
}
