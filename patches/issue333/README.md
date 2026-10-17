# #333 compatibilidade INERTE — não aplicar/deployar

Estes fontes não são importados pela aplicação nem por funções em produção.
`compatibility.PENDENTE.patch` é a entrega aplicável a rever; não foi aplicado.
`identity.ts` / `compat.ts` são os fontes exatos incluídos no patch para o futuro
`supabase/functions/_shared/standalone-*`; frontend importa por `@shared` existente.
`frontend-lookup.ts` é preparado para `src/lib/standalone-identity-lookup.ts`.

Antes de aplicar: rever hashes dos arquivos-base e patch, política forte, contratos,
permissões/FX e testes; aplicar compatibilidade ANTES do índice, numa janela própria.
Nenhuma alteração destes arquivos ativa upload/execute #333.

Política proposta, não decisão comercial aplicada: trim SPACE exterior + caixa ASCII,
conservando todos os separadores internos/prefixos/zeros. A normalização destrutiva
anterior está abandonada. Não-ASCII e tabs continuam distintos. País prefixado e
NIF formatado com espaços continuam distintos: revisão humana, não equivalência.
Sinal amplo só ajuda revisão privada; não bloqueia/merge/reused automaticamente.

Não há limpeza de candidatos em erro/unknown. Não há retry automático de INSERT
após resultado incerto. Reused é exclusivamente uma conferência read-only de identidade,
campos pertinentes e bytes reais. Estado processado atual é preservado e independente
da equivalência original; nunca atualizado por um retry.