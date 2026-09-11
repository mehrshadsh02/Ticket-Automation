import type { CenterConfig } from "../models/CenterConfig.js";
import type { Ticket } from "../models/Ticket.js";
import type { TicketDetails } from "../pages/TicketPage.js";
import { priorityCodeFor, statusCodeFor } from "../utils/ticketMappings.js";

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
  private readonly centerConfigs: readonly CenterConfig[];

  constructor(
    private readonly listSource: TicketListSource,
    private readonly detailSource: TicketDetailSource,
    centers: readonly CenterConfig[],
  ) {
    this.centerConfigs = centers;
    this.enabledCenterNames = new Set(
      centers
        .filter(({ enabled }) => enabled)
        .map(({ name }) => normalizeCenterName(name)),
    );
  }

  private isCenterEnabled(center: string): boolean {
    if (this.enabledCenterNames.size === 0) return false;

    const normalized = normalizeCenterName(center);

    // مرکز خالی نباید انتخاب شود
    if (!normalized) return false;

    if (this.enabledCenterNames.has(normalized)) return true;

    for (const enabledName of this.enabledCenterNames) {
      if (
        normalized.includes(enabledName) ||
        enabledName.includes(normalized)
      ) {
        return true;
      }
    }

    return false;
  }

  // private normalizeCenterName(name: string): string {
  //   // پیاده‌سازی نرمال‌سازی اینجا قرار می‌گیرد
  //   // مثال:
  //   return name
  //     .trim()
  //     .replace(/ي/g, 'ی')
  //     .replace(/ك/g, 'ک')
  //     .replace(/[\sـ]/g, ' ') // حذف نیم‌فاصله و جایگزینی با فاصله
  //     .replace(/\s+/g, ' '); // حذف فواصل اضافه
  // }

  async collect(): Promise<Ticket[]> {
    const listedTickets = await this.listSource.listTickets();
    const selected = listedTickets.filter((ticket) =>
      this.isCenterEnabled(ticket.center),
    );
    const centerValues = [
      ...new Set(
        listedTickets
          .map((ticket) => ticket.center)
          .filter(Boolean),
      ),
    ];

    console.log(
      `[DEBUG][Collector] distinct centers on page (${centerValues.length}):`,
      JSON.stringify(centerValues, null, 2),
    );
    console.log(
      `[DEBUG][Collector] enabled centers from config:`,
      JSON.stringify([...this.enabledCenterNames]),
    );

    console.log(
      `[DEBUG][Collector] listed: ${listedTickets.length} | selected after center filter: ${selected.length}`,
    );

    console.log("[DEBUG][Collector] selected tickets:");

    console.table(
      selected.map((ticket) => ({
        id: ticket.id,
        center: ticket.center,
        organization: ticket.organization,
        title: ticket.title,
        status: ticket.status,
        url: ticket.url,
      })),
    );

    const selectedByCenter = new Map<string, number>();

    for (const ticket of selected) {
      const center = ticket.center || "(بدون مرکز)";
      selectedByCenter.set(
        center,
        (selectedByCenter.get(center) ?? 0) + 1,
      );
    }

    console.log("[DEBUG][Collector] selected tickets by center:");

    for (const [center, count] of selectedByCenter) {
      console.log(`  ${center}: ${count}`);
    }

    console.log(
      `[DEBUG][Collector] TOTAL SELECTED: ${selected.length}`,
    );

    const collected: Ticket[] = [];

    for (const ticket of selected) {
      await this.detailSource.open(ticket.url);
      const details = await this.detailSource.readDetails();
      const configured = this.centerConfigs.find((center) =>
        normalizeCenterName(center.name) === normalizeCenterName(ticket.center) ||
        (!!center.adminName && normalizeCenterName(ticket.creator).includes(normalizeCenterName(center.adminName))),
      );
      if (!configured) throw new Error(`Center is not configured: ${ticket.center}`);
      const status = details.status || ticket.status;
      collected.push({
        ...ticket,
        title: details.title || ticket.title,
        status,
        centerId: configured.id,
        priorityCode: ticket.priorityCode ?? priorityCodeFor(ticket.priority),
        statusCode: statusCodeFor(status),
        messages: details.messages,
        lastMessage: details.latestMessage,
      });
    }
    return collected;
    
  }
}
