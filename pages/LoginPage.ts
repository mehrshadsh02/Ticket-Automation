import { expect, type Page } from "@playwright/test";

export class LoginPage {
  constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
  ) {}

  async open(): Promise<void> {
    await this.page.goto(new URL("signin/", this.baseUrl).toString());
    await expect(this.page.locator("form#login-form")).toBeVisible();
  }

  async login(username: string, password: string): Promise<void> {
    if (!username || !password)
      throw new Error("Helpical credentials must not be empty");

    const form = this.page.locator("form#login-form");
    await form.locator('input[name="username"]').fill(username);
    await form.locator('input[name="password"]').fill(password);
    await Promise.all([
      this.page.waitForLoadState("domcontentloaded"),
      form.locator('button[type="submit"]').click(),
    ]);
  }

  async assertLoggedIn(): Promise<void> {
    await expect(this.page.locator("form#login-form")).toHaveCount(0);
  }
}
