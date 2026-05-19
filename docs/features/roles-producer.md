# Role `producer` — Produtor

Role da company introduzido em OP-6 (2026-05-19) para **Diretores** e **Produtores Gerais** que precisam de gerir Operação de eventos **sem** acesso ao módulo Gestão (financeiro, BP, relatórios, audience).

Substitui o uso anterior de `manager` para estes perfis. Não afeta `event_team_members` (Director/Producer Geral/Producer Zone) — esses são papéis *dentro* do evento.

## Permissões atribuídas

| Permission | Âmbito |
|---|---|
| `view_operacao` | Ver Hub do Evento, fases, etapas, registos, chamados |
| `manage_operacao_frentes` | Criar/editar/eliminar Zonas e Serviços |
| `manage_operacao_etapas` | Criar/editar/eliminar Etapas |
| `manage_operacao_staff` | Criar/convidar/arquivar Staff de Campo |
| `manage_chamados` | Acked/resolver chamados de qualquer Frente |
| `open_chamado` | Abrir novos chamados |
| `register_operacao` | Criar Registos (diário de obra) |

## Permissões NÃO atribuídas (intencional)

- `view_balances`, `view_bp`, `view_events`, `view_reports`, `view_report_*`
- `manage_events`, `manage_transactions`, `manage_suppliers`, `manage_payment_lists`, `manage_quotations`, `manage_categories`, `manage_iva`, `manage_accounts`, `manage_tickets`, `manage_ticket_offices`, `manage_recurring`, `manage_calendar`
- `camarim_*`
- `crm.*` (audience/campaign/attribution)
- `view_ab`, `view_simulator`, `view_sponsorship`

## Priority

`platform_admin (0) > admin (1) > manager (2) > producer (3) > editor (4) > partner (5) > viewer (6) > user (7)`.

## UI

Atribuível em `/admin/utilizadores` (UserManagement) → label **Produtor**, ícone `HardHat`, cor laranja. Aparece entre Manager e Editor.
