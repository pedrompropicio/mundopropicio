# ESTADO — newgang-portal

Atualizado: 27/10/2026 00:40 UTC. Frente: newgangfestival.pt. Estado anterior no histórico git deste ficheiro.

## Em que pé está — D-ERP312/313/314 FECHADA (Issue própria #371; os registos de 26/10 na #314 são histórico por engano de número — a #314 é da frente 3)
Tudo publicado e verificado a 26/10/2026. Nada pendente nesta frente, exceto o fora de âmbito abaixo.

- **BD (Live):** migração 0266 (Fase 1); DDL `_club332_city_profile` (perfil só com birth_date grava; antes `country_invalid`); backfill 120 membros (95 adultos, 25 menores); coletor `newgang_clube:v2` com regra 18+.
- **ERP:** deploy newgang-portal, source_sha256 `54f1864586f99cd142ca26fa62917b7411dd4f706b55eef69dc8543680f87acc`; HEAD ERP `d7c08b3`.
- **Portal Newgang (1a915f50), publicado:** `0651b13` (age_class em `me.profile.age_class`, deploy ee12420d); `ccae3b7` (cartão «Já te inscreveste» sem email, `ng_signup_done` só `{at}`, deploy 96e6096f); `1c6caa4` (texto <13 «O Clube Newgang é para maiores de 13 anos.», deploy 82245ba1; vitest 414/414, tsgo OK, 1 falha intermitente numa volta, não identificada). O Portal não tem CI nem QUADRO.
- **Política (static_pages MP/pt/privacidade, Live):** md5 `0671cff6…` → `20ee1acc…` (Fase 4) → `e3dc8aa1d5ed860c764ed6a700158df9` (len 4739, sem a frase do consentimento parental).
- **Test Events (Chrome, dataset 1158654246468410):** adulto → Lead + CompleteRegistration (mesmo eid, email em hash) + ClubeConfirmado (sem email); menor → só PageView. 5 membros de teste apagados (`club_member_erase`).
- **Cartão e BirthPrompt:** cartão neutro verificado em produção; `club_profile_birth_date` testada na BD com rollback (→ minor). Texto <13 verificado em produção no Chrome.
- **Audiência Meta P_NG27_LISTA:** enviada com 18+ a 26/10 23:29 UTC (436 registos, 0 inválidos; antes 666). Cron 2499 (04:35 UTC) mantém a mesma regra.
- **Auditor (Quadro de Campanhas, 27/10 00:14–00:18 Lisboa):** correspondência avançada automática Desativado; «informações mais detalhadas de páginas» desligado; Lead/CR no servidor ao nível dos adultos; P_NG27_LISTA «Abaixo de 1.000», 0 conjuntos de anúncios; sem anomalias.
- **Jurídico (comentário na #314, 27/10):** 29/02 confirmado (risco baixo); ViewContent/InitiateCheckout aceitável (baixo); texto <13 corrigido.

## Fora de âmbito (não iniciado)
Secção 9: Resend aberturas/cliques, 43 membros com versões antigas de consentimento, retenção/purga, Coala, #369; #359 draft B (não aplicado).

## Decisões
D-ERP312, D-ERP313, D-ERP314 (adendas em docs/DECISIONS.md). Sem decisão nova a registar.
