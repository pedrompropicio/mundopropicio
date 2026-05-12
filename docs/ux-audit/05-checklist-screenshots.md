# 05 — Checklist de capturas de tela

> Lista numerada para o utilizador capturar de uma vez. Cada captura tem nº, URL, persona, viewport, estado.
> **Naming sugerido:** `NN-modulo-estado-VIEWPORT.png` (ex: `12-transacoes-filtros-DESKTOP.png`).
> Logins recomendados: 1 conta por persona (PRO, FIN, APR, ADM).

---

## A. Layout global e onboarding

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 01 | `/login` | (deslogado) | Desktop | Tela inicial limpa |
| 02 | `/login` | (deslogado) | Mobile | Mesmo |
| 03 | `/accept-invitation?token=XYZ` | (convidado) | Desktop | Form de definição de password |
| 04 | `/` | PRO sem eventos | Desktop | Dashboard com KPIs zero |
| 05 | `/` | PRO com eventos | Desktop | Dashboard preenchido (com Master/Split) |
| 06 | `/` | FIN | Mobile | Dashboard mobile |
| 07 | `/` | ADM | Desktop | Dashboard admin (full perms) |
| 08 | `/` | ADM | Tablet 768 px | Sidebar colapsada |

## B. Sidebar e navegação

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 09 | qualquer | ADM | Desktop ≥1280 | Sidebar expandida (lg:w-56) |
| 10 | qualquer | ADM | Tablet 1023 | Sidebar só ícones |
| 11 | qualquer | ADM | Mobile 375 | Sidebar 64 px sobre conteúdo |
| 12 | qualquer | ADM | Desktop | Header com BrandedLogo + ModuleSwitcher + GlobalSearch + Bell + Theme |
| 13 | qualquer | APR | Desktop | Banner `ApprovedPaymentListReminder` visível no topo |

## C. Eventos

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 14 | `/calendario` | PRO | Desktop | Calendário com eventos |
| 15 | `/calendario` | PRO | Mobile | Mesmo |
| 16 | `/eventos` | PRO | Desktop | Lista de eventos com Master/Split agrupados |
| 17 | `/eventos` | PRO | Mobile | Mesmo |
| 18 | `/eventos` | PRO | Desktop | Modal "Novo evento" aberto (EventEditModal) |
| 19 | `/eventos/:id` | PRO | Desktop | Aba "Resumo" com 10 abas visíveis |
| 20 | `/eventos/:id` | PRO | Mobile | TabsList com scroll horizontal |
| 21 | `/eventos/:id` | FIN | Desktop | Mesmo evento, abas reduzidas (sem Cachê/Sócios/Overhead/Fecho) |
| 22 | `/eventos/:id` | PRO | Desktop | Aba "Business Plan" preenchido |
| 23 | `/eventos/:id` | ADM | Desktop | Aba "Cachê" com tiers configurados |
| 24 | `/eventos/:id` | ADM | Desktop | Aba "Overhead" |
| 25 | `/eventos/:id` | ADM | Desktop | Aba "Fecho" pronto a fechar |
| 26 | `/eventos/:id` | ADM | Desktop | Aba "Sócios" |
| 27 | `/eventos/:id` (master) | ADM | Desktop | Header com badge MASTER e lista de splits |
| 28 | `/eventos/:id/simulador` | PRO | Desktop | Vista geral do Simulador (topo) |
| 29 | `/eventos/:id/simulador` | PRO | Desktop | Card BE em modo `surplus` |
| 30 | `/eventos/:id/simulador` | PRO | Desktop | Modal "Calibrar a partir de evento" |
| 31 | `/demo/simulador` | qualquer | Desktop | Demo público |

## D. Transações

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 32 | `/transacoes` | FIN | Desktop | Vista padrão (open + filtros default) |
| 33 | `/transacoes` | FIN | Desktop | Painel `TransactionFiltersPanel` aberto |
| 34 | `/transacoes` | FIN | Desktop | Modal "Nova transação" (TransactionFormModal) |
| 35 | `/transacoes` | FIN | Desktop | Modal de eliminação cascade com warnings + checkbox |
| 36 | `/transacoes` | FIN | Mobile | Tabela com scroll horizontal |
| 37 | `/transacoes` | APR | Desktop | Filtro `status=pending` + `viewMode=open` |
| 38 | `/transacoes` | APR | Desktop | `BatchPaymentModal` aberto |
| 39 | `/transacoes` | FIN | Desktop | Estado: nenhuma transação encontrada |
| 40 | `/transacoes` | FIN | Desktop | Reembolso na listagem (mãe + filhas como linhas separadas) |
| 41 | `/recorrentes` | FIN | Desktop | Lista de templates |
| 42 | `/recorrentes` | FIN | Desktop | Modal de criação de template |

## E. Reembolsos

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 43 | `/reembolsos` | FIN | Desktop | Lista vazia |
| 44 | `/reembolsos` | FIN | Desktop | Lista com 5+ notas em estados diferentes |
| 45 | `/reembolsos` | FIN | Mobile | Mesmo |
| 46 | `/reembolsos` | FIN | Desktop | Modal "Nova Nota" |
| 47 | `/reembolsos` | FIN | Desktop | Detail da nota (`ReimbursementNoteDetail`) com 3+ itens |
| 48 | `/reembolsos` | APR | Desktop | Detail com botão "Aprovar" disponível |
| 49 | `/reembolsos` | APR | Desktop | Erro ao aprovar — "X despesas sem fatura contábil anexada" |
| 50 | `/reembolsos` | FIN | Desktop | `window.confirm("Eliminar esta nota?")` (capturar diálogo nativo) |

## F. Camarim

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 51 | `/camarim` | FIN | Desktop | Lista de sessões |
| 52 | `/camarim/:id` | FIN | Desktop | Aba "Itens" com 5+ itens |
| 53 | `/camarim/:id` | FIN | Desktop | Aba "Fundos" |
| 54 | `/camarim/:id` | FIN | Desktop | Avisos de fecho (linhas 353-384) ativos |
| 55 | `/camarim/:id` | FIN | Desktop | Sessão integrada (read-only) com card "Ver transações geradas" |
| 56 | `/camarim-equipa` | Camarim-only | Mobile | Vista PWA compacta |

## G. Bilheteiras

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 57 | `/bilheteiras` | FIN | Desktop | Lista de bilheteiras |
| 58 | `/bilheteiras` | FIN | Desktop | Modal `FeverImportModal` passo 1 |
| 59 | `/bilheteiras` | FIN | Desktop | `CoalaImportWizard` passo 1 |
| 60 | `/bilheteiras` | FIN | Desktop | `TicketOfficeSettlementModal` (fecho) |
| 61 | `/bilheteiras` | FIN | Desktop | Painel de adiantamentos (`TicketOfficeAdvancesPanel`) |
| 62 | `/bilheteiras` | FIN | Mobile | Modal de fecho em mobile |

## H. Cadastros

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 63 | `/contas` | ADM | Desktop | Contas com `is_hidden` ocultas |
| 64 | `/contas` | ADM | Desktop | Modal de criação de conta |
| 65 | `/plano-contas` | ADM | Desktop | Árvore L1>L2>L3 expandida |
| 66 | `/plano-contas` | ADM | Desktop | Picker em modal de transação (mostrar L1/L2 selecionáveis indevidamente) |
| 67 | `/fornecedores` | FIN | Desktop | Lista (label "Entidades") com mistura de fornecedor/parceiro/funcionário |
| 68 | `/fornecedores` | FIN | Desktop | `SupplierFormModal` |
| 69 | `/cotacoes` | FIN | Desktop | Lista |
| 70 | `/iva` | FIN | Desktop | Tabelas com `overflow-x-auto` |
| 71 | `/iva` | FIN | Mobile | Mesmo (capturar dor) |

## I. Relatórios

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 72 | `/relatorios` (root) | ADM | Desktop | Sidebar de relatórios com 5 grupos |
| 73 | `/relatorios` | ADM | Mobile | `<Select>` com 33 itens |
| 74 | `/relatorios/dre` | ADM | Desktop | DRE preenchido |
| 75 | `/relatorios/pl` | ADM | Desktop | Business Plan |
| 76 | `/relatorios/contas-pagar` | FIN | Desktop | Lista |
| 77 | `/relatorios/listas-pagamento` | APR | Desktop | Listas pendentes |
| 78 | `/relatorios/cache-artista` | ADM | Desktop | Vista do cachê |
| 79 | `/relatorios/auditoria-iva` | ADM | Desktop | Inconsistências |
| 80 | `/relatorios/pendencias-documentais` | ADM | Desktop | Lista de pendências |
| 81 | `/relatorios/exportacao-contabil` | ADM | Desktop | UI de exportação |
| 82 | `/relatorios/curva-vendas` | PRO | Desktop | Gráfico |
| 83 | qualquer relatório | FIN | Desktop | Capturar variantes do botão "Exportar" (3-4 variantes) |

## J. Aprovação (estado disperso)

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 84 | `/transacoes?status=pending` | APR | Desktop | Filtro pendente |
| 85 | `/reembolsos?status=approved` | APR | Desktop | Filtro aprovadas |
| 86 | `/relatorios/listas-pagamento` | APR | Desktop | Pendentes de aprovação |
| 87 | `/` | APR | Desktop | Banner reminder + badge PWA |

> Estas 4 capturas evidenciam a fragmentação que justifica H-APR-1.

## K. Admin

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 88 | `/admin` | ADM | Desktop | Painel inicial (13 cards) |
| 89 | `/admin/utilizadores` | ADM | Desktop | Lista de utilizadores |
| 90 | `/admin/utilizadores` | ADM | Desktop | `UserPermissionsModal` aberto |
| 91 | `/admin/backups` | ADM | Desktop | Lista vazia (capturar "Nenhum backup") |
| 92 | `/admin/seguranca` | ADM | Desktop | Dashboard de segurança |
| 93 | `/admin/lixeira` | ADM | Desktop | Item expandido com JSON visível |
| 94 | `/admin/auditoria-contas` | ADM | Desktop | Aba "Análise IA" |
| 95 | `/admin/auditoria-contas` | ADM | Desktop | Aba "Reordenar" |
| 96 | `/admin/formalidade` | ADM | Desktop | Sugestões pendentes |
| 97 | `/admin/auditoria-rls` | ADM | Desktop | Relatório técnico |
| 98 | `/admin/lembretes` | ADM | Desktop | Banner amarelo + lista |
| 99 | `/admin/empresas` | platform_admin | Desktop | Lista de empresas com upload de logo |

## L. Suporte/Outros

| # | URL | Persona | Viewport | Estado |
|---|-----|---------|----------|--------|
| 100 | `/ajuda` | qualquer | Desktop | Help Center root |
| 101 | `/ajuda` | qualquer | Desktop | Busca sem resultados |
| 102 | `/parceiro` | Sócio | Desktop | Portal do parceiro |
| 103 | `/parceiro/eventos/:id` | Sócio | Desktop | Aba BP do sócio (label discreto "versão vX") |

---

## Tabela de prioridade de captura

Para acelerar — se só houver tempo para 30 capturas, foca nestas (cobrem 80% dos achados):

`04, 06, 08, 11, 13, 17, 19, 20, 24, 25, 27, 32, 35, 36, 39, 40, 44, 45, 47, 49, 54, 55, 60, 65, 66, 70, 71, 73, 84, 88`.

---

## Como entregar

Sugestão: criar um zip `ux-audit-screenshots.zip` com pasta por persona ou por módulo. Nomear pelo número desta lista para fácil cruzamento com `02-analise-por-modulo.md` e `04-priorizacao.md`.
