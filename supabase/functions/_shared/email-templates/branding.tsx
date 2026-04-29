/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Img, Section } from 'npm:@react-email/components@0.0.22'

/**
 * Branding props injected by auth-email-hook based on the recipient's
 * `profiles.company_id`. All optional — templates fall back to MP defaults
 * when the lookup yields nothing (e.g. new signup before profile exists,
 * or platform_admin without active company).
 */
export interface BrandingProps {
  /** Display name shown in copy (e.g. "Coala Portugal"). */
  brandName?: string
  /** Public URL of the company logo (must be reachable from email clients). */
  brandLogoUrl?: string
  /** Primary brand colour as CSS string (e.g. "#1a6fb8"). */
  brandPrimaryColor?: string
}

const DEFAULT_PRIMARY = '#1a6fb8'

/** Resolves the effective primary colour with fallback. */
export const resolvePrimary = (color?: string): string =>
  color && color.trim().length > 0 ? color : DEFAULT_PRIMARY

/** Header section with the company logo if available, else nothing. */
export const BrandHeader = ({
  brandLogoUrl,
  brandName,
}: {
  brandLogoUrl?: string
  brandName?: string
}) => {
  if (!brandLogoUrl) return null
  return (
    <Section style={headerSection}>
      <Img
        src={brandLogoUrl}
        alt={brandName ?? 'Logo'}
        height="40"
        style={logoStyle}
      />
    </Section>
  )
}

const headerSection = {
  padding: '0 0 24px',
  textAlign: 'left' as const,
}

const logoStyle = {
  maxHeight: '40px',
  width: 'auto',
  display: 'block',
}
