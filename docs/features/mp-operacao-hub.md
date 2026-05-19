# MP Operação — Hub do Evento (OP-1a)

Substitui a antiga `/operacao` (que era apenas filtros + tabs vazias) por um fluxo orientado a evento.

## Rotas

- `/operacao` → **Lista de eventos** com badge da fase actual (`events.operacao_mode`).
  - Ordenação: planning → montagem → evento → post; depois passados.
  - Cada card mostra nome, datas, localização, nº etapas, nº chamados abertos.
- `/operacao/:eventId` → **Hub do Evento** com header sticky, pills de fase e conteúdo por fase.

## Fases (`events.operacao_mode`)

| Fase | Badge | Conteúdo |
|------|-------|----------|
| `setup` (NULL ou pill) | ⚙️ Setup | 3 cartões: Equipa · Zonas · Serviços + barra de progresso `Setup X/3` |
| `planning` | 🎯 Planeamento | Placeholder + lista de Zonas/Serviços |
| `montagem` | 🔧 Montagem | Placeholder |
| `evento` | 🎤 Evento | Placeholder + link para `/operacao/dashboard` |
| `post` | 📦 Fecho | Placeholder |

Mudança de fase escreve em `events.operacao_mode`. Requer `manage_operacao_etapas`, `manage_operacao_frentes` ou admin. Confirma antes de avançar para `montagem`/`evento`.

## Nomenclatura Zona / Serviço

DB mantém `operacao_frentes`. UI usa:

- `type='zone'` → **Zona** (setor físico)
- `type='service'` → **Serviço** (função transversal)
- NULL → **Frente** (fallback)

Helper `seed_operacao_frentes_default` cria zonas-padrão (todas com type default `'zone'`).

## Sidebar

`Operação` aponta para a nova lista. As entradas `↳ Dashboard` e `↳ Staff` saíram do sidebar e ficam acessíveis a partir do Hub do Evento (header da fase). As rotas continuam disponíveis em `/operacao/dashboard` e `/operacao/staff`.

## Não tocado nesta sprint

- `EtapaDetail` / `EtapasTable` (já têm fornecedores M:N do OP-0)
- Cotações (descomissionadas em OP-2)
- `EventTeamSection` original em `EventDetail` mantém-se (duplicação temporária — OP-1b descomissiona).
