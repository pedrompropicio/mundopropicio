import { test, expect } from "../playwright-fixture";

/**
 * Painel do Manual de Orientação por cima dos modais.
 *
 * Verifica o caso reportado: com "Nova Transação" aberto, o "Saber mais" de um
 * ponto de ajuda tem de abrir o painel ACIMA do modal, legível e utilizável, e
 * fechá-lo não pode perder o que já estava escrito no formulário.
 */
test("o painel do manual abre por cima do modal de transação", async ({ page }) => {
  await page.goto("/transacoes");

  const remindLater = page.getByRole("button", { name: "Lembrar depois" });
  if (await remindLater.count()) await remindLater.first().click();

  await page.getByRole("button", { name: /Nova Transação/ }).first().click();
  const modal = page.locator("div.fixed.inset-0.z-\\[100\\]");
  await expect(modal).toBeVisible();

  const firstInput = modal.locator("input[type=text]").first();
  await firstInput.fill("teste");

  // Ponto de ajuda de "Dividir por vários eventos" → "Saber mais".
  await modal.getByLabel("Ajuda").first().hover();
  await page.getByText("Saber mais").first().click();

  const panel = page.locator('[data-help-panel="true"]');
  await expect(panel).toBeVisible();

  // Está por cima: o modal não intercepta cliques no painel.
  const question = panel.locator("textarea").first();
  await question.click();
  await question.type("rateio day off");
  await expect(question).toHaveValue("rateio day off");

  // Abrir/fechar um cartão de secção.
  const section = panel.getByRole("button", { name: /Master de várias cidades/ }).first();
  await section.click();
  await section.click();

  // Esc dentro do painel fecha só o painel; o modal fica com o que foi escrito.
  await panel.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(modal).toBeVisible();
  await expect(firstInput).toHaveValue("teste");
});
