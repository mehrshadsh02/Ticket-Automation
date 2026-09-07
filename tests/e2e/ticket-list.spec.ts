import { expect, test } from "@playwright/test";
import { TicketListPage } from "../../pages/TicketListPage.js";
import { ticketListHtml } from "../fixtures/helpicalHtml.js";

test("parses Helpical ticket rows by header names", async ({ page }) => {
  await page.setContent(ticketListHtml);
  const tickets = await new TicketListPage(
    page,
    "https://helpical.test/",
  ).listTickets();

  expect(tickets).toEqual([
    {
      id: "1234",
      title: "اختلال در پذیرش",
      center: "بیمارستان اردیبهشت شیراز",
      organization: "گروه درمان",
      priority: "بالا",
      creator: "علی رضایی",
      assignee: "پشتیبان یک",
      status: "باز",
      createdAt: "۱۴۰۵/۰۶/۱۵ ۰۹:۳۰",
      updatedAt: "۱۴۰۵/۰۶/۱۶ ۱۰:۴۵",
      url: "https://helpical.test/tickets/1234/",
      lastMessage: null,
    },
  ]);
});
