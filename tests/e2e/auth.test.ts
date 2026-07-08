import { expect, test } from "@playwright/test";
import { generateRandomTestUser } from "../helpers";

const protectedPages = ["/", "/chat/00000000-0000-0000-0000-000000000001", "/family"];

test.describe("Authentication Pages", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByPlaceholder("you@someo.ne")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("No account?")).toBeVisible();
    await expect(page.getByTestId("multimodal-input")).toHaveCount(0);
  });

  test("register page renders correctly", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByPlaceholder("you@someo.ne")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();
    await expect(page.getByText("Have an account?")).toBeVisible();
    await expect(page.getByTestId("multimodal-input")).toHaveCount(0);
  });

  test("preserves callbackUrl when navigating between auth pages", async ({ page }) => {
    await page.goto("/login?callbackUrl=%2Ffamily");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/register\?callbackUrl=%2Ffamily$/);

    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Ffamily$/);
  });
});

test.describe("Protected Routes", () => {
  for (const path of protectedPages) {
    test(`redirects logged-out users from ${path} to login`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(new RegExp(`/login\\?callbackUrl=${encodeURIComponent(path).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}`));
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      await expect(page.getByTestId("multimodal-input")).toHaveCount(0);
    });
  }

  test("protected APIs return 401 for logged-out users", async ({ page }) => {
    for (const path of ["/api/history", "/api/models", "/api/me/family"]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(401);
    }
  });
});

test.describe("Authentication Flow", () => {
  test("registers a user and redirects into the protected app", async ({ page }) => {
    const user = generateRandomTestUser();

    await page.goto("/register?callbackUrl=%2Ffamily");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page).toHaveURL(/\/family$/);
    // The family page renders the user's family name (defaults to "My Family").
    await expect(page.getByRole("heading", { name: "My Family" })).toBeVisible();
  });

  test("signing out sends the user back to login", async ({ page }) => {
    const user = generateRandomTestUser();

    await page.goto("/register");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page).toHaveURL(/\/$/);
    await page.getByTestId("user-nav-button").click();
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});