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
  Section,
  Hr,
} from 'npm:@react-email/components@0.0.22'

import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Mundo Propício'

interface SecurityAlertProps {
  targetEmail?: string
  ip?: string
  attempts?: number
  timestamp?: string
}

const SecurityAlertEmail = ({
  targetEmail = 'desconhecido',
  ip = 'desconhecido',
  attempts = 0,
  timestamp = new Date().toLocaleString('pt-PT'),
}: SecurityAlertProps) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>⚠️ Alerta de segurança — {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={alertBanner}>
          <Text style={alertIcon}>⚠️</Text>
          <Heading style={h1}>Alerta de Segurança</Heading>
        </Section>

        <Text style={text}>
          Foram detetadas <strong>{attempts} tentativas falhadas de login</strong> para
          a conta associada ao email:
        </Text>

        <Section style={detailsBox}>
          <Text style={detailRow}>
            <strong>Email alvo:</strong> {targetEmail}
          </Text>
          <Text style={detailRow}>
            <strong>Endereço IP:</strong> {ip}
          </Text>
          <Text style={detailRow}>
            <strong>Data/hora:</strong> {timestamp}
          </Text>
          <Text style={detailRow}>
            <strong>Tentativas falhadas:</strong> {attempts}
          </Text>
        </Section>

        <Text style={text}>
          O acesso para este email/IP foi temporariamente bloqueado pelo sistema de rate-limiting.
          Se esta atividade não é reconhecida, recomendamos:
        </Text>

        <Text style={listText}>
          • Verificar se a conta comprometida tem MFA ativo{'\n'}
          • Considerar a alteração da senha do utilizador afetado{'\n'}
          • Monitorar o painel de segurança para mais atividade suspeita
        </Text>

        <Hr style={hr} />

        <Text style={footer}>
          Este é um alerta automático do sistema {SITE_NAME}.
          Recebeu este email porque é administrador da plataforma.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SecurityAlertEmail,
  subject: (data: Record<string, any>) =>
    `⚠️ Alerta: ${data.attempts || 0} tentativas falhadas de login — ${data.targetEmail || 'desconhecido'}`,
  displayName: 'Alerta de segurança',
  previewData: {
    targetEmail: 'user@example.com',
    ip: '192.168.1.100',
    attempts: 10,
    timestamp: '23/03/2026, 14:30:00',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Space Grotesk', Arial, sans-serif" }
const container = { padding: '20px 25px', maxWidth: '560px', margin: '0 auto' }
const alertBanner = { textAlign: 'center' as const, padding: '20px 0 10px' }
const alertIcon = { fontSize: '36px', margin: '0 0 8px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#c0392b', margin: '0 0 20px', textAlign: 'center' as const }
const text = { fontSize: '14px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const listText = { fontSize: '14px', color: '#333333', lineHeight: '1.8', margin: '0 0 16px', whiteSpace: 'pre-line' as const }
const detailsBox = {
  backgroundColor: '#fef3f2',
  border: '1px solid #fecaca',
  borderRadius: '8px',
  padding: '16px',
  margin: '0 0 20px',
}
const detailRow = { fontSize: '13px', color: '#333333', margin: '4px 0', lineHeight: '1.5' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.4' }
