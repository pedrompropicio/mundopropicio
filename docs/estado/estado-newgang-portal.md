# ESTADO — newgang-portal

Atualizado: 26/10/2026 23:30 UTC. Frente: newgangfestival.pt. Estado anterior no histórico git deste ficheiro.

## Em que pé está — #314 (Test Events verdes; faltam 2 itens, reservas mantidas)
PUBLICADO 26/10/2026. A #314 NÃO está fechada: faltam (a) e (b) abaixo.

- **Fase 1 ERP (BD):** migração 0266 (docs/testes/issue314/fase1.md).
- **Fase 2 ERP:** deploy newgang-portal, source_sha256 `54f1864586f99cd142ca26fa62917b7411dd4f706b55eef69dc8543680f87acc`; HEAD ERP `d7c08b3`.
- **Portal Newgang (1a915f50):** commit `0651b13` (age_class lido de `me.profile.age_class`; vitest 415/415, tsgo OK), deploy ee12420d publicado pelo Pedro. O Portal não tem CI nem QUADRO.
- **Fase 4 política:** DML em static_pages (MP/pt/privacidade) a 26/10/2026; md5 `0671cff6…` → `20ee1acc…`; backup nos docs do projeto Claude.
- **Bug 1 (corrigido, DDL em Live, aprovado):** `_club332_city_profile` rejeitava INSERT de perfil só com birth_date (`country_invalid`) → idade nunca gravada à inscrição. Agora devolve NEW se país e cidade forem NULL. Backfill: 120 membros (95 adultos, 25 menores).
- **Bug 2 (corrigido):** Portal lia `member.age_class`; o campo vive em `me.profile.age_class`.
- **Test Events (Claude in Chrome, rede facebook.com/tr, dataset 1158654246468410):** adulto 15/01/2000 → Lead + CompleteRegistration (mesmo eid, email em hash) à submissão; ClubeConfirmado (eid clube_confirmado_<n>, sem email) à confirmação. Menor 10/03/2011 → nenhum evento de conversão, só PageView; sem ClubeConfirmado. Página pós-inscrição sem email nem data. birth_date gravada nos 5 membros de teste. Os 5 apagados com `club_member_erase` (erased). Registo na Issue #314.

## Pendentes (não fechados)
- (a) `auditor`: ler Events Manager (agregados) e confirmar por escrito a correspondência avançada automática desligada.
- (b) Cartão «Já te inscreveste com {email}» mostra o email visível quando `ng_signup_done` está definido — decisão do Pedro: remover email do cartão (Portal, R1) e/ou auditor desligar «Incluir automaticamente informações mais detalhadas de páginas».
- (c) `juridico`: confirmar 29/02 e leitura de InitiateCheckout/ViewContent para todos com cookies de marketing.
- (d) Portal: caminho BirthPrompt (`club_profile_birth_date`) para membro existente sem data — por testar após o fix do bug 1.
- (e) Coletor Meta 688→429 só efetiva quando o sync correr (R2, por planear).
- Fora de âmbito: secção 9 (Resend aberturas/cliques, 43 membros com versões antigas, retenção, Coala, #369) e #359 draft B não aplicado.

## Decisões
D-ERP312, D-ERP313, D-ERP314 (adendas em docs/DECISIONS.md).
