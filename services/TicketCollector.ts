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

export class TicketCollector {
  private readonly enabledCenterNames: ReadonlySet<string>;

  constructor(
    private readonly listSource: TicketListSource,
    private readonly detailSource: TicketDetailSource,
    centers: readonly CenterConfig[],
  ) {
    this.enabledCenterNames = new Set(
      centers.filter(({ enabled }) => enabled).map(({ name }) => name),
    );
  }

  async collect(): Promise<Ticket[]> {
    const listedTickets = await this.listSource.listTickets();
    const selected = listedTickets.filter(({ center }) =>
      this.enabledCenterNames.has(center),
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
