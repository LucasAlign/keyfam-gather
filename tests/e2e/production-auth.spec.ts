import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT } from "../../src/lib/demo-account";

test("the seeded demo account can sign in without hitting the application error boundary", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(DEMO_ACCOUNT.email);
  await page.getByRole("textbox", { name: "Password" }).fill(DEMO_ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByText("Something didn’t go as planned")).toHaveCount(0);
  await expect(page).toHaveURL(/\/events$/);
});

test("the demo autofill opens a read-only sample workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Fill demo login" }).click();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(DEMO_ACCOUNT.email);
  await expect(page.getByRole("textbox", { name: "Password" })).toHaveValue(DEMO_ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Create event/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Family Connection Night/ }).click();
  for (const action of ["Open check-in", "Manage registrants", "Invitations", "Name tags", "Tables & seating", "Hosts & groups", "Add registrant"]) {
    await expect(page.getByRole("link", { name: action, exact: true })).toHaveCount(0);
  }
});
