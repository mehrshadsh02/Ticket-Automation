import type { CenterConfig } from "../models/CenterConfig.js";
import type { Ticket } from "../models/Ticket.js";
import type { TicketDetails } from "../pages/TicketPage.js";

export interface TicketListSource {
  listTickets(): Promise<Ticket[]>;
}

export interface TicketDetailSource {
  open(url: string): Promise<void>;
  readDetails(): Promise<TicketDetails>;
}

/** حذف فواصل اضافه، نیم‌فاصله‌ها و ارقام فارسی برای مقایسه پایدار نام مراکز */
function normalizeCenterName(value: string): string {
  return value
    .replace(/\u200c/g, " ") // نیم‌فاصله → فاصله
    .replace(/\s+/g, " ")    // فاصله‌های تکراری → یکی
    .trim();
}

export class TicketCollector {
  private readonly enabledCenterNames: ReadonlySet<string>;

  constructor(
    private readonly listSource: TicketListSource,
    private readonly detailSource: TicketDetailSource,
    centers: readonly CenterConfig[],
  ) {
    this.enabledCenterNames = new Set(
      centers
        .filter(({ enabled }) => enabled)
        .map(({ name }) => normalizeCenterName(name)),
    );
  }

  private isCenterEnabled(center: string): boolean {
    if (this.enabledCenterNames.size === 0) return false;
    const normalized = normalizeCenterName(center);
    if (this.enabledCenterNames.has(normalized)) return true;
    // تطابق زیررشته‌ای دوطرفه: «مرکز X - بیمارستان Y» را هم می‌گیرد
    for (const enabledName of this.enabledCenterNames) {
      if (normalized.includes(enabledName) || enabledName.includes(normalized)) {
        return true;
      }
    }
    return false;
  }

  private normalizeCenterName(name: string): string {
    // پیاده‌سازی نرمال‌سازی اینجا قرار می‌گیرد
    // مثال:
    return name
      .trim()
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/[\sـ]/g, ' ') // حذف نیم‌فاصله و جایگزینی با فاصله
      .replace(/\s+/g, ' '); // حذف فواصل اضافه
  }

  async collect(): Promise<Ticket[]> {
    const listedTickets = await this.listSource.listTickets();
    const selected = listedTickets.filter((ticket) => {
      const normalizedCenter = this.normalizeCenterName(ticket.center);
      const normalizedOrganization = this.normalizeCenterName(ticket.organization);
      return this.enabledCenterNames.has(normalizedCenter) || this.enabledCenterNames.has(normalizedOrganization);
    });
    const orgValues  = [...new Set(listedTickets.map((t) => t.organization))];
    console.log(
      `[DEBUG][Collector] distinct centers on page (${orgValues .length}):`,
      JSON.stringify(orgValues , null, 2),
    );
    console.log(
      `[DEBUG][Collector] enabled centers from config:`,
      JSON.stringify([...this.enabledCenterNames]),
    );

    console.log(
      `[DEBUG][Collector] listed: ${listedTickets.length} | selected after center filter: ${selected.length}`,
    );

    const collected: Ticket[] = [];

    for (const ticket of selected) {
      await this.detailSource.open(ticket.url);
      const details = await this.detailSource.readDetails();
      collected.push({
        ...ticket,
        title: details.title || ticket.title,
        status: details.status || ticket.status,
        lastMessage: details.latestMessage,
      });
    }
    return collected;
    
  }
}
