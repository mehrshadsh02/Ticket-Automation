import type { Ticket } from "../models/Ticket.js";

export interface TodoTaskMapping {
  readonly taskId: string;
  readonly listId: string;
}

// export interface TodoService {
//   getOrCreateTodoList(centerId?: string): Promise<string>;
//   createTask(ticket: Ticket, idempotencyKey: string): Promise<TodoTaskMapping>;
//   updateTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void>;
//   completeTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void>;
//   reopenTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void>;
// }

// id="z8f1"
export interface TodoService {
  getOrCreateTodoList(centerId?: string): Promise<string>;
  createTask(ticket: Ticket, idempotencyKey: string): Promise<TodoTaskMapping>;
  updateTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void>;
  completeTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void>;
  reopenTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void>;
  getOrCreateStatusList(
    statusKey: "open" | "in_review" | "creator_reply",
  ): Promise<string>;

  createStatusTask(
    ticket: Ticket,
    statusKey: "open" | "in_review" | "creator_reply",
  ): Promise<TodoTaskMapping>;

  updateStatusTask(
    mapping: TodoTaskMapping,
    ticket: Ticket,
  ): Promise<void>;

  // deleteStatusTask(
  //   mapping: TodoTaskMapping,
  // ): Promise<void>;

  deleteStatusTaskByStatus(
    ticketId: string,
    statusKey: "open" | "in_review" | "creator_reply",
  ): Promise<void>;
}