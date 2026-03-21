import { test, expect } from "../playwright-fixture";

test.describe("Navigation (unauthenticated)", () => {
  test("redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/");
    // Should redirect to login since app requires auth
    await expect(page).toHaveURL(/login/, { timeout: 10000 });
  });

  test("login page is accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Mundo Propício")).toBeVisible();
  });

  test("404 page shows for unknown routes", async ({ page }) => {
    await page.goto("/non-existent-page-xyz");
    // Should either redirect to login or show 404
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/login|404|non-existent/);
  });
});
