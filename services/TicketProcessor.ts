import type { Ticket } from "../models/Ticket.js";
import type {
  PersistedTicket,
  TicketRepository,
} from "../storage/TicketRepository.js";
import { StateMachine, type TicketTransition } from "./StateMachine.js";
import type { TodoService, TodoTaskMapping } from "./TodoService.js";

export type ProcessingOutcome = "created" | "updated" | "unchanged";

export interface ProcessingResult {
  readonly outcome: ProcessingOutcome;
  readonly transition: TicketTransition;
  readonly ticket: PersistedTicket;
}

export class TicketProcessor {
  constructor(
    private readonly repository: TicketRepository,
    private readonly todoService: TodoService,
    private readonly stateMachine = new StateMachine(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async process(ticket: Ticket): Promise<ProcessingResult> {
    const previous = this.repository.findById(ticket.id);
    if (!previous) return this.processNew(ticket);
    this.repository.insertDetailsForTicket(ticket);
    if (!this.mappingFor(previous))
      return this.attachMissingMapping(ticket, previous);
    if (!this.hasChanged(previous, ticket)) {
      return { outcome: "unchanged", transition: "none", ticket: previous };
    }

    const transition = this.stateMachine.transition(
      previous.status,
      ticket.status,
    );
    const mapping = this.mappingFor(previous);
    if (!mapping) throw new Error(`Ticket ${ticket.id} has no Todo mapping`);

    if (transition === "complete")
      await this.todoService.completeTask(mapping, ticket);
    else if (transition === "reopen")
      await this.todoService.reopenTask(mapping, ticket);
    else await this.todoService.updateTask(mapping, ticket);

    this.repository.update(ticket);
    return {
      outcome: "updated",
      transition,
      ticket: this.repository.markSynced(ticket.id, this.now()),
    };
  }

  private async processNew(ticket: Ticket): Promise<ProcessingResult> {
    this.repository.create(ticket);
    const transition = this.stateMachine.transition(null, ticket.status);
    const mapping = await this.todoService.createTask(ticket, ticket.id);
    this.repository.setTodoMapping(ticket.id, mapping.taskId, mapping.listId);
    if (transition === "complete")
      await this.todoService.completeTask(mapping, ticket);
    return {
      outcome: "created",
      transition,
      ticket: this.repository.markSynced(ticket.id, this.now()),
    };
  }

  private async attachMissingMapping(
    ticket: Ticket,
    previous: PersistedTicket,
  ): Promise<ProcessingResult> {
    if (this.hasChanged(previous, ticket)) this.repository.update(ticket);
    const transition = this.stateMachine.transition(null, ticket.status);
    const mapping = await this.todoService.createTask(ticket, ticket.id);
    this.repository.setTodoMapping(ticket.id, mapping.taskId, mapping.listId);
    if (transition === "complete")
      await this.todoService.completeTask(mapping, ticket);
    return {
      outcome: "created",
      transition,
      ticket: this.repository.markSynced(ticket.id, this.now()),
    };
  }

  private hasChanged(stored: PersistedTicket, incoming: Ticket): boolean {
    return (
      stored.center !== incoming.center ||
      stored.title !== incoming.title ||
      stored.priority !== incoming.priority ||
      stored.status !== incoming.status ||
      stored.creator !== incoming.creator ||
      stored.assignee !== incoming.assignee ||
      stored.createdAt !== incoming.createdAt ||
      stored.updatedAt !== incoming.updatedAt ||
      stored.url !== incoming.url ||
      stored.priorityCode !== (incoming.priorityCode ?? stored.priorityCode) ||
      stored.statusCode !== (incoming.statusCode ?? stored.statusCode)
    );
  }

  private mappingFor(ticket: PersistedTicket): TodoTaskMapping | null {
    return ticket.todoTaskId && ticket.todoListId
      ? { taskId: ticket.todoTaskId, listId: ticket.todoListId }
      : null;
  }
}
