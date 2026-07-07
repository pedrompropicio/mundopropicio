Análise concluída sem alterar código.

1. Escritas em `event_marketing` encontradas no `src/`

Comando pedido:
```bash
rg -n "from\(\"event_marketing\"\)|from\('event_marketing'\)" src/
```

Resultado:
```text
src/pages/crm-admin/eventos/EventosList.tsx:122:          .from("event_marketing")
src/pages/crm-admin/eventos/EventMarketingEditor.tsx:94:        .from("event_marketing")
src/pages/crm-admin/eventos/EventMarketingEditor.tsx:129:        .from("event_marketing")
```

Classificação:
- `src/pages/crm-admin/eventos/EventosList.tsx:122` — leitura apenas: `.select("event_id, status, updated_at")`; não escreve.
- `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:94` — leitura apenas: `.select("*")`; não escreve.
- `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:129` — única escrita encontrada no `src/`: `.upsert(payload, { onConflict: "event_id" })`.

2. Única escrita real: `EventMarketingEditor.tsx:121-130`

Trecho relevante:
```ts
const saveMutation = useMutation({
  mutationFn: async (next: FormState) => {
    const payload: any = {
      ...next,
      updated_by: user?.id ?? null,
    };
    if (!mkQuery.data) payload.created_by = user?.id ?? null;
    const { error } = await (supabase as any)
      .from("event_marketing")
      .upsert(payload, { onConflict: "event_id" });
    if (error) throw error;
  },
```

Objeto enviado:
```ts
payload = {
  ...next,
  updated_by: user?.id ?? null,
  created_by?: user?.id ?? null // só se !mkQuery.data
}
```

Origem de `status` nesta escrita:
- vem de `next.status` via spread `...next`.
- `next` é o `form` atual ou o objeto criado em `togglePublish`.

Fontes possíveis de `next.status`:

A. Evento sem linha prévia em `event_marketing`
```ts
const emptyForm = (eventId: string): FormState => ({
  event_id: eventId,
  company_id: MP_COMPANY_ID,
  status: "draft",
  ...
});
```
Status enviado: `"draft"`.

B. Evento com linha prévia em `event_marketing`
```ts
const { created_at, updated_at, created_by, updated_by, ...rest } = mkQuery.data;
setForm({ ...rest, gallery_urls: rest.gallery_urls ?? [], ticket_experiences: ... });
```
Status enviado: `mkQuery.data.status`, vindo diretamente da BD.

C. Botão `Publicar`/`Despublicar` do cabeçalho do editor de marketing
```ts
const next: FormState =
  form.status === "published"
    ? { ...form, status: "draft" }
    : { ...form, status: "published", published_at: form.published_at ?? new Date().toISOString() };
setForm(next);
saveMutation.mutate(next);
```
Status enviado: literal `"draft"` ou literal `"published"`.

D. Botão global `Guardar`
```tsx
<Button
  type="button"
  onClick={() => form && saveMutation.mutate(form)}
>
  Guardar
</Button>
```
Status enviado: `form.status`.
- Para evento sem marketing prévio, deveria ser `"draft"`, porque o formulário nasce de `emptyForm(eventId)`.
- Para evento com marketing prévio, é o valor vindo da BD.

3. Busca por valores inválidos de status

Nos ficheiros diretamente relacionados:
```text
src/pages/crm-admin/types.ts:4:export type EventMarketingStatus = "draft" | "published";
src/pages/crm-admin/eventos/EventMarketingEditor.tsx:40:  status: "draft",
src/pages/crm-admin/eventos/EventMarketingEditor.tsx:144:      form.status === "published"
src/pages/crm-admin/eventos/EventMarketingEditor.tsx:145:        ? { ...form, status: "draft" }
src/pages/crm-admin/eventos/EventMarketingEditor.tsx:146:        : { ...form, status: "published", published_at: form.published_at ?? new Date().toISOString() };
src/pages/crm-admin/eventos/EventosList.tsx:186:              <SelectItem value="published">Publicado</SelectItem>
src/pages/crm-admin/eventos/EventosList.tsx:187:              <SelectItem value="draft">Rascunho</SelectItem>
src/pages/crm-admin/eventos/EventosList.tsx:252:                  : st === "draft"
src/pages/crm-admin/eventos/EventosList.tsx:256:                st === "published" ? "Publicado" : st === "draft" ? "Rascunho" : "Sem marketing";
```

Não encontrei no `src/` nenhuma escrita em `event_marketing` a enviar literalmente:
- `"drafted"`
- `""`
- `"rascunho"`
- maiúsculas tipo `"DRAFT"` / `"PUBLISHED"`

Também não encontrei outra `.insert`, `.update` ou `.upsert` em `event_marketing` fora da escrita única acima.

4. Botões da tab Gestão vs botão global

`Guardar gestão` — `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:685-704` e `938-942`

Objeto enviado:
```ts
await supabase
  .from("events")
  .update({
    management_type: mgmt,
    partner_name: mgmt === "partner_managed" ? (partnerName.trim() || null) : null,
    location: location.trim() || null,
    ticketing_url: ticketingUrl.trim() || null,
    ad_destination_url: adDestinationUrl.trim() || null,
    ticketing_provider: ticketingProvider.trim() || null,
    portal_featured: portalFeatured,
    vip_coupon_code: vipCode.trim() || null,
    vip_coupon_discount_label: vipLabel.trim() || null,
    vip_coupon_valid_until: vipValidUntil ? `${vipValidUntil}T23:59:59Z` : null,
    venue_map_url: venueMapUrl.trim() || null,
    venue_directions_url: venueDirectionsUrl.trim() || null,
  })
  .eq("id", eventId);
```

Conclusão: `Guardar gestão` não toca `event_marketing`; atualiza apenas `events`. Não envia `status` para `event_marketing`.

Botão global `Guardar` — `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:520-532`

Conclusão: este toca `event_marketing` via `saveMutation.mutate(form)`. O `status` enviado é `form.status`.

5. Toggle “Visível no portal”

Trecho:
```ts
const publishToggle = useMutation({
  mutationFn: async (nextVisible: boolean) => {
    const rpcName = nextVisible ? "publish_event_to_portal" : "unpublish_event_from_portal";
    const { data, error } = await (supabase as any).rpc(rpcName, { p_event_id: eventId });
```

Conclusão: não escreve em `event_marketing`; chama RPCs de visibilidade do portal. Não envia `status` de marketing.

6. Edge functions

Comando:
```bash
rg -n "event_marketing" supabase/functions
```

Resultado: vazio.

Conclusão: não há edge function em `supabase/functions/*` a escrever ou ler `event_marketing`.

7. Conclusão técnica provável

Pelo estado atual do código em `src/`, a única escrita em `event_marketing` envia `status` a partir do `form`. Para eventos sem marketing prévio, o código visível inicializa esse `form.status` como `"draft"`, que é válido.

Logo, se o erro ainda acontece ao gravar “Deive Leonardo - Lisboa”, as hipóteses mais prováveis são:

1. O preview/produção ainda está a correr bundle antigo com `status: "drafted"`.
2. Há uma versão externa/commit ainda não sincronizada onde `emptyForm.status` continua inválido.
3. A linha `event_marketing` já existe com valor inválido antigo e o formulário carrega esse `mkQuery.data.status`; mas isto é menos provável porque a constraint impediria persistir esse valor na tabela atual.
4. O erro vem do botão global `Guardar`, não de `Guardar gestão`; `Guardar gestão` não toca `event_marketing`.

Lista completa de pontos com status enviado:

- `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:37-68` — `emptyForm` para novo marketing: `status: "draft"`.
- `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:109-113` — marketing existente: `status` vem de `mkQuery.data.status`.
- `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:121-130` — upsert real: envia `payload.status = next.status`.
- `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:141-149` — publicar/despublicar marketing: envia `"published"` ou `"draft"`.
- `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:520-532` — botão global `Guardar`: envia `form.status` para `event_marketing`.
- `src/pages/crm-admin/eventos/EventMarketingEditor.tsx:685-704` + `938-942` — botão `Guardar gestão`: não envia `event_marketing.status`; só atualiza `events`.
- `src/pages/crm-admin/eventos/EventosList.tsx:121-124` — leitura apenas: não envia status.
- `src/pages/crm-admin/CrmDashboard.tsx:145` — leitura/count apenas: filtra `status = "published"`; não escreve.
- `supabase/functions/*` — nenhuma ocorrência de `event_marketing`.

Questões/decisões em aberto:
```text
Contexto: análise do erro event_marketing_status_check ao gravar evento sem marketing prévio.

Questão 1 — Próximo diagnóstico recomendado
Opção A (recomendada): verificar no runtime/bundle do preview se ainda existe "drafted" carregado no JS servido.
Opção B: testar fluxo com Playwright e capturar request/resposta ao clicar Guardar no Deive.
Opção C: passar direto para correção defensiva no upsert, normalizando status para draft/published antes de gravar.

Questão 2 — Se for para corrigir depois
Opção A (recomendada): no saveMutation, sanitizar payload.status: se não for "draft" ou "published", forçar "draft".
Opção B: omitir status no insert quando não há linha prévia e deixar default da BD aplicar.
Opção C: apenas limpar bundle/cache/publicar novamente, se confirmado que o código fonte já está certo.
```