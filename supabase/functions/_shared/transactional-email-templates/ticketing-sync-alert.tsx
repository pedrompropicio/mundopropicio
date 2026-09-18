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

const SITE_NAME = 'MP Gestão Eventos'

export interface TicketingSyncAlertItem {
  evento: string
  bilheteira: string
  /** 'a' falha persistente · 'b' parado · 'c' desligado · 'd' captura horária parada */
  condicao: string
  detalhe?: string | null
  desdeQuando?: string | null
}

interface Props {
  runAt?: string
  itens?: TicketingSyncAlertItem[]
}

const LABELS: Record<string, string> = {
  a: 'Falha persistente (3 corridas seguidas sem sucesso)',
  b: 'Parado (sem corrida com sucesso há mais de 6 horas)',
  c: 'Desligado',
  d: 'Captura horária da Ticketline parada',
}

const TicketingSyncAlertEmail = ({ runAt = '', itens = [] }: Props) => (
  <Html lang="pt" dir="ltr">
    <Head>
      <meta charSet="utf-8" />
    </Head>
    <Preview>
      Sync de bilheteira a precisar de atenção ({itens.length} caso
      {itens.length === 1 ? '' : 's'})
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Sync de bilheteira precisa de atenção</Heading>

        <Text style={text}>
          A verificação automática de saúde das bilheteiras encontrou{' '}
          <strong>{itens.length}</strong> caso{itens.length === 1 ? '' : 's'} a precisar de
          atenção{runAt ? ` (${runAt})` : ''}. Enquanto isto durar, as vendas desses eventos
          ficam congeladas na data do último import com sucesso.
        </Text>

        {itens.map((it, i) => (
          <Section key={i} style={box}>
            <Text style={eventTitle}>
              {it.evento} — {it.bilheteira}
            </Text>
            <Text style={detailRow}>
              • {LABELS[it.condicao] ?? `Condição ${it.condicao}`}
            </Text>
            {it.desdeQuando ? (
              <Text style={detailRow}>• Último sucesso: {it.desdeQuando}</Text>
            ) : null}
            {it.detalhe ? <Text style={detailRow}>• {it.detalhe}</Text> : null}
          </Section>
        ))}

        <Hr style={hr} />

        <Text style={footer}>
          Alerta automático do sistema {SITE_NAME} (verificação horária de saúde das
          bilheteiras). Configurações desligadas de propósito não geram e-mail — aparecem só
          no aviso dentro da aplicação.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TicketingSyncAlertEmail,
  subject: (data: Record<string, any>) => {
    const n = Array.isArray(data.itens) ? data.itens.length : 0
    return `⚠️ Sync de bilheteira parado (${n} caso${n === 1 ? '' : 's'})`
  },
  displayName: 'Alerta de saúde do sync de bilheteira',
  previewData: {
    runAt: '18/09/2026 14:45',
    itens: [
      {
        evento: 'RG - Lisboa',
        bilheteira: 'Ticketline',
        condicao: 'a',
        detalhe: 'XLSX sale_summary: HTML em vez de XLSX — title="Ticketline Manager"',
        desdeQuando: '14/09/2026 21:05',
      },
      {
        evento: 'Conferência de Mulheres Plenitude',
        bilheteira: 'BOL',
        condicao: 'b',
        detalhe: 'import_failed: total do M2 não bate com a soma dos setores',
        desdeQuando: '16/09/2026 17:25',
      },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Space Grotesk', Arial, sans-serif" }
const container = { padding: '20px 25px', maxWidth: '600px', margin: '0 auto' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#b45309',
  margin: '0 0 20px',
}
const text = { fontSize: '14px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const box = {
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
const detailRow = { fontSize: '13px', color: '#333333', margin: '3px 0', lineHeight: '1.5' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '0', lineHeight: '1.4' }
