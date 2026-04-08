
## Redesenho do Sistema de Importação de PDF de Bilheteira

### Contexto
O novo formato PDF da Ticketline organiza dados por **Zona real** (1ª Plateia, Cadeiras de Orquestra, Tribuna 1 Impar, etc.) com sub-linhas por **Tipo de Bilhete** (Normal, Black Friday -20%, Promocode, etc.). O cabeçalho contém nome do espetáculo, período, sessão (data/hora) e local (sala).

### 1. Atualizar Edge Function `extract-ticket-pdf`
- Reescrever o prompt para extrair dados no novo formato: **zona → tipo de bilhete → preço → quantidades**
- Cada linha extraída terá: `zona`, `tipo_bilhete`, `preco_unitario`, `quantidade_total` (1ª Qt), `quantidade_vendida` (2ª Qt), `valor_vendido`
- Extrair do cabeçalho: `event_name`, `session_date`, `session_time`, `venue_name`, `period_from`, `period_to`
- Extrair linha TOTAL para validação cruzada

### 2. Matching automático do evento
- Comparar `event_name` do PDF com nomes dos eventos no app (similaridade)
- Comparar `venue_name` com o nome da sala do evento
- Comparar `session_date` + `session_time` com as sessões do evento
- Mostrar alerta se houver divergência, mas permitir prosseguir

### 3. Reconciliação de zonas/lotes no preview
- Mostrar cada zona do PDF lado a lado com as zonas existentes no planejamento
- Auto-match por nome similar ou preço unitário
- Para zonas sem match: permitir ao utilizador escolher entre **criar nova zona** ou **mapear a uma zona existente**
- Para tipos de bilhete (Black Friday, Promocode, etc.): criar como **lotes** dentro da zona correspondente

### 4. Validação de totais
- Somar todas as linhas extraídas e comparar com a linha TOTAL do PDF
- Mostrar banner de alerta se divergir mais de 1 unidade/euro

### 5. Importação
- Registar vendas (`ticket_sales`) por lote/zona com o preço e quantidade correctos
- Auto-provisionar zonas e lotes em falta
- Atualizar `tickets_sold` no evento

### Ficheiros a alterar
- `supabase/functions/extract-ticket-pdf/index.ts` — novo prompt
- `src/components/TicketUploadModals.tsx` — novo fluxo de preview com reconciliação
