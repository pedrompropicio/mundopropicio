# ESTADO — newgang-portal

Atualizado: 26/10/2026 23:35 UTC. Frente: newgangfestival.pt. Estado anterior no histórico git deste ficheiro.

## Em que pé está — #314 (código e testes fechados; faltam só confirmações externas)
PUBLICADO 26/10/2026. Falta (a), (c) e (e) abaixo; reservas #314/#359 mantidas até lá.

- **Fase 1 ERP (BD):** migração 0266 (docs/testes/issue314/fase1.md).
- **Fase 2 ERP:** deploy newgang-portal, source_sha256 `54f1864586f99cd142ca26fa62917b7411dd4f706b55eef69dc8543680f87acc`; HEAD ERP `d7c08b3`.
- **Portal Newgang (1a915f50):** commit `0651b13` (age_class de `me.profile.age_class`, deploy ee12420d) + commit `ccae3b7` (cartão «Já te inscreveste» sem email; `ng_signup_done` guarda só `{at}`, marcas antigas reescritas; reenvio → link `/clube/entrar`; vitest 414/414, tsgo OK; deploy 96e6096f). O Portal não tem CI nem QUADRO.
- **Fase 4 política:** DML em static_pages (MP/pt/privacidade) a 26/10/2026; md5 `0671cff6…` → `20ee1acc…`.
- **Bug 1 (corrigido, DDL em Live):** `_club332_city_profile` rejeitava perfil só com birth_date (`country_invalid`). Backfill: 120 membros (95 adultos, 25 menores).
- **Bug 2 (corrigido):** Portal lia `member.age_class`; o campo vive em `me.profile.age_class`.
- **Test Events (Chrome, rede facebook.com/tr, dataset 1158654246468410):** adulto → Lead + CompleteRegistration (mesmo eid, email em hash) + ClubeConfirmado (sem email); menor → só PageView. 5 membros de teste apagados (`club_member_erase`). Detalhe na Issue #314.
- **Cartão em produção (Chrome):** marcador antigo com email → cartão neutro, email ausente do DOM, marcador reescrito para `{at}`.
- **BirthPrompt:** `club_profile_birth_date` testada na BD com rollback (membro confirmado sem perfil, data 2011-03-10) → devolve `profile.age_class = minor`; nada persistido.

## Pendentes (não fechados)
- (a) `auditor`: ler Events Manager (agregados) e confirmar por escrito a correspondência avançada automática desligada; pode também desligar «Incluir automaticamente informações mais detalhadas de páginas» (segunda camada).
- (c) `juridico`: confirmar 29/02 e leitura de InitiateCheckout/ViewContent para todos com cookies de marketing.
- (e) Coletor Meta 688→429 só efetiva quando o sync correr (R2, por planear).
- Fora de âmbito: secção 9 (Resend aberturas/cliques, 43 membros com versões antigas, retenção, Coala, #369) e #359 draft B não aplicado.

## Decisões
D-ERP312, D-ERP313, D-ERP314 (adendas em docs/DECISIONS.md).
