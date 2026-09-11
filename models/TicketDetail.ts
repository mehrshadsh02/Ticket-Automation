import type { StatusCode } from "./Ticket.js";

export type SenderType = "S" | "C";

export interface TicketDetail {
  readonly id: number;
  readonly ticketId: number;
  readonly centerId: string;
  readonly updatedAt: string;
  readonly senderName: string;
  readonly creatorName: string;
  readonly messageText: string;
  readonly senderType: SenderType;
  readonly statusCode: StatusCode;
  readonly messageHash: string;
}

export type NewTicketDetail = Omit<TicketDetail, "id">;
