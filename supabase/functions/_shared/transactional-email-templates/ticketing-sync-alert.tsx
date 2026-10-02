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
  /** 'a' falha persistente · 'b' parado · 'c' desligado · 'd' captura horária parada · 'e' divergência portal · 'f' 6 sem sucesso */
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
  e: 'Divergência com o portal de Produtores da Ticketline',
}

// O valor em euros chega do SQL como "EUR" (texto ASCII) e é desenhado aqui com a
// entidade HTML &euro; — evita o losango de interrogação quando o símbolo se parte
// algures entre a BD, o pedido HTTP e o cliente de email.
const Detail = ({ text }: { text: string }) => {
  const parts = text.split(/\s?(?:EUR|€)/)
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 ? <span dangerouslySetInnerHTML={{ __html: '&nbsp;&euro;' }} /> : null}
        </React.Fragment>
      ))}
    </>
  )
}

const ItemBox = ({ it, divergence }: { it: TicketingSyncAlertItem; divergence: boolean }) => (
  <Section style={divergence ? boxInfo : box}>
    <Text style={eventTitle}>
      {it.evento} — {it.bilheteira}
    </Text>
    {!divergence ? (
      <Text style={detailRow}>• {LABELS[it.condicao] ?? `Condição ${it.condicao}`}</Text>
    ) : null}
    {it.desdeQuando ? (
      <Text style={detailRow}>
        • {divergence ? 'Leitura do portal' : 'Último sucesso'}: {it.desdeQuando}
      </Text>
    ) : null}
    {it.detalhe ? (
      <Text style={detailRow}>
        • <Detail text={it.detalhe} />
      </Text>
    ) : null}
  </Section>
)

const TicketingSyncAlertEmail = ({ runAt = '', itens = [] }: Props) => {
  const sync = itens.filter((it) => it.condicao !== 'e')
  const div = itens.filter((it) => it.condicao === 'e')
  return (
    <Html lang="pt" dir="ltr">
      <Head>
        <meta charSet="utf-8" />
      </Head>
      <Preview>
        Bilheteiras a precisar de atenção ({itens.length} caso{itens.length === 1 ? '' : 's'})
      </Preview>
      <Body style={main}>
        <Container style={container}>
          {sync.length > 0 ? (
            <>
              <Heading style={h1}>Sync de bilheteira precisa de atenção</Heading>
              <Text style={text}>
                A verificação automática de saúde das bilheteiras encontrou{' '}
                <strong>{sync.length}</strong> caso{sync.length === 1 ? '' : 's'} a precisar de
                atenção{runAt ? ` (${runAt})` : ''}. Enquanto isto durar, as vendas desses eventos
                ficam congeladas na data do último import com sucesso.
              </Text>
              {sync.map((it, i) => (
                <ItemBox key={`s${i}`} it={it} divergence={false} />
              ))}
            </>
          ) : null}

          {div.length > 0 ? (
            <>
              <Heading style={sync.length > 0 ? h2 : h1Info}>
                Divergência com o portal de Produtores
              </Heading>
              <Text style={text}>
                {div.length} evento{div.length === 1 ? '' : 's'} com diferença entre as nossas vendas e
                o Mapa de Ocupação do portal de Produtores da Ticketline
                {runAt ? ` (${runAt})` : ''}. A captura está a funcionar e as vendas continuam a
                entrar; o que diverge é a comparação com o portal, em duas leituras diárias
                seguidas (ou o evento não foi encontrado no portal).
              </Text>
              {div.map((it, i) => (
                <ItemBox key={`d${i}`} it={it} divergence />
              ))}
            </>
          ) : null}

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
}

export const template = {
  component: TicketingSyncAlertEmail,
  subject: (data: Record<string, any>) => {
    const itens: TicketingSyncAlertItem[] = Array.isArray(data.itens) ? data.itens : []
    const n = itens.length
    if (n > 0 && itens.every((it) => it.condicao === 'e')) {
      return `Divergência com o portal de Produtores (${n} caso${n === 1 ? '' : 's'})`
    }
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
      {
        evento: 'RG - Almada',
        bilheteira: 'Ticketline',
        condicao: 'e',
        detalhe: 'Plataforma - portal: 85 bilhetes em 751 (11,3%), +2.830,00 EUR (02/10); 83 bilhetes em 751 (11,1%), +2.760,00 EUR (01/10)',
        desdeQuando: '02/10/2026',
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
const h1Info = { ...h1, color: '#1d4ed8' }
const h2 = { fontSize: '18px', fontWeight: 'bold' as const, color: '#1d4ed8', margin: '24px 0 12px' }
const boxInfo = {
  backgroundColor: '#eff6ff',
  border: '1px solid #93c5fd',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '0 0 12px',
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
