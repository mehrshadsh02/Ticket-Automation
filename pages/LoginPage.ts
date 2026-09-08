import type { Page } from "@playwright/test";

export class LoginPage {
  constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
  ) {}

  private get cleanBaseUrl(): string {
    return this.baseUrl.replace(/\/+$/, "");
  }

  async open(): Promise<void> {
    const signinUrl = `${this.cleanBaseUrl}`;
    await this.page.goto(signinUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  }

  async login(username: string, password: string): Promise<void> {
    if (!username || !password) {
      throw new Error("Helpical credentials must not be empty");
    }

    // اگر فرم ورود نیست صفحه ورود را باز کن
    if ((await this.page.locator("form#login-form").count()) === 0) {
      await this.open();
    }

    const formLocator = this.page.locator("form#login-form");
    await formLocator.waitFor({ state: "visible", timeout: 15_000 });

    await formLocator.locator('input[name="username"]').fill(username);
    await formLocator.locator('input[name="password"]').fill(password);

    const keepCheck = formLocator.locator('input[name="keep"]');
    if ((await keepCheck.count()) > 0) {
      await keepCheck.check().catch(() => {});
    }

    const submitBtn = formLocator.locator('button[type="submit"]');
    await submitBtn.click();

    // فقط منتظر می‌مانیم تا وارد محیط کاربری (داشبورد یا تیکت‌ها) شود
    await this.page.waitForFunction(
      () => {
        const path = window.location.pathname;
        return !path.includes("/signin") && (path.includes("/dashboard") || document.querySelector("#main-navbar") !== null);
      },
      null,
      { timeout: 25_000 }
    ).catch(() => {});

    // یک تأخیر جزئی برای نشستن کامل Cookie نشست هلپیکال
    await this.page.waitForTimeout(1000);
  }

  assertLoggedIn(): void {
    const currentUrl = this.page.url();
    if (currentUrl.includes("/signin")) {
      throw new Error(`کاربر هنوز لاگین نکرده است. آدرس فعلی: ${currentUrl}`);
    }
  }
}
