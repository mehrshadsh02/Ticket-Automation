export interface TicketMessage {
  readonly author: string;
  readonly date: string;
  readonly text: string;
  readonly status: string | null;
  readonly senderType?: "S" | "C";
}
