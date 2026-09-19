import { expect, test } from "@playwright/test";

test("tracking is understandable at a glance", async ({ page }) => {
  await page.goto("/preview/tracking");
  await expect(page.getByText("Pedido 143")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preparando" })).toBeVisible();
  await expect(page.getByText(/~4 min|~3 min/)).toBeVisible();
  await expect(page.getByText("Seguimiento disponible en la pantalla bloqueada")).toBeVisible();
});

test("operator dashboard exposes one action per order", async ({ page }) => {
  await page.goto("/preview/dashboard");
  await expect(page.getByRole("heading", { name: "Pedidos en curso" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar como listo" })).toHaveCount(2);
});
