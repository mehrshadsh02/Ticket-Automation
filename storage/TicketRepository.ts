import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { centers } from "../config/centers.js";
import type { CenterConfig } from "../models/CenterConfig.js";
import type {
  NewTicketDetail,
  SenderType,
  TicketDetail,
} from "../models/TicketDetail.js";
import type {
  PriorityCode,
  StatusCode,
  Ticket,
} from "../models/Ticket.js";
import { priorityCodeFor, statusCodeFor } from "../utils/ticketMappings.js";
import { normalizeText } from "../utils/text.js";

export interface PersistedTicket {
  readonly id: number;
  readonly ticketId: string;
  readonly centerId: string;
  readonly title: string;
  readonly priorityCode: PriorityCode;
  readonly statusCode: StatusCode;
  readonly creator: string;
  readonly assignee: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly url: string;
  readonly todoTaskId: string | null;
  readonly todoListId: string | null;
  readonly lastSyncedAt: string | null;
}

interface TicketRow {
  id: number;
  ticket_id: string;
  center_id: string;
  title: string;
  priority_code: PriorityCode;
  status_code: StatusCode;
  creator: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  url: string;
  todo_task_id: string | null;
  todo_list_id: string | null;
  last_synced_at: string | null;
}

interface DetailRow {
  id: number;
  ticket_id: number;
  center_id: string;
  updated_at: string;
  sender_name: string;
  creator_name: string;
  message_text: string;
  sender_type: SenderType;
  status_code: StatusCode;
  message_hash: string;
}

interface LegacyTicketRow {
  ticket_id: string;
  center: string;
  title: string;
  priority: string;
  status: string;
  creator: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  url: string;
  last_message_author: string | null;
  last_message_date: string | null;
  last_message_text: string | null;
  todo_task_id: string | null;
  todo_list_id: string | null;
  last_synced_at: string | null;
}

export class TicketRepository {
  private readonly database: DatabaseSync;
  private readonly centerConfigs: readonly CenterConfig[];

  constructor(
    databasePath: string,
    centerConfigs: readonly CenterConfig[] = centers,
  ) {
    this.database = new DatabaseSync(databasePath);
    this.centerConfigs = centerConfigs;

    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
    `);

    this.migrate();
  }

  close(): void {
    this.database.close();
  }

  createTicket(ticket: Ticket): PersistedTicket {
    const centerId = this.requireCenterId(ticket);
    const priorityCode = this.requirePriorityCode(ticket);
    const statusCode = this.requireStatusCode(ticket);

    const result = this.database
      .prepare(`
        INSERT INTO tickets (
          ticket_id,
          center_id,
          title,
          priority_code,
          status_code,
          creator,
          assignee,
          created_at,
          updated_at,
          url
        )
        VALUES (
          @ticketId,
          @centerId,
          @title,
          @priorityCode,
          @statusCode,
          @creator,
          @assignee,
          @createdAt,
          @updatedAt,
          @url
        )
      `)
      .run({
        ticketId: ticket.id,
        centerId,
        title: ticket.title,
        priorityCode,
        statusCode,
        creator: ticket.creator,
        assignee: ticket.assignee,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        url: ticket.url,
      });

    if (result.changes !== 1) {
      throw new Error(`Cannot create ticket ${ticket.id}`);
    }

    return this.requireById(ticket.id);
  }

  create(ticket: Ticket): PersistedTicket {
    return this.createTicket(ticket);
  }

  findById(ticketId: string): PersistedTicket | null {
    const row = this.database
      .prepare(`
        SELECT *
        FROM tickets
        WHERE ticket_id = ?
      `)
      .get(ticketId) as TicketRow | undefined;

    return row ? this.mapTicketRow(row) : null;
  }

  findByTicketId(ticketId: string): PersistedTicket | null {
    return this.findById(ticketId);
  }

  exists(ticketId: string): boolean {
    return this.findById(ticketId) !== null;
  }

  updateTicket(ticket: Ticket): PersistedTicket {
    const centerId = this.requireCenterId(ticket);
    const priorityCode = this.requirePriorityCode(ticket);
    const statusCode = this.requireStatusCode(ticket);

    const result = this.database
      .prepare(`
        UPDATE tickets
        SET
          center_id = @centerId,
          title = @title,
          priority_code = @priorityCode,
          status_code = @statusCode,
          creator = @creator,
          assignee = @assignee,
          created_at = @createdAt,
          updated_at = @updatedAt,
          url = @url
        WHERE ticket_id = @ticketId
      `)
      .run({
        ticketId: ticket.id,
        centerId,
        title: ticket.title,
        priorityCode,
        statusCode,
        creator: ticket.creator,
        assignee: ticket.assignee,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        url: ticket.url,
      });

    if (result.changes === 0) {
      throw new Error(`Cannot update missing ticket ${ticket.id}`);
    }

    return this.requireById(ticket.id);
  }

  update(ticket: Ticket): PersistedTicket {
    return this.updateTicket(ticket);
  }

  insertDetailsForTicket(ticket: Ticket): void {
    const persisted = this.requireById(ticket.id);

    if (!ticket.messages?.length) {
      return;
    }

    for (const message of ticket.messages) {
      const senderType = this.resolveSenderType(ticket, message.author);

      const detail: NewTicketDetail = {
        ticketId: persisted.id,
        centerId: persisted.centerId,
        updatedAt: message.date,
        senderName: message.author,
        creatorName: ticket.creator,
        messageText: message.text,
        senderType,
        statusCode: this.requireStatusCode(ticket),
        messageHash: this.messageHash(
          ticket.id,
          senderType,
          message.author,
          message.date,
          message.text,
        ),
      };

      this.insertDetail(detail);
    }
  }

  insertDetail(detail: NewTicketDetail): void {
    this.database
      .prepare(`
        INSERT OR IGNORE INTO ticket_details (
          ticket_id,
          center_id,
          updated_at,
          sender_name,
          creator_name,
          message_text,
          sender_type,
          status_code,
          message_hash
        )
        VALUES (
          @ticketId,
          @centerId,
          @updatedAt,
          @senderName,
          @creatorName,
          @messageText,
          @senderType,
          @statusCode,
          @messageHash
        )
      `)
      .run(detail);
  }

  findDetails(ticketDatabaseId: number): TicketDetail[] {
    const rows = this.database
      .prepare(`
        SELECT *
        FROM ticket_details
        WHERE ticket_id = ?
        ORDER BY id ASC
      `)
      .all(ticketDatabaseId) as unknown as DetailRow[];

    return rows.map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      centerId: row.center_id,
      updatedAt: row.updated_at,
      senderName: row.sender_name,
      creatorName: row.creator_name,
      messageText: row.message_text,
      senderType: row.sender_type,
      statusCode: row.status_code,
      messageHash: row.message_hash,
    }));
  }

  setTodoMapping(
    ticketId: string,
    todoTaskId: string,
    todoListId: string,
  ): PersistedTicket {
    const existing = this.requireById(ticketId);

    if (
      existing.todoTaskId !== null &&
      existing.todoTaskId !== todoTaskId
    ) {
      throw new Error(
        `Ticket ${ticketId} is already mapped to another Todo task`,
      );
    }

    this.database
      .prepare(`
        UPDATE tickets
        SET
          todo_task_id = ?,
          todo_list_id = ?
        WHERE ticket_id = ?
      `)
      .run(todoTaskId, todoListId, ticketId);

    return this.requireById(ticketId);
  }

  markSynced(
    ticketId: string,
    syncedAt = new Date().toISOString(),
  ): PersistedTicket {
    const result = this.database
      .prepare(`
        UPDATE tickets
        SET last_synced_at = ?
        WHERE ticket_id = ?
      `)
      .run(syncedAt, ticketId);

    if (result.changes === 0) {
      throw new Error(`Cannot mark missing ticket ${ticketId} as synced`);
    }

    return this.requireById(ticketId);
  }

  private migrate(): void {
    const ticketsExist = this.tableExists("tickets");

    if (
      ticketsExist &&
      !this.hasColumn("tickets", "center_id")
    ) {
      this.database.exec("BEGIN");

      try {
        this.database.exec(`
          ALTER TABLE tickets RENAME TO tickets_legacy;
        `);

        this.createSchema();
        this.seedCenters();
        this.migrateLegacyTickets();

        this.database.exec(`
          DROP TABLE tickets_legacy;
        `);

        this.database.exec("COMMIT");
        return;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }

    this.createSchema();
    this.seedCenters();
  }

  private createSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS centers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        admin_name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
          CHECK (enabled IN (0, 1))
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT NOT NULL UNIQUE,
        center_id TEXT NOT NULL,
        title TEXT NOT NULL,
        priority_code TEXT NOT NULL
          CHECK (priority_code IN ('C', 'H', 'L', 'N')),
        status_code INTEGER NOT NULL
          CHECK (status_code IN (0, 1, 2, 3)),
        creator TEXT NOT NULL,
        assignee TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        url TEXT NOT NULL,
        todo_task_id TEXT,
        todo_list_id TEXT,
        last_synced_at TEXT,
        FOREIGN KEY (center_id)
          REFERENCES centers(id),
        CHECK (
          (todo_task_id IS NULL AND todo_list_id IS NULL)
          OR
          (todo_task_id IS NOT NULL AND todo_list_id IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS ticket_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        center_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        creator_name TEXT NOT NULL,
        message_text TEXT NOT NULL,
        sender_type TEXT NOT NULL
          CHECK (sender_type IN ('S', 'C')),
        status_code INTEGER NOT NULL
          CHECK (status_code IN (0, 1, 2, 3)),
        message_hash TEXT NOT NULL UNIQUE,
        FOREIGN KEY (ticket_id)
          REFERENCES tickets(id)
          ON DELETE CASCADE,
        FOREIGN KEY (center_id)
          REFERENCES centers(id)
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_center
        ON tickets(center_id);

      CREATE INDEX IF NOT EXISTS idx_ticket_details_ticket
        ON ticket_details(ticket_id);

      CREATE INDEX IF NOT EXISTS idx_ticket_details_center
        ON ticket_details(center_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_todo_task
        ON tickets(todo_list_id, todo_task_id)
        WHERE todo_task_id IS NOT NULL;
    `);
  }

  private seedCenters(): void {
    const statement = this.database.prepare(`
      INSERT INTO centers (
        id,
        name,
        admin_name,
        enabled
      )
      VALUES (
        @id,
        @name,
        @adminName,
        @enabled
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        admin_name = excluded.admin_name,
        enabled = excluded.enabled
    `);

    for (const center of this.centerConfigs) {
      statement.run({
        id: center.id,
        name: center.name,
        adminName: center.adminName,
        enabled: center.enabled ? 1 : 0,
      });
    }
  }

  private migrateLegacyTickets(): void {
    const rows = this.database
      .prepare(`
        SELECT
          ticket_id,
          center,
          title,
          priority,
          status,
          creator,
          assignee,
          created_at,
          updated_at,
          url,
          last_message_author,
          last_message_date,
          last_message_text,
          todo_task_id,
          todo_list_id,
          last_synced_at
        FROM tickets_legacy
      `)
      .all() as unknown as LegacyTicketRow[];

    const insertTicket = this.database.prepare(`
      INSERT INTO tickets (
        ticket_id,
        center_id,
        title,
        priority_code,
        status_code,
        creator,
        assignee,
        created_at,
        updated_at,
        url,
        todo_task_id,
        todo_list_id,
        last_synced_at
      )
      VALUES (
        @ticketId,
        @centerId,
        @title,
        @priorityCode,
        @statusCode,
        @creator,
        @assignee,
        @createdAt,
        @updatedAt,
        @url,
        @todoTaskId,
        @todoListId,
        @lastSyncedAt
      )
    `);

    for (const row of rows) {
      const center = this.centerConfigs.find(
        (item) =>
          normalizeText(item.name) === normalizeText(row.center),
      );

      if (!center) {
        throw new Error(
          `Legacy ticket ${row.ticket_id} references unknown center: ${row.center}`,
        );
      }

      const priorityCode = priorityCodeFor(row.priority);
      const statusCode = statusCodeFor(row.status);

      insertTicket.run({
        ticketId: row.ticket_id,
        centerId: center.id,
        title: row.title,
        priorityCode,
        statusCode,
        creator: row.creator,
        assignee: row.assignee?.trim() || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        url: row.url,
        todoTaskId: row.todo_task_id,
        todoListId: row.todo_list_id,
        lastSyncedAt: row.last_synced_at,
      });

      if (
        row.last_message_text?.trim() &&
        row.last_message_date?.trim()
      ) {
        const ticket = this.requireById(row.ticket_id);
        const senderName =
          row.last_message_author?.trim() || row.creator;

        const senderType = this.resolveSenderTypeByCenter(
          center,
          senderName,
          row.creator,
        );

        this.insertDetail({
          ticketId: ticket.id,
          centerId: center.id,
          updatedAt: row.last_message_date,
          senderName,
          creatorName: row.creator,
          messageText: row.last_message_text,
          senderType,
          statusCode,
          messageHash: this.messageHash(
            row.ticket_id,
            senderType,
            senderName,
            row.last_message_date,
            row.last_message_text,
          ),
        });
      }
    }
  }

  private resolveSenderType(
    ticket: Ticket,
    senderName: string,
  ): SenderType {
    const center = this.centerConfigs.find(
      (item) => item.id === ticket.centerId,
    );

    if (!center) {
      throw new Error(
        `Center is not configured: ${ticket.centerId ?? "(empty)"}`,
      );
    }

    return this.resolveSenderTypeByCenter(
      center,
      senderName,
      ticket.creator,
    );
  }

  private resolveSenderTypeByCenter(
    center: CenterConfig,
    senderName: string,
    creatorName: string,
  ): SenderType {
    const sender = normalizeText(senderName);
    const creator = normalizeText(creatorName);
    const admin = normalizeText(center.adminName);

    if (sender === admin || sender === creator) {
      return "C";
    }

    return "S";
  }

  private messageHash(
    ticketId: string,
    senderType: SenderType,
    senderName: string,
    updatedAt: string,
    messageText: string,
  ): string {
    return createHash("sha256")
      .update(
        [
          ticketId,
          senderType,
          normalizeText(senderName),
          normalizeText(updatedAt),
          normalizeText(messageText),
        ].join("\u001f"),
        "utf8",
      )
      .digest("hex");
  }

  private requireCenterId(ticket: Ticket): string {
    if (!ticket.centerId) {
      throw new Error(`Ticket ${ticket.id} has no centerId`);
    }

    const exists = this.centerConfigs.some(
      (center) => center.id === ticket.centerId,
    );

    if (!exists) {
      throw new Error(
        `Ticket ${ticket.id} references unknown center: ${ticket.centerId}`,
      );
    }

    return ticket.centerId;
  }

  private requirePriorityCode(ticket: Ticket): PriorityCode {
    if (!ticket.priorityCode) {
      return priorityCodeFor(ticket.priority);
    }

    return ticket.priorityCode;
  }

  private requireStatusCode(ticket: Ticket): StatusCode {
    if (ticket.statusCode === undefined) {
      return statusCodeFor(ticket.status);
    }

    return ticket.statusCode;
  }

  private requireById(ticketId: string): PersistedTicket {
    const ticket = this.findById(ticketId);

    if (!ticket) {
      throw new Error(`Ticket ${ticketId} was not found`);
    }

    return ticket;
  }

  private mapTicketRow(row: TicketRow): PersistedTicket {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      centerId: row.center_id,
      title: row.title,
      priorityCode: row.priority_code,
      statusCode: row.status_code,
      creator: row.creator,
      assignee: row.assignee,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      url: row.url,
      todoTaskId: row.todo_task_id,
      todoListId: row.todo_list_id,
      lastSyncedAt: row.last_synced_at,
    };
  }

  private tableExists(tableName: string): boolean {
    const row = this.database
      .prepare(`
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
      `)
      .get(tableName);

    return Boolean(row);
  }

  private hasColumn(
    tableName: string,
    columnName: string,
  ): boolean {
    const rows = this.database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;

    return rows.some((row) => row.name === columnName);
  }
}