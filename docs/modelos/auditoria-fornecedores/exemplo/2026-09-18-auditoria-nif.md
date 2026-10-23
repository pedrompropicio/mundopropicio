# Exemplo — Auditoria de NIF dos fornecedores (18/09/2026)

> **Origem dos números.** Base Live, consultados no momento da escrita, 18/09/2026.
> Relatório original: `claude/auditoria-nif-fornecedores-2026-09-18.md`.
> **Anonimização:** fornecedores por tipo, pessoas por papel, emails removidos. Os valores e as
> contagens são os reais. O NIF da própria MP aparece porque é público e faz parte da regra.

## Ponto de partida e resultado

| | |
|---|---|
| Fornecedores com NIF, no início | 46 |
| Fornecedores com NIF, no fim | **80** |
| Corrigidos nesta sessão | **53** |
| Sem NIF, ainda com documento legível | 156 — 380.593,40 € de valor pago |

Cinco lotes, 73 fornecedores analisados: **53 acertos, 0 `REVER`, 0 falsos positivos.**

## As regras que evitaram erros

- **A fatura portuguesa tem dois NIF.** O cliente é sempre a MP, `515274291` — nunca é resposta.
  Erro já cometido antes desta sessão.
- Descartar: telefones, IBAN/NIB, referências Multibanco, NIPC de bancos, códigos postais, números
  de fatura e de cliente, códigos de programa certificado AT (`nnnn/AT`), SIRET francês de 14
  dígitos (não é CNPJ).
- Mais de um candidato plausível → `REVER`, nunca escolher por intuição. Não ocorreu nenhum caso.

## Porque falham os que falham — três padrões, sempre os mesmos

1. **Comprovativo bancário.** Notificação de transferência, comprovativo de lote SEPA ou extrato.
   Nunca trazem o NIF do beneficiário. É o caso mais comum.
2. **Anexo de outra entidade.** A linha de um hotel tem a proforma de outro; a de uma pessoa tem a
   fatura do hotel onde ela foi só hóspede; a de um prestador tem a fatura da empresa que lhe
   fatura o cachê.
3. **Recibo sem identificação de quem recebeu.** Recibos de diária com o campo "Recebido por" em
   branco.

## Os grandes que ficam, e onde está o número

| Fornecedor | Pago | Onde está o NIF |
|---|---:|---|
| Agência de viagens corporativa | 51.158,02 € | contrato assinado em plataforma de assinatura digital |
| Prestadora de produção | 28.744,87 € | contrato de prestação de serviços / dossier de pessoal |
| Associação gestora de sala | 26.748,00 € | fatura na posse da administração, ou Portal das Finanças |
| Prestador técnico | 18.115,65 € | contrato / dossier de pessoal |

O rendimento por lote já era decrescente — o lote 4 andava nos 3.000 € por fornecedor — e os
grandes casos **não se resolvem por PDF**. Decisão do Pedro: os 156 restantes ficam como estão,
não afetam a operação diária. A auditoria fecha aí.

## Limite descoberto, e que muda o método da próxima vez

As faturas dos fornecedores **não chegam à caixa do Pedro**. Vão para as caixas da administração e
da produção; a do Pedro recebe contratos, fechos e cópias em Cc. Qualquer varredura futura a
faturas por email tem de partir dessas duas caixas.

## Achado colateral — 141 documentos inalcançáveis

Ao investigar ficheiros que davam NoSuchKey, a varredura em SQL (`transaction_documents` ×
`storage.objects`) revelou **141 ficheiros inalcançáveis**, 136 de abril e 5 de agosto. Causa: os
objetos carregados antes da convenção atual estão no bucket como `<transaction_id>/<ts>.pdf`, mas
a linha na base guarda `<company_id>/<transaction_id>/<ts>.pdf` — **um prefixo a mais**.

**133 foram recuperados** com um UPDATE que remove o prefixo, com correspondência exata
um-para-um verificada contra `storage.objects`. Abril passou de 13 para 146 documentos
acessíveis — e isso destrancou dois dos NIF que faltavam. **8 estão genuinamente perdidos** (25
linhas), a repor por upload. Os prefixos `camarim://`, `card://` e `bank://` são esquemas próprios,
não são defeito.

A causa-raiz no código **não foi corrigida** — porque é que o `file_url` ficou com o prefixo nas
linhas pré-convenção. Foi para a frente de plataforma.
