import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Ticket } from "../../models/Ticket.js";
import { StateMachine } from "../../services/StateMachine.js";
import { TicketProcessor } from "../../services/TicketProcessor.js";
import type {
  TodoService,
  TodoTaskMapping,
} from "../../services/TodoService.js";
import { TicketRepository } from "../../storage/TicketRepository.js";

class FakeTodoService implements TodoService {
  readonly calls: string[] = [];
  readonly mappings = new Map<string, TodoTaskMapping>();

  getOrCreateTodoList(): Promise<string> {
    return Promise.resolve("list-1");
  }

  createTask(ticket: Ticket, idempotencyKey: string): Promise<TodoTaskMapping> {
    this.calls.push(`create:${ticket.id}`);
    const existing = this.mappings.get(idempotencyKey);
    if (existing) return Promise.resolve(existing);
    const mapping = { taskId: `task-${ticket.id}`, listId: "list-1" };
    this.mappings.set(idempotencyKey, mapping);
    return Promise.resolve(mapping);
  }

  updateTask(mapping: TodoTaskMapping): Promise<void> {
    this.calls.push(`update:${mapping.taskId}`);
    return Promise.resolve();
  }

  completeTask(mapping: TodoTaskMapping): Promise<void> {
    this.calls.push(`complete:${mapping.taskId}`);
    return Promise.resolve();
  }

  reopenTask(mapping: TodoTaskMapping): Promise<void> {
    this.calls.push(`reopen:${mapping.taskId}`);
    return Promise.resolve();
  }
}

class FailingTodoService extends FakeTodoService {
  override updateTask(): Promise<void> {
    return Promise.reject(new Error("temporary adapter failure"));
  }
}

let directory: string;
let repository: TicketRepository;
let todo: FakeTodoService;
let processor: TicketProcessor;
const syncedAt = "2026-09-07T20:00:00.000Z";

const makeTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: "1001",
  center: "مرکز تست",
  title: "اختلال سامانه",
  priority: "بالا",
  organization: "سازمان",
  status: "باز",
  creator: "کاربر",
  assignee: "پشتیبان",
  createdAt: "1405/06/16 10:00",
  updatedAt: "1405/06/16 10:00",
  url: "https://helpical.test/tickets/1001/",
  lastMessage: {
    author: "کاربر",
    date: "1405/06/16 10:00",
    text: "پیام اول",
    status: null,
  },
  ...overrides,
});

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "helpical-storage-"));
  repository = new TicketRepository(join(directory, "tickets.sqlite3"));
  todo = new FakeTodoService();
  processor = new TicketProcessor(
    repository,
    todo,
    new StateMachine(),
    () => syncedAt,
  );
});

test.afterEach(async () => {
  repository.close();
  await rm(directory, { recursive: true, force: true });
});

test("new ticket creates one persisted record and Todo mapping", async () => {
  const result = await processor.process(makeTicket());
  expect(result.outcome).toBe("created");
  expect(repository.exists("1001")).toBe(true);
  expect(repository.findById("1001")).toMatchObject({
    todoTaskId: "task-1001",
    todoListId: "list-1",
    lastSyncedAt: syncedAt,
  });
  expect(todo.calls).toEqual(["create:1001"]);
  expect(repository.changedTickets()).toEqual([]);
});

test("unchanged ticket produces no external action", async () => {
  const ticket = makeTicket();
  await processor.process(ticket);
  todo.calls.length = 0;
  const result = await processor.process(ticket);
  expect(result.outcome).toBe("unchanged");
  expect(todo.calls).toEqual([]);
});

test("message change updates existing task and record", async () => {
  await processor.process(makeTicket());
  todo.calls.length = 0;
  const changed = makeTicket({
    updatedAt: "1405/06/16 11:00",
    lastMessage: {
      author: "پشتیبان",
      date: "1405/06/16 11:00",
      text: "پیام جدید",
      status: null,
    },
  });
  const result = await processor.process(changed);
  expect(result.outcome).toBe("updated");
  expect(result.transition).toBe("none");
  expect(todo.calls).toEqual(["update:task-1001"]);
  expect(repository.findById("1001")?.lastMessageText).toBe("پیام جدید");
});

test("active status change updates the same task", async () => {
  await processor.process(makeTicket());
  todo.calls.length = 0;
  const result = await processor.process(
    makeTicket({ status: "در حال بررسی" }),
  );
  expect(result.transition).toBe("none");
  expect(todo.calls).toEqual(["update:task-1001"]);
});

test("new center reply updates an active task", async () => {
  await processor.process(makeTicket({ status: "در حال بررسی" }));
  todo.calls.length = 0;
  const reply = makeTicket({
    status: "پاسخ ایجاد کننده تیکت",
    updatedAt: "1405/06/16 12:00",
    lastMessage: {
      author: "کاربر مرکز",
      date: "1405/06/16 12:00",
      text: "پاسخ مرکز",
      status: null,
    },
  });
  const result = await processor.process(reply);
  expect(result.transition).toBe("none");
  expect(todo.calls).toEqual(["update:task-1001"]);
});

test("answered and closed statuses complete the existing task", async () => {
  await processor.process(makeTicket());
  todo.calls.length = 0;
  const answered = await processor.process(
    makeTicket({ status: "پاسخ داده شده" }),
  );
  expect(answered.transition).toBe("complete");
  expect(todo.calls).toEqual(["complete:task-1001"]);

  todo.calls.length = 0;
  const closed = await processor.process(makeTicket({ status: "بسته شده" }));
  expect(closed.transition).toBe("none");
  expect(todo.calls).toEqual(["update:task-1001"]);
});

test("creator reply after answered reopens the existing Todo task", async () => {
  await processor.process(makeTicket({ status: "پاسخ داده شده" }));
  todo.calls.length = 0;
  const result = await processor.process(
    makeTicket({
      status: "پاسخ ایجاد کننده تیکت",
      updatedAt: "1405/06/16 13:00",
      lastMessage: {
        author: "کاربر",
        date: "1405/06/16 13:00",
        text: "هنوز مشکل هست",
        status: null,
      },
    }),
  );
  expect(result.transition).toBe("reopen");
  expect(todo.calls).toEqual(["reopen:task-1001"]);
  expect(repository.findById("1001")?.todoTaskId).toBe("task-1001");
});

test("repeated runs prevent duplicate task creation", async () => {
  const ticket = makeTicket();
  await processor.process(ticket);
  await processor.process(ticket);
  await processor.process(ticket);
  expect(todo.calls.filter((call) => call.startsWith("create:"))).toEqual([
    "create:1001",
  ]);
});

test("restart preserves ticket state and mapping", async () => {
  const databasePath = join(directory, "tickets.sqlite3");
  const ticket = makeTicket();
  await processor.process(ticket);
  repository.close();

  repository = new TicketRepository(databasePath);
  processor = new TicketProcessor(
    repository,
    todo,
    new StateMachine(),
    () => syncedAt,
  );
  todo.calls.length = 0;
  const result = await processor.process(ticket);
  expect(result.outcome).toBe("unchanged");
  expect(todo.calls).toEqual([]);
  expect(result.ticket.todoTaskId).toBe("task-1001");
});

test("repository exposes changed tickets and Todo mapping safeguards", () => {
  repository.create(makeTicket());
  expect(repository.changedTickets()).toHaveLength(1);
  repository.setTodoMapping("1001", "task-1001", "list-1");
  expect(() =>
    repository.setTodoMapping("1001", "different-task", "list-1"),
  ).toThrow(/different Todo task/);
  repository.markSynced("1001", syncedAt);
  expect(repository.changedTickets()).toEqual([]);
});

test("failed external update does not consume the persisted change", async () => {
  const original = makeTicket();
  await processor.process(original);
  const failing = new TicketProcessor(
    repository,
    new FailingTodoService(),
    new StateMachine(),
    () => syncedAt,
  );
  const changed = makeTicket({ title: "عنوان تغییر یافته" });
  await expect(failing.process(changed)).rejects.toThrow(
    "temporary adapter failure",
  );
  expect(repository.findById("1001")?.title).toBe(original.title);

  todo.calls.length = 0;
  const retried = await processor.process(changed);
  expect(retried.outcome).toBe("updated");
  expect(todo.calls).toEqual(["update:task-1001"]);
  expect(repository.findById("1001")?.title).toBe("عنوان تغییر یافته");
});
