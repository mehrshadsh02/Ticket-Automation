import type { AppConfig } from "../config/env.js";
import { createExcelTicketService } from "./createExcelTicketService.js";
import { TicketSyncService } from "./TicketSyncService.js";
import type { TicketProcessor } from "./TicketProcessor.js";

export function createTicketSyncService(
  config: AppConfig,
  ticketProcessor: TicketProcessor,
): TicketSyncService {
  const excelService =
    createExcelTicketService(
      config.EXCEL_FILE_PATH,
    );

  return new TicketSyncService(
    ticketProcessor,
    excelService,
  );
}