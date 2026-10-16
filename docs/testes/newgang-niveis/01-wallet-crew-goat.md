# Newgang — níveis Gang / Crew (antes Elite) / Goat (antes Lenda) — 16/10/2026

Executor: ChatGPT · newgang-portal via agente Lovable. Sem DML/DDL, deploy, Publish nem chamadas externas.

## Lido
docs/INDEX.md, docs/QUADRO.md, docs/estado/estado-newgang-portal.md, .lovable/memory/features/portal-newgangfestival.md.

## Live (SELECT, 16/10 03:04 UTC)
club_levels do site f8ce23a5-a27a-4893-9b7a-d6337d84b168: Gang 0 (668b278e-…), Elite 500 (32083504-73fa-41f0-b826-68837c82040e), Lenda 1500 (2aa5a1d5-3c59-4684-8b18-06c239bc88e5); todos com benefício. Nenhuma função SQL pública contém 'Elite'/'Lenda'.

## Referências funcionais aos nomes antigos
Só `supabase/functions/newgang-portal/wallet-google.ts`. API (`site`, `me`, ranking, Wallet) lê o nome de club_levels; CRM edita a mesma tabela. Nada mais a corrigir.

## Criativos
hero-elite-v1.png (sha256 7aa31f54…) mostra "NÍVEL ELITE"; hero-lenda-v1.png (08fd8a8e…) mostra "NÍVEL LENDA". O tipo de letra original não existe no ambiente; edição fiel não possível. Dependência: dois PNG 1032×336, iguais aos v1 com o texto "CREW" e "GOAT", nomes `newgang/wallet/hero-crew-v1.png` e `hero-goat-v1.png` no bucket test-artifacts (aprovação do Pedro, upload numa tarefa autorizada).

## Código
- `levelTier`: Gang; Crew ou Elite → crew; Goat ou Lenda → goat (sem distinção de maiúsculas).
- Legados usam sempre os v1. Nomes novos usam hero-crew/goat quando `WALLET_RENAMED_ARTWORK_READY=true` (hoje false); até lá usam o v1 do mesmo escalão (nunca o Gang). Cores por escalão. Pontos, nível mostrado, QR e ids inalterados.

## Ordem segura
1. Pedro aprova os 2 PNG → upload → verificar SHA/HTTP 200.
2. Flag true + deploy newgang-portal.
3. SQL `supabase/manual/20261016_newgang_niveis_crew_goat.PENDENTE.sql` com "Sim" do Pedro.
4. Cron newgang-wallet-sync */10 aplica PATCH só a quem mudou de nível (last_level).

## Testes
src/test/newgang-wallet-levels.test.ts + newgang-wallet-google.test.ts: 26/26, sem rede. tsgo 0.

---
# Etapa 2 — criativos aprovados + ativação (16/10/2026 03:15–03:20 UTC)

Pedro aprovou as duas artes anexadas (CREW roxa, GOAT verde/preta). Executor ChatGPT · newgang-portal.

## Normalização
Originais 2172×724 RGB com margens brancas (linhas 0–7 e 716–723). Recorte só dessas margens + 2 px, depois redimensionamento LANCZOS para 1032×336 (proporção 3,068 → 3,071). Conteúdo não redesenhado; inspeção visual feita.

## Assets (bucket público test-artifacts; antes do upload os caminhos davam 400 = inexistentes)
| ficheiro | HTTP | dimensões | sha256 |
|---|---|---|---|
| newgang/wallet/hero-crew-v1.png | 200 image/png | 1032×336 | 7f325be1e002034a5452dc1c514bb22532d0502bec513660cc7440bcd9fc81a4 |
| newgang/wallet/hero-goat-v1.png | 200 image/png | 1032×336 | d4c03a453fea02b059fe486f43778ab35b627fb76a5e38991f8f47ee2d264ea9 |
Legados intactos (SHA iguais à etapa 1): gang f8eb94e8…, elite 7aa31f54…, lenda 08fd8a8e….
URL base: https://sfohvvlqccmmebvjgibx.supabase.co/storage/v1/object/public/test-artifacts/newgang%2Fwallet%2F<ficheiro>

## Código e deploy
WALLET_RENAMED_ARTWORK_READY=true. Deploy só de newgang-portal (source_sha256 43b4896feb1ba942ecc3ab4f5dd0406cbe8425a3d4e14d471bd427e6908689ce). Smoke: ação pública "site" 200, níveis Gang 0 / Elite 500 / Lenda 1500 (Live ainda com nomes antigos → cartões usam v1 legados, sem mudança visível).
Sem Publish, sem PATCH/POST manual à Google, sem emails; consentimento/portal-track/CAPI/crons não tocados.

## Testes
newgang-wallet-levels + newgang-wallet-google: 26/26 (Crew/Goat → novos criativos, Elite/Lenda → v1, cores por escalão, id/classId/accountId/QR NG-42/pontos/nível preservados), sem rede. tsgo 0.

## SQL
supabase/manual/20261016_newgang_niveis_crew_goat.PENDENTE.sql — NÃO aplicado (SELECT 03:18 UTC confirma Elite/Lenda). Aplicação fica com ChatGPT após verificação. Depois de aplicado, o cron newgang-wallet-sync */10 aplica PATCH a quem tiver last_level diferente.


## Etapa 3 — aplicação aprovada e verificação independente (16/10/2026)
Pedro aprovou expressamente as duas artes e o SQL nesta sessão. ChatGPT aplicou a renomeação com guardas por site/ID/nome antigo/min_points e rollback se não fossem 2 linhas. Live depois: Gang 0, Crew 500, Goat 1500. Hash dos campos preservados (id/company/site/min_points/benefit) igual antes/depois: Gang b7063f3e3487a5edf795021b74827d84; Crew 2f22700bdf073f496d67c9daf4231e9a; Goat 10680970a16784dd7bfffe9d7fc2a701. Não houve alteração de pontos, IDs nem benefícios.

Verificação independente dos PNG públicos: HTTP 200, 1032×336 e SHA idênticos aos da Etapa 2; visual inspecionado. Flag true confirmada por leitura do código. API pública action site, sem sessão: HTTP 200 e [(Gang,0),(Crew,500),(Goat,1500)]. GET direto de /meu-clube bloqueado por HTTP 403 neste ambiente: visual de produção e dispositivo Wallet não confirmados. Testes 26 Wallet/1248 suite e tsgo limpo reportados pelo agente; conector de workflows devolveu lista vazia (filtra PR), portanto CI deste commit não confirmada independentemente.

A function newgang-portal foi deployada pelo agente antes do DML (source_sha na Etapa 2); sem Publish frontend nem PATCH manual Google. Sync existente */10 deverá atualizar cartões cujo last_level difere; não verificado no dispositivo.

Pendências explícitas: benefício Goat ainda diz “Tudo de Elite” (campo preservado pelo SQL aprovado); corrigir apenas referência para “Tudo de Crew” após autorização SQL própria. Consolidação da regra dos portais em CHATS/DECISIONS/PROC continua pendente da reserva #323. O SQL com sufixo PENDENTE foi aplicado por ChatGPT nesta etapa e NÃO deve ser reaplicado.
