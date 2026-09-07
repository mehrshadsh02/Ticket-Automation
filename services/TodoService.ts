import type { Ticket } from "../models/Ticket.js";

export interface TodoTaskMapping {
  readonly taskId: string;
  readonly listId: string;
}

export interface TodoService {
  getOrCreateTodoList(): Promise<string>;
  createTask(ticket: Ticket, idempotencyKey: string): Promise<TodoTaskMapping>;
  updateTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void>;
  completeTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void>;
  reopenTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void>;
}
