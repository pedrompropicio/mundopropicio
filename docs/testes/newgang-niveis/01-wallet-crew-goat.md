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
