# #352 — evidências para revisão dos overlays VIA A

24/10/2026 — executor Codex; revisão [6389176454](https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6389176454). Só documentação sanitizada; sem publicar SQL integral/overlays, sem replay ou alterações Live. Fonte: exportação SELECT anterior, com os 711 hashes originais reconferidos; nenhuma nova consulta Live foi necessária.

[via-a-verificacoes.json](via-a-verificacoes.json) actualizado:

- **43 removed_preview em 10 versões**, limitados aos primeiros 200 caracteres de origem e depois sanitizados. Substituições podem mudar o comprimento exibido. Incluído também sql_preview após comentários iniciais, para permitir rever o comando quando os primeiros 200 caracteres eram só comentário. Literais e comentários foram integralmente mascarados; tipos identificáveis usam `<redigido:tipo>`.
- **20260318131618: 25 intervalos agrupados por event_forecasts**, preservando os intervalos e índices individuais.
- **39 descritores: 9 aprovados / 21 rejeitados / 9 pendentes.** A turnê 20260318234225 está aprovada conforme a excepção da revisão, mas recebeu as prévias pedidas. Rejeitados: overlay_path nulo, execução aponta para o hash original, removed_ranges vazio; proposta anterior arquivada no próprio descritor. Os 21 ficheiros de overlay da preparação local anterior foram eliminados na etapa anterior, originais intactos; nesta entrega nenhum ficheiro de overlay foi tocado. Não existiam na branch publicada; nenhuma alteração na branch nesta etapa. Não foi regenerado plano executável.

## Varredura das 322 versões só-ledger

Tabela completa das 322 versões, incluindo 310 sem ocorrências, em `evidence_stage.PII_scan.rows`. Cada versão tem tipo, contagem e linhas, sem valores. Resultados: **5 ocorrências de padrão email, 1 telefone e 21 literais de texto livre candidatos a nome** em 12 versões. **0 IBAN e 0 NIF/NIPC** encontrados após excluir 6 máscaras numéricas de to_char que o padrão inicial confundia com IBAN.

Os 21 candidatos não significam 21 pessoas: são literais em matched_by/notes/description, incluindo comparações e templates, que exigem revisão conservadora. Emails podem ser exemplos/remetentes, não necessariamente contactos pessoais. A varredura por padrões não certifica ausência absoluta de PII (expressões dinâmicas/codificadas ou formatos não reconhecidos permanecem limitação).

| Versão | Tipo | Contagem | Linhas |
|---|---|---:|---|
| 20260318234225 | nome_em_texto_livre_candidato | 1 | 17 |
| 20260426180941 | nome_em_texto_livre_candidato | 7 | 66, 88, 107, 445, 486, 1342, 1593 |
| 20260429203825 | email | 4 | 242, 243, 252, 254 |
| 20260429203825 | telefone | 1 | 1212 |
| 20260509150146 | nome_em_texto_livre_candidato | 2 | 506, 757 |
| 20260521124428 | nome_em_texto_livre_candidato | 1 | 99 |
| 20260607171212 | email | 1 | 77 |
| 20260612160513 | nome_em_texto_livre_candidato | 1 | 31 |
| 20260616182425 | nome_em_texto_livre_candidato | 1 | 123 |
| 20260616225652 | nome_em_texto_livre_candidato | 1 | 123 |
| 20260712223419 | nome_em_texto_livre_candidato | 4 | 43 (4 ocorrências) |
| 20260713152832 | nome_em_texto_livre_candidato | 2 | 56, 119 |
| 20260714160214 | nome_em_texto_livre_candidato | 1 | 13 |

Verificações: 711 hashes originais preservados; 43 prévias sem literais expostos; 25 intervalos agrupados; contagens 9/21/9; testes sintéticos de redacção das categorias pedidas e exclusão de UUID/data/máscara numérica passaram. Nenhum valor pessoal incluído na nota ou nos comentários. A prévia mostra apenas código com substituições; não é overlay materializado.

G1/G2 não executados nesta etapa; G6 Pedro. Entrega documental expressamente autorizada pelo Pedro em 24/10/2026, prevalecendo sobre o anterior “só leitura / nada publicado” apenas para estes documentos e comentário. Reserva desta entrega: d6c35f1b2144cf2ddf4fcd459f39cc4053288338; #329 confirmado antes das escritas, libertação no fecho. Próximo passo é Claude rever as 9 pendências e as ocorrências de PII para fechar a lista; esta entrega não autoriza publicar o ledger ou activar o replay.

Todos os 87 intervalos, incluindo os 35 arquivados nas propostas rejeitadas, têm `statement_kind` e `target_table`: DELETE: 7, INSERT_SELECT: 6, INSERT_VALUES: 9, UPDATE: 64, WITH: 1. Os 25 intervalos agrupados também conservam estes campos. Nenhum SQL foi executado; a classificação usa a leitura dos bytes originais e não altera os intervalos.
