# Relatório MP CRM — controlo Publicar/Despublicar no Portal

Análise só de leitura. Sem alterações.

## 1. Rotas e ficheiros principais do MP CRM

Layout + sidebar:
- `src/components/layout/CrmLayout.tsx` (guard de auth/role)
- `src/components/CrmSidebar.tsx` (14 entradas: Dashboard, Eventos, Contactos, Leads, Audiências, Blog, Páginas, Vídeos, Imprensa, Config. portal, Meta CAPI, Meta Audiences, Google Ads)

Páginas (todas em `src/pages/crm-admin/`):
- `CrmDashboard.tsx` — `/crm`
- `eventos/EventosList.tsx` — `/crm/eventos` (tabs Próprios / Endossados)
- `eventos/EventMarketingEditor.tsx` — `/crm/eventos/:eventId` (tabs Gestão, Hero, Média, Experiências, CTA, Imprensa, Oferta, SEO, FAQs, Lineup)
- `eventos/NewEventoPage.tsx`, `EndossarEventoPage.tsx`, `EndorsementEditor.tsx`, `FaqsTab.tsx`, `LineupTab.tsx`, `MetaAudienceCard.tsx`
- `contactos/`, `leads/LeadsList.tsx` + `LeadDetailsSheet.tsx`, `audiences/`, `blog/`, `paginas/`, `videos/VideosList.tsx`, `press/PressList.tsx`, `portal-settings/`, `meta-capi/`, `meta-audiences/`, `google-ads/`
- Constantes: `constants.ts` (`MP_COMPANY_ID`), tipos: `types.ts`

## 2. O CRM já mostra eventos?

Sim, extensivamente:
- **Lista** `EventosList.tsx` — lê `public.events` (não usa `events_public`) filtrado por `company_id = MP_COMPANY_ID`, com JOIN a `event_marketing` (status drafted/published). Colunas: nome, tipo (própria/parceria), slug, data, estado marketing. Filtros: pesquisa, estado, "apenas activos". Tab paralela "Endossados" lê `event_portal_endorsements`.
- **Detalhe** `EventMarketingEditor.tsx` — tab "Gestão" já lê e escreve directamente em `events` os campos `portal_visible`, `portal_featured`, `slug` (via update), `ticketing_url`, `management_type`, etc. **Já existe hoje um Switch "portal_visible"** persistido por UPDATE plano à tabela `events` (linha 645/696). Não usa as RPCs novas nem faz cascata para cidades-filhas de tour.
- **Leads/promotores por evento**: `leads/LeadsList.tsx` lista leads globais com `event_id`; `LeadDetailsSheet` mostra evento associado. Não há vista "leads deste evento" dentro do EventMarketingEditor.

## 3. Onde encaixar o botão Publicar/Despublicar

**Recomendado (principal) — substituir o Switch actual da tab "Gestão"** em `EventMarketingEditor.tsx` (bloco `GestaoTab`, linhas ~715–800):
- Trocar o par `portalVisible`/`portalFeatured` gravados via UPDATE plano por um **par de botões** (ou 1 botão com toggle) que chama `supabase.rpc('publish_event_to_portal', { p_event_id: eventId })` / `unpublish_event_from_portal`.
- Vantagens: reusa a UI onde o utilizador já espera o controlo; ganha automaticamente slug + cascata multi-cidade; invalida `["crm-event", eventId]` e `["crm-eventos-list"]` (padrão já usado no `save` da mutation, linhas 709–710).
- Ficheiros a tocar: só `src/pages/crm-admin/eventos/EventMarketingEditor.tsx`. `portal_featured` fica como update plano à parte (a RPC não trata destaque).

**Alternativa — acção em linha na tabela** `EventosList.tsx` (`PropriosTab`):
- Adicionar uma coluna/botão "Publicar" ao lado de "Editar marketing" (linhas ~285–292), chamando as mesmas RPCs.
- Vantagem: publicação em massa sem entrar no editor. Desvantagem: duplica a UI de estado (já existe badge "Publicado/Rascunho" que reflecte `event_marketing.status`, distinto de `events.portal_visible` — atenção a confusão semântica).
- Ficheiro: `src/pages/crm-admin/eventos/EventosList.tsx`.

Nota: a UI actual mistura dois conceitos — `event_marketing.status` (rascunho/publicado do conteúdo) e `events.portal_visible` (aparece no portal). Vale a pena, ao mesmo tempo, deixar claro que o botão novo controla `portal_visible` (+ cascata + slug) e não o status de marketing.

## 4. Padrão de chamada Supabase

- Cliente único: `import { supabase } from "@/integrations/supabase/client"` (já usado em todo o CRM).
- Leituras via `@tanstack/react-query` `useQuery`, escritas via `useMutation` com `onSuccess` a fazer `qc.invalidateQueries({ queryKey: [...] })` + toast (`sonner`). Exemplo canónico: `GestaoTab.save` em `EventMarketingEditor.tsx` linhas 685–713.
- Para as RPCs novas: `await supabase.rpc('publish_event_to_portal', { p_event_id: eventId })` dentro de `useMutation`, invalidando `["crm-event", eventId]`, `["crm-event-marketing", eventId]` e `["crm-eventos-list"]`. Tipos gerados já contêm `publish_event_to_portal` em `src/integrations/supabase/types.ts` (linha 10678), portanto sem `as any`.

## 5. Riscos e armadilhas

- **RLS / permissões**: as RPCs devem ser `SECURITY DEFINER` e validar admin/manager + `company_id`. Confirmar antes de expor o botão a roles inferiores. O `CrmLayout` já filtra a admin/platform_admin/marketing_manager/content_manager, mas dentro do CRM há content_manager que pode não dever publicar.
- **Multi-tenant**: `EventosList` está hard-coded a `MP_COMPANY_ID` (Mundo Propício). A RPC deve rejeitar eventos de outra `company_id` — validar. Endossos (`event_portal_endorsements`) são cross-company e a RPC de publish provavelmente **não** os cobre.
- **Cascata multi-cidade**: só actua quando `events.event_type='multi_day'`. Confirmar que o CRM não trata tours de outro tipo (ex.: `multi_city`) — se sim, o botão parece funcionar mas não propaga.
- **Coerência de estado**: hoje `EventMarketingEditor` grava `portal_visible` em UPDATE plano sem cascata; se coexistir com o botão novo, um utilizador pode "despublicar via Switch" a cidade-mãe mas deixar filhas visíveis. Recomenda-se remover o Switch e passar tudo pela RPC.
- **Slug**: a RPC gera slug se faltar — se o utilizador já editou slug à mão noutro sítio, verificar que a RPC não sobrescreve.
- **Cache**: invalidar também qualquer query do portal público que o CRM tenha (não vi nenhuma; portal vive noutro app), mas invalidar `["crm-event", eventId]` chega para o editor refrescar `portal_visible`.
- **`portal_featured`**: continua a exigir UPDATE separado — não misturar com o botão publicar.

## Próximo passo sugerido
Confirmar a opção (principal ou alternativa) e as permissões esperadas (só admin/manager? marketing_manager também?) antes de eu passar a build mode.
