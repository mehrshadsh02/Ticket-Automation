import type { Ticket } from "../models/Ticket.js";
import type {
  PersistedTicket,
  TicketRepository,
} from "../storage/TicketRepository.ts";
import {
  StateMachine,
  type TicketTransition,
} from "./StateMachine.js";
import type {
  TodoService,
  TodoTaskMapping,
} from "./TodoService.js";

export type ProcessingOutcome =
  | "created"
  | "updated"
  | "unchanged";

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
    private readonly now: () => string = () =>
      new Date().toISOString(),
  ) {}

async process(ticket: Ticket): Promise<ProcessingResult> {
  const previous = this.repository.findById(ticket.id);

  if (!previous) {
    return this.processNew(ticket);
  }

  this.repository.insertDetailsForTicket(ticket);

  const mapping = this.mappingFor(previous);

  if (!mapping) {
    return this.attachMissingMapping(ticket, previous);
  }

  const transition = this.stateMachine.transition(
    previous.statusCode,
    this.requireStatusCode(ticket),
  );

  let activeMapping = mapping;

  try {
    await this.applyTodoChange(
      activeMapping,
      ticket,
      transition,
    );
  } catch (error) {
    if (!String(error).includes("404 Not Found")) {
      throw error;
    }

    activeMapping = await this.todoService.createTask(
      ticket,
      ticket.id,
    );

    this.repository.setTodoMapping(
      ticket.id,
      activeMapping.taskId,
      activeMapping.listId,
    );

    await this.applyTodoChange(
      activeMapping,
      ticket,
      transition,
    );
  }

  this.repository.updateTicket(ticket);

  return {
    outcome: "updated",
    transition,
    ticket: this.repository.markSynced(
      ticket.id,
      this.now(),
    ),
  };
}

private async applyTodoChange(
  mapping: TodoTaskMapping,
  ticket: Ticket,
  transition: TicketTransition,
): Promise<void> {
  if (transition === "complete") {
    await this.todoService.completeTask(mapping, ticket);
  } else if (transition === "reopen") {
    await this.todoService.reopenTask(mapping, ticket);
  } else {
    await this.todoService.updateTask(mapping, ticket);
  }
}
  private async processNew(
    ticket: Ticket,
  ): Promise<ProcessingResult> {
    this.repository.createTicket(ticket);
    this.repository.insertDetailsForTicket(ticket);

    const statusCode = this.requireStatusCode(ticket);

    const transition = this.stateMachine.transition(
      null,
      statusCode,
    );

    const mapping = await this.todoService.createTask(
      ticket,
      ticket.id,
    );

    this.repository.setTodoMapping(
      ticket.id,
      mapping.taskId,
      mapping.listId,
    );

    if (transition === "complete") {
      await this.todoService.completeTask(
        mapping,
        ticket,
      );
    }

    return {
      outcome: "created",
      transition,
      ticket: this.repository.markSynced(
        ticket.id,
        this.now(),
      ),
    };
  }

  private async attachMissingMapping(
    ticket: Ticket,
    previous: PersistedTicket,
  ): Promise<ProcessingResult> {
    if (this.hasChanged(previous, ticket)) {
      this.repository.updateTicket(ticket);
    }

    const transition = this.stateMachine.transition(
      null,
      this.requireStatusCode(ticket),
    );

    const mapping = await this.todoService.createTask(
      ticket,
      ticket.id,
    );

    this.repository.setTodoMapping(
      ticket.id,
      mapping.taskId,
      mapping.listId,
    );

    if (transition === "complete") {
      await this.todoService.completeTask(
        mapping,
        ticket,
      );
    }

    return {
      outcome: "created",
      transition,
      ticket: this.repository.markSynced(
        ticket.id,
        this.now(),
      ),
    };
  }

  private hasChanged(
    stored: PersistedTicket,
    incoming: Ticket,
  ): boolean {
    return (
      stored.centerId !== incoming.centerId ||
      stored.title !== incoming.title ||
      stored.priorityCode !==
        this.requirePriorityCode(incoming) ||
      stored.statusCode !==
        this.requireStatusCode(incoming) ||
      stored.creator !== incoming.creator ||
      stored.assignee !== incoming.assignee ||
      stored.createdAt !== incoming.createdAt ||
      stored.updatedAt !== incoming.updatedAt ||
      stored.url !== incoming.url
    );
  }

  private mappingFor(
    ticket: PersistedTicket,
  ): TodoTaskMapping | null {
    if (
      !ticket.todoTaskId ||
      !ticket.todoListId
    ) {
      return null;
    }

    return {
      taskId: ticket.todoTaskId,
      listId: ticket.todoListId,
    };
  }

  private requirePriorityCode(
    ticket: Ticket,
  ) {
    if (!ticket.priorityCode) {
      throw new Error(
        `Ticket ${ticket.id} has no priorityCode`,
      );
    }

    return ticket.priorityCode;
  }

  private requireStatusCode(
    ticket: Ticket,
  ) {
    if (ticket.statusCode === undefined) {
      throw new Error(
        `Ticket ${ticket.id} has no statusCode`,
      );
    }

    return ticket.statusCode;
  }
}