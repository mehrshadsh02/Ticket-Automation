import type { TicketMessage } from "./TicketMessage.js";

export interface Ticket {
  readonly id: string;
  readonly title: string;
  readonly priority: string;
  readonly organization: string;
  readonly center: string;
  readonly creator: string;
  readonly assignee: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly url: string;
  readonly lastMessage: TicketMessage | null;
}
