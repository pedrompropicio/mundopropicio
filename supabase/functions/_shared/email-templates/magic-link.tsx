/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { BrandHeader, resolvePrimary, type BrandingProps } from './branding.tsx'

interface MagicLinkEmailProps extends BrandingProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
  brandName,
  brandLogoUrl,
  brandPrimaryColor,
}: MagicLinkEmailProps) => {
  const displayName = brandName ?? siteName
  const primary = resolvePrimary(brandPrimaryColor)
  return (
    <Html lang="pt" dir="ltr">
      <Head />
      <Preview>O seu link de acesso — {displayName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader brandLogoUrl={brandLogoUrl} brandName={displayName} />
          <Heading style={h1}>O seu link de acesso</Heading>
          <Text style={text}>
            Clique no botão abaixo para aceder a {displayName}. Este link expira em breve.
          </Text>
          <Button style={{ ...button, backgroundColor: primary }} href={confirmationUrl}>
            Aceder
          </Button>
          <Text style={footer}>
            Se não solicitou este link, pode ignorar este email com segurança.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Space Grotesk', Arial, sans-serif" }
const container = { padding: '32px 28px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1a1f2e',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#6b7280',
  lineHeight: '1.6',
  margin: '0 0 25px',
}
const button = {
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#9ca3af', margin: '30px 0 0', lineHeight: '1.5' }
