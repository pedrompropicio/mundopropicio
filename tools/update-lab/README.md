# Laboratório de atualização — #351 / #352

Estudo isolado, autorizado pelo Pedro. Não altera o cliente do ERP nem liga à sua base.

## Executar

Requer Node 24 ou superior. Na raiz do repositório:

```sh
node tools/update-lab/server.mjs
```

Abrir `http://127.0.0.1:4179/`. Escolher **Comportamento atual** ou **Proposta no laboratório**, escrever texto fictício e disponibilizar uma nova versão local. O botão apenas altera uma variável no processo de teste.

```sh
node --experimental-vm-modules --test tools/update-lab/tests/unit.test.mjs
node --test tools/update-lab/tests/browser.test.mjs
```

O segundo comando exige Playwright e Chromium instalados. Usa `@playwright/test` do projeto; alternativamente definir `UPDATE_LAB_PLAYWRIGHT_ROOT` para um módulo Playwright instalado. `UPDATE_LAB_CHROMIUM_PATH` permite indicar o executável. A ausência de navegador produz falha, nunca aprovação por skip.

O workflow `Update laboratory (isolated)` corre apenas nesta branch, com permissões de leitura, sem segredos de ambientes e sem deploy. Instala a dependência do teste numa pasta temporária, sem alterar o lockfile do ERP.

## Código real versus simulações

- `sources.json` fixa os SHA-256 de cinco ficheiros da revisão de origem. O servidor recusa arrancar se esses bytes divergirem. Não atualizar os hashes sem rever a nova origem.
- O modo atual executa `src/components/PWAUpdateManager.tsx` e os módulos reais `src/lib/versionCheck.ts` e `src/lib/pwa.ts`. O servidor remove apenas os tipos e substitui as constantes de build/ambiente.
- `adapters.js` substitui hooks React/TanStack e notificações por adaptadores mínimos. Não há montagem do ERP, Auth, Supabase ou dados de clientes.
- `candidate-manager.js` é uma política experimental: oferece atualização e volta a verificar trabalho pendente no clique. Não é patch pronto para integrar no ERP.
- `sw-register.js` substitui o registo gerado pelo Vite/Workbox. `/sw.js` é um worker sintético sem cache nem fetch; os testes desse canal não comprovam o comportamento completo do Workbox em produção.
- Os testes de lógica usam VM e DOM/navegação simulados. Só os testes de navegador podem comprovar recarregamento real e perda/preservação do texto na página fictícia.

## Isolamento

Servidor ligado apenas a `127.0.0.1`, rotas numa lista fechada, recusa de Host/Origin diferentes e CSP `connect-src 'self'`. Não lê `.env`, não usa sessões reais e não importa o cliente Supabase. Nos testes Playwright, pedidos do browser fora da origem local são abortados e fazem falhar o cenário. O worker sintético não tem chamadas de rede.

As instalações de ferramentas pelo CI precisam de rede; a execução dos cenários da aplicação só usa loopback. Isto não constitui sandbox de código malicioso nem certificação de segurança.

## Limites desta etapa

Não é homologação completa da plataforma. Faltam React real, assets/cache Workbox reais, retenção dos ficheiros da versão anterior, fallback de chunk, testes iOS/Safari, fluxos do ERP e revisão independente. Não há alteração de esquema, funções de produção ou integração automática.

O fluxo de atualização deverá ser revisto como um todo antes de qualquer correção na plataforma. Não basta trocar o aviso se o service worker continuar a ativar ou a remover assets em uso.

Resultado da etapa e pendências: ver `RESULTADO.md` e os logs do workflow desta branch.
