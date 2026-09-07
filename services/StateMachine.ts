export type TicketLifecycleState = "active" | "completed";
export type TicketTransition = "none" | "activate" | "complete" | "reopen";

const statusStates: Readonly<Record<string, TicketLifecycleState>> = {
  باز: "active",
  "در حال بررسی": "active",
  "پاسخ ایجاد کننده تیکت": "active",
  "پاسخ داده شده": "completed",
  "بسته شده": "completed",
};

export class StateMachine {
  stateFor(status: string): TicketLifecycleState {
    const state = statusStates[status.trim()];
    if (!state)
      throw new Error(`Unsupported Helpical ticket status: ${status}`);
    return state;
  }

  transition(
    previousStatus: string | null,
    currentStatus: string,
  ): TicketTransition {
    const current = this.stateFor(currentStatus);
    if (previousStatus === null)
      return current === "completed" ? "complete" : "activate";
    const previous = this.stateFor(previousStatus);
    if (previous === current) return "none";
    if (previous === "completed" && current === "active") return "reopen";
    return "complete";
  }
}
