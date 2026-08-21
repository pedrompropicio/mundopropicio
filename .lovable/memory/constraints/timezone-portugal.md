---
name: Datas de vendas sempre Europe/Lisbon
description: Janelas de vendas (hoje/ontem/últimos N dias) usam sempre o fuso de Portugal, na BD e no frontend
type: constraint
---

Datas de negócio de vendas (hoje / ontem / janelas de N dias) são SEMPRE calculadas no fuso Europe/Lisbon, independentemente do fuso do utilizador (o Pedro usa a app do Brasil) e do UTC do servidor.

- **Base de dados**: proibido `current_date` / `now()::date` em lógica de vendas. Usar `(now() AT TIME ZONE 'Europe/Lisbon')::date`, idealmente uma vez num CTE `ref`. Aplicado em `get_sales_position`, `get_sales_position_by_provider`, `get_daily_sales_series`.
- **Frontend**: proibido `new Date()` nu para derivar "hoje". Usar helper com `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' })` → `yyyy-MM-dd` (ex.: `lisbonToday()` em `ReportDailySales.tsx`).
- Date pickers em que o utilizador escolhe datas explícitas ficam como estão.
- Formatação de timestamps de sync já usa `Europe/Lisbon` (rodapé "Sincronizado às").

**Why:** dados de bilheteira são portugueses; usar o fuso local do utilizador ou do servidor desalinha "hoje" e "ontem" e corrompe comparações diárias.
