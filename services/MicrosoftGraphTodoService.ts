import type { Ticket } from "../models/Ticket.js";
import type { AccessTokenProvider } from "./MicrosoftGraphAuth.js";
import type { TodoService, TodoTaskMapping } from "./TodoService.js";

interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

interface GraphTodoList {
  id: string;
  displayName: string;
}

interface GraphLinkedResource {
  externalId?: string;
}

interface GraphTodoTask {
  id: string;
  linkedResources?: GraphLinkedResource[];
}

export interface MicrosoftGraphTodoServiceOptions {
  readonly todoListName?: string;
  readonly centers?: readonly { name: string; todoListName: string; todoGroupName?: string }[];
  readonly tokenProvider: AccessTokenProvider;
  readonly fetch?: typeof fetch;
  readonly graphBaseUrl?: string;
}

export class MicrosoftGraphTodoService implements TodoService {
  private readonly fetch: typeof fetch;
  private readonly graphBaseUrl: string;
  private listId: string | null = null;
  private listPromise: Promise<string> | null = null;

  constructor(private readonly options: MicrosoftGraphTodoServiceOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.graphBaseUrl = (
      options.graphBaseUrl ?? "https://graph.microsoft.com/v1.0"
    ).replace(/\/$/, "");
  }

  async getOrCreateTodoList(center?: string): Promise<string> {
    if (this.listId) return this.listId;
    const listName = this.listNameFor(center);
    this.listPromise ??= this.findOrCreateList(listName);
    try {
      this.listId = await this.listPromise;
      return this.listId;
    } finally {
      this.listPromise = null;
    }
  }

  async createTask(
    ticket: Ticket,
    idempotencyKey: string,
  ): Promise<TodoTaskMapping> {
    const listId = await this.getOrCreateTodoList(ticket.center);
    const existing = await this.findTaskByExternalId(listId, idempotencyKey);
    if (existing) return { taskId: existing.id, listId };

    const task = await this.request<GraphTodoTask>(
      `/me/todo/lists/${encodeURIComponent(listId)}/tasks`,
      {
        method: "POST",
        body: JSON.stringify({
          ...this.taskFields(ticket),
          linkedResources: [
            {
              webUrl: ticket.url,
              applicationName: "Helpical",
              displayName: `Helpical ticket ${ticket.id}`,
              externalId: idempotencyKey,
            },
          ],
        }),
      },
      201,
    );
    return { taskId: task.id, listId };
  }

  async updateTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void> {
    await this.patchTask(mapping, this.taskFields(ticket));
  }

  async completeTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void> {
    await this.patchTask(mapping, {
      ...this.taskFields(ticket),
      status: "completed",
    });
  }

  async reopenTask(mapping: TodoTaskMapping, ticket: Ticket): Promise<void> {
    await this.patchTask(mapping, {
      ...this.taskFields(ticket),
      status: "notStarted",
    });
  }


  private listNameFor(center?: string): string {
    return this.options.centers?.find((item) => item.name === center)?.todoListName ?? this.options.todoListName ?? "His Ticket";
  }

  private async findOrCreateList(listName = this.options.todoListName ?? "His Ticket"): Promise<string> {
    for await (const list of this.paginate<GraphTodoList>("/me/todo/lists")) {
      if (list.displayName === listName) return list.id;
    }
    const created = await this.request<GraphTodoList>(
      "/me/todo/lists",
      {
        method: "POST",
        body: JSON.stringify({ displayName: listName }),
      },
      201,
    );
    return created.id;
  }

  private async findTaskByExternalId(
    listId: string,
    externalId: string,
  ): Promise<GraphTodoTask | null> {
    const path = `/me/todo/lists/${encodeURIComponent(listId)}/tasks?$expand=linkedResources`;
    for await (const task of this.paginate<GraphTodoTask>(path)) {
      if (
        task.linkedResources?.some(
          (resource) => resource.externalId === externalId,
        )
      )
        return task;
    }
    return null;
  }

  private taskFields(ticket: Ticket): Record<string, unknown> {
    return {
      title: `[${ticket.priority}] ${ticket.center} — ${ticket.title}`,
      body: { contentType: "text", content: this.description(ticket) },
    };
  }

  private description(ticket: Ticket): string {
    return [
      `Center: ${ticket.center}`,
      `Ticket ID: ${ticket.id}`,
      `Title: ${ticket.title}`,
      `Priority: ${ticket.priority}`,
      `Helpical status: ${ticket.status}`,
      `Creator: ${ticket.creator}`,
      `Assignee: ${ticket.assignee}`,
      `Latest message: ${ticket.lastMessage?.text ?? ""}`,
      `Latest message date: ${ticket.lastMessage?.date ?? ""}`,
      `Helpical URL: ${ticket.url}`,
    ].join("\n");
  }

  private async patchTask(
    mapping: TodoTaskMapping,
    body: Record<string, unknown>,
  ): Promise<void> {
    await this.request<void>(
      `/me/todo/lists/${encodeURIComponent(mapping.listId)}/tasks/${encodeURIComponent(mapping.taskId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
      200,
    );
  }

  private async *paginate<T>(initialPath: string): AsyncGenerator<T> {
    let next: string | null = initialPath;
    while (next) {
      const page: GraphCollection<T> =
        await this.request<GraphCollection<T>>(next);
      yield* page.value;
      next = page["@odata.nextLink"] ?? null;
    }
  }

  private async request<T>(
    pathOrUrl: string,
    init: RequestInit = {},
    expectedStatus = 200,
  ): Promise<T> {
    const accessToken = await this.options.tokenProvider.getAccessToken();
    const response = await this.fetch(this.urlFor(pathOrUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (response.status !== expectedStatus) {
      const detail = (await response.text()).slice(0, 1_000);
      throw new Error(
        `Microsoft Graph request failed (${response.status} ${response.statusText}): ${detail}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  private urlFor(pathOrUrl: string): string {
    if (pathOrUrl.startsWith("https://")) return pathOrUrl;
    return `${this.graphBaseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  }
}
