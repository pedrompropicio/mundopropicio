/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { BrandHeader, resolvePrimary, type BrandingProps } from './branding.tsx'

interface ReauthenticationEmailProps extends BrandingProps {
  token: string
}

export const ReauthenticationEmail = ({
  token,
  brandName,
  brandLogoUrl,
  brandPrimaryColor,
}: ReauthenticationEmailProps) => {
  const primary = resolvePrimary(brandPrimaryColor)
  return (
    <Html lang="pt" dir="ltr">
      <Head />
      <Preview>O seu código de verificação</Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader brandLogoUrl={brandLogoUrl} brandName={brandName} />
          <Heading style={h1}>Código de verificação</Heading>
          <Text style={text}>Use o código abaixo para confirmar a sua identidade:</Text>
          <Text style={{ ...codeStyle, color: primary }}>{token}</Text>
          <Text style={footer}>
            Este código expira em breve. Se não solicitou este código, pode
            ignorar este email com segurança.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default ReauthenticationEmail

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
const codeStyle = {
  fontSize: '32px',
  fontWeight: 'bold' as const,
  letterSpacing: '6px',
  textAlign: 'center' as const,
  margin: '16px 0 28px',
  padding: '16px',
  backgroundColor: '#f3f4f6',
  borderRadius: '12px',
}
const footer = { fontSize: '12px', color: '#9ca3af', margin: '30px 0 0', lineHeight: '1.5' }
