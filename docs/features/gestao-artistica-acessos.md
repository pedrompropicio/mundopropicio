# Gestão Artística — acessos por artista (D-ERP259)

Contrato para o front (chat 3). Quem decide é sempre o servidor; o front só esconde.

## 1. O que o utilizador pode ver
`rpc("my_artist_access")` → uma linha por artista:
```
{ artist_id, artist_name, company_id,
  access_level: "admin" | "traffic_manager" | "viewer",
  areas: string[],            // overview, channels, traffic, financial, reports, songs, content
  source: "platform_admin" | "company_role" | "assignment" }
```
- Lista vazia = sem acesso (mostrar "Sem artistas atribuídos").
- admin: tudo, incluindo tetos, ligar/desligar contas e utilizadores.
- traffic_manager: lê o artista e escreve no Tráfego (campanhas, criativos, planos, orçamentos dentro do teto, músicas, comparáveis). Nunca tetos, contas nem utilizadores.
- viewer: só lê, e só nas `areas`.
- Interruptores de área no menu: overview = Visão geral, channels = Canais, traffic = Tráfego (resultados), financial = Financeiro, reports = Relatórios, songs = Músicas, content = Conteúdos.
- Não usar `user_roles` para decidir o acesso (o papel automático `user` não dá acesso).

## 2. Erros
- RPC recusada: HTTP 403, `code` 42501, `message` "sem acesso a este artista".
- Edge function recusada: HTTP 403, `{ error }` (budget-update: `{ ok:false, error:"sem_permissao" }`).

## 3. Ecrã de gestão (só admin)
`functions.invoke("artist-access-invite", { body })`:
- `{ action:"list", artist_id }` → `{ ok, users:[{ user_id, email, full_name, access_level, areas, granted_by, granted_at }] }`
- `{ action:"invite", artist_id, email, access_level:"viewer"|"traffic_manager", areas:[...] }` → `{ ok, access_id, user_id, invited }`
  `invited=true`: o email de convite foi enviado (abre https://app.socialartists.com.br). `invited=false`: a conta já existia e só se atribuiu o acesso.
  Repetir o convite actualiza o nível e as áreas.
- `{ action:"revoke", artist_id, user_id }` → `{ ok }`
- Ao abrir o convite, a pessoa define a senha e entra; a lista de artistas vem de `my_artist_access`.

UI: escolher o artista, email, nível (Só leitura / Gestor de tráfego), interruptores de área (pelo menos 1). Mostrar a lista de utilizadores com o botão "Retirar acesso".

## 4. Ver / Editar por área (D-ERP259 adenda, 14/10/2026)
- Fonte de verdade: `artist_user_access.area_modes` = `{ <área>: "view" | "edit" }`. Área ausente = sem acesso.
- `areas` e `access_level` continuam a ser preenchidos automaticamente (compatibilidade): `access_level = traffic_manager` só quando `traffic = edit`.
- Ler no front: `rpc("my_artist_area_modes")` → `[{ artist_id, area_modes }]` (papéis do ERP: admin = tudo edit; manager/marketing = traffic edit; resto view).
- Gravar: `artist-access-invite` `{ action:"invite", artist_id, email, area_modes }` (o formato antigo com access_level/areas continua aceite). `list` devolve `area_modes`.
- Servidor: `artist_access_check(artist, 'write', <área>)` exige `edit` nessa área; `traffic_write` = `edit` em traffic.
- Modelos no ecrã (só preenchem; cada área ajustável): Artista = tudo view; Empresário = tudo view; Gestor de tráfego = traffic edit + resto view.
- Ligar/desligar contas, tetos e utilizadores continuam a exigir admin do artista.
