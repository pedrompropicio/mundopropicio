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
  Button,
} from 'npm:@react-email/components@0.0.22'

import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'MP Gestão Eventos'

interface PaymentListNotificationProps {
  listTitle?: string
  paymentDate?: string
  itemCount?: number
  totalAmount?: string
  createdBy?: string
  appUrl?: string
}

const PaymentListNotificationEmail = ({
  listTitle = 'Lista de Pagamentos',
  paymentDate = '',
  itemCount = 0,
  totalAmount = '0,00 €',
  createdBy = 'sistema',
  appUrl = '',
}: PaymentListNotificationProps) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>Nova lista de pagamento aguarda aprovação — {listTitle}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={alertBanner}>
          <Text style={alertIcon}>📋</Text>
        </Section>

        <Heading style={h1}>Nova Lista de Pagamento</Heading>

        <Text style={text}>
          Uma nova lista de pagamento foi submetida para aprovação e aguarda a sua análise.
        </Text>

        <Section style={detailsBox}>
          <Text style={detailRow}>
            <strong>Título:</strong> {listTitle}
          </Text>
          <Text style={detailRow}>
            <strong>Data de Pagamento:</strong> {paymentDate}
          </Text>
          <Text style={detailRow}>
            <strong>Nº de Transações:</strong> {itemCount}
          </Text>
          <Text style={detailRow}>
            <strong>Valor Total:</strong> {totalAmount}
          </Text>
          <Text style={detailRow}>
            <strong>Criada por:</strong> {createdBy}
          </Text>
        </Section>

        {appUrl && (
          <Section style={{ textAlign: 'center' as const, margin: '24px 0' }}>
            <Button style={button} href={appUrl}>
              Ver Lista na Aplicação
            </Button>
          </Section>
        )}

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
  component: PaymentListNotificationEmail,
  subject: (data: Record<string, any>) =>
    `📋 Nova lista de pagamento: ${data.listTitle || 'Lista de Pagamentos'}`,
  displayName: 'Notificação de lista de pagamento',
  previewData: {
    listTitle: 'Pagamentos 15/04/2026',
    paymentDate: '15/04/2026',
    itemCount: 8,
    totalAmount: '12.450,00 €',
    createdBy: 'editor@empresa.com',
    appUrl: 'https://app.example.com/listas-pagamento',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Space Grotesk', Arial, sans-serif" }
const container = { padding: '20px 25px', maxWidth: '560px', margin: '0 auto' }
const alertBanner = { textAlign: 'center' as const, padding: '20px 0 10px' }
const alertIcon = { fontSize: '36px', margin: '0 0 8px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#1e40af', margin: '0 0 20px', textAlign: 'center' as const }
const text = { fontSize: '14px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const detailsBox = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '8px',
  padding: '16px',
  margin: '0 0 20px',
}
const detailRow = { fontSize: '13px', color: '#333333', margin: '4px 0', lineHeight: '1.5' }
const button = {
  backgroundColor: '#1e40af',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  textDecoration: 'none',
}
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.4' }
