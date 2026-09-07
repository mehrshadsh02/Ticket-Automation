import { expect, test } from "@playwright/test";
import { LoginPage } from "../../pages/LoginPage.js";
import { loginHtml } from "../fixtures/helpicalHtml.js";

test("logs in through the real Helpical sign-in form contract", async ({
  page,
}) => {
  let postedBody = "";
  await page.route("https://helpical.test/signin/", async (route) => {
    await route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: loginHtml,
    });
  });
  await page.route(
    "https://helpical.test/controller/signin.php",
    async (route) => {
      postedBody = route.request().postData() ?? "";
      await route.fulfill({
        contentType: "text/html",
        body: "<main>dashboard</main>",
      });
    },
  );

  const login = new LoginPage(page, "https://helpical.test/");
  await login.open();
  await login.login("operator@example.com", "secret-from-test-only");
  await login.assertLoggedIn();

  expect(postedBody).toContain("username=operator%40example.com");
  expect(postedBody).toContain("password=secret-from-test-only");
});
