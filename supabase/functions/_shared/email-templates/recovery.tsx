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

interface RecoveryEmailProps {
  siteName: string
  token?: string
}

export const RecoveryEmail = ({
  siteName,
  token,
}: RecoveryEmailProps) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>Código de recuperação de senha — {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Recuperar senha</Heading>
        <Text style={text}>
          Recebemos um pedido para redefinir a sua senha em {siteName}. Use o
          código abaixo para continuar na aplicação:
        </Text>
        {token ? (
          <Text style={codeStyle}>{token}</Text>
        ) : null}
        <Text style={footer}>
          Se não solicitou esta recuperação, pode ignorar este email. A sua
          senha não será alterada. O código expira em poucos minutos.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
  color: '#1a6fb8',
  letterSpacing: '6px',
  textAlign: 'center' as const,
  margin: '16px 0 28px',
  padding: '16px',
  backgroundColor: '#f3f4f6',
  borderRadius: '12px',
}
const footer = { fontSize: '12px', color: '#9ca3af', margin: '30px 0 0', lineHeight: '1.5' }