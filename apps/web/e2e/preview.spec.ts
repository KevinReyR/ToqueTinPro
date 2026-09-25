import { expect, test } from "@playwright/test";

test("tracking is understandable at a glance", async ({ page }) => {
  await page.goto("/preview/tracking");
  await expect(page.getByText("Pedido 143")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Preparando" })).toBeVisible();
  await expect(page.getByText(/~4 min|~3 min/)).toBeVisible();
  await expect(page.getByText("Seguimiento disponible en la pantalla bloqueada")).toBeVisible();
  await page.getByRole("button", { name: "Recibir avisos del pedido" }).click();
  await expect(page.getByRole("dialog", { name: "¿Dónde quieres recibir avisos?" })).toBeVisible();
  await expect(page.getByText("Próximamente")).toBeVisible();
  await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
});

test("operator dashboard exposes one action per order", async ({ page }) => {
  await page.goto("/preview/dashboard");
  await expect(page.getByRole("heading", { name: "Pedidos en curso" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar como listo" })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Pedidos finalizados" })).toBeVisible();
  await expect(page.getByText("Preparación media")).toBeVisible();
  await page.getByRole("button", { name: "Ver detalle" }).first().click();
  await expect(page.getByRole("dialog", { name: "Pedido #140" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Línea de tiempo" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Pedido #140" })).not.toBeVisible();
});
