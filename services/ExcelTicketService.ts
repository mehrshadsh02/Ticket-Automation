import ExcelJS from "exceljs";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";

import type { Ticket } from "../models/Ticket.js";
import { statusKeyFor } from "../utils/ticketMappings.js";

export interface ExcelTicketService {
  upsertTicket(ticket: Ticket): Promise<void>;
  upsertMessages(ticket: Ticket): Promise<void>;
}

export class ExcelTicketServiceImpl implements ExcelTicketService {
  private readonly workbook = new ExcelJS.Workbook();
  private initialized = false;

  constructor(private readonly filePath: string) {}

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await mkdir(dirname(this.filePath), {
      recursive: true,
    });

    try {
      await this.workbook.xlsx.readFile(this.filePath);
    } catch {
      this.createSheets();
    }

    this.ensureSheets();

    this.initialized = true;
  }

  private createSheets(): void {
    this.workbook.addWorksheet("Tickets");
    this.workbook.addWorksheet("Messages");
  }

  private ensureSheets(): void {
    const tickets =
      this.workbook.getWorksheet("Tickets") ??
      this.workbook.addWorksheet("Tickets");

    const messages =
      this.workbook.getWorksheet("Messages") ??
      this.workbook.addWorksheet("Messages");

    tickets.views = [{ rightToLeft: true }];
    messages.views = [{ rightToLeft: true }];

    if (tickets.rowCount === 0) {
      tickets.addRow([
        "Ticket ID",
        "Center",
        "Title",
        "Priority",
        "Status",
        "Status Key",
        "Creator",
        "Assignee",
        "Created At",
        "Updated At",
        "Last Message",
        "Last Message Date",
        "URL",
      ]);

      const header = tickets.getRow(1);
      header.font = { bold: true };
      header.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

    //   tickets.freezePanes.freezeRows(1);
      tickets.views = [
        {
            rightToLeft: true,
            state: "frozen",
            ySplit: 1,
        },
        ];
    }

    if (messages.rowCount === 0) {
      messages.addRow([
        "Ticket ID",
        "Center",
        "Sender",
        "Creator",
        "Sender Type",
        "Message",
        "Date",
        "Status",
      ]);

      const header = messages.getRow(1);
      header.font = { bold: true };
      header.alignment = {
        horizontal: "center",
        vertical: "middle",
      };

    //   messages.freezePanes.freezeRows(1);
      messages.views = [
        {
            rightToLeft: true,
            state: "frozen",
            ySplit: 1,
        },
        ];
    }

    this.setColumnWidths(tickets, [
      14, 32, 45, 12, 28, 18, 25,
      25, 22, 22, 60, 22, 55,
    ]);

    this.setColumnWidths(messages, [
      14, 32, 28, 28, 15, 80, 22, 28,
    ]);
  }

  private setColumnWidths(
    sheet: ExcelJS.Worksheet,
    widths: readonly number[],
  ): void {
    widths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });
  }

  async upsertTicket(ticket: Ticket): Promise<void> {
    await this.initialize();

    const sheet = this.workbook.getWorksheet("Tickets");

    if (!sheet) {
      throw new Error("Excel Tickets sheet not found");
    }

    const row = this.findRow(sheet, ticket.id);

    const statusKey =
      ticket.statusKey ?? statusKeyFor(ticket.status);

    const values = [
      ticket.id,
      ticket.center,
      ticket.title,
      ticket.priority,
      ticket.status,
      statusKey,
      ticket.creator,
      ticket.assignee ?? "",
      ticket.createdAt,
      ticket.updatedAt,
      ticket.lastMessage?.text ?? "",
      ticket.lastMessage?.date ?? "",
      ticket.url,
    ];

    const targetRow = row ?? sheet.addRow(values);

    if (row) {
      targetRow.values = values;
    }

    this.applyStatusStyle(targetRow, statusKey);

    targetRow.getCell(13).value = {
      text: ticket.url,
      hyperlink: ticket.url,
    };

    await this.workbook.xlsx.writeFile(this.filePath);
  }

  async upsertMessages(ticket: Ticket): Promise<void> {
    await this.initialize();

    const sheet = this.workbook.getWorksheet("Messages");

    if (!sheet) {
      throw new Error("Excel Messages sheet not found");
    }

    this.removeTicketMessages(sheet, ticket.id);

    for (const message of ticket.messages ?? []) {
      sheet.addRow([
        ticket.id,
        ticket.center,
        message.author,
        ticket.creator,
        "",
        message.text,
        message.date,
        message.status ?? "",
      ]);
    }

    await this.workbook.xlsx.writeFile(this.filePath);
  }

  private applyStatusStyle(
    row: ExcelJS.Row,
    statusKey: string,
  ): void {
    let color = "FFFFFF";

    switch (statusKey) {
      case "open":
        color = "C6EFCE";
        break;

      case "in_review":
        color = "FFF2CC";
        break;

      case "creator_reply":
        color = "BDD7EE";
        break;

      case "answered":
      case "closed":
        color = "F4CCCC";
        break;
    }

    for (let index = 1; index <= 13; index++) {
      row.getCell(index).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: {
          argb: `FF${color}`,
        },
      };
    }
  }

  private findRow(
    sheet: ExcelJS.Worksheet,
    ticketId: string,
  ): ExcelJS.Row | null {
    for (let index = 2; index <= sheet.rowCount; index++) {
      const row = sheet.getRow(index);

      if (row.getCell(1).text === ticketId) {
        return row;
      }
    }

    return null;
  }

  private removeTicketMessages(
    sheet: ExcelJS.Worksheet,
    ticketId: string,
  ): void {
    for (let index = sheet.rowCount; index >= 2; index--) {
      const row = sheet.getRow(index);

      if (row.getCell(1).text === ticketId) {
        sheet.spliceRows(index, 1);
      }
    }
  }
}