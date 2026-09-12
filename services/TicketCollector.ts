import type { CenterConfig } from "../models/CenterConfig.js";
import type { Ticket } from "../models/Ticket.js";
import type { TicketDetails } from "../pages/TicketPage.js";
import {
  priorityCodeFor,
  statusCodeFor,
} from "../utils/ticketMappings.js";

function normalizeCenterName(value: string): string {
  return value
    .replace(/\u200c/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface TicketListSource {
  listTickets(): Promise<Ticket[]>;
}

export interface TicketDetailSource {
  open(url: string): Promise<void>;
  readDetails(): Promise<TicketDetails>;
}

export class TicketCollector {
  private readonly enabledCenterNames: ReadonlySet<string>;

  constructor(
    private readonly listSource: TicketListSource,
    private readonly detailSource: TicketDetailSource,
    private readonly centers: readonly CenterConfig[],
  ) {
    this.enabledCenterNames = new Set(
      centers
        .filter((center) => center.enabled)
        .map((center) =>
          normalizeCenterName(center.name),
        ),
    );
  }

  private isCenterEnabled(center: string): boolean {
    const normalized = normalizeCenterName(center);

    if (!normalized) {
      return false;
    }

    for (const enabledName of this.enabledCenterNames) {
      if (
        normalized === enabledName ||
        normalized.includes(enabledName) ||
        enabledName.includes(normalized)
      ) {
        return true;
      }
    }

    return false;
  }

  async collect(): Promise<Ticket[]> {
    const listedTickets =
      await this.listSource.listTickets();

    const selected = listedTickets.filter((ticket) =>
      this.isCenterEnabled(ticket.center),
    );

    const collected: Ticket[] = [];

    for (const ticket of selected) {
      const configured = this.centers.find(
        (center) =>
          normalizeCenterName(center.name) ===
          normalizeCenterName(ticket.center),
      );

      if (!configured) {
        throw new Error(
          `Center is not configured: ${ticket.center}`,
        );
      }

      await this.detailSource.open(ticket.url);

      const details =
        await this.detailSource.readDetails();

      const status =
        details.status || ticket.status;

      collected.push({
        ...ticket,
        centerId: configured.id,
        title: details.title || ticket.title,
        status,
        priorityCode:
          ticket.priorityCode ??
          priorityCodeFor(ticket.priority),
        statusCode: statusCodeFor(status),
        messages: details.messages,
        lastMessage: details.latestMessage,
      });
    }

    return collected;
  }
}