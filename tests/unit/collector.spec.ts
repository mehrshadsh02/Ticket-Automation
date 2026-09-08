import { expect, test } from "@playwright/test";
import type { Ticket } from "../../models/Ticket.js";
import { TicketCollector } from "../../services/TicketCollector.js";

test("enriches listed tickets with detail status and latest message", async () => {
  const listed: Ticket = {
    id: "42",
    title: "List title",
    priority: "بالا",
    organization: "Org",
    center: "Configured center",
    creator: "Creator",
    assignee: "Assignee",
    status: "باز",
    createdAt: "date 1",
    updatedAt: "date 2",
    url: "https://helpical.test/tickets/42/",
    lastMessage: null,
  };
  const latestMessage = {
    author: "Agent",
    date: "date 3",
    text: "Resolved",
    status: "پاسخ داده شد",
  };
  let opened = "";
  const collector = new TicketCollector(
    { listTickets: () => Promise.resolve([listed]) },
    {
      open: (url) => {
        opened = url;
        return Promise.resolve();
      },
      readDetails: () =>
        Promise.resolve({
          title: "Detail title",
          status: "بسته",
          messages: [latestMessage],
          latestMessage,
        }),
    },
    [{ id: "configured", name: "Configured center", enabled: true, todoListName: "Configured center" }],
  );

  const result = await collector.collect();
  expect(opened).toBe(listed.url);
  expect(result[0]).toMatchObject({
    title: "Detail title",
    status: "بسته",
    lastMessage: latestMessage,
  });
});
