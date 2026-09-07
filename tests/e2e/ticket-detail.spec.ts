import { expect, test } from "@playwright/test";
import { TicketPage } from "../../pages/TicketPage.js";
import { ticketDetailHtml } from "../fixtures/helpicalHtml.js";

test("parses all Helpical conversation entries without relying on duplicate IDs", async ({
  page,
}) => {
  await page.setContent(ticketDetailHtml);
  const details = await new TicketPage(page).readDetails();

  expect(details.title).toBe("اختلال در پذیرش");
  expect(details.status).toBe("در حال بررسی");
  expect(details.messages).toHaveLength(2);
  expect(details.messages[0]).toEqual({
    author: "علی رضایی",
    date: "1405/06/15 09:30",
    text: "سامانه پذیرش باز نمی‌شود.",
    status: null,
  });
  expect(details.latestMessage).toEqual({
    author: "پشتیبان یک",
    date: "1405/06/16 10:45",
    text: "موضوع بررسی شد؛ لطفاً دوباره آزمایش کنید.",
    status: "پاسخ داده شد",
  });
});
