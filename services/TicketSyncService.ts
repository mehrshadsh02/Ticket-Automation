import type { Ticket } from "../models/Ticket.js";
import type {
  TicketProcessor,
  ProcessingResult,
} from "./TicketProcessor.js";
import type { ExcelTicketService } from "./ExcelTicketService.js";

export class TicketSyncService {
  constructor(
    private readonly ticketProcessor: TicketProcessor,
    private readonly excelService: ExcelTicketService,
  ) {}

  async process(ticket: Ticket): Promise<ProcessingResult> {
    // Excel مستقل از موفق یا ناموفق بودن To Do ثبت می‌شود.
    try {
      await this.excelService.upsertTicket(ticket);
      await this.excelService.upsertMessages(ticket);
    } catch (error) {
      console.error(
        `[Excel] Failed to sync ticket ${ticket.id}:`,
        error,
      );
    }

    // خطای To Do نباید مانع ثبت Excel شود.
    return this.ticketProcessor.process(ticket);
  }
}