import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNT } from "../../src/lib/demo-account";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Enter demo workspace" }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test("large event dashboards paginate registrants and keep global totals", async ({ page }) => {
  await page.goto(`/events/${DEMO_ACCOUNT.eventId}`);
  await expect(page.getByRole("region", { name: "Event attendance metrics" }).getByText("260", { exact: true })).toBeVisible();
  await expect(page.locator(".registrants article")).toHaveCount(25);
  await expect(page.getByText("Page 1 of 11")).toBeVisible();
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/registrantsPage=2/);
  await expect(page.locator(".registrants article")).toHaveCount(25);
});

test("restricted check-in explains the missing permission", async ({ page }) => {
  await page.goto(`/events/${DEMO_ACCOUNT.eventId}/check-in`);
  await expect(page.getByRole("heading", { name: "Check-in access required" })).toBeVisible();
  await expect(page.getByText(/does not have permission to run check-in/)).toBeVisible();
  await expect(page.getByText("Something didn’t go as planned")).toHaveCount(0);
});

test("the global skip link is the first interactive control", async ({ page }) => {
  await page.goto(`/events/${DEMO_ACCOUNT.eventId}`);
  const skip = page.locator("body > a.skip-link");
  await expect(skip).toHaveAttribute("href", "#main-content");
  await skip.focus();
  await expect(skip).toBeFocused();
});
