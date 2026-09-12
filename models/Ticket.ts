import type { TicketMessage } from "./TicketMessage.js";

export type PriorityCode = "C" | "H" | "L" | "N";
export type StatusCode = 0 | 1 | 2 | 3;

export interface Ticket {
  readonly id: string;
  readonly centerId?: string;
  readonly title: string;
  readonly priority: string;
  readonly priorityCode?: PriorityCode;
  readonly organization: string;
  readonly center: string;
  readonly creator: string;
  readonly assignee: string | null;
  readonly status: string;
  readonly statusCode?: StatusCode;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly url: string;
  readonly messages?: readonly TicketMessage[];
  readonly lastMessage?: TicketMessage | null;
}