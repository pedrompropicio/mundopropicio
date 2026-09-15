# PROCEDIMENTO — Mensagem de arranque de chat

Quem abre chat é a secretaria (`gestao-de-chats`). Tipos e nomes: `docs/CHATS.md`.
Copiar o molde, preencher, **não** improvisar secções.

Todo o molde termina igual: **"Por agora não faças nada: confirma em 1 linha que leste isto e aguarda."**

---

## Molde 1 — Frente

```
ARRANQUE DO CHAT <frente>
Tipo: frente permanente

ÂMBITO
<uma linha: o que esta frente decide e mantém>
<uma linha: os módulos/ficheiros que lhe pertencem>

NÃO PERTENCE AQUI
- <tema> → <chat de destino>
- <tema> → <chat de destino>
Bug ou regra nova fora do âmbito: abrir Issue e tratar na frente respetiva.

RITUAL DE ARRANQUE (por esta ordem)
1. Ler docs/INDEX.md
2. Ler docs/estado/estado-<frente>.md
3. Ler as issues abertas — edge function `github-issues`, parâmetro `number`
4. Só então agir. Nunca diagnosticar antes de ler.

ESTADO CONHECIDO (cada número com origem)
- <facto/número> — origem: <query, ficheiro ou issue>
- <facto/número> — origem: <...>

Por agora não faças nada: confirma em 1 linha que leste isto e aguarda.
```

---

## Molde 2 — `bp-<evento>-<ano>`

```
ARRANQUE DO CHAT bp-<evento>-<ano>
Tipo: chat de evento — fase BP (do primeiro BP até o evento acontecer)

ÂMBITO
<uma linha: evento, formato, datas, se é master de tour>
<uma linha: o que se decide aqui — verbas, rateios, receita prevista deste evento>

NÃO PERTENCE AQUI
- Regra de rateio/verbas em geral → bp-verbas-e-rateio
- Vínculo transação↔linha de BP em geral → vinculo-bp-transacoes
- Fecho e sócios deste evento → fecho-<evento>-<ano>
- Plataforma, permissões, integrações → plataforma-e-infra
Bug, regra nova ou campo em falta: Issue + frente. Este chat nunca manda mexer na plataforma.

RITUAL DE ARRANQUE (por esta ordem)
1. Ler docs/INDEX.md
2. Ler docs/estado/estado-bp-<evento>-<ano>.md (ou o handoff, se ainda não existir estado)
3. Ler as issues abertas — edge function `github-issues`, parâmetro `number`
4. Só então agir.

ESTADO CONHECIDO (cada número com origem)
- events.id: <uuid> — origem: <query>
- BP aprovado: <valor> — origem: <query passo 2 do PROC-fecho-evento>
- <...> — origem: <...>

Por agora não faças nada: confirma em 1 linha que leste isto e aguarda.
```

---

## Molde 3 — `fecho-<evento>-<ano>`

```
ARRANQUE DO CHAT fecho-<evento>-<ano>
Tipo: chat de evento — fase fecho (do evento até selar). Todos os fechamentos deste evento aqui.

ÂMBITO
<uma linha: evento, datas realizadas, sócios envolvidos>
<uma linha: onde está o fecho — conferências C1/C2, selado ou não>

NÃO PERTENCE AQUI
- BP e verbas deste evento → bp-<evento>-<ano>
- Regra geral de fechamento/sócios → fecho-e-socios
- Bilheteira/sync → ticketing-e-receita
- Banco, conciliação, pagamentos → financeiro-e-tesouraria
Bug, regra nova ou campo em falta: Issue + frente. Este chat nunca manda mexer na plataforma.

RITUAL DE ARRANQUE (por esta ordem)
1. Ler docs/INDEX.md
2. Ler docs/fechos/estado-<evento>-<ano>.md (ou o handoff)
3. Ler as issues abertas — edge function `github-issues`, parâmetro `number`
4. Correr docs/procedimentos/PROC-fecho-evento.md do passo 0 em diante. As queries decidem.

ESTADO CONHECIDO (cada número com origem)
- events.id: <uuid> — origem: <query passo 0>
- Receita s/IVA: <valor> — origem: <query passo 1>
- Custo do fecho s/IVA: <valor> — origem: <passos 2+3>
- Fechamento selado: <sim/não, data, valor selado> — origem: <aba Sócios → fechamento>

Por agora não faças nada: confirma em 1 linha que leste isto e aguarda.
```

---

## Molde 4 — Chat de operação

```
ARRANQUE DO CHAT <nome do chat de operação>
Tipo: chat de operação — alimenta o sistema, nunca o altera

ÂMBITO
<uma linha: que entradas trata (email, faturas, extratos, recibos)>
<uma linha: o que faz no sistema — lançar, desdobrar, importar, conciliar, anexar>

NÃO PERTENCE AQUI
- Regra de fecho/sócios → fecho-e-socios
- Regra de BP, verbas ou rateio → bp-verbas-e-rateio
- Regra de vínculo transação↔BP → vinculo-bp-transacoes
- Regra de banco, IVA, pagamentos ou tesouraria → financeiro-e-tesouraria
- Plataforma, permissões, integrações → plataforma-e-infra
Bug, regra nova ou campo em falta: Issue + frente respetiva. Este chat nunca manda mexer na plataforma.

RITUAL DE ARRANQUE (por esta ordem)
1. Ler docs/INDEX.md
2. Ler docs/estado/estado-<frente-mãe>.md
3. Ler as issues abertas — edge function `github-issues`, parâmetro `number`
4. Ler .lovable/memory/features/ do fluxo em causa (o pressuposto é que já existe)
5. Só então agir. Nunca inventar campo, conta ou regra.

ESTADO CONHECIDO (cada número com origem)
- <facto/número> — origem: <query, ficheiro ou issue>
- <facto/número> — origem: <...>

FORMA DE TRABALHAR
triagem → escolha → preview → confirmação do Pedro → execução → documento anexado

Por agora não faças nada: confirma em 1 linha que leste isto e aguarda.
```

---

## Fecho de chat (obrigatório)

1. **Reescrever o ficheiro de estado por cima** — não acrescentar ao fundo, não datar secções.
2. **Issues** — abrir as novas, fechar as resolvidas, comentar as decisões.
3. **`docs/DECISIONS.md`** — só se houve decisão de arquitetura ou regra de negócio.
4. **Handoff em `docs/handoffs/`** — só se a sessão foi longa e densa. É arquivo, não estado.
