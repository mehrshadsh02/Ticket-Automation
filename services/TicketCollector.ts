import type { CenterConfig } from "../models/CenterConfig.js";
import type { Ticket } from "../models/Ticket.js";
import type { TicketDetails } from "../pages/TicketPage.js";
import {
  priorityCodeFor,
  statusCodeFor,
  statusKeyFor,
} from "../utils/ticketMappings.js";



function normalizeCenterName(value: string): string {
  return value
    .replace(/\u200c/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
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
  constructor(
    private readonly listSource: TicketListSource,
    private readonly detailSource: TicketDetailSource,
    private readonly centers: readonly CenterConfig[],
  ) {}

  private centerForTicket(
    ticket: Ticket,
  ): CenterConfig | null {
    const center = normalizeCenterName(ticket.center);

    if (!center) {
      return null;
    }

    return (
      this.centers
        .filter((item) => item.enabled)
        .find((item) => {
          const configured = normalizeCenterName(
            item.name,
          );

          return (
            center === configured ||
            center.includes(configured) ||
            configured.includes(center)
          );
        }) ?? null
    );
  }

  async collect(): Promise<Ticket[]> {
    const listedTickets =
      await this.listSource.listTickets();

    const collected: Ticket[] = [];

    for (const ticket of listedTickets) {
      const center = this.centerForTicket(ticket);

      if (!center) {
        continue;
      }

      await this.detailSource.open(ticket.url);

      const details =
        await this.detailSource.readDetails();

      const status =
        details.status || ticket.status;

      collected.push({
        ...ticket,
        centerId: center.id,
        title: details.title || ticket.title,
        status,
        priorityCode:
          ticket.priorityCode ??
          priorityCodeFor(ticket.priority),
        statusCode: statusCodeFor(status),
        statusKey: statusKeyFor(status),
        messages: details.messages,
        lastMessage: details.latestMessage,
      });
    }

    return collected;
  }
}