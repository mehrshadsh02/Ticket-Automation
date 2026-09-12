import { expect, test } from "@playwright/test";
import type { CenterConfig } from "../../models/CenterConfig.js";
import type { Ticket } from "../../models/Ticket.js";
import { TicketCollector } from "../../services/TicketCollector.js";

const ticket = (id: string, center: string): Ticket => ({
  id,
  title: `ticket ${id}`,
  priority: "normal",
  organization: "",
  center,
  creator: "",
  assignee: "",
  status: "open",
  createdAt: "",
  updatedAt: "",
  url: `https://helpical.test/tickets/${id}/`,
  lastMessage: null,
  idSource: "ticket-link",
});


test("collects only centers enabled in configuration", async () => {
  const centers: CenterConfig[] = [
    { id: "enabled", name: "مرکز فعال", adminName: "مسئول فعال", enabled: true, todoListName: "مرکز فعال"  },
    { id: "disabled", name: "مرکز غیرفعال", adminName: "مسئول غیرفعال", enabled: false, todoListName: "مرکز غیرفعال" },
  ];
  const opened: string[] = [];
  const collector = new TicketCollector(
    {
      listTickets: () =>
        Promise.resolve([
          ticket("1", "مرکز فعال"),
          ticket("2", "مرکز غیرفعال"),
          ticket("3", "ناشناخته"),
        ]),
    },
    {
      open: (url) => {
        opened.push(url);
        return Promise.resolve();
      },
      readDetails: () =>
        Promise.resolve({
          title: "detail",
          status: "open",
          messages: [],
          latestMessage: null,
        }),
    },
    centers,
  );

  await expect(collector.collect()).resolves.toHaveLength(1);
  expect(opened).toEqual(["https://helpical.test/tickets/1/"]);
});
