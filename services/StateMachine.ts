import type { StatusCode } from "../models/Ticket.js";
import { statusCodeFor } from "../utils/ticketMappings.js";

export type TicketLifecycleState = "active" | "completed";

export type TicketTransition =
  | "none"
  | "activate"
  | "complete"
  | "reopen";

function lifecycleState(
  status: string | StatusCode,
): TicketLifecycleState {
  const code =
    typeof status === "number" ? status : statusCodeFor(status);

  return code === 1 || code === 3 ? "completed" : "active";
}

export class StateMachine {
  stateFor(
    status: string | StatusCode,
  ): TicketLifecycleState {
    return lifecycleState(status);
  }

  transition(
    previousStatus: string | StatusCode | null,
    currentStatus: string | StatusCode,
  ): TicketTransition {
    const current = this.stateFor(currentStatus);

    if (previousStatus === null) {
      return current === "completed" ? "complete" : "activate";
    }

    const previous = this.stateFor(previousStatus);

    if (previous === current) {
      return "none";
    }

    if (
      previous === "completed" &&
      current === "active"
    ) {
      return "reopen";
    }

    return "complete";
  }
}