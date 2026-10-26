# ESTADO — newgang-portal

Atualizado: 26/10/2026 21:25 UTC. Frente: newgangfestival.pt. Estado anterior (17/10/2026, #332 e outras frentes) no histórico git deste ficheiro.

## Em que pé está — #314 (fecho documental parcial, reservas mantidas)
PUBLICADO 26/10/2026; pendentes (a)–(e) abaixo. A #314 NÃO está fechada.

- **Fase 1 ERP (BD):** migração 0266 aplicada (ver docs/testes/issue314/fase1.md).
- **Fase 2 ERP:** deploy newgang-portal, source_sha256 `54f1864586f99cd142ca26fa62917b7411dd4f706b55eef69dc8543680f87acc`; HEAD ERP `d7c08b3` (docs/testes/issue314/fase2.md).
- **Fase 2 Portal Newgang (projeto 1a915f50):** commits `437f92f` («Fase 2 Portal NewGang feita», 21:02 UTC) e `d54f5f0` (pt-BR→pt-PT, 9 textos); vitest 381/381, tsgo OK. O Portal não tem CI nem docs/QUADRO.
- **Publish:** ERP e Portal pelo Pedro a 26/10/2026 (~18:06 e ~18:12 Fortaleza). Verificado: newgangfestival.pt/atracoes mostra «Quem achas que vem?».
- **Fase 4 política:** DML em static_pages (MP/pt/privacidade) em Live pelo 0 a 26/10/2026 ~18:10 Fortaleza; guarda md5 `0671cff64934fa632e538376e6759e9e` → `20ee1acc7e5242ccbe83b079f65ee47b`, len 4675→4825; P1–P8 do jurídico (P6 com «data de nascimento»); 8 marcadores verificados por query; backup do texto antigo nos docs do projeto Claude («backup-politica-privacidade-mp-antes-314-2026-10-26»).

## Pendentes (não fechados)
- (a) `auditor`: confirmar por escrito que a correspondência avançada automática do dataset 1158654246468410 está desligada.
- (b) `auditor`: Test Events com evento de adulto e de menor (correspondência manual do email em hash).
- (c) `juridico`: confirmar 29/02 (anos não bissextos conta 1 de março) e a leitura de InitiateCheckout/ViewContent para todos com cookies de marketing.
- (d) Portal: pedido da data no perfil só grava com perfil completo (não existe ação só para birth_date) — avaliar ação dedicada no ERP; ClubeConfirmado sai sem email; init do pixel passou a levar {agent:'lovable'} sem ter sido pedido.
- (e) Coletor Meta 688→429 só efetiva quando o sync correr (não corrido).
- Fora de âmbito: secção 9 (Resend aberturas/cliques, 43 membros com versões antigas, retenção, Coala, #369) e #359 draft B não aplicado.

## Decisões
D-ERP312, D-ERP313, D-ERP314 (adendas de 26/10/2026 em docs/DECISIONS.md).
