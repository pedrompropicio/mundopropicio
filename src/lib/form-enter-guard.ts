/**
 * REGRA (22/09/2026): um formulário com botão de gravação só grava quando esse
 * botão é carregado — nunca por Enter num campo.
 *
 * PORQUÊ: a 21/09/2026 uma despesa ficou gravada e aprovada automaticamente sem
 * que quem a lançou soubesse que tinha gravado. Enter num `<input>` de linha
 * única dispara a submissão implícita do HTML e o `onSubmit` do `<form>` corre
 * sem qualquer clique.
 *
 * COMO USAR: `<form onSubmit={...} onKeyDown={blockImplicitSubmitOnEnter}>`.
 * Não se altera o `onSubmit`, nem os `type="submit"`, nem a estrutura do form
 * (há formulários que leem os campos com `new FormData(e.currentTarget)`).
 *
 * EXCEPÇÕES (o Enter passa):
 *  - foco num `<button>` (inclui `type="submit"` e os gatilhos de Select /
 *    DropdownMenu do Radix, que são botões) — navegação por teclado tem de
 *    conseguir carregar em Gravar;
 *  - foco numa `<textarea>` — Enter é linha nova;
 *  - Enter com Ctrl, Cmd (meta) ou Alt — atalhos que o campo pode tratar;
 *  - campo dentro de um elemento com `data-allow-enter` — válvula de escape
 *    para campos onde o Enter acrescenta uma linha/etiqueta/item a uma lista;
 *  - `<input type="submit">` / `type="button"` / `type="reset"`, tratados como
 *    botões.
 *
 * FORA DA REGRA: formulários de autenticação (login, recuperação, OTP, definir
 * ou alterar palavra-passe, convite, MFA) — o Enter é o comportamento esperado
 * e o botão não é de gravação; e formulários de pesquisa/filtro, que só leem.
 */

const BUTTON_INPUT_TYPES = new Set(["submit", "button", "reset", "checkbox", "radio"]);

export function blockImplicitSubmitOnEnter(event: React.KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter") return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const target = event.target as HTMLElement | null;
  if (!target) return;

  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type?.toLowerCase();
    if (type && BUTTON_INPUT_TYPES.has(type)) return;
  }
  if (target.getAttribute("role") === "button") return;
  if (target.closest("[data-allow-enter]")) return;

  event.preventDefault();
}
