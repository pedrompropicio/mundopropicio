

O utilizador já tem o sistema de links externos do Drive a funcionar (vide `mem://features/bp-attachment-links` e `ExternalLinkAttachment.tsx`). O que ele pediu agora é simplesmente confirmar que vamos partilhar a pasta com o domínio `mundopropicio.com` no Drive — não há mudança de código necessária para isso funcionar, porque a app já guarda o URL do Drive como `ref://https://...` e abre em nova aba (a autenticação é feita pelo Google contra o Workspace do utilizador).

Verifiquei o `ExternalLinkAttachment.tsx`: já abre o link com `target="_blank"`, e a thumbnail do Drive (`drive.google.com/thumbnail?id=...&sz=w400`) só funciona se o ficheiro for público OU se o browser tiver sessão Google ativa no domínio. Quando partilhado só com o domínio Workspace, a thumbnail pode falhar para alguns utilizadores — mas o componente já tem `onError` que esconde graciosamente.

Não há código a alterar. Isto é puramente uma orientação operacional no Google Drive. Vou dar instruções passo-a-passo.

