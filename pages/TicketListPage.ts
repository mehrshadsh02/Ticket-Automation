import type { Locator, Page } from "@playwright/test";
import type { Ticket } from "../models/Ticket.js";
import { centers } from "../config/centers.js";
// import * as fs from 'fs';
// import * as path from 'path';
import {
  // canonicalHeader,
  normalizeDigits,
  normalizeText,
} from "../utils/text.js";
import { resolveUrl } from "../utils/url.js";

type TicketField = "id" | "title" | "priority" | "organization" | "creator" | "center" | "assignee" | "status" | "createdAt" | "updatedAt";

// const headerAliases: Readonly<Record<TicketField, readonly string[]>> = {
//   id: ['#', 'id', 'شناسه', 'کد', 'شماره'],
//   title: [
//     "دسته بندی/عنوان",
//     "دسته‌بندی/عنوان",
//     "دسته بندی",
//     "دسته‌بندی",
//     "عنوان",
//     "موضوع",
//     "عنوان تیکت",
//     "title",
//   ],
//   priority: ["اهمیت", "اولویت", "priority"],
//   organization: ["از", "سازمان", "مشتری", "شرکت"],
//   creator: ["از", "ایجاد کننده", "ایجادکننده", "فرستنده", "ثبت کننده"],
//   center: ["به", "مرکز", "واحد", "دپارتمان"],
//   assignee: ["به", "مسئول", "ارجاع به", "کارشناس"],
//   status: ["وضعیت", "status"],
//   createdAt: ["ایجاد", "تاریخ ایجاد", "تاریخ ثبت", "زمان ثبت"],
//   updatedAt: [
//     "به روز رسانی",
//     "به‌روزرسانی",
//     "بروز رسانی",
//     "بروزرسانی",
//     "آخرین بروزرسانی",
//     "آخرین به روز رسانی",
//   ],
// };

// const requiredFields: readonly TicketField[] = ["id", "title"];

export class TicketListPage {
  constructor(
    private readonly page: Page,
    private readonly baseUrl: string,
  ) {}

  private get cleanBaseUrl(): string {
    return this.baseUrl.replace(/\/+$/, "");
  }

  private readonly configuredCenters = centers.map(
    ({ name }) => normalizeText(name),
  );

  async open(): Promise<void> {
    if (this.isSigninUrl(this.page.url())) {
      throw new Error(
        `سشن Helpical معتبر نیست و مرورگر در صفحه ورود قرار دارد. URL فعلی: ${this.page.url()}`,
      );
    }

    // 1. جستجوی دقیق لینک تیکت‌ها در نوبار یا در دکمه‌های داشبورد
    const ticketNavSelector = [
      '#main-navbar a[href*="tickets"]',
      '#main-navbar a:has-text("تیکت ها")',
      '#main-navbar a:has-text("تیکت")',
      '#dashboard a[href*="tickets"]',
      'a[href="tickets/"]',
    ].join(", ");

    const ticketNav = this.page.locator(ticketNavSelector).first();

    if (await ticketNav.isVisible({ timeout: 4000 }).catch(() => false)) {
      await Promise.all([
        // this.page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {}),
        ticketNav.click(),
      ]);
    } else {
      // 2. اگر دکمه در دسترس نبود (یا منو باز نبود)، ناوبری مستقیم از طریق URL پایه
      const cleanBase = this.baseUrl.replace(/\/+$/, "");
      const ticketsUrl = cleanBase.endsWith("/dashboard")
        ? `${cleanBase}/tickets/`
        : `${cleanBase}/dashboard/tickets/`;

      await this.page.goto(ticketsUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
    }

    // انتظار برای لود شدن جدول تیکت‌ها در صفحه مقصد
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
  }

  private async findTicketTable(): Promise<Locator> {
    // ۱. منتظر حضور جدول در صفحه بمان
    await this.page.waitForSelector('table', { state: 'attached', timeout: 15000 });

    const tables = this.page.locator('table');
    const tableCount = await tables.count();

    // اگر فقط یک جدول در صفحه است، همان جدول تیکت‌هاست
    if (tableCount === 1) {
      return tables.first();
    }

    // اگر چند جدول هست، جدولی که در هدر آن کلماتی مثل "عنوان"، "شناسه"، "وضعیت" یا "#" دارد را بردار
    for (let i = 0; i < tableCount; i++) {
      const candidate = tables.nth(i);
      const headerText = (await candidate.locator('thead, tr:first-child').innerText().catch(() => '')) || '';
      if (
        headerText.includes('عنوان') ||
        headerText.includes('وضعیت') ||
        headerText.includes('شناسه') ||
        headerText.includes('#')
      ) {
        return candidate;
      }
    }

    return tables.first();
  }

  private async extractFromCell(cell: Locator): Promise<{
    organization: string;
    creator: string;
    center: string;
  }> {
    const fullText = normalizeText(await cell.innerText());

    const small = cell.locator("small").first();

    if ((await small.count()) === 0) {
      return {
        organization: fullText,
        creator: "",
        center: "",
      };
    }

    const smallText = normalizeText(await small.innerText());

    const organization = normalizeText(
      fullText.replace(smallText, ""),
    );

    const inner = normalizeText(
      smallText.replace(/^[(（]\s*|\s*[)）]$/g, "")
    );

    const center = this.configuredCenters
      .sort((a, b) => b.length - a.length)
      .find((name) => inner.includes(name)) ?? "";

    if (!center) {
      return {
        organization,
        creator: inner,
        center: "",
      };
    }

    const creator = normalizeText(
      inner.replace(center, ""),
    );

    return {
      organization,
      creator,
      center,
    };
  }

  async listTickets(): Promise<Ticket[]> {
    if (this.isSigninUrl(this.page.url())) {
      throw new Error(
        `امکان خواندن تیکت‌ها وجود ندارد؛ مرورگر در صفحه ورود است. URL فعلی: ${this.page.url()}`,
      );
    }

    const table = await this.findTicketTable();
    if (!table) {
      throw new Error("جدول تیکت‌ها در صفحه پیدا نشد");
    }

    const rows = table.locator("tbody tr");
    // انتظار برای بارگذاری ردیف‌ها؛ در صورت عدم موفقیت، catch آن را رها می‌کند.
    await rows.first().waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});
    const rowCount = await rows.count();

    const headers = await table
      .locator("thead th")
      .allInnerTexts();

    const columns = this.mapColumns(headers);

    let skippedLowCells = 0;
    let skippedNoIdentity = 0;

    const tickets: Ticket[] = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const currentRow = rows.nth(rowIndex);
      const cells = currentRow.locator("td");
      const cellCount = await cells.count();

      if (cellCount < 4) {
        skippedLowCells++;
        console.log("[DEBUG] row", rowIndex, "SKIPPED cellCount<4 | cells:", cellCount);
        continue;
      }

      const cellTexts = await cells.allInnerTexts();

      const getCellText = (field: TicketField): string => {
        const columnIndex = columns.get(field);
        if (
          columnIndex === undefined ||
          columnIndex < 0 ||
          columnIndex >= cellTexts.length
        ) {
          return "";
        }
        return normalizeText(cellTexts[columnIndex]);
      };

      // ۱. استخراج شناسه تیکت (از ستون # یا لینک)
      let ticketId = normalizeDigits(getCellText("id")).replace(/\D/g, "");

      // ۲. استخراج لینک تیکت
      const linkLocator = currentRow.locator('a[href*="ticket"]').first();
      let href = "";
      if ((await linkLocator.count()) > 0) {
        href = (await linkLocator.getAttribute("href")) ?? "";
        if (!ticketId) {
          const match = normalizeDigits(href).match(/(\d+)/);
          if (match?.[1]) {
            ticketId = match[1];
          }
        }
      }

      // ۳. عنوان تیکت (برداشتن بخش نهایی بعد از اسلش در صورت وجود)
      const rawTitle = getCellText("title");
      let title = rawTitle;
      if (rawTitle.includes("/")) {
        const titleParts = rawTitle
          .split("/")
          .map((part) => normalizeText(part))
          .filter(Boolean);
        const lastPart = titleParts.at(-1);
        if (lastPart) {
          title = lastPart;
        }
      }

      const organizationIndex = columns.get("organization");
      const centerIndex = columns.get("center");

      if (organizationIndex === undefined || centerIndex === undefined) {
        continue;
      }

      const fromCell = cells.nth(organizationIndex);
      const toCell = cells.nth(centerIndex);

      const fromParts = await this.extractFromCell(fromCell);

      const toSmall = toCell.locator("small").first();
      let assignee = "";

      if ((await toSmall.count()) > 0) {
        const rawAssignee = normalizeText(await toSmall.innerText());
        assignee = normalizeText(
          rawAssignee.replace(/^[(（]\s*|[)）]\s*$/g, ""),
        );
      }

      const status = getCellText("status");
      const priority = getCellText("priority");
      const createdAt = getCellText("createdAt");
      const rawUpdatedAt = getCellText("updatedAt");
      const updatedAt = rawUpdatedAt === "-" ? "" : rawUpdatedAt;

      // بررسی هویت تیکت و ثبت در شمارنده برای رفع ارور prefer-const
      if (!ticketId && !title) {
        skippedNoIdentity++;
        continue;
      }

      const ticketUrl = href
        ? resolveUrl(href, this.page.url())
        : this.page.url();

      // تعیین دقیق منبع ID
      const idSource = ticketId ? "ticket-link" : "row-index-fallback";

      tickets.push({
        id: ticketId || `ROW-${rowIndex + 1}`,
        title: title || "بدون عنوان",
        priority,
        organization: fromParts.organization,
        creator: fromParts.creator,
        center: fromParts.center,
        assignee,
        status,
        createdAt,
        updatedAt,
        url: ticketUrl,
        lastMessage: null,
        idSource,
      });
    }

    if (skippedLowCells > 0 || skippedNoIdentity > 0) {
      console.log(
        `[TicketListPage] Skipped rows summary -> Low cells: ${skippedLowCells}, No identity: ${skippedNoIdentity}`
      );
    }

    return tickets;
  }


  mapColumns(
    headers: string[],
  ): Map<TicketField, number> {
    const mapping = new Map<TicketField, number>();

    headers.forEach((header, index) => {
      const clean = normalizeText(header);

      if (!clean) {
        return;
      }

      if (clean === "#") {
        mapping.set("id", index);
      } else if (
        clean === "دسته بندی/عنوان" ||
        clean === "دسته‌بندی/عنوان" ||
        clean.includes("عنوان") ||
        clean.includes("دسته")
      ) {
        mapping.set("title", index);
      } else if (
        clean === "اهمیت" ||
        clean === "اولویت"
      ) {
        mapping.set("priority", index);
      } else if (
        clean === "از" ||
        clean === "سازمان" ||
        clean === "مشتری" ||
        clean === "شرکت"
      ) {
        mapping.set("organization", index);
      } else if (
        clean === "ایجاد کننده" ||
        clean === "ایجادکننده" ||
        clean === "فرستنده" ||
        clean === "ثبت کننده"
      ) {
        mapping.set("creator", index);
      } else if (
        clean === "به" ||
        clean === "مرکز" ||
        clean === "واحد" ||
        clean === "دپارتمان"
      ) {
        mapping.set("center", index);
      } else if (
        clean === "مسئول" ||
        clean === "ارجاع به" ||
        clean === "کارشناس"
      ) {
        mapping.set("assignee", index);
      } else if (
        clean.includes("وضعیت")
      ) {
        mapping.set("status", index);
      } else if (
        clean.includes("ایجاد")
      ) {
        mapping.set("createdAt", index);
      } else if (
        clean.includes("به روز رسانی") ||
        clean.includes("به‌روزرسانی") ||
        clean.includes("بروز رسانی") ||
        clean.includes("بروزرسانی") ||
        clean.includes("آخرین بروزرسانی")
      ) {
        mapping.set("updatedAt", index);
      }
    });

    return mapping;
  }


  private splitCombinedCell(value: string): {
    outer: string;
    inner: string;
  } {
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) {
      return {
        outer: "",
        inner: "",
      };
    }

    const match = normalizedValue.match(/^(.+?)\s*[(（]\s*(.+?)\s*[)）]\s*$/);

    if (!match) {
      return {
        outer: normalizedValue,
        inner: "",
      };
    }

    return {
      outer: normalizeText(match[1]),
      inner: normalizeText(match[2]),
    };
  }

  private isSigninUrl(value: string): boolean {
    try {
      return new URL(value).pathname.includes("/signin");
    } catch {
      return value.includes("/signin");
    }
  }

  private ensureTrailingSlash(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
  }
}
