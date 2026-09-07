import { expect, test } from "@playwright/test";
import type { Ticket } from "../../models/Ticket.js";
import { MicrosoftGraphTodoService } from "../../services/MicrosoftGraphTodoService.js";

interface GraphCall {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
  readonly authorization: string | null;
}

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: "1001",
  title: "اختلال سامانه",
  priority: "بالا",
  organization: "سازمان",
  center: "مرکز تست",
  creator: "کاربر",
  assignee: "پشتیبان",
  status: "باز",
  createdAt: "1405/06/16 10:00",
  updatedAt: "1405/06/16 10:00",
  url: "https://helpical.test/tickets/1001/",
  lastMessage: {
    author: "کاربر",
    date: "1405/06/16 10:00",
    text: "پیام آخر",
    status: null,
  },
  ...overrides,
});

function graphMock(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: GraphCall[] = [];
  const mockFetch: typeof fetch = (input, init) => {
    const response = responses.shift();
    if (!response) return Promise.reject(new Error("Unexpected Graph request"));
    const headers = new Headers(init?.headers);
    calls.push({
      url:
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      method: init?.method ?? "GET",
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : null,
      authorization: headers.get("Authorization"),
    });
    const status = response.status ?? 200;
    return Promise.resolve(
      new Response(
        response.body === undefined ? null : JSON.stringify(response.body),
        {
          status,
          statusText: status >= 400 ? "Graph Error" : "OK",
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  };
  return { calls, mockFetch };
}

function service(responses: Array<{ status?: number; body?: unknown }>) {
  const graph = graphMock(responses);
  const todo = new MicrosoftGraphTodoService({
    todoListName: "Helpical Tickets",
    tokenProvider: { getAccessToken: () => Promise.resolve("access-token") },
    fetch: graph.mockFetch,
    graphBaseUrl: "https://graph.test/v1.0",
  });
  return { todo, calls: graph.calls };
}

test("gets an existing configured Todo list", async () => {
  const { todo, calls } = service([
    { body: { value: [{ id: "list-1", displayName: "Helpical Tickets" }] } },
  ]);
  await expect(todo.getOrCreateTodoList()).resolves.toBe("list-1");
  await expect(todo.getOrCreateTodoList()).resolves.toBe("list-1");
  expect(calls).toHaveLength(1);
  expect(calls[0]?.authorization).toBe("Bearer access-token");
});

test("creates the configured list when missing", async () => {
  const { todo, calls } = service([
    { body: { value: [] } },
    { status: 201, body: { id: "new-list", displayName: "Helpical Tickets" } },
  ]);
  await expect(todo.getOrCreateTodoList()).resolves.toBe("new-list");
  expect(calls[1]).toMatchObject({
    method: "POST",
    body: { displayName: "Helpical Tickets" },
  });
});

test("creates a task with required fields and linked resource", async () => {
  const { todo, calls } = service([
    { body: { value: [{ id: "list-1", displayName: "Helpical Tickets" }] } },
    { body: { value: [] } },
    { status: 201, body: { id: "task-1" } },
  ]);
  await expect(todo.createTask(ticket(), "1001")).resolves.toEqual({
    taskId: "task-1",
    listId: "list-1",
  });
  const create = calls[2];
  expect(create?.body).toMatchObject({
    title: "[بالا] مرکز تست — اختلال سامانه",
    linkedResources: [
      { externalId: "1001", webUrl: "https://helpical.test/tickets/1001/" },
    ],
  });
  const content = (create?.body as { body: { content: string } }).body.content;
  for (const expected of [
    "Center: مرکز تست",
    "Ticket ID: 1001",
    "Helpical status: باز",
    "Creator: کاربر",
    "Assignee: پشتیبان",
    "Latest message: پیام آخر",
    "Latest message date: 1405/06/16 10:00",
  ]) {
    expect(content).toContain(expected);
  }
});

test("duplicate prevention reuses a task found by linked external ID", async () => {
  const { todo, calls } = service([
    { body: { value: [{ id: "list-1", displayName: "Helpical Tickets" }] } },
    {
      body: {
        value: [
          { id: "task-existing", linkedResources: [{ externalId: "1001" }] },
        ],
      },
    },
  ]);
  await expect(todo.createTask(ticket(), "1001")).resolves.toEqual({
    taskId: "task-existing",
    listId: "list-1",
  });
  expect(calls.filter(({ method }) => method === "POST")).toEqual([]);
});

test("follows Graph pagination when locating an idempotent task", async () => {
  const { todo, calls } = service([
    { body: { value: [{ id: "list-1", displayName: "Helpical Tickets" }] } },
    { body: { value: [], "@odata.nextLink": "https://graph.test/next-page" } },
    {
      body: {
        value: [
          { id: "task-existing", linkedResources: [{ externalId: "1001" }] },
        ],
      },
    },
  ]);
  await expect(todo.createTask(ticket(), "1001")).resolves.toEqual({
    taskId: "task-existing",
    listId: "list-1",
  });
  expect(calls[2]?.url).toBe("https://graph.test/next-page");
});

test("updates, completes, and reopens the same mapped task", async () => {
  const { todo, calls } = service([{ body: {} }, { body: {} }, { body: {} }]);
  const mapping = { taskId: "task-1", listId: "list-1" };
  await todo.updateTask(mapping, ticket());
  await todo.completeTask(mapping, ticket({ status: "پاسخ داده شده" }));
  await todo.reopenTask(mapping, ticket({ status: "پاسخ ایجاد کننده تیکت" }));

  expect(calls.map(({ method }) => method)).toEqual([
    "PATCH",
    "PATCH",
    "PATCH",
  ]);
  expect(calls[0]?.url).toContain("/lists/list-1/tasks/task-1");
  expect(calls[1]?.body).toMatchObject({ status: "completed" });
  expect(calls[2]?.body).toMatchObject({ status: "notStarted" });
});

test("Graph failure is thrown and a later retry succeeds", async () => {
  const { todo, calls } = service([
    { status: 503, body: { error: { message: "Unavailable" } } },
    { body: {} },
  ]);
  const mapping = { taskId: "task-1", listId: "list-1" };
  await expect(todo.updateTask(mapping, ticket())).rejects.toThrow(
    "Microsoft Graph request failed (503",
  );
  await expect(todo.updateTask(mapping, ticket())).resolves.toBeUndefined();
  expect(calls).toHaveLength(2);
});
