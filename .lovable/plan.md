# Plano — Operação: evento ativo + UX cadastros/registos + permissões

## 1. Seletor global de Evento Operação

Um seletor fixo no header do shell de Operação (igual ao "empresa ativa" do admin), que se aplica a Dashboard, Etapas, Zonas/Serviços, Chamados, Equipa.

- Novo contexto `OperacaoEventContext` com `activeEventId`, `setActiveEventId`, lista `availableEvents` (vinda de `useScopedEventIds`).
- Persistência: `localStorage` por user (`op.activeEventId.<userId>`).
- Auto-selecção: se houver só 1 evento visível, escolhe-o sozinho; se nenhum, mostra estado vazio "Sem eventos acessíveis".
- Componente `OperacaoEventSwitcher` no header (combobox com search), aparece em todas as rotas `/operacao/*` exceto `/operacao/accept-invite` e `/operacao/staff`.
- Refactor: páginas Etapas/Zonas/Chamados/Equipa/Dashboard deixam de ler `?event=` do URL; passam a ler do contexto. Mantemos compat ao redirecionar `?event=X` para `setActiveEventId(X)` uma vez. Filtros remanescentes (status, frentes, etc.) continuam no URL.

## 2. Reordenação da sidebar Operação

Ordem nova (registos em cima → cadastros em baixo):

```text
REGISTOS
  Dashboard
  Etapas
  Chamados
  Atividade
  Minhas Tarefas
  Meus Chamados
CADASTROS
  Zonas / Serviços
  Equipa
```

- 2 secções com label (`SidebarGroupLabel`).
- Para field-staff puros mantém só a parte de Registos visível (sem Cadastros), porque eles não criam nada.

## 3. Editar + Excluir

Padrão consistente: menu ⋯ com **Editar** e **Excluir** (Excluir abre `AlertDialog` de confirmação, faz soft-delete via Trash 30d).

| Entidade | Estado actual | Acção |
|---|---|---|
| Zonas/Serviços (ZonaCard) | Editar OK, falta Excluir | Adicionar item Excluir gated por `canManageZonas` |
| Etapas (cards na lista e Gantt) | Editar via sheet, sem Excluir | Adicionar Editar+Excluir no menu ⋯ do card e linha da lista |
| Equipa do Evento (`/operacao/equipa`) | Hoje read-only, remover só no Hub | Adicionar ⋯ Editar papel / Remover na própria página |
| Chamados (ChamadoCard) | Sem ⋯ | Adicionar ⋯ Editar (abre Sheet) + Fechar/Excluir |

Excluir Zona com etapas: confirmação extra "X etapas serão arquivadas". Excluir Etapa concluída: bloqueado (só admin) — alinha com regras existentes.

## 4. Permissões

### 4.1 Criar/Editar/Excluir Zonas e Serviços

Só pode quem é admin OU tem `manage_operacao_frentes` OU é `general_producer` em `event_team_members` para o evento ativo.

- Novo hook `useCanManageZonasForEvent(eventId)` que junta as 3 condições.
- UI: gate dos botões "+ Nova zona", ⋯ Editar/Excluir nos cards.
- RLS: actualizar policies em `operacao_frentes` para permitir INSERT/UPDATE/DELETE quando o user é `general_producer` desse `event_id` (já além de admin/manager). Hoje exige `manage_operacao_frentes`.

### 4.2 Criar Etapas só em frentes do produtor

Hoje qualquer membro pode criar etapa. Restringir:

- Admin / `manage_operacao_etapas`: cria em qualquer frente.
- Resto: só em frentes onde está como `lead` em `operacao_frente_team` (já temos `useMyLeadFrenteIds`).
- UI: na lista de Etapas, no Hub de evento e nos detalhes de Zona, o botão "+ Nova etapa" só aparece se `canCreateEtapaInFrente(frenteId)`.
- RLS: actualizar policy de INSERT em `operacao_etapas` para exigir `is_lead_of_frente(frente_id)` (nova helper SQL `STABLE SECURITY INVOKER`) OU `has_permission(...,'manage_operacao_etapas')`.

## 5. Ficheiros principais a tocar

- Novo: `src/contexts/OperacaoEventContext.tsx`
- Novo: `src/components/operacao/OperacaoEventSwitcher.tsx`
- Novo: `src/hooks/useCanManageZonasForEvent.ts`, `src/hooks/useCanCreateEtapaInFrente.ts`
- Edit: `src/components/AppSidebar.tsx` (secções)
- Edit shell: `src/components/operacao/list/OperacaoListShell.tsx` (header + switcher)
- Edit páginas: `ZonasList.tsx`, `EtapasList.tsx`, `ChamadosList.tsx`, `EquipaView.tsx`, `Dashboard.tsx`, `MeusChamados.tsx`, `MinhasTarefas.tsx`
- Edit cards: `ZonaCard.tsx`, `EtapaCard*`, `ChamadoCard`, `EquipaEventoTab.tsx` (e versão de página)
- Migration RLS: `operacao_frentes` (general_producer) + `operacao_etapas` (lead-only INSERT) + helper `is_lead_of_frente(uuid)`.

## 6. Fora de scope (confirmar se queres incluir)

- Alterar quem pode **excluir** etapas concluídas (mantém regra actual: só admin).
- Trash 30d para entidades de Operação (já existe sistema global — usar `delete_with_trash` se aplicável; caso contrário deletes hard com confirmação).
- Versionamento das frentes (não toca).

## 7. Smoke test pós-implementação

1. Login admin → header mostra switcher; trocar de evento muda todas as listas.
2. Recarregar página → evento mantido (localStorage).
3. Login produtor Beatriz (general_producer Coala) → consegue criar zona; produtor sem general_producer não consegue.
4. Produtor Coala → "+ Nova etapa" só aparece nas frentes onde é lead.
5. Excluir zona com etapas → confirma, arquiva tudo.
6. Excluir membro da Equipa direto em `/operacao/equipa` sem ir ao Hub.

Estimativa: 2 sessões (contexto+sidebar+RLS numa, editar/excluir+gates na outra).
