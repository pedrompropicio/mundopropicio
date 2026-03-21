import { test, expect } from "../playwright-fixture";

test.describe("Auth Page", () => {
  test("shows login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Mundo Propício")).toBeVisible();
    await expect(page.getByPlaceholder("email@exemplo.com")).toBeVisible();
    await expect(page.getByPlaceholder("••••••••")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("email@exemplo.com").fill("invalid@test.com");
    await page.getByPlaceholder("••••••••").fill("wrongpassword");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("tentativa(s) restante(s)")).toBeVisible({ timeout: 10000 });
  });

  test("lockout after 5 failed attempts", async ({ page }) => {
    await page.goto("/login");
    for (let i = 0; i < 5; i++) {
      await page.getByPlaceholder("email@exemplo.com").fill("locktest@test.com");
      await page.getByPlaceholder("••••••••").fill("wrong" + i);
      await page.getByRole("button", { name: /Entrar|Bloqueado/ }).click();
      await page.waitForTimeout(1500);
    }
    await expect(page.getByText("Conta bloqueada")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /Bloqueado/ })).toBeDisabled();
  });

  test("navigates to forgot password", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Esqueceu a senha?").click();
    await expect(page.getByText("Recuperar senha")).toBeVisible();
    await expect(page.getByText("Enviar código de recuperação")).toBeVisible();
  });

  test("back to login from forgot password", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Esqueceu a senha?").click();
    await page.getByText("Voltar ao login").click();
    await expect(page.getByText("Entre na sua conta")).toBeVisible();
  });
});
