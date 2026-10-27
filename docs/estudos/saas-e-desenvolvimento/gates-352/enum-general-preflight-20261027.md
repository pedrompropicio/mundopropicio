# #352 — enum_position_overlay geral: preparação e nova paragem de sanitização

27/10/2026. Parecer lido: 6441578437; mantêm-se 6433564033 e 6431939022.

## Resultado desta etapa

Preparação local da regra restrita a public.app_role: 21 instruções em 17 ficheiros, incluindo ledger e órfãos; todas as fontes do plano, incluindo Drizzle, foram varridas. Os 12 valores de Live têm origem no plano: dois na criação do tipo e dez em ADD VALUE. Nenhum valor foi inventado. Cada posição usa o vizinho já existente mais próximo na ordem de Live; empate determinístico favorece o predecessor.

Os originais ficam intactos. A cópia preparada e o manifesto registam ficheiro, linha, vizinho, posição e hashes original/publicado/executado. SHA-256 do manifesto preparado: 72a8139e00450c10c4e0ff4b72c25629285946d1073c2adf8373b3d6ba083f3e.

Seis testes Python passaram: validação das fontes/overlays; outro tipo intacto; corpo dollar-quoted intacto; valor não existente em Live recusado; vizinho mais próximo; modelo estático dos valores numéricos de enumsortorder igual à referência Live. A referência foi reconfirmada por SELECT de pg_enum em 27/10/2026 12:16:26 UTC.

**Isto ainda não é G1 nativo.** Código, overlays e plano preparados não foram publicados. A integração no runner e a verificação nativa final ficam pendentes. G1 e G2 não correram neste ciclo.

## Paragem prevista pela sanitização de R1

Ao verificar 147 expressões/definições de colunas, constraints, índices, vistas, políticas e triggers destinadas à etapa final, surgiram duas ocorrências de um mesmo literal fora da allowlist fechada. As duas políticas foram reconfirmadas por SELECT de pg_policy/pg_get_expr às 12:16:17 UTC.

| Objecto | OID | Propriedade | Linha da expressão |
|---|---:|---|---:|
| storage.objects — Authenticated users can upload credit docs | 63708 | with_check | 1 |
| storage.objects — Authenticated users can view credit docs | 109889 | qual | 1 |

O literal é o operando comparado com bucket_id. Não é classificado aqui como segredo: é um candidato da detecção lexical de texto semelhante a chave. A regra reviewed_literal_allowlist admite apenas os nove hashes/funções/linhas anteriores; estas duas ocorrências não estão abrangidas.

- SHA-256 do literal, igual nas duas ocorrências: 9d1e452d35b244702cd7ee56cf0479935481b5478c4f62632b32f61e7297cf43.
- SHA-256 de cada expressão completa: 9a197af9ca2cb990f290913860adaea7a562a2341373d10ae5f241d384692d7f.

Devolvido ao Claude para classificação e eventual inclusão fechada pelo hash, objecto e propriedade. Não foi criada uma excepção genérica para nomes de buckets, nem publicado o valor.

## Estado dos gates e coordenação

- R5: implementação local preparada e seis testes Python verdes; G1 nativo pendente.
- R1–R4/N9: preparação incompleta, interrompida na paragem de sanitização.
- G2: não executado; 448 continua a ser a medição do ciclo anterior.
- Reserva mantida; QUADRO/estado não alterados.
- Live apenas SELECT. Nenhum objecto apagado; nenhuma escrita em Live, infra, deploy ou Publish.
- HEAD público observado: 6b3817478e421444ffffcde36909c03971b5f4f0; GitHub=Lovable e agente livre. Main privado confirmado em d3c006118d89bf8c7a5b1b1c643df2866a55e52a. A #329 é reconfirmada no push documental.
