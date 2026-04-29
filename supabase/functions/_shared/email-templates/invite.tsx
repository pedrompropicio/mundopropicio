/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { BrandHeader, resolvePrimary, type BrandingProps } from './branding.tsx'

interface InviteEmailProps extends BrandingProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  brandName,
  brandLogoUrl,
  brandPrimaryColor,
}: InviteEmailProps) => {
  const displayName = brandName ?? siteName
  const primary = resolvePrimary(brandPrimaryColor)
  return (
    <Html lang="pt" dir="ltr">
      <Head />
      <Preview>Foi convidado para {displayName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader brandLogoUrl={brandLogoUrl} brandName={displayName} />
          <Heading style={h1}>Foi convidado</Heading>
          <Text style={text}>
            Foi convidado para se juntar a{' '}
            <Link href={siteUrl} style={link}>
              <strong>{displayName}</strong>
            </Link>
            . Clique no botão abaixo para aceitar o convite e criar a sua conta.
          </Text>
          <Button style={{ ...button, backgroundColor: primary }} href={confirmationUrl}>
            Aceitar Convite
          </Button>
          <Text style={footer}>
            Se não esperava este convite, pode ignorar este email com segurança.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default InviteEmail

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
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#9ca3af', margin: '30px 0 0', lineHeight: '1.5' }
