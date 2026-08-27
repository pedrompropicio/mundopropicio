# MP CRM — Contactos vs Eventos de tráfego

## Problema

`public.leads` guarda duas coisas distintas:

- `kind = 'redirect_click'` — cliques **anónimos** do portal para a bilheteira
  (`contact_id` sempre NULL). Servem para medição e conversões offline do Google.
- `kind IN ('event_interest','newsletter_signup')` — interações de pessoas
  identificáveis, ligadas a `public.contacts`.

Chamar "lead" ao clique anónimo inflacionava o acervo (14k vs ~385 pessoas reais).

## Vistas (única fonte para a UI)

- `public.crm_contactos` — uma linha por pessoa com email e/ou telefone:
  consentimentos, origem, `first_contact_at`, `last_contact_at`, `interactions`,
  `last_event_id`, `last_kind`. `security_invoker = true`, GRANT SELECT a `authenticated`.
- `public.crm_eventos_trafego` — `leads WHERE kind = 'redirect_click'`: data, evento,
  UTMs, país/região/cidade, `capi_status`. Sem qualquer campo de pessoa.

A tabela `public.leads` **não** foi alterada (CAPI, conversões Google e atribuição
dependem dela).

## Regras de UI

- Ecrã `/crm/leads` → título "Contactos & tráfego", dois separadores: **Contactos**
  (default) e **Eventos de tráfego**.
- KPI em destaque = nº de contactos. Tráfego é métrica secundária, em tom neutro.
- **Nunca somar** contactos com eventos de tráfego.
- O separador de tráfego tem nota fixa a explicar que são registos anónimos, não
  pessoas contactáveis.
- A palavra "lead" não é usada para cliques anónimos em nenhum rótulo, gráfico,
  exportação ou email interno. O dashboard mostra "Eventos de tráfego (30 dias)" e
  "Geografia do tráfego".
