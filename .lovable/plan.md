# Leitura: quem muda `profiles.active_company_id` do Pedro

Só leitura, sem alterações. Onde não há prova, está escrito "não confirmado".

## 1) Escritas em `profiles` e `active_company_id` (src/ e supabase/functions/)

A única escrita de `active_company_id` é:
- `src/hooks/useCompany.ts:208` — `supabase.rpc("set_active_company", { target_company_id: companyId })`, dentro do `mutationFn` de `useSetActiveCompany()`.
- Só tem um sítio que a chama: `src/components/CompanySwitcher.tsx:44` (`const setActive = useSetActiveCompany();`), usado em `handleSelect`.

Outras escritas em `profiles`, nenhuma delas toca `active_company_id`:
- `supabase/functions/create-staff/index.ts:84` — `admin.from("profiles").upsert({ id: newUserId, ..., company_id: companyId, ... })`. Corre quando alguém cria staff de operação, e escreve o perfil do utilizador novo, não o do Pedro.
- `supabase/functions/create-user/index.ts:151` e `:292` — `.update({ is_operacao_only: true })`. Corre quando se cria um utilizador.
- `src/components/operacao/shared/NewProfileInlineDialog.tsx:54` e `src/components/operacao/equipa/NewProducerDialog.tsx:59` — `.update({ phone })`. Corre por clique num diálogo.

Todos os outros resultados do grep são leituras (`select("company_id, active_company_id")`), nas edge functions (#241) e em `MetaAudiencesList.tsx:121/329`.

No código do ERP não há `from('profiles').update(...)` com `active_company_id`, nem nenhum `upsert` que o inclua.

## 2) `user_activity_log`: os dois formatos vêm do mesmo front

Só há um escritor, `src/hooks/useActivityTracker.ts:61`:
```
.from("user_activity_log").insert({ user_id: user.id, page })
```
Onde corre: `App.tsx:311` e `PartnerLayout.tsx:17`. É disparado em cada mudança de `location.pathname`, com `force=true` (linhas 71-78), a cada 15 s em modo heartbeat, e com rato, teclado, scroll e foco (limitado a um registo por 30 s).

**Os nomes e os caminhos vêm da mesma função**, `resolvePageLabel` (linhas 24-35):
- `"/"` dá `"Dashboard"`; `/eventos/...` dá `"Detalhe Evento"`.
- Rotas que não estão em `PAGE_LABELS` gravam o caminho cru (`return pathname;`).
- `/erp` (`App.tsx:521`, `<Route path="/erp" element={<Index />} />`) e `/scanner-faturas` (`App.tsx:542`) não estão mapeadas. Por isso aparecem como caminho.

Conclusão: os dois formatos vêm do mesmo front (este ERP). Não provam que haja dois fronts.

**O `company_id` não é enviado pelo front.** A coluna tem por omissão `current_company_id()`, e o trigger `trg_set_company_id BEFORE INSERT ... set_company_id_on_insert()` preenche-a. Ou seja, o valor gravado é o que a base resolve a partir do perfil no instante do INSERT. O log mostra a empresa activa nesse momento; não mostra quem a mudou.

## 3) `CompanySwitcher` / `useSetActiveCompany`: pode disparar sem clique?

- `handleSelect` só é chamado em `onSelect={() => handleSelect(c.id)}` de um `CommandItem`, dentro de um `Popover` (cmdk). Não é um `Select` com `onValueChange`. Não há `useEffect` que o chame.
- Quando a empresa do perfil não está na lista, o código só muda o rótulo para "Escolher empresa" (`profileCompanyUnavailable`, linhas 100-107). Não escreve nada.
- Não encontrei nenhum efeito que "corrija" a empresa activa. O comentário em `useCompany.ts:139` diz o mesmo: "O ERP NUNCA grava ... por iniciativa própria".
- **Depois de trocar há redirecção para o Dashboard:** `navigate("/", { replace: true });` (linha 86). A mudança de pathname gera logo um registo `"Dashboard"` com `force=true`.
- Não confirmado: se o cmdk pode disparar `onSelect` sem clique, por exemplo com Enter no campo de procura quando há um item destacado. Isso exige o popover aberto e uma tecla, portanto é sempre uma acção do utilizador.

## 4) Login, OAuth, convites e app desktop

- Grep por `set_active_company` / `active_company_id` nas funções `*oauth*` e `*callback*`, em `AcceptInvitation.tsx` e em `src/contexts`: 0 escritas.
- Os callbacks OAuth (Meta, Google, TikTok, artistas) não gravam o perfil do utilizador.
- Não há wrapper desktop no repositório (sem electron nem tauri). `public/manifest.webmanifest` tem `"display": "standalone"`: a "app MP Gestão" é o PWA e carrega o mesmo bundle publicado.

## 5) Conclusão sobre as mudanças às 03:18:47 e 03:22:29 de 23/09

- Neste repositório só há um caminho de escrita: um clique numa empresa do `CompanySwitcher`. A sequência é o RPC `set_active_company`, depois `navigate("/")`, depois o log `"Dashboard"` já com a empresa nova (via `current_company_id()`).
- Esse padrão bate exactamente com o observado: a mudança coincide sempre com um `"Dashboard"`.
- Neste repositório não existe caminho de escrita sem clique.
- A sequência também é compatível com outra coisa: a escrita foi feita noutro lado (Gestão Artística, portal, ou um `.update` directo permitido pela policy "Users can update own profile") e o ERP só registou a navegação seguinte. Neste caso, o `"Dashboard"` apareceria só se o Pedro fosse para `/` por outro motivo. Não confirmado: o log não guarda quem escreveu.
- `profiles` não tem trigger de auditoria em `active_company_id`. Por isso, com os dados actuais não se consegue provar qual das duas hipóteses aconteceu.

## Próximo passo proposto (precisa da tua autorização; não está feito)

1. Uma migração com um trigger de auditoria `AFTER UPDATE OF active_company_id ON public.profiles`. Grava em `system_audit_log` o valor antigo e o novo, o `auth.uid()`, o `current_setting('request.headers')` (origin e user-agent) e se a escrita veio do RPC ou de um UPDATE directo, via uma flag `set_config` posta dentro de `set_active_company`.
2. Opcional, e decisão tua: apertar a policy "Users can update own profile" com um `WITH CHECK` que impeça mudar `active_company_id` fora do RPC.
3. Opcional: acrescentar `"/erp"` e `"/scanner-faturas"` a `PAGE_LABELS`, para o log deixar de misturar os dois formatos.
