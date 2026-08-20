/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Mundo Propício'

interface Props {
  /** Nome do evento, ex.: "Ivete Sangalo — Clareou, Lisboa" */
  eventName?: string
  /** Primeiro nome do lead (opcional) */
  firstName?: string | null
  /** Rótulo do desconto, ex.: "20% de desconto" */
  discountLabel?: string | null
  /** Código do cupom */
  couponCode?: string
  /** Validade já formatada DD/MM/AAAA */
  validUntil?: string
  /** Link da bilheteira */
  ticketingUrl?: string | null
  /** true no e-mail de lembrete (3 dias antes de expirar) */
  isReminder?: boolean
}

const VipCouponEmail = ({
  eventName = '',
  firstName = null,
  discountLabel = null,
  couponCode = '',
  validUntil = '',
  ticketingUrl = null,
  isReminder = false,
}: Props) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>
      {isReminder
        ? `O teu cupom para ${eventName} expira a ${validUntil}`
        : `O teu cupom VIP para ${eventName}`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {isReminder ? 'O teu cupom está a expirar' : 'O teu cupom VIP'}
        </Heading>

        <Text style={text}>
          {firstName ? `Olá ${firstName},` : 'Olá,'}
        </Text>

        <Text style={text}>
          {isReminder ? (
            <>
              Faltam poucos dias para usares o teu cupom de <strong>{eventName}</strong>. Ele
              expira a <strong>{validUntil}</strong>.
            </>
          ) : (
            <>
              Obrigado pelo teu registo VIP em <strong>{eventName}</strong>. Aqui está o teu
              cupom{discountLabel ? <> de <strong>{discountLabel}</strong></> : null}.
            </>
          )}
        </Text>

        <Section style={couponBox}>
          {discountLabel ? <Text style={discount}>{discountLabel}</Text> : null}
          <Text style={code}>{couponCode}</Text>
          <Text style={validity}>Válido até {validUntil}</Text>
        </Section>

        {ticketingUrl ? (
          <Section style={ctaSection}>
            <Button href={ticketingUrl} style={button}>
              Comprar bilhete
            </Button>
          </Section>
        ) : null}

        <Text style={conditions}>
          Cupom válido exclusivamente para novas compras de bilhetes de {eventName} na bilheteira oficial, até {validUntil}. Não se aplica a bilhetes já adquiridos e não é acumulável com outras promoções.
        </Text>

        <Text style={smallText}>
          Usa o código no momento da compra, no campo de cupom/desconto da bilheteira.
        </Text>

        {isReminder ? (
          <Text style={smallText}>
            Se já garantiste o teu bilhete, ignora este e-mail.
          </Text>
        ) : null}

        <Hr style={hr} />

        <Text style={footer}>
          Recebeste este e-mail porque te registaste como VIP em {SITE_NAME}.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: VipCouponEmail,
  subject: (data: Record<string, any>) =>
    data.isReminder
      ? `⏳ O teu cupom para ${data.eventName ?? 'o evento'} expira a ${data.validUntil ?? ''}`.trim()
      : `🎟️ O teu cupom VIP — ${data.eventName ?? 'o teu evento'}`,
  displayName: 'Cupom VIP (imediato e lembrete)',
  previewData: {
    eventName: 'Ivete Sangalo — Clareou, Lisboa',
    firstName: 'Maria',
    discountLabel: '20% de desconto',
    couponCode: 'VIPCLAREOU20',
    validUntil: '30/09/2026',
    ticketingUrl: 'https://ticketline.pt/evento/ivete-clareou-lisboa',
    isReminder: false,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Space Grotesk', Arial, sans-serif" }
const container = { padding: '20px 25px', maxWidth: '600px', margin: '0 auto' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#1e40af',
  margin: '0 0 20px',
}
const text = { fontSize: '14px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const smallText = { fontSize: '13px', color: '#555555', lineHeight: '1.6', margin: '0 0 10px' }
const couponBox = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '10px',
  padding: '20px 16px',
  margin: '0 0 20px',
  textAlign: 'center' as const,
}
const discount = {
  fontSize: '15px',
  fontWeight: 'bold' as const,
  color: '#1e40af',
  margin: '0 0 8px',
}
const code = {
  fontSize: '26px',
  fontWeight: 'bold' as const,
  letterSpacing: '3px',
  color: '#111827',
  margin: '0 0 8px',
}
const validity = { fontSize: '13px', color: '#6b7280', margin: '0' }
const ctaSection = { textAlign: 'center' as const, margin: '0 0 20px' }
const button = {
  backgroundColor: '#1a6fb8',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 500,
  borderRadius: '12px',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const conditions = { fontSize: '12px', color: '#6b7280', lineHeight: '1.5', margin: '0 0 16px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.4' }
