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

## OP-1b — fase Planeamento funcional

- `PlanejamentoPhase` substitui o placeholder: matriz Zonas/Serviços × Etapas, filtros de status (multi-select), criar etapa inline via `NewEtapaDialog`, click na etapa abre `EtapaDetail` (com fornecedores OP-0).
- Sem números financeiros nesta vista (regra MP Operação ↔ MP Gestão).
- `EditFrenteSheet`: renomear, mudar cor, conversão zone↔service, responsável, eliminar (avisa cascade se tem etapas). Acessível na fase Setup (ícone ✏️) e na fase Planeamento (menu •••).
- `EventTeamSection` removido do `EventDetail` (Gestão) — substituído por aviso a apontar para o Hub.
- Helper `src/lib/operacao-labels.ts` (`frenteLabel`) + varrimento "Frente" → "Zona/Serviço" em strings visíveis.

## OP-5 — fase Evento Live Ops

- `EventoPhase` substitui o placeholder na fase `evento`. Vista operacional, não analítica.
- **KPIs compactos** (4 mini-cards): chamados abertos (vermelho se >0), etapas em curso, concluídas hoje, zonas com problemas.
- **Feed de chamados** (`operacao_registros` com `kind='chamado'` e `status IN ('open','in_progress')`): barra cor da zona, nome zona + etapa, texto, "há X tempo" (date-fns pt), autor com avatar, contacto do lead (📞 `tel:` / 💬 `wa.me/` normalizado, ou "Sem contacto registado"). Acções inline: "Em curso" (status→in_progress + `acked_at`) e "Resolver" (status→resolved + `resolved_at`).
- **Etapas em curso** num `Collapsible` agrupado por Zona/Serviço, com botão inline "Concluir".
- **FAB Novo incidente** (Siren vermelho, bottom-right): abre `RegistroSheet` com `initialKind='chamado'` + `eventFilterId` para filtrar Zonas/Serviços do evento.
- **Auto-refresh**: `refetchInterval: 30s` com `refetchIntervalInBackground: false`.
- **Permissões**:
  - Marcar em curso / resolver: admin, `manage_operacao_etapas`, `manage_operacao_frentes`, lead da zona ou autor do chamado.
  - Marcar etapa concluída: requer `manage_operacao_*`.
  - FAB incidente: admin, `open_chamado` ou `register_operacao`.
- Link "Ver Dashboard analítico" mantido como secundário no topo direito.

## OP-8 — Produtor de Zona/Serviço (lead da frente)

- Decisão: "Produtor de Zona/Serviço" = `operacao_frentes.current_lead_id` (lead da frente). Não há role novo em `event_team_members`.
- `EditFrenteSheet`: campo passou a chamar-se **"Produtor de Zona"** / **"Produtor de Serviço"** (conforme `type`). Select filtra profiles da company a roles elegíveis (`admin`, `manager`, `producer`, `platform_admin`). Inclui opção **"+ Nova pessoa…"** (reutiliza `NewProfileInlineDialog` extraído para `src/components/operacao/shared/`). Default role da nova pessoa = `producer`. Ao guardar, sincroniza `operacao_frente_team` (linha lead permanente).
- `FrentesPanel` (cartões Setup): quando a frente não tem lead, mostra "Sem produtor responsável · **+ atribuir**" (abre `EditFrenteSheet`).
- `EventTeamSection`: hint clarifica que Diretores/Produtores Gerais supervisionam o evento; Produtores de Zona/Serviço são definidos dentro de cada frente.

## OP-9a — Bug fix EtapaDetail + edição de etapas

- **Bug "A carregar..." infinito** em `EtapaDetail`: causa = embed `frente:operacao_frentes(...)` ambíguo (a tabela `operacao_etapas` tem dois FK para `operacao_frentes`: `frente_id` e `zone_id`). PostgREST devolvia erro e o componente só verificava `if (!etapa)`. Fix: disambiguar com `frente:operacao_frentes!operacao_etapas_frente_id_fkey(...)`, tratar `isLoading`/`error` explicitamente, e mover `useIsEventDirectorOnly` para antes do early return (Rules of Hooks).
- **`NewEtapaDialog`** agora inclui Data início, Data limite (validação `end ≥ start`), Responsável (select de profiles elegíveis + "+ Nova pessoa…"), Fornecedor (com bloco de contactos 📞/📧 read-only); fornecedor escolhido também é inserido em `operacao_etapa_suppliers` (M:N) como `role='principal'` além de preencher o legacy `supplier_id`.
- **`EditEtapaSheet`** (novo): permite editar nome, escopo, zona-que-atende, datas, responsável (com inline new), fornecedor e eliminar a etapa. Acessível via botão ✏️ no header do `EtapaDetail` (admin / `manage_operacao_etapas` / lead da frente).
