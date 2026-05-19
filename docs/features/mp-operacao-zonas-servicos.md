# MP Operação — Zonas / Serviços + Hierarquia

## Modelo

Frentes têm dois tipos:

- **Zona** (`type='zone'`) — setor físico do evento. Ex: Tenda VIP, Backstage, Palco Principal.
- **Serviço** (`type='service'`) — função transversal que pode atender várias zonas. Ex: Catering, Energia, Decoração.

## Etapas com `zone_id`

- Frente Zona → `zone_id` da etapa fica sempre NULL.
- Frente Serviço → cada etapa pode opcionalmente apontar para uma Zona (frente `type='zone'` do mesmo evento) através de `operacao_etapas.zone_id`. Permite saber a que zona física se destina cada item do serviço.

## Hierarquia de 3 níveis + Diretor

| Nível | Tabela | Scope |
|-------|--------|-------|
| Diretor | `event_team_members` role=`director` | Read-only sobre todo o evento |
| Produtor Geral | `event_team_members` role=`general_producer` | scope `full` (evento todo) ou `zones` (subset via `event_team_member_zones`) |
| Lead da Frente | `operacao_frente_team` role=`lead` | Autonomia total na sua zona/serviço |

`useIsEventDirectorOnly(eventId)` devolve true se o user só tem `director` (e não é admin nem produtor) → UI ativa banner "Modo Diretor — só visualização" e disabilita botões de escrita.

## Exemplos

- "Catering" (Serviço) cria etapa "Lanche staff 18h" e aponta zone_id → "Backstage" (Zona). Aparece nos dois sítios.
- "Energia" (Serviço) com etapa sem zone_id = etapa geral do serviço (gerador central).
- "Tenda VIP" (Zona) tem apenas etapas próprias (montar, decorar, desmontar).
