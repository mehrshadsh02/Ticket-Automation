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

type TicketField = Exclude<keyof Ticket, "lastMessage" | "url">;

const headerAliases: Readonly<Record<TicketField, readonly string[]>> = {
  id: ['#', 'id', 'شناسه', 'کد', 'شماره'],
  title: [
    "دسته بندی/عنوان",
    "دسته‌بندی/عنوان",
    "دسته بندی",
    "دسته‌بندی",
    "عنوان",
    "موضوع",
    "عنوان تیکت",
    "title",
  ],
  priority: ["اهمیت", "اولویت", "priority"],
  organization: ["از", "سازمان", "مشتری", "شرکت"],
  creator: ["از", "ایجاد کننده", "ایجادکننده", "فرستنده", "ثبت کننده"],
  center: ["به", "مرکز", "واحد", "دپارتمان"],
  assignee: ["به", "مسئول", "ارجاع به", "کارشناس"],
  status: ["وضعیت", "status"],
  createdAt: ["ایجاد", "تاریخ ایجاد", "تاریخ ثبت", "زمان ثبت"],
  updatedAt: [
    "به روز رسانی",
    "به‌روزرسانی",
    "بروز رسانی",
    "بروزرسانی",
    "آخرین بروزرسانی",
    "آخرین به روز رسانی",
  ],
};

const requiredFields: readonly TicketField[] = ["id", "title"];

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
      smallText.replace(/^[\(（]\s*|\s*[)）]$/g, ""),
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
      throw new Error('جدول تیکت‌ها در صفحه پیدا نشد');
    }

    const rows = table.locator('tbody tr');
    // انتظار برای بارگذاری ردیف‌ها؛ در صورت عدم موفقیت، catch آن را رها می‌کند.
    await rows.first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
    const rowCount = await rows.count();

    const headers = await table
      .locator('thead th')
      .allInnerTexts();

    const columns = this.mapColumns(headers);

    // === گزارش‌های دیباگ (می‌توانید این بخش را حذف کنید) ===
    // console.log('[DEBUG] URL:', this.page.url());
    // console.log('[DEBUG] total <table> on page:', await this.page.locator('table').count());
    // console.log('[DEBUG] chosen table -> class:', await table.getAttribute('class'), '| id:', await table.getAttribute('id'));
    // console.log('[DEBUG] raw thead headers:', JSON.stringify(headers));
    // console.log('[DEBUG] column mapping:', JSON.stringify([...columns.entries()]));
    // console.log('[DEBUG] tbody rowCount after waitFor:', rowCount);
    // if (rowCount > 0) {
    //   const firstRowCells = await rows.first().locator('td').count();
    //   console.log('[DEBUG] first row <td> count:', firstRowCells);
    //   console.log('[DEBUG] first row text:', JSON.stringify(await rows.first().innerText()));
    // }
    // =======================================================

    let skippedLowCells = 0;
    let skippedNoIdentity = 0;

    const tickets: Ticket[] = [];

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      // اصلاح ۱: رفع اشکال تایپی و اعلان درست currentRow
      const currentRow = rows.nth(rowIndex);
      
      // اصلاح ۲: اعلان صحیح و یکباره متغیر cells
      const cells = currentRow.locator('td');
      const cellCount = await cells.count();

      if (cellCount < 4) {
        skippedLowCells++;
        // اصلاح ۳: حذف استفاده از cellTexts که در این بلوک تعریف نشده است.
        console.log('[DEBUG] row', rowIndex, 'SKIPPED cellCount<4 | cells:', cellCount);
        continue;
      }

      // اصلاح ۴: اعلان cellTexts *بعد* از بررسی cellCount و *قبل* از استفاده
      const cellTexts = await cells.allInnerTexts();

      // تابع کمکی برای استخراج متن سلول بر اساس نام ستون
      const getCellText = (field: TicketField): string => {
        const columnIndex = columns.get(field);
        if (
          columnIndex === undefined ||
          columnIndex < 0 ||
          columnIndex >= cellTexts.length
        ) {
          return '';
        }
        return normalizeText(cellTexts[columnIndex]);
      };
      
      // ۱. استخراج شناسه تیکت (از ستون # یا لینک)
      let ticketId = normalizeDigits(getCellText('id')).replace(/\D/g, '');

      // ۲. استخراج لینک تیکت
      const linkLocator = currentRow.locator('a[href*="ticket"]').first(); // استفاده از currentRow
      let href = '';
      if ((await linkLocator.count()) > 0) {
        href = (await linkLocator.getAttribute('href')) ?? '';
        if (!ticketId) { // اگر شناسه از ستون id نیامد، از لینک استخراج کن
          const match = normalizeDigits(href).match(/(\d+)/);
          if (match?.[1]) {
            ticketId = match[1];
          }
        }
      }

      // ۳. عنوان تیکت (تنظیمات مربوط به "/" و برداشتن آخرین بخش)
      const rawTitle = getCellText('title');
      let title = rawTitle;
      if (rawTitle.includes('/')) {
        const titleParts = rawTitle
          .split('/')
          .map((part) => normalizeText(part))
          .filter(Boolean);
        const lastPart = titleParts.at(-1);
        if (lastPart) {
          title = lastPart;
        }
      }

      const organizationIndex = columns.get("organization");
      const centerIndex = columns.get("center");

      if (
        organizationIndex === undefined ||
        centerIndex === undefined
      ) {
        console.log(
          "[DEBUG] organization/center column not found",
        );
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
          rawAssignee.replace(/^[\(（]\s*|\s*[)）]$/g, ""),
        );
      }

      // استخراج سایر فیلدها
      const status = getCellText('status');
      const priority = getCellText('priority');
      const createdAt = getCellText('createdAt');
      const rawUpdatedAt = getCellText('updatedAt');
      const updatedAt = rawUpdatedAt === '-' ? '' : rawUpdatedAt; // تبدیل '-' به خالی

      // شرط رد کردن ردیف: اگر نه شناسه و نه عنوان معتبر داشته باشد
      if (!ticketId && !title) {
          skippedNoIdentity++;
          console.log('[DEBUG] row', rowIndex, 'SKIPPED no-id&no-title | cells:', JSON.stringify(cellTexts));
          continue;
      }

      // ساخت URL نهایی تیکت
      const ticketUrl = new URL(
        `/ticket/${ticketId}/`,
        this.page.url(),
      ).toString();

      // اضافه کردن تیکت استخراج شده به لیست
      tickets.push({
        id: ticketId || `ROW-${rowIndex + 1}`, // استفاده از ID استخراج شده یا شماره ردیف به عنوان fallback
        title: title || 'بدون عنوان',          // استفاده از عنوان استخراج شده یا "بدون عنوان"
        priority,
        organization: fromParts.organization,
        creator: fromParts.creator,
        center: fromParts.center,
        assignee,
        status,
        createdAt,
        updatedAt,
        url: ticketUrl,
        lastMessage: null, // مقداردهی اولیه برای lastMessage
      });
    }

    // گزارش نهایی تعداد ردیف‌های skip شده و تعداد تیکت‌های نهایی
    console.log('[DEBUG] skipped (cellCount<4):', skippedLowCells, '| skipped (no id/title):', skippedNoIdentity);
    console.log('[DEBUG] final tickets.length:', tickets.length);
    console.log('[DEBUG] <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<');

    return tickets;
  }


  // private mapColumns(
  //   headers: string[],
  //   strict = false,
  // ): Map<TicketField, number> {
  //   const result = new Map<TicketField, number>();

  //   headers.forEach((header, index) => {
  //     const rawTrimmed = (header ?? "").trim();
  //     const normalizedHeader = canonicalHeader(rawTrimmed);

  //     // ۱. تطبیق مستقیم هدرهای خاص مانند '#' یا 'id' قبل از حذف سمبل‌ها
  //     if (rawTrimmed === '#' || rawTrimmed.toLowerCase() === 'id') {
  //       result.set('id' , index);
  //       return;
  //     }

  //     /*
  //      * بسیار مهم:
  //      * ستون noExl هدر خالی دارد. مقدار خالی نباید با aliasها مقایسه شود.
  //      */
  //     if (!normalizedHeader) {
  //       return;
  //     }

  //     // ۲. تطبیق بر اساس Aliasها
  //     for (const [field, aliases] of Object.entries(headerAliases) as [
  //       TicketField,
  //       readonly string[],
  //     ][]) {
  //       const matched = aliases.some((alias) => {
  //         const rawAlias = alias.trim();
  //         const normalizedAlias = canonicalHeader(rawAlias);

  //         // بررسی هم به صورت متن خام، هم متن نرمال‌شده
  //         if (rawTrimmed === rawAlias || rawTrimmed.toLowerCase() === rawAlias.toLowerCase()) {
  //           return true;
  //         }

  //         if (!normalizedAlias) {
  //           return false;
  //         }

  //         return (
  //           normalizedHeader === normalizedAlias ||
  //           normalizedHeader.includes(normalizedAlias) ||
  //           normalizedAlias.includes(normalizedHeader)
  //         );
  //       });

  //       if (matched && !result.has(field)) {
  //         result.set(field, index);
  //       }
  //     }
  //   });

  //   if (strict) {
  //     const missingFields = requiredFields.filter(
  //       (field) => !result.has(field),
  //     );

  //     if (missingFields.length > 0) {
  //       throw new Error(
  //         `ستون‌های ضروری جدول پیدا نشدند: ${missingFields.join(", ")}. ` +
  //           `هدرهای موجود: ${headers
  //             .map((header) => (header ?? "").trim())
  //             .filter(Boolean)
  //             .join(" | ")}`,
  //       );
  //     }
  //   }

  //   return result;
  // }

  mapColumns(headers: string[]): Map<TicketField, number> {
  const mapping = new Map<TicketField, number>();

  headers.forEach((header, index) => {
    // 1. نرمال‌سازی دقیق متن هدر
    const clean = header.trim();
    
    // 2. اولویت اول: ستون‌های حساس و طولانی‌تر (ابتدا باید چک شوند)
    if (clean === 'به روز رسانی' || clean === 'به‌روزرسانی' || clean === 'بروز رسانی' || clean === 'بروزرسانی') {
      mapping.set('updatedAt', index);
    } 
    // 3. تطبیق دقیق ستون‌های "از" و "به"
    else if (clean === 'از') {
      mapping.set('organization', index);
    } 
    else if (clean === 'به') {
      mapping.set('center', index);
    }
    // 4. سایر ستون‌ها
    else if (clean === '#') {
      mapping.set('id', index);
    } 
    else if (clean.includes('عنوان') || clean.includes('دسته')) {
      mapping.set('title', index);
    } 
    else if (clean.includes('وضعیت')) {
      mapping.set('status', index);
    } 
    else if (clean.includes('ایجاد')) {
      mapping.set('createdAt', index);
    }
    else if (clean.includes('اهمیت') || clean.includes('اولویت')) {
      mapping.set('priority', index);
    }
  });

  // لاگ برای اطمینان از صحت نگاشت
  console.log('[DEBUG] column mapping result:', Object.fromEntries(mapping));
  
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
