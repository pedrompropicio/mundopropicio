# AMBIENTES — inventário único

Fonte única do **para que serve cada ambiente**, de onde veio a decisão e em que estado está. Qualquer chat que crie, pause, recapture ou deixe de usar um ambiente atualiza este ficheiro no mesmo dia (R0). Os identificadores técnicos (refs, URLs, credenciais) ficam só no repo privado do replay; aqui só nomes e regiões.

Última atualização: 06/11/2026, 0 pessoal (medição por leitura no painel Supabase e em Live).

## Estratégia (porque existem)

Substituir o Lovable Cloud por uma infraestrutura nossa, com o Lovable como mais um editor (plano: `docs/estudos/independencia-lovable/README.md`; resumo no projeto claude.ai `claude/plano-independencia-lovable-2026-10-31.md`).

1. **Fase 1 — Homologação** (#352, aceite a 31/10, D-ERP343): cada mudança de estrutura passa primeiro por uma base igual a Live. Procedimento: `docs/procedimentos/PROC-promocao.md`.
2. **Fase 2 — Backend na UE** (#603, meta 31/01/2027): produção num Supabase próprio na UE, por residência de dados (RGPD).
3. **Fase 3 — Frontend próprio.** **Fase 4 — Lovable só como editor.**

## Inventário

| Ambiente | Onde | Para que serve | Origem da decisão | Estado em 06/11/2026 |
|---|---|---|---|---|
| **Live** (Lovable Cloud) | EUA, Ohio | Produção única: ERP, portais, Auth, funções, crons | Histórico | Ativo. Recebeu estrutura sem homolog desde 02/11 (ver Desvio) |
| **mp-homolog** | UE, Irlanda (eu-west-1), Micro | Primeiro destino da homologação na #352 (G6) | #352 6457347542 / 6457735908 | Ativo, não pausado. Sem uso documentado depois da passagem ao mp-homolog-2/3. **Destino por decidir (Pedro)** |
| **mp-homolog-2** | UE, Irlanda (eu-west-1), Micro | Homologação até à release 6 | #352 | Ativo, não pausado. A decisão D4 (pausar depois de Ohio verde, `plano-r2-release7-ohio-2026-10-30.md`) **não tem registo de execução** |
| **mp-homolog-3** | EUA, Ohio (us-east-2), Micro | **Portão de todas as mudanças de estrutura** antes de Live. Na mesma região de Live por fidelidade e duração do replay (~25–50 min vs 3–4 h na Irlanda) | Plano R2 release 7, Sim D1 (30/10); aceitação D-ERP343 (31/10) | Healthy. Registo drizzle 301, igual a Live até 02/11 01:05 UTC. **Atrasado face a Live** (ver Desvio) |
| **mp-producao-eu** | UE, Irlanda (eu-west-1), Micro | Futura produção na UE (Fase 2). Reconstruída a partir da recaptura de Live até ao corte (`PROC-promocao.md`, «Até ao corte para a base UE») | #603 / decisão 6486000816 (29/10) | Ativo. **Por apurar:** data de criação, última reconstrução e se já tem dados (nenhum dado pessoal real antes do DPA da Supabase aceite) |

## Desvio aberto (06/11/2026)

Desde 02/11 entraram em Live mudanças de estrutura sem passar pelo mp-homolog-3 nem pelo registo. Medido a 06/11 (public+crm, mesma consulta da vigilância diária): funções 882 → 922, colunas 6058 → 6112, políticas 1161 → 1165, triggers 413 → 451, crons 79 → 88. Decisão do Pedro (06/11): **retomar o PROC**, congelar estrutura em Live, apurar, recapturar o homolog. Seguimento na Issue de retoma (a abrir pelo 0-Org).

## Regras

- Criar, pausar, apagar, recapturar ou mudar o papel de um ambiente = R2, com Sim do Pedro, e linha atualizada aqui no mesmo dia.
- Nenhuma mudança de estrutura vai a Live sem o comentário de aplicação no mp-homolog-3 (PROC-promocao).
- Este ficheiro entra no ritual de arranque das frentes 0 e 2 (ler antes de propor qualquer coisa sobre base, migrações ou infraestrutura).
