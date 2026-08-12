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
  Link,
} from 'npm:@react-email/components@0.0.22'

import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'MP Gestão Eventos'

export interface BilheteiraDigestEvent {
  name: string
  portalUrl?: string | null
  crmUrl?: string | null
  /** Linhas de texto já formatadas, ex.: "Preço mínimo: 35 € → 30 €" */
  lines?: string[]
  possibleSoldOut?: boolean
}

interface Props {
  events?: BilheteiraDigestEvent[]
  runAt?: string
  updatedCount?: number
  alertCount?: number
}

const BilheteiraSyncDigestEmail = ({
  events = [],
  runAt = '',
  updatedCount = 0,
  alertCount = 0,
}: Props) => (
  <Html lang="pt" dir="ltr">
    <Head />
    <Preview>
      Atualizações automáticas de bilheteira no portal ({events.length} evento
      {events.length === 1 ? '' : 's'})
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Portal MP — atualizações de bilheteira</Heading>

        <Text style={text}>
          A varredura automática das bilheteiras atualizou a informação de lotes e preços do portal
          {runAt ? ` (${runAt})` : ''}. Resumo: <strong>{updatedCount}</strong> evento(s) atualizado(s)
          {alertCount > 0 ? (
            <>
              {' '}e <strong>{alertCount}</strong> alerta(s) a pedir confirmação manual
            </>
          ) : null}
          .
        </Text>

        {events.map((ev, i) => (
          <Section key={i} style={ev.possibleSoldOut ? alertBox : detailsBox}>
            <Text style={eventTitle}>{ev.name}</Text>

            {ev.possibleSoldOut && (
              <Text style={alertText}>
                ⚠️ Possível esgotado — confirmar manualmente. Nada foi alterado no portal.
              </Text>
            )}

            {(ev.lines ?? []).map((line, j) => (
              <Text key={j} style={detailRow}>
                • {line}
              </Text>
            ))}

            <Text style={linksRow}>
              {ev.portalUrl ? (
                <Link href={ev.portalUrl} style={link}>
                  Ver no portal
                </Link>
              ) : null}
              {ev.portalUrl && ev.crmUrl ? '   |   ' : ''}
              {ev.crmUrl ? (
                <Link href={ev.crmUrl} style={link}>
                  Editar no CRM
                </Link>
              ) : null}
            </Text>
          </Section>
        ))}

        <Hr style={hr} />

        <Text style={footer}>
          Alerta automático do sistema {SITE_NAME}. A automação nunca marca eventos como esgotados —
          esse passo é sempre manual.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BilheteiraSyncDigestEmail,
  subject: (data: Record<string, any>) => {
    const n = Array.isArray(data.events) ? data.events.length : 0
    return `Portal MP — atualizações de bilheteira (${n} evento${n === 1 ? '' : 's'})`
  },
  displayName: 'Digest de sincronização de bilheteira',
  previewData: {
    runAt: '12/08/2026 09:00',
    updatedCount: 1,
    alertCount: 1,
    events: [
      {
        name: 'Simone Mendes — Lisboa',
        portalUrl: 'https://www.mundopropicio.com/eventos/simone-mendes-lisboa-2026',
        crmUrl: 'https://mpgestaoeventos.com/crm/eventos/abc',
        lines: [
          'Preço mínimo: 35 € → 30 €',
          '1º Lote esgotou, 2º Lote — Bancada à venda 45 €',
        ],
      },
      {
        name: 'Ivete Sangalo — Porto',
        portalUrl: 'https://www.mundopropicio.com/eventos/ivete-porto-2026',
        crmUrl: 'https://mpgestaoeventos.com/crm/eventos/def',
        possibleSoldOut: true,
        lines: [],
      },
    ],
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
const detailsBox = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 12px',
}
const alertBox = {
  backgroundColor: '#fffbeb',
  border: '1px solid #fcd34d',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 12px',
}
const eventTitle = {
  fontSize: '15px',
  fontWeight: 'bold' as const,
  color: '#111827',
  margin: '0 0 8px',
}
const alertText = { fontSize: '13px', color: '#92400e', margin: '0 0 8px', lineHeight: '1.5' }
const detailRow = { fontSize: '13px', color: '#333333', margin: '3px 0', lineHeight: '1.5' }
const linksRow = { fontSize: '13px', margin: '10px 0 0' }
const link = { color: '#1e40af', textDecoration: 'underline' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.4' }
