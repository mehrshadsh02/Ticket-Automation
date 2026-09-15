import { ExcelTicketServiceImpl } from "./ExcelTicketService.js";
import type { ExcelTicketService } from "./ExcelTicketService.js";

export function createExcelTicketService(
  filePath: string,
): ExcelTicketService {
  return new ExcelTicketServiceImpl(
    filePath,
  );
}