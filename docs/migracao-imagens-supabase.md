# Migração de imagens do projeto Supabase antigo

## Contexto
Existiu um projeto Supabase antigo (`zjseklogascfwqjoocbl`) que alojava imagens de eventos antes da consolidação no Live atual (`sfohvvlqccmmebvjgibx`). Esse projeto foi desativado. Todas as imagens referenciadas na base de dados foram migradas para o Live.

## Buckets de imagens (Live)
- `event-images` — público.
- `portal-marketing-images` — público (usado pelo editor de eventos do CRM, constante MARKETING_BUCKET).

## Colunas que referenciam imagens de eventos
- `public.events`: `hero_image_url`, `poster_image_url`
- `public.event_marketing`: `hero_image_url`, `og_image_url`, `poster_vertical_url`
- `public.event_portal_endorsements`: `override_hero_image_url`
A view `events_public` junta events + event_marketing para o portal.

## O que foi feito (jun/2026)
- Reapontadas as URLs dos eventos Simone Mendes (Porto e Lisboa) e Conferência Plenitude do host antigo para o Live.
- O ficheiro da Plenitude (`1780501181464-vgceb3z8vj.jpg`) foi copiado fisicamente do antigo para `event-images` no Live.
- Verificação final: 0 referências ao host antigo em toda a base de dados.

## Ferramenta usada (removida após uso)
Foi criada uma edge function utilitária `migrate-legacy-images` que descobria URLs com o host antigo, copiava os ficheiros (fetch público → upload no Live via service_role) e devolvia relatório, sem alterar a BD. Autenticava por JWT `role=service_role` (mesmo padrão do `whatsapp-dispatcher`). Removida após a migração.

## Infra Supabase (referência)
- Live: `sfohvvlqccmmebvjgibx`
- Test: `ukpuhoynrqobqtzdbysp`
- Antigo (desativado): `zjseklogascfwqjoocbl`
