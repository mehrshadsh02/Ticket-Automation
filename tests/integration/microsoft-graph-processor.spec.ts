import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Ticket } from "../../models/Ticket.js";
import { MicrosoftGraphTodoService } from "../../services/MicrosoftGraphTodoService.js";
import { StateMachine } from "../../services/StateMachine.js";
import { TicketProcessor } from "../../services/TicketProcessor.js";
import { TicketRepository } from "../../storage/TicketRepository.js";
import type { CenterConfig } from "../../models/CenterConfig.js";

const testCenter: CenterConfig = { id: "test-center", name: "مرکز تست", adminName: "کاربر", enabled: true, todoListName: "تست" };

const baseTicket: Ticket = {
  id: "2001",
  title: "خطا",
  priority: "فوری",
  organization: "",
  center: "مرکز تست",
  creator: "کاربر",
  assignee: "کارشناس",
  status: "پاسخ داده شده",
  createdAt: "date-1",
  updatedAt: "date-2",
  url: "https://helpical.test/tickets/2001/",
  lastMessage: {
    author: "کارشناس",
    date: "date-2",
    text: "انجام شد",
    status: null,
  },
};

test("processor persists real Graph mapping and reopens it after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "helpical-graph-"));
  const path = join(directory, "tickets.sqlite3");
  const requests: Array<{ method: string; body: unknown }> = [];
  const responses = [
    {
      status: 200,
      body: { value: [{ id: "list-1", displayName: "Helpical Tickets" }] },
    },
    { status: 200, body: { value: [] } },
    { status: 201, body: { id: "task-2001" } },
    { status: 200, body: {} },
    { status: 200, body: {} },
  ];
  const mockFetch: typeof fetch = (_input, init) => {
    const response = responses.shift();
    if (!response) return Promise.reject(new Error("Unexpected request"));
    requests.push({
      method: init?.method ?? "GET",
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : null,
    });
    return Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  const graph = new MicrosoftGraphTodoService({
    todoListName: "Helpical Tickets",
    tokenProvider: { getAccessToken: () => Promise.resolve("token") },
    fetch: mockFetch,
    graphBaseUrl: "https://graph.test/v1.0",
  });
  let repository = new TicketRepository(path, [testCenter]);
  let processor = new TicketProcessor(
    repository,
    graph,
    new StateMachine(),
    () => "sync-1",
  );

  try {
    await processor.process(baseTicket);
    expect(repository.findById("2001")).toMatchObject({
      todoTaskId: "task-2001",
      todoListId: "list-1",
    });
    repository.close();

    repository = new TicketRepository(path, [testCenter]);
    processor = new TicketProcessor(
      repository,
      graph,
      new StateMachine(),
      () => "sync-2",
    );
    await processor.process({
      ...baseTicket,
      status: "پاسخ ایجاد کننده تیکت",
      updatedAt: "date-3",
      lastMessage: {
        author: "کاربر",
        date: "date-3",
        text: "مشکل باقی است",
        status: null,
      },
    });
    expect(requests.filter(({ method }) => method === "POST")).toHaveLength(1);
    expect(requests.at(-1)?.body).toMatchObject({ status: "notStarted" });
    expect(repository.findById("2001")).toMatchObject({
      todoTaskId: "task-2001",
      lastSyncedAt: "sync-2",
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Graph create failure saves neither a fake task mapping nor a sync checkpoint and retries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "helpical-graph-failure-"));
  const repository = new TicketRepository(join(directory, "tickets.sqlite3"), [testCenter]);
  const responses = [
    {
      status: 200,
      body: { value: [{ id: "list-1", displayName: "Helpical Tickets" }] },
    },
    { status: 200, body: { value: [] } },
    { status: 503, body: { error: { message: "Unavailable" } } },
    { status: 200, body: { value: [] } },
    { status: 201, body: { id: "task-2001" } },
    { status: 200, body: {} },
  ];
  let createCalls = 0;
  const mockFetch: typeof fetch = (_input, init) => {
    const response = responses.shift();
    if (!response) return Promise.reject(new Error("Unexpected request"));
    if (init?.method === "POST") createCalls += 1;
    return Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        statusText: response.status >= 400 ? "Graph Error" : "OK",
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  const graph = new MicrosoftGraphTodoService({
    todoListName: "Helpical Tickets",
    tokenProvider: { getAccessToken: () => Promise.resolve("token") },
    fetch: mockFetch,
    graphBaseUrl: "https://graph.test/v1.0",
  });
  const processor = new TicketProcessor(
    repository,
    graph,
    new StateMachine(),
    () => "sync-after-retry",
  );

  try {
    await expect(processor.process(baseTicket)).rejects.toThrow(
      "Microsoft Graph request failed (503",
    );
    expect(repository.findById("2001")).toMatchObject({
      todoTaskId: null,
      todoListId: null,
      lastSyncedAt: null,
    });

    await expect(processor.process(baseTicket)).resolves.toMatchObject({
      outcome: "created",
    });
    expect(createCalls).toBe(2);
    expect(repository.findById("2001")).toMatchObject({
      todoTaskId: "task-2001",
      todoListId: "list-1",
      lastSyncedAt: "sync-after-retry",
    });
  } finally {
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});
