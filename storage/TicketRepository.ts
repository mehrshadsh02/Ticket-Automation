import { DatabaseSync } from "node:sqlite";
import type { Ticket } from "../models/Ticket.js";

export interface PersistedTicket {
  readonly ticketId: string;
  readonly center: string;
  readonly title: string;
  readonly priority: string;
  readonly status: string;
  readonly creator: string;
  readonly assignee: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly url: string;
  readonly lastMessageAuthor: string | null;
  readonly lastMessageDate: string | null;
  readonly lastMessageText: string | null;
  readonly todoTaskId: string | null;
  readonly todoListId: string | null;
  readonly lastSyncedAt: string | null;
}

interface TicketRow {
  ticket_id: string;
  center: string;
  title: string;
  priority: string;
  status: string;
  creator: string;
  assignee: string;
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

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close(): void {
    this.database.close();
  }

  create(ticket: Ticket): PersistedTicket {
    this.database
      .prepare(
        `
      INSERT INTO tickets (
        ticket_id, center, title, priority, status, creator, assignee,
        created_at, updated_at, url, last_message_author, last_message_date,
        last_message_text, is_changed
      ) VALUES (
        @ticketId, @center, @title, @priority, @status, @creator, @assignee,
        @createdAt, @updatedAt, @url, @lastMessageAuthor, @lastMessageDate,
        @lastMessageText, 1
      )
    `,
      )
      .run(this.ticketParameters(ticket));
    return this.requireById(ticket.id);
  }

  findById(ticketId: string): PersistedTicket | null {
    const row = this.database
      .prepare("SELECT * FROM tickets WHERE ticket_id = ?")
      .get(ticketId) as TicketRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  exists(ticketId: string): boolean {
    return Boolean(
      this.database
        .prepare("SELECT 1 FROM tickets WHERE ticket_id = ?")
        .get(ticketId),
    );
  }

  update(ticket: Ticket): PersistedTicket {
    const result = this.database
      .prepare(
        `
      UPDATE tickets SET
        center = @center, title = @title, priority = @priority, status = @status,
        creator = @creator, assignee = @assignee, created_at = @createdAt,
        updated_at = @updatedAt, url = @url,
        last_message_author = @lastMessageAuthor,
        last_message_date = @lastMessageDate,
        last_message_text = @lastMessageText,
        is_changed = CASE WHEN
          center IS NOT @center OR title IS NOT @title OR priority IS NOT @priority OR
          status IS NOT @status OR creator IS NOT @creator OR assignee IS NOT @assignee OR
          created_at IS NOT @createdAt OR updated_at IS NOT @updatedAt OR url IS NOT @url OR
          last_message_author IS NOT @lastMessageAuthor OR
          last_message_date IS NOT @lastMessageDate OR
          last_message_text IS NOT @lastMessageText
        THEN 1 ELSE is_changed END
      WHERE ticket_id = @ticketId
    `,
      )
      .run(this.ticketParameters(ticket));
    if (result.changes === 0)
      throw new Error(`Cannot update missing ticket ${ticket.id}`);
    return this.requireById(ticket.id);
  }

  changedTickets(): PersistedTicket[] {
    const rows = this.database
      .prepare("SELECT * FROM tickets WHERE is_changed = 1 ORDER BY ticket_id")
      .all() as unknown as TicketRow[];
    return rows.map((row) => this.mapRow(row));
  }

  setTodoMapping(
    ticketId: string,
    todoTaskId: string,
    todoListId: string,
  ): PersistedTicket {
    const existing = this.requireById(ticketId);
    if (existing.todoTaskId && existing.todoTaskId !== todoTaskId) {
      throw new Error(
        `Ticket ${ticketId} is already mapped to a different Todo task`,
      );
    }
    this.database
      .prepare(
        `
      UPDATE tickets SET todo_task_id = ?, todo_list_id = ? WHERE ticket_id = ?
    `,
      )
      .run(todoTaskId, todoListId, ticketId);
    return this.requireById(ticketId);
  }

  markSynced(
    ticketId: string,
    syncedAt = new Date().toISOString(),
  ): PersistedTicket {
    const result = this.database
      .prepare(
        `
      UPDATE tickets SET last_synced_at = ?, is_changed = 0 WHERE ticket_id = ?
    `,
      )
      .run(syncedAt, ticketId);
    if (result.changes === 0)
      throw new Error(`Cannot mark missing ticket ${ticketId} as synced`);
    return this.requireById(ticketId);
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        ticket_id TEXT PRIMARY KEY,
        center TEXT NOT NULL,
        title TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        creator TEXT NOT NULL,
        assignee TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        url TEXT NOT NULL,
        last_message_author TEXT,
        last_message_date TEXT,
        last_message_text TEXT,
        todo_task_id TEXT,
        todo_list_id TEXT,
        last_synced_at TEXT,
        is_changed INTEGER NOT NULL DEFAULT 1 CHECK (is_changed IN (0, 1)),
        CHECK ((todo_task_id IS NULL AND todo_list_id IS NULL) OR
               (todo_task_id IS NOT NULL AND todo_list_id IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_changed ON tickets(is_changed);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_todo_task
        ON tickets(todo_list_id, todo_task_id)
        WHERE todo_task_id IS NOT NULL;
    `);
  }

  private ticketParameters(ticket: Ticket) {
    return {
      ticketId: ticket.id,
      center: ticket.center,
      title: ticket.title,
      priority: ticket.priority,
      status: ticket.status,
      creator: ticket.creator,
      assignee: ticket.assignee,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      url: ticket.url,
      lastMessageAuthor: ticket.lastMessage?.author ?? null,
      lastMessageDate: ticket.lastMessage?.date ?? null,
      lastMessageText: ticket.lastMessage?.text ?? null,
    };
  }

  private requireById(ticketId: string): PersistedTicket {
    const ticket = this.findById(ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} was not found`);
    return ticket;
  }

  private mapRow(row: TicketRow): PersistedTicket {
    return {
      ticketId: row.ticket_id,
      center: row.center,
      title: row.title,
      priority: row.priority,
      status: row.status,
      creator: row.creator,
      assignee: row.assignee,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      url: row.url,
      lastMessageAuthor: row.last_message_author,
      lastMessageDate: row.last_message_date,
      lastMessageText: row.last_message_text,
      todoTaskId: row.todo_task_id,
      todoListId: row.todo_list_id,
      lastSyncedAt: row.last_synced_at,
    };
  }
}
