# PROC-despacho-executor — como o 0 · Cowork despacha ao executor E2b (Codex)

> Procedimento fixo. Origem: pedido do Pedro, 02/11/2026 («script de orientação completa de como deve ser o despacho»). Fonte das travas: `src/lib/executor/travas.ts` e `.github/workflows/executor.yml` (D-ERP345, D-ERP346, D-ERP348, D-ERP349). Quem despacha é o 0 · Cowork (ChatGPT no dia a dia, D-ERP350); os comentários saem em nome do Pedro pelo conector GitHub ou pelo painel. Nada aqui altera as classes de risco (D-ERP291).

## 0. O que o executor recebe — e o que não recebe

O executor (Codex) recebe **apenas**: o texto do despacho + o corpo da Issue. Em conflito, o despacho prevalece.
Não recebe: comentários da Issue, outras Issues, QUADRO, DECISIONS, Live, homolog, rede para serviços MP, segredos. Não faz commits nem push: o workflow recolhe o diff, corre tsgo + vitest, abre o PR para `main` e liga o merge automático se os testes passarem.

Consequência: **tudo o que o executor precisa vai dentro do despacho**. Uma referência a «ver comentário acima», «como medido ontem» ou «consultar em Live» equivale a não dizer nada.

## 1. Regra de granularidade — um despacho = um PR que fica verde sozinho

Agrupa no mesmo despacho tudo o que tem de entrar junto para a CI ficar verde e o ecrã funcionar: código + tipos + testes + i18n + memória da feature. Nunca separar «o componente» de «o teste», nem «o hook» do «ecrã que o usa».

Separa só por três motivos: (a) classe diferente (R1 código vs. R2 preparação de ficheiros); (b) repositório diferente (ERP vs. portais vs. mp-painel); (c) dependência real — o segundo passo precisa de algo que só existe depois do primeiro estar em Live (ex.: coluna nova). Fora disto, fragmentar é erro.

Tamanho de referência: um despacho cabe numa run de 60 minutos. Se a Issue tem mais do que isso, divide por **entregáveis completos** (ecrã A inteiro; ecrã B inteiro), nunca por tipo de ficheiro.

### 1.1 Tecto de tamanho e divisão de trabalho (decisão do Pedro, 02/11/2026)

- **Tecto: 1.500 palavras (≈ 10 k caracteres) por despacho.** Acima disso o despacho está a desenhar a solução em vez de a pedir. O executor lê o código melhor do que o chat o descreve: o despacho dá objectivo, regras de negócio, critérios de aceitação, proibições e os números/definições medidos; o desenho técnico (tabelas, assinaturas, ordem de locks, códigos de erro) é trabalho do executor e revê-se no PR.
- **Nunca «engordar» um despacho depois de uma run vazia.** Uma run sem diff é sinal de volume ou de regra de paragem, não de falta de detalhe (caso #486: 13 → 40 KB em quatro revisões, zero código). A resposta é dividir ou passar ao modo em dois tempos.
- **Despacho em dois tempos (temas grandes ou com desenho em aberto):**
  1. `## Despacho — #N` **«plano»**: o executor lê o código e escreve só `docs/testes/issueN/plano.md` — ficheiros a tocar, contratos propostos (tabelas/RPC/tipos), ordem de implementação, riscos e perguntas fechadas. Sem código. Lista fechada de caminhos = esse ficheiro + `.executor/resumo.md`. Custa minutos.
  2. O 0 revê o plano por leitura (e o Pedro decide as perguntas fechadas, se as houver).
  3. `## Despacho — #N` **«implementa o plano»**: «Implementar `docs/testes/issueN/plano.md` tal como aprovado» + critérios de aceitação + lista fechada de caminhos. Se o plano previr mais do que uma run, um despacho por parte, pela ordem do plano.
  Autorização e Reserva servem para os dois tempos (mesmo executor, caminhos da implementação já na Reserva).
- **Entrega parcial é aceite** desde que o que foi entregue compile e os testes passem; o que faltar vai em «Não feito / lacunas» com o critério numerado. Escrever isto no despacho — sobrepõe-se à regra «pára e reporta» do `AGENTS.md`, que só vale para caminhos fora da lista ou instruções impossíveis; dificuldade, volume ou tempo não são motivo de paragem.

## 2. Lista de completude — antes de escrever

1. Ler a Issue inteira (corpo + comentários) e `.lovable/memory/features/<tema>.md`.
2. Enumerar cada item pedido no corpo e nos comentários do Pedro. Para cada um, decidir: **neste despacho** / **noutro despacho (qual)** / **fora de âmbito (porquê)**.
3. Essa tabela vai **dentro do despacho**, na secção «Âmbito». Um item que não aparece em nenhuma das três colunas foi esquecido.
4. Copiar para o despacho as medições, definições de funções, nomes de colunas, ids e números que o executor vai precisar — com a origem e a data.
5. Confirmar a classe: só código em `src/` e testes → R1. Toca em `drizzle/`, `supabase/`, `.lovable/`, `.github/`, `.env` → não é R1; migração/edge/manual → R2 em preparação (`ficheiros de migração` = sim); `.lovable/` e `.github/` nunca passam pelo executor (agente Lovable ou conector).

## 3. Os três comentários — formato exacto (as travas lêem isto)

Ordem: Autorização → Reserva → Despacho. Autor: `pedrompropicio` (conector ou painel). Cada um começa na primeira linha pelo cabeçalho `## …`.

### 3.1 Autorização

```
## Autorização — #N
- **Classe:** R1
- **Executor atual:** Codex
- **Capacidades libertadas:** `codigo+testes` = sim
- **Ambiente:** homolog/local
- **Merge automático:** sim
- **Validade:** 2026-11-09
```

Variante R2 em preparação (ficheiros só, nada aplicado):
```
- **Classe:** R2
- **Capacidades libertadas:** `codigo+testes` = sim, `ficheiros de migração` = sim
```

Travas: Classe R1, ou R2 só com `ficheiros de migração` = sim; `codigo+testes` = sim obrigatório; nenhuma outra capacidade a sim (DDL, DML, edge functions, crons, envios externos, Publish recusam); a palavra «Live» em **Ambiente** recusa (mesmo negada — «sem Live» recusa, caso #498); **Validade** com data AAAA-MM-DD obrigatória; expirada recusa. «Claude Code» em vez de «Codex» só por designação do Pedro.

### 3.2 Reserva

```
## Reserva — #N
- **Executor:** Codex
- **Componentes:** src/components/…, src/lib/…, src/test/…
- **Início (UTC):** 2026-11-02 23:40
```

Travas: tem de existir **exactamente uma** reserva activa na Issue, do **mesmo executor** da Autorização. Reserva anterior → libertar primeiro com `## Reserva libertada — #N` (uma linha chega). Duas activas recusam.

### 3.3 Despacho

```
## Despacho — #N
<texto da tarefa, ≥ 20 caracteres, estrutura da secção 4>
```

Travas: o cabeçalho tem de conter `#N` da própria Issue; Issue aberta; autor Pedro. Um despacho de cada vez no repositório (fila `executor-mundopropicio`): o seguinte espera.

## 4. Estrutura do texto do despacho (modelo)

```
## Despacho — #N

**Objetivo (1 frase):** o que fica a funcionar quando este PR entrar.

**Âmbito desta tarefa**
- Neste despacho: item 1; item 2; item 3.
- Noutro despacho: item 4 (#M, R2 — coluna nova); item 5 (portal, repo X).
- Fora de âmbito: item 6 (decisão do Pedro pendente).

**Regras de negócio (à letra, com origem)**
- Regra A — origem: .lovable/memory/features/<tema>.md §x.
- Regra B — decisão do Pedro em dd/mm (D-ERPnnn).

**Contexto técnico colado aqui (o executor não lê comentários nem Live)**
- Ficheiros e símbolos a tocar: src/…/Ficheiro.tsx (função X), src/lib/… (tipo Y).
- Definições/medições necessárias: <colar SQL da função, nomes de colunas, EXPLAIN, números com data e origem>.
- O que já existe e NÃO deve ser reinventado: hook Z, util W.

**Critérios de aceitação (predicados verificáveis)**
1. Ao abrir <ecrã> com <condição>, mostra <resultado>.
2. `src/test/<nome>.test.ts` cobre: caso normal, caso limite, caso de erro.
3. tsgo e vitest sem falhas novas; nenhuma expectativa alterada só para passar.

**Não fazer**
- Não tocar em drizzle/, supabase/, .lovable/, .github/, .env (PR recusado).
- Não alterar <ficheiro/feature vizinha>; sem refactor oportunista; sem skip de testes.
- Não ligar a Live/homolog; sem fixtures com dados reais.

**Entrega**
- .executor/resumo.md com «### Feito» e «### Não feito / lacunas», um predicado por linha.
- Se algo não puder ser feito exactamente assim, parar e explicar em lacunas — não inventar.
```

## 5. Depois do despacho

1. O bot comenta `## Fecho — #N (executor E2b, Codex)` com PR, testes do runner e resumo. Sem alterações → «Sem alterações de código»: ler as lacunas e redespachar com o que faltou.
2. Revisão por leitura do diff do PR contra os critérios de aceitação. Merge automático entra quando o CI `quality` fica verde; PR draft = testes do runner falharam → corrigir com novo despacho (não editar o PR à mão).
3. Lacunas no Fecho que pertencem ao âmbito → novo despacho na mesma Issue (libertar e renovar a reserva se o executor mudar). Lacunas por decisão do Pedro → comentário «Precisa do Pedro» com a pergunta fechada.
4. Com o PR em `main`: `## Reserva libertada — #N`; linha «pronto para Publish» na Issue; Publish só na janela Claude com «Sim» (D-ERP350). R2 preparado (ficheiros) segue PROC-promocao: homolog → Live com «Sim» por migração, na janela Claude.
5. Fecho documental R0: estado da frente, DECISIONS.md se houve decisão, Issue fechada só depois de verificado em produção.

## 6. Corretivos (falha da plataforma)

Issue P0 com a classe. Se R1: Autorização + Reserva + Despacho imediatos — o gate «CI verde antes de dispatch» não se aplica a corretivos (D-ERP346); o merge continua a exigir CI verde. Se R2: ficheiros pelo executor em preparação, aplicação e deploy na janela Claude. Publish do corretivo fora de lote, com «Sim».

## 7. Erros observados que este procedimento proíbe

- Despacho que remete para comentários, QUADRO ou Live em vez de colar o conteúdo.
- Fragmentar um entregável em vários despachos (componente num, teste noutro).
- Omitir itens do corpo da Issue sem os classificar na secção «Âmbito».
- Cabeçalho sem `#N`; validade sem data; «Live» no ambiente; capacidades a mais.
- Segunda reserva sem libertar a primeira; executor da reserva diferente do da autorização.
- Pedir ao executor que toque em `.lovable/`, `.github/`, `drizzle/meta` ou que aplique SQL.
- Critérios de aceitação vagos («melhorar», «rever») em vez de predicados verificáveis.
- Despachar sem ter lido `.lovable/memory/features/<tema>.md` (trava anti-reinvestigação).
- Despacho acima de 1.500 palavras, ou que desenha o esquema/RPC/locks em vez de pedir o resultado (§1.1).
- Reenviar o mesmo despacho «com mais texto» depois de uma run sem diff, em vez de dividir ou passar ao modo em dois tempos.
