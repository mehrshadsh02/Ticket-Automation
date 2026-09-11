import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { CenterConfig } from "../../models/CenterConfig.js";
import type { Ticket } from "../../models/Ticket.js";
import { TicketRepository } from "../../storage/TicketRepository.js";

const center: CenterConfig = { id: "test-center", name: "مرکز تست", adminName: "کاربر مرکز", enabled: true, todoListName: "تست" };
const makeTicket = (id: string, messages = 5): Ticket => ({ id, centerId: center.id, title: `تیکت ${id}`, priority: "بالا", priorityCode: "H", organization: "سازمان", center: center.name, creator: center.adminName, assignee: "پشتیبان", status: "باز", statusCode: 0, createdAt: "1405/01/01", updatedAt: "1405/01/01", url: `https://helpical.test/ticket/${id}/`, messages: Array.from({ length: messages }, (_, i) => ({ author: i % 2 ? "پشتیبان" : center.adminName, date: `1405/01/0${i + 1}`, text: `پیام ${i + 1}`, status: "باز" })) });

test("SQLite schema persists one master and idempotent details", async () => {
  const dir = await mkdtemp(join(tmpdir(), "helpical-db-schema-"));
  const path = join(dir, "tickets.sqlite3");
  const repository = new TicketRepository(path, [center]);
  try {
    for (let i = 1; i <= 87; i++) repository.createTicket(makeTicket(String(i), 0));
    const ticket = makeTicket("detail-1");
    repository.createTicket(ticket);
    repository.updateTicket(ticket);
    repository.updateTicket({ ...ticket, messages: [...ticket.messages!, { author: "پشتیبان", date: "1405/01/06", text: "پیام جدید", status: "باز" }] });
    const db = new DatabaseSync(path);
    expect((db.prepare("SELECT COUNT(*) AS n FROM centers").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM tickets").get() as { n: number }).n).toBe(88);
    expect((db.prepare("SELECT COUNT(*) AS n FROM ticket_details").get() as { n: number }).n).toBe(6);
    expect((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys).toBe(1);
    expect(repository.findDetails(repository.findByTicketId("detail-1")!.id)).toHaveLength(6);
    expect(() => repository.insertDetail({ ticketId: 999999, centerId: center.id, updatedAt: "now", senderName: "x", creatorName: "x", messageText: "x", senderType: "S", statusCode: 0, messageHash: "invalid-fk" })).toThrow();
    db.close();
  } finally {
    repository.close();
    await rm(dir, { recursive: true, force: true });
  }
});
