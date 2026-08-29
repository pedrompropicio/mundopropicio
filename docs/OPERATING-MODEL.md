# MODELO OPERATIVO — como se trabalha neste sistema

O `INDEX.md` diz onde estão as coisas; este diz como se mexe nelas.

## 1. O problema que este modelo resolve

O sistema acumulou 75+ documentos, quase todos handoffs datados. Numa pesquisa por qualquer tema vêm à mão handoffs de vários dias em simultâneo, sem forma de saber qual ainda vale. Em 29/08 isso produziu **sete diagnósticos errados numa só sessão** — três propostas de trabalho já desenhado, duas medições sobre chaves legadas, e duas conclusões de RLS a partir de verificação incompleta.

A causa não é falta de documentação. É **excesso de arquivo a competir com o estado**.

Princípio: **o histórico não deve ser consultável para saber onde estamos.**

## 2. Ciclo de vida de uma pendência

ideia/problema → Issue (`depois`) → Issue (`a-seguir`) → Issue (`agora`) → trabalho no chat da frente → Issue fechada + `estado-<frente>.md` atualizado → (se decisão) ADR em `DECISIONS.md` → (se fluxo novo) `.lovable/memory/features/<fluxo>.md`

**Nunca** se trabalha em algo que não tem Issue. Se surgiu a meio da sessão, abre-se a Issue primeiro.

## 3. Labels das Issues

**Sequência** — `agora` (**máximo 5 no total, em todas as frentes**), `a-seguir`, `depois`, `bloqueada` (o comentário tem de dizer de quê).

**Prioridade** P0/P1/P2 — mantém-se. Prioridade diz **gravidade**; sequência diz **ordem**. Não são a mesma coisa: em 29/08 a #64 era P0 e estava bloqueada, enquanto a #82 — que nem existia — tinha de vir primeiro.

**Módulo** — `MP-ERP`, `MP-CRM`, `MP-AUDIENCE`, `MP-PRODUCAO`, `transversal`.

### Regra do teto
Se `agora` tem 5 Issues, não entra mais nenhuma sem sair uma. É o mecanismo que impede a sensação de "muitas frentes abertas": não há mais de 5 coisas a acontecer, por definição.

## 4. Anatomia de um `estado-<frente>.md`

Máximo **uma página**. Se cresce, está a virar handoff — cortar. Secções: Em que pé está · A trabalhar agora · Próximo passo concreto · Bloqueios · Factos que não se reinvestigam · Onde ler mais.

**Reescreve-se por cima.** Não se acrescenta ao fundo, não se datam secções. O histórico está no Git.

A secção **"Factos que não se reinvestigam"** é o coração: números, IDs e regras já apurados, com origem. É o que evita repetir trabalho.

## 5. Regras de sessão

**Arranque** — `INDEX.md` → `estado-<frente>.md` → Issues `agora`. Por esta ordem. Se o tema toca fluxo implementado, procurar em `.lovable/memory/features/` **antes** de investigar. Não diagnosticar antes de ler; não propor antes de confirmar que não existe.

**Durante** — um passo de cada vez; justificar antes de executar. Claude propõe e prepara; Pedro autoriza e executa o irreversível. Números que mudam consultam-se na hora. Pendência nova = Issue imediata.

**Fecho** — `estado-<frente>.md` atualizado é obrigatório. Handoff é opcional. Regra de negócio nova vai para o ADR **e** para "Factos que não se reinvestigam".

## 6. Regras de conteúdo

- **Uma frente, um chat, um ficheiro de estado.**
- **Datado = arquivo. Sem data = estado.** Nunca misturar na mesma pasta.
- **Project Knowledge só leva o vivo:** `INDEX.md`, `estado/*`, `ARCHITECTURE.md`, `DECISIONS.md`. Os handoffs saem — ficam no repo, fora da pesquisa.
- **Um número só existe se tiver origem.** Valor sem query ou ficheiro que o produziu não entra em documento.

## 7. Higiene periódica

**Semanal (10 min)** — rever `agora`, respeitar o teto de 5, atualizar os estados tocados. Ver `docs/procedimentos/PROC-revisao-semanal.md`.

**Mensal (30 min)** — triar `depois`, arquivar handoffs com mais de 30 dias, verificar se algum `estado` passou de uma página.

**Prazos** — PAT do GitHub expira **24/set/2026**. Tokens Meta e service account Google: registar validade em `estado-plataforma-e-infra.md`.
