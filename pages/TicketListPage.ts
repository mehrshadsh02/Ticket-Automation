import type { Locator, Page } from "@playwright/test";
import type { Ticket } from "../models/Ticket.js";
import {
  canonicalHeader,
  normalizeDigits,
  normalizeText,
} from "../utils/text.js";
import { resolveUrl } from "../utils/url.js";

type TicketField = Exclude<keyof Ticket, "lastMessage" | "url">;

const headerAliases: Readonly<Record<TicketField, readonly string[]>> = {
  id: ["شناسه", "شماره", "کد", "id"],
  title: ["عنوان", "موضوع", "عنوان تیکت"],
  priority: ["اولویت"],
  organization: ["سازمان", "مشتری", "شرکت"],
  center: ["مرکز", "واحد", "مرکز درمانی"],
  creator: ["ایجاد کننده", "ایجادکننده", "فرستنده", "ثبت کننده", "کاربر"],
  assignee: ["مسئول", "ارجاع به", "کارشناس", "پاسخ دهنده"],
  status: ["وضعیت"],
  createdAt: ["تاریخ ایجاد", "ایجاد", "تاریخ ثبت"],
  updatedAt: [
    "آخرین بروزرسانی",
    "آخرین به روزرسانی",
    "بروزرسانی",
    "آخرین پاسخ",
  ],
};

const requiredFields: readonly TicketField[] = [
  "id",
  "title",
  "priority",
  "center",
  "creator",
  "assignee",
  "status",
  "createdAt",
  "updatedAt",
];

export class TicketListPage {
  constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
  ) {}

  async open(): Promise<void> {
    await this.page.goto(new URL("tickets/", this.baseUrl).toString());
  }

  async listTickets(): Promise<Ticket[]> {
    const table = await this.findTicketTable();
    const headers = await table.locator("thead th").allTextContents();
    const columns = this.mapColumns(headers);
    const rows = table.locator("tbody tr");
    const tickets: Ticket[] = [];
    const rowList = await rows.all();

    for (const current of rowList) {
      const cells = await current.locator("td").allTextContents();
      if (cells.length === 0) continue;
      const link = current
        .locator('a[href*="ticket"], a[href*="tickets/"]')
        .first();
      const href = (await link.getAttribute("href")) ?? "";
      const value = (field: TicketField): string =>
        normalizeText(cells[columns.get(field) ?? -1]);
      const id = normalizeDigits(value("id")).replace(/^#/, "");

      tickets.push({
        id,
        title: value("title") || normalizeText(await link.textContent()),
        priority: value("priority"),
        organization: value("organization"),
        center: value("center"),
        creator: value("creator"),
        assignee: value("assignee"),
        status: value("status"),
        createdAt: value("createdAt"),
        updatedAt: value("updatedAt"),
        url: href ? resolveUrl(href, this.baseUrl) : this.page.url(),
        lastMessage: null,
      });
    }
    return tickets;
  }

  private async findTicketTable(): Promise<Locator> {
    const tables = this.page.locator("table");
    for (const candidate of await tables.all()) {
      const headers = await candidate.locator("thead th").allTextContents();
      const mapped = this.mapColumns(headers, false);
      if (requiredFields.every((field) => mapped.has(field))) return candidate;
    }
    throw new Error(
      "Could not find a Helpical ticket table with the required headers",
    );
  }

  private mapColumns(
    headers: string[],
    strict = true,
  ): Map<TicketField, number> {
    const result = new Map<TicketField, number>();
    headers.forEach((header, index) => {
      const normalized = canonicalHeader(header);
      for (const [field, aliases] of Object.entries(headerAliases) as [
        TicketField,
        readonly string[],
      ][]) {
        if (aliases.some((alias) => normalized === canonicalHeader(alias))) {
          if (!result.has(field)) result.set(field, index);
        }
      }
    });
    if (strict) {
      const missing = requiredFields.filter((field) => !result.has(field));
      if (missing.length > 0)
        throw new Error(
          `Ticket table is missing required columns: ${missing.join(", ")}`,
        );
    }
    return result;
  }
}
