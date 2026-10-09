# Confirmar que um Publish chegou a produção (#231)

O build já gera `dist/version.json` com `{buildId, builtAt, commit}` em
`vite.config.ts`. Não manter uma cópia fixa em `public/`: ficaria desactualizada
e poderia parecer uma prova de publicação sem corresponder ao bundle.

Depois do Publish, a partir do repositório:

```sh
node scripts/check-deploy.mjs
```

Compara o `/version.json` servido em `https://mpgestaoeventos.com` com o HEAD
local. Para verificar um commit específico (SHA completo):

```sh
node scripts/check-deploy.mjs https://mpgestaoeventos.com <SHA-completo>
```

Saída `status: ok` e código 0 = SHA servido igual ao solicitado, com marca
temporal válida. SHA diferente, ausente, JSON inválido, HTTP/rede em falha:
código 1, nunca verde. A chamada usa cache-buster e `no-store`.
É uma verificação após publicação, não um detector automático de que alguém
carregou em Publish; não deve correr como bloqueio pré-Publish.

## Medir o bundle

Cada build gera também `dist/bundle-report.json`: bytes de cada chunk,
imports estáticos, módulos ordenados por tamanho e `initial` calculado pelos
imports estáticos transitivos a partir das entradas. O log apresenta a soma
dos bytes iniciais. Não confundir o tamanho do `index-*.js` com a soma inicial.

## Validação a 09/10/2026

- Produção: `index-Bg6Fut9J.js` = 821.293 bytes (0,783 MiB).
- Entrada + sete chunks iniciais (incluindo a entrada) = 4.553.745 bytes
  (4,343 MiB), sem os scripts da plataforma de hosting.
- Code-splitting por rota já entregue em `5552fefcd` (22/09); Planilha,
  restantes páginas de trabalho e relatórios carregam por `React.lazy`.
- Limite Workbox já reduzido a 6 MiB; não foi aumentado nesta tarefa.
- Script provado contra produção: SHA servido aceite; HEAD ainda não publicado
  recusado com código 1. Nenhum Publish executado.